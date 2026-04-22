import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BudgetGate,
  appendCostRecord,
  computeRemaining
} from '../src/main/agent/tokens';
import { DEFAULT_BUDGET, type BudgetSettings } from '../src/shared/schemas';
import type { CostRecord } from '../src/shared/agent';

async function mkVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'orbit-budget-'));
}

function rec(partial: Partial<CostRecord>): CostRecord {
  return {
    runId: partial.runId ?? 'r',
    taskId: partial.taskId ?? null,
    at: partial.at ?? new Date().toISOString(),
    input: partial.input ?? 0,
    output: partial.output ?? 0,
    cached: 0,
    cacheCreation: 0,
    estUSD: partial.estUSD ?? 0,
    source: 'cli'
  };
}

describe('BudgetGate', () => {
  it('blocks per-run token limit at estimate >= limit', async () => {
    const vault = await mkVault();
    try {
      const budget: BudgetSettings = {
        ...DEFAULT_BUDGET,
        perRunTokens: 1000,
        perRunUSD: null,
        dailyTokens: null,
        dailyUSD: null
      };
      const r = await BudgetGate.check(
        { estInputTokens: 1000 },
        { vaultPath: vault, budget }
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('per_run_token_limit');
        expect(r.limit).toBe(1000);
      }
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('passes when all caps are null (unlimited)', async () => {
    const vault = await mkVault();
    try {
      const budget: BudgetSettings = {
        perRunTokens: null,
        perRunUSD: null,
        dailyTokens: null,
        dailyUSD: null,
        warnAtPercent: 80,
        hardStop: true
      };
      const r = await BudgetGate.check(
        { estInputTokens: 10_000_000 },
        { vaultPath: vault, budget }
      );
      expect(r.ok).toBe(true);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('blocks daily token limit when today total + estimate >= cap', async () => {
    const vault = await mkVault();
    try {
      const today = new Date().toISOString();
      // Seed 900 tokens for today.
      await appendCostRecord(
        vault,
        rec({ runId: 'a', at: today, input: 400, output: 500 })
      );
      const budget: BudgetSettings = {
        ...DEFAULT_BUDGET,
        perRunTokens: null,
        perRunUSD: null,
        dailyTokens: 1000,
        dailyUSD: null
      };
      const r = await BudgetGate.check(
        { estInputTokens: 200 },
        { vaultPath: vault, budget }
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('daily_token_limit');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('hardStop=false returns ok with warning field', async () => {
    const vault = await mkVault();
    try {
      const budget: BudgetSettings = {
        perRunTokens: 100,
        perRunUSD: null,
        dailyTokens: null,
        dailyUSD: null,
        warnAtPercent: 80,
        hardStop: false
      };
      const r = await BudgetGate.check(
        { estInputTokens: 500 },
        { vaultPath: vault, budget }
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.warning).toBeDefined();
        expect(r.warning?.code).toBe('per_run_token_limit');
      }
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('blocks per-run USD limit against estimate', async () => {
    const vault = await mkVault();
    try {
      const budget: BudgetSettings = {
        ...DEFAULT_BUDGET,
        perRunTokens: null,
        perRunUSD: 0.001,
        dailyTokens: null,
        dailyUSD: null
      };
      const r = await BudgetGate.check(
        { estInputTokens: 10_000_000, estUSD: 5 },
        { vaultPath: vault, budget }
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('per_run_usd_limit');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});

describe('computeRemaining', () => {
  it('computes daily remaining and exposes raw caps for per-run', () => {
    const r = computeRemaining(
      {
        perRunTokens: 1000,
        perRunUSD: 2,
        dailyTokens: 5000,
        dailyUSD: 10,
        warnAtPercent: 80,
        hardStop: true
      },
      { tokens: 2000, usd: 3 }
    );
    expect(r.perRunTokens).toBe(1000);
    expect(r.perRunUSD).toBe(2);
    expect(r.dailyTokens).toBe(3000);
    expect(r.dailyUSD).toBe(7);
  });
  it('preserves null caps as null', () => {
    const r = computeRemaining(
      {
        perRunTokens: null,
        perRunUSD: null,
        dailyTokens: null,
        dailyUSD: null,
        warnAtPercent: 80,
        hardStop: true
      },
      { tokens: 9_999_999, usd: 100 }
    );
    expect(r.dailyTokens).toBeNull();
    expect(r.dailyUSD).toBeNull();
  });
});
