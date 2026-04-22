import { useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import { usePara } from '../store/para';
import { TaskRow } from '../components/TaskRow';

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Today view: union of tasks explicitly flagged `status: today` and tasks
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

  const explicit = tasks.filter((t) => t.status === 'today');
  const merged = [...new Map([...explicit, ...overdue].map((t) => [t.id, t])).values()];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Today</h1>
        <p className="text-xs text-neutral-500">{today} · {merged.length} task{merged.length === 1 ? '' : 's'}</p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {merged.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing on deck. Good a day as any to rest.</p>
        ) : (
          <ul className="space-y-1">
            {merged.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} onStatus={updateStatus} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
