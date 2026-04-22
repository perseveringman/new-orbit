import { describe, expect, it } from 'vitest';
import {
  estimateTokens,
  estimateUsd,
  buildCostRecord,
  summarize
} from '../src/main/agent/tokens';

describe('token estimator', () => {
  it('is deterministic for known input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1); // 4 chars / 4 = 1
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens('a'.repeat(1000))).toBe(250);
  });

  it('estimateUsd scales linearly and rounds to 6 decimals', () => {
    expect(estimateUsd(1_000_000, 0)).toBe(3);
    expect(estimateUsd(0, 1_000_000)).toBe(15);
    expect(estimateUsd(0, 0)).toBe(0);
  });
});

describe('cost record builder', () => {
  it('uses CLI tally when present and labels source cli', () => {
    const r = buildCostRecord({
      runId: 'r1',
      taskId: 't1',
      tally: {
        input_tokens: 100,
        output_tokens: 200,
        total_cost_usd: 0.01,
        cache_read_input_tokens: 30
      },
      promptText: 'abcd',
      completionText: 'efgh'
    });
    expect(r.source).toBe('cli');
    expect(r.input).toBe(100);
    expect(r.output).toBe(200);
    expect(r.cached).toBe(30);
    expect(r.estUSD).toBe(0.01);
  });
  it('falls back to estimator when tally absent', () => {
    const r = buildCostRecord({
      runId: 'r1',
      taskId: null,
      promptText: 'a'.repeat(40),
      completionText: 'b'.repeat(40)
    });
    expect(r.source).toBe('estimate');
    expect(r.input).toBe(10);
    expect(r.output).toBe(10);
    expect(r.estUSD).toBeGreaterThan(0);
  });
});

describe('summarize', () => {
  it('aggregates records and classifies source', () => {
    const s = summarize([
      {
        runId: 'a',
        taskId: null,
        at: '2025-01-01T00:00:00Z',
        input: 10,
        output: 20,
        cached: 5,
        cacheCreation: 0,
        estUSD: 0.001,
        source: 'cli'
      },
      {
        runId: 'b',
        taskId: null,
        at: '2025-01-01T00:00:00Z',
        input: 30,
        output: 40,
        cached: 0,
        cacheCreation: 0,
        estUSD: 0.002,
        source: 'estimate'
      }
    ]);
    expect(s.runs).toBe(2);
    expect(s.tokens).toEqual({ in: 40, out: 60, cached: 5 });
    expect(s.source).toBe('mixed');
  });
});
