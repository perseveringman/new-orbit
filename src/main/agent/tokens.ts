import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentCostTally, CostRecord, CostSummary } from '@shared/agent';
import { ORBIT_COST_DIR, ORBIT_DIR, ORBIT_WORKTREES_DIR } from '@shared/constants';

/**
 * Approximate token count from raw text. Deterministic: simply
 * `ceil(chars / 4)` which tracks OpenAI/Anthropic averages well
 * enough for budget UIs. Labeled as an estimate at the call site.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Heuristic USD cost. We conservatively price at $3/Mtok input,
 * $15/Mtok output (Sonnet-ish). Callers with CLI-reported `total_cost_usd`
 * should use that directly.
 */
export function estimateUsd(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function monthFile(vaultPath: string, at = new Date()): string {
  const ym = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  return path.join(vaultPath, ORBIT_DIR, ORBIT_COST_DIR, `${ym}.json`);
}

async function ensureDir(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
}

/**
 * Append a cost record as newline-delimited JSON. `appendFile` writes
 * below PIPE_BUF are atomic on POSIX, which is what we rely on to allow
 * concurrent runs to share the same monthly file.
 */
export async function appendCostRecord(
  vaultPath: string,
  record: CostRecord
): Promise<void> {
  const f = monthFile(vaultPath, new Date(record.at));
  await ensureDir(f);
  await fs.appendFile(f, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function readCostRecords(
  vaultPath: string,
  at = new Date()
): Promise<CostRecord[]> {
  const f = monthFile(vaultPath, at);
  let raw: string;
  try {
    raw = await fs.readFile(f, 'utf8');
  } catch {
    return [];
  }
  const out: CostRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as CostRecord);
    } catch {
      // tolerate truncated writes
    }
  }
  return out;
}

export function summarize(records: CostRecord[]): CostSummary {
  let inTok = 0;
  let outTok = 0;
  let cachedTok = 0;
  let usd = 0;
  let hasCli = false;
  let hasEst = false;
  for (const r of records) {
    inTok += r.input;
    outTok += r.output;
    cachedTok += r.cached;
    usd += r.estUSD;
    if (r.source === 'cli') hasCli = true;
    else hasEst = true;
  }
  return {
    runs: records.length,
    tokens: { in: inTok, out: outTok, cached: cachedTok },
    estUSD: Math.round(usd * 1_000_000) / 1_000_000,
    source: hasCli && hasEst ? 'mixed' : hasCli ? 'cli' : 'estimate'
  };
}

export async function costToday(vaultPath: string): Promise<CostSummary> {
  const all = await readCostRecords(vaultPath);
  const day = new Date().toISOString().slice(0, 10);
  return summarize(all.filter((r) => r.at.slice(0, 10) === day));
}

export async function costForRun(
  vaultPath: string,
  runId: string
): Promise<CostSummary> {
  // search the current month first, then previous month (cheap: two files max).
  const now = new Date();
  const prev = new Date(now);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const all = [
    ...(await readCostRecords(vaultPath, now)),
    ...(await readCostRecords(vaultPath, prev))
  ];
  return summarize(all.filter((r) => r.runId === runId));
}

/**
 * Produce a cost record from either a CLI-emitted tally or an estimator
 * fallback. `promptText`/`completionText` are only consulted when the
 * tally has no token counts.
 */
export function buildCostRecord(args: {
  runId: string;
  taskId: string | null;
  tally?: AgentCostTally;
  promptText?: string;
  completionText?: string;
  at?: string;
}): CostRecord {
  const t = args.tally ?? {};
  const hasCli =
    typeof t.input_tokens === 'number' ||
    typeof t.output_tokens === 'number' ||
    typeof t.total_cost_usd === 'number';
  const input = t.input_tokens ?? estimateTokens(args.promptText ?? '');
  const output = t.output_tokens ?? estimateTokens(args.completionText ?? '');
  const cached = t.cache_read_input_tokens ?? 0;
  const cacheCreation = t.cache_creation_input_tokens ?? 0;
  const estUSD =
    typeof t.total_cost_usd === 'number' ? t.total_cost_usd : estimateUsd(input, output);
  return {
    runId: args.runId,
    taskId: args.taskId,
    at: args.at ?? new Date().toISOString(),
    input,
    output,
    cached,
    cacheCreation,
    estUSD,
    source: hasCli ? 'cli' : 'estimate'
  };
}

export interface BudgetDecision {
  ok: boolean;
  reason?: string;
}

import type {
  BudgetCheckResult,
  BudgetBlockCode
} from '@shared/agent';
import type { BudgetSettings } from '@shared/schemas';

/**
 * Compute what's remaining under each cap given a snapshot of today's
 * usage. Null caps map to `null` remaining (= unlimited).
 */
