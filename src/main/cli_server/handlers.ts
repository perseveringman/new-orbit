import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { TaskFilter } from '@shared/schemas';
import type { TaskRecord } from '@shared/schemas';
import { normalizeTaskStatus } from '@shared/schemas';
import { currentSession } from '../fs';
import { isInsideRoot, toPosix, vaultRel } from '../pathGuard';
import { ensureExternalReadAccess } from '../external-path-access';
import { materializeTaskGraph } from '../orchestration/task_graph';
import { updateTaskFrontmatter } from '../task';
import { contentHash } from '../content_hash';
import { emitActivity } from '../activity';
import { dependencyTree, detectCycleForUpdate, dependencyRefs } from '../dependencies/graph';
import { taskReadyState } from '../auto_runner/ready_set';
import { getAutoRunnerDispatcher } from '../auto_runner/dispatcher';
import { createApprovalServiceForVault } from '../approval/service';
import { broadcastApprovalSyncEvent } from '../approval/ipc';
import { createInboxServiceForVault } from '../inbox/service';
import { broadcastInboxEvent } from '../inbox/events';
import { createProposalInboxSync } from '../inbox/proposal';
import {
  dismissInboxItemWithProposalSync,
  resolveInboxItemWithProposalSync
} from '../inbox/proposal_sync';
import type {
  InboxDismissInput,
  InboxListFilter,
  InboxMessageInput,
  InboxResolveInput
} from '../inbox/types';
import type { ProposalListFilter, ProposalResolveInput } from '../approval/types';
import { queryActivities } from '../activity/query';
import type { ActivityQueryFilter } from '../activity/types';
import { listProjects } from '../project';
import { listAreas } from '../area';
import { getPool } from '../agent/pool';
import { appendExecutionLog } from '../task';
import { getConversation } from '../orchestration/conversation';
import { switchTaskRuntime } from '../orchestration/switch_runtime';
import { cliServerError } from './errors';
import type { CliHandlerRegistry } from './registry';
import { createAssetStore } from '../assets/store';
import { buildSpaceContext, getSpace, listSpaces } from '../space/context';
import { createResourceStore } from '../resource/store';
import type { SpaceContextOptions } from '@shared/space';

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

function optionalStringParam(params: Record<string, unknown>, key: string): string | undefined {
  return typeof params[key] === 'string' && params[key] ? params[key] : undefined;
}

function objectParams(params: unknown, method: string): Record<string, unknown> {
  if (!isRecord(params))
    throw cliServerError('invalid_params', `${method} params must be an object`);
  return params;
}

async function readTarget(
  target: string
): Promise<{
  path: string;
  relPath: string;
  external: boolean;
  kind: 'file' | 'directory';
  content: string;
  entries?: Array<{ name: string; kind: 'file' | 'directory' | 'symlink' | 'other' }>;
}> {
  const session = openSession();
  const byUid = session.refmap.resolveUid(target);
  const targetIsAbsolute = path.isAbsolute(target);
  const abs = path.resolve(byUid ?? (targetIsAbsolute ? target : path.join(session.vault, target)));
  const insideVault = isInsideRoot(session.vault, abs);
  if (!insideVault) {
    if (!targetIsAbsolute) {
      throw cliServerError('path_outside_vault', `path escapes vault: ${target}`);
    }
    await ensureExternalReadAccess({
      vaultPath: session.vault,
      requestedTarget: target,
      targetPath: abs
    });
  }
  return readResolvedTarget(session.vault, abs, !insideVault);
}

async function readResolvedTarget(
  vaultPath: string,
  abs: string,
  external: boolean
): Promise<{
  path: string;
  relPath: string;
  external: boolean;
  kind: 'file' | 'directory';
  content: string;
  entries?: Array<{ name: string; kind: 'file' | 'directory' | 'symlink' | 'other' }>;
}> {
  const stat = await fs.stat(abs).catch((error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') {
      throw cliServerError('not_found', `path not found: ${abs}`);
    }
    throw cliServerError('path_unreadable', `path is not readable: ${abs}`);
  });
  const relPath = external ? abs : toPosix(vaultRel(vaultPath, abs));
  if (stat.isDirectory()) {
    const { content, entries } = await readDirectoryListing(abs);
    return { path: abs, relPath, external, kind: 'directory', content, entries };
  }
  if (!stat.isFile()) {
    throw cliServerError('invalid_path', `only files and directories can be read: ${abs}`);
  }
  const content = await fs.readFile(abs, 'utf8');
  return { path: abs, relPath, external, kind: 'file', content };
}

