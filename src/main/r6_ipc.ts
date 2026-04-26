import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  DailyReviewDTO,
  JournalListItemDTO
} from '@shared/ipc';
import { generateDailyReview, readJournal, listJournals } from './review/daily';
import { hasGhCli } from './env/gh';
import { currentSession } from './fs';
import { getSettings } from './settings';
import { detectClaude } from './agent/cli';
import { getPool } from './agent/pool';
import { loadPersona, composePrompt } from './agent/persona';

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

}

export function resetR6IpcForTesting(): void {
  wired = false;
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
