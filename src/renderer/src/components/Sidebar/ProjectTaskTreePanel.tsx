import { useEffect, useMemo, useState } from 'react';
import type { TaskRecord, TaskStatus } from '@shared/schemas';
import { useSidebar } from '../../store/sidebar';

const STATUS_ORDER: TaskStatus[] = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'];

export function ProjectTaskTreePanel({
  projectUid
}: {
  projectUid: string | null;
}): JSX.Element {
  const openPanel = useSidebar((s) => s.openPanel);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectUid) {
      setTasks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void window.orbit.project
      .getTasks(projectUid)
      .then((next) => {
        if (!cancelled) setTasks(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectUid]);

  const grouped = useMemo(() => {
    const buckets: Record<TaskStatus, TaskRecord[]> = {
      backlog: [],
      waiting: [],
      todo: [],
      doing: [],
      blocked: [],
      done: []
    };

    for (const task of tasks) buckets[task.status].push(task);
    return buckets;
  }, [tasks]);

  if (!projectUid) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 px-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Pick a project to see its task tree.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">Project task tree</div>
        <div className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
          {loading ? 'Refreshing...' : `${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {tasks.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-300 px-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No tasks in this project yet.
          </div>
        ) : (
          <div className="space-y-3">
            {STATUS_ORDER.map((status) => {
              const rows = grouped[status];
              return (
                <section key={status} className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
                  <header className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-neutral-500">
                    <span>{status}</span>
                    <span>{rows.length}</span>
                  </header>
                  {rows.length === 0 ? (
                    <p className="px-1 pb-1 text-xs text-neutral-400">No tasks</p>
                  ) : (
                    <ul className="space-y-1">
                      {rows.map((task) => (
                        <li key={task.id}>
                          <button
                            onClick={() =>
                              openPanel({
                                panel: 'task-detail',
                                focus: {
                                  task,
                                  projectUid
                                }
                              })
                            }
                            className="w-full rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <div className="truncate text-sm text-neutral-800 dark:text-neutral-100">
                              {task.title}
                            </div>
                            <div className="truncate text-[11px] text-neutral-500">
                              {task.relPath}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
