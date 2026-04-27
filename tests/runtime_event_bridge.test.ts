import { describe, expect, it } from 'vitest';
import { unifiedAgentEventToRuntimeEvent } from '../src/main/agent/adapter/runtime_event_bridge';
import type { UnifiedAgentEvent } from '../src/shared/agent-event';

function base(kind: UnifiedAgentEvent['kind'], extra: Partial<UnifiedAgentEvent> = {}): UnifiedAgentEvent {
  return {
    id: 'e1',
    traceId: 't1',
    spanId: 's1',
    at: '2026-04-29T00:00:00Z',
    kind,
    runtime: { provider: 'claude' },
    runId: 'run-1',
    ...extra
  };
}

describe('unifiedAgentEventToRuntimeEvent', () => {
  it('maps message event', () => {
    const ev = unifiedAgentEventToRuntimeEvent(base('message', { text: 'hi' }));
    expect(ev.kind).toBe('runtime.message');
    expect(ev.conversationId).toBe('run-1');
    expect((ev.payload as { text: string }).text).toBe('hi');
  });

  it('honors explicit conversationId', () => {
    const ev = unifiedAgentEventToRuntimeEvent(base('thinking', { text: 'mm' }), {
      conversationId: 'conv-7'
    });
    expect(ev.conversationId).toBe('conv-7');
    expect(ev.kind).toBe('runtime.thinking');
  });

  it('maps tool_use with toolName', () => {
    const ev = unifiedAgentEventToRuntimeEvent(
      base('tool_use', { toolName: 'Read', vendorEvent: { path: 'a' } })
    );
    expect(ev.kind).toBe('runtime.tool_use');
    expect((ev.payload as { toolName: string }).toolName).toBe('Read');
  });

  it('maps cost event', () => {
    const ev = unifiedAgentEventToRuntimeEvent(
      base('cost', { cost: { inputTokens: 10, outputTokens: 5, totalCostUsd: 0.01 } })
    );
    expect(ev.kind).toBe('runtime.cost');
    expect((ev.payload as { totalUsd?: number }).totalUsd).toBe(0.01);
  });

  it('maps error event', () => {
    const ev = unifiedAgentEventToRuntimeEvent(base('error', { text: 'boom' }));
    expect(ev.kind).toBe('runtime.error');
    expect((ev.payload as { message: string }).message).toBe('boom');
  });
});
