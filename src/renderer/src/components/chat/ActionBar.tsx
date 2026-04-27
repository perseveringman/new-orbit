import type { ActionBarItem, ChatHostCapabilities } from '@shared/chat-protocol';

interface ActionBarProps {
  capabilities: ChatHostCapabilities;
  isLoading: boolean;
  items?: ActionBarItem[];
  onStop: () => void;
  onRetry: () => void;
  onCompact: () => void;
}

export function ActionBar({
  capabilities,
  isLoading,
  items,
  onStop,
  onRetry,
  onCompact
}: ActionBarProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/80 px-3 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900/50">
      {capabilities.canStop ? (
        <button
          type="button"
          disabled={!isLoading}
          onClick={onStop}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          Stop
        </button>
      ) : null}
      {capabilities.canRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          Retry
        </button>
      ) : null}
      {capabilities.canCompact ? (
        <button
          type="button"
          onClick={onCompact}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          Compact
        </button>
      ) : null}
      <div className="flex-1" />
      {items?.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={item.onClick}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          {item.label}
        </button>
      ))}
      {isLoading ? (
        <span className="ml-2 inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
          running
        </span>
      ) : null}
    </div>
  );
}
