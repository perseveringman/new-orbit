/**
 * Shared agent types used by main + renderer. Keep in sync with
 * src/main/agent/* modules and the `agent:*` IPC channels.
 */

export type AgentEventKind =
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'cost'
  | 'error'
  | 'done'
  | 'text'
  | 'hydrate'
  | 'budget_warn'
  | 'budget_halt';

export interface AgentCostTally {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_cost_usd?: number;
}

export interface AgentEvent extends AgentCostTally {
  idx: number;
  at: string; // ISO timestamp
  kind: AgentEventKind;
  data?: unknown;
  text?: string;
  toolName?: string;
}

export type RunStatus = 'starting' | 'running' | 'done' | 'error' | 'killed';

export interface RunSummary {
  runId: string;
  taskId: string | null;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  reason?: string;
  cwd: string;
  title?: string;
}

export interface DetectResult {
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface StartTaskArgs {
  taskId: string;
  instructions?: string;
  worktreePath?: string;
}

export interface StartResult {
  kind: 'ok';
  runId: string;
}

export interface StartError {
  kind: 'error';
  code:
    | 'cli_missing'
    | 'task_not_found'
    | 'no_vault'
    | 'already_running'
    | 'spawn_failed'
    | 'safety_blocked'
    | 'budget_blocked';
  message: string;
}

export type StartTaskResult = StartResult | StartError;

export interface TailQuery {
  sinceEventIdx?: number;
}

export interface CostSummary {
  runs: number;
  tokens: {
    in: number;
    out: number;
    cached: number;
  };
  estUSD: number;
  source: 'cli' | 'estimate' | 'mixed';
}

export interface CostRecord {
  runId: string;
  taskId: string | null;
  at: string;
  input: number;
  output: number;
  cached: number;
  cacheCreation: number;
  estUSD: number;
  source: 'cli' | 'estimate';
  /** Optional marker for special-case cost records. */
  reason?: 'budget_halt' | 'distilled';
}

// --- M6 budget surface ---
import type { BudgetSettings } from './schemas';

export interface BudgetRemaining {
  perRunTokens: number | null;
  perRunUSD: number | null;
  dailyTokens: number | null;
  dailyUSD: number | null;
}

/** Shape returned by `agent.costToday()` from M6 onward. */
export interface CostTodayResult extends CostSummary {
  caps: BudgetSettings;
  remaining: BudgetRemaining;
}

export type BudgetBlockCode =
  | 'per_run_token_limit'
  | 'per_run_usd_limit'
  | 'daily_token_limit'
  | 'daily_usd_limit';

export interface BudgetCheckOk {
  ok: true;
  warning?: {
    code: BudgetBlockCode;
    message: string;
  };
}

export interface BudgetCheckBlocked {
  ok: false;
  code: BudgetBlockCode;
  limit: number;
  remaining: number;
  message: string;
}

export type BudgetCheckResult = BudgetCheckOk | BudgetCheckBlocked;

export interface BudgetHaltPayload {
  runId: string;
  reason: BudgetBlockCode;
  tokens: number;
  usd: number;
}

export interface DailyReportResult {
  /** Absolute path the report *would* be written to if saved. */
  path: string;
  /** Rendered markdown content. Not written to disk by default. */
  markdown: string;
  /** YYYY-MM-DD — the UTC day the report summarizes. */
  date: string;
}
