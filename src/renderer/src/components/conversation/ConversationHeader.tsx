import type { Conversation } from '@shared/conversation';
import type { ReactNode } from 'react';
import { ConversationListDropdown } from './ConversationListDropdown';

export function ConversationHeader({
  conversations,
  activeId,
  activeConversation,
  onSelect,
  onNew,
  onArchive,
  actions
}: {
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  onSelect(id: string | null): void;
  onNew(): void;
  onArchive?(id: string): void;
  actions?: ReactNode;
}): JSX.Element {
  const scope = activeConversation?.scope?.kind ?? 'global';
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-2 py-2 dark:border-neutral-800">
      <div className="min-w-0 flex-1">
        <ConversationListDropdown
          conversations={conversations}
          activeId={activeId}
          onSelect={onSelect}
          onNew={onNew}
          onArchive={onArchive}
        />
        <div className="mt-1 truncate px-1 text-[11px] text-neutral-500">
          Scope: {scope}
          {activeConversation?.currentRunId ? ` · running ${activeConversation.currentRunId}` : ''}
        </div>
      </div>
      {actions}
    </header>
  );
}
