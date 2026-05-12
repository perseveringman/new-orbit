import { describe, expect, it, vi } from 'vitest';
import type { CliRequest, CliResponse } from '@shared/cli_protocol';
import type { CliHandlerRegistry } from '../src/main/cli_server/registry';
import type { AgentRuntimeEventSink } from '../src/main/agent-tools/llm-client';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { AgentToolDef, AgentTurnToolUse } from '@shared/agent-tools';
import type { ActivityEventInput } from '@shared/activity';
import type { AgentJournal } from '../src/main/agent-tools/journal';
import { OrbitToolRegistry } from '../src/main/agent-tools/registry';
import { OrbitToolExecutor, type ActivityEmitterLike } from '../src/main/agent-tools/executor';

vi.mock('../src/main/events/bus', () => ({
  publishTraceableEvent: vi.fn(),
  configureEventReplay: vi.fn(),
  currentEventReplayStore: () => null,
  currentRunRecorder: () => null,
  eventReplayBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

const TOOL_DEF: AgentToolDef = {
  name: 'orbit_search',
  description: 'fake search',
  cliMethod: 'search',
  inputSchema: { type: 'object' }
};

const READ_TOOL_DEF: AgentToolDef = {
  name: 'orbit_read',
  description: 'fake read',
  cliMethod: 'cat',
  inputSchema: { type: 'object' }
};

const FAST_TOOL_DEF: AgentToolDef = {
  ...TOOL_DEF,
  name: 'orbit_slow',
  timeoutMs: 20
};

const DESTRUCTIVE_TOOL_DEF: AgentToolDef = {
  name: 'orbit_resource_create',
  description: 'create resource',
  cliMethod: 'resource.create',
  destructive: true,
  inputSchema: { type: 'object' }
};

class FakeCli implements Pick<CliHandlerRegistry, 'handle'> {
  constructor(private readonly h: (r: CliRequest) => Promise<CliResponse> | CliResponse) {}
  async handle(r: CliRequest): Promise<CliResponse> {
    return this.h(r);
  }
}

function makeExecutor(
  defs: AgentToolDef[],
  handler: (r: CliRequest) => Promise<CliResponse> | CliResponse
): OrbitToolExecutor {
  const registry = new OrbitToolRegistry();
  registry.registerMany(defs);
  return new OrbitToolExecutor(registry, new FakeCli(handler) as unknown as CliHandlerRegistry);
}

const ctx = { runId: 'run', conversationId: 'conv' };
const sink: AgentRuntimeEventSink = (_e: RuntimeEvent) => undefined;

describe('OrbitToolExecutor', () => {
  it('serialises object result and emits a tool_result RuntimeEvent', async () => {
    const executor = makeExecutor([TOOL_DEF], (r) => ({
      id: r.id,
      ok: true,
      data: { hits: ['a', 'b'] }
    }));
    const events: RuntimeEvent[] = [];
    const tu: AgentTurnToolUse = { id: 'toolu_a', name: 'orbit_search', input: { query: 'q' } };
    const result = await executor.execute(tu, ctx, (e) => {
      events.push(e);
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({ hits: ['a', 'b'] });
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('runtime.tool_result');
    expect(events[0]?.parentSpanId).toBe('toolu_a');
  });

  it('returns isError when tool name is not registered', async () => {
    const executor = makeExecutor([TOOL_DEF], () => ({ id: 'x', ok: true, data: {} }));
    const tu: AgentTurnToolUse = { id: 'toolu_b', name: 'unknown_tool', input: {} };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe('unknown_tool');
  });

  it('returns isError when adapter reported parseError', async () => {
    const executor = makeExecutor([TOOL_DEF], () => ({ id: 'x', ok: true, data: {} }));
    const tu: AgentTurnToolUse = {
      id: 'toolu_c',
      name: 'orbit_search',
      input: undefined,
      parseError: 'unexpected token'
    };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe('parse_error');
  });

  it('translates handler error response into isError tool_result', async () => {
    const executor = makeExecutor([TOOL_DEF], (r) => ({
      id: r.id,
      ok: false,
      error: { code: 'invalid_params', message: 'missing query' }
    }));
    const tu: AgentTurnToolUse = { id: 'toolu_d', name: 'orbit_search', input: {} };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe('invalid_params');
    expect(result.content).toContain('missing query');
  });

  it('enforces per-tool timeout and surfaces a timeout error', async () => {
    const executor = makeExecutor([FAST_TOOL_DEF], async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { id: 'x', ok: true, data: {} };
    });
    const tu: AgentTurnToolUse = { id: 'toolu_e', name: 'orbit_slow', input: {} };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(true);
    expect(result.errorCode).toBe('timeout');
  });

  it('truncates very large string results', async () => {
    const big = 'x'.repeat(20 * 1024);
    const executor = makeExecutor([TOOL_DEF], () => ({ id: 'x', ok: true, data: big }));
    const tu: AgentTurnToolUse = { id: 'toolu_f', name: 'orbit_search', input: {} };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(false);
    expect(result.content.length).toBeLessThan(big.length);
    expect(result.content).toContain('orbit_truncated');
  });

  it('runs external path approval before reading an absolute path', async () => {
    const calls: string[] = [];
    const registry = new OrbitToolRegistry();
    registry.registerMany([READ_TOOL_DEF]);
    const executor = new OrbitToolExecutor({
      toolRegistry: registry,
      cliRegistry: new FakeCli((r) => {
        calls.push('cli');
        return { id: r.id, ok: true, data: 'file body' };
      }) as unknown as CliHandlerRegistry,
      externalPathApproval: {
        getVaultPath: () => '/vault',
        request: async (input) => {
          calls.push('approval');
          expect(input.requestedTarget).toBe('/Users/ryan/outside.md');
          await input.emit({
            id: 'await-1',
            at: '2026-04-29T00:00:00Z',
            kind: 'runtime.awaiting_user',
            conversationId: input.conversationId,
            runId: input.runId,
            spanId: 'prop_external',
            parentSpanId: input.toolUseId,
            payload: {
              kind: 'external_path_access',
              status: 'pending',
              proposalId: 'prop_external'
            }
          });
        }
      }
    });
    const events: RuntimeEvent[] = [];
    const tu: AgentTurnToolUse = {
      id: 'toolu_read',
      name: 'orbit_read',
      input: { target: '/Users/ryan/outside.md' }
    };

    const result = await executor.execute(tu, ctx, (event) => {
      events.push(event);
    });

    expect(result.isError).toBe(false);
    expect(calls).toEqual(['approval', 'cli']);
    expect(events.map((event) => event.kind)).toEqual([
      'runtime.awaiting_user',
      'runtime.tool_result'
    ]);
  });

  describe('Phase B activity & journal hooks', () => {
    function makeExecutorWithDeps(opts: {
      defs: AgentToolDef[];
      handler: (r: CliRequest) => CliResponse | Promise<CliResponse>;
      activity?: ActivityEmitterLike;
      journal?: Pick<AgentJournal, 'record'>;
    }): OrbitToolExecutor {
      const registry = new OrbitToolRegistry();
      registry.registerMany(opts.defs);
      return new OrbitToolExecutor({
        toolRegistry: registry,
        cliRegistry: new FakeCli(opts.handler) as unknown as CliHandlerRegistry,
        ...(opts.activity ? { activity: opts.activity } : {}),
        ...(opts.journal ? { journal: opts.journal as AgentJournal } : {})
      });
    }

    it('records Activity Log entry on destructive tool success', async () => {
      const seen: ActivityEventInput[] = [];
      const executor = makeExecutorWithDeps({
        defs: [DESTRUCTIVE_TOOL_DEF],
        handler: () => ({ id: 'x', ok: true, data: { id: 'res-1' } }),
        activity: {
          emit: (input) => {
            seen.push(input);
          }
        }
      });
      const tu: AgentTurnToolUse = {
        id: 'toolu_w1',
        name: 'orbit_resource_create',
        input: { title: 'Hello' }
      };
      await executor.execute(tu, ctx, sink);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.action).toBe('agent.tool_invoked');
      expect(seen[0]?.actor).toBe('agent');
      expect(seen[0]?.context?.tool_name).toBe('orbit_resource_create');
    });

    it('records Activity Log on destructive tool failure with agent.tool_failed', async () => {
      const seen: ActivityEventInput[] = [];
      const executor = makeExecutorWithDeps({
        defs: [DESTRUCTIVE_TOOL_DEF],
        handler: () => ({ id: 'x', ok: false, error: { code: 'forbidden', message: 'no' } }),
        activity: {
          emit: (input) => {
            seen.push(input);
          }
        }
      });
      const tu: AgentTurnToolUse = {
        id: 'toolu_w2',
        name: 'orbit_resource_create',
        input: { title: 'X' }
      };
      const result = await executor.execute(tu, ctx, sink);
      expect(result.isError).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.action).toBe('agent.tool_failed');
    });

    it('does NOT record Activity for non-destructive tools', async () => {
      const seen: ActivityEventInput[] = [];
      const executor = makeExecutorWithDeps({
        defs: [TOOL_DEF],
        handler: () => ({ id: 'x', ok: true, data: { hits: [] } }),
        activity: {
          emit: (input) => {
            seen.push(input);
          }
        }
      });
      const tu: AgentTurnToolUse = { id: 'toolu_r1', name: 'orbit_search', input: {} };
      await executor.execute(tu, ctx, sink);
      expect(seen).toHaveLength(0);
    });

    it('writes journal entry before destructive tool execution', async () => {
      const journalCalls: unknown[] = [];
      const executor = makeExecutorWithDeps({
        defs: [DESTRUCTIVE_TOOL_DEF],
        handler: () => ({ id: 'x', ok: true, data: {} }),
        journal: {
          record: async (entry) => {
            journalCalls.push(entry);
          }
        }
      });
      const tu: AgentTurnToolUse = {
        id: 'toolu_w3',
        name: 'orbit_resource_create',
        input: { title: 'J' }
      };
      await executor.execute(tu, ctx, sink);
      expect(journalCalls).toHaveLength(1);
      expect(journalCalls[0]).toMatchObject({
        runId: 'run',
        toolName: 'orbit_resource_create',
        toolUseId: 'toolu_w3',
        destructive: true
      });
    });

    it('does not write journal for non-destructive tools', async () => {
      const journalCalls: unknown[] = [];
      const executor = makeExecutorWithDeps({
        defs: [TOOL_DEF],
        handler: () => ({ id: 'x', ok: true, data: {} }),
        journal: {
          record: async (entry) => {
            journalCalls.push(entry);
          }
        }
      });
      const tu: AgentTurnToolUse = { id: 'toolu_r2', name: 'orbit_search', input: {} };
      await executor.execute(tu, ctx, sink);
      expect(journalCalls).toHaveLength(0);
    });
  });
});
