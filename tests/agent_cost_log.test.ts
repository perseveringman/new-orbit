import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendCostRecord, readCostRecords } from '../src/main/agent/tokens';
import type { CostRecord } from '../src/shared/agent';

function rec(runId: string, i: number): CostRecord {
  return {
    runId,
    taskId: null,
    at: new Date().toISOString(),
    input: i,
    output: i * 2,
    cached: 0,
    cacheCreation: 0,
    estUSD: 0.0001 * i,
    source: 'estimate'
  };
}

describe('cost log atomic append', () => {
  it('two concurrent runs produce N records in the monthly file', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-cost-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'cost'), { recursive: true });
      const N = 20;
      const writes: Promise<void>[] = [];
      for (let i = 0; i < N; i++) {
        writes.push(appendCostRecord(vault, rec(i % 2 === 0 ? 'a' : 'b', i)));
      }
      await Promise.all(writes);
      const recs = await readCostRecords(vault);
      expect(recs.length).toBe(N);
      expect(recs.filter((r) => r.runId === 'a').length).toBe(N / 2);
      expect(recs.filter((r) => r.runId === 'b').length).toBe(N / 2);
      // Records round-trip cleanly (i.e. no corrupted JSON lines).
      for (const r of recs) expect(typeof r.input).toBe('number');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
