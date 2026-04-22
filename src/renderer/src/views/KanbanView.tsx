import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { EntitySummary, TaskRecord, TaskStatus } from '@shared/schemas';
import { TASK_STATUSES } from '@shared/schemas';
import { groupByStatus, moveTask } from '@shared/kanban';
import { usePara } from '../store/para';
import { TaskRow } from '../components/TaskRow';

const KanbanBoard = lazy(() => import('../components/KanbanBoard'));

/**
 * Project Kanban view. Columns = task statuses. Drag-and-drop is powered by
 * `@dnd-kit/core`, loaded lazily so the tasks-only views don't pay for it.
 */
export function KanbanView({ projectUid }: { projectUid: string | null }): JSX.Element {
  const entities = usePara((s) => s.entities);
  const updateStatus = usePara((s) => s.updateStatus);
  const setView = usePara((s) => s.setView);
  const projects = entities.filter((e) => e.type === 'project');
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    if (!projectUid) {
      setTasks([]);
      return;
    }
    void window.orbit.para.listTasks({ project_uid: projectUid }).then(setTasks);
  }, [projectUid]);

  const project: EntitySummary | undefined = projects.find((p) => p.uid === projectUid);
  const cols = useMemo(() => groupByStatus(tasks), [tasks]);

  async function onDrop(id: string, target: TaskStatus): Promise<void> {
    const { next, moved } = moveTask(tasks, id, target);
    if (!moved) return;
    setTasks(next);
    await updateStatus(id, target);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-baseline gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Kanban</h1>
        <select
          value={projectUid ?? ''}
          onChange={(e) => setView({ kind: 'kanban', projectUid: e.target.value || null })}
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.title}
            </option>
          ))}
        </select>
        {project && (
          <span className="text-xs text-neutral-500">{tasks.length} tasks · {project.status ?? ''}</span>
        )}
      </header>
      <div className="flex-1 overflow-auto p-4">
        {!projectUid ? (
          <p className="text-sm text-neutral-500">Pick a project to see its board.</p>
        ) : tasks.length === 0 ? (
          <div className="grid grid-cols-5 gap-3">
            {TASK_STATUSES.map((s) => (
              <StaticColumn key={s} status={s} tasks={[]} onStatus={updateStatus} />
            ))}
          </div>
        ) : (
          <Suspense fallback={<p className="text-sm text-neutral-500">Loading board…</p>}>
            <KanbanBoard columns={cols} onDrop={onDrop} onStatus={updateStatus} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export function StaticColumn({
  status,
  tasks,
  onStatus
}: {
  status: TaskStatus;
  tasks: TaskRecord[];
  onStatus: (id: string, status: TaskStatus) => void;
}): JSX.Element {
  return (
    <section className="flex min-h-[120px] flex-col rounded border border-neutral-200 bg-neutral-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
      <header className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wide text-neutral-500">
        <span>{status}</span>
        <span>{tasks.length}</span>
      </header>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskRow task={t} onStatus={onStatus} />
          </li>
        ))}
      </ul>
    </section>
  );
}
