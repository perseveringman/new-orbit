import type { TaskRecord, TaskStatus } from './schemas';

export type KanbanColumns = Record<TaskStatus, TaskRecord[]>;

export const EMPTY_COLUMNS = (): KanbanColumns => ({
  inbox: [],
  today: [],
  doing: [],
  blocked: [],
  done: []
});

/**
 * Group tasks into their status columns. Order within each column follows the
 * input order (callers sort upstream as desired).
 */
export function groupByStatus(tasks: TaskRecord[]): KanbanColumns {
  const cols = EMPTY_COLUMNS();
  for (const t of tasks) cols[t.status].push(t);
  return cols;
}

/**
 * Pure reducer for drag-and-drop moves. Given the task list, an `id` of the
 * dragged task and a `target` column, return `{ next, moved }` where `next`
 * is a new task list with the status updated and `moved` is the updated task
 * (or `null` when the target doesn't exist / id not found / same column).
 */
export function moveTask(
  tasks: TaskRecord[],
  id: string,
  target: TaskStatus
): { next: TaskRecord[]; moved: TaskRecord | null } {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return { next: tasks, moved: null };
  const current = tasks[idx];
  if (!current || current.status === target) return { next: tasks, moved: null };
  const updated: TaskRecord = { ...current, status: target };
  const next = tasks.slice();
  next[idx] = updated;
  return { next, moved: updated };
}
