import { useCallback, useEffect, useRef, useState } from 'react';
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
const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

type NoteDraft = {
  title: string;
  body: string;
  tags: string;
  areas: string;
  resourceRefs: string;
  synthesisRef: string;
};

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
  const [formNoteId, setFormNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingWorkbench, setLoadingWorkbench] = useState(false);
  const [actingSuggestion, setActingSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useWorkspace((state) => state.resolvedTheme === 'dark');
  const vaultRoot = useWorkspace((state) => state.vault?.path ?? null);
  const active = workbench?.note ?? null;
  const activeRef = useRef<Note | null>(null);
  const formNoteIdRef = useRef<string | null>(null);
  const draftRef = useRef<NoteDraft | null>(null);
  const savedSnapshotRef = useRef('');
  const autosaveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const currentDraft: NoteDraft | null = active && formNoteId === active.frontmatter.id
    ? { title, body, tags, areas, resourceRefs, synthesisRef }
    : null;
  activeRef.current = active;
  formNoteIdRef.current = formNoteId;
  draftRef.current = currentDraft;

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
    if (!active) {
      setFormNoteId(null);
      setSaveStatus('saved');
      setSaveError(null);
      savedSnapshotRef.current = '';
      clearAutosaveTimer(autosaveTimerRef);
      return;
    }
    const nextDraft = draftFromNote(active);
    savedSnapshotRef.current = serializeDraft(active.frontmatter.id, nextDraft);
    setFormNoteId(active.frontmatter.id);
    setBody(active.body);
    setTitle(active.frontmatter.title ?? '');
    setTags(active.frontmatter.tags.join(', '));
    setAreas((active.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setResourceRefs((active.frontmatter.resource_refs ?? []).join(', '));
    setSynthesisRef(active.frontmatter.synthesis_ref ?? '');
    setSaveStatus('saved');
    setSaveError(null);
    clearAutosaveTimer(autosaveTimerRef);
  }, [active?.frontmatter.id, active?.frontmatter.updated]);

  const persistDraft = useCallback(async (): Promise<void> => {
    const note = activeRef.current;
    const draft = draftRef.current;
    if (!note || !draft || formNoteIdRef.current !== note.frontmatter.id) return;

    const snapshot = serializeDraft(note.frontmatter.id, draft);
    if (snapshot === savedSnapshotRef.current) {
      if (!savingRef.current) {
        setSaveStatus('saved');
        setSaveError(null);
      }
      return;
    }

    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    clearAutosaveTimer(autosaveTimerRef);
    savingRef.current = true;
    pendingSaveRef.current = false;
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const saved = await window.orbit.notes.update(note.frontmatter.id, draftToUpdate(draft, note));
      savedSnapshotRef.current = snapshot;

      const latestNote = activeRef.current;
      const latestDraft = draftRef.current;
      const latestSnapshot = latestNote && latestDraft && formNoteIdRef.current === latestNote.frontmatter.id
        ? serializeDraft(latestNote.frontmatter.id, latestDraft)
        : '';

      if (latestSnapshot === snapshot) {
        setSaveStatus('saved');
        setSaveError(null);
        setWorkbench((previous) =>
          previous?.note.frontmatter.id === saved.frontmatter.id
            ? { ...previous, note: saved }
            : previous
        );
        void reloadQueue();
      } else {
        setSaveStatus('dirty');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveStatus('error');
      setSaveError(message);
      setError(message);
    } finally {
      savingRef.current = false;

      const latestNote = activeRef.current;
      const latestDraft = draftRef.current;
      const latestSnapshot = latestNote && latestDraft && formNoteIdRef.current === latestNote.frontmatter.id
        ? serializeDraft(latestNote.frontmatter.id, latestDraft)
        : savedSnapshotRef.current;
      if (pendingSaveRef.current || latestSnapshot !== savedSnapshotRef.current) {
        pendingSaveRef.current = false;
        autosaveTimerRef.current = window.setTimeout(() => void persistDraft(), AUTOSAVE_DELAY_MS);
      }
    }
  }, [reloadQueue]);

  useEffect(() => {
    if (!active || formNoteId !== active.frontmatter.id || !currentDraft) return;
    const snapshot = serializeDraft(active.frontmatter.id, currentDraft);
    if (snapshot === savedSnapshotRef.current) {
      if (!savingRef.current) {
        setSaveStatus('saved');
        setSaveError(null);
      }
      clearAutosaveTimer(autosaveTimerRef);
      return;
    }

    if (!savingRef.current) {
      setSaveStatus('dirty');
    }
    setSaveError(null);
    clearAutosaveTimer(autosaveTimerRef);
    autosaveTimerRef.current = window.setTimeout(() => void persistDraft(), AUTOSAVE_DELAY_MS);

    return () => clearAutosaveTimer(autosaveTimerRef);
  }, [active?.frontmatter.id, areas, body, formNoteId, persistDraft, resourceRefs, synthesisRef, tags, title]);

  useEffect(() => {
    return () => clearAutosaveTimer(autosaveTimerRef);
  }, []);

  async function createNote(nextType: NoteType): Promise<void> {
    await persistDraft();
    const note = await window.orbit.notes.create({
      type: nextType,
      title: `新建${noteTypeLabel(nextType)}`,
      body: '',
      tags: []
    });
    setBucket('all');
    setActiveId(note.frontmatter.id);
    await reloadQueue();
  }

  async function selectNote(noteId: string): Promise<void> {
    await persistDraft();
    setActiveId(noteId);
  }

  async function save(): Promise<void> {
    await persistDraft();
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
              <h1 className="text-lg font-semibold">笔记</h1>
              <p className="truncate text-xs text-neutral-500">当前队列 {queue.length} 条</p>
            </div>
            <button onClick={() => void createNote('thought')} className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
              新建
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {QUEUE_BUCKETS.map((item) => (
              <BucketButton
                key={item}
                active={bucket === item}
                 label={bucketLabel(item)}
                onClick={() => setBucket(item)}
              />
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
             placeholder="搜索"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as NoteType | 'all')}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
               <option value="all">全部类型</option>
              {NOTE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {noteTypeLabel(item)}
                </option>
              ))}
            </select>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
               placeholder="标签"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
               placeholder="Area 筛选"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
            <input
              value={resourceFilter}
              onChange={(event) => setResourceFilter(event.target.value)}
               placeholder="Resource 筛选"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? <div className="mb-2 rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
          {queue.length === 0 && !error ? (
             <div className="p-4 text-sm text-neutral-500">暂无笔记。</div>
          ) : null}
          {queue.map((item) => (
            <button
              key={item.note_id}
              onClick={() => void selectNote(item.note_id)}
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
                  onBlur={() => void persistDraft()}
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                />
                <QueueBadge bucket={workbench?.bucket ?? 'settled'} />
                <SaveStatusPill status={saveStatus} error={saveError} />
                <div className="flex shrink-0 rounded-md border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
                  <EditorModeButton
                    active={editorMode === 'live'}
                     label="实时预览"
                    onClick={() => setEditorMode('live')}
                  />
                  <EditorModeButton
                    active={editorMode === 'source'}
                     label="源码"
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
                       {paraKindLabel(item)}
                    </option>
                  ))}
                </select>
                <button onClick={() => void archive()} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                  归档
                </button>
                <button onClick={() => void save()} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                  {saveStatus === 'saving' ? '保存中...' : '保存'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  onBlur={() => void persistDraft()}
                   placeholder="标签"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={areas}
                  onChange={(event) => setAreas(event.target.value)}
                  onBlur={() => void persistDraft()}
                    placeholder="Areas，用英文逗号分隔"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
                <input
                  value={resourceRefs}
                  onChange={(event) => setResourceRefs(event.target.value)}
                  onBlur={() => void persistDraft()}
                    placeholder="Resources，用英文逗号分隔"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                />
              </div>
              <MarkdownLiveEditor
                value={body}
                onChange={setBody}
                mode={editorMode}
                dark={dark}
                vaultRoot={vaultRoot}
                notePath={active.path}
                 placeholder="开始书写..."
                onBlur={() => void persistDraft()}
                className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-neutral-950"
              />
            </div>

            <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div>
                   <h2 className="text-sm font-semibold">工作台</h2>
                   <div className="mt-0.5 text-[11px] text-neutral-500">{workbench?.artifact_id ?? '暂无产物'}</div>
                </div>
                <button
                  onClick={() => void loadWorkbench(active.frontmatter.id, true)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                   {loadingWorkbench ? '分析中...' : '分析'}
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
                <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                   <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">摘要</div>
                  <p className="mt-2 text-sm leading-5 text-neutral-800 dark:text-neutral-100">
                     {workbench?.payload.summary || '暂无摘要。'}
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
                   <SectionTitle title={`建议 ${workbench?.payload.suggestions.length ?? 0}`} />
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
                     <Empty label="暂无建议。" />
                  )}
                </section>

                <section className="space-y-2">
                   <SectionTitle title={`关联 ${workbench?.payload.relations.length ?? 0}`} />
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
                     <Empty label="暂无关联。" />
                  )}
                </section>

                <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                   <SectionTitle title="上下文" />
                   <Meta label="路径" value={active.path} />
                   <Meta label="字数" value={String(active.frontmatter.word_count ?? 0)} />
                   <Meta label="来源" value={formatSource(active)} />
                   <Meta label="反向链接" value={active.frontmatter.backlinks.join(', ') || '无'} />
                   <Meta label="出站链接" value={active.frontmatter.links_out.join(', ') || '无'} />
                  <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                     Synthesis 引用
                    <input
                      value={synthesisRef}
                      onChange={(event) => setSynthesisRef(event.target.value)}
                      onBlur={() => void persistDraft()}
                       placeholder="产物 ID"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 normal-case tracking-normal dark:border-neutral-800 dark:bg-neutral-950"
                    />
                  </label>
                </section>
              </div>
            </aside>
          </div>
        ) : (
           <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">选择或新建一篇笔记。</div>
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

function SaveStatusPill({
  status,
  error
}: {
  status: SaveStatus;
  error: string | null;
}): JSX.Element {
  const label = status === 'dirty' ? '未保存' : status === 'saving' ? '保存中' : status === 'error' ? '错误' : '已保存';
  const tone =
    status === 'dirty'
      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
      : status === 'saving'
        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200'
        : status === 'error'
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  return (
    <span title={error ?? undefined} className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${tone}`}>
      {label}
    </span>
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
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${tone}`}>{bucketLabel(bucket)}</span>;
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
        {busy ? '处理中...' : '接受'}
      </button>
      <button
        disabled={disabled}
        onClick={onDismiss}
        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-[11px] disabled:opacity-40 dark:border-neutral-700"
      >
        忽略
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: NoteSuggestionStatus }): JSX.Element {
  return <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-800">{suggestionStatusLabel(status)}</span>;
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

function clearAutosaveTimer(timerRef: { current: number | null }): void {
  if (timerRef.current) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function draftFromNote(note: Note): NoteDraft {
  return {
    title: note.frontmatter.title ?? '',
    body: note.body,
    tags: note.frontmatter.tags.join(', '),
    areas: (note.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '),
    resourceRefs: (note.frontmatter.resource_refs ?? []).join(', '),
    synthesisRef: note.frontmatter.synthesis_ref ?? ''
  };
}

function serializeDraft(noteId: string, draft: NoteDraft): string {
  return JSON.stringify({
    noteId,
    title: draft.title,
    body: draft.body,
    tags: draft.tags,
    areas: draft.areas,
    resourceRefs: draft.resourceRefs,
    synthesisRef: draft.synthesisRef
  });
}

function draftToUpdate(draft: NoteDraft, note: Note): {
  title: string;
  body: string;
  tags: string[];
  areas: NoteAreaRef[];
  resource_refs: string[];
  synthesis_ref?: string;
} {
  return {
    title: draft.title,
    body: draft.body,
    tags: splitCsv(draft.tags),
    areas: parseAreas(draft.areas, note.frontmatter.areas),
    resource_refs: splitCsv(draft.resourceRefs),
    synthesis_ref: draft.synthesisRef.trim() || undefined
  };
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
  if (!source) return '手动';
  return [source.kind, source.ref].filter(Boolean).join(': ');
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function bucketLabel(bucket: NoteWorkbenchBucket | 'all'): string {
  if (bucket === 'all') return '全部';
  if (bucket === 'inbox') return '收件箱';
  if (bucket === 'connect') return '连接';
  if (bucket === 'express') return '表达';
  if (bucket === 'settled') return '已沉淀';
  return bucket;
}

function noteTypeLabel(type: NoteType): string {
  if (type === 'thought') return '想法';
  if (type === 'longform') return '长文';
  if (type === 'capture') return '捕获';
  if (type === 'voice_log') return '语音日志';
  if (type === 'daily_summary') return '每日摘要';
  return type;
}

function paraKindLabel(kind: string): string {
  if (kind === 'floating') return '浮动';
  if (kind === 'project') return '项目';
  if (kind === 'area') return 'Area';
  if (kind === 'resource') return '资源';
  if (kind === 'archive') return '归档';
  return kind;
}

function suggestionStatusLabel(status: NoteSuggestionStatus): string {
  if (status === 'proposed') return '待确认';
  if (status === 'accepted') return '已接受';
  if (status === 'dismissed') return '已忽略';
  return status;
}
