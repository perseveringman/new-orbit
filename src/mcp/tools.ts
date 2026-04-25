/**
 * Orbit MCP tools — the seven hooks Claude Code uses to read/write the
 * vault from inside a project.
 *
 * Every tool is locked to the project addressed by the env-supplied
 * `projectUid` / `projectSlug`. Cross-project mutations fail-closed with a
 * `not in project scope` error; only `search_global_context` is allowed
 * to read across the whole vault (that is the explicit Distillery
 * design from the Gemini blueprint).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { nanoid } from 'nanoid';
import * as frontmatter from '../main/frontmatter';
import {
  appendToSection,
  parseTaskSections,
  serializeTaskSections,
  type TaskSectionKey
} from '../main/task_sections';
import { readVision } from '../main/vision';
import { VectorStore } from '../main/vector';
import { getEmbedder } from '../main/vector/embed';
import {
  PROJECTS_DIR,
  PROJECT_ORBIT_AGENT_DIR,
  PROJECT_ORBIT_DIR,
  PROJECT_ORBIT_TASKS_DIR
} from '@shared/constants';
import type { ToolCallResult, ToolDefinition } from './protocol';
import { readAllOperationLogEntries, writeOpLog } from './oplog';
import { parsePorcelainStatus } from '../main/git/status';

export interface ToolContext {
  vault: string;
  projectUid: string;
  projectSlug: string;
  /** Override `Date.now()` for deterministic tests. */
  now?: () => Date;
  /** Override the git invoker for tests. */
  git?: (
    args: string[],
    cwd: string
  ) => Promise<{ stdout: string; stderr: string; code: number }>;
}

const VALID_TASK_STATUSES = new Set([
  'backlog',
  'waiting',
  'todo',
  'doing',
  'blocked',
  'done'
]);

// --- helpers ---------------------------------------------------------------

function projectDir(ctx: ToolContext): string {
  return path.join(ctx.vault, PROJECTS_DIR, ctx.projectSlug);
}

function projectTasksDir(ctx: ToolContext): string {
  return path.join(
    projectDir(ctx),
    PROJECT_ORBIT_DIR,
    PROJECT_ORBIT_AGENT_DIR,
    PROJECT_ORBIT_TASKS_DIR
  );
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function nowIso(ctx: ToolContext): string {
  return (ctx.now?.() ?? new Date()).toISOString();
}

function datePrefix(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'task';
}

function textResult(text: string): ToolCallResult {
  return { content: [{ type: 'text', text }] };
}

function jsonResult(payload: unknown): ToolCallResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function errorResult(message: string): ToolCallResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Walk the project's `.orbit/agent/tasks/` directory and return the absolute
 * path of the task whose frontmatter `uid` equals `taskUid`.
 *
 * Strict project scoping: only tasks under the **current** project are
 * resolved. Returns `null` when not found inside this project's tree —
 * the caller surfaces that as an error so the MCP layer never silently
 * mutates a sibling project.
 */
export async function resolveTaskPath(
  ctx: ToolContext,
  taskUid: string
): Promise<string | null> {
  const dir = projectTasksDir(ctx);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.md')) continue;
    const abs = path.join(dir, name);
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data } = frontmatter.read(raw);
      if (typeof data['uid'] === 'string' && data['uid'] === taskUid) {
        return abs;
      }
    } catch {
      // unreadable — skip
    }
  }
  return null;
}

export function buildTaskMarkdown(args: {
  uid: string;
  title: string;
  projectUid: string;
  description?: string;
  priority?: string;
  tags?: string[];
  createdAt: string;
}): string {
  const fmObj: Record<string, unknown> = {
    uid: args.uid,
    type: 'task',
    title: args.title,
    status: 'backlog',
    project_uid: args.projectUid,
    created_at: args.createdAt
  };
  if (args.priority) fmObj['priority'] = args.priority;
  if (args.tags && args.tags.length > 0) fmObj['tags'] = args.tags;

  const desc = args.description?.trim() ?? '';
  const body =
    '# Description\n' +
    (desc ? `${desc}\n` : '') +
    '\n' +
    '# Agent Thinking\n\n' +
    '# Execution Log\n\n' +
    '# Summary\n';
  return frontmatter.write(fmObj, body);
}

