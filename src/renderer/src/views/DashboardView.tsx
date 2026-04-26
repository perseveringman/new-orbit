import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActivityEvent } from '@shared/activity';
import type { DashboardSummary } from '@shared/dashboard';
import { useWorkspace } from '../store/workspace';
import { useFiles } from '../store/files';
import { usePara } from '../store/para';
import { VisionEditorModal } from '../components/Modals/VisionEditorModal';

const cardCls =
  'rounded-2xl border border-neutral-200 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70';
const subtleCls = 'text-xs text-neutral-500 dark:text-neutral-400';

export function DashboardView(): JSX.Element {
  const vault = useWorkspace((s) => s.vault);
  const vision = useWorkspace((s) => s.visionExcerpt);
  const refreshVision = useWorkspace((s) => s.refreshVision);
  const projects = useWorkspace((s) => s.projects);
  const areas = useWorkspace((s) => s.areas);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const entities = usePara((s) => s.entities);
  const tasks = usePara((s) => s.tasks);
  const setView = usePara((s) => s.setView);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
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

  const doingTasks = tasks.filter((task) => task.status === 'doing').length;
  const blockedTasks = summary?.pending.blockedTasks ?? tasks.filter((task) => task.status === 'blocked').length;
  const pendingTasks =
    summary?.pending.pendingTasks ??
    tasks.filter((task) => task.status === 'waiting' || task.status === 'todo').length;

  return (
    <div className="flex h-full flex-col overflow-auto bg-neutral-50 dark:bg-neutral-950">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className={subtleCls}>
            Five-quadrant command center for pending work, agent execution, knowledge growth,
            thinking trails, and system health.
          </p>
        </div>
        <div className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-800">
          {new Date().toLocaleDateString()} {loadingSummary ? '· refreshing' : ''}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="grid gap-4">
          <PendingActionsCard
            inboxPending={summary?.pending.inboxPending ?? 0}
            pendingTasks={pendingTasks}
            blockedTasks={blockedTasks}
            onInbox={() => setView({ kind: 'inbox' })}
            onToday={() => setView({ kind: 'today' })}
          />
          <AgentStatusCard
            doingTasks={summary?.agent.doingTasks ?? doingTasks}
            activeRuns={summary?.agent.activeRuns ?? 0}
            todayCostUsd={summary?.agent.todayCostUsd ?? 0}
            onlineRuntimes={summary?.agent.onlineRuntimes ?? 0}
            autoRunnerEnabled={summary?.agent.autoRunnerEnabled ?? false}
            busy={autoRunnerBusy}
            onToggleAutoRunner={async () => {
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
            }}
            onKanban={() => setView({ kind: 'kanban', projectUid: null })}
          />
        </div>

        <main className="grid min-w-0 gap-4">
          <KnowledgeGrowthCard
            stats={summary?.knowledge ?? null}
            fallbackCounts={paraCounts}
            onProjects={() => setView({ kind: 'kanban', projectUid: null })}
          />
          <ThinkingTrailCard
            vision={vision}
            stats={summary?.thinking ?? null}
            generatingReview={generatingReview}
            onEditVision={() => setEditVision(true)}
            onOpenReview={async () => {
              const path = summary?.thinking.dailyReviewPath;
              if (path) await openPath(path);
            }}
            onGenerateReview={async () => {
              setGeneratingReview(true);
              try {
                const review = await window.orbit.review.generate();
                await openPath(review.path);
                toast(
                  `Daily Review generated: ${review.recommendedTaskUids.length} recommended task(s)`
                );
                await loadDashboard();
              } catch (error) {
                toast(`Daily Review failed: ${(error as Error).message}`);
              } finally {
                setGeneratingReview(false);
              }
            }}
          />
          <SystemHealthCard
            health={summary?.health ?? null}
            onConsole={() => setView({ kind: 'developerConsole' })}
            onRuntime={() => setView({ kind: 'runtimes' })}
            onDirtyProject={(projectName) => {
              const project = projects.find((item) => item.name === projectName);
              if (!project) return;
              setActiveProjectUid(project.uid);
              setView({ kind: 'project', projectUid: project.uid });
            }}
          />
        </main>
      </div>

      <VisionEditorModal open={editVision} onClose={() => setEditVision(false)} />
    </div>
  );
}

