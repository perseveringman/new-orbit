import { normalizeTaskStatus } from '@shared/schemas';
import type { SearchHit } from '@shared/types';
import type { TaskRecord } from '@shared/schemas';
import type { DependencyTreeNode } from '../main/dependencies';
import type { ReadyResult } from '../main/auto_runner/ready_set';
import { SocketBridgeClient, type BridgeClient } from './bridge';
import { EXIT_SUCCESS, normalizeCliError, usageError, type CliExitCode } from './errors';
import { errorPayload } from './errors';
import { formatJsonError, formatJsonSuccess } from './output';
import {
  generateCatHelp,
  generateSearchHelp,
  generateTaskHelp,
  generateTopLevelHelp,
  generateUnavailableHelp
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
  bridge?: BridgeClient;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

const FUTURE_COMMANDS = new Set([
  'project',
  'inbox',
  'feed',
  'library',
  'thought',
  'activity',
  'memory',
  'approval',
  'auto-runner',
  'agent',
  'run'
]);

function parseGlobalFlags(argv: string[]): ParsedGlobalFlags {
  const rest: string[] = [];
  let json = false;
  let help = false;
  let socketPath: string | undefined;
  let vaultPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--socket') {
      const value = argv[++i];
      if (!value) throw usageError('--socket requires a path');
      socketPath = value;
    } else if (arg === '--vault') {
      const value = argv[++i];
      if (!value) throw usageError('--vault requires a path');
      vaultPath = value;
    } else rest.push(arg);
  }
  return { json, help, socketPath, vaultPath, args: rest };
}

function parseLimit(args: string[], fallback = 30): { limit: number; rest: string[] } {
  const rest: string[] = [];
  let limit = fallback;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--limit') {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!raw || !Number.isInteger(parsed) || parsed <= 0)
        throw usageError('--limit requires a positive integer');
      limit = parsed;
    } else rest.push(arg);
  }
  return { limit, rest };
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
  return [
    `${task.uid ?? task.id}\t${task.title}`,
    `status\t${task.status}`,
    `ready\t${readiness?.ready ? 'yes' : 'no'}`,
    readiness?.reason ? `reason\t${readiness.reason}` : '',
    readiness?.detail ? `detail\t${readiness.detail}` : '',
    `depends_on\t${(task.depends_on ?? []).join(',') || '-'}`
  ]
    .filter(Boolean)
    .join('\n') + '\n';
}

function formatDependencyTree(data: unknown): string {
  const root = data as DependencyTreeNode;
  const lines: string[] = [];
  function walk(node: DependencyTreeNode, depth: number): void {
    const title = node.task?.title ? ` ${node.task.title}` : '';
    lines.push(`${'  '.repeat(depth)}${depth === 0 ? '' : '↳ '}${node.uid} [${node.status}]${title}`);
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(root, 0);
  return `${lines.join('\n')}\n`;
}

async function runSearch(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help) return generateSearchHelp();
  const { limit, rest } = parseLimit(flags.args.slice(1));
  const query = rest.join(' ').trim();
  if (!query) throw usageError('Usage: orbit search <query> [--limit N]');
  const data = await createBridge(flags, options).request('search', { query, limit });
  return flags.json ? formatJsonSuccess(data) : formatSearchHits(data);
}

async function runCat(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help) return generateCatHelp();
  const target = flags.args[1];
  if (!target) throw usageError('Usage: orbit cat <path-or-uid>');
  const data = await createBridge(flags, options).request('cat', { target });
  return flags.json ? formatJsonSuccess(data) : formatCat(data);
}

function parseTaskList(args: string[]): { status?: string; project_uid?: string } {
  const filter: { status?: string; project_uid?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--status') {
      const value = argvValue(args, ++i, '--status');
      const status = normalizeTaskStatus(value);
      if (!status) throw usageError(`Unknown task status: ${value}`);
      filter.status = status;
    } else if (arg === '--project') {
      filter.project_uid = argvValue(args, ++i, '--project');
    } else {
      throw usageError(`Unknown task list option: ${arg}`);
    }
  }
  return filter;
}

function parseTaskUpdate(
  uid: string,
  args: string[]
): { uid: string; status?: string; depends_on?: string[] } {
  const patch: { uid: string; status?: string; depends_on?: string[] } = { uid };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--status') {
      const value = argvValue(args, ++i, '--status');
      const status = normalizeTaskStatus(value);
      if (!status) throw usageError(`Unknown task status: ${value}`);
      patch.status = status;
    } else if (arg === '--depends-on') {
      const value = argvValue(args, ++i, '--depends-on');
      patch.depends_on = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else {
      throw usageError(`Unknown task update option: ${arg}`);
    }
  }
  return patch;
}

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}

async function runTask(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateTaskHelp();
  const subcommand = flags.args[1];
  if (subcommand === 'list') {
    const filter = parseTaskList(flags.args.slice(2));
    const data = await createBridge(flags, options).request('task.list', filter);
    return flags.json ? formatJsonSuccess(data) : formatTasks(data);
  }
  if (subcommand === 'get') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task get <uid>');
    const data = await createBridge(flags, options).request('task.get', { uid });
    return flags.json ? formatJsonSuccess(data) : formatTaskGet(data);
  }
  if (subcommand === 'deps') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task deps <uid>');
    const data = await createBridge(flags, options).request('task.deps', { uid });
    return flags.json ? formatJsonSuccess(data) : formatDependencyTree(data);
  }
  if (subcommand === 'update') {
    const uid = flags.args[2];
    if (!uid) throw usageError('Usage: orbit task update <uid> [--status S] [--depends-on a,b]');
    const data = await createBridge(flags, options).request(
      'task.update',
      parseTaskUpdate(uid, flags.args.slice(3))
    );
    return flags.json ? formatJsonSuccess(data) : formatTasks([data]);
  }
  throw usageError(`orbit task ${subcommand} is not implemented`);
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
    else if (command === 'task') output = await runTask(flags, options);
    else if (FUTURE_COMMANDS.has(command)) {
      if (flags.help) output = generateUnavailableHelp(command);
      else throw usageError(`orbit ${command} is unavailable in Phase 0`, 'command_unavailable');
    } else throw usageError(`Unknown command: ${command}`, 'unknown_command');
    stdout(output);
    return EXIT_SUCCESS;
  } catch (error) {
    const normalized = normalizeCliError(error);
    if (json) stderr(formatJsonError(errorPayload(normalized)));
    else stderr(`${normalized.code}: ${normalized.message}\n`);
    return normalized.exitCode;
  }
}
