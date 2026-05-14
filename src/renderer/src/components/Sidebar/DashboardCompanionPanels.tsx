import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Gauge,
  Inbox,
  Library,
  ListTodo,
  RefreshCw,
  Target
} from 'lucide-react';
import type { ActivityEvent } from '@shared/activity';
import type { DashboardSummary } from '@shared/dashboard';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { taskExecutionMode } from '@shared/schemas';
import { useFiles } from '../../store/files';
import { usePara } from '../../store/para';
import { useTaskDetails } from '../../store/taskDetails';
import { useWorkspace } from '../../store/workspace';
import { cleanVisionExcerpt } from '../../views/dashboardText';

export function DashboardFocusPanel(): JSX.Element {
  const { summary, loading, reload } = useDashboardCompanionData();
  const projects = useWorkspace((s) => s.projects);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const tasks = usePara((s) => s.tasks);
  const setView = usePara((s) => s.setView);
  const openTask = useTaskDetails((s) => s.openTask);

  const projectByUid = useMemo(
    () => new Map(projects.map((project) => [project.uid, project])),
    [projects]
  );
  const priorityTasks = useMemo(
    () => tasks.filter((task) => task.status !== 'done').sort(compareTasks).slice(0, 6),
    [tasks]
  );
  const pressureRows = useMemo(
    () =>
      projects
        .filter((project) => project.status !== 'archived')
        .map((project) => {
          const projectTasks = tasks.filter((task) => task.project_uid === project.uid);
          const ready = projectTasks.filter((task) => task.status === 'todo' || task.status === 'waiting').length;
          const blocked = projectTasks.filter((task) => task.status === 'blocked').length;
          const doing = projectTasks.filter((task) => task.status === 'doing').length;
          const open = projectTasks.filter((task) => task.status !== 'done').length;
          return { project, ready, blocked, doing, open };
        })
        .filter((row) => row.open > 0 || row.project.workdirMissing)
        .sort((a, b) => b.blocked * 10 + b.doing * 4 + b.ready - (a.blocked * 10 + a.doing * 4 + a.ready))
        .slice(0, 5),
    [projects, tasks]
  );

  function openProject(projectUid: string): void {
    setActiveProjectUid(projectUid);
    setView({ kind: 'project', projectUid });
  }

  function openTaskDetail(task: TaskRecord): void {
    if (task.project_uid) setActiveProjectUid(task.project_uid);
    openTask(task, task.project_uid ?? null);
  }

  const inboxPending = summary?.pending.inboxPending ?? 0;
  const blockedTasks = summary?.pending.blockedTasks ?? tasks.filter((task) => task.status === 'blocked').length;
  const readyTasks =
    summary?.pending.pendingTasks ??
    tasks.filter((task) => task.status === 'todo' || task.status === 'waiting').length;
  const activeRuns = summary?.agent.activeRuns ?? 0;

  return (
    <div className="space-y-3">
      <PanelTop
        title="Today command"
        detail="Use the side pane as a launchpad, not another passive summary."
        loading={loading}
        onRefresh={reload}
      />

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-800">
          Decision order
        </div>
        <ActionRow
          icon={<Inbox size={14} />}
          title="Clear approvals"
          detail="Human decisions unblock agent work."
          value={inboxPending}
          hot={inboxPending > 0}
          onClick={() => setView({ kind: 'inbox' })}
        />
        <ActionRow
          icon={<AlertTriangle size={14} />}
          title="Remove blockers"
          detail="Blocked tasks should never hide in a dashboard."
          value={blockedTasks}
          hot={blockedTasks > 0}
          onClick={() => setView({ kind: 'kanban', projectUid: null })}
        />
        <ActionRow
          icon={<ListTodo size={14} />}
          title="Plan ready work"
          detail="Tasks ready or waiting for assignment."
          value={readyTasks}
          onClick={() => setView({ kind: 'today' })}
        />
        <ActionRow
          icon={<Bot size={14} />}
          title="Watch execution"
          detail="Active agent runs across the vault."
          value={activeRuns}
          hot={activeRuns > 0}
          onClick={() => setView({ kind: 'agents' })}
        />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="Next tasks" />
        {priorityTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => openTaskDetail(task)}
            className="flex w-full items-start gap-2 border-t border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(task.status)}`} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm">{task.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                <span>{statusLabel(task.status)}</span>
                <span>{taskExecutionMode(task)}</span>
                {task.project_uid ? <span>{projectByUid.get(task.project_uid)?.name}</span> : null}
              </span>
            </span>
          </button>
        ))}
        {priorityTasks.length === 0 ? <EmptyHint title="No open tasks" detail="The task index has nothing waiting." /> : null}
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="Project pressure" />
        {pressureRows.map((row) => (
          <button
            key={row.project.uid}
            onClick={() => openProject(row.project.uid)}
            className="flex w-full items-center gap-3 border-t border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.project.name}</span>
              <span className="text-[11px] text-neutral-500">
                {row.ready} ready / {row.doing} doing / {row.blocked} blocked
              </span>
            </span>
            <span className={`rounded px-2 py-1 text-xs tabular-nums ${row.blocked > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}>
              {row.open}
            </span>
          </button>
        ))}
        {pressureRows.length === 0 ? <EmptyHint title="No project pressure" detail="Active projects have no open indexed tasks." /> : null}
      </section>
    </div>
  );
}

export function DashboardRhythmPanel(): JSX.Element {
  const { summary, loading, reload } = useDashboardCompanionData();
  const vision = useWorkspace((s) => s.visionExcerpt);
  const setView = usePara((s) => s.setView);
  const openPath = useFiles((s) => s.openPath);
  const toast = useFiles((s) => s.toast);
  const [generatingReview, setGeneratingReview] = useState(false);
  const visionText = cleanVisionExcerpt(vision);

  async function generateDailyReview(): Promise<void> {
    setGeneratingReview(true);
    try {
      const review = await window.orbit.review.generate();
      await openPath(review.path);
      toast(`Daily Review generated: ${review.recommendedTaskUids.length} recommended task(s)`);
      await reload();
    } catch (error) {
      toast(`Daily Review failed: ${(error as Error).message}`);
    } finally {
      setGeneratingReview(false);
    }
  }

  const onlineRuntimes = summary?.health.runtimes.filter((runtime) => runtime.status === 'online').length ?? 0;
  const promoted =
    (summary?.knowledge.promotedToProject ?? 0) + (summary?.knowledge.promotedToResource ?? 0);

  return (
    <div className="space-y-3">
      <PanelTop
        title="Rhythm"
        detail="Vision, review cadence, knowledge growth, and system health."
        loading={loading}
        onRefresh={reload}
      />

      <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
          <Target size={13} />
          North Star
        </div>
        <p className="mt-2 line-clamp-5 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
          {visionText || 'Vision.md is empty. The dashboard has no useful direction without it.'}
        </p>
        <button
          onClick={() => setView({ kind: 'vision' })}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Target size={13} />
          Open Vision
        </button>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="Review cadence" />
        <MetricRow
          icon={<CalendarCheck size={14} />}
          label="Daily review"
          value={summary?.thinking.dailyReviewAvailable ? 'Ready' : 'Missing'}
          actionLabel={summary?.thinking.dailyReviewAvailable ? 'Open' : generatingReview ? 'Generating' : 'Generate'}
          onAction={async () => {
            if (summary?.thinking.dailyReviewPath) await openPath(summary.thinking.dailyReviewPath);
            else await generateDailyReview();
          }}
        />
        <MetricRow
          icon={<Target size={14} />}
          label="Vision review"
          value={
            summary?.thinking.visionDaysSinceReview === null ||
            summary?.thinking.visionDaysSinceReview === undefined
              ? 'Unknown'
              : `${summary.thinking.visionDaysSinceReview}d ago`
          }
          actionLabel="Edit"
          onAction={() => setView({ kind: 'vision' })}
        />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="Knowledge movement" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Feed saved" value={summary?.knowledge.feedSaved ?? 0} />
          <MiniMetric label="Library" value={summary?.knowledge.libraryAdded ?? 0} />
          <MiniMetric label="Thoughts" value={summary?.knowledge.thoughtsCreated ?? 0} />
          <MiniMetric label="Promoted" value={promoted} />
        </div>
        <button
          onClick={() => setView({ kind: 'library' })}
          className="mx-3 mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Library size={13} />
          Open Library
        </button>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="System health" />
        <MetricRow icon={<Gauge size={14} />} label="Runtime online" value={onlineRuntimes} actionLabel="Open" onAction={() => setView({ kind: 'runtimes' })} />
        <MetricRow icon={<AlertTriangle size={14} />} label="Dirty projects" value={summary?.health.git.dirtyProjects.length ?? 0} actionLabel="Console" onAction={() => setView({ kind: 'developerConsole' })} />
        <MetricRow icon={<CheckCircle2 size={14} />} label="Budget today" value={`$${(summary?.health.budget.todayUsd ?? 0).toFixed(4)}`} actionLabel="Details" onAction={() => setView({ kind: 'runtimes' })} />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="Recent activity" />
        {(summary?.thinking.recentActivities ?? []).slice(0, 5).map((event) => (
          <ActivityRow key={event.id} event={event} />
        ))}
        {(summary?.thinking.recentActivities ?? []).length === 0 ? (
          <EmptyHint title="No activity yet" detail="Traceable events will appear here." />
        ) : null}
      </section>
    </div>
  );
}

function useDashboardCompanionData(): {
  summary: DashboardSummary | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const vault = useWorkspace((s) => s.vault);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const refreshVision = useWorkspace((s) => s.refreshVision);
  const toast = useFiles((s) => s.toast);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!vault) return;
    setLoading(true);
    try {
      await Promise.all([refreshProjects(), refreshVision()]);
      setSummary(await window.orbit.dashboard.summary());
    } catch (error) {
      toast(`Dashboard companion failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [refreshProjects, refreshVision, toast, vault]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!vault) return;
    const refresh = (): void => {
      void reload();
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
  }, [reload, vault]);

  return { summary, loading, reload };
}

function PanelTop({
  title,
  detail,
  loading,
  onRefresh
}: {
  title: string;
  detail: string;
  loading: boolean;
  onRefresh(): void | Promise<void>;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>
      </div>
      <button
        onClick={() => void onRefresh()}
        className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        title="Refresh dashboard companion"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

function SectionTitle({ title }: { title: string }): JSX.Element {
  return (
    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {title}
    </div>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  value,
  hot,
  onClick
}: {
  icon: JSX.Element;
  title: string;
  detail: string;
  value: number;
  hot?: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
    >
      <span className="text-neutral-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-neutral-500">{detail}</span>
      </span>
      <span className={`rounded px-2 py-1 text-xs font-semibold tabular-nums ${hot ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}>
        {value}
      </span>
    </button>
  );
}

function MetricRow({
  icon,
  label,
  value,
  actionLabel,
  onAction
}: {
  icon: JSX.Element;
  label: string;
  value: string | number;
  actionLabel: string;
  onAction(): void | Promise<void>;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-t border-neutral-100 px-3 py-2.5 text-sm dark:border-neutral-900">
      <span className="text-neutral-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-neutral-500">{label}</span>
        <span className="font-medium">{value}</span>
      </span>
      <button
        onClick={() => void onAction()}
        className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded bg-neutral-50 px-2 py-2 dark:bg-neutral-900">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }): JSX.Element {
  return (
    <div className="border-t border-neutral-100 px-3 py-2 text-xs dark:border-neutral-900">
      <div className="flex items-center gap-2 text-neutral-500">
        <span>{formatTime(event.at)}</span>
        <span>{event.action}</span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-neutral-700 dark:text-neutral-300">{event.summary}</div>
    </div>
  );
}

function EmptyHint({ title, detail }: { title: string; detail: string }): JSX.Element {
  return (
    <div className="border-t border-neutral-100 px-3 py-4 text-sm text-neutral-500 dark:border-neutral-900">
      <div className="font-medium text-neutral-700 dark:text-neutral-300">{title}</div>
      <div className="mt-1 text-xs">{detail}</div>
    </div>
  );
}

function compareTasks(a: TaskRecord, b: TaskRecord): number {
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

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
