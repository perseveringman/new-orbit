import { describe, expect, it } from 'vitest';
import { compareGoldenNdjson } from './helpers/golden-compare';

describe('Agent Playground golden comparison', () => {
  it('passes identical normalized NDJSON sequences', () => {
    const line = '{"scenario_id":"scenario-01","kind":"done"}\n';

    expect(compareGoldenNdjson('scenario-01', 'scenario-01.ndjson', line, line)).toEqual({
      scenarioId: 'scenario-01',
      ok: true,
      goldenPath: 'scenario-01.ndjson',
      failures: []
    });
  });

  it('reports line-level differences', () => {
    const result = compareGoldenNdjson(
      'scenario-01',
      'scenario-01.ndjson',
      '{"kind":"done"}\n',
      '{"kind":"error"}\n'
    );

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('line 1');
  });
});
