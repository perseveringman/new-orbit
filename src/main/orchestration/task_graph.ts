import type { TaskRecord, TaskStatus } from '@shared/schemas';

export interface TaskGraphSnapshot {
  tasks: TaskRecord[];
  byUid: Map<string, TaskRecord>;
}

function terminalStatus(status: TaskStatus): boolean {
  return status === 'done';
}

export function buildTaskGraph(tasks: TaskRecord[]): TaskGraphSnapshot {
  const byUid = new Map<string, TaskRecord>();
  for (const task of tasks) {
    if (task.uid) byUid.set(task.uid, task);
  }
  return { tasks, byUid };
}

export function arePreConditionsMet(task: Pick<TaskRecord, 'pre_conditions'>, byUid: Map<string, TaskRecord>): boolean {
  const preConditions = task.pre_conditions ?? [];
  if (preConditions.length === 0) return true;
  return preConditions.every((uid) => {
    const candidate = byUid.get(uid);
    return candidate ? terminalStatus(candidate.status) : false;
  });
}

export function deriveReadyStatus(task: TaskRecord, byUid: Map<string, TaskRecord>): TaskStatus {
  if (task.status === 'done' || task.status === 'doing' || task.status === 'blocked') return task.status;
  if (task.status === 'backlog') return 'backlog';
  return arePreConditionsMet(task, byUid) ? 'todo' : 'waiting';
}

export function materializeTaskGraph(tasks: TaskRecord[]): TaskRecord[] {
  const { byUid } = buildTaskGraph(tasks);
  return tasks.map((task) => {
    if (task.source !== 'file') return task;
    const nextStatus = deriveReadyStatus(task, byUid);
    return {
      ...task,
      status: nextStatus,
      ready: nextStatus === 'todo'
    };
  });
}
