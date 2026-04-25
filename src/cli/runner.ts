import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeTaskStatus } from '@shared/schemas';
import type { TaskRecord } from '@shared/schemas';
import type { SearchHit } from '@shared/types';
import type { ActivityEvent } from '@shared/activity';
import type { Proposal } from '@shared/approval';
import type { InboxItem, InboxListResult } from '@shared/inbox';
import type { DependencyTreeNode } from '../main/dependencies';
import type { ReadyResult } from '../main/auto_runner/ready_set';
import { SocketBridgeClient, type BridgeClient } from './bridge';
import {
  EXIT_SUCCESS,
  normalizeCliError,
  unavailableError,
  usageError,
  type CliExitCode
} from './errors';
import { errorPayload } from './errors';
import { formatJsonError, formatJsonSuccess } from './output';
import {
  generateActivityHelp,
  generateAgentHelp,
  generateApprovalHelp,
  generateAutoRunnerHelp,
  generateCatHelp,
  generateFeedHelp,
  generateInboxHelp,
  generateLibraryHelp,
  generateMemoryHelp,
  generateProjectHelp,
  generateRunHelp,
  generateSearchHelp,
  generateTaskHelp,
  generateThoughtHelp,
  generateTopLevelHelp
} from './help/generate';

interface ParsedGlobalFlags {
  json: boolean;
  help: boolean;
  socketPath?: string;
  vaultPath?: string;
  args: string[];
}

export interface CliRunOptions {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  stdin?: string | (() => string | Promise<string>);
  bridge?: BridgeClient;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface LongTextOptions {
  textFlags?: string[];
  fileFlags?: string[];
  stdinFallback?: boolean;
}

function parseGlobalFlags(argv: string[]): ParsedGlobalFlags {
  const rest: string[] = [];
  let json = false;
  let help = false;
  let socketPath: string | undefined;
  let vaultPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--socket') socketPath = argvValue(argv, ++i, '--socket');
    else if (arg === '--vault') vaultPath = argvValue(argv, ++i, '--vault');
    else rest.push(arg);
  }
  return { json, help, socketPath, vaultPath, args: rest };
}

function createBridge(flags: ParsedGlobalFlags, options: CliRunOptions): BridgeClient {
  return (
    options.bridge ??
    new SocketBridgeClient({
      socketPath: flags.socketPath,
      vaultPath: flags.vaultPath,
      env: options.env,
      cwd: options.cwd
    })
  );
}

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLimit(args: string[], fallback = 30): { limit: number; rest: string[] } {
  const rest: string[] = [];
  let limit = fallback;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--limit') {
      const raw = argvValue(args, ++i, '--limit');
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw usageError('--limit requires a positive integer');
      }
      limit = parsed;
    } else rest.push(arg);
  }
  return { limit, rest };
}

async function readStdin(options: CliRunOptions): Promise<string> {
  if (typeof options.stdin === 'string') return options.stdin;
  if (typeof options.stdin === 'function') return options.stdin();
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function readFileContent(filePath: string, options: CliRunOptions): Promise<string> {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(options.cwd ?? process.cwd(), filePath);
  return fs.readFile(abs, 'utf8');
}

async function readLongText(
  args: string[],
  options: CliRunOptions,
  config: LongTextOptions = {}
): Promise<{ text?: string; rest: string[] }> {
  const textFlags = new Set(
    config.textFlags ?? ['--content', '--message', '--summary', '--description', '--note']
  );
  const fileFlags = new Set(
    config.fileFlags ?? ['--file', '--content-file', '--summary-file', '--description-file']
  );
  const rest: string[] = [];
  let text: string | undefined;
  let filePath: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (textFlags.has(arg)) text = argvValue(args, ++i, arg);
    else if (fileFlags.has(arg)) filePath = argvValue(args, ++i, arg);
    else rest.push(arg);
  }
  if (filePath) text = await readFileContent(filePath, options);
  if (text === undefined && config.stdinFallback !== false) {
    const stdin = await readStdin(options);
    if (stdin.trim().length > 0) text = stdin;
  }
  return { text, rest };
}

