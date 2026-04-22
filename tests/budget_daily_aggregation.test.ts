import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendCostRecord, costToday, summarize, readCostRecords } from '../src/main/agent/tokens';
import type { CostRecord } from '../src/shared/agent';

function rec(at: string, tokens: number, usd = tokens * 0.0001): CostRecord {
  return {
    runId: `r-${at}-${tokens}`,
    taskId: null,
    at,
    input: Math.floor(tokens / 2),
    output: Math.ceil(tokens / 2),
    cached: 0,
    cacheCreation: 0,
    estUSD: usd,
    source: 'cli'
  };
}

describe('daily cost aggregation', () => {
  it('today total excludes previous-day records even when same month', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-agg-'));
    try {
      // Pick "yesterday" at noon so it lands in the same month file when
      // possible, but costToday() still filters by UTC day.
      const nowIso = new Date().toISOString();
      const y = new Date();
      y.setUTCDate(y.getUTCDate() - 1);
      const yIso = y.toISOString();

      await appendCostRecord(vault, rec(yIso, 1000, 0.5));
      await appendCostRecord(vault, rec(nowIso, 300, 0.03));
      await appendCostRecord(vault, rec(nowIso, 700, 0.07));

      const today = await costToday(vault);
      expect(today.runs).toBe(2);
      expect(today.tokens.in + today.tokens.out).toBe(1000);
      expect(today.estUSD).toBeCloseTo(0.1, 6);

      // The underlying log contains every record we wrote for "this month";
      // if y was in a different month the current-month file still has 2.
      const all = await readCostRecords(vault);
      expect(summarize(all).runs).toBeGreaterThanOrEqual(2);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
