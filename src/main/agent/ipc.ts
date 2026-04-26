import { BrowserWindow, app, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';
import { IPC } from '@shared/ipc';
import type {
  AgentEvent,
  CostSummary,
  CostTodayResult,
  DailyReportResult,
  DetectResult,
  ReattachResult,
  RunSummary,
  SendAgentMessageResult,
  StartTaskArgs,
  StartTaskResult,
  TailQuery
} from '@shared/agent';
import type { BudgetSettings } from '@shared/schemas';
import { LIMITS } from '@shared/limits';
import { detectClaude } from './cli';
import { getPool, type PoolEvent } from './pool';
import { loadPersona, composePrompt } from './persona';
import { buildTaskContext } from './context';
import {
  BudgetGate,
  SafetyGate,
  appendCostRecord,
  buildCostRecord,
  computeRemaining,
  costForRun,
  costToday,
  estimateTokens,
  estimateUsd
} from './tokens';
import { installBudgetWatch } from './budget_watch';
import { generateDailyReport } from './cost_report';
import { currentSession } from '../fs';
import { getBudget, getSettings, updateBudget } from '../settings';
import { reconcileOrphans } from './runner';
import { getPortAllocator } from '../env/ports';
import { ensureVectorStore } from '../distill/ipc';
import {
  formatExperienceBlock,
  recordInjection,
  suggestExperience
} from '../distill/wakeup';
import { attachEventRouter } from './eventRouter';
import { startHookServer, type HookServer } from './hooks/server';
import { installTerminalAgentHooks } from './setup/terminal_hooks';
import {
  ingestTerminalHookEvent,
  listTerminalAgentSessions,
  markTerminalPaneExited,
  reconcileTerminalAgentSessionsOnStart,
  type TerminalAgentSession
} from './terminal_sessions';
import {
  readClaudeProjectSessionDetail,
  resolveClaudeSessionTarget
} from './claude_sessions';
import { readCodexSessionMessages } from './codex_sessions';
import { listProjects } from '../project';
import { listAreas } from '../area';
import { readTaskFile } from '../task';
import { getLocalRuntimeManager } from '../orchestration/runtime';

const AGENT_EVENT_CHANNEL = 'agent:event';
const TERMINAL_AGENT_EVENT_CHANNEL = IPC.terminalAgent.event;
const reattachedRuns = new Map<string, { summary: RunSummary; events: AgentEvent[] }>();
let hookServer: HookServer | null = null;
let hookRouter: ReturnType<typeof attachEventRouter> | null = null;
let hookSeq = 0;
const terminalHookInstalledVaults = new Set<string>();

function broadcastPool(): void {
  const pool = getPool();
  pool.on('event', (ev: PoolEvent) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(AGENT_EVENT_CHANNEL, ev);
    }
  });
}

function broadcastAgentEvent(runId: string, event: AgentEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(AGENT_EVENT_CHANNEL, { runId, event });
  }
}

function broadcastTerminalAgentEvent(event: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(TERMINAL_AGENT_EVENT_CHANNEL, event);
  }
}

async function enrichTerminalAgentSession(
  session: TerminalAgentSession,
  projectPath: string
): Promise<TerminalAgentSession> {
  if (session.resumeCommand) return session;
  if (session.agentType !== 'claude') {
    return { ...session, resumeCommand: undefined };
  }
  const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
  const claudeProjectPath = session.cwd ?? projectPath;
  const target = await resolveClaudeSessionTarget(claudeRoot, claudeProjectPath, {
    vendorSessionId: session.vendorSessionId,
    startedAt: session.startedAt,
    ...(session.endedAt ? { endedAt: session.endedAt } : {})
  });
  if (!target) return session;
  return {
    ...session,
    vendorSessionId: session.vendorSessionId ?? target.sessionId,
    resumeCommand: `claude --resume ${target.sessionId}`
  };
}

