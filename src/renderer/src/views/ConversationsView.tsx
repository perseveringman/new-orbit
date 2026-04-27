/**
 * ConversationsView — 对话中心（D-5 P1.4）。
 *
 * 列出所有 Conversation（task/inbox_item/ask_anywhere_session/...），点击右侧打开对应 ChatView。
 * 这是"Conversation 一等公民"的统一入口。
 */

import { useEffect, useMemo, useState } from 'react';
import type { ConversationMeta, ConversationAnchor } from '@shared/conversation';
import type { RuntimeEvent, ChatHostCapabilities } from '@shared/chat-protocol';
import { ChatView } from '../components/chat/ChatView';

function describeAnchor(a: ConversationAnchor): string {
  switch (a.kind) {
    case 'task':
      return `Task · ${a.refId.slice(0, 8)}`;
    case 'inbox_item':
      return `Inbox · ${a.refId.slice(0, 8)}`;
    case 'ask_anywhere_session':
      return `Ask · ${a.refId.slice(0, 8)}`;
    case 'channel_thread':
      return `Channel · ${a.refId}`;
    case 'capture_item':
      return `Capture · ${a.refId.slice(0, 8)}`;
    case 'planner_session':
      return `Planner · ${a.refId.slice(0, 8)}`;
    default:
      return `${a.kind}:${a.refId}`;
  }
}

export function ConversationsView(): JSX.Element {
  const [list, setList] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.orbit.chat.listConversations().then((items) => {
      if (cancelled) return;
      const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setList(sorted);
      if (!activeId && sorted.length > 0) setActiveId(sorted[0]!.id);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void window.orbit.chat.getConversation(activeId).then((conv) => {
      if (cancelled || !conv) return;
      const next: RuntimeEvent[] = conv.turns.map((t) => ({
        id: t.id,
        at: t.at,
        kind: 'runtime.message' as const,
        conversationId: conv.id,
        runId: 'history',
        spanId: t.id,
        payload: { text: t.content, isFinal: true }
      }));
      setEvents(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const activeMeta = useMemo(() => list.find((c) => c.id === activeId) ?? null, [list, activeId]);

  const capabilities: ChatHostCapabilities = useMemo(
    () => ({
      canSendMessage: false,
      canStop: false,
      canRetry: false,
      canCompact: false,
      canApproveTool: false,
      supportsStreaming: false,
      supportsThinking: false,
      supportsFileChanges: false
    }),
    []
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Conversations · {list.length}
        </div>
        <ul className="space-y-0.5 px-2 pb-4">
          {list.map((c) => {
            const anchor = c.anchors[0];
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${active ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                >
                  <span className="truncate font-medium">{c.title ?? c.id.slice(0, 8)}</span>
                  <span className="text-[11px] text-neutral-500">
                    {anchor ? describeAnchor(anchor) : 'no anchor'} · {new Date(c.updatedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-neutral-500">No conversations yet.</li>
          )}
        </ul>
      </aside>
      <main className="flex-1 min-h-0 overflow-hidden">
        {activeMeta ? (
          <div className="flex h-full flex-col">
            <header className="border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
              <div className="font-semibold">{activeMeta.title ?? activeMeta.id}</div>
              <div className="text-xs text-neutral-500">
                {activeMeta.anchors.map(describeAnchor).join(' · ')} · status: {activeMeta.status}
              </div>
            </header>
            <div className="min-h-0 flex-1">
              <ChatView
                conversationId={activeMeta.id}
                capabilities={capabilities}
                events={events}
                isLoading={false}
                onAction={() => undefined}
                welcomeMessage="Read-only history."
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Select a conversation.
          </div>
        )}
      </main>
    </div>
  );
}
