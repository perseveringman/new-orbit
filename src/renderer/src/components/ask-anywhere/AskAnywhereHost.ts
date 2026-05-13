import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationScope } from '@shared/conversation';
import { conversationScopeKey } from '@shared/conversation';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import type { Proposal } from '@shared/approval';
import type { ConversationStage } from '@shared/stage';
import { conversationTurnsToRuntimeEvents } from '../chat/historyEvents';

export const ASK_ANYWHERE_LAST_ACTIVE_ID_KEY = 'ask-anywhere.last-active-id';
export const ASK_ANYWHERE_GLOBAL_SCOPE: ConversationScope = { kind: 'global' };

/**
 * 把历史 turns 翻译成 RuntimeEvent 序列供 ChatView 渲染。
 *
 * Phase E.2.1：assistant turn 的 toolTrace 先展开为 runtime.tool_use + runtime.tool_result
 * 事件（与实时流同构，ToolCard 能正确配对渲染），再产出 assistant text 的 runtime.message。
 * 这保证关闭对话再打开时历史 ToolCard 不丢失。
 */
export function turnsToEvents(conv: Conversation): RuntimeEvent[] {
  return conversationTurnsToRuntimeEvents(conv);
}

function scopedLastActiveIdKey(scopeKey: string): string {
  return scopeKey === 'global'
    ? ASK_ANYWHERE_LAST_ACTIVE_ID_KEY
    : `${ASK_ANYWHERE_LAST_ACTIVE_ID_KEY}:${scopeKey}`;
}

function readLastActiveId(scopeKey = 'global'): string | null {
  try {
    return localStorage.getItem(scopedLastActiveIdKey(scopeKey));
  } catch {
    return null;
  }
}

function writeLastActiveId(id: string | null, scopeKey = 'global'): void {
  try {
    const key = scopedLastActiveIdKey(scopeKey);
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
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
  scope?: ConversationScope;
  title?: string;
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
  const { enabled = true, initialActiveId = null, scope, title = 'Ask Anywhere' } = options;
  const sessionScope = scope ?? ASK_ANYWHERE_GLOBAL_SCOPE;
  const scopeKey = conversationScopeKey(sessionScope);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => initialActiveId ?? readLastActiveId(scopeKey)
  );
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [stage, setStage] = useState<ConversationStage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeIdRef = useRef<string | null>(activeId);

  const selectActiveId = useCallback(
    (id: string | null) => {
      activeIdRef.current = id;
      setActiveId(id);
      writeLastActiveId(id, scopeKey);
      if (id) void window.orbit.chat.setLastActiveConversation(sessionScope, id);
    },
    [scopeKey, sessionScope]
  );

  useEffect(() => {
    if (!initialActiveId) return;
    selectActiveId(initialActiveId);
  }, [initialActiveId, selectActiveId]);

  useEffect(() => {
    if (initialActiveId) return;
    const remembered = readLastActiveId(scopeKey);
    activeIdRef.current = remembered;
    setActiveId(remembered);
    setEvents([]);
    setStage(null);
    setIsLoading(false);
  }, [initialActiveId, scopeKey]);

  const reload = useCallback(async () => {
    const list = await window.orbit.chat.listConversations();
    const askOnly = list.filter((c) => {
      const conversationKey = conversationScopeKey(c.scope ?? ASK_ANYWHERE_GLOBAL_SCOPE);
      return (
        !c.archived &&
        (!scope || conversationKey === scopeKey) &&
        c.anchors.some((a) => a.kind === 'ask_anywhere_session')
      );
    });
    const full = await Promise.all(
      askOnly.map((meta) => window.orbit.chat.getConversation(meta.id))
    );
    const conversations = sortByUpdatedDesc(full.filter((c): c is Conversation => c !== null));
    setSessions(conversations);

    const ids = new Set(conversations.map((conv) => conv.id));
    const current = activeIdRef.current;
    if (current && ids.has(current)) return;

    const serverLast = await window.orbit.chat
      .getLastActiveConversation(sessionScope)
      .catch(() => null);
    const remembered = readLastActiveId(scopeKey);
    const fallback =
      serverLast && ids.has(serverLast.id)
        ? serverLast.id
        : remembered && ids.has(remembered)
          ? remembered
          : (conversations[0]?.id ?? null);
    selectActiveId(fallback);
  }, [scope, scopeKey, selectActiveId, sessionScope]);

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
    void (async () => {
      const conv = await window.orbit.chat.getConversation(activeId);
      if (cancelled || !conv) return;
      const pendingApprovals = await pendingProposalEventsForConversation(activeId).catch(() => []);
      if (cancelled) return;
      setEvents([...turnsToEvents(conv), ...pendingApprovals]);
      setIsLoading(Boolean(conv.currentRunId));
    })();
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

  useEffect(() => {
    if (!enabled) return;
    const off = window.orbit.approval.onEvent((event) => {
      const runtimeEvent = proposalToRuntimeEvent(event.proposal, activeIdRef.current);
      if (!runtimeEvent) return;
      setEvents((current) => [...current, runtimeEvent]);
    });
    return () => {
      off();
    };
  }, [enabled]);

  const handleNew = useCallback(async () => {
    const conv = await window.orbit.chat.createConversation({
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `ask-${scopeKey}-${Date.now()}`,
        addedAt: new Date().toISOString()
      },
      scope: sessionScope,
      title,
      runtimeHint: 'claude'
    });
    selectActiveId(conv.id);
    await reload();
    return conv;
  }, [reload, sessionScope, scopeKey, selectActiveId, title]);

  const handleArchive = useCallback(
    async (id: string) => {
      await window.orbit.chat.archiveConversation(id);
      if (activeIdRef.current === id) {
        selectActiveId(null);
      }
      await reload();
    },
    [reload, selectActiveId]
  );

  const handleArtifactAction = useCallback(async (artifactId: string, actionId: string) => {
    if (!activeIdRef.current) return;
    const conversationId = activeIdRef.current;
    await window.orbit.stage.execAction(conversationId, artifactId, actionId);
    setStage(await window.orbit.stage.get(conversationId));
  }, []);

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

