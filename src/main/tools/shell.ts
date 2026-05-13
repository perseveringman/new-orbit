import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  AuthorityPermission,
  AuthorityRequest,
  AuthorityRiskLevel
} from '@shared/authority';
import { currentSession } from '../fs';
import { assertInsideVault, isInsideRoot } from '../pathGuard';
import { authorityBlockedResult, evaluateVaultAuthority } from '../authority/runtime';
import { cliServerError } from '../cli_server/errors';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 30_000;

interface ShellRunParams {
  command?: unknown;
  cwd?: unknown;
  max_seconds?: unknown;
  intent?: unknown;
}

interface ShellClassification {
  risk: AuthorityRiskLevel;
  permissions: AuthorityPermission[];
  summary: string;
}

export async function runShellTool(rawParams: unknown): Promise<unknown> {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  const params = asShellRunParams(rawParams);
  const command = parseCommand(params.command);
  const cwd = resolveCwd(session.vault, params.cwd);
  const timeoutMs = parseTimeout(params.max_seconds);
  const classification = classifyCommand(command, cwd, session.vault);
  const request: AuthorityRequest = {
    toolFamily: 'shell',
    toolName: 'orbit_shell_run',
    cwd,
    command,
    permissions: classification.permissions,
    risk: classification.risk,
    summary: params.intent ? `${String(params.intent)} (${classification.summary})` : classification.summary
  };
  const decision = await evaluateVaultAuthority(session.vault, request);
  if (decision.effect !== 'allow') {
    return authorityBlockedResult(request, decision);
  }

  const result = await spawnBounded(command, cwd, timeoutMs);
  return {
    ok: result.exitCode === 0,
    command,
    cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
    authority: decision
  };
}

function asShellRunParams(rawParams: unknown): ShellRunParams {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    throw cliServerError('invalid_params', 'shell.run params must be an object');
  }
  return rawParams as ShellRunParams;
}

function parseCommand(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw cliServerError('invalid_params', 'command must be a non-empty argv array');
  }
  const command = value.map((part) => {
    if (typeof part !== 'string' || part.trim() === '') {
      throw cliServerError('invalid_params', 'command entries must be non-empty strings');
    }
    return part;
  });
  if (command.some((part) => /[\0]/.test(part))) {
    throw cliServerError('invalid_params', 'command entries cannot contain NUL bytes');
  }
  return command;
}

function parseTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw cliServerError('invalid_params', 'max_seconds must be a positive number');
  }
  return Math.min(Math.round(seconds * 1000), MAX_TIMEOUT_MS);
}

function resolveCwd(vaultPath: string, rawCwd: unknown): string {
  if (rawCwd === undefined || rawCwd === null || rawCwd === '') return vaultPath;
  if (typeof rawCwd !== 'string') {
    throw cliServerError('invalid_params', 'cwd must be a string when provided');
  }
  if (path.isAbsolute(rawCwd)) return path.resolve(rawCwd);
  return assertInsideVault(vaultPath, rawCwd);
}