// --- git ------------------------------------------------------------------

function defaultGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
    child.on('error', (e) =>
      resolve({ stdout, stderr: stderr + e.message, code: -1 })
    );
    child.on('close', (code) =>
      resolve({ stdout, stderr, code: code ?? -1 })
    );
  });
}

// --- tool implementations -------------------------------------------------

export async function createTaskTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const title = typeof args['title'] === 'string' ? args['title'].trim() : '';
  if (!title) return errorResult('create_task: "title" is required');
  const description =
    typeof args['description'] === 'string'
      ? (args['description'] as string)
      : undefined;
  const priority =
    typeof args['priority'] === 'string' ? (args['priority'] as string) : undefined;
  const tagsRaw = args['tags'];
  let tags: string[] | undefined;
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.filter((t): t is string => typeof t === 'string');
  }

  const dir = projectTasksDir(ctx);
  await fs.mkdir(dir, { recursive: true });

  const now = ctx.now?.() ?? new Date();
  const prefix = datePrefix(now);
  const base = slugifyTitle(title);
  let candidate = `${prefix}_${base}.md`;
  let abs = path.join(dir, candidate);
  let counter = 1;
  while (await exists(abs)) {
    counter += 1;
    candidate = `${prefix}_${base}-${counter}.md`;
    abs = path.join(dir, candidate);
  }

  const uid = nanoid(12);
  const md = buildTaskMarkdown({
    uid,
    title,
    projectUid: ctx.projectUid,
    createdAt: now.toISOString(),
    ...(description !== undefined ? { description } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(tags !== undefined ? { tags } : {})
  });
  await fs.writeFile(abs, md, 'utf8');
  return jsonResult({ uid, path: abs });
}

export async function updateTaskStatusTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const taskUid = typeof args['task_uid'] === 'string' ? args['task_uid'] : '';
  const status = typeof args['status'] === 'string' ? args['status'] : '';
  const reason =
    typeof args['reason'] === 'string' && args['reason'].trim()
      ? args['reason'].trim()
      : undefined;
  if (!taskUid) return errorResult('update_task_status: "task_uid" required');
  if (!VALID_TASK_STATUSES.has(status)) {
    return errorResult(
      `update_task_status: invalid status "${status}" (allowed: backlog|waiting|todo|doing|blocked|done)`
    );
  }
  const abs = await resolveTaskPath(ctx, taskUid);
  if (!abs) {
    return errorResult(
      `update_task_status: task ${taskUid} not in project scope ${ctx.projectSlug}`
    );
  }
  const raw = await fs.readFile(abs, 'utf8');
  const upd = frontmatter.update(raw, {
    status,
    blocked_reason: status === 'blocked' ? reason : undefined
  });
  if (upd.changed) await fs.writeFile(abs, upd.content, 'utf8');
  return jsonResult({ uid: taskUid, status, path: abs, ...(reason ? { reason } : {}) });
}

export async function appendExecutionLogTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const taskUid = typeof args['task_uid'] === 'string' ? args['task_uid'] : '';
  const line = typeof args['line'] === 'string' ? args['line'] : '';
  if (!taskUid) return errorResult('append_execution_log: "task_uid" required');
  if (!line) return errorResult('append_execution_log: "line" required');
  return appendSectionInternal(ctx, taskUid, 'executionLog', line, true);
}

export async function logThinkingTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const taskUid = typeof args['task_uid'] === 'string' ? args['task_uid'] : '';
  const note = typeof args['note'] === 'string' ? args['note'] : '';
  if (!taskUid) return errorResult('log_thinking: "task_uid" required');
  if (!note) return errorResult('log_thinking: "note" required');
  return appendSectionInternal(ctx, taskUid, 'thinking', note, false);
}

