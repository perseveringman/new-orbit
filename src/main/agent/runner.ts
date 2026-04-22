import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { promises as fs, createWriteStream, WriteStream } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';
import {
  ORBIT_HOOK_PORT_ENV,
  ORBIT_HOOK_TOKEN_ENV,
  ORBIT_HOOK_VERSION_ENV,
  ORBIT_RUN_ID_ENV,
  ORBIT_VENDOR_ENV,
  ORBIT_WORKTREE_ID_ENV
} from '@shared/protocol';
import type {
  AgentCostTally,
  AgentEvent,
  AgentEventKind,
  RunStatus,
  RunSummary
} from '@shared/agent';
import { parseHydrationLine, parseToolInvocationLine } from './context';
import { LIMITS } from '@shared/limits';
import { renderClaudeSettingsJson, renderNotifyShTemplate } from './hooks/template';
import { createRingBufferStore } from './ringBuffer';
import { readLogForReattach } from './reattach';

export interface SpawnOpts {
  /** Absolute path to the `claude` binary. */
  claudePath: string;
  /** Prompt text passed via `-p <prompt>`. */
  prompt: string;
  /** Working directory — vault root or a worktree path. */
  cwd: string;
  /** Optional API key to inject via `ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Extra env vars merged into the child process env. */
  extraEnv?: Record<string, string>;
  /** Optional hook server config for lifecycle callbacks. */
  hookConfig?: {
    port: number;
    token: string;
    version: number;
    vendor?: 'claude' | 'codex' | 'generic';
    worktreeId?: string;
  };
  /** Logical task ID for bookkeeping. `null` for free-form runs. */
  taskId: string | null;
  /** Short display title surfaced in the renderer. */
  title?: string;
  /** Vault root. Logs + active-pid book live under `<vault>/.orbit`. */
  vaultPath: string;
  /** 10-minute idle timeout override (ms). */
  idleTimeoutMs?: number;
  /**
   * Hydration resolver. Called when the subprocess emits
   * `@orbit:search <query>`. Should return a plain-text reply that will
   * be fed back into stdin.
   */
  hydrate?: (query: string) => Promise<string>;
  /**
   * R6: Tool invocation resolver. Called when the subprocess emits
   * `@orbit:tool:<name> <json>`. Should return a plain-text reply that
   * will be fed back into stdin (typically the MCP tool result JSON).
   */
  onToolInvocation?: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Test hook to replace child_process.spawn. */
  spawner?: typeof spawn;
}

export interface RunnerSnapshot {
  summary: RunSummary;
  events: AgentEvent[];
  tally: AgentCostTally;
}

interface ActiveRunMeta {
  pid: number;
  cwd: string;
  taskId: string | null;
  title?: string;
  startedAt: string;
}

export interface ReattachedRunSnapshot {
  summary: RunSummary;
  events: AgentEvent[];
  pid: number | null;
  terminated: boolean;
  logPath: string;
}

const MAX_EVENTS = 500;
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const ringStore = createRingBufferStore(LIMITS.AGENT_EVENT_RING_CAPACITY);

// --- active pid bookkeeping (kill-reconcile) ---------------------------------

function activeFile(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, ORBIT_LOGS_DIR, '_active.json');
}

