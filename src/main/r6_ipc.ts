import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  DailyReviewDTO,
  JournalListItemDTO,
  NightShiftPlanDTO,
  NightShiftRunDTO,
  NightShiftTaskStatusDTO
} from '@shared/ipc';
import { generateDailyReview, readJournal, listJournals } from './review/daily';
import {
  getDispatcher,
  type NightShiftDeps,
  type NightShiftRun,
  type NightShiftTaskStatus,
  type StubRunner,
  type RunnerSpawnArgs
} from './night_shift/dispatcher';
import { hasGhCli } from './env/gh';
import { currentSession } from './fs';
import { getSettings } from './settings';
import { detectClaude } from './agent/cli';
import { getPool } from './agent/pool';
import { loadPersona, composePrompt } from './agent/persona';
import { getHookRuntimeConfig } from './agent/ipc';

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send(channel, payload);
      } catch {
        /* ignore */
      }
    }
  }
}

function runToDto(r: NightShiftRun): NightShiftRunDTO {
  const tasks: NightShiftTaskStatusDTO[] = r.tasks.map((t: NightShiftTaskStatus) => {
    const dto: NightShiftTaskStatusDTO = {
      taskUid: t.taskUid,
      title: t.title,
      projectUid: t.projectUid,
      phase: t.phase
    };
    if (t.detail !== undefined) dto.detail = t.detail;
    if (t.branch !== undefined) dto.branch = t.branch;
    if (t.prUrl !== undefined) dto.prUrl = t.prUrl;
    if (t.prNumber !== undefined) dto.prNumber = t.prNumber;
    if (t.issueNumber !== undefined) dto.issueNumber = t.issueNumber;
    if (t.checks !== undefined) dto.checks = t.checks;
    if (t.startedAt !== undefined) dto.startedAt = t.startedAt;
    if (t.endedAt !== undefined) dto.endedAt = t.endedAt;
    return dto;
  });
  const out: NightShiftRunDTO = {
    runId: r.runId,
    startedAt: r.startedAt,
    status: r.status,
    concurrency: r.concurrency,
    createPR: r.createPR,
    tasks
  };
  if (r.endedAt) out.endedAt = r.endedAt;
  if (r.summary) out.summary = r.summary;
  return out;
}

let wired = false;

