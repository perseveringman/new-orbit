import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  PROJECTS_DIR,
  PROJECT_AGENT_DIR,
  PROJECT_LOGS_DIR,
  PROJECT_LOG_ARCHIVE_DIR,
  PROJECT_OPERATION_LOG,
  PROJECT_TIMELINE
} from '@shared/constants';
import type { ToolCallResult } from './protocol';
import type { ToolContext } from './tools';

export interface OperationLogEntry {
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  ok: boolean;
  durationMs: number;
  projectUid: string;
  projectSlug: string;
  sessionPid: number;
  taskUid?: string;
  date: string;
}

const MAX_ACTIVE_ENTRIES = 500;
const MAX_ACTIVE_BYTES = 500 * 1024;
const ACTIVE_RETENTION_DAYS = 14;
const TIMELINE_RETENTION_DAYS = 7;

function projectDir(ctx: ToolContext): string {
  return path.join(ctx.vault, PROJECTS_DIR, ctx.projectSlug);
}

function logDir(ctx: ToolContext): string {
  return path.join(projectDir(ctx), PROJECT_AGENT_DIR, PROJECT_LOGS_DIR);
}

function archiveDir(ctx: ToolContext): string {
  return path.join(logDir(ctx), PROJECT_LOG_ARCHIVE_DIR);
}

function operationsPath(ctx: ToolContext): string {
  return path.join(logDir(ctx), PROJECT_OPERATION_LOG);
}

function timelinePath(ctx: ToolContext): string {
  return path.join(logDir(ctx), PROJECT_TIMELINE);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseResultPayload(
  result: ToolCallResult
): string | Record<string, unknown> | null {
  const text = result.content[0]?.text ?? '';
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function summarizeResult(
  tool: string,
  result: ToolCallResult
): Record<string, unknown> | undefined {
  const payload = parseResultPayload(result);
  if (payload === null) return undefined;
  if (typeof payload === 'string') {
    if (tool === 'get_vision') {
      return { chars: payload.length, empty: payload.length === 0 };
    }
    return { text: payload.slice(0, 200) };
  }
  switch (tool) {
    case 'search_global_context':
      return { hits: Array.isArray(payload['hits']) ? payload['hits'].length : 0 };
    case 'list_tasks':
      return { count: Array.isArray(payload['tasks']) ? payload['tasks'].length : 0 };
    case 'get_project_state':
      return {
        dirty:
          typeof payload['git'] === 'object' &&
          payload['git'] !== null &&
          typeof (payload['git'] as { dirty?: unknown }).dirty === 'boolean'
            ? (payload['git'] as { dirty: boolean }).dirty
            : false,
        activeTasks: Array.isArray(payload['activeTasks']) ? payload['activeTasks'].length : 0
      };
    case 'read_operation_log':
    case 'query_operation_log':
      return { count: Array.isArray(payload['entries']) ? payload['entries'].length : 0 };
    case 'create_task':
    case 'update_task_status':
    case 'append_execution_log':
    case 'log_thinking':
    case 'checkpoint_commit':
      return payload;
    default:
      return payload;
  }
}

function parseJsonLines(raw: string): OperationLogEntry[] {
  const entries: OperationLogEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as OperationLogEntry);
    } catch {
      // ignore malformed historical lines
    }
  }
  return entries;
}

async function readCurrentEntries(ctx: ToolContext): Promise<OperationLogEntry[]> {
  try {
    const raw = await fs.readFile(operationsPath(ctx), 'utf8');
    return parseJsonLines(raw);
  } catch {
    return [];
  }
}

async function readArchiveEntries(ctx: ToolContext): Promise<OperationLogEntry[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(archiveDir(ctx));
  } catch {
    return [];
  }
  const entries: OperationLogEntry[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.jsonl.gz')) continue;
    try {
      const raw = await fs.readFile(path.join(archiveDir(ctx), name));
      entries.push(...parseJsonLines(gunzipSync(raw).toString('utf8')));
    } catch {
      // ignore unreadable archive file
    }
  }
  return entries;
}

export async function readAllOperationLogEntries(
  ctx: ToolContext
): Promise<OperationLogEntry[]> {
  const [archived, current] = await Promise.all([
    readArchiveEntries(ctx),
    readCurrentEntries(ctx)
  ]);
  return [...archived, ...current].sort((a, b) => a.ts.localeCompare(b.ts));
}

function bytesForEntries(entries: OperationLogEntry[]): number {
  return Buffer.byteLength(entries.map((entry) => JSON.stringify(entry)).join('\n'), 'utf8');
}

async function appendArchiveEntries(
  ctx: ToolContext,
  entries: OperationLogEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  await fs.mkdir(archiveDir(ctx), { recursive: true });
  const grouped = new Map<string, OperationLogEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.date) ?? [];
    bucket.push(entry);
    grouped.set(entry.date, bucket);
  }
  for (const [date, bucket] of grouped) {
    const file = path.join(archiveDir(ctx), `operations.${date}.jsonl.gz`);
    let existing: OperationLogEntry[] = [];
    try {
      const raw = await fs.readFile(file);
      existing = parseJsonLines(gunzipSync(raw).toString('utf8'));
    } catch {
      existing = [];
    }
    const merged = [...existing, ...bucket].sort((a, b) => a.ts.localeCompare(b.ts));
    const body = merged.map((entry) => JSON.stringify(entry)).join('\n');
    await fs.writeFile(file, gzipSync(body.length > 0 ? `${body}\n` : ''), 'binary');
  }
}

