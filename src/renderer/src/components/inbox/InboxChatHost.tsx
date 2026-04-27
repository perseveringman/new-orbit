/**
 * InboxChatHost — skeleton (M5 D-2 部分)
 *
 * 当前 Inbox UI 仍由 InboxShell + 各 stage renderer 自行渲染对话。
 * 本 host 提供未来切换到 ChatView 的接入点，调用方传入 conversationId
 * 与可选锚点（issueRef / proposalId 等），host 在内部通过
 * window.orbit.chat.findConversationsByAnchor / getConversation 装填。
 */

import { useEffect, useState } from 'react';
import { ChatView } from '../chat/ChatView';
import type {
  ChatAction,
  ChatHostCapabilities,
  RuntimeEvent
} from '@shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';

interface InboxChatHostProps {
  conversationId: string;
  capabilities?: Partial<ChatHostCapabilities>;
  onSend?: (text: string) => Promise<void>;
}

export function InboxChatHost({
  conversationId,
  capabilities,
  onSend
}: InboxChatHostProps): JSX.Element {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void window.orbit.chat
      .getConversation(conversationId)
      .then((conv) => {
        if (!mounted || !conv) return;
        setEvents([]);
      })
      .finally(() => mounted && setLoading(false));

    const off = window.orbit.chat.onRuntimeEvent((event) => {
      if (event.conversationId !== conversationId) return;
      setEvents((current) => [...current, event]);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [conversationId]);

  async function handleAction(action: ChatAction): Promise<void> {
    if (action.kind === 'chat.send_message' && onSend) {
      const payload = action.payload as { text: string };
      await onSend(payload.text);
    }
  }

  return (
    <ChatView
      conversationId={conversationId}
      capabilities={{ ...DEFAULT_CHAT_HOST_CAPABILITIES, ...capabilities }}
      events={events}
      isLoading={loading}
      onAction={(action) => void handleAction(action)}
    />
  );
}
