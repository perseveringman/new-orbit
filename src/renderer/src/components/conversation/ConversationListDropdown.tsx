import type { Conversation } from '@shared/conversation';

export function ConversationListDropdown({
  conversations,
  activeId,
  onSelect,
  onNew,
  onArchive
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect(id: string | null): void;
  onNew(): void;
  onArchive?(id: string): void;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <select
        aria-label="Conversation"
        value={activeId ?? ''}
        onChange={(event) => onSelect(event.target.value || null)}
        className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 outline-none focus:border-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        {conversations.length === 0 ? (
          <option value="">No conversations</option>
        ) : (
          conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title ?? 'Untitled'} · {new Date(conversation.updatedAt).toLocaleString()}
            </option>
          ))
        )}
      </select>
      <button type="button" onClick={onNew} className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
        + New
      </button>
      {activeId && onArchive ? (
        <button type="button" onClick={() => onArchive(activeId)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
          Archive
        </button>
      ) : null}
    </div>
  );
}