export async function appendSectionInternal(
  ctx: ToolContext,
  taskUid: string,
  section: TaskSectionKey,
  line: string,
  withTimestamp: boolean
): Promise<ToolCallResult> {
  const abs = await resolveTaskPath(ctx, taskUid);
  if (!abs) {
    return errorResult(`task ${taskUid} not in project scope ${ctx.projectSlug}`);
  }
  const raw = await fs.readFile(abs, 'utf8');
  const { data, body, raw: fmRaw } = frontmatter.read(raw);
  const formatted = withTimestamp ? `- [${nowIso(ctx)}] ${line}` : line;
  const newBody = appendToSection(body, section, formatted);
  if (newBody === body)
    return jsonResult({ uid: taskUid, path: abs, changed: false });
  const next = fmRaw ? `${fmRaw}${newBody}` : frontmatter.write(data, newBody);
  await fs.writeFile(abs, next, 'utf8');
  return jsonResult({ uid: taskUid, path: abs, section, changed: true });
}

export async function getVisionTool(
  ctx: ToolContext,
  _args: Record<string, unknown>
): Promise<ToolCallResult> {
  void _args;
  const v = await readVision(ctx.vault);
  if (!v.exists) return textResult('');
  return textResult(v.body);
}

export async function searchGlobalContextTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
  if (!query) return errorResult('search_global_context: "query" required');
  const k =
    typeof args['k'] === 'number' && Number.isFinite(args['k'])
      ? Math.max(1, Math.floor(args['k'] as number))
      : 5;
  const store = new VectorStore(ctx.vault);
  await store.load();
  const vec = getEmbedder().embed(query);
  const hits = store.search(vec, k);
  return jsonResult({
    query,
    hits: hits.map((h) => ({
      score: h.score,
      uid: h.meta.uid,
      kind: h.meta.kind,
      relPath: h.meta.relPath,
      title: h.meta.title,
      excerpt: h.meta.excerpt
    }))
  });
}

export async function checkpointCommitTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const message = typeof args['message'] === 'string' ? args['message'].trim() : '';
  if (!message) return errorResult('checkpoint_commit: "message" required');
  const taskUid =
    typeof args['task_uid'] === 'string' && args['task_uid'].length > 0
      ? (args['task_uid'] as string)
      : null;
  const cwd = projectDir(ctx);
  if (!(await exists(path.join(cwd, '.git')))) {
    return errorResult(`checkpoint_commit: ${cwd} is not a git repository`);
  }
  const fullMsg = taskUid ? `${message}\n\nOrbit-Task: ${taskUid}` : message;
  const git = ctx.git ?? defaultGit;
  const add = await git(['add', '-A'], cwd);
  if (add.code !== 0) {
    return errorResult(`checkpoint_commit: git add failed: ${add.stderr.trim()}`);
  }
  const commit = await git(['commit', '-m', fullMsg], cwd);
  if (commit.code !== 0) {
    const stderr = (commit.stderr + commit.stdout).toLowerCase();
    if (stderr.includes('nothing to commit')) {
      return jsonResult({ committed: false, reason: 'nothing to commit' });
    }
    return errorResult(`checkpoint_commit: git commit failed: ${commit.stderr.trim()}`);
  }
  const sha = await git(['rev-parse', 'HEAD'], cwd);
  const head = sha.code === 0 ? sha.stdout.trim() : '';
  return jsonResult({
    committed: true,
    sha: head,
    message: fullMsg,
    ...(taskUid !== null ? { task_uid: taskUid } : {})
  });
}

async function listTaskRecords(ctx: ToolContext): Promise<
  Array<{ uid: string; title: string; status: string; path: string; created_at?: string }>
