import { useCallback, useEffect, useState } from 'react';
import type {
  Note,
  NoteAreaRef,
  NoteQueueItem,
  NoteRelationSuggestion,
  NoteSuggestionStatus,
  NoteType,
  NoteWorkbench,
  NoteWorkbenchBucket,
  NoteWorkbenchSuggestion
} from '@shared/note';
import { MarkdownLiveEditor, type MarkdownEditorMode } from '../components/Editor/MarkdownLiveEditor';
import { useWorkspace } from '../store/workspace';

const NOTE_TYPES: NoteType[] = ['thought', 'longform', 'capture', 'voice_log', 'daily_summary'];
const QUEUE_BUCKETS: Array<NoteWorkbenchBucket | 'all'> = ['all', 'inbox', 'connect', 'express', 'settled'];

export function NotesView(): JSX.Element {
  const [queue, setQueue] = useState<NoteQueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workbench, setWorkbench] = useState<NoteWorkbench | null>(null);
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<NoteWorkbenchBucket | 'all'>('inbox');
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
  const [editorMode, setEditorMode] = useState<MarkdownEditorMode>('live');
  const [saving, setSaving] = useState(false);
  const [loadingWorkbench, setLoadingWorkbench] = useState(false);
  const [actingSuggestion, setActingSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useWorkspace((state) => state.resolvedTheme === 'dark');
  const active = workbench?.note ?? null;

  const reloadQueue = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const list = await window.orbit.notes.queue({
        ...(bucket === 'all' ? {} : { bucket }),
        ...(type === 'all' ? {} : { type }),
        ...(tagFilter.trim() ? { tag: tagFilter.trim() } : {}),
        ...(areaFilter.trim() ? { area_slug: areaFilter.trim() } : {}),
        ...(resourceFilter.trim() ? { resource_ref: resourceFilter.trim() } : {}),
        ...(query.trim() ? { query: query.trim() } : {})
      });
      setQueue(list);
      if (!activeId || !list.some((item) => item.note_id === activeId)) {
        setActiveId(list[0]?.note_id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeId, areaFilter, bucket, query, resourceFilter, tagFilter, type]);

  const loadWorkbench = useCallback(async (noteId: string, force = false): Promise<void> => {
    setLoadingWorkbench(true);
    setError(null);
    try {
      const next = await window.orbit.notes.workbench({ noteId, force });
      setWorkbench(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWorkbench(null);
    } finally {
      setLoadingWorkbench(false);
    }
  }, []);

  useEffect(() => {
    void reloadQueue();
    const off = window.orbit.notes.onEvent(() => void reloadQueue());
    return off;
  }, [reloadQueue]);

  useEffect(() => {
    if (!activeId) {
      setWorkbench(null);
      return;
    }
    void loadWorkbench(activeId);
  }, [activeId, loadWorkbench]);

  useEffect(() => {
    if (!active) return;
    setBody(active.body);
    setTitle(active.frontmatter.title ?? '');
    setTags(active.frontmatter.tags.join(', '));
    setAreas((active.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setResourceRefs((active.frontmatter.resource_refs ?? []).join(', '));
    setSynthesisRef(active.frontmatter.synthesis_ref ?? '');
  }, [active?.frontmatter.id, active?.frontmatter.updated]);

  async function createNote(nextType: NoteType): Promise<void> {
    const note = await window.orbit.notes.create({
      type: nextType,
      title: `New ${nextType}`,
      body: '',
      tags: []
    });
    setBucket('all');
    setActiveId(note.frontmatter.id);
    await reloadQueue();
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
      await reloadQueue();
      await loadWorkbench(saved.frontmatter.id, true);
    } finally {
      setSaving(false);
    }
  }

  async function archive(): Promise<void> {
    if (!active) return;
    await window.orbit.notes.archive(active.frontmatter.id);
    setActiveId(null);
    await reloadQueue();
  }

  async function acceptSuggestion(suggestion: NoteWorkbenchSuggestion | NoteRelationSuggestion): Promise<void> {
    if (!active || !workbench) return;
    setActingSuggestion(suggestion.id);
    try {
      const artifactId = suggestion.artifact_id ?? ('target_note_id' in suggestion ? workbench.relation_artifact_id : workbench.artifact_id);
      const result = await window.orbit.notes.acceptSuggestion({
        noteId: active.frontmatter.id,
        suggestionId: suggestion.id,
        ...(artifactId ? { artifactId } : {})
      });
      const nextId = result.created?.kind === 'note' ? result.created.id : result.note?.frontmatter.id ?? active.frontmatter.id;
      await reloadQueue();
      setActiveId(nextId);
      await loadWorkbench(nextId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActingSuggestion(null);
    }
  }

  async function dismissSuggestion(suggestion: NoteWorkbenchSuggestion | NoteRelationSuggestion): Promise<void> {
    if (!active || !workbench) return;
    setActingSuggestion(suggestion.id);
    try {
      const artifactId = suggestion.artifact_id ?? ('target_note_id' in suggestion ? workbench.relation_artifact_id : workbench.artifact_id);
      await window.orbit.notes.dismissSuggestion({
        noteId: active.frontmatter.id,
        suggestionId: suggestion.id,
        ...(artifactId ? { artifactId } : {})
      });
      await loadWorkbench(active.frontmatter.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActingSuggestion(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Notes</h1>
              <p className="truncate text-xs text-neutral-500">{queue.length} in current queue</p>
            </div>
            <button onClick={() => void createNote('thought')} className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
              New
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {QUEUE_BUCKETS.map((item) => (
              <BucketButton
                key={item}
                active={bucket === item}
                label={item}
                onClick={() => setBucket(item)}
              />
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as NoteType | 'all')}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <option value="all">all types</option>
              {NOTE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="tag"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              placeholder="area"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={resourceFilter}
              onChange={(event) => setResourceFilter(event.target.value)}
              placeholder="resource"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? <div className="mb-2 rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
          {queue.length === 0 && !error ? (
            <div className="p-4 text-sm text-neutral-500">No notes.</div>
          ) : null}
          {queue.map((item) => (
            <button
              key={item.note_id}
              onClick={() => setActiveId(item.note_id)}
              className={`block w-full rounded-md px-3 py-2.5 text-left text-sm ${
                activeId === item.note_id ? 'bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800' : 'hover:bg-white/80 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{item.title}</span>
                <QueueBadge bucket={item.bucket} />
              </div>
              <div className="mt-1 truncate text-[11px] text-neutral-500">{item.path}</div>
              {item.reasons.length > 0 ? (
                <div className="mt-2 line-clamp-2 text-[11px] text-neutral-500">{item.reasons.join(' · ')}</div>
              ) : null}
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
                <QueueBadge bucket={workbench?.bucket ?? 'settled'} />
                <div className="flex shrink-0 rounded-md border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
                  <EditorModeButton
                    active={editorMode === 'live'}
                    label="Live Preview"
                    onClick={() => setEditorMode('live')}
                  />
                  <EditorModeButton
                    active={editorMode === 'source'}
                    label="Source"
                    onClick={() => setEditorMode('source')}
                  />
                </div>
                <select
                  value={active.frontmatter.para_kind}
                  onChange={(event) =>
                    void window.orbit.notes
                      .update(active.frontmatter.id, { para_kind: event.target.value as Note['frontmatter']['para_kind'] })
                      .then(async () => {
                        await reloadQueue();
                        await loadWorkbench(active.frontmatter.id, true);
                      })
                  }
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  {['floating', 'project', 'area', 'resource', 'archive'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <button onClick={() => void archive()} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                  Archive
                </button>
                <button onClick={() => void save()} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="tags"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={areas}
                  onChange={(event) => setAreas(event.target.value)}
                  placeholder="areas"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={resourceRefs}
                  onChange={(event) => setResourceRefs(event.target.value)}
                  placeholder="resources"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
              </div>
              <MarkdownLiveEditor
                value={body}
                onChange={setBody}
                mode={editorMode}
                dark={dark}
                placeholder="Start writing..."
                className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-neutral-950"
              />
            </div>

            <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div>
                  <h2 className="text-sm font-semibold">Workbench</h2>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{workbench?.artifact_id ?? 'No artifact'}</div>
                </div>
                <button
                  onClick={() => void loadWorkbench(active.frontmatter.id, true)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                  {loadingWorkbench ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
                <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Summary</div>
                  <p className="mt-2 text-sm leading-5 text-neutral-800 dark:text-neutral-100">
                    {workbench?.payload.summary || 'No summary yet.'}
                  </p>
                  {workbench?.payload.key_points.length ? (
                    <ul className="mt-3 space-y-1 text-neutral-600 dark:text-neutral-300">
                      {workbench.payload.key_points.slice(0, 4).map((point) => (
                        <li key={point}>- {point}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <SectionTitle title={`Suggestions ${workbench?.payload.suggestions.length ?? 0}`} />
                  {workbench?.payload.suggestions.length ? (
                    workbench.payload.suggestions.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        busy={actingSuggestion === suggestion.id}
                        onAccept={() => void acceptSuggestion(suggestion)}
                        onDismiss={() => void dismissSuggestion(suggestion)}
                      />
                    ))
                  ) : (
                    <Empty label="No suggestions." />
                  )}
                </section>

                <section className="space-y-2">
                  <SectionTitle title={`Relations ${workbench?.payload.relations.length ?? 0}`} />
                  {workbench?.payload.relations.length ? (
                    workbench.payload.relations.map((relation) => (
                      <RelationCard
                        key={relation.id}
                        relation={relation}
                        busy={actingSuggestion === relation.id}
                        onAccept={() => void acceptSuggestion(relation)}
                        onDismiss={() => void dismissSuggestion(relation)}
                      />
                    ))
                  ) : (
                    <Empty label="No relations." />
                  )}
                </section>

                <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  <SectionTitle title="Context" />
                  <Meta label="Path" value={active.path} />
                  <Meta label="Words" value={String(active.frontmatter.word_count ?? 0)} />
                  <Meta label="Source" value={formatSource(active)} />
                  <Meta label="Backlinks" value={active.frontmatter.backlinks.join(', ') || 'None'} />
                  <Meta label="Links out" value={active.frontmatter.links_out.join(', ') || 'None'} />
                  <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Synthesis ref
                    <input
                      value={synthesisRef}
                      onChange={(event) => setSynthesisRef(event.target.value)}
                      placeholder="artifact id"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 normal-case tracking-normal dark:border-neutral-800 dark:bg-neutral-950"
                    />
                  </label>
                </section>
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

function EditorModeButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-[11px] transition ${
        active
          ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
      }`}
    >
      {label}
    </button>
  );
}

function BucketButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] ${
        active ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950' : 'border border-neutral-200 text-neutral-500 dark:border-neutral-800'
      }`}
    >
      <span className="block truncate">{label}</span>
    </button>
  );
}

function QueueBadge({ bucket }: { bucket: NoteWorkbenchBucket }): JSX.Element {
  const tone =
    bucket === 'inbox'
      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
      : bucket === 'connect'
        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200'
        : bucket === 'express'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
          : 'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300';
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${tone}`}>{bucket}</span>;
}

function SectionTitle({ title }: { title: string }): JSX.Element {
  return <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{title}</div>;
}

function SuggestionCard({
  suggestion,
  busy,
  onAccept,
  onDismiss
}: {
  suggestion: NoteWorkbenchSuggestion;
  busy: boolean;
  onAccept(): void;
  onDismiss(): void;
}): JSX.Element {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{suggestion.title}</div>
          <div className="mt-1 text-[11px] text-neutral-500">{suggestion.kind} · {formatConfidence(suggestion.confidence)} · {suggestion.risk}</div>
        </div>
        <StatusPill status={suggestion.status} />
      </div>
      <p className="mt-2 leading-5 text-neutral-600 dark:text-neutral-300">{suggestion.summary}</p>
      {suggestion.evidence?.length ? <div className="mt-2 line-clamp-2 text-[11px] text-neutral-500">{suggestion.evidence.join(' · ')}</div> : null}
      <SuggestionActions status={suggestion.status} busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
    </div>
  );
}

function RelationCard({
  relation,
  busy,
  onAccept,
  onDismiss
}: {
  relation: NoteRelationSuggestion;
  busy: boolean;
  onAccept(): void;
  onDismiss(): void;
}): JSX.Element {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{relation.target_title}</div>
          <div className="mt-1 text-[11px] text-neutral-500">{relation.kind} · {formatConfidence(relation.confidence)}</div>
        </div>
        <StatusPill status={relation.status} />
      </div>
      <p className="mt-2 leading-5 text-neutral-600 dark:text-neutral-300">{relation.reason}</p>
      {relation.evidence.length ? <div className="mt-2 line-clamp-2 text-[11px] text-neutral-500">{relation.evidence.join(' · ')}</div> : null}
      <SuggestionActions status={relation.status} busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
    </div>
  );
}

function SuggestionActions({
  status,
  busy,
  onAccept,
  onDismiss
}: {
  status: NoteSuggestionStatus;
  busy: boolean;
  onAccept(): void;
  onDismiss(): void;
}): JSX.Element {
  const disabled = busy || status !== 'proposed';
  return (
    <div className="mt-3 flex gap-2">
      <button
        disabled={disabled}
        onClick={onAccept}
        className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-950"
      >
        {busy ? 'Working...' : 'Accept'}
      </button>
      <button
        disabled={disabled}
        onClick={onDismiss}
        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-[11px] disabled:opacity-40 dark:border-neutral-700"
      >
        Dismiss
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: NoteSuggestionStatus }): JSX.Element {
  return <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-800">{status}</span>;
}

function Empty({ label }: { label: string }): JSX.Element {
  return <div className="rounded-md border border-dashed border-neutral-300 p-3 text-neutral-500 dark:border-neutral-800">{label}</div>;
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

function parseAreas(value: string, existing: NoteAreaRef[] = []): NoteAreaRef[] {
  const previous = new Map(existing.map((area) => [area.area_slug, area]));
  return splitCsv(value).map((area_slug, index) => ({
    area_slug,
    ...(index === 0 ? { primary: true } : {}),
    assigned_at: previous.get(area_slug)?.assigned_at ?? new Date().toISOString(),
    assigned_by: previous.get(area_slug)?.assigned_by ?? 'user'
  }));
}

function formatSource(note: Note): string {
  const source = note.frontmatter.source;
  if (!source) return 'Manual';
  return [source.kind, source.ref].filter(Boolean).join(': ');
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
