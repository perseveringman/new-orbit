/**
 * ChatAction — Chat → Host 抛出的用户动作
 *
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §3
 */

import type { ComposerDraft } from '@shared/ai-composer';

export const CHAT_ACTION_KINDS = [
  'chat.send_message',
  'chat.stop',
  'chat.retry',
  'chat.copy',
  'chat.expand_thinking',
  'chat.collapse_thinking',
  'chat.approve_tool',
  'chat.reject_tool',
  'chat.compact'
] as const;

export type ChatActionKind = (typeof CHAT_ACTION_KINDS)[number];

export interface ChatSendMessagePayload {
  text: string;
  draft?: ComposerDraft;
}

export interface ChatStopPayload {
  /** 占位避免空对象。 */
  reason?: string;
}

export interface ChatRetryPayload {
  turnId?: string;
}

export interface ChatCopyPayload {
  turnId: string;
  text: string;
}

export interface ChatThinkingTogglePayload {
  spanId: string;
}

export interface ChatApproveToolPayload {
  spanId: string;
}

export interface ChatRejectToolPayload {
  spanId: string;
  reason?: string;
}

export interface ChatCompactPayload {
  /** 占位避免空对象。 */
  scope?: string;
}

export interface ChatActionPayloadMap {
  'chat.send_message': ChatSendMessagePayload;
  'chat.stop': ChatStopPayload;
  'chat.retry': ChatRetryPayload;
  'chat.copy': ChatCopyPayload;
  'chat.expand_thinking': ChatThinkingTogglePayload;
  'chat.collapse_thinking': ChatThinkingTogglePayload;
  'chat.approve_tool': ChatApproveToolPayload;
  'chat.reject_tool': ChatRejectToolPayload;
  'chat.compact': ChatCompactPayload;
}

export interface ChatAction<K extends ChatActionKind = ChatActionKind> {
  kind: K;
  conversationId: string;
  payload: ChatActionPayloadMap[K];
}

export function isChatActionKind(value: string): value is ChatActionKind {
  return (CHAT_ACTION_KINDS as readonly string[]).includes(value);
}
