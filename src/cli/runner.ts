import { normalizeTaskStatus } from '@shared/schemas';
import type { SearchHit } from '@shared/types';
import type { TaskRecord } from '@shared/schemas';
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

function argvValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw usageError(`${flag} requires a value`);
  return value;
}

async function runTask(flags: ParsedGlobalFlags, options: CliRunOptions): Promise<string> {
  if (flags.help || !flags.args[1]) return generateTaskHelp();
  const subcommand = flags.args[1];
  if (subcommand !== 'list')
    throw usageError(`orbit task ${subcommand} is not implemented in Phase 0`);
  const filter = parseTaskList(flags.args.slice(2));
  const data = await createBridge(flags, options).request('task.list', filter);
  return flags.json ? formatJsonSuccess(data) : formatTasks(data);
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
