import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TaskFilter } from '@shared/schemas';
import type { TaskRecord } from '@shared/schemas';
import { normalizeTaskStatus } from '@shared/schemas';
import { currentSession } from '../fs';
import { assertInsideVault, toPosix, vaultRel } from '../pathGuard';
import { materializeTaskGraph } from '../orchestration/task_graph';
import { updateTaskFrontmatter } from '../task';
import { contentHash } from '../content_hash';
import { emitActivity } from '../activity';
import {
  dependencyTree,
  detectCycleForUpdate,
  dependencyRefs
} from '../dependencies/graph';
import { taskReadyState } from '../auto_runner/ready_set';
import { cliServerError } from './errors';
import type { CliHandlerRegistry } from './registry';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function openSession() {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  return session;
}

function optionalNumber(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw cliServerError('invalid_params', 'limit must be a positive integer');
  }
  return value;
}

function stringParam(params: unknown, key: string): string {
  if (!isRecord(params) || typeof params[key] !== 'string' || !params[key]) {
    throw cliServerError('invalid_params', `${key} is required`);
  }
  return params[key];
}

async function readTarget(
  target: string
): Promise<{ path: string; relPath: string; content: string }> {
  const session = openSession();
  const byUid = session.refmap.resolveUid(target);
  const abs = byUid ?? (path.isAbsolute(target) ? target : path.join(session.vault, target));
  assertInsideVault(session.vault, abs);
  const content = await fs.readFile(abs, 'utf8');
  return { path: abs, relPath: toPosix(vaultRel(session.vault, abs)), content };
}

function resolveTask(target: string): TaskRecord {
  const session = openSession();
  const abs = session.refmap.resolveUid(target) ?? (path.isAbsolute(target) ? target : null);
  const rel = abs ? toPosix(vaultRel(session.vault, abs)) : toPosix(target);
  const tasks = session.tasks.allTasks();
  const task =
    tasks.find((candidate) => candidate.uid === target) ??
    tasks.find((candidate) => candidate.relPath === rel || candidate.filePath === abs);
  if (!task) throw cliServerError('not_found', `task not found: ${target}`);
  if (task.source !== 'file') throw cliServerError('invalid_params', 'inline task updates are not supported');
  return task;
}

function taskIndex(): Map<string, TaskRecord> {
  const byUid = new Map<string, TaskRecord>();
  for (const task of openSession().tasks.allTasks()) {
    if (task.uid) byUid.set(task.uid, task);
  }
  return byUid;
}

function parseDependsOnParam(params: Record<string, unknown>): string[] | undefined {
  const value = params['depends_on'];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw cliServerError('invalid_params', 'depends_on must be an array of task uid strings');
  }
  return value as string[];
}

async function refreshTask(absPath: string, content: string): Promise<void> {
  const session = openSession();
  const rel = toPosix(vaultRel(session.vault, absPath));
  session.index.upsert(rel, content);
  session.search.upsert(rel);
  session.tasks.upsert(rel, content);
  const uid = session.refmap.uidOfAbs(absPath);
  if (uid) {
    session.refmap.setContentHash(uid, contentHash(content));
    await session.refmap.flush();
  }
}

function assertDependencyUpdateAllowed(task: TaskRecord, dependsOn: string[]): void {
  if (!task.uid) throw cliServerError('invalid_params', 'task has no uid');
  if (dependsOn.includes(task.uid)) {
    throw cliServerError('invalid_params', `cyclic dependency rejected: ${task.uid} cannot depend on itself`);
  }
  const tasks = openSession().tasks.allTasks();
  const byUid = new Map<string, TaskRecord>();
  for (const candidate of tasks) {
    if (candidate.uid) byUid.set(candidate.uid, candidate);
  }
  for (const depUid of dependsOn) {
    const dep = byUid.get(depUid);
    if (!dep) throw cliServerError('invalid_params', `dependency not found: ${depUid}`);
    if (task.project_uid || dep.project_uid) {
      if (!task.project_uid || task.project_uid !== dep.project_uid) {
        throw cliServerError('invalid_params', `cross-project dependencies are not supported: ${depUid}`);
      }
    } else if (task.area_uid || dep.area_uid) {
      if (!task.area_uid || task.area_uid !== dep.area_uid) {
        throw cliServerError('invalid_params', `cross-area dependencies are not supported: ${depUid}`);
      }
    }
  }
  const cycle = detectCycleForUpdate(task.uid, dependsOn, tasks);
  if (cycle) {
    throw cliServerError('invalid_params', `cyclic dependency rejected: ${cycle.path.join(' -> ')}`);
  }
}