function parseJsonObject(value: string, flag: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw usageError(`${flag} requires a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function formatGeneric(data: unknown): string {
  if (data === undefined || data === null) return 'OK\n';
  if (typeof data === 'string') return `${data}\n`;
  return `${JSON.stringify(data, null, 2)}\n`;
}

function formatSearchHits(data: unknown): string {
  const hits = Array.isArray(data) ? (data as SearchHit[]) : [];
  if (hits.length === 0) return 'No results\n';
  return (
    hits.map((hit) => `${hit.relPath}\t${hit.title}\t${hit.score.toFixed(2)}`).join('\n') + '\n'
  );
}

function formatCat(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'content' in data) {
    const content = (data as { content?: unknown }).content;
    return typeof content === 'string' ? content : '';
  }
  return '';
}

function formatTasks(data: unknown): string {
  const tasks = Array.isArray(data) ? (data as TaskRecord[]) : [];
  if (tasks.length === 0) return 'No tasks\n';
  return (
    tasks
      .map((task) => `${task.status}\t${task.uid ?? task.id}\t${task.title}\t${task.relPath}`)
      .join('\n') + '\n'
  );
}

function formatTaskGet(data: unknown): string {
  const payload = data as { task?: TaskRecord; readiness?: ReadyResult };
  if (!payload.task) return 'Task not found\n';
  const task = payload.task;
  const readiness = payload.readiness;
  return (
    [
      `${task.uid ?? task.id}\t${task.title}`,
      `status\t${task.status}`,
      `ready\t${readiness?.ready ? 'yes' : 'no'}`,
      readiness?.reason ? `reason\t${readiness.reason}` : '',
      readiness?.detail ? `detail\t${readiness.detail}` : '',
      `depends_on\t${(task.depends_on ?? []).join(',') || '-'}`
    ]
      .filter(Boolean)
      .join('\n') + '\n'
  );
}

function formatDependencyTree(data: unknown): string {
  const root = data as DependencyTreeNode;
  const lines: string[] = [];
  function walk(node: DependencyTreeNode, depth: number): void {
    const title = node.task?.title ? ` ${node.task.title}` : '';
    lines.push(
      `${'  '.repeat(depth)}${depth === 0 ? '' : '↳ '}${node.uid} [${node.status}]${title}`
    );
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(root, 0);
  return `${lines.join('\n')}\n`;
}

function formatInbox(data: unknown): string {
  const result = data as InboxListResult;
  if (Array.isArray(result.items)) {
    if (result.items.length === 0) return 'No inbox items\n';
    return result.items.map(formatInboxItemLine).join('\n') + '\n';
  }
  return formatInboxItemLine(data as InboxItem) + '\n';
}

function formatInboxItemLine(item: InboxItem): string {
  return `${item.status}\t${item.subtype}\t${item.id}\t${item.title}`;
}

function formatActivity(data: unknown): string {
  const events = Array.isArray(data) ? (data as ActivityEvent[]) : [];
  if (events.length === 0) return 'No activity\n';
  return (
    events
      .map((event) => `${event.at}\t${event.actor}\t${event.action}\t${event.summary}`)
      .join('\n') + '\n'
  );
}

function formatApprovals(data: unknown): string {
  const proposals = Array.isArray(data) ? (data as Proposal[]) : [data as Proposal];
  if (proposals.length === 0) return 'No approvals\n';
  return (
    proposals
      .map(
        (proposal) => `${proposal.status}\t${proposal.type}\t${proposal.id}\t${proposal.subject}`
      )
      .join('\n') + '\n'
  );
}

function formatAutoRunnerStatus(data: unknown): string {
  const status = data as {
    attached?: boolean;
    enabled?: boolean;
    readyTaskCount?: number;
    hourlyStarted?: number;
    hourlyRemaining?: number;
    running?: Array<{ taskUid?: string; taskId: string; title: string; runId: string }>;
    settings?: { maxConcurrent?: number; hourlyTaskLimit?: number; tickIntervalMs?: number };
    lastError?: string;
  };
  const running = status.running ?? [];
  const lines = [
    `enabled\t${status.enabled ? 'yes' : 'no'}`,
    `attached\t${status.attached ? 'yes' : 'no'}`,
    `ready\t${status.readyTaskCount ?? 0}`,
    `running\t${running.length}`,
    `max_concurrent\t${status.settings?.maxConcurrent ?? '-'}`,
    `hourly\t${status.hourlyStarted ?? 0}/${status.settings?.hourlyTaskLimit ?? '-'}`,
    `hourly_remaining\t${status.hourlyRemaining ?? 0}`,
    `tick_interval_ms\t${status.settings?.tickIntervalMs ?? '-'}`,
    status.lastError ? `last_error\t${status.lastError}` : ''
  ].filter(Boolean);
  for (const run of running) {
    lines.push(`run\t${run.taskUid ?? run.taskId}\t${run.runId}\t${run.title}`);
  }
  return `${lines.join('\n')}\n`;
}

async function bridgeOutput(
  flags: ParsedGlobalFlags,
  options: CliRunOptions,
  method: string,
  params: unknown,
  formatter: (data: unknown) => string = formatGeneric
): Promise<string> {
  const data = await createBridge(flags, options).request(method, params);
  return flags.json ? formatJsonSuccess(data) : formatter(data);
}

async function runSearch(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help) return generateSearchHelp();
  const { limit, rest } = parseLimit(flags.args.slice(1));
  const query = rest.join(' ').trim();
  if (!query) throw usageError('Usage: orbit search <query> [--limit N]');
  return bridgeOutput(flags, options, 'search', { query, limit }, formatSearchHits);
}

async function runCat(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help) return generateCatHelp();
  const target = flags.args[1];
  if (!target) throw usageError('Usage: orbit cat <path-or-uid>');
  return bridgeOutput(flags, options, 'cat', { target }, formatCat);
}

function parseTaskList(args: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--status') {
      const value = argvValue(args, ++i, '--status');
      const status = normalizeTaskStatus(value);
      if (!status) throw usageError(`Unknown task status: ${value}`);
      filter['status'] = status;
    } else if (arg === '--project') filter['project_uid'] = argvValue(args, ++i, '--project');
    else if (arg === '--area') filter['area_uid'] = argvValue(args, ++i, '--area');
    else if (arg === '--tag') filter['tag'] = argvValue(args, ++i, '--tag');
    else throw usageError(`Unknown task list option: ${arg}`);
  }
  return filter;
}

function parseTaskUpdate(uid: string, args: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = { uid };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--status') {
      const value = argvValue(args, ++i, '--status');
      const status = normalizeTaskStatus(value);
      if (!status) throw usageError(`Unknown task status: ${value}`);
      patch['status'] = status;
    } else if (arg === '--depends-on')
      patch['depends_on'] = splitCsv(argvValue(args, ++i, '--depends-on'));
    else throw usageError(`Unknown task update option: ${arg}`);
  }
  return patch;
}

async function parseTaskPropose(
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--description'],
    fileFlags: ['--file', '--description-file']
  });
  const params: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--title') params['title'] = argvValue(rest, ++i, '--title');
    else if (arg === '--project') params['project_uid'] = argvValue(rest, ++i, '--project');
    else if (arg === '--area') params['area_uid'] = argvValue(rest, ++i, '--area');
    else if (arg === '--run') params['run_id'] = argvValue(rest, ++i, '--run');
    else if (arg === '--during-task')
      params['during_task_uid'] = argvValue(rest, ++i, '--during-task');
    else if (arg === '--frontmatter-json') {
      params['frontmatter'] = parseJsonObject(
        argvValue(rest, ++i, '--frontmatter-json'),
        '--frontmatter-json'
      );
    } else throw usageError(`Unknown task propose option: ${arg}`);
  }
  if (text !== undefined) params['description'] = text.trimEnd();
  if (typeof params['title'] !== 'string') throw usageError('task propose requires --title');
  if (!params['project_uid'] && !params['area_uid'])
    throw usageError('task propose requires --project or --area');
  return params;
}

async function parseTaskProposeScope(
  currentUid: string,
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--summary'],
    fileFlags: ['--file', '--summary-file']
  });
  const params: Record<string, unknown> = { current_uid: currentUid };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--run') params['run_id'] = argvValue(rest, ++i, '--run');
    else throw usageError(`Unknown task propose-scope option: ${arg}`);
  }
  if (text !== undefined) params['summary'] = text.trimEnd();
  return params;
}

async function runTask(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateTaskHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list') {
    return bridgeOutput(
      flags,
      options,
      'task.list',
      parseTaskList(flags.args.slice(2)),
      formatTasks
    );
  }
  if (subcommand === 'get') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task get <uid>');
    return bridgeOutput(flags, options, 'task.get', { uid }, formatTaskGet);
  }
  if (subcommand === 'deps') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task deps <uid>');
    return bridgeOutput(flags, options, 'task.deps', { uid }, formatDependencyTree);
  }
  if (subcommand === 'update') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task update <uid> [--status S] [--depends-on a,b]');
    return bridgeOutput(
      flags,
      options,
      'task.update',
      parseTaskUpdate(uid, flags.args.slice(3)),
      (data) => formatTasks([data])
    );
  }
  if (subcommand === 'propose') {
    return bridgeOutput(
      flags,
      options,
      'task.propose',
      await parseTaskPropose(flags.args.slice(2), options),
      formatApprovals
    );
  }
  if (subcommand === 'propose-scope') {
    const currentUid = flags.args[2];
    if (!currentUid) throw usageError('Usage: orbit task propose-scope <current-uid>');
    return bridgeOutput(
      flags,
      options,
      'task.proposeScope',
      await parseTaskProposeScope(currentUid, flags.args.slice(3), options),
      formatApprovals
    );
  }
  if (subcommand === 'delete') {
    throw unavailableError('orbit task delete is unavailable: no task delete backend is present.');
  }
  throw usageError(`Unknown task subcommand: ${subcommand}`);
}

async function runProject(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateProjectHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list') return bridgeOutput(flags, options, 'project.list', {}, formatGeneric);
  if (subcommand === 'get') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit project get <uid>');
    return bridgeOutput(flags, options, 'project.get', { uid }, formatGeneric);
  }
  if (subcommand === 'archive') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit project archive <uid>');
    return bridgeOutput(flags, options, 'project.archive', { uid }, formatApprovals);
  }
  if (subcommand === 'graph') {
    const params: Record<string, unknown> = {};
    const args = flags.args.slice(2);
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i] ?? '';
      if (arg === '--uid') params['uid'] = argvValue(args, ++i, '--uid');
      else throw usageError(`Unknown project graph option: ${arg}`);
    }
    return bridgeOutput(flags, options, 'project.graph', params, formatGeneric);
  }
  throw usageError(`Unknown project subcommand: ${subcommand}`);
}

function parseInboxList(args: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = { includeArchived: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--category') filter['category'] = argvValue(args, ++i, '--category');
    else if (arg === '--subtype') filter['subtype'] = argvValue(args, ++i, '--subtype');
    else if (arg === '--status') filter['status'] = argvValue(args, ++i, '--status');
    else if (arg === '--include-archived') filter['includeArchived'] = true;
    else throw usageError(`Unknown inbox list option: ${arg}`);
  }
  return filter;
}

async function parseNote(
  args: string[],
  options: CliRunOptions
): Promise<{ note?: string; rest: string[] }> {
  const parsed = await readLongText(args, options, {
    textFlags: ['--note'],
    fileFlags: ['--file'],
    stdinFallback: false
  });
  return { note: parsed.text?.trimEnd(), rest: parsed.rest };
}

async function parseInboxEmitMessage(
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--summary'],
    fileFlags: ['--file']
  });
  const params: Record<string, unknown> = { context: {} };
  const context: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--type') params['subtype'] = argvValue(rest, ++i, '--type');
    else if (arg === '--title') params['title'] = argvValue(rest, ++i, '--title');
    else if (arg === '--run') context['run_id'] = argvValue(rest, ++i, '--run');
    else if (arg === '--task') context['task_uid'] = argvValue(rest, ++i, '--task');
    else if (arg === '--project') context['project_uid'] = argvValue(rest, ++i, '--project');
    else if (arg === '--payload-json') {
      params['payload'] = parseJsonObject(argvValue(rest, ++i, '--payload-json'), '--payload-json');
    } else throw usageError(`Unknown inbox emit-message option: ${arg}`);
  }
  if (typeof params['subtype'] !== 'string') throw usageError('inbox emit-message requires --type');
  if (typeof params['title'] !== 'string') throw usageError('inbox emit-message requires --title');
  params['summary'] = text?.trimEnd() ?? '';
  params['context'] = context;
  params['actor'] = 'agent';
  if (!params['payload']) params['payload'] = {};
  return params;
}

async function runInbox(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateInboxHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list')
    return bridgeOutput(
      flags,
      options,
      'inbox.list',
      parseInboxList(flags.args.slice(2)),
      formatInbox
    );
  if (subcommand === 'get') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit inbox get <id>');
    return bridgeOutput(flags, options, 'inbox.get', { id }, formatGeneric);
  }
  if (subcommand === 'resolve') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit inbox resolve <id>');
    const { note, rest } = await parseNote(flags.args.slice(3), options);
    const input: Record<string, unknown> = { source: 'cli' };
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i] ?? '';
      if (arg === '--decision') input['decision'] = argvValue(rest, ++i, '--decision');
      else throw usageError(`Unknown inbox resolve option: ${arg}`);
    }
    if (note) input['note'] = note;
    return bridgeOutput(flags, options, 'inbox.resolve', { id, input }, formatGeneric);
  }
  if (subcommand === 'dismiss') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit inbox dismiss <id>');
    const { note, rest } = await parseNote(flags.args.slice(3), options);
    if (rest.length > 0) throw usageError(`Unknown inbox dismiss option: ${rest[0]}`);
    return bridgeOutput(
      flags,
      options,
      'inbox.dismiss',
      { id, input: { source: 'cli', ...(note ? { note } : {}) } },
      formatGeneric
    );
  }
  if (subcommand === 'archive') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit inbox archive <id>');
    return bridgeOutput(flags, options, 'inbox.archive', { id }, formatGeneric);
  }
  if (subcommand === 'emit-message') {
    return bridgeOutput(
      flags,
      options,
      'inbox.emitMessage',
      await parseInboxEmitMessage(flags.args.slice(2), options),
      formatGeneric
    );
  }
  throw usageError(`Unknown inbox subcommand: ${subcommand}`);
}

function expandRelativeDate(value: string): string {
  const match = value.match(/^-(\d+)d$/);
  if (!match) return value;
  const days = Number(match[1]);
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function parseActivityFilter(args: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--from') filter['from'] = expandRelativeDate(argvValue(args, ++i, '--from'));
    else if (arg === '--to') filter['to'] = argvValue(args, ++i, '--to');
    else if (arg === '--actor') filter['actor'] = argvValue(args, ++i, '--actor');
    else if (arg === '--action') filter['action'] = argvValue(args, ++i, '--action');
    else if (arg === '--project-uid') filter['project_uid'] = argvValue(args, ++i, '--project-uid');
    else if (arg === '--task-uid') filter['task_uid'] = argvValue(args, ++i, '--task-uid');
    else if (arg === '--limit') {
      const limit = Number(argvValue(args, ++i, '--limit'));
      if (!Number.isInteger(limit) || limit <= 0)
        throw usageError('--limit requires a positive integer');
      filter['limit'] = limit;
    } else throw usageError(`Unknown activity option: ${arg}`);
  }
  return filter;
}

async function runActivity(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateActivityHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list') {
    return bridgeOutput(
      flags,
      options,
      'activity.list',
      parseActivityFilter(flags.args.slice(2)),
      formatActivity
    );
  }
  if (subcommand === 'summary') {
    return bridgeOutput(
      flags,
      options,
      'activity.summary',
      parseActivityFilter(flags.args.slice(2)),
      formatGeneric
    );
  }
  throw usageError(`Unknown activity subcommand: ${subcommand}`);
}

function parseApprovalList(args: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--pending') filter['status'] = 'pending';
    else if (arg === '--status') filter['status'] = argvValue(args, ++i, '--status');
    else if (arg === '--type') filter['type'] = argvValue(args, ++i, '--type');
    else if (arg === '--include-archived') filter['includeArchived'] = true;
    else throw usageError(`Unknown approval list option: ${arg}`);
  }
  return filter;
}

function normalizeDecision(value: string): string {
  if (value === 'approve') return 'approved';
  if (value === 'reject') return 'rejected';
  if (value === 'dismiss') return 'dismissed';
  throw usageError(`Unknown approval decision: ${value}`);
}

async function runApproval(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateApprovalHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list') {
    return bridgeOutput(
      flags,
      options,
      'approval.list',
      parseApprovalList(flags.args.slice(2)),
      formatApprovals
    );
  }
  if (subcommand === 'get') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit approval get <id>');
    return bridgeOutput(flags, options, 'approval.get', { id }, formatGeneric);
  }
  if (subcommand === 'resolve') {
    const id = flags.args[2];
    if (!id) throw usageError('Usage: orbit approval resolve <id>');
    const { note, rest } = await parseNote(flags.args.slice(3), options);
    const input: Record<string, unknown> = { resolution_source: 'cli' };
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i] ?? '';
      if (arg === '--decision')
        input['status'] = normalizeDecision(argvValue(rest, ++i, '--decision'));
      else throw usageError(`Unknown approval resolve option: ${arg}`);
    }
    if (typeof input['status'] !== 'string')
      throw usageError('approval resolve requires --decision');
    if (note) input['resolution_note'] = note;
    return bridgeOutput(flags, options, 'approval.resolve', { id, input }, formatGeneric);
  }
  throw usageError(`Unknown approval subcommand: ${subcommand}`);
}

async function runAutoRunner(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateAutoRunnerHelp();
  const subcommand = flags.args[1];
  let method: string;
  if (subcommand === 'status') method = 'autoRunner.status';
  else if (subcommand === 'start') method = 'autoRunner.start';
  else if (subcommand === 'stop') method = 'autoRunner.stop';
  else throw usageError(`Unknown auto-runner subcommand: ${subcommand}`);
  return bridgeOutput(flags, options, method, {}, formatAutoRunnerStatus);
}

async function runAgent(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateAgentHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list-runs')
    return bridgeOutput(flags, options, 'agent.listRuns', {}, formatGeneric);
  if (subcommand === 'stop') {
    const runId = flags.args[2];
    if (!runId) throw usageError('Usage: orbit agent stop <run-id>');
    return bridgeOutput(flags, options, 'agent.stop', { run_id: runId }, formatGeneric);
  }
  throw usageError(`Unknown agent subcommand: ${subcommand}`);
}

async function parseRunRequestMerge(
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--summary'],
    fileFlags: ['--summary-file', '--file']
  });
  const params: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--run') params['run_id'] = argvValue(rest, ++i, '--run');
    else if (arg === '--task') params['task_uid'] = argvValue(rest, ++i, '--task');
    else throw usageError(`Unknown run request-merge option: ${arg}`);
  }
  params['summary'] = text?.trimEnd() ?? '';
  return params;
}

async function parseRunReportProgress(
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--message'],
    fileFlags: ['--file']
  });
  const params: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--task') params['task_uid'] = argvValue(rest, ++i, '--task');
    else throw usageError(`Unknown run report-progress option: ${arg}`);
  }
  if (typeof params['task_uid'] !== 'string')
    throw usageError('run report-progress requires --task');
  if (!text) throw usageError('run report-progress requires --message, --file, or stdin');
  params['message'] = text.trimEnd();
  return params;
}

async function parseRunEmitInsight(
  args: string[],
  options: CliRunOptions
): Promise<Record<string, unknown>> {
  const { text, rest } = await readLongText(args, options, {
    textFlags: ['--content'],
    fileFlags: ['--file']
  });
  const params: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--run') params['run_id'] = argvValue(rest, ++i, '--run');
    else if (arg === '--task') params['task_uid'] = argvValue(rest, ++i, '--task');
    else if (arg === '--project') params['project_uid'] = argvValue(rest, ++i, '--project');
    else throw usageError(`Unknown run emit-insight option: ${arg}`);
  }
  if (!text) throw usageError('run emit-insight requires --content, --file, or stdin');
  params['content'] = text.trimEnd();
  return params;
}

async function runRun(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateRunHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'request-merge') {
    return bridgeOutput(
      flags,
      options,
      'run.requestMerge',
      await parseRunRequestMerge(flags.args.slice(2), options),
      formatApprovals
    );
  }
  if (subcommand === 'report-progress') {
    return bridgeOutput(
      flags,
      options,
      'run.reportProgress',
      await parseRunReportProgress(flags.args.slice(2), options),
      formatGeneric
    );
  }
  if (subcommand === 'emit-insight') {
    return bridgeOutput(
      flags,
      options,
      'run.emitInsight',
      await parseRunEmitInsight(flags.args.slice(2), options),
      formatGeneric
    );
  }
  throw usageError(`Unknown run subcommand: ${subcommand}`);
}

function unavailableCapture(command: string): never {
  throw unavailableError(
    `orbit ${command} is unavailable: Capture backend is not present in this worktree; phase5-capture owns implementation.`
  );
}

function unavailableMemory(): never {
  throw unavailableError(
    'orbit memory is unavailable: no memory backend is present in this worktree.'
  );
}

async function runUnavailableDomain(
  flags: ParsedGlobalFlags,
  command: string,
  help: () => string
): Promise<string> {
  if (flags.help || !flags.args[1]) return help();
  if (command === 'memory') unavailableMemory();
  unavailableCapture(command);
}

export async function runCli(argv: string[], options: CliRunOptions = {}): Promise<CliExitCode> {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
  let json = false;
  try {
    const flags = parseGlobalFlags(argv);
    json = flags.json;
    const command = flags.args[0];
    if (!command || (flags.help && flags.args.length === 0)) {
      stdout(generateTopLevelHelp());
      return EXIT_SUCCESS;
    }
    let output: string;
    if (command === 'search') output = await runSearch(flags, options);
    else if (command === 'cat') output = await runCat(flags, options);
    else if (command === 'memory')
      output = await runUnavailableDomain(flags, command, generateMemoryHelp);
    else if (command === 'project') output = await runProject(flags, options);
    else if (command === 'task') output = await runTask(flags, options);
    else if (command === 'inbox') output = await runInbox(flags, options);
    else if (command === 'activity') output = await runActivity(flags, options);
    else if (command === 'approval') output = await runApproval(flags, options);
    else if (command === 'auto-runner') output = await runAutoRunner(flags, options);
    else if (command === 'agent') output = await runAgent(flags, options);
    else if (command === 'run') output = await runRun(flags, options);
    else if (command === 'feed')
      output = await runUnavailableDomain(flags, command, generateFeedHelp);
    else if (command === 'library')
      output = await runUnavailableDomain(flags, command, generateLibraryHelp);
    else if (command === 'thought')
      output = await runUnavailableDomain(flags, command, generateThoughtHelp);
    else throw usageError(`Unknown command: ${command}`, 'unknown_command');
    stdout(output);
    return EXIT_SUCCESS;
  } catch (error) {
    const normalized = normalizeCliError(error);
    if (json) stderr(formatJsonError(errorPayload(normalized)));
    else stderr(`${normalized.code}: ${normalized.message}\n`);
    return normalized.exitCode;
  }
}
