import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatDailyReport,
  generateDailyReport,
  COST_REPORT_DIR
} from '../src/main/agent/cost_report';
import { appendCostRecord } from '../src/main/agent/tokens';
import type { CostRecord } from '../src/shared/agent';

function rec(over: Partial<CostRecord>): CostRecord {
  return {
    runId: over.runId ?? 'r1',
    taskId: over.taskId ?? null,
    at: over.at ?? new Date().toISOString(),
    input: over.input ?? 100,
    output: over.output ?? 200,
    cached: over.cached ?? 0,
    cacheCreation: 0,
    estUSD: over.estUSD ?? 0.01,
    source: 'cli',
    ...(over.reason ? { reason: over.reason } : {})
  };
}

describe('formatDailyReport', () => {
  it('renders totals, top-5 table and halts section', () => {
    const day = '2025-06-15';
    const records = [
      rec({ runId: 'a', taskId: 't1', input: 100, output: 200, estUSD: 0.1 }),
      rec({ runId: 'a', taskId: 't1', input: 50, output: 50, estUSD: 0.05 }),
      rec({ runId: 'b', taskId: 't2', input: 1000, output: 1000, estUSD: 0.8 }),
      rec({
        runId: 'c',
        taskId: null,
        input: 10,
        output: 10,
        estUSD: 0.001,
        reason: 'budget_halt'
      })
    ];
    const md = formatDailyReport(records, day);
    expect(md).toMatch(/# Orbit cost report — 2025-06-15/);
    expect(md).toMatch(/## Totals/);
    expect(md).toMatch(/Runs: \*\*3\*\*/);
    expect(md).toMatch(/Budget halts: \*\*1\*\*/);
    expect(md).toMatch(/## Top 5 tasks by cost/);
    expect(md).toMatch(/\| `t2` \| 1 \|/);
    expect(md).toMatch(/\| `t1` \| 1 \|/);
    expect(md).toMatch(/## Halts/);
    expect(md).toMatch(/`c`/);
    // Source classifier present.
    expect(md).toMatch(/Source: `cli`/);
  });

  it('empty input still produces a valid report', () => {
    const md = formatDailyReport([], '2025-01-01');
    expect(md).toMatch(/# Orbit cost report — 2025-01-01/);
    expect(md).toMatch(/_No cost records for this day\._/);
  });
});

describe('generateDailyReport', () => {
  it('reads the day from NDJSON and builds a valid markdown + target path', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-report-'));
    try {
      const now = new Date();
      await appendCostRecord(vault, rec({ at: now.toISOString(), runId: 'x', taskId: 'tX' }));
      const r = await generateDailyReport(vault, now);
      expect(r.date).toBe(now.toISOString().slice(0, 10));
      expect(r.path).toBe(
        path.join(vault, COST_REPORT_DIR[0], COST_REPORT_DIR[1], `${r.date}.md`)
      );
      expect(r.markdown).toMatch(/# Orbit cost report/);
      expect(r.markdown).toMatch(/`tX`/);
      // File should NOT have been written.
      await expect(fs.access(r.path)).rejects.toThrow();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
