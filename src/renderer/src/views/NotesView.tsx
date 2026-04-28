import { useEffect, useMemo, useState } from 'react';
import type { Note, NoteAreaRef, NoteType, SpecialMarker } from '@shared/note';

const NOTE_TYPES: NoteType[] = ['thought', 'longform', 'capture', 'voice_log', 'daily_summary'];

export function NotesView(): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<NoteType | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [areas, setAreas] = useState('');
  const [resourceRefs, setResourceRefs] = useState('');
  const [synthesisRef, setSynthesisRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = notes.find((note) => note.frontmatter.id === activeId) ?? null;

  async function reload(): Promise<void> {
    setError(null);
    try {
      const filter = {
        ...(type === 'all' ? {} : { type }),
        ...(tagFilter.trim() ? { tag: tagFilter.trim() } : {}),
        ...(areaFilter.trim() ? { area_slug: areaFilter.trim() } : {}),
        ...(resourceFilter.trim() ? { resource_ref: resourceFilter.trim() } : {})
      };
      const list = query.trim()
        ? (await window.orbit.notes.search(query, { limit: 100 })).filter((note) => matchesClientFilter(note, filter))
        : await window.orbit.notes.list(filter);
      setNotes(list);
      if (!activeId && list[0]) setActiveId(list[0].frontmatter.id);
      if (activeId && !list.some((note) => note.frontmatter.id === activeId)) {
        setActiveId(list[0]?.frontmatter.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void reload();
    const off = window.orbit.notes.onEvent(() => void reload());
    return off;
  }, [query, type, tagFilter, areaFilter, resourceFilter]);

  useEffect(() => {
    if (!active) return;
    setBody(active.body);
    setTitle(active.frontmatter.title ?? '');
    setTags(active.frontmatter.tags.join(', '));
    setAreas((active.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setResourceRefs((active.frontmatter.resource_refs ?? []).join(', '));
    setSynthesisRef(active.frontmatter.synthesis_ref ?? '');
  }, [activeId, active?.frontmatter.updated]);

  async function createNote(nextType: NoteType): Promise<void> {
    const note = await window.orbit.notes.create({
      type: nextType,
      title: `New ${nextType}`,
      body: '',
      tags: []
    });
    setActiveId(note.frontmatter.id);
    await reload();
  }

  async function save(): Promise<void> {
    if (!active) return;
    setSaving(true);
    try {
      const saved = await window.orbit.notes.update(active.frontmatter.id, {
        title,
        body,
        tags: splitCsv(tags),
        areas: parseAreas(areas, active.frontmatter.areas),
        resource_refs: splitCsv(resourceRefs),
        synthesis_ref: synthesisRef.trim() || undefined
      });
      setActiveId(saved.frontmatter.id);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function archive(): Promise<void> {
    if (!active) return;
    await window.orbit.notes.archive(active.frontmatter.id);
    setActiveId(null);
    await reload();
  }

  const stats = useMemo(() => {
    const byType = new Map<NoteType, number>();
    for (const note of notes) byType.set(note.frontmatter.type, (byType.get(note.frontmatter.type) ?? 0) + 1);
    return byType;
  }, [notes]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 border-r border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40">
        <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Notes</h1>
              <p className="text-xs text-neutral-500">Output layer · thoughts, captures, longforms</p>
            </div>
            <button onClick={() => void createNote('thought')} className="rounded bg-sky-600 px-2 py-1 text-xs text-white">
              + Thought
            </button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="tag"
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              placeholder="area"
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={resourceFilter}
              onChange={(event) => setResourceFilter(event.target.value)}
              placeholder="resource"
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterButton active={type === 'all'} label={`All ${notes.length}`} onClick={() => setType('all')} />
            {NOTE_TYPES.map((item) => (
              <FilterButton
                key={item}
                active={type === item}
                label={`${item} ${stats.get(item) ?? 0}`}
                onClick={() => setType(item)}
              />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
          {notes.length === 0 && !error ? (
            <div className="p-4 text-sm text-neutral-500">No notes match these filters.</div>
          ) : null}
          {notes.map((note) => (
            <button
              key={note.frontmatter.id}
              onClick={() => setActiveId(note.frontmatter.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeId === note.frontmatter.id ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{iconForNote(note)}</span>
                <span className="truncate font-medium">{note.frontmatter.title ?? 'Untitled'}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-neutral-500">{note.path}</div>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1">
        {active ? (
          <div className="flex min-w-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                />
                <select
                  value={active.frontmatter.para_kind}
                  onChange={(event) =>
                    void window.orbit.notes
                      .update(active.frontmatter.id, { para_kind: event.target.value as Note['frontmatter']['para_kind'] })
                      .then(reload)
                  }
                  className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  {['floating', 'project', 'area', 'resource', 'archive'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <button onClick={() => void archive()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                  Archive
                </button>
                <button onClick={() => void save()} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="tags, comma separated"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={areas}
                  onChange={(event) => setAreas(event.target.value)}
                  placeholder="areas, comma separated"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={resourceRefs}
                  onChange={(event) => setResourceRefs(event.target.value)}
                  placeholder="resource refs, comma separated"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
              </div>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-0 flex-1 resize-none bg-white p-5 font-mono text-sm leading-6 outline-none dark:bg-neutral-950"
              />
            </div>
            <aside className="w-72 shrink-0 overflow-y-auto border-l border-neutral-200 p-4 text-xs dark:border-neutral-800">
              <h2 className="text-sm font-semibold">Context</h2>
              <Meta label="Path" value={active.path} />
              <Meta label="Words" value={String(active.frontmatter.word_count ?? 0)} />
              <Meta label="Source" value={formatSource(active)} />
              <Meta label="Backlinks" value={active.frontmatter.backlinks.join(', ') || 'None'} />
              <Meta label="Links out" value={active.frontmatter.links_out.join(', ') || 'None'} />
              <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                Synthesis ref
                <input
                  value={synthesisRef}
                  onChange={(event) => setSynthesisRef(event.target.value)}
                  placeholder="artifact id"
                  className="mt-1 w-full rounded border border-neutral-200 bg-white px-2 py-1.5 normal-case tracking-normal dark:border-neutral-800 dark:bg-neutral-900"
                />
              </label>
              <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                Areas and Resource refs are Layer 1 links. Feed or KB material must be saved/activated before linking here.
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Select or create a note.</div>
        )}
      </section>
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

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick(): void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-1 text-[11px] ${
        active ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200' : 'border-neutral-200 text-neutral-500 dark:border-neutral-800'
      }`}
    >
      {label}
    </button>
  );
}

function iconForNote(note: Pick<Note, 'frontmatter'>): string {
  const marker = note.frontmatter.special_marker as SpecialMarker | undefined;
  if (marker?.icon) return marker.icon;
  if (note.frontmatter.type === 'thought') return '💭';
  if (note.frontmatter.type === 'longform') return '✍️';
  if (note.frontmatter.type === 'voice_log') return '🎤';
  if (note.frontmatter.type === 'daily_summary') return '🌙';
  return '📌';
}

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseAreas(value: string, existing: NoteAreaRef[] = []): NoteAreaRef[] {
  const previous = new Map(existing.map((area) => [area.area_slug, area]));
  return splitCsv(value).map((area_slug, index) => ({
    area_slug,
    ...(index === 0 ? { primary: true } : {}),
    assigned_at: previous.get(area_slug)?.assigned_at ?? new Date().toISOString(),
    assigned_by: previous.get(area_slug)?.assigned_by ?? 'user'
  }));
}

function matchesClientFilter(
  note: Note,
  filter: { type?: NoteType; tag?: string; area_slug?: string; resource_ref?: string }
): boolean {
  if (filter.type && note.frontmatter.type !== filter.type) return false;
  if (filter.tag && !note.frontmatter.tags.includes(filter.tag)) return false;
  if (filter.area_slug && !(note.frontmatter.areas ?? []).some((area) => area.area_slug === filter.area_slug)) return false;
  if (filter.resource_ref && !(note.frontmatter.resource_refs ?? []).includes(filter.resource_ref)) return false;
  return true;
}

function formatSource(note: Note): string {
  const source = note.frontmatter.source;
  if (!source) return 'Manual';
  return [source.kind, source.ref].filter(Boolean).join(': ');
}
