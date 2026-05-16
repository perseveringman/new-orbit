import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import type { Conversation } from '@shared/conversation';
import type { ComposerSourceSurface, RuntimeSelection } from '@shared/ai-composer';
import type { RecallResult } from '@shared/memory';
import type { ConversationStage } from '@shared/stage';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  patchFromSelection,
  selectionFromConversation,
  useRuntimeCatalog
} from '../ai-composer';
import { ConversationHeader } from './ConversationHeader';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { MessageTimeline } from './MessageTimeline';
import { ArtifactStage } from './ArtifactStage';
import { PMILContextChips } from './PMILContextPanel';

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
  composerSourceSurface?: ComposerSourceSurface;
  welcomeMessage?: string;
}): JSX.Element {
  const showStage = variant === 'full';
  const runtimeCatalog = useRuntimeCatalog();
  const [pendingSelection, setPendingSelection] = useState<RuntimeSelection | null>(null);
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
      <RuntimeStatusBar conversation={activeConversation} isLoading={isLoading} />
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
            composerOptions={runtimeCatalog.options}
            composerSelection={composerSelection}
            composerSourceSurface={composerSourceSurface}
            onComposerSelectionChange={handleComposerSelectionChange}
          />
          {showStage ? <ArtifactStage stage={stage} onAction={onArtifactAction} /> : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-neutral-500">
          <p>No conversations yet.</p>
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
          >
            + New conversation
          </button>
        </div>
      )}
    </div>
  );
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
        <span className="font-medium">Relevant memory ({recall.memories.length})</span>
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
          Hide memory
        </button>
      </div>
    </div>
  );
}
