import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { groupByStatus, moveTask } from '@shared/kanban';
import type {
  CreateResourceInput,
  LinkResourceRefInput,
  Resource,
  ResourceRef,
  ResourceRefKind,
  ResourceSection,
  ResourceStatus,
  ResourceSuggestion,
  ResourceSummary
} from '@shared/resource';
import type { SynthesisArtifact } from '@shared/synthesis';
import { SynthesisActionCard } from '../components/synthesis';
import { NewTaskModal } from '../components/Modals/NewTaskModal';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { SpaceMaterialsView } from './ProjectMaterialsView';
import { SpaceOutputsView } from './SpaceOutputsView';

const KanbanBoard = lazy(() => import('../components/KanbanBoard'));

const RESOURCE_SECTIONS: ResourceSection[] = ['canonical', 'distilled', 'related', 'people', 'projects_touched'];
const REF_KINDS: ResourceRefKind[] = ['note', 'library_item', 'kb_item', 'project', 'area', 'person', 'url'];
const RESOURCE_STATUSES: ResourceStatus[] = ['active', 'dormant', 'evolved', 'archived'];

export type ResourceRoomTab = 'overview' | 'kanban' | 'materials' | 'outputs' | 'chat' | 'timeline';

export const RESOURCE_ROOM_TABS: Array<{ id: ResourceRoomTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'kanban', label: '看板' },
  { id: 'materials', label: '素材' },
  { id: 'outputs', label: '产出' },
  { id: 'chat', label: '对话' },
  { id: 'timeline', label: '时间线' }
];

function isResourceRoomTab(value: string | null): value is ResourceRoomTab {
  return RESOURCE_ROOM_TABS.some((tab) => tab.id === value);
}

export interface ResourceViewProps {
  resourceSlug?: string | null;
  showResourceList?: boolean;
}

