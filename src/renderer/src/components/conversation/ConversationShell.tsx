import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import type { Conversation } from '@shared/conversation';
import type { ConversationStage } from '@shared/stage';
import type { ReactNode } from 'react';
import { ConversationHeader } from './ConversationHeader';
import { RuntimeStatusBar } from './RuntimeStatusBar';
import { MessageTimeline } from './MessageTimeline';
import { ArtifactStage } from './ArtifactStage';

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
  welcomeMessage?: string;
}): JSX.Element {
  const showStage = variant === 'full';
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
      {activeId ? (
        <div className={showStage ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]' : 'min-h-0 flex-1'}>
          <MessageTimeline
            conversationId={activeId}
            capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
            events={events}
            isLoading={isLoading}
            onAction={onAction}
            welcomeMessage={welcomeMessage}
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
