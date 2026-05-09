import { describe, expect, it } from 'vitest';
import type { ConversationMeta, ConversationAnchor } from '@shared/conversation';
import { computeConversationsViewCapabilities } from '../src/renderer/src/views/ConversationsView';

function makeMeta(anchors: ConversationAnchor[]): ConversationMeta {
  return {
    id: 'c1',
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: '2026-05-09T00:00:00Z',
    status: 'active',
    anchors
  };
}

const askAnchor: ConversationAnchor = {
  kind: 'ask_anywhere_session',
  refId: 'x',
  addedAt: '2026-05-09T00:00:00Z'
};

const taskAnchor: ConversationAnchor = {
  kind: 'task',
  refId: 'T123',
  addedAt: '2026-05-09T00:00:00Z'
};

const inboxAnchor: ConversationAnchor = {
  kind: 'inbox_item',
  refId: 'I1',
  addedAt: '2026-05-09T00:00:00Z'
};

describe('computeConversationsViewCapabilities (Phase E.2.2)', () => {
  it('returns read-only capabilities for null active conversation', () => {
    const cap = computeConversationsViewCapabilities(null);
    expect(cap.canSendMessage).toBe(false);
    expect(cap.canStop).toBe(false);
    expect(cap.canRetry).toBe(false);
    expect(cap.supportsStreaming).toBe(false);
  });

  it('enables send/stop/retry for ask_anywhere_session anchor', () => {
    const cap = computeConversationsViewCapabilities(makeMeta([askAnchor]));
    expect(cap.canSendMessage).toBe(true);
    expect(cap.canStop).toBe(true);
    expect(cap.canRetry).toBe(true);
    expect(cap.supportsStreaming).toBe(true);
  });

  it('keeps task-anchored conversations read-only', () => {
    const cap = computeConversationsViewCapabilities(makeMeta([taskAnchor]));
    expect(cap.canSendMessage).toBe(false);
  });

  it('keeps inbox-anchored conversations read-only', () => {
    const cap = computeConversationsViewCapabilities(makeMeta([inboxAnchor]));
    expect(cap.canSendMessage).toBe(false);
  });

  it('enables continue when ask_anywhere_session is among multiple anchors', () => {
    // 对话可能同时被 anchor 到多个场景，只要其中含 ask_anywhere_session 就允许续谈
    const cap = computeConversationsViewCapabilities(makeMeta([taskAnchor, askAnchor]));
    expect(cap.canSendMessage).toBe(true);
  });

  it('never enables compact / approveTool / thinking / fileChanges', () => {
    // 这些能力在历史对话视图里没有意义，无论 anchor 是什么
    const cap = computeConversationsViewCapabilities(makeMeta([askAnchor]));
    expect(cap.canCompact).toBe(false);
    expect(cap.canApproveTool).toBe(false);
    expect(cap.supportsThinking).toBe(false);
    expect(cap.supportsFileChanges).toBe(false);
  });
});
