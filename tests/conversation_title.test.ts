import { describe, expect, it } from 'vitest';
import type { Conversation } from '../src/shared/conversation';
import type { RuntimeRouter } from '../src/main/runtime/router';
import {
  fallbackConversationTitle,
  generateConversationAutoTitle,
  normalizeGeneratedTitle,
  shouldAutoTitleConversation
} from '../src/main/conversation/title';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-title',
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:01:00.000Z',
    status: 'active',
    anchors: [{ kind: 'ask_anywhere_session', refId: 'ask-1', addedAt: '2026-05-13T00:00:00.000Z' }],
    scope: { kind: 'global' },
    title: 'Ask Anywhere',
    turns: [
      {
        id: 'u1',
        at: '2026-05-13T00:00:00.000Z',
        role: 'user',
        content: 'ask anywhere 创建任务时 inbox 红点没有实时变更，应该如何设计？'
      },
      {
        id: 'a1',
        at: '2026-05-13T00:01:00.000Z',
        role: 'assistant',
        content: '应该让 Approval 和 Inbox 共享 proposal 状态，并通过事件实时广播到当前对话和侧栏。'
      }
    ],
    ...overrides
  };
}

describe('conversation title generation', () => {
  it('only auto-titles default, ungenerated conversations with one assistant answer', () => {
    expect(shouldAutoTitleConversation(conversation())).toBe(true);
    expect(shouldAutoTitleConversation(conversation({ titleSource: 'manual' }))).toBe(false);
    expect(
      shouldAutoTitleConversation(
        conversation({ title: 'Inbox 实时审批同步', titleGeneratedFromTurnId: 'a1' })
      )
    ).toBe(false);
  });

  it('normalizes model output to one concise title', () => {
    expect(normalizeGeneratedTitle('标题： “Inbox 实时审批同步”。\n其他解释')).toBe('Inbox 实时审批同步');
  });

  it('has a deterministic fallback when no model is available', () => {
    expect(fallbackConversationTitle(conversation())).toContain('ask anywhere 创建任务');
  });

  it('uses the model title when a runtime router is available', async () => {
    const router = {
      stream: async () => ({
        text: '"Inbox 实时审批同步"',
        eventIds: [],
        inputTokens: 0,
        outputTokens: 0
      })
    } as unknown as RuntimeRouter;

    const generated = await generateConversationAutoTitle({
      conversation: conversation(),
      assistantTurnId: 'a1',
      router
    });

    expect(generated).toMatchObject({
      title: 'Inbox 实时审批同步',
      confidence: 0.82,
      generatedFromTurnId: 'a1',
      usedModel: true
    });
  });
});
