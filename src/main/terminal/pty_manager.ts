import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { LIMITS } from '@shared/limits';
import { createShellReadyScanner } from '../agent/shell/osc133';

export interface OpenSessionArgs {
  cwd: string;
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  initialCommand?: string;
  agentLaunch?: {
    launcherCommand: string;
    prompt: string;
  };
}

export interface SessionInfo {
  id: string;
  pid: number;
  cwd: string;
  shell: string;
  createdAt: string;
  paneId?: string;
  projectUid?: string;
  projectSlug?: string;
}

export type PtyEvent = 'data' | 'exit';
export interface ExitPayload {
  exitCode: number;
  signal?: number;
  paneId?: string;
  projectUid?: string;
  projectSlug?: string;
}

type DataListener = (id: string, payload: string) => void;
type ExitListener = (id: string, payload: ExitPayload) => void;

interface PtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (d: string) => void): { dispose(): void } | void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void } | void;
}

interface SessionEntry {
  info: SessionInfo;
  pty: PtyProcess;
  logStream: fs.WriteStream;
  logPath: string;
  logBytes: number;
  vaultRoot: string;
}

const LOG_ROTATE_BYTES = 5 * 1024 * 1024;

const sessions = new Map<string, SessionEntry>();
const dataListeners = new Set<DataListener>();
const exitListeners = new Set<ExitListener>();

let vaultRootGuard: string | null = null;

export function setVaultRoot(root: string | null): void {
  vaultRootGuard = root;
}

/** Returns true when the native node-pty binary is loadable in the host runtime. */
export function canLoadNodePty(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node-pty');
    return true;
  } catch {
    return false;
  }
}

function loadPty(): typeof import('node-pty') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node-pty');
}

function normalizeNodePtyAssetPath(p: string): string {
  return p
    .replace('app.asar', 'app.asar.unpacked')
    .replace('node_modules.asar', 'node_modules.asar.unpacked');
}

function nodePtySpawnHelperCandidates(): string[] {
  const out = new Set<string>();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { loadNativeModule } = require('node-pty/lib/utils') as {
      loadNativeModule(name: string): { dir: string };
    };
    const native = loadNativeModule('pty');
    const unixTerminalDir = path.dirname(require.resolve('node-pty/lib/unixTerminal.js'));
    out.add(normalizeNodePtyAssetPath(path.resolve(unixTerminalDir, native.dir, 'spawn-helper')));
  } catch {
    /* ignore */
  }

  try {
    const pkgRoot = path.dirname(require.resolve('node-pty/package.json'));
    out.add(normalizeNodePtyAssetPath(path.join(pkgRoot, 'build', 'Release', 'spawn-helper')));
    out.add(
      normalizeNodePtyAssetPath(
        path.join(pkgRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
      )
    );
  } catch {
    /* ignore */
  }

  return Array.from(out);
}

function ensureNodePtySpawnHelperExecutable(): void {
  if (process.platform === 'win32') return;
  for (const helperPath of nodePtySpawnHelperCandidates()) {
    if (!fs.existsSync(helperPath)) continue;
    const stat = fs.statSync(helperPath);
    if (!stat.isFile()) continue;
    if ((stat.mode & 0o111) === 0o111) continue;
    fs.chmodSync(helperPath, stat.mode | 0o111);
  }
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env['COMSPEC'] || 'powershell.exe';
  return process.env['SHELL'] || '/bin/zsh';
}

function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function logDir(root: string): string {
  return path.join(root, '.orbit', 'logs');
}

function logFilePath(root: string, id: string): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return path.join(logDir(root), `term-${id}-${yyyy}${mm}${dd}.log`);
}

function normalizeInitialCommand(command: string): string {
  return command.endsWith('\n') ? command : `${command}\n`;
}

