/**
 * Conversation 数据模型 — Chat 解耦 D-5（Conversation 一等公民）。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §6
 */

export const CONVERSATION_ANCHOR_KINDS = [
  'task',
  'inbox_item',
  'ask_anywhere_session',
  'channel_thread',
  'capture_item',
  'planner_session'
] as const;

export type ConversationAnchorKind = (typeof CONVERSATION_ANCHOR_KINDS)[number];

export interface ConversationAnchor {
  kind: ConversationAnchorKind;
  refId: string;
  addedAt: string;
}

export type ConversationTurnRole = 'user' | 'assistant' | 'system';

export interface ConversationTurn {
  id: string;
  at: string;
  role: ConversationTurnRole;
  content: string;
  runtimeEventIds?: string[];
}

export type ConversationStatus = 'active' | 'paused' | 'ended';

export interface ConversationMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ConversationStatus;
  anchors: ConversationAnchor[];
  currentRunId?: string;
  runtimeHint?: string;
  vendorSessionId?: string;
  title?: string;
  summary?: string;
  tags?: string[];
}

export interface Conversation extends ConversationMeta {
  turns: ConversationTurn[];
}

export function isConversationAnchorKind(value: string): value is ConversationAnchorKind {
  return (CONVERSATION_ANCHOR_KINDS as readonly string[]).includes(value);
}
