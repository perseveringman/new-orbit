import { describe, expect, it, vi } from 'vitest';
import type { CliRequest, CliResponse } from '@shared/cli_protocol';
import type { CliHandlerRegistry } from '../src/main/cli_server/registry';
import type { AgentRuntimeEventSink } from '../src/main/agent-tools/llm-client';
import type { AgentTurnToolUse } from '@shared/agent-tools';
import type { ActivityEventInput } from '@shared/activity';
import { OrbitToolRegistry } from '../src/main/agent-tools/registry';
import {
  OrbitToolExecutor,
  type ActivityEmitterLike
} from '../src/main/agent-tools/executor';
import { PROPOSE_TOOL_DEFS, PHASE_C_TOOL_DEFS } from '../src/main/agent-tools/definitions';

vi.mock('../src/main/events/bus', () => ({
  publishTraceableEvent: vi.fn(),
  configureEventReplay: vi.fn(),
  currentEventReplayStore: () => null,
  currentRunRecorder: () => null,
  eventReplayBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

class FakeCli implements Pick<CliHandlerRegistry, 'handle'> {
  constructor(private readonly h: (r: CliRequest) => Promise<CliResponse> | CliResponse) {}
  async handle(r: CliRequest): Promise<CliResponse> {
    return this.h(r);
  }
}

const sink: AgentRuntimeEventSink = () => undefined;
const ctx = { runId: 'run', conversationId: 'conv' };

describe('PROPOSE_TOOL_DEFS', () => {
  it('exposes the three task propose tools and binds to approvalService submit handlers', () => {
    expect(PROPOSE_TOOL_DEFS.map((t) => t.name)).toEqual([
      'orbit_task_propose',
      'orbit_task_propose_scope',
      'orbit_task_propose_split'
    ]);
    for (const tool of PROPOSE_TOOL_DEFS) {
      expect(tool.destructive).toBe(true);
      expect(tool.activity?.successAction).toBe('agent.proposal_submitted');
      expect(tool.cliMethod.startsWith('task.propose')).toBe(true);
    }
  });

  it('PHASE_C_TOOL_DEFS contains propose tools alongside read + write tools', () => {
    const names = PHASE_C_TOOL_DEFS.map((t) => t.name);
    expect(names).toContain('orbit_search');
    expect(names).toContain('orbit_resource_create');
    expect(names).toContain('orbit_task_propose');
    expect(names).toContain('orbit_task_propose_scope');
    expect(names).toContain('orbit_task_propose_split');
  });
});

describe('Executor + propose tool', () => {
  function makeExecutor(opts: {
    handler: (r: CliRequest) => CliResponse | Promise<CliResponse>;
    activity?: ActivityEmitterLike;
  }): OrbitToolExecutor {
    const registry = new OrbitToolRegistry();
    registry.registerMany(PROPOSE_TOOL_DEFS);
    return new OrbitToolExecutor({
      toolRegistry: registry,
      cliRegistry: new FakeCli(opts.handler) as unknown as CliHandlerRegistry,
      ...(opts.activity ? { activity: opts.activity } : {})
    });
  }

  it('emits agent.proposal_submitted Activity on successful propose', async () => {
    const seen: ActivityEventInput[] = [];
    const requests: CliRequest[] = [];
    const executor = makeExecutor({
      handler: (request) => {
        requests.push(request);
        return { id: 'x', ok: true, data: { id: 'proposal-1' } };
      },
      activity: {
        emit: (input) => {
          seen.push(input);
        }
      }
    });
    const tu: AgentTurnToolUse = {
      id: 'toolu_p1',
      name: 'orbit_task_propose',
      input: { title: 'Add OAuth', project_uid: 'proj-1' }
    };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.action).toBe('agent.proposal_submitted');
    expect(seen[0]?.actor).toBe('agent');
    expect(seen[0]?.context?.tool_name).toBe('orbit_task_propose');
    expect(requests[0]?.params).toMatchObject({
      title: 'Add OAuth',
      project_uid: 'proj-1',
      run_id: 'run',
      conversation_id: 'conv'
    });
  });

  it('emits agent.tool_failed on propose failure (not agent.proposal_submitted)', async () => {
    const seen: ActivityEventInput[] = [];
    const executor = makeExecutor({
      handler: () => ({
        id: 'x',
        ok: false,
        error: { code: 'invalid_params', message: 'no project' }
      }),
      activity: {
        emit: (input) => {
          seen.push(input);
        }
      }
    });
    const tu: AgentTurnToolUse = {
      id: 'toolu_p2',
      name: 'orbit_task_propose',
      input: { title: 'Bad' }
    };
    const result = await executor.execute(tu, ctx, sink);
    expect(result.isError).toBe(true);
    expect(seen[0]?.action).toBe('agent.tool_failed');
  });
});
