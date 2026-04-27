import { useEffect, useState } from 'react';
import type { FeedSubscription } from '@shared/capture';
import type { InboxItem, FeedItemPayload } from '@shared/inbox';

export function FeedView(): JSX.Element {
  const [sources, setSources] = useState<FeedSubscription[]>([]);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [url, setUrl] = useState('');

  async function reload(): Promise<void> {
    const [subs, pending] = await Promise.all([
      window.orbit.capture.feed.listSubscriptions(),
      window.orbit.capture.feed.listPending()
    ]);
    setSources(subs);
    setItems(pending);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addSource(): Promise<void> {
    if (!url.trim()) return;
    await window.orbit.capture.feed.addSubscription({ url: url.trim() });
    setUrl('');
    await reload();
  }

  async function refresh(): Promise<void> {
    await window.orbit.capture.feed.refresh();
    await reload();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Feeds</h1>
            <p className="text-xs text-neutral-500">{sources.length} sources · {items.length} pending items</p>
          </div>
          <button onClick={() => void refresh()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Refresh all</button>
        </div>
        <div className="mt-3 flex max-w-xl gap-2">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="RSS URL" className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
          <button onClick={() => void addSource()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">Add source</button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] overflow-hidden">
        <aside className="overflow-y-auto border-r border-neutral-200 p-3 dark:border-neutral-800">
          {sources.map((source) => (
            <div key={source.id} className="rounded-lg px-3 py-2 text-sm">
              <div className="font-medium">{source.title}</div>
              <div className="truncate text-[11px] text-neutral-500">{source.url}</div>
            </div>
          ))}
        </aside>
        <main className="overflow-y-auto p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => {
              const payload = item.payload as FeedItemPayload;
              return (
                <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="font-medium">{payload.article_title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300">{payload.article_excerpt}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void window.orbit.capture.feed.saveToLibrary(item.id).then(reload)} className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">Save</button>
                    <button onClick={() => void window.orbit.capture.feed.fadeOut(item.id).then(reload)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">Dismiss</button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