function partitionEntries(
  entries: OperationLogEntry[],
  now: Date
): { active: OperationLogEntry[]; archived: OperationLogEntry[] } {
  const cutoff = new Date(now.getTime() - ACTIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const active = sorted.filter((entry) => entry.ts >= cutoff);
  const archived = sorted.filter((entry) => entry.ts < cutoff);

  while (active.length > MAX_ACTIVE_ENTRIES || bytesForEntries(active) > MAX_ACTIVE_BYTES) {
    const shifted = active.shift();
    if (!shifted) break;
    archived.push(shifted);
  }

  return {
    active,
    archived: archived.sort((a, b) => a.ts.localeCompare(b.ts))
  };
}

function formatTimelineLine(entry: OperationLogEntry): string {
  const time = entry.ts.slice(11, 16);
  switch (entry.tool) {
    case 'create_task':
      return `- ${time} — 创建任务「${String(entry.args['title'] ?? '未命名任务')}」` +
        `(uid: ${String(entry.result?.['uid'] ?? '?')}` +
        (entry.args['priority'] ? `, priority: ${String(entry.args['priority'])}` : '') +
        ')';
    case 'update_task_status':
      return `- ${time} — 任务 ${entry.taskUid ?? '?'} 状态 → ${String(entry.args['status'] ?? '?')}`;
    case 'append_execution_log':
      return `- ${time} — 任务 ${entry.taskUid ?? '?'} 追加执行日志`;
    case 'log_thinking':
      return `- ${time} — 任务 ${entry.taskUid ?? '?'} 记录思考`;
    case 'get_vision':
      return `- ${time} — 获取 Vision`;
    case 'search_global_context':
      return `- ${time} — 搜索全局上下文：「${String(entry.args['query'] ?? '')}」` +
        `(${Number(entry.result?.['hits'] ?? 0)} hits)`;
    case 'checkpoint_commit':
      return `- ${time} — 提交代码：${String(entry.args['message'] ?? '')}` +
        (entry.result?.['sha'] ? ` (sha: ${String(entry.result['sha']).slice(0, 7)})` : '') +
        (entry.taskUid ? ` (task: ${entry.taskUid})` : '');
    case 'list_tasks':
      return `- ${time} — 列出任务 (${Number(entry.result?.['count'] ?? 0)} tasks)`;
    case 'get_project_state':
      return `- ${time} — 获取项目状态`;
    case 'read_operation_log':
      return `- ${time} — 读取最近操作日志 (${Number(entry.result?.['count'] ?? 0)} entries)`;
    case 'query_operation_log':
      return `- ${time} — 查询操作日志 (${Number(entry.result?.['count'] ?? 0)} entries)`;
    default:
      return `- ${time} — ${entry.tool}` + (entry.ok ? '' : ` ❌ ${entry.error ?? ''}`);
  }
}

function buildTimeline(entries: OperationLogEntry[], now: Date): string {
  const cutoff = new Date(now.getTime() - TIMELINE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
  const filtered = entries.filter((entry) => entry.ts >= cutoff);
  if (filtered.length === 0) {
    return '# 操作时间线\n\n_尚无记录。_\n';
  }

  const days = new Map<string, OperationLogEntry[]>();
  for (const entry of filtered) {
    const bucket = days.get(entry.date) ?? [];
    bucket.push(entry);
    days.set(entry.date, bucket);
  }

  const lines = ['# 操作时间线', ''];
  for (const date of [...days.keys()].sort().reverse()) {
    lines.push(`## ${date}`, '');
    const dayEntries = days.get(date) ?? [];
    const sessions = new Map<number, OperationLogEntry[]>();
    for (const entry of dayEntries) {
      const bucket = sessions.get(entry.sessionPid) ?? [];
      bucket.push(entry);
      sessions.set(entry.sessionPid, bucket);
    }
    for (const sessionPid of [...sessions.keys()].sort((a, b) => a - b)) {
      lines.push(`### 会话 ${sessionPid}`);
      const sessionEntries = (sessions.get(sessionPid) ?? []).sort((a, b) =>
        a.ts.localeCompare(b.ts)
      );
      for (const entry of sessionEntries) {
        lines.push(formatTimelineLine(entry));
      }
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

export async function writeOpLog(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  result: ToolCallResult,
  durationMs: number
): Promise<void> {
  const now = ctx.now?.() ?? new Date();
  const ok = !result.isError;
  const entry: OperationLogEntry = {
    ts: now.toISOString(),
    tool,
    args,
    ok,
    durationMs,
    projectUid: ctx.projectUid,
    projectSlug: ctx.projectSlug,
    sessionPid: process.pid,
    date: dateKey(now)
  };

  const taskUid = typeof args['task_uid'] === 'string' ? (args['task_uid'] as string) : undefined;
  if (taskUid) entry.taskUid = taskUid;
  if (ok) {
    const summary = summarizeResult(tool, result);
    if (summary && Object.keys(summary).length > 0) entry.result = summary;
  } else {
    entry.error = result.content[0]?.text ?? 'unknown tool error';
  }

  await fs.mkdir(logDir(ctx), { recursive: true });
  await fs.mkdir(archiveDir(ctx), { recursive: true });
  const current = await readCurrentEntries(ctx);
  const { active, archived } = partitionEntries([...current, entry], now);
  await appendArchiveEntries(ctx, archived);
  const activeBody = active.map((item) => JSON.stringify(item)).join('\n');
  await fs.writeFile(operationsPath(ctx), activeBody.length > 0 ? `${activeBody}\n` : '', 'utf8');
  await fs.writeFile(timelinePath(ctx), buildTimeline(active, now), 'utf8');
}