function taskFilter(params: unknown): TaskFilter {
  if (params === undefined) return {};
  if (!isRecord(params))
    throw cliServerError('invalid_params', 'task.list params must be an object');
  const filter: TaskFilter = {};
  if (typeof params.status === 'string') {
    const status = normalizeTaskStatus(params.status);
    if (!status) throw cliServerError('invalid_params', `Unknown task status: ${params.status}`);
    filter.status = status;
  }
  if (typeof params.project_uid === 'string') filter.project_uid = params.project_uid;
  if (typeof params.area_uid === 'string') filter.area_uid = params.area_uid;
  if (typeof params.tag === 'string') filter.tag = params.tag;
  return filter;
}

export function registerCoreCliHandlers(registry: CliHandlerRegistry): void {
  registry.register('search', (params) => {
    const session = openSession();
    const query = stringParam(params, 'query');
    const limit = isRecord(params) ? optionalNumber(params.limit, 30) : 30;
    return session.search.search(query, limit);
  });

  registry.register('cat', async (params) => readTarget(stringParam(params, 'target')));

  registry.register('task.list', (params) => {
    const session = openSession();
    const filter = taskFilter(params);
    let tasks = materializeTaskGraph(session.tasks.allTasks());
    if (filter.status) tasks = tasks.filter((task) => task.status === filter.status);
    if (filter.project_uid) tasks = tasks.filter((task) => task.project_uid === filter.project_uid);
    if (filter.area_uid) tasks = tasks.filter((task) => task.area_uid === filter.area_uid);
    if (filter.tag) tasks = tasks.filter((task) => (task.tags ?? []).includes(filter.tag ?? ''));
    return tasks;
  });

  registry.register('task.get', (params) => {
    const uid = stringParam(params, 'uid');
    const task = resolveTask(uid);
    const index = taskIndex();
    return {
      task,
      readiness: taskReadyState(task, index),
      dependencies: dependencyRefs(task, index)
    };
  });

  registry.register('task.deps', (params) => {
    const uid = stringParam(params, 'uid');
    const task = resolveTask(uid);
    if (!task.uid) throw cliServerError('invalid_params', 'task has no uid');
    return dependencyTree(task.uid, taskIndex());
  });

  registry.register('task.update', async (params) => {
    if (!isRecord(params)) {
      throw cliServerError('invalid_params', 'task.update params must be an object');
    }
    const uid = stringParam(params, 'uid');
    const task = resolveTask(uid);
    const patch: Record<string, unknown> = {};
    if (typeof params.status === 'string') {
      const status = normalizeTaskStatus(params.status);
      if (!status) throw cliServerError('invalid_params', `Unknown task status: ${params.status}`);
      patch['status'] = status;
    }
    const dependsOn = parseDependsOnParam(params);
    if (dependsOn) {
      assertDependencyUpdateAllowed(task, dependsOn);
      patch['depends_on'] = dependsOn;
    }
    if (Object.keys(patch).length === 0) {
      throw cliServerError('invalid_params', 'no task update fields provided');
    }
    await updateTaskFrontmatter(task.filePath, patch, (next) => refreshTask(task.filePath, next));
    if (dependsOn && JSON.stringify(task.depends_on ?? []) !== JSON.stringify(dependsOn)) {
      emitActivity({
        actor: 'agent',
        action: 'task.dependency_changed',
        context: { task_uid: task.uid ?? uid },
        payload: { before: task.depends_on ?? [], after: dependsOn },
        summary: `Task dependencies updated: ${task.uid ?? uid}`
      });
    }
    return resolveTask(uid);
  });
}