export function computeRemaining(
  budget: BudgetSettings,
  today: { tokens: number; usd: number }
): { perRunTokens: number | null; perRunUSD: number | null; dailyTokens: number | null; dailyUSD: number | null } {
  return {
    perRunTokens: budget.perRunTokens,
    perRunUSD: budget.perRunUSD,
    dailyTokens:
      budget.dailyTokens === null ? null : Math.max(0, budget.dailyTokens - today.tokens),
    dailyUSD:
      budget.dailyUSD === null ? null : Math.max(0, budget.dailyUSD - today.usd)
  };
}

interface GateInput {
  /** Estimated input tokens for the run about to spawn. */
  estInputTokens: number;
  /** Optional estimated USD cost. Defaults to `estimateUsd(estInputTokens, 0)`. */
  estUSD?: number;
}

function messageFor(
  code: BudgetBlockCode,
  limit: number,
  attempted: number
): string {
  switch (code) {
    case 'per_run_token_limit':
      return `Per-run token cap (${limit.toLocaleString()}) would be exceeded by this spawn (est ${attempted.toLocaleString()}).`;
    case 'per_run_usd_limit':
      return `Per-run USD cap ($${limit.toFixed(2)}) would be exceeded by this spawn (est $${attempted.toFixed(4)}).`;
    case 'daily_token_limit':
      return `Daily token cap (${limit.toLocaleString()}) would be exceeded (est ${attempted.toLocaleString()}).`;
    case 'daily_usd_limit':
      return `Daily USD cap ($${limit.toFixed(2)}) would be exceeded (est $${attempted.toFixed(4)}).`;
  }
}

/**
 * Real M6 BudgetGate. Consults current-day totals + the user's configured
 * caps to decide whether a run may spawn. When `budget.hardStop` is false
 * the gate always allows the spawn but attaches a `warning` so the caller
 * can surface a toast.
 */
export const BudgetGate = {
  async check(
    input: GateInput,
    ctx: { vaultPath: string; budget: BudgetSettings }
  ): Promise<BudgetCheckResult> {
    const estUSD =
      typeof input.estUSD === 'number'
        ? input.estUSD
        : estimateUsd(input.estInputTokens, 0);
    const today = await costToday(ctx.vaultPath);
    const todayTokens = today.tokens.in + today.tokens.out;
    const todayUSD = today.estUSD;

    // Ordered by specificity — per-run first (cheapest to reason about).
    const checks: Array<{
      code: BudgetBlockCode;
      limit: number | null;
      attempted: number;
    }> = [
      {
        code: 'per_run_token_limit',
        limit: ctx.budget.perRunTokens,
        attempted: input.estInputTokens
      },
      {
        code: 'per_run_usd_limit',
        limit: ctx.budget.perRunUSD,
        attempted: estUSD
      },
      {
        code: 'daily_token_limit',
        limit: ctx.budget.dailyTokens,
        attempted: todayTokens + input.estInputTokens
      },
      {
        code: 'daily_usd_limit',
        limit: ctx.budget.dailyUSD,
        attempted: todayUSD + estUSD
      }
    ];

    for (const c of checks) {
      if (c.limit === null) continue;
      if (c.attempted >= c.limit) {
        const remaining = Math.max(0, c.limit - c.attempted);
        const msg = messageFor(c.code, c.limit, c.attempted);
        if (!ctx.budget.hardStop) {
          return { ok: true, warning: { code: c.code, message: msg } };
        }
        return {
          ok: false,
          code: c.code,
          limit: c.limit,
          remaining,
          message: msg
        };
      }
    }
    return { ok: true };
  }
};

export interface SafetyDecision {
  ok: boolean;
  reason?: string;
}

/**
 * Pre-spawn safety gate. Runs alongside the budget gate and enforces
 * two rules today:
 *  - `cwd` must be the vault root OR a path under
 *    `<vault>/.orbit/worktrees/`. Anywhere else is rejected so a
 *    malformed IPC call can't spawn an agent in an arbitrary directory.
 *  - The composed prompt must not exceed a hard 100 000-char limit.
 *    This is a guardrail against runaway hydration reply growth.
 */
export const MAX_PROMPT_CHARS = 100_000;

export const SafetyGate = {
  check(args: { cwd: string; prompt: string; vaultPath: string }): SafetyDecision {
    const vault = path.resolve(args.vaultPath);
    const cwd = path.resolve(args.cwd);
    const wtRoot =
      path.resolve(path.join(vault, ORBIT_DIR, ORBIT_WORKTREES_DIR)) + path.sep;
    const inVault = cwd === vault || cwd.startsWith(vault + path.sep);
    const inWorktrees = cwd.startsWith(wtRoot);
    if (!inVault && !inWorktrees) {
      return { ok: false, reason: `cwd outside vault: ${args.cwd}` };
    }
    if (inVault && !inWorktrees) {
      // cwd under vault, but fall through: fine (vault root or subdir).
    }
    if ((args.prompt ?? '').length > MAX_PROMPT_CHARS) {
      return {
        ok: false,
        reason: `prompt exceeds ${MAX_PROMPT_CHARS} chars (${args.prompt.length})`
      };
    }
    return { ok: true };
  }
};