async function resolveTerminalRoom(
  vaultPath: string,
  uid: string
): Promise<{ kind: 'project' | 'area'; path: string } | null> {
  const [projects, areas] = await Promise.all([listProjects(vaultPath), listAreas(vaultPath)]);
  const project = projects.find((item) => item.uid === uid);
  if (project) return { kind: 'project', path: project.path };
  const area = areas.find((item) => item.uid === uid);
  if (area) return { kind: 'area', path: area.path };
  return null;
}

async function resolveTaskCwd(
  vaultPath: string,
  task: { project_uid?: string; area_uid?: string },
  worktreePath?: string
): Promise<string> {
  if (worktreePath) return worktreePath;
  if (task.project_uid) {
    const projects = await listProjects(vaultPath);
    const project = projects.find((item) => item.uid === task.project_uid);
    if (project) return project.legacy ? path.dirname(project.path) : project.path;
  }
  if (task.area_uid) {
    const areas = await listAreas(vaultPath);
    const area = areas.find((item) => item.uid === task.area_uid);
    if (area) return area.path;
  }
  return vaultPath;
}

async function ensureHookRuntime(): Promise<HookServer> {
  if (!hookServer) {
    hookServer = await startHookServer();
    hookRouter = attachEventRouter(hookServer, {
      dedupTtlMs: LIMITS.HOOK_DEDUP_TTL_MS
    });
    hookRouter.events.on('event', (routed) => {
      const event: AgentEvent = {
        idx: -(++hookSeq),
        at: routed.ts,
        kind: 'text',
        text: `[hook] ${routed.eventType}`,
        data: {
          hookEventType: routed.eventType,
          payload: routed.payload,
          worktreeId: routed.worktreeId,
          seq: routed.seq
        }
      };
      broadcastAgentEvent(routed.runId, event);
    });
    hookServer.events.on('terminal-event', (envelope) => {
      const sess = currentSession();
      if (!sess) return;
      void ingestTerminalHookEvent(sess.vault, envelope)
        .then((session) => {
          broadcastTerminalAgentEvent({
            ...envelope,
            ...(session
              ? {
                  sessionId: session.sessionId,
                  agentType: session.agentType,
                  status: session.status
                }
              : {}),
            reason: 'hook'
          });
        })
        .catch(() => undefined);
    });
  }
  return hookServer;
}

export async function ensureTerminalAgentRuntimeForVault(
  vaultPath: string
): Promise<{ port: number }> {
  const server = await ensureHookRuntime();
  if (!terminalHookInstalledVaults.has(vaultPath)) {
    await installTerminalAgentHooks({
      vaultPath,
      hookPort: server.port,
      homeDir: os.homedir()
    });
    terminalHookInstalledVaults.add(vaultPath);
  }
  return { port: server.port };
}

export async function getHookRuntimeConfig(
  worktreeId?: string
): Promise<NonNullable<import('./runner').SpawnOpts['hookConfig']>> {
  const server = await ensureHookRuntime();
  return {
    port: server.port,
    token: server.token,
    version: server.version,
    vendor: 'claude',
    worktreeId
  };
}

export async function handleTerminalPaneExited(
  paneId: string,
  projectUid?: string,
  projectSlug?: string,
  ts: string = new Date().toISOString()
): Promise<void> {
  const sess = currentSession();
  if (!sess) return;
  const completed = await markTerminalPaneExited(sess.vault, paneId, ts);
  if (!completed) return;
  broadcastTerminalAgentEvent({
    eventType: 'Stop',
    rawEventType: 'terminal-exit',
    paneId,
    ...(projectUid ? { projectUid } : {}),
    ...(projectSlug ? { projectSlug } : {}),
    ts,
    sessionId: completed.sessionId,
    agentType: completed.agentType,
    status: completed.status,
    reason: 'exit'
  });
}

let wired = false;

/**
 * Register all `agent:*` IPC handlers. Safe to call multiple times —
 * second and subsequent calls are no-ops.
 */
