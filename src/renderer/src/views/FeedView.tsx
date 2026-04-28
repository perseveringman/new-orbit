import { useEffect, useMemo, useState } from 'react';
import type { FeedClusterPayload, FeedDigestPayload, FeedItem, FeedItemStatus, FeedSource } from '@shared/feed';
import type { SynthesisArtifact } from '@shared/synthesis';

const STATUSES: Array<FeedItemStatus | 'all'> = ['all', 'new', 'seen', 'saved', 'ignored'];

export function FeedView(): JSX.Element {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [status, setStatus] = useState<FeedItemStatus | 'all'>('all');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [digest, setDigest] = useState<SynthesisArtifact<FeedDigestPayload> | null>(null);
  const [cluster, setCluster] = useState<SynthesisArtifact<FeedClusterPayload> | null>(null);

  async function reload(): Promise<void> {
    const [nextSources, nextItems] = await Promise.all([
      window.orbit.feeds.listSources(),
      window.orbit.feeds.listItems({
        ...(activeSourceId ? { source_id: activeSourceId } : {}),
        ...(status === 'all' ? {} : { status }),
        include_ignored: status === 'ignored',
        include_saved: status === 'saved'
      })
    ]);
    setSources(nextSources);
    setItems(nextItems);
  }

  useEffect(() => {
    void reload();
  }, [activeSourceId, status]);

  const counts = useMemo(() => {
    const byStatus = new Map<FeedItemStatus, number>();
    for (const item of items) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    return byStatus;
  }, [items]);

  async function addSource(): Promise<void> {
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const source = await window.orbit.feeds.createSource({ url: url.trim(), title: title.trim() || undefined });
      setUrl('');
      setTitle('');
      setActiveSourceId(source.id);
      await reload();
      setMessage(`Added ${source.title}.`);
    } finally {
      setBusy(false);
    }
  }

  async function refresh(sourceId?: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.orbit.feeds.fetch(sourceId);
      await reload();
      setMessage(`Fetched ${result.reduce((sum, item) => sum + item.created, 0)} new item(s).`);
    } finally {
      setBusy(false);
    }
  }

  async function save(item: FeedItem): Promise<void> {
    const result = await window.orbit.feeds.saveToLibrary(item.id);
    await reload();
    setMessage(`Saved to Library: ${result.library_item.frontmatter.title}`);
  }

  async function runDigest(): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const result = await window.orbit.feeds.digest(date);
    setDigest(result.artifact);
  }

  async function runCluster(): Promise<void> {
    const result = await window.orbit.feeds.cluster(activeSourceId ?? 'all');
    setCluster(result.artifact);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Feed Reader</h1>
            <p className="text-xs text-neutral-500">
              Layer 0 signal stream · {sources.length} sources · {items.length} visible items
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void runDigest()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              Daily digest
            </button>
            <button onClick={() => void runCluster()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              Cluster
            </button>
            <button disabled={busy} onClick={() => void refresh(activeSourceId ?? undefined)} className="rounded bg-sky-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-3 grid max-w-3xl gap-2 md:grid-cols-[1fr_1.5fr_auto]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Source title"
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="RSS URL"
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          />
          <button disabled={busy} onClick={() => void addSource()} className="rounded bg-neutral-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
            Add source
          </button>
        </div>
        {message ? <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">{message}</div> : null}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px] overflow-hidden">
        <aside className="overflow-y-auto border-r border-neutral-200 p-3 dark:border-neutral-800">
          <button
            onClick={() => setActiveSourceId(null)}
            className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${activeSourceId === null ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'}`}
          >
            All sources
          </button>
          {sources.length === 0 ? <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-900">No feed sources yet.</p> : null}
          {sources.map((source) => (
            <div key={source.id} className={`rounded-lg px-3 py-2 text-sm ${activeSourceId === source.id ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}>
              <button onClick={() => setActiveSourceId(source.id)} className="w-full text-left">
                <div className="font-medium">{source.title}</div>
                <div className="truncate text-[11px] text-neutral-500">{source.url}</div>
                {source.last_fetch_error ? <div className="mt-1 text-[11px] text-red-500">{source.last_fetch_error}</div> : null}
              </button>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void refresh(source.id)} className="rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">
                  Fetch
                </button>
                <button onClick={() => void window.orbit.feeds.deleteSource(source.id).then(reload)} className="rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </aside>
        <main className="overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap gap-1">
            {STATUSES.map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  status === item ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40' : 'border-neutral-200 text-neutral-500 dark:border-neutral-800'
                }`}
              >
                {item} {item === 'all' ? items.length : counts.get(item) ?? 0}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
              No feed items in this view. Raw feed fetches stay here until saved to Library.
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{item.title}</h2>
                    <div className="mt-1 text-[11px] text-neutral-500">{item.status} · {new Date(item.fetched_at).toLocaleString()}</div>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">
                    Layer 0
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300">{item.summary || item.url}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void save(item)} disabled={item.status === 'saved'} className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
                    Save to Library
                  </button>
                  <button onClick={() => void window.orbit.feeds.markSeen(item.id).then(reload)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    Seen
                  </button>
                  <button onClick={() => void window.orbit.feeds.ignore(item.id).then(reload)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    Ignore
                  </button>
                  <a href={item.url} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </main>
        <aside className="overflow-y-auto border-l border-neutral-200 p-4 text-xs dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Feed synthesis</h2>
          <p className="mt-1 text-neutral-500">
            Digest and clusters are feed-scoped artifacts. They do not enter Library, Resource, or truth search unless you save an item.
          </p>
          <SynthesisPreview title="Daily digest" artifact={digest} />
          <SynthesisPreview title="Clusters" artifact={cluster} />
        </aside>
      </div>
    </div>
  );
}

function SynthesisPreview({ title, artifact }: { title: string; artifact: SynthesisArtifact | null }): JSX.Element {
  return (
    <div className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="font-semibold">{title}</div>
      {artifact ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-neutral-600 dark:text-neutral-300">
          {JSON.stringify(artifact.payload, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-neutral-500">Not generated yet.</p>
      )}
    </div>
  );
}
