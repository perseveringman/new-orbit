import { BrowserWindow, app, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';
import { IPC } from '@shared/ipc';
import type {
  AgentEvent,
  CostSummary,
  CostTodayResult,
  DailyReportResult,
  DetectResult,
  RunSummary,
  StartTaskArgs,
  StartTaskResult,
  TailQuery
} from '@shared/agent';
import type { BudgetSettings } from '@shared/schemas';
import { detectClaude } from './cli';
import { getPool, type PoolEvent } from './pool';
import { loadPersona, composePrompt } from './persona';
import {
  buildTaskContext,
  formatHydrationReply
} from './context';
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

const AGENT_EVENT_CHANNEL = 'agent:event';

function broadcastPool(): void {
  const pool = getPool();
  pool.on('event', (ev: PoolEvent) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(AGENT_EVENT_CHANNEL, ev);
    }
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

  ipcMain.handle(IPC.agent.stop, async (_e, runId: string): Promise<void> => {
    await getPool().kill(runId, 'user_stop');
  });

  ipcMain.handle(IPC.agent.list, (): RunSummary[] => getPool().list());

  ipcMain.handle(
    IPC.agent.tail,
    (_e, runId: string, q?: TailQuery): AgentEvent[] => {
      const r = getPool().get(runId);
      if (!r) return [];
      return r.tail(q?.sinceEventIdx);
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
async function startTask(args: StartTaskArgs): Promise<StartTaskResult> {
  const sess = currentSession();
  if (!sess) return { kind: 'error', code: 'no_vault', message: 'No vault is open.' };

  const detect = await detectClaude();
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
  const taskContext = buildTaskContext({
    task,
    entities: sess.tasks.allEntities()
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
    userAsk
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

  const cwd = args.worktreePath ?? sess.vault;

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
      extraEnv,
      hydrate: async (query: string): Promise<string> => {
        const s = currentSession();
        if (!s) return formatHydrationReply(query, []);
        const hits = await s.search.search(query, 8);
        return formatHydrationReply(query, hits);
      }
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

/**
 * Reconcile any orphan runner PIDs recorded by a previous main-process
 * crash. Called from app startup after a vault is open.
 */
export async function reconcileOnStart(vaultPath: string): Promise<void> {
  try {
    await reconcileOrphans(vaultPath);
  } catch {
    // Non-fatal.
  }
}

/** Exposed for tests that inspect the channel name. */
export const AGENT_EVENT_IPC = AGENT_EVENT_CHANNEL;
