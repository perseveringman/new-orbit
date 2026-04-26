import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/agent';
import type { RuntimeDescriptor } from '../src/shared/orchestration';
import { agentEventToUnifiedAgentEvent } from '../src/main/agent/adapter/compat';
import { ClaudeRuntimeAdapter } from '../src/main/agent/adapter/claude';
import { createRuntimeAdapter, listRuntimeAdapterProviders } from '../src/main/agent/adapter/registry';

const claudeRuntime: RuntimeDescriptor = {
  runtimeId: 'claude:/bin/claude',
  mode: 'local',
  provider: 'claude',
  name: 'Claude',
  binaryPath: '/bin/claude',
  version: '1.0.0',
  status: 'online',
  discoveredAt: '2026-04-27T00:00:00.000Z',
  lastSeenAt: '2026-04-27T00:00:00.000Z',
  capabilities: {
    supportsResume: true,
    supportsHooks: true,
    supportsWorktree: true,
    supportsBackgroundRuns: true
  },
  limits: { maxConcurrentRuns: 1 }
};

describe('runtime adapter layer', () => {
  it('normalizes legacy AgentEvent into UnifiedAgentEvent', () => {
    const event: AgentEvent = {
      idx: 2,
      at: '2026-04-27T00:00:01.000Z',
      kind: 'message',
      text: 'hello',
      data: { session_id: 'claude-session-1' }
    };

    expect(
      agentEventToUnifiedAgentEvent(event, {
        runId: 'run_1',
        taskId: 'task_1',
        runtime: { provider: 'claude', runtimeId: 'claude:/bin/claude' }
      })
    ).toMatchObject({
      id: 'trace-run_1:agent-event-2',
      traceId: 'trace-run_1',
      spanId: 'agent-event-2',
      kind: 'message',
      runId: 'run_1',
      taskId: 'task_1',
      vendorSessionId: 'claude-session-1',
      text: 'hello',
      runtime: { provider: 'claude', runtimeId: 'claude:/bin/claude' }
    });
  });

  it('maps Claude stream-json payloads through the Claude adapter', () => {
    const adapter = new ClaudeRuntimeAdapter(claudeRuntime);

    const unified = adapter.normalizeVendorEvent(
      { type: 'assistant', message: { content: 'done', session_id: 's1' } },
      {
        runId: 'run_1',
        runtime: { provider: 'claude', runtimeId: claudeRuntime.runtimeId }
      },
      0
    );

    expect(unified.kind).toBe('message');
    expect(unified.text).toBe('done');
    expect(unified.vendorSessionId).toBe('s1');
  });

  it('registers Claude, Codex, and Copilot adapters', () => {
    expect(listRuntimeAdapterProviders()).toEqual(expect.arrayContaining(['claude', 'codex', 'copilot']));
    expect(createRuntimeAdapter(claudeRuntime)).toBeInstanceOf(ClaudeRuntimeAdapter);
  });
});
