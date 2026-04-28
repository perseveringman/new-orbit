import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationScope } from '@shared/conversation';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import type { ConversationStage } from '@shared/stage';

export const ASK_ANYWHERE_LAST_ACTIVE_ID_KEY = 'ask-anywhere.last-active-id';
export const ASK_ANYWHERE_GLOBAL_SCOPE: ConversationScope = { kind: 'global' };

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

function readLastActiveId(): string | null {
  try {
    return localStorage.getItem(ASK_ANYWHERE_LAST_ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

function writeLastActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ASK_ANYWHERE_LAST_ACTIVE_ID_KEY, id);
    else localStorage.removeItem(ASK_ANYWHERE_LAST_ACTIVE_ID_KEY);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function sortByUpdatedDesc(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isSendMessageAction(action: ChatAction): action is ChatAction<'chat.send_message'> {
  return action.kind === 'chat.send_message';
}

export interface UseAskAnywhereSessionOptions {
  initialActiveId?: string | null;
  enabled?: boolean;
}

export interface UseAskAnywhereSessionResult {
  sessions: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  events: RuntimeEvent[];
  stage: ConversationStage | null;
  isLoading: boolean;
  selectActiveId(id: string | null): void;
  reload(): Promise<void>;
  handleNew(): Promise<Conversation>;
  handleArchive(id: string): Promise<void>;
  handleAction(action: ChatAction): Promise<void>;
  handleArtifactAction(artifactId: string, actionId: string): Promise<void>;
}

export function useAskAnywhereSession(
  options: UseAskAnywhereSessionOptions = {}
): UseAskAnywhereSessionResult {
  const { enabled = true, initialActiveId = null } = options;
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => initialActiveId ?? readLastActiveId()
  );
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [stage, setStage] = useState<ConversationStage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeIdRef = useRef<string | null>(activeId);

  const selectActiveId = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
    writeLastActiveId(id);
    if (id) void window.orbit.chat.setLastActiveConversation(ASK_ANYWHERE_GLOBAL_SCOPE, id);
  }, []);

  useEffect(() => {
    if (!initialActiveId) return;
    selectActiveId(initialActiveId);
  }, [initialActiveId, selectActiveId]);

  const reload = useCallback(async () => {
    const list = await window.orbit.chat.listConversations();
    const askOnly = list.filter((c) => !c.archived && c.anchors.some((a) => a.kind === 'ask_anywhere_session'));
    const full = await Promise.all(askOnly.map((meta) => window.orbit.chat.getConversation(meta.id)));
    const conversations = sortByUpdatedDesc(full.filter((c): c is Conversation => c !== null));
    setSessions(conversations);

    const ids = new Set(conversations.map((conv) => conv.id));
    const current = activeIdRef.current;
    if (current && ids.has(current)) return;

    const serverLast = await window.orbit.chat.getLastActiveConversation(ASK_ANYWHERE_GLOBAL_SCOPE).catch(() => null);
    const remembered = readLastActiveId();
    const fallback =
      serverLast && ids.has(serverLast.id)
        ? serverLast.id
        : remembered && ids.has(remembered)
          ? remembered
          : conversations[0]?.id ?? null;
    selectActiveId(fallback);
  }, [selectActiveId]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || !activeId) {
      setEvents([]);
      setStage(null);
      setIsLoading(false);
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
  }, [activeId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const off = window.orbit.chat.onRuntimeEvent((event) => {
      if (event.conversationId !== activeIdRef.current) return;
      setEvents((current) => [...current, event]);
      if (event.kind === 'runtime.done' || event.kind === 'runtime.error') {
        setIsLoading(false);
        void reload();
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
  }, [enabled, reload]);

  const handleNew = useCallback(async () => {
    const conv = await window.orbit.chat.createConversation({
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `ask-${Date.now()}`,
        addedAt: new Date().toISOString()
      },
      scope: ASK_ANYWHERE_GLOBAL_SCOPE,
      title: 'Ask Anywhere',
      runtimeHint: 'claude'
    });
    selectActiveId(conv.id);
    await reload();
    return conv;
  }, [reload, selectActiveId]);

  const handleArchive = useCallback(async (id: string) => {
    await window.orbit.chat.archiveConversation(id);
    if (activeIdRef.current === id) {
      selectActiveId(null);
    }
    await reload();
  }, [reload, selectActiveId]);

  const handleArtifactAction = useCallback(
    async (artifactId: string, actionId: string) => {
      if (!activeIdRef.current) return;
      const conversationId = activeIdRef.current;
      await window.orbit.stage.execAction(conversationId, artifactId, actionId);
      setStage(await window.orbit.stage.get(conversationId));
    },
    []
  );

  const handleAction = useCallback(async (action: ChatAction) => {
    if (!activeIdRef.current) return;
    if (isSendMessageAction(action)) {
      const text = action.payload.text.trim();
      if (!text) return;
      const localId = `local-user-${Date.now()}`;
      setEvents((current) => [
        ...current,
        {
          id: localId,
          at: new Date().toISOString(),
          kind: 'runtime.message',
          conversationId: action.conversationId,
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
    await window.orbit.chat.sendAction(action);
  }, []);

  const activeConversation = sessions.find((conv) => conv.id === activeId) ?? null;

  return {
    sessions,
    activeId,
    activeConversation,
    events,
    stage,
    isLoading,
    selectActiveId,
    reload,
    handleNew,
    handleArchive,
    handleAction,
    handleArtifactAction
  };
}