export function registerAgentIpc(): void {
  if (wired) return;
  wired = true;
  broadcastPool();
  registerBudgetWatch();

  ipcMain.handle(IPC.agent.detect, (): Promise<DetectResult> => detectClaude());

  ipcMain.handle(
    IPC.agent.startTask,
    async (_e, args: StartTaskArgs): Promise<StartTaskResult> => startTask(args)
  );

  ipcMain.handle(
    IPC.agent.sendMessage,
    async (_e, runId: string, message: string): Promise<SendAgentMessageResult> =>
      sendAgentMessage(runId, message)
  );

  ipcMain.handle(IPC.agent.stop, async (_e, runId: string): Promise<void> => {
    if (reattachedRuns.has(runId)) {
      reattachedRuns.delete(runId);
      return;
    }
    await getPool().kill(runId, 'user_stop');
  });

  ipcMain.handle(IPC.agent.list, (): RunSummary[] => [
    ...Array.from(reattachedRuns.values(), (run) => run.summary),
    ...getPool().list()
  ]);

  ipcMain.handle(IPC.terminalAgent.list, async (_e, projectUid: string) => {
    const sess = currentSession();
    if (!sess) return [];
    const sessions = await listTerminalAgentSessions(sess.vault, projectUid);
    const room = await resolveTerminalRoom(sess.vault, projectUid);
    if (!room) return sessions;
    return Promise.all(
      sessions.map(async (session) => {
        const enriched = await enrichTerminalAgentSession(session, room.path);
        const resumeSessionId =
          enriched.vendorSessionId && enriched.agentType === 'claude' ? enriched.vendorSessionId : null;
        return {
          ...enriched,
          roomKind: room.kind,
          resumeSessionId,
          resumeCommand: enriched.resumeCommand ?? null
        };
      })
    );
  });

  ipcMain.handle(IPC.terminalAgent.detail, async (_e, projectUid: string, sessionId: string) => {
    const sess = currentSession();
    if (!sess) return null;
    const sessions = await listTerminalAgentSessions(sess.vault, projectUid);
    const room = await resolveTerminalRoom(sess.vault, projectUid);
    const session = sessions.find((item) => item.sessionId === sessionId);
    if (!room || !session) return null;

    const enriched = await enrichTerminalAgentSession(session, room.path);
    if (enriched.agentType === 'codex') {
      const messages = enriched.vendorSessionId
        ? await readCodexSessionMessages(path.join(os.homedir(), '.codex'), enriched.vendorSessionId)
        : [];
      return {
        ...enriched,
        roomKind: room.kind,
        resumeSessionId: null,
        resumeCommand: enriched.resumeCommand ?? null,
        messages
      };
    }

    if (enriched.agentType !== 'claude') {
      return {
        ...enriched,
        roomKind: room.kind,
        resumeSessionId: null,
        resumeCommand: enriched.resumeCommand ?? null,
        messages: []
      };
    }

    const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
    const claudeProjectPath = enriched.cwd ?? room.path;
    const target = await resolveClaudeSessionTarget(claudeRoot, claudeProjectPath, {
      vendorSessionId: enriched.vendorSessionId,
      startedAt: enriched.startedAt,
      ...(enriched.endedAt ? { endedAt: enriched.endedAt } : {})
    });
    const detail = target
      ? await readClaudeProjectSessionDetail(claudeRoot, claudeProjectPath, target.sessionId)
      : null;
    return {
      ...enriched,
      roomKind: room.kind,
      resumeSessionId: target?.sessionId ?? null,
      resumeCommand:
        enriched.resumeCommand ?? (target ? `claude --resume ${target.sessionId}` : null),
      messages: detail?.messages ?? []
    };
  });

  ipcMain.handle(
    IPC.agent.tail,
    (_e, runId: string, q?: TailQuery): AgentEvent[] => {
      const r = getPool().get(runId);
      if (r) return r.tail(q?.sinceEventIdx);
      const snap = reattachedRuns.get(runId);
      if (!snap) return [];
      const sinceEventIdx = q?.sinceEventIdx;
      return typeof sinceEventIdx === 'number'
        ? snap.events.filter((event) => event.idx > sinceEventIdx)
        : [...snap.events];
    }
  );

  ipcMain.handle(
    IPC.agent.reattach,
    async (_e, runId: string, sinceIdx?: number): Promise<ReattachResult> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const snap = reattachedRuns.get(runId);
      if (snap) {
        return {
          runId,
          events:
            typeof sinceIdx === 'number'
              ? snap.events.filter((event) => event.idx > sinceIdx)
              : [...snap.events],
          terminated: snap.summary.status !== 'running',
          logPath: path.join(sess.vault, ORBIT_DIR, ORBIT_LOGS_DIR, `${runId}.ndjson`)
        };
      }
      const { readLogForReattach } = await import('./reattach');
      return readLogForReattach({ vaultPath: sess.vault, runId, sinceIdx });
    }
  );

  ipcMain.handle(IPC.agent.costToday, async (): Promise<CostTodayResult> => {
    const budget = await getBudget();
    const sess = currentSession();
    const empty: CostSummary = {
      runs: 0,
      tokens: { in: 0, out: 0, cached: 0 },
      estUSD: 0,
      source: 'estimate'
    };
    const base: CostSummary = sess ? await costToday(sess.vault) : empty;
    const remaining = computeRemaining(budget, {
      tokens: base.tokens.in + base.tokens.out,
      usd: base.estUSD
    });
    return { ...base, caps: budget, remaining };
  });

  ipcMain.handle(
    IPC.agent.costRun,
    async (_e, runId: string): Promise<CostSummary> => {
      const sess = currentSession();
      if (!sess)
        return { runs: 0, tokens: { in: 0, out: 0, cached: 0 }, estUSD: 0, source: 'estimate' };
      return costForRun(sess.vault, runId);
    }
  );

  ipcMain.handle(
    IPC.agent.costDailyReport,
    async (_e, args?: { date?: string }): Promise<DailyReportResult> => {
      const sess = currentSession();
      if (!sess) {
        return {
          path: '',
          markdown: '# Orbit cost report\n\n_No vault open._\n',
          date: new Date().toISOString().slice(0, 10)
        };
      }
      return generateDailyReport(sess.vault, args?.date ?? new Date());
    }
  );

  ipcMain.handle(IPC.agent.budgetGet, async (): Promise<BudgetSettings> => getBudget());

  ipcMain.handle(
    IPC.agent.budgetUpdate,
    async (_e, partial: Partial<BudgetSettings>): Promise<BudgetSettings> =>
      updateBudget(partial)
  );

  // Kill all runners on app quit so no subprocesses are left behind.
  app.on('before-quit', () => {
    void getPool().killAll('app_quit');
    hookRouter?.stop();
    if (hookServer) void hookServer.close();
  });
}

