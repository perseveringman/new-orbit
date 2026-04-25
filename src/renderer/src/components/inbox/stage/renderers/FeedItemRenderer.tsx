import type { FeedItemPayload, InboxItem } from '@shared/inbox';
import { useFiles } from '../../../../store/files';

export function FeedItemRenderer({ item }: { item: InboxItem }): JSX.Element {
  const payload = item.payload as FeedItemPayload;
  const toast = useFiles((state) => state.toast);

  async function save(): Promise<void> {
    await window.orbit.capture.feed.saveToLibrary(item.id);
    toast('Saved feed item to Library');
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Feed · {payload.source}</p>
        <h2 className="mt-2 text-xl font-semibold">{payload.article_title}</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{payload.article_excerpt}</p>
      </div>
      <a className="block break-all text-sm text-sky-600 dark:text-sky-300" href={payload.article_url}>
        {payload.article_url}
      </a>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Save to Library
      </button>
    </div>
  );
}
