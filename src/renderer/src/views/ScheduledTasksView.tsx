import { useEffect, useMemo, useState } from 'react';
import type { ScheduledTask, ScheduledTaskExecution } from '@shared/scheduled-task';

export function ScheduledTasksView(): JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [active, setActive] = useState<ScheduledTask | null>(null);
  const [executions, setExecutions] = useState<ScheduledTaskExecution[]>([]);
  const [prompt, setPrompt] = useState('');
  const [budget, setBudget] = useState('');
  const [retryAttempts, setRetryAttempts] = useState('1');
  const [notifyChannel, setNotifyChannel] = useState('in-app');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const systemTasks = useMemo(() => tasks.filter((task) => task.source === 'system'), [tasks]);
  const userTasks = useMemo(() => tasks.filter((task) => task.source !== 'system'), [tasks]);

  async function reload(): Promise<void> {
    try {
      setError(null);
      const list = await window.orbit.scheduledTasks.list();
      setTasks(list);
      setStale(false);
      if (!active && list[0]) setActive(list[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载定时任务失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    return window.orbit.scheduledTasks.onEvent(() => {
      setStale(true);
      void reload();
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    void window.orbit.scheduledTasks.executions(active.id, 20).then(setExecutions);
  }, [active?.id]);

  async function createFromPrompt(): Promise<void> {
    if (!prompt.trim()) return;
    const parsed = await window.orbit.scheduledTasks.parseNaturalLanguage(prompt);
    try {
      setError(null);
      await window.orbit.scheduledTasks.create({
        name: prompt.slice(0, 60),
        schedule: parsed.schedule,
        action: parsed.action,
        source: 'ask_anywhere',
        ...(budget.trim() ? { budget_usd: Number(budget) } : {}),
        retry: { max_attempts: Number(retryAttempts) || 1, backoff_minutes: 10 },
        notify_channels: notifyChannel.trim() ? [notifyChannel.trim()] : []
      });
      setPrompt('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建定时任务失败。');
    }
  }

  async function trigger(task: ScheduledTask): Promise<void> {
    try {
      setError(null);
      await window.orbit.scheduledTasks.runNow(task.id);
      setActive(await window.orbit.scheduledTasks.get(task.id));
      setExecutions(await window.orbit.scheduledTasks.getExecutions(task.id, 20));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '运行定时任务失败。');
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-96 shrink-0 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">定时任务</h1>
        <p className="text-xs text-neutral-500">系统与用户的周期任务，以及执行历史。</p>
        <div className="mt-4 rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800">
          <label className="text-xs font-medium">创建自动化</label>
          <div className="mt-2 flex gap-2">
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="每天 9:00 总结…" className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => void createFromPrompt()} className="rounded bg-sky-600 px-2 py-1 text-xs text-white">创建</button>
          </div>
          <details className="mt-2 text-xs text-neutral-500">
            <summary className="cursor-pointer">高级：Area / 预算 / 重试 / 通知</summary>
            <div className="mt-2 grid gap-2">
              <input aria-label="预算" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="预算（USD，可选）" className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900" />
              <input aria-label="重试次数" value={retryAttempts} onChange={(event) => setRetryAttempts(event.target.value)} placeholder="重试次数" className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900" />
              <input aria-label="通知渠道" value={notifyChannel} onChange={(event) => setNotifyChannel(event.target.value)} placeholder="通知渠道" className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900" />
            </div>
          </details>
        </div>
        {stale ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30">后台事件触发后，定时任务列表已刷新。</div> : null}
        {error ? <ErrorBox message={error} onRetry={() => void reload()} /> : null}
        {loading ? <SkeletonList /> : null}
        {!loading && tasks.length === 0 ? (
          <EmptyState />
        ) : null}
        <div className="mt-4 space-y-2">
          <TaskSection title="系统任务" tasks={systemTasks} active={active} onSelect={setActive} />
          <TaskSection title="用户任务" tasks={userTasks} active={active} onSelect={setActive} />
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        {active ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{active.name}</h2>
                <p className="mt-1 text-sm text-neutral-500">{active.description}</p>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => void trigger(active)} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">立即运行</button>
                <button onClick={() => void (active.status === 'paused' ? window.orbit.scheduledTasks.enable(active.id) : window.orbit.scheduledTasks.disable(active.id)).then(reload)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                   {active.status === 'paused' ? '启用' : '停用'}
                </button>
                {active.source !== 'system' ? (
                  <button onClick={() => {
                     if (window.confirm('删除这个定时自动化？')) void window.orbit.scheduledTasks.delete(active.id).then(reload);
                   }} className="rounded border border-rose-300 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-900">删除</button>
                ) : null}
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
               <Stat label="总次数" value={active.total_runs} />
               <Stat label="成功" value={active.success_runs} />
               <Stat label="失败" value={active.failure_runs} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
               <Meta label="动作" value={actionLabel(active)} />
               <Meta label="预算" value={active.budget_usd === undefined ? '无上限' : `$${active.budget_usd}`} />
               <Meta label="重试" value={`${active.retry?.max_attempts ?? 1} 次`} />
            </div>
            {active.disabled_reason ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30">已停用：{active.disabled_reason}</div> : null}
             <h3 className="mt-8 text-sm font-semibold">执行历史</h3>
            <div className="mt-2 space-y-2">
               {executions.length === 0 ? <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">暂无执行记录。运行这个任务即可创建第一条历史。</div> : executions.map((execution) => (
                <div key={execution.id} className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                  <div className="font-medium">{execution.status} · {new Date(execution.started_at).toLocaleString()}</div>
                  {execution.error ? <div className="mt-1 text-xs text-rose-500">{execution.error}</div> : null}
                  {execution.output ? <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 text-[11px] text-neutral-500 dark:bg-neutral-900">{JSON.stringify(execution.output, null, 2)}</pre> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
           <div className="text-sm text-neutral-500">请选择一个定时任务。</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function TaskSection({ title, tasks, active, onSelect }: { title: string; tasks: ScheduledTask[]; active: ScheduledTask | null; onSelect: (task: ScheduledTask) => void }): JSX.Element {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <button key={task.id} onClick={() => onSelect(task)} className={`w-full rounded-xl border p-3 text-left text-sm ${active?.id === task.id ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}>
            <div className="flex items-center gap-2">
              {task.source === 'system' ? <span title="系统任务">🔒</span> : null}
              <span className="font-medium">{task.name}</span>
              <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">{scheduledStatusLabel(task.status)}</span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{scheduleLabel(task)}</div>
          </button>
        ))}
        {tasks.length === 0 ? <div className="rounded-xl border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">这个分组暂无任务。</div> : null}
      </div>
    </section>
  );
}

function SkeletonList(): JSX.Element {
  return <div className="mt-4 space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />)}</div>;
}

function EmptyState(): JSX.Element {
  return <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">暂无定时自动化。可以用自然语言创建，或打开复盘 / 记忆生成系统自动化。</div>;
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30"><div>{message}</div><button onClick={onRetry} className="mt-2 rounded bg-rose-600 px-2 py-1 text-xs text-white">重试</button></div>;
}

function scheduleLabel(task: ScheduledTask): string {
  if (task.schedule.kind === 'daily') return `每日 ${task.schedule.time}`;
  if (task.schedule.kind === 'weekly') return `每周 ${(task.schedule.days ?? task.schedule.day_of_week)?.join(',')} ${task.schedule.time}`;
  if (task.schedule.kind === 'interval') return `每 ${task.schedule.interval_minutes} 分钟`;
  return task.schedule.kind;
}

function actionLabel(task: ScheduledTask): string {
  if (task.action.kind === 'synthesis') return `Synthesis：${task.action.synthesis_kind}`;
  if (task.action.kind === 'review') return `复盘：${task.action.review_kind}`;
  if (task.action.kind === 'memory_digest') return '记忆摘要';
  return task.action.kind;
}

function scheduledStatusLabel(status: ScheduledTask['status']): string {
  const labels: Partial<Record<ScheduledTask['status'], string>> = {
    active: '活跃',
    paused: '已暂停',
    disabled: '已停用',
    error: '错误'
  };
  return labels[status] ?? status;
}
