import { create } from 'zustand';
import type {
  AgentEvent,
  BudgetHaltPayload,
  CostSummary,
  CostTodayResult,
  DetectResult,
  RunSummary,
  StartTaskResult
} from '@shared/agent';
import { type BudgetSettings, DEFAULT_BUDGET } from '@shared/schemas';

export interface RunState {
  summary: RunSummary;
  events: AgentEvent[];
  cost?: CostSummary;
  /** Populated when the runtime watch halted the run. */
  halt?: BudgetHaltPayload;
}

interface StartOpts {
  instructions?: string;
  useWorktree?: boolean;
}

interface AgentStore {
  detect: DetectResult | null;
  runs: Record<string, RunState>;
  activeRunId: string | null;
  costToday: CostTodayResult | null;
  budget: BudgetSettings;
  unsubscribe: (() => void) | null;
  settingsOpen: boolean;

  init(): Promise<void>;
  teardown(): void;
  refreshDetect(): Promise<void>;
  refreshList(): Promise<void>;
  refreshCostToday(): Promise<void>;
  refreshCostFor(runId: string): Promise<void>;
  refreshBudget(): Promise<void>;
  updateBudget(partial: Partial<BudgetSettings>): Promise<void>;
  openSettings(): void;
  closeSettings(): void;
  select(runId: string): void;
  startForTask(taskId: string, opts?: StartOpts): Promise<StartTaskResult>;
  stop(runId: string): Promise<void>;
}

const EMPTY_COST: CostTodayResult = {
  runs: 0,
  tokens: { in: 0, out: 0, cached: 0 },
  estUSD: 0,
  source: 'estimate',
  caps: { ...DEFAULT_BUDGET },
  remaining: {
    perRunTokens: DEFAULT_BUDGET.perRunTokens,
    perRunUSD: DEFAULT_BUDGET.perRunUSD,
    dailyTokens: DEFAULT_BUDGET.dailyTokens,
    dailyUSD: DEFAULT_BUDGET.dailyUSD
  }
};

export const useAgent = create<AgentStore>((set, get) => ({
  detect: null,
  runs: {},
  activeRunId: null,
  costToday: null,
  budget: { ...DEFAULT_BUDGET },
  unsubscribe: null,
  settingsOpen: false,

  async init() {
    get().teardown();
    await Promise.all([
      get().refreshDetect(),
      get().refreshList(),
      get().refreshCostToday(),
      get().refreshBudget()
    ]);
    const off = window.orbit.agent.onEvent(({ runId, event }) => {
      const state = get();
      // Halt/warn events carry their own runId in data; use that when the
      // envelope runId is empty (start-time soft warns).
      if (event.kind === 'budget_halt') {
        const payload = (event.data as BudgetHaltPayload | undefined) ?? {
          runId,
          reason: 'per_run_token_limit',
          tokens: 0,
          usd: 0
        };
        const target = payload.runId || runId;
        const existing = state.runs[target];
        if (existing) {
          set({ runs: { ...state.runs, [target]: { ...existing, halt: payload } } });
        }
        void get().refreshCostToday();
        return;
      }
      if (event.kind === 'budget_warn') {
        // Meter will refresh via cost event below; nothing else to do.
        return;
      }
      const existing = state.runs[runId];
      if (!existing) {
        // Run spawned by dispatch in the background — bootstrap a
        // placeholder entry so LiveEventStream can render immediately,
        // then backfill the full summary list asynchronously.
        const placeholder: RunState = {
          summary: {
            runId,
            taskId: null,
            status: 'running',
            startedAt: event.at,
            cwd: ''
          },
          events: [event]
        };
        set({ runs: { ...state.runs, [runId]: placeholder } });
        void get().refreshList();
        return;
      }
      const events = [...existing.events, event];
      if (events.length > 500) events.splice(0, events.length - 500);
      const nextRuns = { ...state.runs, [runId]: { ...existing, events } };
      set({ runs: nextRuns });
      if (event.kind === 'cost') void get().refreshCostToday();
      if (event.kind === 'done' || event.kind === 'error') {
        void get().refreshList();
        void get().refreshCostFor(runId);
        void get().refreshCostToday();
      }
    });
    set({ unsubscribe: off });
  },

  teardown() {
    get().unsubscribe?.();
    set({ unsubscribe: null });
  },

  async refreshDetect() {
    try {
      const d = await window.orbit.agent.detect();
      set({ detect: d });
    } catch {
      // ignore
    }
  },

  async refreshList() {
    try {
      const list = await window.orbit.agent.list();
      const prev = get().runs;
      const next: Record<string, RunState> = {};
      for (const s of list) {
        const existing = prev[s.runId];
        next[s.runId] = existing
          ? { ...existing, summary: s }
          : { summary: s, events: await window.orbit.agent.tail(s.runId) };
      }
      set({
        runs: next,
        activeRunId:
          get().activeRunId && next[get().activeRunId!]
            ? get().activeRunId
            : (list[0]?.runId ?? null)
      });
    } catch {
      // ignore
    }
  },

  async refreshCostToday() {
    try {
      const c = await window.orbit.agent.costToday();
      set({ costToday: c });
    } catch {
      set({ costToday: EMPTY_COST });
    }
  },

  async refreshCostFor(runId: string) {
    try {
      const c = await window.orbit.agent.costRun(runId);
      const existing = get().runs[runId];
      if (!existing) return;
      set({ runs: { ...get().runs, [runId]: { ...existing, cost: c } } });
    } catch {
      // ignore
    }
  },

  async refreshBudget() {
    try {
      const b = await window.orbit.agent.budgetGet();
      set({ budget: b });
    } catch {
      // ignore
    }
  },

  async updateBudget(partial: Partial<BudgetSettings>) {
    try {
      const b = await window.orbit.agent.budgetUpdate(partial);
      set({ budget: b });
      await get().refreshCostToday();
    } catch {
      // ignore
    }
  },

  openSettings() {
    set({ settingsOpen: true });
  },

  closeSettings() {
    set({ settingsOpen: false });
  },

  select(runId: string) {
    set({ activeRunId: runId });
    void get().refreshCostFor(runId);
  },

  async startForTask(taskId: string, opts?: StartOpts) {
    const instructions = opts?.instructions;
    const args: {
      taskId: string;
      instructions?: string;
      worktreePath?: string;
    } = { taskId };
    if (instructions) args.instructions = instructions;
    if (opts?.useWorktree) {
      try {
        const rec = await window.orbit.git.createWorktree({ taskId });
        args.worktreePath = rec.path;
      } catch (e) {
        return {
          kind: 'error',
          code: 'spawn_failed',
          message: `worktree: ${(e as Error).message}`
        } satisfies StartTaskResult;
      }
    }
    const res = await window.orbit.agent.startTask(args);
    if (res.kind === 'ok') {
      await get().refreshList();
      set({ activeRunId: res.runId });
    }
    return res;
  },

  async stop(runId: string) {
    await window.orbit.agent.stop(runId);
    await get().refreshList();
  }
}));
