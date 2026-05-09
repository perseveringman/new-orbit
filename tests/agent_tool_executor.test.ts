import { describe, expect, it, vi } from 'vitest';
import type { CliRequest, CliResponse } from '@shared/cli_protocol';
import type { CliHandlerRegistry } from '../src/main/cli_server/registry';
import type { AgentRuntimeEventSink } from '../src/main/agent-tools/llm-client';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { AgentToolDef, AgentTurnToolUse } from '@shared/agent-tools';
import { OrbitToolRegistry } from '../src/main/agent-tools/registry';
import { OrbitToolExecutor } from '../src/main/agent-tools/executor';

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

const FAST_TOOL_DEF: AgentToolDef = {
  ...TOOL_DEF,
  name: 'orbit_slow',
  timeoutMs: 20
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
});
