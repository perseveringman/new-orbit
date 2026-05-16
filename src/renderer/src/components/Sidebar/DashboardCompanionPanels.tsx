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
import type { TaskExecutionMode, TaskRecord, TaskStatus } from '@shared/schemas';
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
    () =>
      tasks
        .filter((task) => task.status !== 'done')
        .sort(compareTasks)
        .slice(0, 6),
    [tasks]
  );
  const pressureRows = useMemo(
    () =>
      projects
        .filter((project) => project.status !== 'archived')
        .map((project) => {
          const projectTasks = tasks.filter((task) => task.project_uid === project.uid);
          const ready = projectTasks.filter(
            (task) => task.status === 'todo' || task.status === 'waiting'
          ).length;
          const blocked = projectTasks.filter((task) => task.status === 'blocked').length;
          const doing = projectTasks.filter((task) => task.status === 'doing').length;
          const open = projectTasks.filter((task) => task.status !== 'done').length;
          return { project, ready, blocked, doing, open };
        })
        .filter((row) => row.open > 0 || row.project.workdirMissing)
        .sort(
          (a, b) =>
            b.blocked * 10 + b.doing * 4 + b.ready - (a.blocked * 10 + a.doing * 4 + a.ready)
        )
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
  const blockedTasks =
    summary?.pending.blockedTasks ?? tasks.filter((task) => task.status === 'blocked').length;
  const readyTasks =
    summary?.pending.pendingTasks ??
    tasks.filter((task) => task.status === 'todo' || task.status === 'waiting').length;
  const activeRuns = summary?.agent.activeRuns ?? 0;

  return (
    <div className="space-y-3">
      <PanelTop
        title="仪表盘指挥台"
        detail="把侧边面板当作启动台，而不是另一个被动摘要。"
        loading={loading}
        onRefresh={reload}
      />

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-800">
          决策顺序
        </div>
        <ActionRow
          icon={<Inbox size={14} />}
          title="清理审批"
          detail="人工决策会解锁 agent 工作。"
          value={inboxPending}
          hot={inboxPending > 0}
          onClick={() => setView({ kind: 'inbox' })}
        />
        <ActionRow
          icon={<AlertTriangle size={14} />}
          title="移除阻塞"
          detail="阻塞任务不应该藏在仪表盘里。"
          value={blockedTasks}
          hot={blockedTasks > 0}
          onClick={() => setView({ kind: 'kanban', projectUid: null })}
        />
        <ActionRow
          icon={<ListTodo size={14} />}
          title="规划可做工作"
          detail="已经就绪或等待分配的任务。"
          value={readyTasks}
          onClick={() => setView({ kind: 'kanban', projectUid: null })}
        />
        <ActionRow
          icon={<Bot size={14} />}
          title="观察执行"
          detail="vault 内正在运行的 agent。"
          value={activeRuns}
          hot={activeRuns > 0}
          onClick={() => setView({ kind: 'agents' })}
        />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="下一批任务" />
        {priorityTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => openTaskDetail(task)}
            className="flex w-full items-start gap-2 border-t border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(task.status)}`}
            />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm">{task.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                <span>{statusLabel(task.status)}</span>
                <span>{executionModeLabel(taskExecutionMode(task))}</span>
                {task.project_uid ? <span>{projectByUid.get(task.project_uid)?.name}</span> : null}
              </span>
            </span>
          </button>
        ))}
        {priorityTasks.length === 0 ? (
          <EmptyHint title="没有开放任务" detail="任务索引中没有等待处理的任务。" />
        ) : null}
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="项目压力" />
        {pressureRows.map((row) => (
          <button
            key={row.project.uid}
            onClick={() => openProject(row.project.uid)}
            className="flex w-full items-center gap-3 border-t border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/70"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.project.name}</span>
              <span className="text-[11px] text-neutral-500">
                {row.ready} 可做 / {row.doing} 进行中 / {row.blocked} 阻塞
              </span>
            </span>
            <span
              className={`rounded px-2 py-1 text-xs tabular-nums ${row.blocked > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}
            >
              {row.open}
            </span>
          </button>
        ))}
        {pressureRows.length === 0 ? (
          <EmptyHint title="没有项目压力" detail="活跃项目没有开放的索引任务。" />
        ) : null}
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
      toast(`每日复盘已生成：${review.recommendedTaskUids.length} 个推荐任务`);
      await reload();
    } catch (error) {
      toast(`每日复盘失败：${(error as Error).message}`);
    } finally {
      setGeneratingReview(false);
    }
  }

  const onlineRuntimes =
    summary?.health.runtimes.filter((runtime) => runtime.status === 'online').length ?? 0;
  const promoted =
    (summary?.knowledge.promotedToProject ?? 0) + (summary?.knowledge.promotedToResource ?? 0);

  return (
    <div className="space-y-3">
      <PanelTop
        title="节奏"
        detail="愿景、复盘节奏、知识增长和系统健康度。"
        loading={loading}
        onRefresh={reload}
      />

      <section className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
          <Target size={13} />
          北极星
        </div>
        <p className="mt-2 line-clamp-5 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
          {visionText || 'Vision.md 为空。没有它，仪表盘就缺少有效方向。'}
        </p>
        <button
          onClick={() => setView({ kind: 'vision' })}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Target size={13} />
          打开愿景
        </button>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="复盘节奏" />
        <MetricRow
          icon={<CalendarCheck size={14} />}
          label="每日复盘"
          value={summary?.thinking.dailyReviewAvailable ? '就绪' : '缺失'}
          actionLabel={
            summary?.thinking.dailyReviewAvailable ? '打开' : generatingReview ? '生成中' : '生成'
          }
          onAction={async () => {
            if (summary?.thinking.dailyReviewPath) await openPath(summary.thinking.dailyReviewPath);
            else await generateDailyReview();
          }}
        />
        <MetricRow
          icon={<Target size={14} />}
          label="愿景复盘"
          value={
            summary?.thinking.visionDaysSinceReview === null ||
            summary?.thinking.visionDaysSinceReview === undefined
              ? '未知'
              : `${summary.thinking.visionDaysSinceReview} 天前`
          }
          actionLabel="编辑"
          onAction={() => setView({ kind: 'vision' })}
        />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="知识流动" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="已保存信息流" value={summary?.knowledge.feedSaved ?? 0} />
          <MiniMetric label="资料库" value={summary?.knowledge.libraryAdded ?? 0} />
          <MiniMetric label="想法" value={summary?.knowledge.thoughtsCreated ?? 0} />
          <MiniMetric label="已提升" value={promoted} />
        </div>
        <button
          onClick={() => setView({ kind: 'library' })}
          className="mx-3 mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Library size={13} />
          打开资料库
        </button>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="系统健康" />
        <MetricRow
          icon={<Gauge size={14} />}
          label="在线 Runtime"
          value={onlineRuntimes}
          actionLabel="打开"
          onAction={() => setView({ kind: 'runtimes' })}
        />
        <MetricRow
          icon={<AlertTriangle size={14} />}
          label="未提交项目"
          value={summary?.health.git.dirtyProjects.length ?? 0}
          actionLabel="控制台"
          onAction={() => setView({ kind: 'developerConsole' })}
        />
        <MetricRow
          icon={<CheckCircle2 size={14} />}
          label="今日预算"
          value={`$${(summary?.health.budget.todayUsd ?? 0).toFixed(4)}`}
          actionLabel="详情"
          onAction={() => setView({ kind: 'runtimes' })}
        />
      </section>

      <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <SectionTitle title="近期活动" />
        {(summary?.thinking.recentActivities ?? []).slice(0, 5).map((event) => (
          <ActivityRow key={event.id} event={event} />
        ))}
        {(summary?.thinking.recentActivities ?? []).length === 0 ? (
          <EmptyHint title="暂无活动" detail="可追踪事件会显示在这里。" />
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
      toast(`仪表盘辅助面板失败：${(error as Error).message}`);
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
        title="刷新仪表盘辅助面板"
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
      <span
        className={`rounded px-2 py-1 text-xs font-semibold tabular-nums ${hot ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-neutral-100 dark:bg-neutral-900'}`}
      >
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
      <div className="mt-0.5 line-clamp-2 text-neutral-700 dark:text-neutral-300">
        {event.summary}
      </div>
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

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