> {
  const dir = projectTasksDir(ctx);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
  const tasks: Array<{
    uid: string;
    title: string;
    status: string;
    path: string;
    created_at?: string;
  }> = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.md')) continue;
    const abs = path.join(dir, name);
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data } = frontmatter.read(raw);
      const uid = typeof data['uid'] === 'string' ? (data['uid'] as string) : '';
      const title = typeof data['title'] === 'string' ? (data['title'] as string) : name;
      const status =
        typeof data['status'] === 'string' ? (data['status'] as string) : 'backlog';
      const created_at =
        typeof data['created_at'] === 'string' ? (data['created_at'] as string) : undefined;
      tasks.push({ uid, title, status, path: abs, ...(created_at ? { created_at } : {}) });
    } catch {
      // ignore unreadable task files
    }
  }
  return tasks;
}

export async function listTasksTool(
  ctx: ToolContext,
  _args: Record<string, unknown>
): Promise<ToolCallResult> {
  void _args;
  const tasks = await listTaskRecords(ctx);
  return jsonResult({ count: tasks.length, tasks });
}

export async function getProjectStateTool(
  ctx: ToolContext,
  _args: Record<string, unknown>
): Promise<ToolCallResult> {
  void _args;
  const cwd = projectDir(ctx);
  const git = ctx.git ?? defaultGit;
  const isRepo = await exists(path.join(cwd, '.git'));
  const tasks = await listTaskRecords(ctx);
  const activeTasks = tasks
    .filter((task) => task.status !== 'done')
    .map((task) => ({ uid: task.uid, title: task.title, status: task.status }));
  if (!isRepo) {
    return jsonResult({
      git: { isRepo: false, dirty: false, staged: 0, unstaged: 0, untracked: 0 },
      activeTasks
    });
  }

  const [branchRes, statusRes, headRes] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    git(['status', '--short', '--branch'], cwd),
    git(['rev-parse', 'HEAD'], cwd)
  ]);
  const statusLines = statusRes.stdout.split(/\r?\n/).filter(Boolean);
  const { dirty, stagedCount, unstagedCount, untrackedCount } = parsePorcelainStatus(statusLines);

  return jsonResult({
    git: {
      isRepo: true,
      branch: branchRes.code === 0 ? branchRes.stdout.trim() : '',
      head: headRes.code === 0 ? headRes.stdout.trim() : '',
      dirty,
      staged: stagedCount,
      unstaged: unstagedCount,
      untracked: untrackedCount
    },
    activeTasks
  });
}

function parseLimit(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

export async function readOperationLogTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const limit = parseLimit(args['limit'], 50);
  const entries = await readAllOperationLogEntries(ctx);
  return jsonResult({ entries: entries.slice(-limit).reverse(), count: entries.length });
}

export async function queryOperationLogTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const date = typeof args['date'] === 'string' ? args['date'] : undefined;
  const sessionPid =
    typeof args['sessionPid'] === 'number' && Number.isFinite(args['sessionPid'])
      ? Math.floor(args['sessionPid'] as number)
      : undefined;
  const tool = typeof args['tool'] === 'string' ? args['tool'] : undefined;
  const taskUid = typeof args['taskUid'] === 'string' ? args['taskUid'] : undefined;
  const limit = parseLimit(args['limit'], 50);
  const offset =
    typeof args['offset'] === 'number' && Number.isFinite(args['offset'])
      ? Math.max(0, Math.floor(args['offset'] as number))
      : 0;
  let entries = await readAllOperationLogEntries(ctx);
  if (date) entries = entries.filter((entry) => entry.date === date);
  if (sessionPid !== undefined) {
    entries = entries.filter((entry) => entry.sessionPid === sessionPid);
  }
  if (tool) entries = entries.filter((entry) => entry.tool === tool);
  if (taskUid) entries = entries.filter((entry) => entry.taskUid === taskUid);
  const newestFirst = entries.reverse();
  return jsonResult({
    entries: newestFirst.slice(offset, offset + limit),
    count: newestFirst.length
  });
}

// --- registry --------------------------------------------------------------