function PendingActionsCard({
  inboxPending,
  pendingTasks,
  blockedTasks,
  onInbox,
  onToday
}: {
  inboxPending: number;
  pendingTasks: number;
  blockedTasks: number;
  onInbox(): void;
  onToday(): void;
}): JSX.Element {
  return (
    <section className={cardCls}>
      <CardHeading eyebrow="Quadrant 1" title="待我处理" />
      <MetricLine label="Inbox pending" value={inboxPending} tone={inboxPending > 0 ? 'red' : 'neutral'} />
      <MetricLine label="Ready / waiting tasks" value={pendingTasks} />
      <MetricLine label="Blocked tasks" value={blockedTasks} tone={blockedTasks > 0 ? 'amber' : 'neutral'} />
      <div className="mt-4 flex gap-2">
        <SmallButton onClick={onInbox}>Go Inbox</SmallButton>
        <SmallButton onClick={onToday}>Today</SmallButton>
      </div>
    </section>
  );
}

function AgentStatusCard({
  doingTasks,
  activeRuns,
  todayCostUsd,
  onlineRuntimes,
  autoRunnerEnabled,
  busy,
  onToggleAutoRunner,
  onKanban
}: {
  doingTasks: number;
  activeRuns: number;
  todayCostUsd: number;
  onlineRuntimes: number;
  autoRunnerEnabled: boolean;
  busy: boolean;
  onToggleAutoRunner(): void;
  onKanban(): void;
}): JSX.Element {
  return (
    <section className={cardCls}>
      <CardHeading eyebrow="Quadrant 2" title="Agent 进行中" />
      <MetricLine label="Doing tasks" value={doingTasks} />
      <MetricLine label="Active runs" value={activeRuns} tone={activeRuns > 0 ? 'blue' : 'neutral'} />
      <MetricLine label="Runtime online" value={onlineRuntimes} />
      <MetricLine label="Today cost" value={`$${todayCostUsd.toFixed(4)}`} />
      <div className="mt-4 grid gap-2">
        <SmallButton onClick={onToggleAutoRunner} disabled={busy}>
          {autoRunnerEnabled ? 'Pause Auto-runner' : 'Start Auto-runner'}
        </SmallButton>
        <SmallButton onClick={onKanban}>Open Kanban</SmallButton>
      </div>
    </section>
  );
}

function KnowledgeGrowthCard({
  stats,
  fallbackCounts,
  onProjects
}: {
  stats: DashboardSummary['knowledge'] | null;
  fallbackCounts: { active: number; areas: number; resources: number; archived: number };
  onProjects(): void;
}): JSX.Element {
  return (
    <section className={cardCls}>
      <CardHeading eyebrow="Quadrant 3" title="知识增长" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <BigMetric label="Feed saved" value={stats?.feedSaved ?? 0} />
        <BigMetric label="Library added" value={stats?.libraryAdded ?? fallbackCounts.resources} />
        <BigMetric label="Thoughts" value={stats?.thoughtsCreated ?? 0} />
        <BigMetric label="Promoted" value={(stats?.promotedToResource ?? 0) + (stats?.promotedToProject ?? 0)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <ParaPill label="Active Projects" value={stats?.activeProjects ?? fallbackCounts.active} />
        <ParaPill label="Areas" value={fallbackCounts.areas} />
        <ParaPill label="Resources" value={fallbackCounts.resources} />
        <ParaPill label="Archived" value={stats?.archivedProjects ?? fallbackCounts.archived} />
      </div>
      <div className="mt-4">
        <SmallButton onClick={onProjects}>Review project flow</SmallButton>
      </div>
    </section>
  );
}

function ThinkingTrailCard({
  vision,
  stats,
  generatingReview,
  onEditVision,
  onOpenReview,
  onGenerateReview
}: {
  vision: string | null;
  stats: DashboardSummary['thinking'] | null;
  generatingReview: boolean;
  onEditVision(): void;
  onOpenReview(): void;
  onGenerateReview(): void;
}): JSX.Element {
  return (
    <section className={cardCls}>
      <CardHeading eyebrow="Quadrant 4" title="思考轨迹" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {stats?.dailyReviewAvailable ? (
              <SmallButton onClick={onOpenReview}>Open Daily Review</SmallButton>
            ) : (
              <SmallButton onClick={onGenerateReview} disabled={generatingReview}>
                {generatingReview ? 'Generating…' : 'Generate Daily Review'}
              </SmallButton>
            )}
            <SmallButton onClick={onEditVision}>Edit Vision</SmallButton>
            <span className={subtleCls}>
              Vision reviewed:{' '}
              {stats?.visionDaysSinceReview === null || stats?.visionDaysSinceReview === undefined
                ? 'unknown'
                : `${stats.visionDaysSinceReview} day(s) ago`}
            </span>
          </div>
          <pre className="mt-3 max-h-28 overflow-hidden whitespace-pre-wrap rounded-xl bg-neutral-100 p-3 font-mono text-[11px] leading-snug text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
            {vision && vision.trim()
              ? vision
              : 'Your Vision.md is empty — click Edit Vision to set your North Star.'}
          </pre>
          {stats?.recentThinkingTrails && stats.recentThinkingTrails.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.recentThinkingTrails.map((trail) => (
                <span
                  key={trail}
                  className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {trail}
                </span>
              ))}
            </div>
          )}
        </div>
        <RecentActivityList events={stats?.recentActivities ?? []} />
      </div>
    </section>
  );
}

