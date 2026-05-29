import { useEffect, useMemo, useState } from 'react';
import type { LibraryItem, LibraryKind, LibraryStatus } from '@shared/library';
import {
  LIBRARY_ITEM_DRAG_MIME,
  LibrarySpatialReader,
  makeLibraryDragPayload
} from '../components/spatial-reader';

const STATUSES: Array<LibraryStatus | 'all'> = ['all', 'saved', 'reading', 'read', 'distilled', 'archived'];

export function LibraryView(): JSX.Element {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [allItems, setAllItems] = useState<LibraryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<LibraryStatus | 'all'>('all');
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = allItems.find((item) => item.frontmatter.id === activeId) ?? items.find((item) => item.frontmatter.id === activeId) ?? null;
  const activeForReader = allItems.find((item) => item.frontmatter.id === activeId) ?? null;

  async function reload(): Promise<void> {
    const visibleFilter = statusToFilter(status);
    const [nextAll, nextVisible] = await Promise.all([
      window.orbit.library.list({ include_archived: true }),
      window.orbit.library.list(visibleFilter)
    ]);
    setAllItems(nextAll);
    setItems(status === 'all' ? nextAll : nextVisible);
    if (!activeId) {
      setActiveId((status === 'all' ? nextAll : nextVisible)[0]?.frontmatter.id ?? null);
      return;
    }
    if (!nextAll.some((item) => item.frontmatter.id === activeId)) {
      setActiveId((status === 'all' ? nextAll : nextVisible)[0]?.frontmatter.id ?? null);
    }
  }

  useEffect(() => {
    void reload();
  }, [status]);

  const counts = useMemo(() => {
    const byStatus = new Map<LibraryStatus, number>();
    for (const item of allItems) byStatus.set(item.frontmatter.status, (byStatus.get(item.frontmatter.status) ?? 0) + 1);
    return byStatus;
  }, [allItems]);

  async function saveUrl(): Promise<void> {
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const item = await window.orbit.library.save({
        url: url.trim(),
        title: urlTitle.trim() || undefined
      });
      setUrl('');
      setUrlTitle('');
      setActiveId(item.frontmatter.id);
      await reload();
      setMessage(`已保存 ${item.frontmatter.title}`);
    } finally {
      setBusy(false);
    }
  }

  async function markRead(itemId = active?.frontmatter.id): Promise<void> {
    if (!itemId) return;
    await window.orbit.library.markRead(itemId, { markRead: true, readingSecondsDelta: 1 });
    await reload();
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="shrink-0 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h1 className="text-lg font-semibold">资料库</h1>
          <p className="text-xs text-neutral-500">Layer 1 源材料 · 保存、阅读、标注与提炼。</p>
          <div className="mt-4 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://..."
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={urlTitle}
              onChange={(event) => setUrlTitle(event.target.value)}
              placeholder="可选标题"
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <button
              disabled={busy}
              onClick={() => void saveUrl()}
              className="w-full rounded bg-sky-600 px-2 py-1.5 text-xs text-white disabled:opacity-50"
            >
              保存 URL
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
            {STATUSES.map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  status === item
                    ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40'
                    : 'border-neutral-200 text-neutral-500 dark:border-neutral-800'
                }`}
              >
                {libraryStatusLabel(item)} {item === 'all' ? allItems.length : counts.get(item) ?? 0}
              </button>
            ))}
          </div>
          {message ? (
            <div className="mt-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
              {message}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-900">暂无资料库条目。</p>
          ) : null}
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.frontmatter.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  const payload = makeLibraryDragPayload(item.frontmatter.id);
                  event.dataTransfer.setData(LIBRARY_ITEM_DRAG_MIME, payload);
                  event.dataTransfer.setData('application/json', payload);
                  event.dataTransfer.setData('text/plain', item.frontmatter.id);
                }}
                onClick={() => setActiveId(item.frontmatter.id)}
                className={`w-full rounded px-3 py-2 text-left text-sm ${
                  active?.frontmatter.id === item.frontmatter.id
                    ? 'bg-sky-50 dark:bg-sky-950/40'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">{iconForKind(item.frontmatter.kind)}</span>
                  <span className="truncate font-medium">{item.frontmatter.title}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-neutral-500">
                  {libraryStatusLabel(item.frontmatter.status)} · {item.frontmatter.url ?? item.path}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {active ? (
        <section className="flex min-w-0 flex-1 overflow-hidden">
          <LibrarySpatialReader
            items={allItems}
            activeItem={activeForReader}
            onActiveItemChange={setActiveId}
            onMarkRead={(itemId) => void markRead(itemId)}
          />
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">保存或选择一个资料库条目。</div>
      )}
    </div>
  );
}

function statusToFilter(status: LibraryStatus | 'all'): { include_archived?: boolean; status?: LibraryStatus } {
  if (status === 'all') return { include_archived: true };
  if (status === 'archived') return { include_archived: true, status };
  return { status };
}

function iconForKind(kind: LibraryKind): string {
  if (kind === 'markdown') return 'MD';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'epub') return 'EPUB';
  if (kind === 'video') return '视频';
  if (kind === 'podcast') return '播客';
  if (kind === 'bookmark') return '书签';
  return '文章';
}

function libraryStatusLabel(status: LibraryStatus | 'all'): string {
  if (status === 'all') return '全部';
  if (status === 'saved') return '已保存';
  if (status === 'reading') return '阅读中';
  if (status === 'read') return '已读';
  if (status === 'distilled') return '已提炼';
  if (status === 'archived') return '已归档';
  return status;
}
