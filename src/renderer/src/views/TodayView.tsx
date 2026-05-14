import { useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { taskExecutionMode } from '@shared/schemas';
import { usePara } from '../store/para';
import { TaskRow } from '../components/TaskRow';

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Today view: union of tasks explicitly flagged `status: todo` and tasks
 * whose `due` is on or before today (excluding already-done).
 */
export function TodayView(): JSX.Element {
  const tasks = usePara((s) => s.tasks);
  const updateStatus = usePara((s) => s.updateStatus);
  const refresh = usePara((s) => s.refresh);
  const [overdue, setOverdue] = useState<TaskRecord[]>([]);
  const today = useMemo(todayIso, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void window.orbit.para
      .listTasks({ due_before: today })
      .then((r) => setOverdue(r.filter((t) => t.status !== 'done')));
  }, [today, tasks]);

  const explicit = tasks.filter((t) => t.status === 'todo');
  const merged = [...new Map([...explicit, ...overdue].map((t) => [t.id, t])).values()];
  const needsMe = merged.filter((task) => {
    const mode = taskExecutionMode(task);
    return mode === 'human' || mode === 'assisted' || mode === 'scheduled';
  });
  const agentQueue = merged.filter((task) => taskExecutionMode(task) === 'agent');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Today</h1>
        <p className="text-xs text-neutral-500">
          {today} · {needsMe.length} for me · {agentQueue.length} agent-ready
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {merged.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing on deck. Good a day as any to rest.</p>
        ) : (
          <div className="space-y-5">
            <TodaySection title="Needs me" tasks={needsMe} onStatus={updateStatus} />
            <TodaySection title="Agent queue" tasks={agentQueue} onStatus={updateStatus} />
          </div>
        )}
      </div>
    </div>
  );
}

function TodaySection({
  title,
  tasks,
  onStatus
}: {
  title: string;
  tasks: TaskRecord[];
  onStatus(id: string, status: TaskRecord['status']): void;
}): JSX.Element | null {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
        <span>{title}</span>
        <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {tasks.length}
        </span>
      </div>
      <ul className="space-y-1">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskRow task={task} onStatus={onStatus} />
          </li>
        ))}
      </ul>
    </section>
  );
}
