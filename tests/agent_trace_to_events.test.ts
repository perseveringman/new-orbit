import { describe, expect, it } from 'vitest';
import type { ToolTraceBlock } from '@shared/agent-tools';
import { toolTraceToRuntimeEvents } from '../src/shared/agent-tools/trace-to-events';

function traceBlock(
  overrides: Partial<ToolTraceBlock> = {}
): ToolTraceBlock {
  return {
    toolUseId: 'toolu_1',
    toolName: 'orbit_search',
    input: { query: 'hi' },
    result: 'hits=[a,b]',
    at: '2026-05-09T00:00:00Z',
    ...overrides
  };
}

describe('toolTraceToRuntimeEvents', () => {
  it('returns [] for empty or undefined trace', () => {
    expect(toolTraceToRuntimeEvents(undefined, { conversationId: 'c', runId: 'r' })).toEqual([]);
    expect(toolTraceToRuntimeEvents([], { conversationId: 'c', runId: 'r' })).toEqual([]);
  });

  it('emits paired tool_use + tool_result events with stable span id', () => {
    const events = toolTraceToRuntimeEvents([traceBlock()], {
      conversationId: 'conv-1',
      runId: 'hist-run-1'
    });
    expect(events).toHaveLength(2);
    const [tu, tr] = events;
    expect(tu?.kind).toBe('runtime.tool_use');
    expect(tu?.spanId).toBe('toolu_1');
    expect(tu?.payload).toMatchObject({
      toolName: 'orbit_search',
      toolInput: { query: 'hi' },
      spanId: 'toolu_1'
    });
    expect(tr?.kind).toBe('runtime.tool_result');
    expect(tr?.parentSpanId).toBe('toolu_1');
    expect(tr?.payload).toMatchObject({
      toolName: 'orbit_search',
      result: 'hits=[a,b]',
      parentSpanId: 'toolu_1'
    });
  });

  it('passes is_error flag when trace.isError', () => {
    const events = toolTraceToRuntimeEvents(
      [traceBlock({ isError: true, result: 'invalid_params: bad' })],
      { conversationId: 'c', runId: 'r' }
    );
    const tr = events[1];
    expect((tr?.payload as { isError?: boolean }).isError).toBe(true);
  });

  it('skips tool_result when no result was recorded (still produces tool_use)', () => {
    const events = toolTraceToRuntimeEvents(
      [{ toolUseId: 'toolu_x', toolName: 'orbit_x', input: null, at: '2026-05-09T00:00:00Z' }],
      { conversationId: 'c', runId: 'r' }
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('runtime.tool_use');
  });

  it('preserves order of multiple trace blocks', () => {
    const events = toolTraceToRuntimeEvents(
      [
        traceBlock({ toolUseId: 'toolu_1', result: 'r1' }),
        traceBlock({ toolUseId: 'toolu_2', result: 'r2' }),
        traceBlock({ toolUseId: 'toolu_3', result: 'r3' })
      ],
      { conversationId: 'c', runId: 'r' }
    );
    expect(events).toHaveLength(6);
    expect(events.map((e) => e.kind)).toEqual([
      'runtime.tool_use',
      'runtime.tool_result',
      'runtime.tool_use',
      'runtime.tool_result',
      'runtime.tool_use',
      'runtime.tool_result'
    ]);
    expect(events.filter((e) => e.kind === 'runtime.tool_use').map((e) => e.spanId)).toEqual([
      'toolu_1',
      'toolu_2',
      'toolu_3'
    ]);
  });
});
