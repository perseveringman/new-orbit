import type {
  AgentEvent,
  BudgetBlockCode,
  BudgetHaltPayload,
  CostRecord
} from '@shared/agent';
import type { BudgetSettings } from '@shared/schemas';
import type { RunnerPool, PoolEvent } from './pool';
import { appendCostRecord, costToday, estimateUsd } from './tokens';

/**
 * Runtime circuit-breaker. Watches every runner's `cost` events and kills
 * a run the moment its running totals (or the day's cumulative totals)
 * cross the configured caps. Emits structured `budget_warn` / `budget_halt`
 * events through the pool so the renderer can surface banners + toasts.
 *
 * Design notes:
 * - Per-run totals track the max observed `input/output/total_cost` from
 *   the stream (the CLI reports cumulative turn totals; we take the max).
 * - Daily totals are refreshed on each decision via `costToday()` so we
 *   respect records written by earlier runs this UTC day. We add the
 *   current in-flight run's running total on top since that portion
 *   isn't appended to the cost log until the run exits.
 * - Warn-once semantics: once warned for a given run we never warn again,
 *   even if subsequent cost events also cross the threshold.
 */

export interface BudgetProvider {
  /** Resolve the current `BudgetSettings`. Called on every cost update. */
  get(): Promise<BudgetSettings>;
}

interface RunTotals {
  tokens: number;
  usd: number;
  warned: boolean;
  halted: boolean;
}

export interface BudgetWatchDeps {
  pool: RunnerPool;
  vaultPath: string;
  budget: BudgetProvider;
  /** Override kill for tests. Defaults to `pool.kill`. */
  kill?: (runId: string, reason?: string) => Promise<void>;
  /** Override cost-today reader for tests. Defaults to `costToday`. */
  readCostToday?: (vaultPath: string) => Promise<{
    tokens: { in: number; out: number; cached: number };
    estUSD: number;
  }>;
  /** Override cost-record append for tests. */
  appendRecord?: (vaultPath: string, rec: CostRecord) => Promise<void>;
  /** Clock for deterministic timestamps in tests. */
  now?: () => Date;
  /** Resolve a `taskId` for a runId if the pool knows it. */
  taskIdOf?: (runId: string) => string | null;
}

export class BudgetWatch {
  private readonly pool: RunnerPool;
  private readonly vaultPath: string;
  private readonly budget: BudgetProvider;
  private readonly kill: (runId: string, reason?: string) => Promise<void>;
  private readonly readCostToday: (vaultPath: string) => Promise<{
    tokens: { in: number; out: number; cached: number };
    estUSD: number;
  }>;
  private readonly appendRecord: (vaultPath: string, rec: CostRecord) => Promise<void>;
  private readonly now: () => Date;
  private readonly taskIdOf: (runId: string) => string | null;
  private readonly totals = new Map<string, RunTotals>();
  private listener: ((ev: PoolEvent) => void) | null = null;

  constructor(deps: BudgetWatchDeps) {
    this.pool = deps.pool;
    this.vaultPath = deps.vaultPath;
    this.budget = deps.budget;
    this.kill =
      deps.kill ?? ((runId: string, reason?: string) => this.pool.kill(runId, reason));
    this.readCostToday = deps.readCostToday ?? costToday;
    this.appendRecord = deps.appendRecord ?? appendCostRecord;
    this.now = deps.now ?? ((): Date => new Date());
    this.taskIdOf =
      deps.taskIdOf ??
      ((runId: string): string | null => this.pool.get(runId)?.summary.taskId ?? null);
  }

  attach(): void {
    if (this.listener) return;
    this.listener = (ev: PoolEvent): void => {
      void this.onEvent(ev);
    };
    this.pool.on('event', this.listener);
  }

  detach(): void {
    if (!this.listener) return;
    this.pool.off('event', this.listener);
    this.listener = null;
  }

  /** Test hook. */
  totalsFor(runId: string): RunTotals | undefined {
    return this.totals.get(runId);
  }

