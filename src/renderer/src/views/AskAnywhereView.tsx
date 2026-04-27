/**
 * AskAnywhereView — Ask-Anywhere 主视图（M6 骨架）。
 *
 * 行为：
 *  - 通过 chat.findConversationsByAnchor('ask_anywhere_session') 列出历史会话
 *  - 选中 / 新建会话后挂载 ChatView
 *
 * 暂以 stub onSend 落地（M5 host 重构完成后会接入 chat IPC 真实发送）。
 */

import { useCallback, useEffect, useState } from 'react';
import type { Conversation } from '@shared/conversation';
import { ChatView } from '../components/Chat/ChatView';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';

export function AskAnywhereView(): JSX.Element {
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);

  const reload = useCallback(async () => {
    const list = await window.orbit.chat.listConversations();
    const askOnly = list.filter((c) =>
      c.anchors.some((a) => a.kind === 'ask_anywhere_session')
    );
    setSessions(askOnly as Conversation[]);
    if (!activeId && askOnly.length > 0) setActiveId(askOnly[0].id);
  }, [activeId]);

  useEffect(() => {
    void reload();
    const off = window.orbit.chat.onRuntimeEvent((event) => {
      if (event.conversationId !== activeId) return;
      setEvents((current) => [...current, event]);
    });
    return () => off();
  }, [activeId, reload]);

  useEffect(() => {
    setEvents([]);
  }, [activeId]);

  async function handleNew(): Promise<void> {
    const conv = await window.orbit.chat.createConversation({
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `ask-${Date.now()}`,
        addedAt: new Date().toISOString()
      },
      title: 'Ask Anywhere'
    });
    setActiveId(conv.id);
    await reload();
  }

  async function handleAction(action: ChatAction): Promise<void> {
    if (action.kind !== 'send_message' || !activeId) return;
    await window.orbit.chat.appendTurn({
      conversationId: activeId,
      role: 'user',
      content: action.payload.text
    });
    setEvents((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        at: new Date().toISOString(),
        kind: 'runtime.message',
        conversationId: activeId,
        runId: activeId,
        spanId: `local-${Date.now()}`,
        payload: { text: action.payload.text }
      } as RuntimeEvent
    ]);
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
          <span>Ask Anywhere</span>
          <button
            onClick={() => void handleNew()}
            className="rounded bg-sky-600 px-2 py-1 text-[10px] text-white hover:bg-sky-500"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-3 py-6 text-xs text-neutral-500">
              No Ask sessions yet. Click “+ New”.
            </p>
          ) : (
            sessions.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activeId === conv.id
                    ? 'bg-sky-50 dark:bg-sky-900/30'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <div className="truncate font-medium">{conv.title ?? 'Untitled'}</div>
                <div className="truncate text-[11px] text-neutral-500">
                  {new Date(conv.updatedAt).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {activeId ? (
          <ChatView
            conversationId={activeId}
            capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
            events={events}
            isLoading={false}
            onAction={(action) => void handleAction(action)}
            welcomeMessage="Ask anything. Each session persists as a conversation."
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            Select or create a session to start.
          </div>
        )}
      </section>
    </div>
  );
}
