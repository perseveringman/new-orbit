import { useMemo } from 'react';
import type { ChatAction } from '@shared/chat-protocol';

export interface UseChatActionsOptions {
  conversationId: string;
  onAction: (action: ChatAction) => void;
}

export interface ChatActionDispatchers {
  sendMessage(text: string): void;
  stop(reason?: string): void;
  retry(turnId?: string): void;
  copy(turnId: string, text: string): void;
  expandThinking(spanId: string): void;
  collapseThinking(spanId: string): void;
  approveTool(spanId: string): void;
  rejectTool(spanId: string, reason?: string): void;
  compact(scope?: string): void;
}

export function useChatActions(options: UseChatActionsOptions): ChatActionDispatchers {
  const { conversationId, onAction } = options;

  return useMemo<ChatActionDispatchers>(
    () => ({
      sendMessage: (text) =>
        onAction({ kind: 'chat.send_message', conversationId, payload: { text } }),
      stop: (reason) =>
        onAction({
          kind: 'chat.stop',
          conversationId,
          payload: reason ? { reason } : {}
        }),
      retry: (turnId) =>
        onAction({
          kind: 'chat.retry',
          conversationId,
          payload: turnId ? { turnId } : {}
        }),
      copy: (turnId, text) =>
        onAction({ kind: 'chat.copy', conversationId, payload: { turnId, text } }),
      expandThinking: (spanId) =>
        onAction({ kind: 'chat.expand_thinking', conversationId, payload: { spanId } }),
      collapseThinking: (spanId) =>
        onAction({ kind: 'chat.collapse_thinking', conversationId, payload: { spanId } }),
      approveTool: (spanId) =>
        onAction({ kind: 'chat.approve_tool', conversationId, payload: { spanId } }),
      rejectTool: (spanId, reason) =>
        onAction({
          kind: 'chat.reject_tool',
          conversationId,
          payload: reason ? { spanId, reason } : { spanId }
        }),
      compact: (scope) =>
        onAction({
          kind: 'chat.compact',
          conversationId,
          payload: scope ? { scope } : {}
        })
    }),
    [conversationId, onAction]
  );
}
