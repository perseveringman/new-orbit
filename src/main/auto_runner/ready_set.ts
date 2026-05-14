import type { TaskRecord } from '@shared/schemas';
import { isAgentClaimableTask } from '@shared/schemas';
import { unmetDependencies } from '../dependencies/graph';

export type ReadyReason =
  | 'ready'
  | 'not_agent_claimable'
  | 'status_not_todo'
  | 'awaiting_approval'
  | 'dependency_missing'
  | 'dependency_not_done';

export interface ReadyResult {
  ready: boolean;
  reason: ReadyReason;
  detail?: string;
  unmetDeps: string[];
}

export interface ReadyTask {
  task: TaskRecord;
  readiness: ReadyResult;
}

export interface ReadySet {
  ready: ReadyTask[];
  blocked: ReadyTask[];
}

export interface ReadySetOptions {
  requireAgentClaimable?: boolean;
}

function requiresUserApproval(task: TaskRecord): boolean {
  return typeof task.created_by === 'string' && task.created_by.startsWith('agent_run:');
}

export function taskReadyState(
  task: TaskRecord,
  taskIndex: Map<string, TaskRecord>,
  options: ReadySetOptions = {}
): ReadyResult {
  if (options.requireAgentClaimable && !isAgentClaimableTask(task)) {
    return {
      ready: false,
      reason: 'not_agent_claimable',
      detail: 'task is not marked for agent claim',
      unmetDeps: []
    };
  }

  if (task.status !== 'todo') {
    return {
      ready: false,
      reason: 'status_not_todo',
      detail: `status is ${task.status}`,
      unmetDeps: []
    };
  }

  if (requiresUserApproval(task) && task.approved_by == null) {
    return {
      ready: false,
      reason: 'awaiting_approval',
      detail: 'agent-created task has not been approved',
      unmetDeps: []
    };
  }

  const unmet = unmetDependencies(task, taskIndex);
  if (unmet.length > 0) {
    const missing = unmet.find((dep) => dep.reason === 'missing');
    if (missing) {
      return {
        ready: false,
        reason: 'dependency_missing',
        detail: `dependency missing: ${missing.uid}`,
        unmetDeps: unmet.map((dep) => dep.uid)
      };
    }
    return {
      ready: false,
      reason: 'dependency_not_done',
      detail: `dependency not done: ${unmet[0]?.uid ?? 'unknown'}`,
      unmetDeps: unmet.map((dep) => dep.uid)
    };
  }

  return { ready: true, reason: 'ready', unmetDeps: [] };
}

export function buildReadySet(
  tasks: readonly TaskRecord[],
  options: ReadySetOptions = {}
): ReadySet {
  const taskIndex = new Map<string, TaskRecord>();
  for (const task of tasks) {
    if (task.uid) taskIndex.set(task.uid, task);
  }

  const ready: ReadyTask[] = [];
  const blocked: ReadyTask[] = [];
  for (const task of tasks) {
    const readiness = taskReadyState(task, taskIndex, options);
    const entry = { task, readiness };
    if (readiness.ready) ready.push(entry);
    else blocked.push(entry);
  }
  return { ready, blocked };
}

export function buildClaimableReadySet(tasks: readonly TaskRecord[]): ReadySet {
  return buildReadySet(tasks, { requireAgentClaimable: true });
}