async function readDirectoryListing(abs: string): Promise<{
  content: string;
  entries: Array<{ name: string; kind: 'file' | 'directory' | 'symlink' | 'other' }>;
}> {
  const limit = 200;
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const sorted = [...dirents].sort(compareDirents);
  const visible = sorted.slice(0, limit).map((entry) => ({
    name: entry.name,
    kind: direntKind(entry)
  }));
  const lines = visible.map((entry) => `${entry.kind}\t${entry.name}`);
  if (sorted.length > limit) {
    const remaining = sorted.length - limit;
    lines.push(`[orbit_truncated: ${remaining} more entr${remaining === 1 ? 'y' : 'ies'}]`);
  }
  return { content: lines.join('\n'), entries: visible };
}

function compareDirents(a: Dirent, b: Dirent): number {
  const aDir = a.isDirectory();
  const bDir = b.isDirectory();
  if (aDir !== bDir) return aDir ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function direntKind(entry: Dirent): 'file' | 'directory' | 'symlink' | 'other' {
  if (entry.isDirectory()) return 'directory';
  if (entry.isFile()) return 'file';
  if (entry.isSymbolicLink()) return 'symlink';
  return 'other';
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
  if (task.source !== 'file')
    throw cliServerError('invalid_params', 'inline task updates are not supported');
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
    throw cliServerError(
      'invalid_params',
      `cyclic dependency rejected: ${task.uid} cannot depend on itself`
    );
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
        throw cliServerError(
          'invalid_params',
          `cross-project dependencies are not supported: ${depUid}`
        );
      }
    } else if (task.area_uid || dep.area_uid) {
      if (!task.area_uid || task.area_uid !== dep.area_uid) {
        throw cliServerError(
          'invalid_params',
          `cross-area dependencies are not supported: ${depUid}`
        );
      }
    }
  }
  const cycle = detectCycleForUpdate(task.uid, dependsOn, tasks);
  if (cycle) {
    throw cliServerError(
      'invalid_params',
      `cyclic dependency rejected: ${cycle.path.join(' -> ')}`
    );
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
  if (typeof params.resource_uid === 'string') filter.resource_uid = params.resource_uid;
  if (typeof params.tag === 'string') filter.tag = params.tag;
  return filter;
}

function approvalService() {
  const vaultPath = openSession().vault;
  return createApprovalServiceForVault(vaultPath, {
    onSync: broadcastApprovalSyncEvent,
    syncInbox: createProposalInboxSync(vaultPath, { onEvent: broadcastInboxEvent })
  });
}

function inboxService() {
  return createInboxServiceForVault(openSession().vault, { onEvent: broadcastInboxEvent });
}

function proposalSubmitter(params: Record<string, unknown>): 'agent' | 'user' {
  return typeof params.run_id === 'string' && params.run_id ? 'agent' : 'user';
}

function proposalSubject(prefix: string, fallback: string): string {
  return `${prefix}: ${fallback}`;
}

function parseSpaceSections(value: unknown): SpaceContextOptions['sections'] {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(['info', 'tasks', 'materials', 'outputs', 'conversations', 'relations']);
  return value.filter(
    (section): section is NonNullable<SpaceContextOptions['sections']>[number] =>
      typeof section === 'string' && allowed.has(section)
  );
}

async function projectBySlugOrUid(slugOrUid: string) {
  const project = (await listProjects(openSession().vault)).find(
    (item) => item.slug === slugOrUid || item.uid === slugOrUid
  );
  if (!project) throw cliServerError('not_found', `project not found: ${slugOrUid}`);
  return project;
}

async function spaceRootBySlugOrUid(slugOrUid: string): Promise<string> {
  const vault = openSession().vault;
  const project = (await listProjects(vault)).find(
    (item) => item.slug === slugOrUid || item.uid === slugOrUid
  );
  if (project) {
    if (project.legacy) throw cliServerError('invalid_params', 'materials require a folder-backed space');
    return project.path;
  }
  const area = (await listAreas(vault, { includeArchived: true })).find(
    (item) => item.slug === slugOrUid || item.uid === slugOrUid
  );
  if (area) return area.path;
  const resource = await createResourceStore(vault).get(slugOrUid);
  if (resource) return path.dirname(path.join(vault, resource.path));
  throw cliServerError('not_found', `space not found: ${slugOrUid}`);
}

async function readProjectReadmeExcerpt(readmePath: string): Promise<string> {
  const raw = await fs.readFile(readmePath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 24)
    .join('\n');
}

