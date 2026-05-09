import { describe, expect, it } from 'vitest';
import type { ConversationTurn } from '@shared/conversation';
import type { ToolTraceBlock } from '@shared/agent-tools';
import { rebuildMessages } from '../src/main/agent-tools/rebuild-messages';

function userTurn(id: string, content: string): ConversationTurn {
  return { id, at: '2026-05-09T00:00:00Z', role: 'user', content };
}

function assistantTurn(
  id: string,
  content: string,
  toolTrace?: ToolTraceBlock[]
): ConversationTurn {
  return {
    id,
    at: '2026-05-09T00:00:00Z',
    role: 'assistant',
    content,
    ...(toolTrace ? { toolTrace } : {})
  };
}

function trace(
  toolUseId: string,
  toolName: string,
  result: string,
  isError = false
): ToolTraceBlock {
  return {
    toolUseId,
    toolName,
    input: { q: toolUseId },
    result,
    ...(isError ? { isError: true } : {}),
    at: '2026-05-09T00:00:00Z'
  };
}

describe('rebuildMessages', () => {
  it('handles empty conversation with appended user text', () => {
    const out = rebuildMessages([], { appendUserText: 'hello' });
    expect(out).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('falls back to plain text for legacy turns without toolTrace', () => {
    const out = rebuildMessages(
      [userTurn('u1', 'hi'), assistantTurn('a1', 'hello back')],
      { appendUserText: 'and again' }
    );
    expect(out).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
      { role: 'user', content: 'and again' }
    ]);
  });

  it('expands an assistant turn with toolTrace into tool_use + tool_result blocks', () => {
    const turns = [
      userTurn('u1', 'find notes about X'),
      assistantTurn('a1', 'looking up...', [trace('toolu_1', 'orbit_search', 'hits=[a,b]')])
    ];
    const out = rebuildMessages(turns, { appendUserText: 'next?' });
    // a1 → assistant message with text + tool_use; pending tool_result lives on next user message
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ role: 'user', content: 'find notes about X' });
    expect(out[1]?.role).toBe('assistant');
    const ablocks = out[1]?.content;
    expect(Array.isArray(ablocks)).toBe(true);
    expect(ablocks).toEqual([
      { type: 'text', text: 'looking up...' },
      { type: 'tool_use', id: 'toolu_1', name: 'orbit_search', input: { q: 'toolu_1' } }
    ]);
    expect(out[2]?.role).toBe('user');
    const ublocks = out[2]?.content as Array<unknown>;
    expect(ublocks[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: 'hits=[a,b]'
    });
    expect(ublocks[1]).toEqual({ type: 'text', text: 'next?' });
  });

  it('marks isError on tool_result when trace.isError is true', () => {
    const turns = [
      userTurn('u1', 'q'),
      assistantTurn('a1', '', [trace('toolu_x', 'orbit_search', 'invalid_params: bad', true)])
    ];
    const out = rebuildMessages(turns, { appendUserText: 'recover' });
    const userMsg = out[out.length - 1];
    const blocks = userMsg?.content as Array<Record<string, unknown>>;
    expect(blocks[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_x',
      content: 'invalid_params: bad',
      is_error: true
    });
  });

  it('preserves multiple parallel tool_use → tool_result one-to-one', () => {
    const turns = [
      userTurn('u1', 'multi'),
      assistantTurn('a1', '', [
        trace('toolu_1', 'orbit_search', 'r1'),
        trace('toolu_2', 'orbit_search', 'r2'),
        trace('toolu_3', 'orbit_search', 'r3')
      ])
    ];
    const out = rebuildMessages(turns, { appendUserText: 'go' });
    const assistantBlocks = out[1]?.content as Array<{ type: string; id?: string }>;
    const toolUses = assistantBlocks.filter((b) => b.type === 'tool_use');
    expect(toolUses.map((t) => t.id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3']);
    const userBlocks = out[2]?.content as Array<{ type: string; tool_use_id?: string }>;
    const results = userBlocks.filter((b) => b.type === 'tool_result');
    expect(results.map((r) => r.tool_use_id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3']);
  });

  it('synthesises a tool_result-only user message when toolTrace assistant is the last turn', () => {
    // 极端兜底：assistant 后面没有 user turn 就被中断
    const turns = [
      userTurn('u1', 'hi'),
      assistantTurn('a1', '', [trace('toolu_a', 'orbit_search', 'r')])
    ];
    // 不传 appendUserText
    const out = rebuildMessages(turns);
    expect(out).toHaveLength(3);
    expect(out[2]?.role).toBe('user');
    const blocks = out[2]?.content as Array<Record<string, unknown>>;
    expect(blocks[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_a',
      content: 'r'
    });
    expect(blocks).toHaveLength(1);
  });

  it('compacts old tool-bearing turns beyond maxRetainedAssistantWithTools', () => {
    const turns: ConversationTurn[] = [];
    // 14 个 tool-bearing assistant turn（间隔 user）
    for (let i = 0; i < 14; i += 1) {
      turns.push(userTurn(`u${i}`, `q${i}`));
      turns.push(
        assistantTurn(`a${i}`, '', [trace(`toolu_${i}`, 'orbit_search', `r${i}`)])
      );
    }
    const out = rebuildMessages(turns, { appendUserText: 'next', maxRetainedAssistantWithTools: 12 });
    // 最早 2 个被压缩；前面应有压缩说明
    expect(out[0]).toEqual({
      role: 'assistant',
      content:
        '[Earlier in this conversation, the assistant ran 2 tool-bearing turn(s); details have been compacted to save context.]'
    });
    // 不应该有任何孤立 tool_use（被压缩的轮次同时丢弃 tool_use 与 tool_result）
    const stray = out.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => {
      const block = b as { type?: string };
      return block.type === 'tool_use';
    });
    expect(stray.length).toBe(12);
  });

  it('skips system turns', () => {
    const turns: ConversationTurn[] = [
      { id: 's1', at: 'x', role: 'system', content: 'sys' },
      userTurn('u1', 'hi')
    ];
    const out = rebuildMessages(turns, { appendUserText: 'q' });
    expect(out.map((m) => m.role)).toEqual(['user', 'user']);
  });
});
