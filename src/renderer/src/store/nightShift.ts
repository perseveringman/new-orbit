import { create } from 'zustand';
import type {
  NightShiftDoneEventDTO,
  NightShiftPlanDTO,
  NightShiftProgressEventDTO,
  NightShiftRunDTO
} from '@shared/ipc';
import type { NightShiftGitHubOptions } from '@shared/github';

interface NightShiftState {
  run: NightShiftRunDTO | null;
  subscribed: boolean;
  subscribe(): void;
  refresh(): Promise<void>;
  start(
    taskUids: string[],
    concurrency: number,
    createPR: boolean,
    github?: NightShiftGitHubOptions
  ): Promise<void>;
  cancel(): Promise<void>;
  clear(): void;
}

export const useNightShift = create<NightShiftState>((set, get) => ({
  run: null,
  subscribed: false,
  subscribe(): void {
    if (get().subscribed) return;
    window.orbit.nightShift.onProgress((ev: NightShiftProgressEventDTO) => {
      set((s) => {
        if (!s.run || s.run.runId !== ev.runId) return s;
        const tasks = s.run.tasks.map((t) =>
          t.taskUid === ev.taskUid
            ? { ...t, phase: ev.phase, detail: ev.detail ?? t.detail }
            : t
        );
        return { run: { ...s.run, tasks } };
      });
    });
    window.orbit.nightShift.onDone((ev: NightShiftDoneEventDTO) => {
      set((s) => {
        if (!s.run || s.run.runId !== ev.runId) return s;
        return {
          run: {
            ...s.run,
            status: s.run.status === 'cancelled' ? 'cancelled' : 'done',
            summary: ev.summary,
            endedAt: new Date().toISOString()
          }
        };
      });
    });
    set({ subscribed: true });
  },
  async refresh(): Promise<void> {
    const runs = await window.orbit.nightShift.list();
    const latest = runs[runs.length - 1] ?? null;
    set({ run: latest });
  },
  async start(taskUids, concurrency, createPR, github): Promise<void> {
    const plan: NightShiftPlanDTO = {
      taskUids,
      concurrency,
      createPR
    };
    if (github) plan.github = github;
    const { runId } = await window.orbit.nightShift.start(plan);
    const run = await window.orbit.nightShift.status(runId);
    set({ run });
  },
  async cancel(): Promise<void> {
    const r = get().run;
    if (!r) return;
    await window.orbit.nightShift.cancel(r.runId);
  },
  clear(): void {
    set({ run: null });
  }
}));
