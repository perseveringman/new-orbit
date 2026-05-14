import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  Inbox,
  Library,
  ListTodo,
  RefreshCw,
  Sparkles,
  Target
} from 'lucide-react';
import type { ActivityEvent } from '@shared/activity';
import type { DashboardSummary } from '@shared/dashboard';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
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
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const entities = usePara((s) => s.entities);
  const tasks = usePara((s) => s.tasks);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const openTask = useTaskDetails((s) => s.openTask);
  const [editVision, setEditVision] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [autoRunnerBusy, setAutoRunnerBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!vault) return;
    setLoadingSummary(true);
    try {
      setSummary(await window.orbit.dashboard.summary());
    } catch (error) {
      toast(`Dashboard refresh failed: ${(error as Error).message}`);
    } finally {
      setLoadingSummary(false);
    }
  }, [toast, vault]);

  useEffect(() => {
    void refreshVision();
    void refreshProjects();
    void loadDashboard();
  }, [loadDashboard, refreshVision, refreshProjects]);

  useEffect(() => {
    if (!vault) return;
    const refresh = (): void => {
      void refreshProjects();
      void loadDashboard();
    };
    const offFs = window.orbit.fs.onEvent(refresh);
    const offInbox = window.orbit.inbox.onEvent(refresh);
    const offEvents = window.orbit.events.onEvent(refresh);
    const offAutoRunner = window.orbit.autoRunner.onEvent(refresh);
    const offRuntime = window.orbit.runtime.onEvent(refresh);
    return () => {
      offFs();
      offInbox();
      offEvents();
      offAutoRunner();
      offRuntime();
    };
  }, [loadDashboard, refreshProjects, vault]);

  const paraCounts = useMemo(() => {
    const active = projects.filter((project) => project.status !== 'archived').length;
    const archived =
      entities.filter((entity) => entity.type === 'archive').length +
      projects.filter((project) => project.status === 'archived').length;
    const resources = entities.filter((entity) => entity.type === 'resource').length;
    return { active, areas: areas.length, resources, archived };
  }, [areas.length, entities, projects]);

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
      toast(`Daily Review generated: ${review.recommendedTaskUids.length} recommended task(s)`);
      await loadDashboard();
    } catch (error) {
      toast(`Daily Review failed: ${(error as Error).message}`);
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
      toast(next.enabled ? 'Auto-runner enabled' : 'Auto-runner paused');
      await loadDashboard();
    } catch (error) {
      toast(`Auto-runner update failed: ${(error as Error).message}`);
    } finally {
      setAutoRunnerBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              <Target size={14} />
              Workspace Command
            </div>
            <h1 className="mt-1 text-xl font-semibold">Dashboard</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              Start from the next decision, then move into the project, task, or review surface
              that can actually change the vault.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CommandButton icon={<Inbox size={14} />} onClick={() => setView({ kind: 'inbox' })}>
              Inbox
            </CommandButton>
            <CommandButton
              icon={<ListTodo size={14} />}
              onClick={() => setView({ kind: 'kanban', projectUid: null })}
            >
              Kanban
            </CommandButton>
            <CommandButton
              icon={<RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />}
              onClick={() => void loadDashboard()}
            >
              Refresh
            </CommandButton>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <section className="border-b border-neutral-200 bg-white/70 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/70">
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
            <NorthStarPanel
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SignalTile
                icon={<Inbox size={16} />}
                label="Decision queue"
                value={inboxPending}
                detail="Inbox items waiting for review"
                tone={inboxPending > 0 ? 'rose' : 'neutral'}
                onClick={() => setView({ kind: 'inbox' })}
              />
              <SignalTile
                icon={<ListTodo size={16} />}
                label="Ready work"
                value={readyCount}
                detail={`${pendingTasks} tasks plus ${inboxPending} inbox`}
                tone={readyCount > 0 ? 'sky' : 'neutral'}
                onClick={() => setView({ kind: 'kanban', projectUid: null })}
              />
              <SignalTile
                icon={<AlertTriangle size={16} />}
                label="Blocked"
                value={blockedTasks}
                detail="Tasks that need intervention"
                tone={blockedTasks > 0 ? 'amber' : 'neutral'}
                onClick={() => setView({ kind: 'kanban', projectUid: null })}
              />
              <SignalTile
                icon={<Bot size={16} />}
                label="Agent lane"
                value={summary?.agent.activeRuns ?? 0}
                detail={`${doingTasks} doing, $${(summary?.agent.todayCostUsd ?? 0).toFixed(4)} today`}
                tone={(summary?.agent.activeRuns ?? 0) > 0 ? 'emerald' : 'neutral'}
                onClick={() => setView({ kind: 'agents' })}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <section className={`${surfaceCls} min-w-0 overflow-hidden`}>
            <PanelHeading
              icon={<ListTodo size={16} />}
              title="Execution queue"
              detail="Open work grouped by the surface you can jump into."
            />
            <div className="grid gap-0 border-t border-neutral-200 dark:border-neutral-800 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
              <div className="min-w-0">
                {projectRows.slice(0, 8).map((row) => (
                  <button
                    key={row.project.uid}
                    onClick={() => openProject(row.project.uid)}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.project.name}</span>
                        {row.project.workdirMissing ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                            workdir missing
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
                {projectRows.length === 0 ? (
                  <EmptyState title="No active projects" detail="Create or reopen a project to populate the execution queue." />
                ) : null}
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800 lg:border-l lg:border-t-0">
                <div className="border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-800">
                  Next tasks
                </div>
                <div>
                  {priorityTasks.map((task) => (
                    <TaskQueueRow
                      key={task.id}
                      task={task}
                      projectName={task.project_uid ? projectByUid.get(task.project_uid)?.name : undefined}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                  {priorityTasks.length === 0 ? (
                    <EmptyState title="No open tasks" detail="Nothing is currently waiting in the task index." />
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4">
            <KnowledgeLoopPanel
              knowledge={summary?.knowledge ?? null}
              paraCounts={paraCounts}
              promoted={promoted}
              onLibrary={() => setView({ kind: 'library' })}
              onResources={() => setView({ kind: 'resources' })}
            />
            <SystemPulsePanel
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
            <RecentActivityPanel events={summary?.thinking.recentActivities ?? []} />
          </div>
        </div>
      </main>

      <VisionEditorModal open={editVision} onClose={() => setEditVision(false)} />
    </div>
  );
}

function NorthStarPanel({
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
    <section className="min-w-0 border-l-2 border-neutral-900 pl-4 dark:border-neutral-100">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">North Star</div>
      <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
        {vision && vision.trim()
          ? vision
          : 'Vision.md is empty. Set the direction before asking the system to optimize execution.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dailyReviewAvailable ? (
          <CommandButton icon={<ClipboardCheck size={14} />} onClick={onOpenReview}>
            Open review
          </CommandButton>
        ) : (
          <CommandButton
            icon={<Sparkles size={14} />}
            onClick={onGenerateReview}
            disabled={generatingReview}
          >
            {generatingReview ? 'Generating' : 'Daily review'}
          </CommandButton>
        )}
        <CommandButton icon={<Target size={14} />} onClick={onEditVision}>
          Edit vision
        </CommandButton>
        <span className={subtleCls}>
          Reviewed {visionDaysSinceReview === null ? 'unknown' : `${visionDaysSinceReview}d ago`}
        </span>
      </div>
    </section>
  );
}

function SignalTile({
  icon,
  label,
  value,
  detail,
  tone,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: 'neutral' | 'sky' | 'rose' | 'amber' | 'emerald';
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`group rounded-md border px-3 py-3 text-left transition hover:-translate-y-px ${toneClasses(tone)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-neutral-500 dark:text-neutral-400">{icon}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-2 text-sm font-medium">{label}</div>
      <div className="mt-0.5 text-xs opacity-75">{detail}</div>
    </button>
  );
}

function PanelHeading({
  icon,
  title,
  detail
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 text-neutral-500">{icon}</div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className={subtleCls}>{detail}</p>
      </div>
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
      <MiniStat label="open" value={open} />
      <MiniStat label="ready" value={ready} />
      <MiniStat label="doing" value={doing} />
      <MiniStat label="block" value={blocked} hot={blocked > 0} />
    </div>
  );
}

function MiniStat({ label, value, hot }: { label: string; value: number; hot?: boolean }): JSX.Element {
  return (
    <span className={`rounded px-2 py-1 ${hot ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}>
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
          <span>{mode}</span>
          {projectName ? <span className="truncate">{projectName}</span> : null}
        </span>
      </span>
    </button>
  );
}

function KnowledgeLoopPanel({
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
    <section className={surfaceCls}>
      <PanelHeading
        icon={<Library size={16} />}
        title="Knowledge loop"
        detail="Capture only matters after it becomes Library, Resource, or a project decision."
      />
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <BigMetric label="Feed saved" value={knowledge?.feedSaved ?? 0} />
        <BigMetric label="Library added" value={knowledge?.libraryAdded ?? paraCounts.resources} />
        <BigMetric label="Thoughts" value={knowledge?.thoughtsCreated ?? 0} />
        <BigMetric label="Promoted" value={promoted} />
      </div>
      <div className="border-t border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        <div className="grid grid-cols-2 gap-2">
          <InventoryPill label="Active Projects" value={knowledge?.activeProjects ?? paraCounts.active} />
          <InventoryPill label="Areas" value={paraCounts.areas} />
          <InventoryPill label="Resources" value={paraCounts.resources} />
          <InventoryPill label="Archived" value={knowledge?.archivedProjects ?? paraCounts.archived} />
        </div>
        <div className="mt-3 flex gap-2">
          <CommandButton icon={<Library size={14} />} onClick={onLibrary}>
            Library
          </CommandButton>
          <CommandButton icon={<Sparkles size={14} />} onClick={onResources}>
            Resources
          </CommandButton>
        </div>
      </div>
    </section>
  );
}

function SystemPulsePanel({
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
    <section className={surfaceCls}>
      <PanelHeading icon={<Gauge size={16} />} title="System pulse" detail="Only show health that changes what you do next." />
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <BigMetric label="Git dirty" value={health?.git.dirtyProjects.length ?? 0} tone={(health?.git.dirtyProjects.length ?? 0) > 0 ? 'amber' : 'neutral'} />
        <BigMetric label="Runtimes" value={online} />
        <BigMetric label="Worktrees" value={formatBytes(health?.disk.worktreeSizeBytes ?? 0)} />
        <BigMetric label="Budget today" value={`$${(health?.budget.todayUsd ?? 0).toFixed(4)}`} />
      </div>
      <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-wrap gap-2">
          <CommandButton icon={<Bot size={14} />} onClick={onToggleAutoRunner} disabled={autoRunnerBusy}>
            {autoRunnerEnabled ? 'Pause auto-runner' : 'Start auto-runner'}
          </CommandButton>
          <CommandButton icon={<Gauge size={14} />} onClick={onRuntime}>
            Runtime
          </CommandButton>
          <CommandButton icon={<CheckCircle2 size={14} />} onClick={onConsole}>
            Console
          </CommandButton>
        </div>
        {(health?.git.dirtyProjects ?? []).slice(0, 3).map((project) => (
          <button
            key={project.projectName}
            onClick={() => onDirtyProject(project.projectName)}
            className="mt-2 flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <span className="truncate">{project.projectName}</span>
            <span>{project.uncommittedFiles} file(s)</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentActivityPanel({ events }: { events: ActivityEvent[] }): JSX.Element {
  return (
    <section className={surfaceCls}>
      <PanelHeading icon={<Sparkles size={16} />} title="Recent activity" detail="Latest traceable changes in the vault." />
      <div className="border-t border-neutral-200 dark:border-neutral-800">
        {events.slice(0, 5).map((event) => (
          <div key={event.id} className="border-b border-neutral-100 px-4 py-2 text-xs dark:border-neutral-900">
            <div className="flex items-center gap-2 text-neutral-500">
              <span>{formatTime(event.at)}</span>
              <span>{event.action}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-neutral-700 dark:text-neutral-300">{event.summary}</div>
          </div>
        ))}
        {events.length === 0 ? <EmptyState title="No activity yet" detail="Traceable events will show up here." /> : null}
      </div>
    </section>
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
    <div className={`rounded-md px-3 py-2 ${tone === 'amber' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-50 dark:bg-neutral-900'}`}>
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

function EmptyState({ title, detail }: { title: string; detail: string }): JSX.Element {
  return (
    <div className="px-4 py-6 text-sm text-neutral-500">
      <div className="font-medium text-neutral-700 dark:text-neutral-300">{title}</div>
      <div className="mt-1 text-xs">{detail}</div>
    </div>
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
  return statusScore[task.status] - (task.recommended ? 0.5 : 0) - (task.priority === 'high' ? 0.25 : 0);
}

function statusLabel(status: TaskStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}

function statusDotClass(status: TaskStatus): string {
  if (status === 'blocked') return 'bg-amber-500';
  if (status === 'doing') return 'bg-sky-500';
  if (status === 'todo' || status === 'waiting') return 'bg-emerald-500';
  return 'bg-neutral-300';
}

function toneClasses(tone: 'neutral' | 'sky' | 'rose' | 'amber' | 'emerald'): string {
  const classes = {
    neutral: 'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100',
    sky: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100',
    rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100'
  };
  return classes[tone];
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
