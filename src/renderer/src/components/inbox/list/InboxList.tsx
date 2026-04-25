import type { InboxItem } from '@shared/inbox';

interface InboxListProps {
  items: InboxItem[];
  selectedId: string | null;
  onSelect(item: InboxItem): void;
}

export function InboxList({ items, selectedId, onSelect }: InboxListProps): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        Nothing needs attention here yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2 overflow-auto pr-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              selectedId === item.id
                ? 'border-sky-400 bg-sky-50 shadow-sm dark:border-sky-700 dark:bg-sky-950/30'
                : 'border-neutral-200 bg-white/80 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {item.subtype}
              </span>
              <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-500 dark:border-neutral-700">
                {item.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {item.title}
            </div>
            {item.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                {item.summary}
              </p>
            )}
            <p className="mt-2 text-[11px] text-neutral-400">
              {new Date(item.created_at).toLocaleString()}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