export const TOOLS: ToolDefinition[] = [
  {
    name: 'create_task',
    description:
      'Create a new task markdown file in the current project (.agent/tasks/). Returns the new task uid and absolute path.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title (required).' },
        description: { type: 'string' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent']
        },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['title']
    }
  },
  {
    name: 'update_task_status',
    description:
      "Update a task's status. Status must be one of: backlog, waiting, todo, doing, blocked, done. Optionally include a reason when blocking a task. The task must belong to the current project.",
    inputSchema: {
      type: 'object',
      properties: {
        task_uid: { type: 'string' },
        status: {
          type: 'string',
          enum: ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done']
        },
        reason: { type: 'string' }
      },
      required: ['task_uid', 'status']
    }
  },
  {
    name: 'append_execution_log',
    description:
      "Append a timestamped line ('- [ISO] <line>') to the task's # Execution Log section.",
    inputSchema: {
      type: 'object',
      properties: {
        task_uid: { type: 'string' },
        line: { type: 'string' }
      },
      required: ['task_uid', 'line']
    }
  },
  {
    name: 'log_thinking',
    description:
      "Append a free-form note to the task's # Agent Thinking section.",
    inputSchema: {
      type: 'object',
      properties: {
        task_uid: { type: 'string' },
        note: { type: 'string' }
      },
      required: ['task_uid', 'note']
    }
  },
  {
    name: 'list_tasks',
    description:
      'List every task in the current project with uid, title, status and absolute path.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_vision',
    description:
      'Read the vault-level Vision.md body (frontmatter stripped). Returns an empty string when no Vision.md exists.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search_global_context',
    description:
      'Cosine-similarity search across the vault Distillery (Resources / Archives / Projects). Returns up to k hits.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        k: { type: 'number', minimum: 1, maximum: 20 }
      },
      required: ['query']
    }
  },
  {
    name: 'checkpoint_commit',
    description:
      "Stage every change and commit inside the current project's git repo. Adds an 'Orbit-Task: <uid>' trailer when task_uid is supplied. Never pushes.",
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        task_uid: { type: 'string' }
      },
      required: ['message']
    }
  },
  {
    name: 'get_project_state',
    description:
      'Return git status and active task summary for the current project.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_operation_log',
    description:
      'Read the most recent operation log entries for this project, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 200 }
      }
    }
  },
  {
    name: 'query_operation_log',
    description:
      'Query operation logs for this project by date, sessionPid, tool or taskUid.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        sessionPid: { type: 'number' },
        tool: { type: 'string' },
        taskUid: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 200 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  }
];

export type ToolName = (typeof TOOLS)[number]['name'];

export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const startedAt = Date.now();
  try {
    const result = await callToolInner(ctx, name, args);
    try {
      await writeOpLog(ctx, name, args, result, Date.now() - startedAt);
    } catch {
      // best-effort logging only
    }
    return result;
  } catch (error) {
    const errResult = errorResult((error as Error).message ?? String(error));
    try {
      await writeOpLog(ctx, name, args, errResult, Date.now() - startedAt);
    } catch {
      // best-effort logging only
    }
    throw error;
  }
}

async function callToolInner(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  switch (name) {
    case 'create_task':
      return createTaskTool(ctx, args);
    case 'update_task_status':
      return updateTaskStatusTool(ctx, args);
    case 'append_execution_log':
      return appendExecutionLogTool(ctx, args);
    case 'log_thinking':
      return logThinkingTool(ctx, args);
    case 'list_tasks':
      return listTasksTool(ctx, args);
    case 'get_vision':
      return getVisionTool(ctx, args);
    case 'search_global_context':
      return searchGlobalContextTool(ctx, args);
    case 'checkpoint_commit':
      return checkpointCommitTool(ctx, args);
    case 'get_project_state':
      return getProjectStateTool(ctx, args);
    case 'read_operation_log':
      return readOperationLogTool(ctx, args);
    case 'query_operation_log':
      return queryOperationLogTool(ctx, args);
    default:
      return errorResult(`unknown tool: ${name}`);
  }
}

// Re-export internals used by tests / the agent text-fallback parser.
export { parseTaskSections, serializeTaskSections };
