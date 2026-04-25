import type { InboxItem, LibraryArticlePayload } from '@shared/inbox';

export function LibraryArticleRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = item.payload as LibraryArticlePayload;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Library</p>
        <h2 className="mt-2 text-xl font-semibold">{payload.title ?? item.title}</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{item.summary}</p>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-medium">Reader placeholder</p>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Article extraction and the full reader backend are deferred. This item preserves the URL,
          source note and reading metadata for the Capture foundation.
        </p>
        <a className="mt-3 block break-all text-sm text-sky-600 dark:text-sky-300" href={payload.url}>
          {payload.url}
        </a>
      </div>
    </div>
  );
}
