import { useEffect, useState } from 'react';
import type { ScheduledTask, ScheduledTaskExecution } from '@shared/scheduled-task';

export function ScheduledTasksView(): JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [active, setActive] = useState<ScheduledTask | null>(null);
  const [executions, setExecutions] = useState<ScheduledTaskExecution[]>([]);
  const [prompt, setPrompt] = useState('');

  async function reload(): Promise<void> {
    const list = await window.orbit.scheduledTasks.list();
    setTasks(list);
    if (!active && list[0]) setActive(list[0]);
  }

  useEffect(() => {
    void reload();
    return window.orbit.scheduledTasks.onEvent(() => void reload());
  }, []);

  useEffect(() => {
    if (!active) return;
    void window.orbit.scheduledTasks.executions(active.id, 20).then(setExecutions);
  }, [active?.id]);

  async function createFromPrompt(): Promise<void> {
    if (!prompt.trim()) return;
    const parsed = await window.orbit.scheduledTasks.parseNaturalLanguage(prompt);
    await window.orbit.scheduledTasks.create({
      name: prompt.slice(0, 60),
      schedule: parsed.schedule,
      action: parsed.action,
      source: 'ask_anywhere'
    });
    setPrompt('');
    await reload();
  }

  async function trigger(task: ScheduledTask): Promise<void> {
    await window.orbit.scheduledTasks.triggerNow(task.id);
    setActive(await window.orbit.scheduledTasks.get(task.id));
    setExecutions(await window.orbit.scheduledTasks.executions(task.id, 20));
    await reload();
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-96 shrink-0 overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Scheduled</h1>
        <p className="text-xs text-neutral-500">System and user recurring tasks with execution history.</p>
        <div className="mt-4 flex gap-2">
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="每天 9:00 总结…" className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
          <button onClick={() => void createFromPrompt()} className="rounded bg-sky-600 px-2 py-1 text-xs text-white">Create</button>
        </div>
        <div className="mt-4 space-y-2">
          {tasks.map((task) => (
            <button key={task.id} onClick={() => setActive(task)} className={`w-full rounded-xl border p-3 text-left text-sm ${active?.id === task.id ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}>
              <div className="flex items-center gap-2">
                {task.source === 'system' ? <span title="system task">🔒</span> : null}
                <span className="font-medium">{task.name}</span>
                <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">{task.status}</span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">{scheduleLabel(task)}</div>
            </button>
          ))}
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
                <button onClick={() => void trigger(active)} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">Run now</button>
                <button onClick={() => void (active.status === 'paused' ? window.orbit.scheduledTasks.resume(active.id) : window.orbit.scheduledTasks.pause(active.id)).then(reload)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                  {active.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
                {active.source !== 'system' ? (
                  <button onClick={() => void window.orbit.scheduledTasks.delete(active.id).then(reload)} className="rounded border border-rose-300 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-900">Delete</button>
                ) : null}
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <Stat label="Total" value={active.total_runs} />
              <Stat label="Success" value={active.success_runs} />
              <Stat label="Failures" value={active.failure_runs} />
            </div>
            <h3 className="mt-8 text-sm font-semibold">Executions</h3>
            <div className="mt-2 space-y-2">
              {executions.map((execution) => (
                <div key={execution.id} className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                  <div className="font-medium">{execution.status} · {new Date(execution.started_at).toLocaleString()}</div>
                  {execution.error ? <div className="mt-1 text-xs text-rose-500">{execution.error}</div> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-500">Select a scheduled task.</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}

function scheduleLabel(task: ScheduledTask): string {
  if (task.schedule.kind === 'daily') return `Daily ${task.schedule.time}`;
  if (task.schedule.kind === 'weekly') return `Weekly ${task.schedule.day_of_week?.join(',')} ${task.schedule.time}`;
  if (task.schedule.kind === 'interval') return `Every ${task.schedule.interval_minutes} min`;
  return task.schedule.kind;
}

