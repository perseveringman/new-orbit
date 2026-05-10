import { describe, expect, it } from 'vitest';
import type { Conversation, ConversationTurn } from '@shared/conversation';
import type { ToolTraceBlock } from '@shared/agent-tools';
import type { SDKInvocationMessage } from '@shared/runtime';
import { turnsToEvents } from '../src/renderer/src/components/ask-anywhere/AskAnywhereHost';

function userTurn(id: string, content: string): ConversationTurn {
  return { id, at: '2026-05-09T00:00:00Z', role: 'user', content };
}

function assistantTurn(
  id: string,
  content: string,
  toolTrace?: ToolTraceBlock[],
  replayMessages?: SDKInvocationMessage[]
): ConversationTurn {
  return {
    id,
    at: '2026-05-09T00:00:00Z',
    role: 'assistant',
    content,
    ...(toolTrace ? { toolTrace } : {}),
    ...(replayMessages ? { replayMessages } : {})
  };
}

function trace(toolUseId: string, toolName: string, result: string, isError = false): ToolTraceBlock {
  return {
    toolUseId,
    toolName,
    input: { q: toolUseId },
    result,
    ...(isError ? { isError: true } : {}),
    at: '2026-05-09T00:00:00Z'
  };
}

function makeConv(turns: ConversationTurn[]): Conversation {
  return {
    id: 'conv-1',
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: '2026-05-09T00:00:00Z',
    status: 'active',
    anchors: [{ kind: 'ask_anywhere_session', refId: 'a', addedAt: '2026-05-09T00:00:00Z' }],
    turns
  };
}

describe('turnsToEvents (Phase E.2.1 ToolCard 历史回放)', () => {
  it('returns only runtime.message events for legacy turns without toolTrace', () => {
    const conv = makeConv([userTurn('u1', 'hi'), assistantTurn('a1', 'hello back')]);
    const events = turnsToEvents(conv);
    expect(events.map((e) => e.kind)).toEqual(['runtime.message', 'runtime.message']);
  });

  it('expands assistant toolTrace into tool_use + tool_result events before the assistant message', () => {
    const conv = makeConv([
      userTurn('u1', '查一下'),
      assistantTurn('a1', '找到 3 个结果', [trace('toolu_1', 'orbit_search', 'hits=[a,b,c]')])
    ]);
    const events = turnsToEvents(conv);
    expect(events.map((e) => e.kind)).toEqual([
      'runtime.message', // user turn
      'runtime.tool_use', // assistant toolTrace[0]
      'runtime.tool_result',
      'runtime.message' // assistant text
    ]);
    // tool_use/tool_result 用 Anthropic 原生 toolUseId 作 spanId，可被 ToolCard 配对
    const tu = events[1];
    const tr = events[2];
    expect(tu?.spanId).toBe('toolu_1');
    expect(tr?.parentSpanId).toBe('toolu_1');
    expect((tu?.payload as { toolName: string }).toolName).toBe('orbit_search');
  });

  it('preserves order for multiple tool calls within one assistant turn', () => {
    const conv = makeConv([
      userTurn('u1', 'multi'),
      assistantTurn('a1', 'done', [
        trace('toolu_1', 'orbit_search', 'r1'),
        trace('toolu_2', 'orbit_task_list', 'r2')
      ])
    ]);
    const events = turnsToEvents(conv);
    const spanIds = events
      .filter((e) => e.kind === 'runtime.tool_use')
      .map((e) => e.spanId);
    expect(spanIds).toEqual(['toolu_1', 'toolu_2']);
  });

  it('propagates isError onto tool_result payload', () => {
    const conv = makeConv([
      userTurn('u1', 'q'),
      assistantTurn('a1', '失败了，重试？', [
        trace('toolu_x', 'orbit_task_propose', 'invalid_params: missing project_uid', true)
      ])
    ]);
    const events = turnsToEvents(conv);
    const tr = events.find((e) => e.kind === 'runtime.tool_result');
    expect((tr?.payload as { isError?: boolean }).isError).toBe(true);
  });

  it('does not expand toolTrace on user turns (only assistant turns carry them)', () => {
    const weirdTurn: ConversationTurn = {
      id: 'u2',
      at: '2026-05-09T00:00:00Z',
      role: 'user',
      content: 'hi',
      // user turn 理论上不应带 toolTrace；若误带，也不应被展开
      toolTrace: [trace('toolu_nope', 'orbit_search', 'r')] as ToolTraceBlock[]
    };
    const conv = makeConv([weirdTurn]);
    const events = turnsToEvents(conv);
    expect(events.map((e) => e.kind)).toEqual(['runtime.message']);
  });

  it('produces deterministic event ids for history replay (cache-friendly)', () => {
    const conv = makeConv([
      assistantTurn('a1', 'done', [trace('toolu_1', 'orbit_search', 'r')])
    ]);
    const a = turnsToEvents(conv);
    const b = turnsToEvents(conv);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it('replays persisted thinking and tool messages in original order', () => {
    const replayMessages: SDKInvocationMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '先搜索项目。', signature: 'sig-1' },
          { type: 'tool_use', id: 'toolu_1', name: 'orbit_search', input: { query: 'project' } }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'hits=[]' }]
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '没有找到项目。' }]
      }
    ];
    const conv = makeConv([
      userTurn('u1', '查项目'),
      assistantTurn('a1', '没有找到项目。', undefined, replayMessages)
    ]);

    const events = turnsToEvents(conv);
    expect(events.map((event) => event.kind)).toEqual([
      'runtime.message',
      'runtime.thinking',
      'runtime.tool_use',
      'runtime.tool_result',
      'runtime.message'
    ]);
    expect(events[1]?.payload).toMatchObject({ text: '先搜索项目。' });
    expect(events[2]?.spanId).toBe('toolu_1');
    expect(events[3]?.parentSpanId).toBe('toolu_1');
    expect(events[4]?.payload).toMatchObject({ text: '没有找到项目。' });
  });
});
