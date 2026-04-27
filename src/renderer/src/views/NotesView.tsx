import { useEffect, useMemo, useState } from 'react';
import type { Note, NoteType, SpecialMarker } from '@shared/note';

const NOTE_TYPES: NoteType[] = ['thought', 'longform', 'capture', 'voice_log', 'daily_summary'];

export function NotesView(): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<NoteType | 'all'>('all');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const active = notes.find((note) => note.frontmatter.id === activeId) ?? null;

  async function reload(): Promise<void> {
    const list = query.trim()
      ? await window.orbit.notes.search(query, { limit: 100 })
      : await window.orbit.notes.list(type === 'all' ? undefined : { type });
    setNotes(list);
    if (!activeId && list[0]) setActiveId(list[0].frontmatter.id);
  }

  useEffect(() => {
    void reload();
    const off = window.orbit.notes.onEvent(() => void reload());
    return off;
  }, [query, type]);

  useEffect(() => {
    if (!active) return;
    setBody(active.body);
    setTitle(active.frontmatter.title ?? '');
    setTags(active.frontmatter.tags.join(', '));
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
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean)
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
      <section className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
              />
              <select
                value={active.frontmatter.para_kind}
                onChange={(event) =>
                  void window.orbit.notes.update(active.frontmatter.id, { para_kind: event.target.value as Note['frontmatter']['para_kind'] }).then(reload)
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
            <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="tags, comma separated"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
              />
            </div>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-0 flex-1 resize-none bg-white p-5 font-mono text-sm leading-6 outline-none dark:bg-neutral-950"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Select or create a note.</div>
        )}
      </section>
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

