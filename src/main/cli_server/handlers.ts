import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TaskFilter } from '@shared/schemas';
import { normalizeTaskStatus } from '@shared/schemas';
import { currentSession } from '../fs';
import { assertInsideVault, toPosix, vaultRel } from '../pathGuard';
import { materializeTaskGraph } from '../orchestration/task_graph';
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
}
