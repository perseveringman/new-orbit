import type { Conversation } from '@shared/conversation';

export function RuntimeStatusBar({ conversation, isLoading }: { conversation: Conversation | null; isLoading: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-white/60 px-3 py-1 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40">
      <span>{isLoading ? 'Streaming…' : 'Idle'}</span>
      <span>·</span>
      <span>{conversation?.runtimeHint ?? 'auto runtime'}</span>
      {conversation?.scope ? (
        <>
          <span>·</span>
          <span>{conversation.scope.kind}</span>
        </>
      ) : null}
    </div>
  );
}

