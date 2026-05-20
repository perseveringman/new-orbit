import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, RefreshCw } from 'lucide-react';
import type { FeedSource, FeedTask, FeedTaskSnapshot, FeedTaskStatus } from '@shared/feed';

export function FeedTaskCenterPanel(): JSX.Element {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [tasks, setTasks] = useState<FeedTaskSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

  async function reload(): Promise<void> {
    try {
      setError(null);
      const [nextSources, nextTasks] = await Promise.all([
        window.orbit.feeds.listSources(),
        window.orbit.feeds.listTasks()
      ]);
      setSources(nextSources);
      setTasks(nextTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Feed 任务失败。');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const off = window.orbit.feeds.onEvent((event) => {
      if (event.type === 'tasks_changed' && event.snapshot) setTasks(event.snapshot);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void reload();
      }, 120);
    });
    return () => {
      off();
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
    };
  }, []);

  const activeTaskCount = (tasks?.running ?? 0) + (tasks?.queued ?? 0) + (tasks?.retry_wait ?? 0);
  useEffect(() => {
    if (activeTaskCount === 0) return;
    const timer = window.setInterval(() => {
      void reload();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeTaskCount]);

  async function refreshAll(): Promise<void> {
    setBusy(true);
    try {
      await window.orbit.feeds.enqueueTask({
        kind: 'source.refresh',
        priority: 'manual'
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新 Feed 失败。');
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(job: FeedTask): Promise<void> {
    setBusy(true);
    try {
      await window.orbit.feeds.cancelTask(job.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消任务失败。');
    } finally {
      setBusy(false);
    }
  }

  async function retryTask(job: FeedTask): Promise<void> {
    setBusy(true);
    try {
      await window.orbit.feeds.retryTask(job.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重试任务失败。');
    } finally {
      setBusy(false);
    }
  }

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const jobs = (tasks?.jobs ?? []).slice(0, 80);

  return (
    <div className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Feed 任务中心</h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">最近任务和平台状态</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshAll()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-[11px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            <RefreshCw size={13} className={tasks?.running ? 'animate-spin' : ''} />
            刷新全部
          </button>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1">
          <TaskStat label="运行" value={tasks?.running ?? 0} tone="sky" />
          <TaskStat label="排队" value={tasks?.queued ?? 0} tone="neutral" />
          <TaskStat label="重试" value={tasks?.retry_wait ?? 0} tone="amber" />
          <TaskStat label="成功" value={tasks?.success ?? 0} tone="emerald" />
          <TaskStat label="失败" value={tasks?.failed ?? 0} tone="rose" />
        </div>
        {tasks?.total ? (
          <div className="mt-2 rounded-md bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            最近 {tasks.total} 个任务，共抓取 {tasks.fetched} 条，新增 {tasks.created} 条
            {tasks.cancelled ? `，取消 ${tasks.cancelled} 个` : ''}
          </div>
        ) : null}
        {tasks?.lanes.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tasks.lanes.map((lane) => (
              <span
                key={lane.platform}
                className="rounded-full border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
              >
                {feedTaskPlatformLabel(lane.platform)}: {lane.running} 运行 / {lane.queued + lane.retry_wait} 等待
              </span>
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {jobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-800">
            暂无 Feed 抓取任务。
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <FeedTaskRow
                key={job.id}
                job={job}
                source={sourceById.get(job.source_id)}
                busy={busy}
                onCancelTask={(task) => void cancelTask(task)}
                onRetryTask={(task) => void retryTask(task)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedTaskRow({
  job,
  source,
  busy,
  onCancelTask,
  onRetryTask
}: {
  job: FeedTask;
  source?: FeedSource;
  busy: boolean;
  onCancelTask: (job: FeedTask) => void;
  onRetryTask: (job: FeedTask) => void;
}): JSX.Element {
  const canCancel = job.status === 'queued' || job.status === 'retry_wait';
  const canRetry = job.status === 'failed' || job.status === 'cancelled';
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${feedTaskStatusDotClass(job.status)}`} />
            <h3 className="truncate font-medium text-neutral-900 dark:text-neutral-100">
              {job.source_title ?? source?.title ?? job.source_id}
            </h3>
          </div>
          <div className="mt-1 truncate text-[11px] text-neutral-500">
            {feedTaskKindLabel(job.kind)} / {feedTaskPlatformLabel(job.platform)}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${feedTaskStatusClass(job.status)}`}>
          {feedTaskStatusLabel(job.status)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
        <SmallStat label="尝试" value={job.attempts} />
        <SmallStat label="新增" value={job.result?.created ?? 0} />
        <SmallStat label="抓取" value={job.result?.fetched ?? 0} />
      </div>
      {job.error ? (
        <div className="mt-2 flex gap-1.5 rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="line-clamp-3 whitespace-pre-wrap">{job.error}</span>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-neutral-500">
          {job.status === 'retry_wait'
            ? `下次重试：${formatRelative(job.due_at)}`
            : job.completed_at
              ? `完成于 ${formatRelative(job.completed_at)}`
              : `创建于 ${formatRelative(job.created_at)}`}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          disabled={busy || !canCancel}
          onClick={() => onCancelTask(job)}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 disabled:opacity-45 dark:border-neutral-800 dark:hover:bg-neutral-900"
        >
          <Ban size={12} />
          取消
        </button>
        <button
          type="button"
          disabled={busy || !canRetry}
          onClick={() => onRetryTask(job)}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-[11px] hover:bg-neutral-50 disabled:opacity-45 dark:border-neutral-800 dark:hover:bg-neutral-900"
        >
          <RefreshCw size={12} />
          重试
        </button>
      </div>
    </section>
  );
}

function TaskStat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'sky' | 'neutral' | 'amber' | 'emerald' | 'rose';
}): JSX.Element {
  const className = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
  }[tone];
  return (
    <div className={`rounded-md px-2 py-2 text-center ${className}`}>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md bg-neutral-50 px-2 py-1 dark:bg-neutral-900">
      <div className="font-medium">{value}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}

function feedTaskKindLabel(kind: FeedTask['kind']): string {
  return kind === 'source.initial_fetch' ? '首次抓取' : '订阅更新';
}

function feedTaskPlatformLabel(platform: FeedTask['platform']): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'x') return 'X';
  if (platform === 'reddit') return 'Reddit';
  if (platform === 'hackernews') return 'Hacker News';
  if (platform === 'rss') return 'RSS';
  return 'Custom';
}

function feedTaskStatusLabel(status: FeedTaskStatus): string {
  if (status === 'queued') return '排队';
  if (status === 'running') return '运行中';
  if (status === 'retry_wait') return '等待重试';
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  return '已取消';
}

function feedTaskStatusDotClass(status: FeedTaskStatus): string {
  if (status === 'running') return 'bg-sky-500';
  if (status === 'queued') return 'bg-neutral-400';
  if (status === 'retry_wait') return 'bg-amber-500';
  if (status === 'success') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-rose-500';
  return 'bg-neutral-300';
}

function feedTaskStatusClass(status: FeedTaskStatus): string {
  if (status === 'running') return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-100';
  if (status === 'queued') return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300';
  if (status === 'retry_wait') return 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100';
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200';
  return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400';
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < 0) {
    const futureMs = Math.abs(diffMs);
    if (futureMs < hour) return `${Math.max(1, Math.round(futureMs / minute))} 分钟后`;
    if (futureMs < day) return `${Math.round(futureMs / hour)} 小时后`;
    return date.toLocaleString();
  }
  if (Math.abs(diffMs) < hour) return `${Math.max(1, Math.round(diffMs / minute))} 分钟前`;
  if (Math.abs(diffMs) < day) return `${Math.round(diffMs / hour)} 小时前`;
  if (Math.abs(diffMs) < day * 7) return `${Math.round(diffMs / day)} 天前`;
  return date.toLocaleDateString();
}
