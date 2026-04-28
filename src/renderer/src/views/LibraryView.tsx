import { useEffect, useMemo, useState } from 'react';
import type { LibraryItem, LibraryKind, LibraryStatus } from '@shared/library';
import type { LibraryDistillPayload, SynthesisArtifact } from '@shared/synthesis';

const STATUSES: Array<LibraryStatus | 'all'> = ['all', 'saved', 'reading', 'read', 'distilled', 'archived'];

export function LibraryView(): JSX.Element {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<LibraryStatus | 'all'>('all');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [areas, setAreas] = useState('');
  const [resourceRefs, setResourceRefs] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [artifact, setArtifact] = useState<SynthesisArtifact<LibraryDistillPayload> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = items.find((item) => item.frontmatter.id === activeId) ?? null;

  async function reload(): Promise<void> {
    const list = await window.orbit.library.list(status === 'all' ? { include_archived: true } : { status });
    setItems(list);
    if (!activeId && list[0]) setActiveId(list[0].frontmatter.id);
    if (activeId && !list.some((item) => item.frontmatter.id === activeId)) setActiveId(list[0]?.frontmatter.id ?? null);
  }

  useEffect(() => {
    void reload();
  }, [status]);

  useEffect(() => {
    if (!active) {
      setTitle('');
      setBody('');
      setTags('');
      setAreas('');
      setResourceRefs('');
      setArtifact(null);
      return;
    }
    setTitle(active.frontmatter.title);
    setBody(active.body);
    setTags(active.frontmatter.tags.join(', '));
    setAreas((active.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setResourceRefs((active.frontmatter.resource_refs ?? []).join(', '));
    const latestArtifact = active.frontmatter.distillation_artifact_ids?.at(-1);
    if (latestArtifact) {
      void window.orbit.synthesis.getArtifact(latestArtifact).then((next) => setArtifact(next as SynthesisArtifact<LibraryDistillPayload> | null));
    } else {
      setArtifact(null);
    }
  }, [active?.frontmatter.id, active?.frontmatter.updated]);

  const counts = useMemo(() => {
    const byStatus = new Map<LibraryStatus, number>();
    for (const item of items) byStatus.set(item.frontmatter.status, (byStatus.get(item.frontmatter.status) ?? 0) + 1);
    return byStatus;
  }, [items]);

  async function saveUrl(): Promise<void> {
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const item = await window.orbit.library.save({ url: url.trim(), title: title.trim() || undefined });
      setUrl('');
      setActiveId(item.frontmatter.id);
      await reload();
      setMessage(`Saved ${item.frontmatter.title}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveActive(): Promise<void> {
    if (!active) return;
    setBusy(true);
    try {
      const saved = await window.orbit.library.update(active.frontmatter.id, {
        title,
        body,
        tags: splitCsv(tags),
        areas: splitCsv(areas).map((area_slug, index) => ({
          area_slug,
          ...(index === 0 ? { primary: true } : {}),
          assigned_at: new Date().toISOString(),
          assigned_by: 'user'
        })),
        resource_refs: splitCsv(resourceRefs)
      });
      setActiveId(saved.frontmatter.id);
      await reload();
      setMessage('Saved changes.');
    } finally {
      setBusy(false);
    }
  }

  async function addAnnotation(): Promise<void> {
    if (!active || !annotationText.trim()) return;
    await window.orbit.library.annotate(active.frontmatter.id, { text: annotationText.trim(), type: 'highlight' });
    setAnnotationText('');
    await reload();
  }

  async function markRead(): Promise<void> {
    if (!active) return;
    await window.orbit.library.markRead(active.frontmatter.id, { markRead: true, readingSecondsDelta: 1 });
    await reload();
  }

  async function distill(): Promise<void> {
    if (!active) return;
    setBusy(true);
    try {
      const result = await window.orbit.library.distill(active.frontmatter.id);
      setArtifact(result.artifact as SynthesisArtifact<LibraryDistillPayload>);
      await reload();
      setMessage('Distillation artifact generated.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptDistillation(): Promise<void> {
    if (!artifact) return;
    const result = await window.orbit.library.acceptDistillation({ artifact_id: artifact.id });
    await reload();
    setMessage(`Created Note ${result.note_path}`);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Library</h1>
        <p className="text-xs text-neutral-500">Layer 1 source material · save, read, annotate, distill.</p>
        <div className="mt-4 space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional title"
            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
          />
          <button disabled={busy} onClick={() => void saveUrl()} className="w-full rounded bg-sky-600 px-2 py-1.5 text-xs text-white disabled:opacity-50">
            Save URL
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
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
        {message ? <div className="mt-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">{message}</div> : null}
        <div className="mt-4 space-y-1">
          {items.length === 0 ? <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-900">No Library items yet.</p> : null}
          {items.map((item) => (
            <button
              key={item.frontmatter.id}
              onClick={() => setActiveId(item.frontmatter.id)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${
                active?.frontmatter.id === item.frontmatter.id ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="truncate font-medium">{iconForKind(item.frontmatter.kind)} {item.frontmatter.title}</div>
              <div className="truncate text-[11px] text-neutral-500">{item.frontmatter.status} · {item.frontmatter.url ?? item.path}</div>
            </button>
          ))}
        </div>
      </aside>
      {active ? (
        <section className="flex min-w-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none" />
              <button onClick={() => void markRead()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Mark read</button>
              <button onClick={() => void saveActive()} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                {busy ? 'Working…' : 'Save'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tags" className="rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
              <input value={areas} onChange={(event) => setAreas(event.target.value)} placeholder="areas" className="rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
              <input value={resourceRefs} onChange={(event) => setResourceRefs(event.target.value)} placeholder="resource refs" className="rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
            </div>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-0 flex-1 resize-none bg-white p-5 font-mono text-sm leading-6 outline-none dark:bg-neutral-950" />
          </main>
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-200 p-4 text-xs dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Reader context</h2>
            <Meta label="Status" value={active.frontmatter.status} />
            <Meta label="Progress" value={`${Math.round((active.frontmatter.reading_progress ?? 0) * 100)}%`} />
            <Meta label="Source" value={active.frontmatter.url ?? active.path} />
            <Meta label="Resource refs" value={(active.frontmatter.resource_refs ?? []).join(', ') || 'None'} />
            <div className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="font-semibold">Annotations</div>
              <div className="mt-2 space-y-2">
                {(active.frontmatter.annotations ?? []).map((annotation) => (
                  <div key={annotation.id} className="rounded bg-neutral-50 p-2 dark:bg-neutral-900">
                    {annotation.text}
                  </div>
                ))}
              </div>
              <textarea value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} placeholder="Highlight or note…" className="mt-2 h-20 w-full resize-none rounded border border-neutral-200 p-2 dark:border-neutral-800 dark:bg-neutral-900" />
              <button onClick={() => void addAnnotation()} className="mt-2 rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900">Add annotation</button>
            </div>
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/60 dark:bg-violet-950/30">
              <div className="font-semibold text-violet-900 dark:text-violet-100">Distillation</div>
              {artifact ? (
                <div className="mt-2 text-violet-900 dark:text-violet-100">
                  <div className="font-medium">{artifact.payload.title}</div>
                  <p className="mt-1">{artifact.payload.summary}</p>
                  <button onClick={() => void acceptDistillation()} className="mt-2 rounded bg-violet-600 px-2 py-1 text-white">Accept to Note</button>
                </div>
              ) : (
                <p className="mt-2 text-violet-800 dark:text-violet-200">Generate a synthesis artifact before creating a Note.</p>
              )}
              <button onClick={() => void distill()} className="mt-2 rounded border border-violet-300 px-2 py-1 text-violet-800 dark:border-violet-700 dark:text-violet-100">
                {artifact ? 'Regenerate' : 'Distill'}
              </button>
            </div>
          </aside>
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Save or select a Library item.</div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="mt-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 break-words text-neutral-700 dark:text-neutral-200">{value}</div>
    </div>
  );
}

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function iconForKind(kind: LibraryKind): string {
  if (kind === 'pdf') return '📄';
  if (kind === 'video') return '🎬';
  if (kind === 'bookmark') return '🔖';
  return '📚';
}
