import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Eye,
  Gauge,
  Inbox,
  Layers,
  LayoutGrid,
  Library as LibraryIcon,
  ListTodo,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X
} from 'lucide-react';
import type { ActivityEvent } from '@shared/activity';
import {
  DASHBOARD_WIDGET_REGISTRY,
  type DashboardLayout,
  type DashboardSummary,
  type DashboardWidgetDefinition,
  type DashboardWidgetId,
  type DashboardWidgetInstance,
  type DashboardWidgetRegistry,
  type DashboardWidgetSize
} from '@shared/dashboard';
import type { FeedItem, FeedSource } from '@shared/feed';
import type { LibraryItem } from '@shared/library';
import type { ResourceSummary } from '@shared/resource';
import type { TaskExecutionMode, TaskRecord, TaskStatus } from '@shared/schemas';
import { taskExecutionMode } from '@shared/schemas';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { useTaskDetails } from '../store/taskDetails';
import { VisionEditorModal } from '../components/Modals/VisionEditorModal';
import { cleanVisionExcerpt } from './dashboardText';

const surfaceCls =
  'rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950';
const subtleCls = 'text-xs text-neutral-500 dark:text-neutral-400';

export function DashboardView(): JSX.Element {
  const vault = useWorkspace((s) => s.vault);
  const vision = useWorkspace((s) => s.visionExcerpt);
  const refreshVision = useWorkspace((s) => s.refreshVision);
  const projects = useWorkspace((s) => s.projects);
  const areas = useWorkspace((s) => s.areas);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const refreshAreas = useWorkspace((s) => s.refreshAreas);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const entities = usePara((s) => s.entities);
  const tasks = usePara((s) => s.tasks);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const openTask = useTaskDetails((s) => s.openTask);
  const [editVision, setEditVision] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [registry, setRegistry] = useState<DashboardWidgetRegistry>(DASHBOARD_WIDGET_REGISTRY);
  const [layout, setLayout] = useState<DashboardLayout>(DASHBOARD_WIDGET_REGISTRY.defaultLayout);
  const [feedSources, setFeedSources] = useState<FeedSource[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [autoRunnerBusy, setAutoRunnerBusy] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const definitionById = useMemo(
    () => new Map(registry.widgets.map((definition) => [definition.id, definition])),
    [registry.widgets]
  );

  const loadDashboard = useCallback(async () => {
    if (!vault) return;
    setLoadingSummary(true);
    try {
      const [
        nextSummary,
        nextRegistry,
        nextLayout,
        nextFeedSources,
        nextFeedItems,
        nextLibraryItems,
        nextResources
      ] = await Promise.all([
        window.orbit.dashboard.summary(),
        window.orbit.dashboard.registry(),
        window.orbit.dashboard.layout(),
        safe(window.orbit.feeds.listSources(), []),
        safe(window.orbit.feeds.listItems({ include_saved: true }), []),
        safe(window.orbit.library.list({ include_archived: false }), []),
        safe(window.orbit.resources.list({ include_archived: false }), [])
      ]);
      setSummary(nextSummary);
      setRegistry(nextRegistry);
      setLayout(nextLayout);
      setFeedSources(nextFeedSources);
      setFeedItems(nextFeedItems);
      setLibraryItems(nextLibraryItems);
      setResources(nextResources);
    } catch (error) {
      toast(`仪表盘刷新失败：${(error as Error).message}`);
    } finally {
      setLoadingSummary(false);
    }
  }, [toast, vault]);

  useEffect(() => {
    void refreshVision();
    void refreshProjects();
    void refreshAreas();
    void loadDashboard();
  }, [loadDashboard, refreshAreas, refreshProjects, refreshVision]);

  useEffect(() => {
    if (!vault) return;
    const refresh = (): void => {
      void refreshProjects();
      void refreshAreas();
      void loadDashboard();
    };
    const offFs = window.orbit.fs.onEvent(refresh);
    const offInbox = window.orbit.inbox.onEvent(refresh);
    const offEvents = window.orbit.events.onEvent(refresh);
    const offAutoRunner = window.orbit.autoRunner.onEvent(refresh);
    const offRuntime = window.orbit.runtime.onEvent(refresh);
    const offFeeds = window.orbit.feeds.onEvent(refresh);
    const offResources = window.orbit.resources.onEvent(refresh);
    const offAreas = window.orbit.area.onEvent(refresh);
    return () => {
      offFs();
      offInbox();
      offEvents();
      offAutoRunner();
      offRuntime();
      offFeeds();
      offResources();
      offAreas();
    };
  }, [loadDashboard, refreshAreas, refreshProjects, vault]);

  const paraCounts = useMemo(() => {
    const active = projects.filter((project) => project.status !== 'archived').length;
    const archived =
      entities.filter((entity) => entity.type === 'archive').length +
      projects.filter((project) => project.status === 'archived').length;
    const resourceCount = resources.length || entities.filter((entity) => entity.type === 'resource').length;
    return { active, areas: areas.length, resources: resourceCount, archived };
  }, [areas.length, entities, projects, resources.length]);

  const projectByUid = useMemo(
    () => new Map(projects.map((project) => [project.uid, project])),
    [projects]
  );

  const projectRows = useMemo(() => {
    return projects
      .filter((project) => project.status !== 'archived')
      .map((project) => {
        const projectTasks = tasks.filter((task) => task.project_uid === project.uid);
        const open = projectTasks.filter((task) => task.status !== 'done').length;
        const doing = projectTasks.filter((task) => task.status === 'doing').length;
        const blocked = projectTasks.filter((task) => task.status === 'blocked').length;
        const ready = projectTasks.filter(
          (task) => task.status === 'todo' || task.status === 'waiting'
        ).length;
        return { project, open, doing, blocked, ready };
      })
      .sort((a, b) => {
        const pressureA = a.blocked * 10 + a.doing * 4 + a.ready;
        const pressureB = b.blocked * 10 + b.doing * 4 + b.ready;
        return pressureB - pressureA || a.project.name.localeCompare(b.project.name);
      });
  }, [projects, tasks]);

  const priorityTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== 'done')
        .sort(compareDashboardTasks)
        .slice(0, 8),
    [tasks]
  );

  const enabledWidgets = useMemo(
    () =>
      layout.widgets
        .filter((instance) => instance.enabled && definitionById.has(instance.widgetId))
        .sort((a, b) => a.order - b.order),
    [definitionById, layout.widgets]
  );

  const doingTasks = tasks.filter((task) => task.status === 'doing').length;
  const blockedTasks =
    summary?.pending.blockedTasks ?? tasks.filter((task) => task.status === 'blocked').length;
  const pendingTasks =
    summary?.pending.pendingTasks ??
    tasks.filter((task) => task.status === 'waiting' || task.status === 'todo').length;
  const inboxPending = summary?.pending.inboxPending ?? 0;
  const readyCount = pendingTasks + inboxPending;
  const promoted =
    (summary?.knowledge.promotedToProject ?? 0) + (summary?.knowledge.promotedToResource ?? 0);
  const visionText = cleanVisionExcerpt(vision);

  function openProject(projectUid: string): void {
    setActiveProjectUid(projectUid);
    setView({ kind: 'project', projectUid });
  }

  function openTaskDetail(task: TaskRecord): void {
    if (task.project_uid) setActiveProjectUid(task.project_uid);
    openTask(task, task.project_uid ?? null);
  }

  async function generateDailyReview(): Promise<void> {
    setGeneratingReview(true);
    try {
      const review = await window.orbit.review.generate();
      await openPath(review.path);
      toast(`每日复盘已生成：${review.recommendedTaskUids.length} 个推荐任务`);
      await loadDashboard();
    } catch (error) {
      toast(`每日复盘失败：${(error as Error).message}`);
    } finally {
      setGeneratingReview(false);
    }
  }

  async function toggleAutoRunner(): Promise<void> {
    setAutoRunnerBusy(true);
    try {
      const next = summary?.agent.autoRunnerEnabled
        ? await window.orbit.autoRunner.stop()
        : await window.orbit.autoRunner.start();
      toast(next.enabled ? '自动执行已启用' : '自动执行已暂停');
      await loadDashboard();
    } catch (error) {
      toast(`自动执行更新失败：${(error as Error).message}`);
    } finally {
      setAutoRunnerBusy(false);
    }
  }

  async function persistLayout(next: DashboardLayout): Promise<void> {
    setSavingLayout(true);
    setLayout(next);
    try {
      setLayout(await window.orbit.dashboard.saveLayout(next));
    } catch (error) {
      toast(`仪表盘布局保存失败：${(error as Error).message}`);
      await loadDashboard();
    } finally {
      setSavingLayout(false);
    }
  }

  async function resetLayout(): Promise<void> {
    setSavingLayout(true);
    try {
      setLayout(await window.orbit.dashboard.resetLayout());
      toast('仪表盘布局已恢复默认');
    } catch (error) {
      toast(`仪表盘布局重置失败：${(error as Error).message}`);
    } finally {
      setSavingLayout(false);
    }
  }

  function updateWidget(widgetId: DashboardWidgetId, patch: Partial<DashboardWidgetInstance>): void {
    const definition = definitionById.get(widgetId);
    if (!definition) return;
    const exists = layout.widgets.some((instance) => instance.widgetId === widgetId);
    const widgets = exists
      ? layout.widgets.map((instance) =>
          instance.widgetId === widgetId ? { ...instance, ...patch } : instance
        )
      : [
          ...layout.widgets,
          {
            instanceId: `${widgetId}:default`,
            widgetId,
            size: definition.defaultSize,
            enabled: true,
            order: layout.widgets.length,
            ...patch
          }
        ];
    void persistLayout({ ...layout, preset: 'custom', widgets: reorderWidgets(widgets), updatedAt: new Date().toISOString() });
  }

  function moveWidget(widgetId: DashboardWidgetId, direction: -1 | 1): void {
    const widgets = reorderWidgets(layout.widgets);
    const index = widgets.findIndex((instance) => instance.widgetId === widgetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void persistLayout({ ...layout, preset: 'custom', widgets: reorderWidgets(next), updatedAt: new Date().toISOString() });
  }

  function cycleWidgetSize(instance: DashboardWidgetInstance): void {
    const definition = definitionById.get(instance.widgetId);
    if (!definition) return;
    const currentIndex = definition.sizes.indexOf(instance.size);
    const size = definition.sizes[(currentIndex + 1) % definition.sizes.length] ?? definition.defaultSize;
    updateWidget(instance.widgetId, { size });
  }

  function renderWidget(instance: DashboardWidgetInstance): ReactNode {
    const definition = definitionById.get(instance.widgetId);
    if (!definition) return null;
    const surface = (children: ReactNode): JSX.Element => (
      <WidgetSurface
        definition={definition}
        instance={instance}
        customizing={customizing}
        saving={savingLayout}
        onMove={moveWidget}
        onToggle={(widgetId) => updateWidget(widgetId, { enabled: false })}
        onCycleSize={cycleWidgetSize}
      >
        {children}
      </WidgetSurface>
    );

    switch (instance.widgetId) {
      case 'north-star':
        return surface(
          <NorthStarContent
            vision={visionText}
            dailyReviewAvailable={summary?.thinking.dailyReviewAvailable ?? false}
            visionDaysSinceReview={summary?.thinking.visionDaysSinceReview ?? null}
            generatingReview={generatingReview}
            onEditVision={() => setEditVision(true)}
            onOpenReview={async () => {
              if (summary?.thinking.dailyReviewPath) await openPath(summary.thinking.dailyReviewPath);
            }}
            onGenerateReview={() => void generateDailyReview()}
          />
        );
      case 'decision-queue':
        return surface(
          <MetricWidgetContent
            icon={<Inbox size={18} />}
            value={inboxPending}
            detail="等待审核的收件箱条目"
            tone={inboxPending > 0 ? 'rose' : 'neutral'}
            onClick={() => setView({ kind: 'inbox' })}
          />
        );
      case 'ready-work':
        return surface(
          <MetricWidgetContent
            icon={<ListTodo size={18} />}
            value={readyCount}
            detail={`${pendingTasks} 个任务，加 ${inboxPending} 个决策`}
            tone={readyCount > 0 ? 'sky' : 'neutral'}
            onClick={() => setView({ kind: 'kanban', projectUid: null })}
          />
        );
      case 'blocked-work':
        return surface(
          <MetricWidgetContent
            icon={<AlertTriangle size={18} />}
            value={blockedTasks}
            detail="需要介入的任务"
            tone={blockedTasks > 0 ? 'amber' : 'neutral'}
            onClick={() => setView({ kind: 'kanban', projectUid: null })}
          />
        );
      case 'agent-channel':
        return surface(
          <MetricWidgetContent
            icon={<Bot size={18} />}
            value={summary?.agent.activeRuns ?? 0}
            detail={`${doingTasks} 个进行中，今日 $${(summary?.agent.todayCostUsd ?? 0).toFixed(4)}`}
            tone={(summary?.agent.activeRuns ?? 0) > 0 ? 'emerald' : 'neutral'}
            onClick={() => setView({ kind: 'agents' })}
          />
        );
      case 'execution-queue':
        return surface(
          <ExecutionQueueContent
            rows={projectRows}
            tasks={priorityTasks}
            projectByUid={projectByUid}
            onOpenProject={openProject}
            onOpenTask={openTaskDetail}
          />
        );
      case 'knowledge-loop':
        return surface(
          <KnowledgeLoopContent
            knowledge={summary?.knowledge ?? null}
            paraCounts={paraCounts}
            promoted={promoted}
            onLibrary={() => setView({ kind: 'library' })}
            onResources={() => setView({ kind: 'resources' })}
          />
        );
      case 'feed-radar':
        return surface(
          <FeedRadarContent
            sources={feedSources}
            items={feedItems}
            onFeeds={() => setView({ kind: 'feeds' })}
          />
        );
      case 'library-digest':
        return surface(
          <LibraryDigestContent
            items={libraryItems}
            onLibrary={() => setView({ kind: 'library' })}
          />
        );
      case 'resource-momentum':
        return surface(
          <ResourceMomentumContent
            resources={resources}
            onResources={() => setView({ kind: 'resources' })}
            onOpenResource={(slug) => setView({ kind: 'resource', resourceSlug: slug })}
          />
        );
      case 'area-balance':
        return surface(
          <AreaBalanceContent
            areas={areas}
            projects={projects}
            tasks={tasks}
            resources={resources}
            libraryItems={libraryItems}
            feedSources={feedSources}
            onOpenArea={(areaUid) => setView({ kind: 'areaRoom', areaUid })}
          />
        );
      case 'system-pulse':
        return surface(
          <SystemPulseContent
            health={summary?.health ?? null}
            autoRunnerEnabled={summary?.agent.autoRunnerEnabled ?? false}
            autoRunnerBusy={autoRunnerBusy}
            onToggleAutoRunner={() => void toggleAutoRunner()}
            onConsole={() => setView({ kind: 'developerConsole' })}
            onRuntime={() => setView({ kind: 'runtimes' })}
            onDirtyProject={(projectName) => {
              const project = projects.find((item) => item.name === projectName);
              if (project) openProject(project.uid);
            }}
          />
        );
      case 'recent-activity':
        return surface(<RecentActivityContent events={summary?.thinking.recentActivities ?? []} />);
      default:
        return null;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              <LayoutGrid size={14} />
              工作台组件台
            </div>
            <h1 className="mt-1 text-xl font-semibold">仪表盘</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              由受控组件组装出的战略驾驶舱：信号可以被看见，真相仍然只通过正式入口进入 vault。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CommandButton icon={<Inbox size={14} />} onClick={() => setView({ kind: 'inbox' })}>
              收件箱
            </CommandButton>
            <CommandButton
              icon={<ListTodo size={14} />}
              onClick={() => setView({ kind: 'kanban', projectUid: null })}
            >
              看板
            </CommandButton>
            <CommandButton
              icon={<Settings2 size={14} />}
              onClick={() => setCustomizing((value) => !value)}
            >
              {customizing ? '完成组装' : '组装组件'}
            </CommandButton>
            <CommandButton
              icon={<RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />}
              onClick={() => void loadDashboard()}
            >
              刷新
            </CommandButton>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {customizing ? (
          <WidgetWorkbench
            widgets={registry.widgets}
            layout={layout}
            saving={savingLayout}
            onToggle={(widgetId, enabled) => updateWidget(widgetId, { enabled })}
            onReset={() => void resetLayout()}
          />
        ) : null}

        <div className="grid auto-rows-min grid-cols-1 gap-4 p-6 md:grid-cols-2 2xl:grid-cols-4">
          {enabledWidgets.map((instance) => (
            <div key={instance.instanceId} className={widgetSizeClass(instance.size)}>
              {renderWidget(instance)}
            </div>
          ))}
          {enabledWidgets.length === 0 ? (
            <div className="md:col-span-2 2xl:col-span-4">
              <section className={surfaceCls}>
                <EmptyState
                  title="没有启用组件"
                  detail="打开组装组件，选择至少一个组件作为仪表盘入口。"
                />
              </section>
            </div>
          ) : null}
        </div>
      </main>

      <VisionEditorModal open={editVision} onClose={() => setEditVision(false)} />
    </div>
  );
}

function WidgetSurface({
  definition,
  instance,
  customizing,
  saving,
  onMove,
  onToggle,
  onCycleSize,
  children
}: {
  definition: DashboardWidgetDefinition;
  instance: DashboardWidgetInstance;
  customizing: boolean;
  saving: boolean;
  onMove(widgetId: DashboardWidgetId, direction: -1 | 1): void;
  onToggle(widgetId: DashboardWidgetId): void;
  onCycleSize(instance: DashboardWidgetInstance): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className={`${surfaceCls} flex h-full min-h-[168px] flex-col overflow-hidden`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{definition.title}</h2>
            <WidgetBadge icon={<Layers size={11} />} label={definition.layers.map(layerLabel).join(' / ')} />
            <WidgetBadge
              icon={<ShieldCheck size={11} />}
              label={definition.permissions.map(permissionLabel).join(' / ')}
            />
          </div>
          <p className={`${subtleCls} mt-1 line-clamp-2`}>{definition.description}</p>
        </div>
        {customizing ? (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton label="上移组件" disabled={saving} onClick={() => onMove(instance.widgetId, -1)}>
              <ArrowUp size={13} />
            </IconButton>
            <IconButton label="下移组件" disabled={saving} onClick={() => onMove(instance.widgetId, 1)}>
              <ArrowDown size={13} />
            </IconButton>
            <button
              onClick={() => onCycleSize(instance)}
              disabled={saving || definition.sizes.length < 2}
              className="rounded border border-neutral-300 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {sizeLabel(instance.size)}
            </button>
            <IconButton label="隐藏组件" disabled={saving} onClick={() => onToggle(instance.widgetId)}>
              <X size={13} />
            </IconButton>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 border-t border-neutral-200 dark:border-neutral-800">{children}</div>
    </section>
  );
}

function WidgetWorkbench({
  widgets,
  layout,
  saving,
  onToggle,
  onReset
}: {
  widgets: DashboardWidgetDefinition[];
  layout: DashboardLayout;
  saving: boolean;
  onToggle(widgetId: DashboardWidgetId, enabled: boolean): void;
  onReset(): void;
}): JSX.Element {
  const enabled = new Set(layout.widgets.filter((instance) => instance.enabled).map((instance) => instance.widgetId));
  return (
    <section className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">组件库</h2>
          <p className={subtleCls}>第一版只允许内置、受控、可审计的投影组件。</p>
        </div>
        <CommandButton icon={<RefreshCw size={14} />} onClick={onReset} disabled={saving}>
          恢复默认
        </CommandButton>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {widgets.map((widget) => (
          <button
            key={widget.id}
            onClick={() => onToggle(widget.id, !enabled.has(widget.id))}
            disabled={saving}
            className={`rounded-md border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled.has(widget.id)
                ? 'border-neutral-900 bg-neutral-950 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
                : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{widget.title}</span>
              <span className="text-[11px] opacity-70">{categoryLabel(widget.category)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs opacity-75">{widget.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function NorthStarContent({
  vision,
  dailyReviewAvailable,
  visionDaysSinceReview,
  generatingReview,
  onEditVision,
  onOpenReview,
  onGenerateReview
}: {
  vision: string | null;
  dailyReviewAvailable: boolean;
  visionDaysSinceReview: number | null;
  generatingReview: boolean;
  onEditVision(): void;
  onOpenReview(): void;
  onGenerateReview(): void;
}): JSX.Element {
  return (
    <div className="p-4">
      <p className="line-clamp-5 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
        {vision && vision.trim() ? vision : 'Vision.md 为空。请先设定方向，再让系统优化执行。'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {dailyReviewAvailable ? (
          <CommandButton icon={<ClipboardCheck size={14} />} onClick={onOpenReview}>
            打开复盘
          </CommandButton>
        ) : (
          <CommandButton
            icon={<Sparkles size={14} />}
            onClick={onGenerateReview}
            disabled={generatingReview}
          >
            {generatingReview ? '生成中' : '每日复盘'}
          </CommandButton>
        )}
        <CommandButton icon={<Target size={14} />} onClick={onEditVision}>
          编辑愿景
        </CommandButton>
        <span className={subtleCls}>
          最近复盘：{visionDaysSinceReview === null ? '未知' : `${visionDaysSinceReview} 天前`}
        </span>
      </div>
    </div>
  );
}

function MetricWidgetContent({
  icon,
  value,
  detail,
  tone,
  onClick
}: {
  icon: ReactNode;
  value: number;
  detail: string;
  tone: 'neutral' | 'sky' | 'rose' | 'amber' | 'emerald';
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex h-full min-h-[116px] w-full flex-col justify-between p-4 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-900/70 ${metricToneClass(tone)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{icon}</span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
      </div>
      <p className="mt-4 text-xs opacity-75">{detail}</p>
    </button>
  );
}

function ExecutionQueueContent({
  rows,
  tasks,
  projectByUid,
  onOpenProject,
  onOpenTask
}: {
  rows: Array<{
    project: { uid: string; name: string; description?: string; relPath: string; workdirMissing?: boolean };
    open: number;
    doing: number;
    blocked: number;
    ready: number;
  }>;
  tasks: TaskRecord[];
  projectByUid: Map<string, { name: string }>;
  onOpenProject(projectUid: string): void;
  onOpenTask(task: TaskRecord): void;
}): JSX.Element {
  return (
    <div className="grid min-h-[320px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
      <div className="min-w-0">
        {rows.slice(0, 8).map((row) => (
          <button
            key={row.project.uid}
            onClick={() => onOpenProject(row.project.uid)}
            className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{row.project.name}</span>
                {row.project.workdirMissing ? (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                    工作目录缺失
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
                {row.project.description || row.project.relPath}
              </p>
            </div>
            <ProjectPressure open={row.open} ready={row.ready} doing={row.doing} blocked={row.blocked} />
            <ChevronRight size={15} className="shrink-0 text-neutral-400" />
          </button>
        ))}
        {rows.length === 0 ? (
          <EmptyState title="没有活跃项目" detail="创建或重新打开项目后，执行队列会显示内容。" />
        ) : null}
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 lg:border-l lg:border-t-0">
        <div className="border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-800">
          下一批任务
        </div>
        {tasks.map((task) => (
          <TaskQueueRow
            key={task.id}
            task={task}
            projectName={task.project_uid ? projectByUid.get(task.project_uid)?.name : undefined}
            onClick={() => onOpenTask(task)}
          />
        ))}
        {tasks.length === 0 ? <EmptyState title="没有开放任务" detail="当前任务索引中没有等待处理的任务。" /> : null}
      </div>
    </div>
  );
}

function KnowledgeLoopContent({
  knowledge,
  paraCounts,
  promoted,
  onLibrary,
  onResources
}: {
  knowledge: DashboardSummary['knowledge'] | null;
  paraCounts: { active: number; areas: number; resources: number; archived: number };
  promoted: number;
  onLibrary(): void;
  onResources(): void;
}): JSX.Element {
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <BigMetric label="已保存信息流" value={knowledge?.feedSaved ?? 0} />
        <BigMetric label="新增资料" value={knowledge?.libraryAdded ?? paraCounts.resources} />
        <BigMetric label="想法" value={knowledge?.thoughtsCreated ?? 0} />
        <BigMetric label="已提升" value={promoted} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <InventoryPill label="活跃项目" value={knowledge?.activeProjects ?? paraCounts.active} />
        <InventoryPill label="领域" value={paraCounts.areas} />
        <InventoryPill label="资源" value={paraCounts.resources} />
        <InventoryPill label="已归档" value={knowledge?.archivedProjects ?? paraCounts.archived} />
      </div>
      <div className="mt-4 flex gap-2">
        <CommandButton icon={<LibraryIcon size={14} />} onClick={onLibrary}>
          资料库
        </CommandButton>
        <CommandButton icon={<Sparkles size={14} />} onClick={onResources}>
          资源
        </CommandButton>
      </div>
    </div>
  );
}

function FeedRadarContent({
  sources,
  items,
  onFeeds
}: {
  sources: FeedSource[];
  items: FeedItem[];
  onFeeds(): void;
}): JSX.Element {
  const enabledSources = sources.filter((source) => source.enabled).length;
  const newItems = items.filter((item) => item.status === 'new').length;
  const savedItems = items.filter((item) => item.status === 'saved').length;
  const latest = [...items].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)).slice(0, 4);
  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-2">
        <BigMetric label="订阅源" value={enabledSources} />
        <BigMetric label="新信号" value={newItems} tone={newItems > 0 ? 'amber' : 'neutral'} />
        <BigMetric label="已入库" value={savedItems} />
      </div>
      <p className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
        信息流仍是 Layer 0。只有 Save to Library 后，才会进入长期知识层。
      </p>
      <div className="mt-3 space-y-2">
        {latest.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${item.status === 'saved' ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <span className="text-neutral-500">{feedStatusLabel(item.status)}</span>
          </div>
        ))}
        {latest.length === 0 ? <EmptyState title="暂无信息流" detail="添加或刷新订阅源后，这里会显示可筛选信号。" compact /> : null}
      </div>
      <div className="mt-4">
        <CommandButton icon={<Eye size={14} />} onClick={onFeeds}>
          打开信息流
        </CommandButton>
      </div>
    </div>
  );
}

function LibraryDigestContent({ items, onLibrary }: { items: LibraryItem[]; onLibrary(): void }): JSX.Element {
  const saved = items.filter((item) => item.frontmatter.status === 'saved').length;
  const reading = items.filter((item) => item.frontmatter.status === 'reading').length;
  const needsDistill = items.filter(
    (item) =>
      item.frontmatter.status === 'read' &&
      (item.frontmatter.distilled_note_ids ?? []).length === 0
  ).length;
  const latest = [...items]
    .filter((item) => item.frontmatter.status !== 'archived')
    .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
    .slice(0, 4);
  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-2">
        <BigMetric label="待读" value={saved} />
        <BigMetric label="阅读中" value={reading} />
        <BigMetric label="待蒸馏" value={needsDistill} tone={needsDistill > 0 ? 'amber' : 'neutral'} />
      </div>
      <div className="mt-3 space-y-2">
        {latest.map((item) => (
          <div key={item.frontmatter.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{item.frontmatter.title}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-900">
              {libraryStatusLabel(item.frontmatter.status)}
            </span>
          </div>
        ))}
        {latest.length === 0 ? <EmptyState title="资料库为空" detail="保存文章、PDF 或视频后，这里会显示消化队列。" compact /> : null}
      </div>
      <div className="mt-4">
        <CommandButton icon={<LibraryIcon size={14} />} onClick={onLibrary}>
          打开资料库
        </CommandButton>
      </div>
    </div>
  );
}

function ResourceMomentumContent({
  resources,
  onResources,
  onOpenResource
}: {
  resources: ResourceSummary[];
  onResources(): void;
  onOpenResource(slug: string): void;
}): JSX.Element {
  const active = resources.filter((resource) => resource.frontmatter.status === 'active').length;
  const dormant = resources.filter((resource) => resource.frontmatter.status === 'dormant').length;
  const practicing = resources.filter((resource) => resource.frontmatter.depth === 'practicing').length;
  const latest = [...resources]
    .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
    .slice(0, 4);
  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-2">
        <BigMetric label="活跃" value={active} />
        <BigMetric label="休眠" value={dormant} tone={dormant > 0 ? 'amber' : 'neutral'} />
        <BigMetric label="实践中" value={practicing} />
      </div>
      <div className="mt-3 space-y-2">
        {latest.map((resource) => (
          <button
            key={resource.frontmatter.id}
            onClick={() => onOpenResource(resource.frontmatter.slug)}
            className="flex w-full items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1.5 text-left text-xs hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <span className="min-w-0 flex-1 truncate">{resource.frontmatter.title}</span>
            <span className="text-neutral-500">{resource.frontmatter.depth}</span>
          </button>
        ))}
        {latest.length === 0 ? <EmptyState title="还没有资源" detail="从笔记或资料中提升主题后，这里会出现长期资源。" compact /> : null}
      </div>
      <div className="mt-4">
        <CommandButton icon={<Sparkles size={14} />} onClick={onResources}>
          资源工作台
        </CommandButton>
      </div>
    </div>
  );
}

function AreaBalanceContent({
  areas,
  projects,
  tasks,
  resources,
  libraryItems,
  feedSources,
  onOpenArea
}: {
  areas: Array<{ uid: string; slug: string; name: string; status: string }>;
  projects: Array<{ uid: string; area_uid?: string; area_slugs?: string[]; status: string }>;
  tasks: TaskRecord[];
  resources: ResourceSummary[];
  libraryItems: LibraryItem[];
  feedSources: FeedSource[];
  onOpenArea(areaUid: string): void;
}): JSX.Element {
  const rows = areas
    .filter((area) => area.status !== 'archived')
    .map((area) => {
      const projectCount = projects.filter(
        (project) => project.status !== 'archived' && (project.area_uid === area.uid || project.area_slugs?.includes(area.slug))
      ).length;
      const taskCount = tasks.filter((task) => task.area_uid === area.uid || task.area_uid === area.slug).length;
      const resourceCount = resources.filter((resource) => hasAreaRef(resource.frontmatter.areas, area.slug)).length;
      const libraryCount = libraryItems.filter((item) => hasAreaRef(item.frontmatter.areas, area.slug)).length;
      const feedCount = feedSources.filter((source) => hasAreaRef(source.areas, area.slug)).length;
      return { area, score: projectCount * 3 + resourceCount * 2 + libraryCount + feedCount, projectCount, taskCount, resourceCount };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const quiet = rows.filter((row) => row.score === 0).length;
  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-2">
        <BigMetric label="领域" value={areas.length} />
        <BigMetric label="有动量" value={rows.filter((row) => row.score > 0).length} />
        <BigMetric label="安静" value={quiet} tone={quiet > 0 ? 'amber' : 'neutral'} />
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <button
            key={row.area.uid}
            onClick={() => onOpenArea(row.area.uid)}
            className="flex w-full items-center gap-3 rounded border border-neutral-200 px-2 py-1.5 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{row.area.name}</span>
              <span className="text-[11px] text-neutral-500">
                {row.projectCount} 项目 / {row.taskCount} 任务 / {row.resourceCount} 资源
              </span>
            </span>
            <span className="rounded bg-neutral-100 px-2 py-1 text-xs tabular-nums dark:bg-neutral-900">{row.score}</span>
          </button>
        ))}
        {rows.length === 0 ? <EmptyState title="还没有领域" detail="Area 建好后，这里会显示长期责任坐标的平衡度。" compact /> : null}
      </div>
    </div>
  );
}

function SystemPulseContent({
  health,
  autoRunnerEnabled,
  autoRunnerBusy,
  onToggleAutoRunner,
  onConsole,
  onRuntime,
  onDirtyProject
}: {
  health: DashboardSummary['health'] | null;
  autoRunnerEnabled: boolean;
  autoRunnerBusy: boolean;
  onToggleAutoRunner(): void;
  onConsole(): void;
  onRuntime(): void;
  onDirtyProject(projectName: string): void;
}): JSX.Element {
  const online = health?.runtimes.filter((runtime) => runtime.status === 'online').length ?? 0;
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <BigMetric
          label="Git 未提交"
          value={health?.git.dirtyProjects.length ?? 0}
          tone={(health?.git.dirtyProjects.length ?? 0) > 0 ? 'amber' : 'neutral'}
        />
        <BigMetric label="Runtime" value={online} />
        <BigMetric label="Worktree" value={formatBytes(health?.disk.worktreeSizeBytes ?? 0)} />
        <BigMetric label="今日预算" value={`$${(health?.budget.todayUsd ?? 0).toFixed(4)}`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <CommandButton icon={<Bot size={14} />} onClick={onToggleAutoRunner} disabled={autoRunnerBusy}>
          {autoRunnerEnabled ? '暂停自动执行' : '启动自动执行'}
        </CommandButton>
        <CommandButton icon={<Gauge size={14} />} onClick={onRuntime}>
          Runtime
        </CommandButton>
        <CommandButton icon={<CheckCircle2 size={14} />} onClick={onConsole}>
          控制台
        </CommandButton>
      </div>
      {(health?.git.dirtyProjects ?? []).slice(0, 3).map((project) => (
        <button
          key={project.projectName}
          onClick={() => onDirtyProject(project.projectName)}
          className="mt-2 flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <span className="truncate">{project.projectName}</span>
          <span>{project.uncommittedFiles} 个文件</span>
        </button>
      ))}
    </div>
  );
}

function RecentActivityContent({ events }: { events: ActivityEvent[] }): JSX.Element {
  return (
    <div>
      {events.slice(0, 6).map((event) => (
        <div key={event.id} className="border-b border-neutral-100 px-4 py-2 text-xs dark:border-neutral-900">
          <div className="flex items-center gap-2 text-neutral-500">
            <span>{formatTime(event.at)}</span>
            <span>{event.action}</span>
          </div>
          <div className="mt-0.5 line-clamp-2 text-neutral-700 dark:text-neutral-300">{event.summary}</div>
        </div>
      ))}
      {events.length === 0 ? <EmptyState title="暂无活动" detail="可追踪事件会显示在这里。" /> : null}
    </div>
  );
}

function ProjectPressure({
  open,
  ready,
  doing,
  blocked
}: {
  open: number;
  ready: number;
  doing: number;
  blocked: number;
}): JSX.Element {
  return (
    <div className="hidden shrink-0 grid-cols-4 gap-1 text-center text-[11px] text-neutral-500 md:grid">
      <MiniStat label="开放" value={open} />
      <MiniStat label="可做" value={ready} />
      <MiniStat label="进行" value={doing} />
      <MiniStat label="阻塞" value={blocked} hot={blocked > 0} />
    </div>
  );
}

function MiniStat({ label, value, hot }: { label: string; value: number; hot?: boolean }): JSX.Element {
  return (
    <span
      className={`rounded px-2 py-1 ${hot ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="ml-1 hidden xl:inline">{label}</span>
    </span>
  );
}

function TaskQueueRow({
  task,
  projectName,
  onClick
}: {
  task: TaskRecord;
  projectName?: string;
  onClick(): void;
}): JSX.Element {
  const mode = taskExecutionMode(task);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusDotClass(task.status)}`} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <span>{statusLabel(task.status)}</span>
          <span>{executionModeLabel(mode)}</span>
          {projectName ? <span className="truncate">{projectName}</span> : null}
        </span>
      </span>
    </button>
  );
}

function BigMetric({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'amber';
}): JSX.Element {
  return (
    <div
      className={`rounded-md px-3 py-2 ${tone === 'amber' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-50 dark:bg-neutral-900'}`}
    >
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function InventoryPill({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className="ml-2 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function EmptyState({ title, detail, compact }: { title: string; detail: string; compact?: boolean }): JSX.Element {
  return (
    <div className={`${compact ? 'px-0 py-2' : 'px-4 py-6'} text-sm text-neutral-500`}>
      <div className="font-medium text-neutral-700 dark:text-neutral-300">{title}</div>
      <div className="mt-1 text-xs">{detail}</div>
    </div>
  );
}

function WidgetBadge({ icon, label }: { icon: ReactNode; label: string }): JSX.Element {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-800">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function CommandButton({
  icon,
  children,
  onClick,
  disabled
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  children,
  onClick
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

function reorderWidgets(widgets: DashboardWidgetInstance[]): DashboardWidgetInstance[] {
  return [...widgets]
    .sort((a, b) => a.order - b.order)
    .map((widget, order) => ({ ...widget, order }));
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function compareDashboardTasks(a: TaskRecord, b: TaskRecord): number {
  return taskScore(a) - taskScore(b) || a.title.localeCompare(b.title);
}

function taskScore(task: TaskRecord): number {
  const statusScore: Record<TaskStatus, number> = {
    blocked: 0,
    doing: 1,
    waiting: 2,
    todo: 3,
    backlog: 4,
    done: 9
  };
  return (
    statusScore[task.status] - (task.recommended ? 0.5 : 0) - (task.priority === 'high' ? 0.25 : 0)
  );
}

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    blocked: '阻塞',
    doing: '进行中',
    waiting: '等待',
    todo: '待办',
    backlog: '待整理',
    done: '已完成'
  };
  return labels[status];
}

function executionModeLabel(mode: TaskExecutionMode): string {
  const labels: Record<TaskExecutionMode, string> = {
    human: '人工',
    assisted: '辅助',
    agent: 'Agent',
    scheduled: '计划'
  };
  return labels[mode];
}

function statusDotClass(status: TaskStatus): string {
  if (status === 'blocked') return 'bg-amber-500';
  if (status === 'doing') return 'bg-sky-500';
  if (status === 'todo' || status === 'waiting') return 'bg-emerald-500';
  return 'bg-neutral-300';
}

function metricToneClass(tone: 'neutral' | 'sky' | 'rose' | 'amber' | 'emerald'): string {
  const classes = {
    neutral: 'text-neutral-900 dark:text-neutral-100',
    sky: 'text-sky-900 dark:text-sky-100',
    rose: 'text-rose-900 dark:text-rose-100',
    amber: 'text-amber-900 dark:text-amber-100',
    emerald: 'text-emerald-900 dark:text-emerald-100'
  };
  return classes[tone];
}

function widgetSizeClass(size: DashboardWidgetSize): string {
  if (size === 'small') return 'md:col-span-1';
  if (size === 'large') return 'md:col-span-2 2xl:col-span-3';
  return 'md:col-span-2';
}

function sizeLabel(size: DashboardWidgetSize): string {
  const labels: Record<DashboardWidgetSize, string> = {
    small: '小',
    wide: '宽',
    large: '大'
  };
  return labels[size];
}

function layerLabel(layer: string): string {
  const labels: Record<string, string> = {
    layer0: 'L0 信号',
    layer1: 'L1 真相',
    layer2: 'L2 合成',
    system: '系统'
  };
  return labels[layer] ?? layer;
}

function permissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    'read-only': '只读',
    synthesis: '可合成',
    'requires-approval-write': '写入需确认'
  };
  return labels[permission] ?? permission;
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    vision: '愿景',
    execution: '执行',
    knowledge: '知识',
    signal: '信号',
    system: '系统'
  };
  return labels[category] ?? category;
}

function feedStatusLabel(status: FeedItem['status']): string {
  const labels: Record<FeedItem['status'], string> = {
    new: '新',
    seen: '已看',
    ignored: '忽略',
    saved: '已入库',
    expired: '过期'
  };
  return labels[status];
}

function libraryStatusLabel(status: LibraryItem['frontmatter']['status']): string {
  const labels: Record<LibraryItem['frontmatter']['status'], string> = {
    saved: '待读',
    reading: '阅读中',
    read: '已读',
    distilled: '已蒸馏',
    archived: '已归档'
  };
  return labels[status];
}

function hasAreaRef(
  refs: Array<{ area_slug?: string; slug?: string } | string> | undefined,
  areaSlug: string
): boolean {
  return (refs ?? []).some((ref) =>
    typeof ref === 'string' ? ref === areaSlug : ref.area_slug === areaSlug || ref.slug === areaSlug
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