function registerBudgetWatch(): void {
  // Attach to the pool lazily — the vault path can change across the
  // app's lifetime (close/open vault). The watch resolves its vault on
  // each event via `currentSession()`.
  const pool = getPool();
  installBudgetWatch({
    pool,
    // The vaultPath is consulted per-event, but the watcher stores it
    // once; we pass a placeholder and let the provider do lookups.
    vaultPath: '',
    budget: { get: () => getBudget() },
    readCostToday: async (): Promise<{
      tokens: { in: number; out: number; cached: number };
      estUSD: number;
    }> => {
      const sess = currentSession();
      if (!sess) return { tokens: { in: 0, out: 0, cached: 0 }, estUSD: 0 };
      const c = await costToday(sess.vault);
      return { tokens: c.tokens, estUSD: c.estUSD };
    },
    appendRecord: async (_vault, rec): Promise<void> => {
      const sess = currentSession();
      if (!sess) return;
      await appendCostRecord(sess.vault, rec);
    },
    kill: (runId: string, reason?: string): Promise<void> =>
      pool.kill(runId, reason ?? 'budget_halt'),
    taskIdOf: (runId: string): string | null =>
      pool.get(runId)?.summary.taskId ?? null
  });
}

/**
 * Build + spawn a runner for a specific task. Returns a structured
 * error object (not throw) so the renderer can render install hints.
 */
