import { create } from 'zustand';
import type { CheckReport, EnvQueueStatus, WorktreeRecord } from '@shared/git';

interface WorktreeStore {
  list: WorktreeRecord[];
  env: EnvQueueStatus;
  checks: Record<string, CheckReport>;
  busyId: string | null;
  unsubscribeEnv: (() => void) | null;

  refresh(): Promise<void>;
  init(): Promise<void>;
  teardown(): void;
  preMergeCheck(id: string): Promise<CheckReport | null>;
  merge(id: string, strategy: 'fast-forward' | 'squash'): Promise<string | null>;
  remove(id: string, force?: boolean): Promise<void>;
  resetAll(): Promise<{ removed: number; errors: number } | null>;
}

export const useWorktrees = create<WorktreeStore>((set, get) => ({
  list: [],
  env: { queued: 0, active: null },
  checks: {},
  busyId: null,
  unsubscribeEnv: null,

  async refresh() {
    try {
      const list = await window.orbit.git.listWorktrees();
      set({ list });
    } catch {
      // ignore
    }
  },

  async init() {
    await Promise.all([get().refresh(), refreshEnvOnce(set)]);
    const off = window.orbit.env.onEvent((s) => set({ env: s }));
    set({ unsubscribeEnv: off });
  },

  teardown() {
    get().unsubscribeEnv?.();
    set({ unsubscribeEnv: null });
  },

  async preMergeCheck(id: string) {
    set({ busyId: id });
    try {
      const r = await window.orbit.git.preMergeCheck(id);
      set({ checks: { ...get().checks, [id]: r } });
      return r;
    } catch {
      return null;
    } finally {
      set({ busyId: null });
    }
  },

  async merge(id, strategy) {
    set({ busyId: id });
    try {
      const r = await window.orbit.git.mergeGhost(id, { strategy });
      await get().refresh();
      return r.ok ? (r.mergedSha ?? 'ok') : null;
    } catch (e) {
      return null;
    } finally {
      set({ busyId: null });
    }
  },

  async remove(id, force) {
    set({ busyId: id });
    try {
      await window.orbit.git.removeWorktree(id, force ? { force: true } : undefined);
      await get().refresh();
    } finally {
      set({ busyId: null });
    }
  },

  async resetAll() {
    try {
      const r = await window.orbit.git.resetAll();
      await get().refresh();
      return { removed: r.removed, errors: r.errors.length };
    } catch {
      return null;
    }
  }
}));

async function refreshEnvOnce(
  set: (s: Partial<WorktreeStore>) => void
): Promise<void> {
  try {
    const s = await window.orbit.env.status();
    set({ env: s });
  } catch {
    // ignore
  }
}