function classifyCommand(command: string[], cwd: string, vaultPath: string): ShellClassification {
  const executable = path.basename(command[0]).toLowerCase();
  const args = command.slice(1);
  const outsideVault = !isInsideRoot(vaultPath, cwd) || commandTouchesOutsideVault(command, vaultPath, cwd);
  const touchesSecrets = command.some((part) => /(^|[/\\])\.env(\.|$|[/\\])|id_rsa|id_ed25519|\.ssh[/\\]/i.test(part));
  const hasShellSyntax = command.some((part) => /[|;&<>`$()]/.test(part));
  const dangerousExecutables = new Set(['sudo', 'su', 'doas', 'launchctl', 'security']);
  const secretExecutables = new Set(['env', 'printenv', 'op', 'pass']);

  if (dangerousExecutables.has(executable)) {
    return {
      risk: 'L5_dangerous_elevated',
      permissions: ['elevated'],
      summary: `elevated command: ${command.join(' ')}`
    };
  }
  if (touchesSecrets || secretExecutables.has(executable)) {
    return {
      risk: 'L5_dangerous_elevated',
      permissions: ['secrets'],
      summary: `secret-sensitive command: ${command.join(' ')}`
    };
  }
  if (isBroadDeletion(executable, args, vaultPath, cwd)) {
    return {
      risk: 'L5_dangerous_elevated',
      permissions: ['elevated'],
      summary: `broad deletion command: ${command.join(' ')}`
    };
  }
  if (hasShellSyntax) {
    return {
      risk: 'L3_layer1_direct_write',
      permissions: outsideVault ? ['read', 'write_worktree'] : ['read'],
      summary: `shell syntax-like command argument: ${command.join(' ')}`
    };
  }
  if (isExternalSideEffect(executable, args)) {
    return {
      risk: 'L4_external_side_effect',
      permissions: ['external_submit'],
      summary: `external side-effect command: ${command.join(' ')}`
    };
  }
  if (isMutatingCommand(executable, args)) {
    return {
      risk: outsideVault ? 'L3_layer1_direct_write' : 'L2_reversible_draft',
      permissions: outsideVault ? ['write_worktree'] : ['write_sandbox'],
      summary: `mutating command: ${command.join(' ')}`
    };
  }
  if (outsideVault) {
    return {
      risk: 'L3_layer1_direct_write',
      permissions: ['read'],
      summary: `external filesystem command: ${command.join(' ')}`
    };
  }
  return {
    risk: 'L1_bounded_local',
    permissions: ['read'],
    summary: `bounded local command: ${command.join(' ')}`
  };
}

function commandTouchesOutsideVault(command: string[], vaultPath: string, cwd: string): boolean {
  return command.some((part) => {
    if (!path.isAbsolute(part)) return false;
    const abs = path.resolve(cwd, part);
    return !isInsideRoot(vaultPath, abs);
  });
}

function isExternalSideEffect(executable: string, args: string[]): boolean {
  if (executable === 'git' && ['push', 'pull', 'fetch'].includes(args[0] ?? '')) return true;
  if (['curl', 'wget', 'ssh', 'scp', 'rsync'].includes(executable)) return true;
  if (executable === 'gh' && ['pr', 'issue', 'release', 'repo'].includes(args[0] ?? '')) return true;
  return false;
}

function isMutatingCommand(executable: string, args: string[]): boolean {
  if (['rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'tee', 'chmod', 'chown'].includes(executable)) return true;
  if (['sed', 'perl', 'ruby', 'python', 'python3', 'node'].includes(executable) && args.includes('-i')) return true;
  if (executable === 'git' && ['add', 'commit', 'merge', 'rebase', 'reset', 'checkout', 'switch', 'restore'].includes(args[0] ?? '')) return true;
  if (executable === 'npm' && ['install', 'i', 'add', 'update', 'audit'].includes(args[0] ?? '')) return true;
  if (executable === 'pnpm' && ['install', 'add', 'update'].includes(args[0] ?? '')) return true;
  if (executable === 'yarn' && ['install', 'add', 'upgrade'].includes(args[0] ?? '')) return true;
  return false;
}

function isBroadDeletion(executable: string, args: string[], vaultPath: string, cwd: string): boolean {
  if (executable !== 'rm') return false;
  const recursiveForce = args.some((arg) => /^-[a-zA-Z]*r[a-zA-Z]*f|^-[a-zA-Z]*f[a-zA-Z]*r/.test(arg));
  if (!recursiveForce) return false;
  return args.some((arg) => {
    if (arg.startsWith('-')) return false;
    const abs = path.isAbsolute(arg) ? path.resolve(arg) : path.resolve(cwd, arg);
    return abs === path.parse(abs).root || !isInsideRoot(vaultPath, abs);
  });
}

function spawnBounded(
  command: string[],
  cwd: string,
  timeoutMs: number
): Promise<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const child = spawn(command[0], command.slice(1), {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      const next = chunk.toString('utf8');
      if (stdout.length + next.length > MAX_OUTPUT_CHARS) {
        stdout += next.slice(0, Math.max(0, MAX_OUTPUT_CHARS - stdout.length));
        truncated = true;
      } else {
        stdout += next;
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const next = chunk.toString('utf8');
      if (stderr.length + next.length > MAX_OUTPUT_CHARS) {
        stderr += next.slice(0, Math.max(0, MAX_OUTPUT_CHARS - stderr.length));
        truncated = true;
      } else {
        stderr += next;
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        timedOut,
        stdout,
        stderr,
        truncated
      });
    });
  });
}
