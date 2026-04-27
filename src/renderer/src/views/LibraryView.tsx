import { useEffect, useState } from 'react';
import type { InboxItem, LibraryArticlePayload } from '@shared/inbox';

export function LibraryView(): JSX.Element {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [url, setUrl] = useState('');
  const [active, setActive] = useState<InboxItem | null>(null);
  const [content, setContent] = useState('');

  async function reload(): Promise<void> {
    const list = await window.orbit.capture.library.list();
    setItems(list);
    if (!active && list[0]) setActive(list[0]);
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!active) {
      setContent('');
      return;
    }
    void window.orbit.capture.library.readContent(active.id).then(setContent);
  }, [active?.id]);

  async function add(): Promise<void> {
    if (!url.trim()) return;
    const item = await window.orbit.capture.library.save({ url: url.trim(), source: 'manual', actor: 'user' });
    setUrl('');
    setActive(item);
    await reload();
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Library</h1>
        <p className="text-xs text-neutral-500">Input layer · articles, bookmarks, reading queue</p>
        <div className="mt-4 flex gap-2">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
          <button onClick={() => void add()} className="rounded bg-sky-600 px-2 py-1 text-xs text-white">Add</button>
        </div>
        <div className="mt-4 space-y-1">
          {items.map((item) => {
            const payload = item.payload as LibraryArticlePayload;
            return (
              <button key={item.id} onClick={() => setActive(item)} className={`w-full rounded px-3 py-2 text-left text-sm ${active?.id === item.id ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'}`}>
                <div className="truncate font-medium">{item.title}</div>
                <div className="truncate text-[11px] text-neutral-500">{payload.url}</div>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        {active ? (
          <>
            <h2 className="text-xl font-semibold">{active.title}</h2>
            <p className="mt-1 text-xs text-neutral-500">{active.status}</p>
            <pre className="mt-6 whitespace-pre-wrap rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">{content}</pre>
          </>
        ) : (
          <div className="text-sm text-neutral-500">Add or select a Library item.</div>
        )}
      </section>
    </div>
  );
}