async function listProjectKeyDocs(projectPath: string): Promise<string[]> {
  const entries = await fs.readdir(projectPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => toPosix(vaultRel(openSession().vault, path.join(projectPath, entry.name))))
    .slice(0, 20);
}

function activitySummary(events: Awaited<ReturnType<typeof queryActivities>>): {
  total: number;
  byAction: Record<string, number>;
  byActor: Record<string, number>;
} {
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  for (const event of events) {
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
    byActor[event.actor] = (byActor[event.actor] ?? 0) + 1;
  }
  return { total: events.length, byAction, byActor };
}

export function registerCoreCliHandlers(registry: CliHandlerRegistry): void {
  registry.register('search', async (params) => {
    const session = openSession();
    const query = stringParam(params, 'query');
    const limit = isRecord(params) ? optionalNumber(params.limit, 30) : 30;
    const project = isRecord(params) ? optionalStringParam(params, 'project') : undefined;
    const hits = session.search.search(query, limit);
    if (!project) return hits;
    const projectRecord = (await listProjects(session.vault)).find(
      (entity) => entity.uid === project || entity.slug === project
    );
    return hits.filter((hit) =>
      projectRecord?.relPath ? hit.relPath.startsWith(path.dirname(projectRecord.relPath)) : true
    );
  });

  registry.register('cat', async (params) => readTarget(stringParam(params, 'target')));

  registry.register('task.list', async (params) => {
    const session = openSession();
    const filter = taskFilter(params);
    const projectFilter = filter.project_uid
      ? (await listProjects(session.vault)).find(
          (entity) => entity.uid === filter.project_uid || entity.slug === filter.project_uid
        )?.uid ?? filter.project_uid
      : undefined;
    let tasks = materializeTaskGraph(session.tasks.allTasks());
    if (filter.status) tasks = tasks.filter((task) => task.status === filter.status);
    if (projectFilter) tasks = tasks.filter((task) => task.project_uid === projectFilter);
    if (filter.area_uid) tasks = tasks.filter((task) => task.area_uid === filter.area_uid);
    if (filter.resource_uid) tasks = tasks.filter((task) => task.resource_uid === filter.resource_uid);
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

  registry.register('task.related', async (params) => {
    const uid = stringParam(params, 'uid');
    const task = resolveTask(uid);
    const tasks = materializeTaskGraph(openSession().tasks.allTasks());
    const keywords = new Set(
      task.title
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
        .filter((word) => word.length >= 3)
    );
    const relatedTasks = tasks
      .filter((candidate) => candidate.id !== task.id)
      .map((candidate) => {
        let score = 0;
        if (task.project_uid && candidate.project_uid === task.project_uid) score += 2;
        if (task.area_uid && candidate.area_uid === task.area_uid) score += 1;
        if (task.uid && (candidate.depends_on ?? []).includes(task.uid)) score += 4;
        if (candidate.uid && (task.depends_on ?? []).includes(candidate.uid)) score += 4;
        for (const word of keywords) {
          if (candidate.title.toLowerCase().includes(word)) score += 1;
        }
        return { task: candidate, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    return { task, relatedTasks };
  });

  registry.register('task.transcript', async (params) => {
    const uid = stringParam(params, 'uid');
    const task = resolveTask(uid);
    if (!task.uid) throw cliServerError('invalid_params', 'task has no uid');
    const conversation = await getConversation(openSession().vault, task.uid);
    return {
      task,
      segments: conversation?.segments ?? [],
      turns: conversation?.turns ?? []
    };
  });

  registry.register('task.switchRuntime', async (params) => {
    const input = objectParams(params, 'task.switchRuntime');
    return switchTaskRuntime(stringParam(input, 'uid'), stringParam(input, 'runtime_id'));
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

  registry.register('task.propose', async (params) => {
    const input = objectParams(params, 'task.propose');
    const title = stringParam(input, 'title');
    const projectUid = optionalStringParam(input, 'project_uid');
    const areaUid = optionalStringParam(input, 'area_uid');
    if (!projectUid && !areaUid) {
      throw cliServerError('invalid_params', 'task.propose requires project_uid or area_uid');
    }
    if (projectUid && areaUid) {
      throw cliServerError('invalid_params', 'task.propose accepts only one owner');
    }
    const payload: Record<string, unknown> = {
      title,
      ...(projectUid ? { project_uid: projectUid } : {}),
      ...(areaUid ? { area_uid: areaUid } : {}),
      ...(typeof input.description === 'string' ? { description: input.description } : {}),
      ...(typeof input.conversation_id === 'string'
        ? { conversation_id: input.conversation_id }
        : {}),
      ...(isRecord(input.frontmatter) ? { frontmatter: input.frontmatter } : {})
    };
    return approvalService().submit({
      type: 'new_task',
      submitted_by: proposalSubmitter(input),
      ...(typeof input.run_id === 'string' ? { submitted_by_agent_run: input.run_id } : {}),
      ...(typeof input.during_task_uid === 'string'
        ? { submitted_during_task: input.during_task_uid }
        : {}),
      subject: proposalSubject('New task', title),
      payload
    });
  });

  registry.register('task.proposeScope', async (params) => {
    const input = objectParams(params, 'task.proposeScope');
    const currentUid = stringParam(input, 'current_uid');
    const summary =
      typeof input.summary === 'string' && input.summary.trim()
        ? input.summary
        : `Scope expansion requested for ${currentUid}`;
    return approvalService().submit({
      type: 'scope_expansion',
      submitted_by: proposalSubmitter(input),
      ...(typeof input.run_id === 'string' ? { submitted_by_agent_run: input.run_id } : {}),
      submitted_during_task: currentUid,
      subject: proposalSubject('Scope expansion', currentUid),
      payload: {
        current_task_uid: currentUid,
        summary,
        ...(typeof input.conversation_id === 'string'
          ? { conversation_id: input.conversation_id }
          : {})
      }
    });
  });

  registry.register('task.proposeSplit', async (params) => {
    const input = objectParams(params, 'task.proposeSplit');
    const currentUid = stringParam(input, 'current_uid');
    const summary =
      typeof input.summary === 'string' && input.summary.trim()
        ? input.summary
        : `Split requested for ${currentUid}`;
    return approvalService().submit({
      type: 'task_split',
      submitted_by: proposalSubmitter(input),
      ...(typeof input.run_id === 'string' ? { submitted_by_agent_run: input.run_id } : {}),
      submitted_during_task: currentUid,
      subject: proposalSubject('Task split', currentUid),
      payload: {
        current_task_uid: currentUid,
        summary,
        ...(typeof input.conversation_id === 'string'
          ? { conversation_id: input.conversation_id }
          : {})
      }
    });
  });

  registry.register('project.list', async () => listProjects(openSession().vault));

  registry.register('project.get', async (params) => {
    const uid = stringParam(params, 'uid');
    const project = (await listProjects(openSession().vault)).find((item) => item.uid === uid);
    if (!project) throw cliServerError('not_found', `project not found: ${uid}`);
    return project;
  });

  registry.register('project.overview', async (params) => {
    const slug = stringParam(params, 'slug');
    const project = await projectBySlugOrUid(slug);
    const tasks = materializeTaskGraph(openSession().tasks.allTasks()).filter(
      (task) => task.project_uid === project.uid
    );
    const byStatus = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      project,
      readme_excerpt: await readProjectReadmeExcerpt(project.readmePath),
      task_counts: byStatus,
      key_docs: project.legacy ? [project.relPath] : await listProjectKeyDocs(project.path)
    };
  });

  registry.register('project.graph', async (params) => {
    const input = params === undefined ? {} : objectParams(params, 'project.graph');
    const uid = optionalStringParam(input, 'uid');
    const projects = await listProjects(openSession().vault);
    const filteredProjects = uid ? projects.filter((project) => project.uid === uid) : projects;
    const projectUids = new Set(filteredProjects.map((project) => project.uid));
    const tasks = materializeTaskGraph(openSession().tasks.allTasks()).filter(
      (task) => !uid || (task.project_uid && projectUids.has(task.project_uid))
    );
    return { projects: filteredProjects, tasks };
  });

  registry.register('project.archive', async (params) => {
    const uid = stringParam(params, 'uid');
    const project = (await listProjects(openSession().vault)).find((item) => item.uid === uid);
    if (!project) throw cliServerError('not_found', `project not found: ${uid}`);
    return approvalService().submit({
      type: 'archive_project',
      submitted_by: 'agent',
      subject: proposalSubject('Archive project', project.name),
      payload: { project_uid: uid, slug: project.slug, name: project.name }
    });
  });

  registry.register('space.context', async (params) => {
    const input = objectParams(params, 'space.context');
    const id = stringParam(input, 'id');
    return buildSpaceContext(openSession().vault, id, {
      summary: input.summary === true,
      sections: parseSpaceSections(input.sections)
    });
  });

  registry.register('space.list', async (params) => {
    const input = isRecord(params) ? params : {};
    const type = typeof input.type === 'string' ? input.type : undefined;
    if (type && type !== 'project' && type !== 'area' && type !== 'resource') {
      throw cliServerError('invalid_params', `invalid space type: ${type}`);
    }
    return listSpaces(openSession().vault, type ? { type: type as 'project' | 'area' | 'resource' } : {});
  });

  registry.register('space.get', async (params) => {
    const input = objectParams(params, 'space.get');
    return getSpace(openSession().vault, stringParam(input, 'id'));
  });

  registry.register('resource.list', async (params) => {
    const input = isRecord(params) ? params : {};
    return createResourceStore(openSession().vault).list({
      include_archived: input.include_archived === true
    });
  });

  registry.register('resource.get', async (params) => {
    const input = objectParams(params, 'resource.get');
    return createResourceStore(openSession().vault).get(stringParam(input, 'id'));
  });

  registry.register('resource.create', async (params) => {
    const input = objectParams(params, 'resource.create');
    return createResourceStore(openSession().vault).create({
      title: stringParam(input, 'title'),
      slug: optionalStringParam(input, 'slug'),
      tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      body: optionalStringParam(input, 'body')
    });
  });

  registry.register('resource.archive', async (params) => {
    const input = objectParams(params, 'resource.archive');
    return createResourceStore(openSession().vault).archive(stringParam(input, 'id'));
  });

  registry.register('assets.manifest.get', async (params) => {
    const project = stringParam(params, 'project');
    return createAssetStore(await spaceRootBySlugOrUid(project)).manifest();
  });

  registry.register('assets.scope.add', async (params) => {
    const input = objectParams(params, 'assets.scope.add');
    const project = stringParam(input, 'project');
    const source = stringParam(input, 'source');
    const kind = stringParam(input, 'kind');
    if (kind !== 'folder' && kind !== 'glob' && kind !== 'file' && kind !== 'url') {
      throw cliServerError('invalid_params', `invalid asset scope kind: ${kind}`);
    }
    return createAssetStore(await spaceRootBySlugOrUid(project)).addScope({
      source,
      kind,
      title: optionalStringParam(input, 'title'),
      tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      note: optionalStringParam(input, 'note'),
      authorized_via: 'cli-manual'
    });
  });

  registry.register('assets.scope.scan', async (params) => {
    const input = objectParams(params, 'assets.scope.scan');
    return createAssetStore(await spaceRootBySlugOrUid(stringParam(input, 'project'))).scan(
      stringParam(input, 'scope_id'),
      {
        filter: optionalStringParam(input, 'filter'),
        limit: typeof input.limit === 'number' ? input.limit : undefined
      }
    );
  });

  registry.register('assets.scope.stat', async (params) => {
    const input = objectParams(params, 'assets.scope.stat');
    return createAssetStore(await spaceRootBySlugOrUid(stringParam(input, 'project'))).stat(
      stringParam(input, 'scope_id')
    );
  });

  registry.register('assets.read', async (params) => {
    const input = objectParams(params, 'assets.read');
    return createAssetStore(await spaceRootBySlugOrUid(stringParam(input, 'project'))).readAuthorizedFile(
      stringParam(input, 'path')
    );
  });

  registry.register('assets.pin.add', async (params) => {
    const input = objectParams(params, 'assets.pin.add');
    return createAssetStore(await spaceRootBySlugOrUid(stringParam(input, 'project'))).addPin({
      source: stringParam(input, 'source'),
      title: optionalStringParam(input, 'title'),
      parent_scope: optionalStringParam(input, 'parent_scope'),
      tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      note: optionalStringParam(input, 'note'),
      pinned_by: 'user'
    });
  });

  registry.register('assets.pin.remove', async (params) => {
    const input = objectParams(params, 'assets.pin.remove');
    return createAssetStore(await spaceRootBySlugOrUid(stringParam(input, 'project'))).removePin(
      stringParam(input, 'pin_id')
    );
  });

  registry.register('inbox.list', (params) =>
    inboxService().list((isRecord(params) ? params : {}) as InboxListFilter)
  );
  registry.register('inbox.get', async (params) => {
    const id = stringParam(params, 'id');
    const item = await inboxService().get(id);
    if (!item) throw cliServerError('not_found', `inbox item not found: ${id}`);
    return item;
  });
  registry.register('inbox.resolve', (params) => {
    const input = objectParams(params, 'inbox.resolve');
    return resolveInboxItemWithProposalSync(
      openSession().vault,
      stringParam(input, 'id'),
      (isRecord(input.input) ? input.input : {}) as InboxResolveInput,
      {
        inbox: { onEvent: broadcastInboxEvent },
        approval: { onSync: broadcastApprovalSyncEvent }
      }
    );
  });
  registry.register('inbox.dismiss', (params) => {
    const input = objectParams(params, 'inbox.dismiss');
    return dismissInboxItemWithProposalSync(
      openSession().vault,
      stringParam(input, 'id'),
      (isRecord(input.input) ? input.input : {}) as InboxDismissInput,
      {
        inbox: { onEvent: broadcastInboxEvent },
        approval: { onSync: broadcastApprovalSyncEvent }
      }
    );
  });
  registry.register('inbox.archive', (params) => inboxService().archive(stringParam(params, 'id')));
  registry.register('inbox.emitMessage', (params) =>
    inboxService().emitMessage(params as InboxMessageInput)
  );

  registry.register('activity.list', (params) =>
    queryActivities(openSession().vault, (isRecord(params) ? params : {}) as ActivityQueryFilter)
  );
  registry.register('activity.summary', async (params) =>
    activitySummary(
      await queryActivities(
        openSession().vault,
        (isRecord(params) ? params : {}) as ActivityQueryFilter
      )
    )
  );

  registry.register('approval.list', (params) =>
    approvalService().list((isRecord(params) ? params : {}) as ProposalListFilter)
  );
  registry.register('approval.get', async (params) => {
    const id = stringParam(params, 'id');
    const proposal = await approvalService().get(id);
    if (!proposal) throw cliServerError('not_found', `proposal not found: ${id}`);
    return proposal;
  });
  registry.register('approval.resolve', (params) => {
    const input = objectParams(params, 'approval.resolve');
    return approvalService().resolve(
      stringParam(input, 'id'),
      objectParams(input.input, 'approval.resolve.input') as ProposalResolveInput
    );
  });

  registry.register('agent.listRuns', () => getPool().list());
  registry.register('agent.stop', async (params) => {
    const runId = stringParam(params, 'run_id');
    await getPool().kill(runId, 'cli_stop');
    return { stopped: true, run_id: runId };
  });

  registry.register('run.requestMerge', (params) => {
    const input = objectParams(params, 'run.requestMerge');
    const runId = optionalStringParam(input, 'run_id');
    const taskUid = optionalStringParam(input, 'task_uid');
    const summary = typeof input.summary === 'string' ? input.summary : '';
    return approvalService().submit({
      type: 'merge',
      submitted_by: runId ? 'agent' : 'user',
      ...(runId ? { submitted_by_agent_run: runId } : {}),
      ...(taskUid ? { submitted_during_task: taskUid } : {}),
      subject: proposalSubject('Merge request', taskUid ?? runId ?? 'agent run'),
      payload: {
        ...(runId ? { run_id: runId } : {}),
        ...(taskUid ? { task_uid: taskUid } : {}),
        summary
      }
    });
  });

  registry.register('run.reportProgress', async (params) => {
    const input = objectParams(params, 'run.reportProgress');
    const taskUid = stringParam(input, 'task_uid');
    const message = stringParam(input, 'message');
    const task = resolveTask(taskUid);
    await appendExecutionLog(task.filePath, message, undefined, (next) =>
      refreshTask(task.filePath, next)
    );
    return { task_uid: task.uid ?? taskUid, appended: true };
  });

  registry.register('run.emitInsight', (params) => {
    const input = objectParams(params, 'run.emitInsight');
    const content = stringParam(input, 'content');
    const context: Record<string, string> = {};
    const runId = optionalStringParam(input, 'run_id');
    const taskUid = optionalStringParam(input, 'task_uid');
    const projectUid = optionalStringParam(input, 'project_uid');
    if (runId) context.run_id = runId;
    if (taskUid) context.task_uid = taskUid;
    if (projectUid) context.project_uid = projectUid;
    return inboxService().emitMessage({
      subtype: 'C3',
      title: 'Agent insight',
      summary: content,
      context,
      payload: { content },
      actor: 'agent'
    });
  });

  registry.register('autoRunner.status', () => getAutoRunnerDispatcher().status());
  registry.register('autoRunner.start', () => getAutoRunnerDispatcher().start());
  registry.register('autoRunner.stop', () => getAutoRunnerDispatcher().stop());
}