function SystemHealthCard({
  health,
  onConsole,
  onRuntime,
  onDirtyProject
}: {
  health: DashboardSummary['health'] | null;
  onConsole(): void;
  onRuntime(): void;
  onDirtyProject(projectName: string): void;
}): JSX.Element {
  return (
    <section className={cardCls}>
      <CardHeading eyebrow="Quadrant 5" title="系统健康" />
      <div className="grid gap-3 md:grid-cols-4">
        <HealthTile
          label="Disk"
          value={formatBytes(health?.disk.vaultSizeBytes ?? 0)}
          detail={`.orbit ${formatBytes(health?.disk.orbitDataSizeBytes ?? 0)} · worktrees ${formatBytes(
            health?.disk.worktreeSizeBytes ?? 0
          )}`}
        />
        <HealthTile
          label="Git"
          value={`${health?.git.dirtyProjects.length ?? 0} dirty`}
          detail="projects with uncommitted files"
        />
        <HealthTile
          label="Runtime"
          value={`${health?.runtimes.filter((runtime) => runtime.status === 'online').length ?? 0} online`}
          detail={(health?.runtimes ?? [])
            .slice(0, 3)
            .map((runtime) => `${runtime.provider} ${runtime.status}`)
            .join(' · ')}
        />
        <HealthTile
          label="Budget"
          value={`$${(health?.budget.todayUsd ?? 0).toFixed(4)}`}
          detail={`month $${(health?.budget.monthUsd ?? 0).toFixed(2)} · task limit $${
            health?.budget.defaultLimitPerTask ?? 20
          }`}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <SmallButton onClick={onConsole}>Open Developer Console</SmallButton>
        <SmallButton onClick={onRuntime}>Runtime details</SmallButton>
        {(health?.git.dirtyProjects ?? []).slice(0, 3).map((project) => (
          <SmallButton key={project.projectName} onClick={() => onDirtyProject(project.projectName)}>
            {project.projectName}: {project.uncommittedFiles}
          </SmallButton>
        ))}
      </div>
    </section>
  );
}

function RecentActivityList({ events }: { events: ActivityEvent[] }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Recent Activity
      </div>
      <ul className="mt-2 space-y-2">
        {events.slice(0, 6).map((event) => (
          <li key={event.id} className="text-xs">
            <div className="flex items-center gap-2 text-neutral-500">
              <span>{formatTime(event.at)}</span>
              <span>{event.action}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-neutral-700 dark:text-neutral-300">
              {event.summary}
            </div>
          </li>
        ))}
        {events.length === 0 && <li className={subtleCls}>No recent activity yet.</li>}
      </ul>
    </div>
  );
}

function CardHeading({ eyebrow, title }: { eyebrow: string; title: string }): JSX.Element {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{eyebrow}</div>
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
    </div>
  );
}

function MetricLine({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'red' | 'amber' | 'blue';
}): JSX.Element {
  const toneCls =
    tone === 'red'
      ? 'text-red-600 dark:text-red-300'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-300'
        : tone === 'blue'
          ? 'text-blue-600 dark:text-blue-300'
          : 'text-neutral-900 dark:text-neutral-50';
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-2 text-sm last:border-b-0 dark:border-neutral-800">
      <span className={subtleCls}>{label}</span>
      <span className={`font-semibold tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

function BigMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-950">
      <div className={subtleCls}>{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ParaPill({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-full border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className="ml-2 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function HealthTile({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className={subtleCls}>{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-1 min-h-8 text-xs text-neutral-500">{detail || '—'}</div>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  disabled = false
}: {
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
