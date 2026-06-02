import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import type { Conversation } from '@shared/conversation';
import { conversationScopeKey } from '@shared/conversation';
import type { EvidenceSelector } from '@shared/evidence';
import type {
  ComposerOptions,
  ComposerSkillOption,
  ComposerSourceSurface,
  RuntimeSelection
} from '@shared/ai-composer';
import type { RecallResult } from '@shared/memory';
import type { ConversationStage } from '@shared/stage';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { patchFromSelection, selectionFromConversation, useRuntimeCatalog } from '../ai-composer';
import { ConversationHeader } from './ConversationHeader';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { MessageTimeline } from './MessageTimeline';
import { ArtifactStage } from './ArtifactStage';
import { PMILContextChips, contextPacketFromArtifact } from './PMILContextPanel';
import { EvidenceReference, evidenceSelectorKey } from '../evidence/EvidenceReference';
import type { ContextPacket } from '@shared/context';

export function ConversationShell({
  conversations,
  activeId,
  activeConversation,
  events,
  stage,
  isLoading,
  variant = 'full',
  onSelect,
  onNew,
  onArchive,
  onAction,
  onArtifactAction,
  actions,
  contextSlot,
  messageMaxWidthClass,
  eventMaxWidthClass,
  composerSourceSurface = 'ask_full',
  welcomeMessage
}: {
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  events: RuntimeEvent[];
  stage: ConversationStage | null;
  isLoading: boolean;
  variant?: 'compact' | 'full';
  onSelect(id: string | null): void;
  onNew(): void;
  onArchive?(id: string): void;
  onAction(action: ChatAction): void;
  onArtifactAction(artifactId: string, actionId: string): void;
  actions?: ReactNode;
  contextSlot?: ReactNode;
  messageMaxWidthClass?: string;
  eventMaxWidthClass?: string;
  composerSourceSurface?: ComposerSourceSurface;
  welcomeMessage?: string;
}): JSX.Element {
  const showStage = variant === 'full';
  const runtimeCatalog = useRuntimeCatalog();
  const [pendingSelection, setPendingSelection] = useState<RuntimeSelection | null>(null);
  const [skillOptions, setSkillOptions] = useState<ComposerSkillOption[]>([]);
  const capabilities = {
    ...DEFAULT_CHAT_HOST_CAPABILITIES,
    canApproveTool: true
  };
  const composerSelection = useMemo(
    () =>
      pendingSelection ??
      selectionFromConversation(activeConversation, runtimeCatalog.options.defaultSelection),
    [activeConversation, pendingSelection, runtimeCatalog.options.defaultSelection]
  );
  const skillScope = useMemo(
    () => activeConversation?.scope ?? { kind: 'global' as const },
    [activeConversation?.scope]
  );
  const skillScopeKey = conversationScopeKey(skillScope);
  const composerOptions = useMemo<ComposerOptions>(
    () => ({ ...runtimeCatalog.options, skills: skillOptions }),
    [runtimeCatalog.options, skillOptions]
  );
  const citationPackets = useMemo(() => {
    return (stage?.artifacts ?? [])
      .map((artifact) => {
        const packet = contextPacketFromArtifact(artifact);
        return packet ? { packet, createdAt: artifact.created_at } : null;
      })
      .filter((item): item is { packet: ContextPacket; createdAt: string } => item !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [stage?.artifacts]);
  const renderMarkdownReferenceToken = useCallback(
    (token: { handle: string }, key: string, event: RuntimeEvent<'runtime.message'>) => {
      const selector = selectorForCitationHandle(
        token.handle,
        packetForEvent(citationPackets, event)
      );
      if (!selector) return null;
      return (
        <EvidenceReference
          key={`${key}:${evidenceSelectorKey(selector)}`}
          selector={selector}
          tone="sky"
          variant="inline"
        />
      );
    },
    [citationPackets]
  );
  const renderMarkdownLink = useCallback(
    (
      token: { href: string; label: string },
      key: string,
      event: RuntimeEvent<'runtime.message'>
    ) => {
      const handle = evidenceHandleFromHref(token.href);
      if (!handle) return null;
      const selector = selectorForCitationHandle(handle, packetForEvent(citationPackets, event));
      if (!selector) return null;
      return (
        <EvidenceReference
          key={`${key}:${evidenceSelectorKey(selector)}`}
          label={token.label}
          selector={selector}
          tone="sky"
          variant="inline"
        />
      );
    },
    [citationPackets]
  );
  const handleComposerSelectionChange = useCallback(
    (selection: RuntimeSelection) => {
      setPendingSelection(selection);
      if (!activeId) return;
      void window.orbit.chat.updateConversation(
        activeId,
        patchFromSelection(selection, runtimeCatalog.options)
      );
    },
    [activeId, runtimeCatalog.options]
  );

  useEffect(() => {
    setPendingSelection(null);
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;
    void window.orbit.skills
      .list(skillScope)
      .then((snapshot) => {
        if (cancelled) return;
        setSkillOptions(
          snapshot.skills
            .filter(
              (skill) =>
                skill.effective &&
                (skill.scopes.length === 0 || skill.scopes.includes(skillScope.kind))
            )
            .map(
              (skill): ComposerSkillOption => ({
                id: skill.name,
                label: skill.name,
                description: skill.description,
                source: skill.source,
                disabled: Boolean(skill.disabledReason),
                ...(skill.disabledReason ? { disabledReason: skill.disabledReason } : {})
              })
            )
        );
      })
      .catch(() => {
        if (!cancelled) setSkillOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [skillScope, skillScopeKey]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        conversations={conversations}
        activeId={activeId}
        activeConversation={activeConversation}
        onSelect={onSelect}
        onNew={onNew}
        onArchive={onArchive}
        actions={actions}
      />
      <RuntimeStatusBar conversation={activeConversation} events={events} isLoading={isLoading} />
      {contextSlot}
      {activeConversation ? <MemoryRecallChips conversation={activeConversation} /> : null}
      {activeConversation ? <PMILContextChips stage={stage} /> : null}
      {activeId ? (
        <div
          className={
            showStage ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]' : 'min-h-0 flex-1'
          }
        >
          <MessageTimeline
            conversationId={activeId}
            capabilities={capabilities}
            events={events}
            isLoading={isLoading}
            onAction={onAction}
            welcomeMessage={welcomeMessage}
            messageMaxWidthClass={messageMaxWidthClass}
            eventMaxWidthClass={eventMaxWidthClass}
            composerOptions={composerOptions}
            composerSelection={composerSelection}
            composerSourceSurface={composerSourceSurface}
            onComposerSelectionChange={handleComposerSelectionChange}
            renderMarkdownReferenceToken={renderMarkdownReferenceToken}
            renderMarkdownLink={renderMarkdownLink}
          />
          {showStage ? <ArtifactStage stage={stage} onAction={onArtifactAction} /> : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-neutral-500">
          <p>暂无对话。</p>
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
          >
            + 新建对话
          </button>
        </div>
      )}
    </div>
  );
}

function packetForEvent(
  packets: Array<{ packet: ContextPacket; createdAt: string }>,
  event: RuntimeEvent<'runtime.message'>
): ContextPacket | null {
  if (!packets.length) return null;
  const eventTime = Date.parse(event.at);
  if (Number.isNaN(eventTime)) return packets.at(-1)?.packet ?? null;
  let selected: ContextPacket | null = null;
  for (const item of packets) {
    const createdAt = Date.parse(item.createdAt);
    if (!Number.isNaN(createdAt) && createdAt <= eventTime) selected = item.packet;
  }
  return selected ?? packets.at(-1)?.packet ?? null;
}

function selectorForCitationHandle(
  handle: string,
  packet: ContextPacket | null
): EvidenceSelector | null {
  const match = /^E(\d+)$/i.exec(handle.trim());
  if (!match?.[1] || !packet) return null;
  const index = Number(match[1]) - 1;
  return packet.evidence[index] ?? null;
}

function evidenceHandleFromHref(href: string): string | null {
  const match = /^orbit-evidence:(?:\/\/)?(.+)$/i.exec(href.trim());
  if (!match?.[1]) return null;
  const body = decodeURIComponent(match[1].replace(/^\/+/, ''));
  const handle = /([A-Za-z]\d+)/.exec(body)?.[1];
  return handle ? handle.toUpperCase() : null;
}

function MemoryRecallChips({ conversation }: { conversation: Conversation }): JSX.Element | null {
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [hidden, setHidden] = useState(false);
  const query = [conversation.title, conversation.summary, conversation.turns.at(-1)?.content]
    .filter(Boolean)
    .join('\n');

  useEffect(() => {
    let cancelled = false;
    setHidden(false);
    if (!query.trim()) {
      setRecall(null);
      return;
    }
    void window.orbit.memory
      .recall(query, {
        max_memories: 3,
        min_confidence: 0.55,
        triggered_by: { kind: 'ask', ref: conversation.id },
        used_in: 'context_injection'
      })
      .then((result) => {
        if (!cancelled) setRecall(result);
      })
      .catch(() => {
        if (!cancelled) setRecall(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, query]);

  if (hidden || !recall?.memories.length) return null;
  return (
    <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">相关记忆（{recall.memories.length}）</span>
        {recall.memories.map((memory) => {
          const match = recall.matches.find((item) => item.memory_id === memory.id);
          return (
            <span
              key={memory.id}
              title={match?.reasons.join(' · ') ?? recall.explanation}
              className="rounded-full border border-violet-300 px-2 py-1 dark:border-violet-800"
            >
              {memory.layer}: {memory.title}
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="ml-auto text-violet-600 hover:text-violet-800 dark:text-violet-300"
        >
          隐藏记忆
        </button>
      </div>
    </div>
  );
}