async function pendingProposalEventsForConversation(
  conversationId: string
): Promise<RuntimeEvent<'runtime.awaiting_user'>[]> {
  const proposals = await window.orbit.approval.list({
    status: 'pending',
    includeArchived: false
  });
  return proposals
    .map((proposal) => proposalToRuntimeEvent(proposal, conversationId))
    .filter((event): event is RuntimeEvent<'runtime.awaiting_user'> => event !== null);
}

function proposalToRuntimeEvent(
  proposal: Proposal,
  activeConversationId: string | null
): RuntimeEvent<'runtime.awaiting_user'> | null {
  const payload = asRecord(proposal.payload);
  const conversationId = stringValue(payload['conversation_id']);
  if (!conversationId || conversationId !== activeConversationId) return null;
  const runId = stringValue(payload['run_id']) ?? proposal.submitted_by_agent_run ?? 'approval';
  const parentSpanId = stringValue(payload['tool_use_id']);
  const targetPath = stringValue(payload['target_path']);
  const requestedTarget = stringValue(payload['requested_target']);
  const pathKind = payload['path_kind'] === 'directory' ? 'directory' : 'file';
  return {
    id: `approval-sync-${proposal.id}-${proposal.status}-${proposal.resolved_at ?? proposal.submitted_at}`,
    at: proposal.resolved_at ?? proposal.submitted_at,
    kind: 'runtime.awaiting_user',
    conversationId,
    runId,
    spanId: proposal.id,
    ...(parentSpanId ? { parentSpanId } : {}),
    payload: {
      kind: proposal.type,
      status: proposal.status,
      proposalId: proposal.id,
      title: proposalTitle(proposal, payload),
      hint: hintForProposalStatus(proposal, payload),
      ...(proposal.inbox_item_id ? { inboxItemId: proposal.inbox_item_id } : {}),
      ...(proposal.chat_card_id ? { chatCardId: proposal.chat_card_id } : {}),
      ...(targetPath ? { targetPath } : {}),
      ...(requestedTarget ? { requestedTarget } : {}),
      ...(proposal.type === 'external_path_access' ? { pathKind } : {})
    }
  };
}

function proposalTitle(proposal: Proposal, payload: Record<string, unknown>): string {
  if (proposal.type === 'external_path_access') {
    return stringValue(payload['title']) ?? 'Allow external path read?';
  }
  if (proposal.type === 'new_task') {
    return `Approve task: ${stringValue(payload['title']) ?? proposal.subject}`;
  }
  return proposal.subject;
}

function hintForProposalStatus(
  proposal: Proposal,
  payload: Record<string, unknown>
): string {
  if (proposal.status === 'approved') return 'Approved. Inbox will update automatically.';
  if (proposal.status === 'rejected') return 'Rejected. Inbox will update automatically.';
  if (proposal.status === 'dismissed') return 'Dismissed. Inbox will update automatically.';
  if (proposal.type === 'external_path_access') return 'Approve in this chat or Inbox to continue.';
  const detail = stringValue(payload['description']) ?? stringValue(payload['summary']);
  const action =
    proposal.type === 'new_task'
      ? 'Approve here or in Inbox to create this task.'
      : 'Approve here or in Inbox to continue.';
  return [detail, action].filter(Boolean).join('\n\n');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