function createOutputSettledScanner(idleMs: number, timeoutMs: number): {
  push(data: string): void;
  ready: Promise<boolean>;
  cancel(): void;
} {
  let done = false;
  let sawOutput = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveReady: (value: boolean) => void = () => undefined;

  function finish(value: boolean): void {
    if (done) return;
    done = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    resolveReady(value);
  }

  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
    timeoutTimer = setTimeout(() => finish(true), timeoutMs);
  });

  return {
    push(data) {
      if (done || data.length === 0) return;
      sawOutput = true;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (sawOutput) finish(true);
      }, idleMs);
    },
    ready,
    cancel() {
      finish(false);
    }
  };
}

function rotateIfNeeded(entry: SessionEntry): void {
  if (entry.logBytes < LOG_ROTATE_BYTES) return;
  try {
    entry.logStream.end();
  } catch {
    /* ignore */
  }
  const rotated = `${entry.logPath}.1`;
  try {
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(entry.logPath, rotated);
  } catch {
    /* ignore */
  }
  entry.logStream = fs.createWriteStream(entry.logPath, { flags: 'a' });
  entry.logBytes = 0;
}

export async function openSession(args: OpenSessionArgs): Promise<SessionInfo> {
  if (sessions.size >= LIMITS.MAX_CONCURRENT_PTYS) {
    throw new Error(`too many terminal sessions (limit ${LIMITS.MAX_CONCURRENT_PTYS})`);
  }
  const absCwd = path.resolve(args.cwd);
  if (!fs.existsSync(absCwd)) throw new Error(`cwd does not exist: ${absCwd}`);
  const stat = await fsp.stat(absCwd);
  if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${absCwd}`);
  if (vaultRootGuard) {
    const rootAbs = path.resolve(vaultRootGuard);
    if (absCwd !== rootAbs && !isPathInside(absCwd, rootAbs)) {
      throw new Error(`cwd escapes vault: ${absCwd}`);
    }
  }

  const shell = args.shell || defaultShell();
  const cols = Math.max(10, args.cols ?? 80);
  const rows = Math.max(5, args.rows ?? 24);

  const mergedEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(args.env ?? {}),
    TERM: 'xterm-256color',
    PWD: absCwd,
    COLORTERM: 'truecolor'
  };

  const id = nanoid(10);
  ensureNodePtySpawnHelperExecutable();
  const pty = loadPty();
  let proc: PtyProcess;
  try {
    proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cwd: absCwd,
      env: mergedEnv,
      cols,
      rows
    }) as unknown as PtyProcess;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to spawn terminal shell ${shell}: ${message}`);
  }

  const root = vaultRootGuard ?? absCwd;
  ensureDir(logDir(root));
  const lp = logFilePath(root, id);
  const stream = fs.createWriteStream(lp, { flags: 'a' });
  stream.on('error', () => {
    /* log rotation / fs races can drop writes; terminal itself stays alive. */
  });

  const info: SessionInfo = {
    id,
    pid: proc.pid,
    cwd: absCwd,
    shell,
    createdAt: new Date().toISOString(),
    ...(typeof args.env?.['ORBIT_PANE_ID'] === 'string'
      ? { paneId: args.env['ORBIT_PANE_ID'] }
      : {}),
    ...(typeof args.env?.['ORBIT_PROJECT_UID'] === 'string'
      ? { projectUid: args.env['ORBIT_PROJECT_UID'] }
      : {}),
    ...(typeof args.env?.['ORBIT_PROJECT_SLUG'] === 'string'
      ? { projectSlug: args.env['ORBIT_PROJECT_SLUG'] }
      : {})
  };

  const entry: SessionEntry = {
    info,
    pty: proc,
    logStream: stream,
    logPath: lp,
    logBytes: 0,
    vaultRoot: root
  };
  sessions.set(id, entry);

  const shellReady =
    args.initialCommand?.trim() || args.agentLaunch?.launcherCommand?.trim()
      ? createShellReadyScanner(LIMITS.SHELL_READY_TIMEOUT_MS)
      : null;
  const agentReady =
    args.agentLaunch?.launcherCommand?.trim() && args.agentLaunch.prompt.trim()
      ? createOutputSettledScanner(700, LIMITS.SHELL_READY_TIMEOUT_MS)
      : null;

  proc.onData((data: string) => {
    // If the session has already been reaped (kill, exit, or test cleanup)
    // silently drop stragglers — the pty process may still emit a few bytes.
    if (!sessions.has(id)) return;
    try {
      if (!entry.logStream.destroyed && entry.logStream.writable) {
        entry.logStream.write(data);
        entry.logBytes += Buffer.byteLength(data);
        rotateIfNeeded(entry);
      }
    } catch {
      /* ignore */
    }
    shellReady?.push(data);
    agentReady?.push(data);
    for (const l of dataListeners) {
      try {
        l(id, data);
      } catch {
        /* ignore */
      }
    }
  });

  proc.onExit(({ exitCode, signal }) => {
    shellReady?.cancel();
    agentReady?.cancel();
    for (const l of exitListeners) {
      try {
        l(id, {
          exitCode,
          signal,
          ...(info.paneId ? { paneId: info.paneId } : {}),
          ...(info.projectUid ? { projectUid: info.projectUid } : {}),
          ...(info.projectSlug ? { projectSlug: info.projectSlug } : {})
        });
      } catch {
        /* ignore */
      }
    }
    const e = sessions.get(id);
    if (e) {
      try {
        e.logStream.end();
      } catch {
        /* ignore */
      }
      sessions.delete(id);
    }
  });

  if (shellReady && args.initialCommand) {
    void shellReady.ready.then(() => {
      if (!sessions.has(id)) return;
      proc.write(normalizeInitialCommand(args.initialCommand!));
    });
  }

  if (shellReady && args.agentLaunch?.launcherCommand?.trim()) {
    void shellReady.ready.then(() => {
      if (!sessions.has(id)) return;
      proc.write(normalizeInitialCommand(args.agentLaunch!.launcherCommand));
      if (!agentReady || !args.agentLaunch?.prompt.trim()) return;
      void agentReady.ready.then((ready) => {
        if (!ready || !sessions.has(id)) return;
        proc.write(normalizeInitialCommand(args.agentLaunch!.prompt));
      });
    });
  }

  return info;
}

