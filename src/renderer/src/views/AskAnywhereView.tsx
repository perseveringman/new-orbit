/**
 * AskAnywhereView — Ask-Anywhere 主视图（M6 / P0）。
 *
 * 行为：
 *  - 通过 chat.listConversations 列出 ask_anywhere_session 会话
 *  - 选中会话后从持久化 turns 重建初始 RuntimeEvent 流，挂载 ChatView
 *  - 用户发送消息：
 *      a) 立刻追加一条本地 user RuntimeEvent（乐观渲染）
 *      b) 调用 chat.sendAction → main 端 AskAnywhereOrchestrator 调度 Claude
 *      c) 通过 onRuntimeEvent 接收 assistant 流式输出
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation } from '@shared/conversation';
import { ChatView } from '../components/chat/ChatView';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import type { ConversationStage } from '@shared/stage';
import { StagePanel } from './ask-anywhere/StagePanel';
import { ContextPanel } from './ask-anywhere/ContextPanel';

function turnsToEvents(conv: Conversation): RuntimeEvent[] {
  return conv.turns.map((t, idx) => ({
    id: `turn-${t.id}`,
    at: t.at,
    kind: 'runtime.message',
    conversationId: conv.id,
    runId: `hist-${conv.id}`,
    spanId: `hist-${idx}`,
    payload: {
      text: t.content,
      role: t.role === 'user' ? 'user' : 'assistant',
      isFinal: true
    }
  }));
}

export function AskAnywhereView(): JSX.Element {
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [stage, setStage] = useState<ConversationStage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const reload = useCallback(async () => {
    const list = await window.orbit.chat.listConversations();
    const askOnly = list.filter((c) => c.anchors.some((a) => a.kind === 'ask_anywhere_session'));
    // listConversations returns ConversationMeta; load full conversations for sidebar quickness
    const full = await Promise.all(
      askOnly.map((meta) => window.orbit.chat.getConversation(meta.id))
    );
    const conversations = full.filter((c): c is Conversation => c !== null);
    setSessions(conversations);
    if (!activeIdRef.current && conversations.length > 0) setActiveId(conversations[0].id);
  }, []);

  // hydrate selected conversation from persisted turns
  useEffect(() => {
    if (!activeId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void window.orbit.chat.getConversation(activeId).then((conv) => {
      if (cancelled || !conv) return;
      setEvents(turnsToEvents(conv));
      setIsLoading(Boolean(conv.currentRunId));
    });
    void window.orbit.stage.get(activeId).then((next) => {
      if (!cancelled) setStage(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    void reload();
    const off = window.orbit.chat.onRuntimeEvent((event) => {
      if (event.conversationId !== activeIdRef.current) return;
      setEvents((current) => [...current, event]);
      if (event.kind === 'runtime.done' || event.kind === 'runtime.error') {
        setIsLoading(false);
        if (activeIdRef.current) {
          void window.orbit.stage.get(activeIdRef.current).then(setStage);
        }
      }
    });
    const offStage = window.orbit.stage.onEvent((next) => {
      if (next.conversation_id === activeIdRef.current) setStage(next);
    });
    return () => {
      off();
      offStage();
    };
  }, [reload]);

  async function handleNew(): Promise<void> {
    const conv = await window.orbit.chat.createConversation({
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `ask-${Date.now()}`,
        addedAt: new Date().toISOString()
      },
      title: 'Ask Anywhere',
      runtimeHint: 'claude'
    });
    setActiveId(conv.id);
    await reload();
  }

  async function handleArtifactAction(artifactId: string, actionId: string): Promise<void> {
    if (!activeId) return;
    await window.orbit.stage.execAction(activeId, artifactId, actionId);
    setStage(await window.orbit.stage.get(activeId));
  }

  const activeConversation = sessions.find((conv) => conv.id === activeId) ?? null;

  async function handleAction(action: ChatAction): Promise<void> {
    if (!activeId) return;
    if (action.kind === 'chat.send_message') {
      const payload = action.payload as { text: string };
      const text = payload.text.trim();
      if (!text) return;
      const localId = `local-user-${Date.now()}`;
      // 乐观追加用户消息
      setEvents((current) => [
        ...current,
        {
          id: localId,
          at: new Date().toISOString(),
          kind: 'runtime.message',
          conversationId: activeId,
          runId: 'local',
          spanId: localId,
          payload: { text, role: 'user', isFinal: true }
        }
      ]);
      setIsLoading(true);
      try {
        await window.orbit.chat.sendAction(action);
      } catch (err) {
        setIsLoading(false);
        // 错误已由 main 端 emit synthetic runtime.error
        console.warn('sendAction failed', err);
      }
      return;
    }
    if (action.kind === 'chat.stop') {
      try {
        await window.orbit.chat.sendAction(action);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    // 其它 action 暂统一转交 main（main 会忽略未实现 kind）
    await window.orbit.chat.sendAction(action).catch(() => undefined);
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
      <ContextPanel conversation={activeConversation} />
      <section className="flex min-w-0 flex-1 flex-col">
        {activeId ? (
          <ChatView
            conversationId={activeId}
            capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
            events={events}
            isLoading={isLoading}
            onAction={(action) => void handleAction(action)}
            welcomeMessage="Ask anything. Each session persists as a conversation."
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            Select or create a session to start.
          </div>
        )}
      </section>
      {activeId ? <StagePanel stage={stage} onAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)} /> : null}
    </div>
  );
}