export function ResourceView({
  resourceSlug = null,
  showResourceList = true
}: ResourceViewProps = {}): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const setView = usePara((s) => s.setView);
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(resourceSlug);
  const [active, setActive] = useState<Resource | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [suggestions, setSuggestions] = useState<ResourceSuggestion[]>([]);
  const [suggestionArtifacts, setSuggestionArtifacts] = useState<Record<string, SynthesisArtifact | null>>({});
  const [scopedChatMessage, setScopedChatMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabKey = `orbit.resourceRoom.tab.${activeSlug ?? '__none__'}`;
  const [tab, setTabRaw] = useState<ResourceRoomTab>(() => {
    try {
      return isResourceRoomTab(localStorage.getItem(tabKey)) ? (localStorage.getItem(tabKey) as ResourceRoomTab) : 'overview';
    } catch {
      return 'overview';
    }
  });

  const setTab = useCallback(
    (next: ResourceRoomTab) => {
      setTabRaw(next);
      try {
        localStorage.setItem(tabKey, next);
      } catch {
        /* ignore */
      }
    },
    [tabKey]
  );

  const reload = useCallback(
    async (nextSlug: string | null | undefined = activeSlug): Promise<void> => {
      const list = await window.orbit.resources.list();
      setResources(list);
      const slug = nextSlug === undefined
        ? resourceSlug ?? (showResourceList ? (list[0]?.frontmatter.slug ?? null) : null)
        : nextSlug;
      setActiveSlug(slug);
      if (!slug) {
        setActive(null);
        return;
      }
      setActive(await window.orbit.resources.get(slug));
    },
    [activeSlug, resourceSlug, showResourceList]
  );

  const refreshTasks = useCallback(async () => {
    if (!active) {
      setTasks([]);
      return;
    }
    try {
      setTasks(await window.orbit.para.listTasks({ resource_uid: active.frontmatter.id }));
    } catch (err) {
      toast(`加载 Resource 任务失败：${(err as Error).message}`);
    }
  }, [active, toast]);

  useEffect(() => {
    void reload();
    const off = window.orbit.resources.onEvent((event) => void reload(event.resource.frontmatter.slug));
    return off;
  }, []);

  useEffect(() => {
    if (resourceSlug) void reload(resourceSlug);
  }, [resourceSlug]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    try {
      const key = `orbit.resourceRoom.tab.${activeSlug ?? '__none__'}`;
      const value = localStorage.getItem(key);
      setTabRaw(isResourceRoomTab(value) ? value : 'overview');
    } catch {
      setTabRaw('overview');
    }
  }, [activeSlug]);

  async function selectResource(slug: string): Promise<void> {
    setActiveSlug(slug);
    setActive(await window.orbit.resources.get(slug));
  }

  async function createResource(): Promise<void> {
    const trimmed = createTitle.trim();
    if (!trimmed) {
      setError('请填写 Resource 标题。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await window.orbit.resources.create({
        title: trimmed,
        body: `# ${trimmed}\n\n## 为什么重要\n\n\n## 当前理解\n\n`
      });
      setCreateTitle('');
      await reload(created.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSuggestions(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const nextSuggestions = await window.orbit.resources.suggestFromNotes({ minNotes: 2, limit: 8 });
      setSuggestions(nextSuggestions);
      const artifactIds = [...new Set(nextSuggestions.map((item) => item.synthesis_ref).filter((id): id is string => Boolean(id)))];
      const artifacts = await Promise.all(artifactIds.map(async (id) => [id, await window.orbit.synthesis.getArtifact(id)] as const));
      setSuggestionArtifacts(Object.fromEntries(artifacts));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createFromSuggestion(suggestion: ResourceSuggestion): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await window.orbit.resources.createFromSuggestion({ suggestion });
      await reload(created.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDropTask(taskId: string, target: TaskStatus): Promise<void> {
    const { next, moved } = moveTask(tasks, taskId, target);
    if (!moved) return;
    setTasks(next);
    try {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (task.source === 'file') await window.orbit.task.updateFrontmatter(task.filePath, { status: target });
      else await window.orbit.para.updateTaskStatus(task.id, target);
    } catch (err) {
      toast(`状态更新失败：${(err as Error).message}`);
      await refreshTasks();
    }
  }

  async function openScopedChat(): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const scope = { kind: 'resource' as const, resource_slug: active.frontmatter.slug };
      // Phase E.3：先复用该 resource 的最近活跃会话；没有才新建。
      const existing = await window.orbit.chat
        .getLastActiveConversation(scope)
        .catch(() => null);
      if (existing) {
        setScopedChatMessage(`正在恢复限定范围对话：${existing.title ?? existing.id}`);
        setView({ kind: 'askAnywhere', activeId: existing.id });
        return;
      }
      const conversation = await window.orbit.chat.createConversation({
        anchor: {
          kind: 'ask_anywhere_session',
          refId: `resource:${active.frontmatter.slug}`,
          addedAt: new Date().toISOString()
        },
        scope,
        title: `Resource: ${active.frontmatter.title}`
      });
      await window.orbit.chat.setLastActiveConversation(scope, conversation.id);
      setScopedChatMessage(`限定范围对话已准备好：${conversation.title ?? conversation.id}`);
      setView({ kind: 'askAnywhere', activeId: conversation.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo(() => groupByStatus(tasks), [tasks]);

  return (
    <div className="flex h-full min-h-0">
      {showResourceList ? (
        <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40">
          <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div>
              <h1 className="text-lg font-semibold">Resources</h1>
              <p className="text-xs text-neutral-500">承载长期兴趣的知识空间。</p>
            </div>
            <div className="flex gap-2">
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="新 Resource 标题"
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
              <button onClick={() => void createResource()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">
                创建
              </button>
            </div>
            <button onClick={() => void loadSuggestions()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              从笔记建议
            </button>
            {error ? <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {resources.map((resource) => (
              <button
                key={resource.frontmatter.id}
                onClick={() => void selectResource(resource.frontmatter.slug)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                  activeSlug === resource.frontmatter.slug ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="truncate font-medium">{resource.frontmatter.title}</div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {resourceDepthLabel(resource.frontmatter.depth)} · {resource.frontmatter.engagement_count} 次互动 · {resource.counts.distilled} 条提炼
                </div>
              </button>
            ))}
            {suggestions.length > 0 ? (
              <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">浮现主题</div>
                {suggestions.map((suggestion) => (
                  <SynthesisActionCard
                    key={suggestion.tag}
                    artifact={suggestion.synthesis_ref ? suggestionArtifacts[suggestion.synthesis_ref] : null}
                    title={suggestion.topic}
                    description={`${suggestion.note_count} 条笔记 · ${Math.round(suggestion.confidence * 100)}% 置信度`}
                    primaryLabel="创建"
                    onPrimary={() => void createFromSuggestion(suggestion)}
                    onRefresh={() => void loadSuggestions()}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <ResourceHeader
              resource={active}
              busy={busy}
              onArchive={async () => {
                await window.orbit.resources.archive(active.frontmatter.slug);
                setActiveSlug(null);
                if (!showResourceList) setView({ kind: 'resources' });
                await reload(null);
              }}
              onStatus={(status) => window.orbit.resources.update(active.frontmatter.slug, { status }).then(() => reload(active.frontmatter.slug))}
              onDepth={(depth) => window.orbit.resources.update(active.frontmatter.slug, { depth }).then(() => reload(active.frontmatter.slug))}
            />
            <div className="flex shrink-0 border-b border-neutral-200 px-4 text-sm dark:border-neutral-800">
              {RESOURCE_ROOM_TABS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`border-b-2 px-4 py-2 text-sm transition-colors ${
                    tab === item.id
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'overview' ? 'flex' : 'hidden'}`}>
              <ResourceOverview
                resource={active}
                scopedChatMessage={scopedChatMessage}
                onReload={() => reload(active.frontmatter.slug)}
              />
            </div>
            <div className={`min-h-0 flex-1 flex-col overflow-hidden p-4 ${tab === 'kanban' ? 'flex' : 'hidden'}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-neutral-500">{tasks.length} 个 Resource 任务</div>
                <button
                  onClick={() => setNewTaskOpen(true)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  创建任务
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <Suspense fallback={<p className="text-sm text-neutral-500">正在加载看板...</p>}>
                  <KanbanBoard columns={columns} onDrop={onDropTask} onStatus={onDropTask} />
                </Suspense>
              </div>
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'materials' ? 'flex' : 'hidden'}`}>
              <SpaceMaterialsView spaceId={active.frontmatter.id} spaceName={active.frontmatter.title} spaceLabel="resource" />
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'outputs' ? 'flex' : 'hidden'}`}>
              <SpaceOutputsView spaceId={active.frontmatter.id} spaceLabel="resource" />
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'chat' ? 'flex' : 'hidden'}`}>
              <ResourceChatTab resource={active} busy={busy} error={error} onOpen={() => void openScopedChat()} />
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'timeline' ? 'flex' : 'hidden'}`}>
              <ResourceTimeline resource={active} />
            </div>
            <NewTaskModal
              open={newTaskOpen}
              resourceUid={active.frontmatter.id}
              siblings={tasks.filter((task) => task.source === 'file')}
              onClose={() => setNewTaskOpen(false)}
              onCreated={() => void refreshTasks()}
            />
          </>
        ) : (
           <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">请从侧边栏选择一个 Resource。</div>
        )}
      </section>
    </div>
  );
}

function ResourceHeader({
  resource,
  busy,
  onArchive,
  onStatus,
  onDepth
}: {
  resource: Resource;
  busy: boolean;
  onArchive(): Promise<void>;
  onStatus(status: ResourceStatus): Promise<unknown>;
  onDepth(depth: Resource['frontmatter']['depth']): Promise<unknown>;
}): JSX.Element {
  return (
    <header className="flex items-center gap-2 border-b border-neutral-200 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Resource 房间</div>
        <h2 className="truncate text-lg font-semibold">{resource.frontmatter.title}</h2>
        <p className="text-xs text-neutral-500">{resource.frontmatter.slug}</p>
      </div>
      <select
        value={resource.frontmatter.status}
        onChange={(event) => void onStatus(event.target.value as ResourceStatus)}
        className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        {RESOURCE_STATUSES.map((status) => (
          <option key={status} value={status}>{resourceStatusLabel(status)}</option>
        ))}
      </select>
      <select
        value={resource.frontmatter.depth}
        onChange={(event) => void onDepth(event.target.value as Resource['frontmatter']['depth'])}
        className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        {['exploring', 'practicing', 'mastered', 'teaching'].map((depth) => (
          <option key={depth} value={depth}>{resourceDepthLabel(depth as Resource['frontmatter']['depth'])}</option>
        ))}
      </select>
      <button onClick={() => void onArchive()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
        归档
      </button>
      {busy ? <span className="text-xs text-neutral-500">处理中...</span> : null}
    </header>
  );
}

export function ResourceOverview({
  resource,
  scopedChatMessage,
  onReload
}: {
  resource: Resource;
  scopedChatMessage: string | null;
  onReload(): void | Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState(resource.frontmatter.title);
  const [body, setBody] = useState(resource.body);
  const [tags, setTags] = useState(resource.frontmatter.tags.join(', '));
  const [areas, setAreas] = useState((resource.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
  const [evolvedTo, setEvolvedTo] = useState(resource.frontmatter.evolved_to ?? '');
  const [linkRef, setLinkRef] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkKind, setLinkKind] = useState<ResourceRefKind>('note');
  const [linkSection, setLinkSection] = useState<ResourceSection>('distilled');
  const [engagementTitle, setEngagementTitle] = useState('');
  const [engagementSummary, setEngagementSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refsBySection = useMemo(() => groupRefs(resource.refs), [resource.refs]);

  useEffect(() => {
    setTitle(resource.frontmatter.title);
    setBody(resource.body);
    setTags(resource.frontmatter.tags.join(', '));
    setAreas((resource.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setEvolvedTo(resource.frontmatter.evolved_to ?? '');
  }, [resource.frontmatter.id, resource.frontmatter.updated, resource.body]);

  async function saveResource(): Promise<void> {
    try {
      setError(null);
      await window.orbit.resources.update(resource.frontmatter.slug, {
        title,
        body,
        tags: splitTags(tags),
        areas: splitAreas(areas),
        evolved_to: evolvedTo.trim() || undefined
      });
      await onReload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addRef(): Promise<void> {
    if (!linkRef.trim()) return;
    try {
      const input: LinkResourceRefInput = {
        kind: linkKind,
        ref: linkRef.trim(),
        section: linkSection,
        source: 'manual'
      };
      if (linkTitle.trim()) input.title = linkTitle.trim();
      await window.orbit.resources.linkRef(resource.frontmatter.slug, input);
      setLinkRef('');
      setLinkTitle('');
      await onReload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function recordEngagement(): Promise<void> {
    try {
      await window.orbit.resources.engage(resource.frontmatter.slug, {
        title: engagementTitle.trim() || 'Resource 互动',
        summary: engagementSummary.trim() || undefined
      });
      setEngagementTitle('');
      setEngagementSummary('');
      await onReload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const primaryArea = resource.frontmatter.areas?.find((area) => area.primary) ?? resource.frontmatter.areas?.[0];
  const latestTimeline = resource.timeline.at(-1);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-neutral-50 p-5 dark:bg-neutral-950/40">
      <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="space-y-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            {error ? <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">Resource 空间</div>
                <h2 className="mt-1 truncate text-2xl font-semibold">{resource.frontmatter.title}</h2>
                <p className="mt-1 font-mono text-xs text-neutral-500">03_Resources/{resource.frontmatter.slug}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {resource.frontmatter.tags.length === 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-900">未打标签</span>
                ) : (
                  resource.frontmatter.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">#{tag}</span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ResourceStat label="深度" value={resourceDepthLabel(resource.frontmatter.depth)} />
              <ResourceStat label="互动" value={String(resource.frontmatter.engagement_count)} />
              <ResourceStat label="引用" value={String(resource.refs.length)} />
              <ResourceStat label="主 Area" value={primaryArea?.area_slug ?? '无'} />
            </div>
            {scopedChatMessage ? <div className="mt-4 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">{scopedChatMessage}</div> : null}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-3 flex items-center justify-between">
              <div>
                 <h3 className="text-sm font-semibold">当前理解</h3>
                 <p className="text-xs text-neutral-500">这个 Resource 的持久信息层。</p>
              </div>
               <button onClick={() => void saveResource()} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">保存</button>
            </div>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} className="h-72 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-6 outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900/60" />
            <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
              <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-300">编辑元数据</summary>
              <div className="mt-3 space-y-2">
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题" className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用英文逗号分隔" className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={areas} onChange={(event) => setAreas(event.target.value)} placeholder="Areas，用英文逗号分隔" className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                  <input value={evolvedTo} onChange={(event) => setEvolvedTo(event.target.value)} placeholder="演化到的 Resource slug" className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                </div>
              </div>
            </details>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {RESOURCE_SECTIONS.map((section) => (
              <ResourceRefsSection key={section} section={section} refs={refsBySection.get(section) ?? []} resource={resource} onReload={onReload} />
            ))}
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
             <h2 className="text-sm font-semibold">链接素材</h2>
             <p className="mt-1 text-xs text-neutral-500">关联 Layer 1 笔记、资料库条目、项目、Area、人物或 URL。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select value={linkKind} onChange={(event) => setLinkKind(event.target.value as ResourceRefKind)} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                 {REF_KINDS.map((kind) => <option key={kind} value={kind}>{resourceRefKindLabel(kind)}</option>)}
              </select>
              <select value={linkSection} onChange={(event) => setLinkSection(event.target.value as ResourceSection)} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                {RESOURCE_SECTIONS.map((section) => <option key={section} value={section}>{labelForSection(section)}</option>)}
              </select>
            </div>
             <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="可选标题" className="mt-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
             <input value={linkRef} onChange={(event) => setLinkRef(event.target.value)} placeholder="路径、URL 或 ID" className="mt-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
             <button onClick={() => void addRef()} className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-xs text-white">链接</button>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
             <h2 className="text-sm font-semibold">记录互动</h2>
             <p className="mt-1 text-xs text-neutral-500">捕捉一次有意义的触达，让这个 Resource 保留轨迹。</p>
             <input value={engagementTitle} onChange={(event) => setEngagementTitle(event.target.value)} placeholder="发生了什么变化？" className="mt-3 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
             <textarea value={engagementSummary} onChange={(event) => setEngagementSummary(event.target.value)} placeholder="简短记录" className="mt-2 h-20 w-full resize-none rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
             <button onClick={() => void recordEngagement()} className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">记录</button>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
             <h2 className="text-sm font-semibold">最新动态</h2>
            {latestTimeline ? (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
                <div className="font-medium">{latestTimeline.title}</div>
                <div className="mt-1 text-[11px] text-neutral-500">{latestTimeline.at}</div>
                {latestTimeline.summary ? <p className="mt-2 text-neutral-600 dark:text-neutral-300">{latestTimeline.summary}</p> : null}
              </div>
            ) : (
               <p className="mt-3 text-xs text-neutral-500">暂无动态。</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ResourceStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function ResourceRefsSection({
  section,
  refs,
  resource,
  onReload
}: {
  section: ResourceSection;
  refs: ResourceRef[];
  resource: Resource;
  onReload(): void | Promise<void>;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{labelForSection(section)}</div>
      <div className="mt-2 space-y-2">
        {refs.length === 0 ? <p className="text-xs text-neutral-500">暂无引用。</p> : null}
        {refs.map((ref) => (
          <div key={ref.id} className="rounded-lg bg-neutral-50 p-2 text-xs dark:bg-neutral-900">
            <div className="font-medium">{ref.title ?? ref.ref}</div>
            <div className="truncate text-neutral-500">{ref.kind} · {ref.ref}</div>
            {ref.section !== 'canonical' ? (
              <button
                onClick={() => void window.orbit.resources.promoteRef(resource.frontmatter.slug, { ref_id: ref.id }).then(() => onReload())}
                className="mt-1 mr-2 text-[11px] text-sky-600"
              >
                 提升为 canonical
              </button>
            ) : null}
            <button
              onClick={() => void window.orbit.resources.unlinkRef(resource.frontmatter.slug, ref.id).then(() => onReload())}
              className="mt-1 text-[11px] text-red-500"
            >
               取消链接
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceChatTab({
  resource,
  busy,
  error,
  onOpen
}: {
  resource: Resource;
  busy: boolean;
  error: string | null;
  onOpen(): void;
}): JSX.Element {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-base font-semibold">Resource 限定对话</h2>
        <p className="mt-2 text-sm text-neutral-500">
          启动限定到 {resource.frontmatter.title} 的对话；Orbit 会将这个 Resource 作为上下文。
        </p>
        {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
        <button onClick={onOpen} disabled={busy} className="mt-4 rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50">
          {busy ? '打开中...' : '打开 Resource 对话'}
        </button>
      </div>
    </section>
  );
}

function ResourceTimeline({ resource }: { resource: Resource }): JSX.Element {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">时间线</h2>
        <p className="text-xs text-neutral-500">这个 Resource 的互动与整理历史。</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {resource.timeline.slice().reverse().map((entry) => (
            <article key={entry.id} className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="font-medium">{entry.title}</div>
              <div className="text-[11px] text-neutral-500">{entry.at}</div>
              {entry.summary ? <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{entry.summary}</div> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function groupRefs(refs: ResourceRef[]): Map<ResourceSection, ResourceRef[]> {
  const map = new Map<ResourceSection, ResourceRef[]>();
  for (const section of RESOURCE_SECTIONS) map.set(section, []);
  for (const ref of refs) map.get(ref.section)?.push(ref);
  return map;
}

function splitTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function splitAreas(value: string): NonNullable<CreateResourceInput['areas']> {
  return value
    .split(',')
    .map((area) => area.trim())
    .filter(Boolean)
    .map((area, index) => ({
      area_slug: area.toLowerCase().replace(/\s+/g, '-'),
      primary: index === 0,
      assigned_at: new Date().toISOString(),
      assigned_by: 'user' as const
    }));
}

function labelForSection(section: ResourceSection): string {
  const labels: Record<ResourceSection, string> = {
    canonical: 'canonical',
    distilled: '已提炼',
    related: '相关',
    people: '人物',
    projects_touched: '触达项目'
  };
  return labels[section];
}

function resourceStatusLabel(status: ResourceStatus): string {
  const labels: Record<ResourceStatus, string> = {
    active: '活跃',
    dormant: '沉睡',
    evolved: '已演化',
    archived: '已归档'
  };
  return labels[status];
}

function resourceDepthLabel(depth: Resource['frontmatter']['depth']): string {
  const labels: Record<Resource['frontmatter']['depth'], string> = {
    exploring: '探索中',
    practicing: '练习中',
    mastered: '已掌握',
    teaching: '可教学'
  };
  return labels[depth] ?? depth;
}

function resourceRefKindLabel(kind: ResourceRefKind): string {
  const labels: Record<ResourceRefKind, string> = {
    note: '笔记',
    library_item: '资料库条目',
    kb_item: '知识库条目',
    project: '项目',
    area: 'Area',
    person: '人物',
    url: 'URL'
  };
  return labels[kind];
}