export function registerR6Ipc(): void {
  if (wired) return;
  wired = true;

  // --- review -------------------------------------------------------------
  ipcMain.handle(
    IPC.review.generate,
    async (_e, date?: string): Promise<DailyReviewDTO> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const detected = await detectClaude();
      const settings = await getSettings();
      let runAgent: ((p: string, c: string) => Promise<string>) | undefined;
      if (detected.available && detected.path && settings.anthropicApiKey) {
        runAgent = async (persona, ctx): Promise<string> => {
          const prompt = composePrompt({
            persona,
            taskContext: ctx,
            userAsk: 'Produce the Daily Review Markdown body as specified.'
          });
          const pool = getPool();
          const runner = await pool.spawn({
            claudePath: detected.path!,
            prompt,
            cwd: sess.vault,
            apiKey: settings.anthropicApiKey,
            taskId: null,
            title: 'Daily Review',
            vaultPath: sess.vault,
            idleTimeoutMs: 60_000
          });
          await new Promise<void>((resolve) =>
            runner.once('exit', () => resolve())
          );
          const snap = runner.snapshot();
          const text = snap.events
            .filter((e) => e.kind === 'text' || e.kind === 'message')
            .map((e) => e.text ?? '')
            .join('\n');
          return text;
        };
      }
      void loadPersona; // ensure import retained for future persona override
      const res = await generateDailyReview(sess.vault, date, { runAgent });
      return res;
    }
  );

  ipcMain.handle(
    IPC.review.get,
    async (_e, date?: string): Promise<DailyReviewDTO | null> => {
      const sess = currentSession();
      if (!sess) return null;
      const d = date ?? localDate();
      return readJournal(sess.vault, d);
    }
  );

  ipcMain.handle(IPC.review.list, async (): Promise<JournalListItemDTO[]> => {
    const sess = currentSession();
    if (!sess) return [];
    return listJournals(sess.vault);
  });

  // --- env.hasGhCli -------------------------------------------------------
  ipcMain.handle(IPC.envExt.hasGhCli, (): Promise<boolean> => hasGhCli());

  // --- night shift --------------------------------------------------------
  ipcMain.handle(
    IPC.nightShift.start,
    async (_e, plan: NightShiftPlanDTO): Promise<{ runId: string }> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      const detected = await detectClaude();
      const settings = await getSettings();
      const deps: NightShiftDeps = {};
      if (detected.available && detected.path && settings.anthropicApiKey) {
        deps.spawnRunner = async (args: RunnerSpawnArgs): Promise<StubRunner> => {
          const persona = await loadPersona(sess.vault);
          const prompt = composePrompt({
            persona,
            taskContext: args.prompt,
            userAsk: 'Execute the task autonomously.'
          });
          const pool = getPool();
          const runner = await pool.spawn({
            claudePath: detected.path!,
            prompt,
            cwd: args.worktreePath,
            apiKey: settings.anthropicApiKey,
            taskId: args.taskUid,
            title: `night:${args.taskUid}`,
            vaultPath: args.vaultPath,
            hookConfig: await getHookRuntimeConfig(args.taskUid),
            idleTimeoutMs: 30 * 60_000
          });
          return {
            runId: runner.runId,
            stop: async (reason?: string): Promise<void> => {
              await runner.stop(reason ?? 'stopped');
            },
            whenExit: (): Promise<{ ok: boolean; reason?: string }> =>
              new Promise((resolve) => {
                runner.once('exit', () => {
                  const s = runner.summary;
                  const result: { ok: boolean; reason?: string } = {
                    ok: s.status === 'done'
                  };
                  if (s.reason !== undefined) result.reason = s.reason;
                  resolve(result);
                });
              })
          };
        };
      }
      const disp = getDispatcher(sess.vault, deps);
      wireDispatcherBroadcast(disp);
      const runId = await disp.start(plan);
      return { runId };
    }
  );

  ipcMain.handle(IPC.nightShift.cancel, async (_e, runId: string): Promise<void> => {
    const sess = currentSession();
    if (!sess) return;
    const disp = getDispatcher(sess.vault);
    await disp.cancel(runId);
  });

  ipcMain.handle(
    IPC.nightShift.status,
    async (_e, runId: string): Promise<NightShiftRunDTO | null> => {
      const sess = currentSession();
      if (!sess) return null;
      const disp = getDispatcher(sess.vault);
      const r = disp.get(runId);
      return r ? runToDto(r) : null;
    }
  );

  ipcMain.handle(IPC.nightShift.list, async (): Promise<NightShiftRunDTO[]> => {
    const sess = currentSession();
    if (!sess) return [];
    const disp = getDispatcher(sess.vault);
    return disp.list().map(runToDto);
  });
}

let dispatcherWired: WeakSet<object> = new WeakSet();

function wireDispatcherBroadcast(
  disp: ReturnType<typeof getDispatcher>
): void {
  if (dispatcherWired.has(disp)) return;
  dispatcherWired.add(disp);
  disp.on('progress', (ev: unknown) => broadcast(IPC.nightShift.progress, ev));
  disp.on('done', (ev: unknown) => broadcast(IPC.nightShift.done, ev));
}

export function resetR6IpcForTesting(): void {
  wired = false;
  dispatcherWired = new WeakSet();
}

function localDate(): string {
  const d = new Date();
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- 22:00 auto-generation scheduler ----------------------------------------

let schedulerTimer: NodeJS.Timeout | null = null;
let lastAutoRun: string | null = null;

export function startDailyReviewScheduler(): void {
  if (schedulerTimer) return;
  const check = async (): Promise<void> => {
    try {
      const settings = await getSettings();
      if (!settings.autoDailyReview) return;
      const sess = currentSession();
      if (!sess) return;
      const now = new Date();
      const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      const target = settings.autoDailyReviewAt ?? '22:00';
      if (hhmm !== target) return;
      const today = localDate();
      if (lastAutoRun === today) return;
      lastAutoRun = today;
      await generateDailyReview(sess.vault, today);
    } catch {
      /* best effort */
    }
  };
  schedulerTimer = setInterval(() => void check(), 60_000);
  schedulerTimer.unref?.();
}

export function stopDailyReviewScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