  private async onEvent(ev: PoolEvent): Promise<void> {
    const { runId, event } = ev;
    if (event.kind === 'done' || event.kind === 'error') {
      this.totals.delete(runId);
      return;
    }
    if (event.kind !== 'cost') return;
    const state = this.updateTotals(runId, event);
    if (state.halted) return;

    const budget = await this.budget.get();
    const today = await this.readCostToday(this.vaultPath);
    const todayTokens = today.tokens.in + today.tokens.out;
    const todayUSD = today.estUSD;

    type Cap = { code: BudgetBlockCode; limit: number | null; used: number };
    const caps: Cap[] = [
      { code: 'per_run_token_limit', limit: budget.perRunTokens, used: state.tokens },
      { code: 'per_run_usd_limit', limit: budget.perRunUSD, used: state.usd },
      {
        code: 'daily_token_limit',
        limit: budget.dailyTokens,
        used: todayTokens + state.tokens
      },
      { code: 'daily_usd_limit', limit: budget.dailyUSD, used: todayUSD + state.usd }
    ];

    // Halt check.
    for (const c of caps) {
      if (c.limit === null) continue;
      if (c.used >= c.limit) {
        if (!budget.hardStop) {
          // Soft mode: warn once and keep running.
          if (!state.warned) {
            state.warned = true;
            this.emit(runId, {
              kind: 'budget_warn',
              data: {
                runId,
                reason: c.code,
                tokens: state.tokens,
                usd: state.usd,
                message: `${c.code} reached in soft mode`
              }
            });
          }
          return;
        }
        state.halted = true;
        const payload: BudgetHaltPayload = {
          runId,
          reason: c.code,
          tokens: state.tokens,
          usd: state.usd
        };
        this.emit(runId, { kind: 'budget_halt', data: payload });
        await this.appendRecord(this.vaultPath, {
          runId,
          taskId: this.taskIdOf(runId),
          at: this.now().toISOString(),
          input: state.tokens,
          output: 0,
          cached: 0,
          cacheCreation: 0,
          estUSD: state.usd,
          source: 'estimate',
          reason: 'budget_halt'
        });
        await this.kill(runId, `budget_halt:${c.code}`);
        return;
      }
    }

    // Warn check — at `warnAtPercent` of the *most-constraining* cap. Only
    // fire once per run.
    if (state.warned) return;
    const warnRatio = budget.warnAtPercent / 100;
    let worst: { code: BudgetBlockCode; pct: number } | null = null;
    for (const c of caps) {
      if (c.limit === null || c.limit === 0) continue;
      const pct = c.used / c.limit;
      if (pct >= warnRatio && (!worst || pct > worst.pct)) {
        worst = { code: c.code, pct };
      }
    }
    if (worst) {
      state.warned = true;
      this.emit(runId, {
        kind: 'budget_warn',
        data: {
          runId,
          reason: worst.code,
          tokens: state.tokens,
          usd: state.usd,
          pct: worst.pct,
          message: `approaching ${worst.code}`
        }
      });
    }
  }

  private updateTotals(runId: string, event: AgentEvent): RunTotals {
    let t = this.totals.get(runId);
    if (!t) {
      t = { tokens: 0, usd: 0, warned: false, halted: false };
      this.totals.set(runId, t);
    }
    const inTok = event.input_tokens ?? 0;
    const outTok = event.output_tokens ?? 0;
    const tokens = inTok + outTok;
    // Cost events are cumulative per turn — take the max so late-arriving
    // totals win (mirrors AgentRunner.mergeTally).
    if (tokens > t.tokens) t.tokens = tokens;
    const usd =
      typeof event.total_cost_usd === 'number'
        ? event.total_cost_usd
        : estimateUsd(inTok, outTok);
    if (usd > t.usd) t.usd = usd;
    return t;
  }

  private emit(
    runId: string,
    ev: { kind: 'budget_halt' | 'budget_warn'; data: unknown }
  ): void {
    const full: AgentEvent = {
      idx: -1,
      at: this.now().toISOString(),
      kind: ev.kind,
      data: ev.data
    };
    this.pool.emit('event', { runId, event: full });
  }
}

let singleton: BudgetWatch | null = null;

export function installBudgetWatch(deps: BudgetWatchDeps): BudgetWatch {
  if (singleton) singleton.detach();
  singleton = new BudgetWatch(deps);
  singleton.attach();
  return singleton;
}

export function resetBudgetWatchForTesting(): void {
  singleton?.detach();
  singleton = null;
}