export function write(id: string, data: string): void {
  const e = sessions.get(id);
  if (!e) return;
  e.pty.write(data);
}

export function resize(id: string, cols: number, rows: number): void {
  const e = sessions.get(id);
  if (!e) return;
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  try {
    e.pty.resize(c, r);
  } catch {
    /* ignore resize races */
  }
}

export async function kill(id: string, signal: string = 'SIGTERM'): Promise<void> {
  const e = sessions.get(id);
  if (!e) return;
  try {
    e.pty.kill(signal);
  } catch {
    /* ignore */
  }
  try {
    e.logStream.end();
  } catch {
    /* ignore */
  }
  sessions.delete(id);
}

export function list(): SessionInfo[] {
  return Array.from(sessions.values()).map((e) => e.info);
}

export function on(event: 'data', cb: DataListener): () => void;
export function on(event: 'exit', cb: ExitListener): () => void;
export function on(event: PtyEvent, cb: DataListener | ExitListener): () => void {
  if (event === 'data') {
    dataListeners.add(cb as DataListener);
    return () => dataListeners.delete(cb as DataListener);
  }
  exitListeners.add(cb as ExitListener);
  return () => exitListeners.delete(cb as ExitListener);
}

export async function killAll(): Promise<void> {
  const ids = Array.from(sessions.keys());
  await Promise.all(ids.map((id) => kill(id)));
}

/** Test-only helper: returns the on-disk log path for an active session. */
export function _logPathForTest(id: string): string | null {
  return sessions.get(id)?.logPath ?? null;
}
