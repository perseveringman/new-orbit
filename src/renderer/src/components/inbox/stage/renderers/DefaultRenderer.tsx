import type { InboxItem } from '@shared/inbox';

export function DefaultRenderer({ item }: { item: InboxItem }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{item.subtype}</p>
      <h2 className="mt-2 text-lg font-semibold">{item.title}</h2>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{item.summary}</p>
      <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-neutral-100 p-3 text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
        {JSON.stringify(item.payload, null, 2)}
      </pre>
    </div>
  );
}