async function readActive(vaultPath: string): Promise<Record<string, ActiveRunMeta>> {
  try {
    const raw = await fs.readFile(activeFile(vaultPath), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, number | ActiveRunMeta>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, ActiveRunMeta> = {};
    for (const [runId, value] of Object.entries(parsed)) {
      if (typeof value === 'number') {
        out[runId] = {
          pid: value,
          cwd: vaultPath,
          taskId: null,
          startedAt: new Date().toISOString()
        };
        continue;
      }
      if (value && typeof value === 'object' && typeof value.pid === 'number') {
        out[runId] = {
          pid: value.pid,
          cwd: typeof value.cwd === 'string' ? value.cwd : vaultPath,
          taskId: typeof value.taskId === 'string' ? value.taskId : null,
          title: typeof value.title === 'string' ? value.title : undefined,
          startedAt:
            typeof value.startedAt === 'string' ? value.startedAt : new Date().toISOString()
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeActive(
  vaultPath: string,
  map: Record<string, ActiveRunMeta>
): Promise<void> {
  const f = activeFile(vaultPath);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf8');
  await fs.rename(tmp, f);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * On app startup, reconcile `_active.json` against the event logs. Runs with a
 * terminal event are kept as historical snapshots; runs without a terminal
 * event are surfaced as `running` while the pid is still alive, otherwise
 * `error` with reason `interrupted`.
 */
export async function reconcileOrphans(vaultPath: string): Promise<ReattachedRunSnapshot[]> {
  const map = await readActive(vaultPath);
  const snapshots: ReattachedRunSnapshot[] = [];
  const next: Record<string, ActiveRunMeta> = {};
  for (const [runId, meta] of Object.entries(map)) {
    const alive = isAlive(meta.pid);
    const reattached = await readLogForReattach({ vaultPath, runId });
    const last = reattached.events[reattached.events.length - 1];
    const terminated = reattached.terminated || !alive;
    const summary: RunSummary = {
      runId,
      taskId: meta.taskId,
      status: reattached.terminated ? (last?.kind === 'error' ? 'error' : 'done') : alive ? 'running' : 'error',
      startedAt: meta.startedAt,
      cwd: meta.cwd,
      title: meta.title
    };
    if (terminated) {
      summary.endedAt = last?.at ?? new Date().toISOString();
      summary.reason = reattached.terminated ? last?.text : 'interrupted';
    } else {
      next[runId] = meta;
    }
    snapshots.push({
      summary,
      events: reattached.events,
      pid: alive ? meta.pid : null,
      terminated,
      logPath: reattached.logPath
    });
  }
  await writeActive(vaultPath, next);
  return snapshots;
}

// --- stream-JSON parsing -----------------------------------------------------

async function ensureClaudeHookFiles(
  cwd: string,
  runId: string,
  hookConfig: NonNullable<SpawnOpts['hookConfig']>
): Promise<void> {
  if (hookConfig.vendor && hookConfig.vendor !== 'claude') return;
  const hookRoot = path.join(cwd, ORBIT_DIR, 'hooks', runId);
  await fs.mkdir(hookRoot, { recursive: true });
  const scriptPath = path.join(hookRoot, 'notify.sh');
  await fs.writeFile(
    scriptPath,
    renderNotifyShTemplate({
      hookPort: hookConfig.port,
      hookToken: hookConfig.token,
      hookVersion: hookConfig.version,
      runId,
      worktreeId: hookConfig.worktreeId,
      vendor: hookConfig.vendor ?? 'claude'
    }),
    'utf8'
  );
  await fs.chmod(scriptPath, 0o700);

  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  await fs.mkdir(claudeDir, { recursive: true });

  const generated = JSON.parse(
    renderClaudeSettingsJson({
      hookPort: hookConfig.port,
      hookToken: hookConfig.token,
      hookVersion: hookConfig.version,
      runId,
      worktreeId: hookConfig.worktreeId,
      vendor: hookConfig.vendor ?? 'claude',
      scriptPath
    })
  ) as { hooks?: Record<string, unknown[]> };

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const existingHooks =
    existing.hooks && typeof existing.hooks === 'object'
      ? (existing.hooks as Record<string, unknown[]>)
      : {};
  const nextHooks: Record<string, unknown[]> = { ...existingHooks };
  for (const [name, entries] of Object.entries(generated.hooks ?? {})) {
    nextHooks[name] = Array.isArray(entries) ? entries : [];
  }
  await fs.writeFile(
    settingsPath,
    JSON.stringify({ ...existing, hooks: nextHooks }, null, 2) + '\n',
    'utf8'
  );
}

interface RawEventShape {
  type?: string;
  role?: string;
  content?: unknown;
  text?: unknown;
  name?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/**
 * Map a raw JSON object emitted by Claude Code's stream-json output into
 * our canonical `AgentEvent` shape. Unknown shapes fall through as `text`.
 */
export function mapStreamJson(raw: unknown, idx: number): AgentEvent {
  const at = new Date().toISOString();
  if (!raw || typeof raw !== 'object') {
    return { idx, at, kind: 'text', text: String(raw ?? '') };
  }
  const r = raw as RawEventShape;
  const t = typeof r.type === 'string' ? r.type : '';
  const kind = toKind(t, r);
  const base: AgentEvent = { idx, at, kind, data: raw };
  if (kind === 'message' || kind === 'text' || kind === 'thinking') {
    base.text = extractText(r);
  }
  if (kind === 'tool_use' || kind === 'tool_result') {
    if (typeof r.name === 'string') base.toolName = r.name;
  }
  if (kind === 'cost' || r.usage || typeof r.total_cost_usd === 'number') {
    const u = r.usage ?? {};
    base.kind = 'cost';
    if (typeof (r.input_tokens ?? u.input_tokens) === 'number') {
      base.input_tokens = r.input_tokens ?? u.input_tokens;
    }
    if (typeof (r.output_tokens ?? u.output_tokens) === 'number') {
      base.output_tokens = r.output_tokens ?? u.output_tokens;
    }
    if (typeof (r.cache_read_input_tokens ?? u.cache_read_input_tokens) === 'number') {
      base.cache_read_input_tokens =
        r.cache_read_input_tokens ?? u.cache_read_input_tokens;
    }
    if (
      typeof (r.cache_creation_input_tokens ?? u.cache_creation_input_tokens) === 'number'
    ) {
      base.cache_creation_input_tokens =
        r.cache_creation_input_tokens ?? u.cache_creation_input_tokens;
    }
    if (typeof r.total_cost_usd === 'number') base.total_cost_usd = r.total_cost_usd;
  }
  return base;
}

function toKind(type: string, r: RawEventShape): AgentEventKind {
  const t = type.toLowerCase();
  if (t === 'message' || t === 'assistant' || r.role === 'assistant') return 'message';
  if (t === 'tool_use' || t === 'tool_call') return 'tool_use';
  if (t === 'tool_result') return 'tool_result';
  if (t === 'thinking') return 'thinking';
  if (t === 'result' || t === 'summary' || t === 'cost' || t === 'usage') return 'cost';
  if (t === 'error') return 'error';
  if (t === 'done' || t === 'stop' || t === 'finish') return 'done';
  return 'text';
}

function extractText(r: RawEventShape): string {
  if (typeof r.text === 'string') return r.text;
  const c = r.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'text' in p) {
          const t = (p as { text?: unknown }).text;
          return typeof t === 'string' ? t : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

// --- runner ------------------------------------------------------------------

export class AgentRunner extends EventEmitter {
  readonly runId: string;
  private readonly opts: SpawnOpts;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuf = '';
  private stderrBuf = '';
  private events: AgentEvent[] = [];
  private tally: AgentCostTally = {};
  private status: RunStatus = 'starting';
  private startedAt = new Date().toISOString();
  private endedAt?: string;
  private exitCode: number | null | undefined;
  private reason?: string;
  private idleTimer: NodeJS.Timeout | null = null;
  private logStream: WriteStream | null = null;
  private eventLogStream: WriteStream | null = null;
  private eventIdx = 0;
  private fallbackPlain = false;

  constructor(opts: SpawnOpts) {
    super();
    this.opts = opts;
    this.runId = nanoid(12);
  }

  get summary(): RunSummary {
    const out: RunSummary = {
      runId: this.runId,
      taskId: this.opts.taskId,
      status: this.status,
      startedAt: this.startedAt,
      cwd: this.opts.cwd
    };
    if (typeof this.opts.title === 'string') out.title = this.opts.title;
    if (this.endedAt) out.endedAt = this.endedAt;
    if (typeof this.exitCode !== 'undefined') out.exitCode = this.exitCode;
    if (this.reason) out.reason = this.reason;
    return out;
  }

  snapshot(): RunnerSnapshot {
    return { summary: this.summary, events: [...this.events], tally: { ...this.tally } };
  }

  tail(sinceIdx?: number): AgentEvent[] {
    if (typeof sinceIdx !== 'number') return ringStore.get(this.runId).since(-1);
    return ringStore.get(this.runId).since(sinceIdx);
  }

  /**
   * Spawn the child process. Returns after the child is spawned — events
   * are delivered async via the EventEmitter.
   */
  async start(): Promise<void> {
    const spawner = this.opts.spawner ?? spawn;
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.opts.apiKey) env['ANTHROPIC_API_KEY'] = this.opts.apiKey;
    if (this.opts.hookConfig) {
      await ensureClaudeHookFiles(this.opts.cwd, this.runId, this.opts.hookConfig);
      env[ORBIT_HOOK_PORT_ENV] = String(this.opts.hookConfig.port);
      env[ORBIT_HOOK_TOKEN_ENV] = this.opts.hookConfig.token;
      env[ORBIT_HOOK_VERSION_ENV] = String(this.opts.hookConfig.version);
      env[ORBIT_RUN_ID_ENV] = this.runId;
      env[ORBIT_VENDOR_ENV] = this.opts.hookConfig.vendor ?? 'claude';
      if (this.opts.hookConfig.worktreeId) {
        env[ORBIT_WORKTREE_ID_ENV] = this.opts.hookConfig.worktreeId;
      }
    }
    if (this.opts.extraEnv) {
      for (const [k, v] of Object.entries(this.opts.extraEnv)) env[k] = v;
    }

    await this.openLog();
    this.logRaw(`# orbit runner start runId=${this.runId} task=${this.opts.taskId ?? ''}`);

    const args = [
      '-p',
      this.opts.prompt,
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose'
    ];
    try {
      this.child = spawner(this.opts.claudePath, args, {
        cwd: this.opts.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as ChildProcessWithoutNullStreams;
    } catch (e) {
      this.finish('error', (e as Error).message, null);
      throw e;
    }

    if (this.child.pid) await this.registerPid(this.child.pid);
    this.status = 'running';
    this.armIdleTimer();

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => this.onStderr(chunk));
    this.child.on('error', (e) => {
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'error',
        text: e.message
      });
    });
    this.child.on('close', (code) => {
      this.flushStdout();
      this.flushStderr();
      this.finish(code === 0 ? 'done' : 'error', undefined, code);
    });
  }

  private onStdout(chunk: string): void {
    this.logRaw(chunk);
    this.resetIdle();
    this.stdoutBuf += chunk;
    let nl = this.stdoutBuf.indexOf('\n');
    while (nl >= 0) {
      const line = this.stdoutBuf.slice(0, nl).replace(/\r$/, '');
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line.length > 0) this.handleLine(line);
      nl = this.stdoutBuf.indexOf('\n');
    }
  }

  private flushStdout(): void {
    if (this.stdoutBuf.length > 0) {
      const line = this.stdoutBuf;
      this.stdoutBuf = '';
      this.handleLine(line);
    }
  }

  private onStderr(chunk: string): void {
    this.logRaw(`!STDERR ${chunk}`);
    this.stderrBuf += chunk;
    let nl = this.stderrBuf.indexOf('\n');
    while (nl >= 0) {
      const line = this.stderrBuf.slice(0, nl).replace(/\r$/, '');
      this.stderrBuf = this.stderrBuf.slice(nl + 1);
      if (line.length > 0) {
        this.push({
          idx: this.eventIdx++,
          at: new Date().toISOString(),
          kind: 'error',
          text: line
        });
      }
      nl = this.stderrBuf.indexOf('\n');
    }
  }

  private flushStderr(): void {
    if (this.stderrBuf.length > 0) {
      const line = this.stderrBuf;
      this.stderrBuf = '';
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'error',
        text: line
      });
    }
  }

  private handleLine(line: string): void {
    // Hydration interception fires regardless of encoding.
    const hyd = parseHydrationLine(line);
    if (hyd && this.opts.hydrate) {
      void this.opts
        .hydrate(hyd.query)
        .then((reply) => this.writeStdin(reply))
        .catch((e: Error) => {
          this.push({
            idx: this.eventIdx++,
            at: new Date().toISOString(),
            kind: 'error',
            text: `hydration failed: ${e.message}`
          });
        });
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'hydrate',
        text: hyd.query
      });
      return;
    }
    // R6: tool invocation fallback — parsed from a bare stdout line.
    const inv = parseToolInvocationLine(line);
    if (inv && this.opts.onToolInvocation) {
      void this.opts
        .onToolInvocation(inv.name, inv.args)
        .then((reply) => this.writeStdin(reply))
        .catch((e: Error) => {
          this.push({
            idx: this.eventIdx++,
            at: new Date().toISOString(),
            kind: 'error',
            text: `tool invocation failed: ${e.message}`
          });
        });
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'text',
        text: `[tool] ${inv.name}`
      });
      return;
    }
    if (this.fallbackPlain) {
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'text',
        text: line
      });
      return;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      const ev = mapStreamJson(parsed, this.eventIdx++);
      if (ev.kind === 'cost') this.mergeTally(ev);
      this.push(ev);
    } catch {
      // Flag the fallback on the very first non-JSON line so subsequent
      // lines are classified correctly.
      this.fallbackPlain = true;
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'text',
        text: line
      });
    }
  }

  private mergeTally(ev: AgentEvent): void {
    const keys: (keyof AgentCostTally)[] = [
      'input_tokens',
      'output_tokens',
      'cache_read_input_tokens',
      'cache_creation_input_tokens',
      'total_cost_usd'
    ];
    for (const k of keys) {
      const v = ev[k];
      if (typeof v === 'number') {
        // Cost events from the stream are cumulative for the turn; we
        // take the max so late-arriving totals win.
        const prev = this.tally[k];
        this.tally[k] = typeof prev === 'number' ? Math.max(prev, v) : v;
      }
    }
  }

  private writeStdin(text: string): void {
    if (!this.child || this.child.stdin.destroyed) return;
    const payload = text.endsWith('\n') ? text : `${text}\n`;
    try {
      this.child.stdin.write(payload);
      this.logRaw(`# orbit stdin -> ${payload}`);
    } catch (e) {
      this.push({
        idx: this.eventIdx++,
        at: new Date().toISOString(),
        kind: 'error',
        text: `stdin write failed: ${(e as Error).message}`
      });
    }
  }

  private push(ev: AgentEvent): void {
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    ringStore.get(this.runId).push(ev);
    this.eventLogStream?.write(JSON.stringify(ev) + '\n');
    this.emit('event', ev);
  }

  private armIdleTimer(): void {
    this.resetIdle();
  }

  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const ms = this.opts.idleTimeoutMs ?? DEFAULT_IDLE_MS;
    this.idleTimer = setTimeout(() => this.stop('idle_timeout'), ms);
  }

  private clearIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Terminate the child (SIGTERM then SIGKILL escalation) and mark the
   * run as killed. Safe to call twice; no-op after completion.
   */
  async stop(reason = 'stopped'): Promise<void> {
    if (this.status === 'done' || this.status === 'error' || this.status === 'killed') return;
    this.reason = reason;
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        // ignore
      }
      // Escalate if still alive after the configured timeout.
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          try {
            this.child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, LIMITS.KILL_TIMEOUT_MS).unref?.();
    }
    // Note: `finish` will be called by the close handler.
  }

  private finish(
    status: RunStatus,
    reason: string | undefined,
    code: number | null
  ): void {
    if (this.status === 'done' || this.status === 'error' || this.status === 'killed') return;
    if (reason === 'idle_timeout' || reason === 'stopped') this.status = 'killed';
    else this.status = status;
    this.endedAt = new Date().toISOString();
    this.exitCode = code;
    if (reason) this.reason = reason;
    this.clearIdle();
    void this.unregisterPid();
    this.push({
      idx: this.eventIdx++,
      at: this.endedAt,
      kind: 'done',
      text: this.reason ?? (code === 0 ? 'exit 0' : `exit ${code}`)
    });
    this.closeLog();
    this.emit('exit', this.summary);
  }

  dispose(): void {
    try {
      this.child?.removeAllListeners();
    } catch {
      // ignore
    }
    this.removeAllListeners();
  }

  // --- logs + pid book -------------------------------------------------------

  private async openLog(): Promise<void> {
    const dir = path.join(this.opts.vaultPath, ORBIT_DIR, ORBIT_LOGS_DIR);
    await fs.mkdir(dir, { recursive: true });
    this.logStream = createWriteStream(path.join(dir, `${this.runId}.log`), {
      flags: 'a'
    });
    this.eventLogStream = createWriteStream(path.join(dir, `${this.runId}.ndjson`), {
      flags: 'a'
    });
  }

  private logRaw(line: string): void {
    if (!this.logStream) return;
    const stamp = new Date().toISOString();
    this.logStream.write(`[${stamp}] ${line}${line.endsWith('\n') ? '' : '\n'}`);
  }

  private closeLog(): void {
    const s = this.logStream;
    this.logStream = null;
    s?.end();
    const ev = this.eventLogStream;
    this.eventLogStream = null;
    ev?.end();
  }

  private async registerPid(pid: number): Promise<void> {
    const map = await readActive(this.opts.vaultPath);
    map[this.runId] = {
      pid,
      cwd: this.opts.cwd,
      taskId: this.opts.taskId,
      title: this.opts.title,
      startedAt: this.startedAt
    };
    await writeActive(this.opts.vaultPath, map);
  }

  private async unregisterPid(): Promise<void> {
    const map = await readActive(this.opts.vaultPath);
    if (this.runId in map) {
      delete map[this.runId];
      await writeActive(this.opts.vaultPath, map);
    }
  }
}