export async function startTask(args: StartTaskArgs): Promise<StartTaskResult> {
  const sess = currentSession();
  if (!sess) return { kind: 'error', code: 'no_vault', message: 'No vault is open.' };

  const runtime = args.runtimeId ? getLocalRuntimeManager().get(args.runtimeId) : null;
  if (args.runtimeId && !runtime) {
    return {
      kind: 'error',
      code: 'runtime_missing',
      message: `Runtime not found: ${args.runtimeId}`
    };
  }
  if (runtime && runtime.provider !== 'claude') {
    return {
      kind: 'error',
      code: 'unsupported_runtime',
      message: `${runtime.provider} adapter is available but task spawning is still gated to Claude in Phase 3.1.`
    };
  }

  const detect = runtime
    ? { available: true, path: runtime.binaryPath, version: runtime.version ?? undefined }
    : await detectClaude();
  if (!detect.available || !detect.path) {
    return {
      kind: 'error',
      code: 'cli_missing',
      message:
        detect.error ??
        'Claude Code CLI not found. Install it from https://docs.claude.com/claude-code'
    };
  }

  const tasks = sess.tasks.allTasks();
  const task = tasks.find((t) => t.id === args.taskId);
  if (!task) {
    return {
      kind: 'error',
      code: 'task_not_found',
      message: `No task with id ${args.taskId}`
    };
  }

  const persona = await loadPersona(sess.vault);
  const taskFile =
    task.source === 'file'
      ? await readTaskFile(task.filePath).catch(() => null)
      : null;
  const taskContext = buildTaskContext({
    task,
    entities: sess.tasks.allEntities(),
    taskDocument: taskFile
      ? {
          blockedReason:
            typeof taskFile.frontmatter['blocked_reason'] === 'string'
              ? taskFile.frontmatter['blocked_reason']
              : undefined,
          description: taskFile.sections.description,
          summary: taskFile.sections.summary,
          recentExecutionLog: taskFile.sections.executionLog
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean)
            .slice(-6)
            .join('\n')
        }
      : undefined
  });

  // Experience wake-up: inject past resource/archive hits above threshold.
  let experienceBlock = '';
  let experienceHits: ReturnType<typeof suggestExperience> = [];
  try {
    const { store } = await ensureVectorStore(sess.vault);
    experienceHits = suggestExperience(sess, store, task, 3);
    experienceBlock = formatExperienceBlock(experienceHits);
  } catch {
    // wake-up is best-effort; do not block dispatch on embedding errors
  }

  const userAsk = [args.instructions ?? '', experienceBlock].filter(Boolean).join('\n\n');
  const prompt = composePrompt({
    persona,
    taskContext,
    userAsk,
    taskBoundary: {
      title: task.title,
      uid: task.uid
    }
  });

  const budget = await getBudget();
  const estInputTokens = estimateTokens(prompt);
  const budgetCheck = await BudgetGate.check(
    { estInputTokens, estUSD: estimateUsd(estInputTokens, 0) },
    { vaultPath: sess.vault, budget }
  );
  if (!budgetCheck.ok) {
    return {
      kind: 'error',
      code: 'budget_blocked',
      message: budgetCheck.message
    };
  }
  if (budgetCheck.warning) {
    // Soft mode: broadcast a budget_warn so the renderer can toast, but
    // continue with the spawn.
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(AGENT_EVENT_CHANNEL, {
          runId: '',
          event: {
            idx: -1,
            at: new Date().toISOString(),
            kind: 'budget_warn',
            data: {
              runId: '',
              reason: budgetCheck.warning.code,
              tokens: estInputTokens,
              usd: estimateUsd(estInputTokens, 0),
              message: budgetCheck.warning.message
            }
          }
        });
      }
    }
  }

  const settings = await getSettings();
  const apiKey =
    (settings as unknown as { anthropicApiKey?: string }).anthropicApiKey ??
    process.env['ANTHROPIC_API_KEY'];

  const cwd = await resolveTaskCwd(sess.vault, task, args.worktreePath);

  const safety = SafetyGate.check({ cwd, prompt, vaultPath: sess.vault });
  if (!safety.ok) {
    return {
      kind: 'error',
      code: 'safety_blocked',
      message: safety.reason ?? 'blocked by safety gate'
    };
  }

  try {
    const extraEnv: Record<string, string> = {};
    if (args.worktreePath) {
      const port = await getPortAllocator().allocate(`worktree:${args.worktreePath}`);
      extraEnv['ORBIT_PORT'] = String(port);
      extraEnv['PORT'] = String(port);
    }
    const spawnOpts = {
      claudePath: detect.path,
      prompt,
      cwd,
      taskId: task.id,
      title: task.title,
      vaultPath: sess.vault,
        runtimeProvider: runtime?.provider ?? 'claude',
        runtimeId: runtime?.runtimeId,
        runtimeName: runtime?.name,
        vendorSessionId: args.vendorSessionId,
        inputMode: args.vendorSessionId ? 'stream-json' : 'one-shot',
        hookConfig: await getHookRuntimeConfig(),
        extraEnv
    } as const;
    const opts = apiKey ? { ...spawnOpts, apiKey } : { ...spawnOpts };
    const runner = await getPool().spawn(opts);
    if (experienceHits.length > 0) {
      recordInjection(runner.runId, experienceHits);
      try {
        const logLine =
          `${new Date().toISOString()} [orbit] run ${runner.runId} injected ${experienceHits.length} past experience hit(s): ${experienceHits
            .map((h) => h.meta.relPath)
            .join(', ')}\n`;
        const logDir = path.join(sess.vault, ORBIT_DIR, ORBIT_LOGS_DIR);
        await fs.mkdir(logDir, { recursive: true });
        await fs.appendFile(path.join(logDir, 'agent.log'), logLine, 'utf8');
      } catch {
        // log is best-effort
      }
    }

    // Persist an initial cost record using the estimator so "today" reflects
    // the new run even before the CLI emits a cost event. Real cost events
    // will overwrite-append later via the event handler below.
    runner.on('exit', () => {
      if (args.worktreePath) {
        getPortAllocator().release(`worktree:${args.worktreePath}`);
      }
      void appendCostRecord(
        sess.vault,
        buildCostRecord({
          runId: runner.runId,
          taskId: task.id,
          tally: runner.snapshot().tally,
          promptText: prompt,
          completionText: runner
            .snapshot()
            .events.filter((e) => e.kind === 'message' || e.kind === 'text')
            .map((e) => e.text ?? '')
            .join('\n')
        })
      );
    });

    return { kind: 'ok', runId: runner.runId };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'already_running') {
      return { kind: 'error', code: 'already_running', message: err.message };
    }
    return { kind: 'error', code: 'spawn_failed', message: err.message };
  }
}

export function sendAgentMessage(runId: string, message: string): SendAgentMessageResult {
  const runner = getPool().get(runId);
  if (!runner) return { accepted: false, reason: 'run_not_found' };
  if (runner.summary.status !== 'running') return { accepted: false, reason: 'not_running' };
  return runner.sendMessage(message)
    ? { accepted: true }
    : { accepted: false, reason: 'stdin_unavailable' };
}

/**
 * Reconcile any orphan runner PIDs recorded by a previous main-process
 * crash. Called from app startup after a vault is open.
 */
export async function reconcileOnStart(vaultPath: string): Promise<void> {
  try {
    await reconcileTerminalAgentSessionsOnStart(vaultPath);
    await ensureTerminalAgentRuntimeForVault(vaultPath);
    reattachedRuns.clear();
    const snapshots = await reconcileOrphans(vaultPath);
    for (const snap of snapshots) {
      reattachedRuns.set(snap.summary.runId, {
        summary: snap.summary,
        events: snap.events
      });
    }
  } catch {
    // Non-fatal.
  }
}

/** Exposed for tests that inspect the channel name. */
export const AGENT_EVENT_IPC = AGENT_EVENT_CHANNEL;
