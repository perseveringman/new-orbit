import { describe, expect, it } from 'vitest';
import {
  clipHeadTail,
  composeDistillPrompt,
  parseDistillResponse,
  renderDistillBody
} from '../src/main/distill/prompt';
import { DISTILL_SECTIONS } from '../src/main/distill/persona';
import type { TaskRecord } from '../src/shared/schemas';
import type { CostRecord } from '../src/shared/agent';

function task(over: Partial<TaskRecord>): TaskRecord {
  return {
    id: over.id ?? 'inline:foo.md:1',
    source: over.source ?? 'inline',
    status: over.status ?? 'done',
    title: over.title ?? 'Do the thing',
    filePath: '/v/foo.md',
    relPath: 'foo.md',
    ...over
  };
}

function cost(over: Partial<CostRecord>): CostRecord {
  return {
    runId: over.runId ?? 'r1',
    taskId: over.taskId ?? null,
    at: over.at ?? '2025-06-01T00:00:00.000Z',
    input: over.input ?? 100,
    output: over.output ?? 200,
    cached: over.cached ?? 0,
    cacheCreation: 0,
    estUSD: over.estUSD ?? 0.005,
    source: 'estimate'
  };
}

describe('clipHeadTail', () => {
  it('passes through short bodies unchanged', () => {
    expect(clipHeadTail('short', 100)).toBe('short');
  });
  it('keeps head + tail when clipping', () => {
    const body = 'A'.repeat(20) + 'B'.repeat(500) + 'C'.repeat(20);
    const clipped = clipHeadTail(body, 80);
    expect(clipped.startsWith('A')).toBe(true);
    expect(clipped.endsWith('C')).toBe(true);
    expect(clipped).toMatch(/truncated/);
    expect(clipped.length).toBeLessThan(body.length);
  });
});

describe('composeDistillPrompt', () => {
  it('contains required section headers and all inputs', () => {
    const prompt = composeDistillPrompt({
      projectUid: 'PROJUID',
      projectTitle: 'Orbit M7',
      archivedRelPath: '04_Archives/2025/Orbit-M7.md',
      projectBody: 'project body text goes here',
      relatedFiles: [
        { relPath: '03_Resources/spec.md', title: 'Spec', body: 'spec content' }
      ],
      tasks: [
        task({ title: 'Wire IPC', relPath: '04_Archives/2025/Orbit-M7.md' }),
        task({ title: 'Draft tests', status: 'backlog' })
      ],
      gitLog: [
        { at: '2025-05-01T00:00:00Z', kind: 'commit', message: 'init', sha: 'abc' }
      ],
      costRecords: [cost({ input: 10_000, output: 5_000 })],
      lifecycle: { from: '2025-05-01T00:00:00Z', to: '2025-06-01T00:00:00Z' }
    });

    for (const s of DISTILL_SECTIONS) {
      expect(prompt).toContain(`## ${s}`);
    }
    expect(prompt).toContain('# Persona');
    expect(prompt).toContain('Orbit M7');
    expect(prompt).toContain('PROJUID');
    expect(prompt).toContain('04_Archives/2025/Orbit-M7.md');
    expect(prompt).toContain('03_Resources/spec.md');
    expect(prompt).toContain('Wire IPC');
    // Only closed tasks listed — the inbox one should be filtered
    expect(prompt).not.toMatch(/Draft tests/);
    expect(prompt).toContain('commit');
    expect(prompt).toMatch(/Cost snapshot/);
    expect(prompt).toMatch(/records: 1/);
  });

  it('clips an oversized project body', () => {
    const big = 'x'.repeat(30_000);
    const prompt = composeDistillPrompt({
      projectUid: 'u',
      projectTitle: 't',
      archivedRelPath: 'r',
      projectBody: big,
      relatedFiles: [],
      tasks: [],
      gitLog: [],
      costRecords: []
    });
    expect(prompt).toMatch(/truncated/);
    // Should be dramatically shorter than raw 30k
    expect(prompt.length).toBeLessThan(20_000);
  });
});

describe('parseDistillResponse / renderDistillBody', () => {
  it('extracts each section and fills missing with (none)', () => {
    const txt = `## Vision
orbit vision text
## Key Decisions
- chose hash embedding
## Artifacts & Code
- src/main/vector/index.ts
## Cost Snapshot
minor cost
`;
    const parsed = parseDistillResponse(txt);
    expect(parsed['Vision']).toMatch(/orbit vision text/);
    expect(parsed['Key Decisions']).toMatch(/hash embedding/);
    expect(parsed['Lessons Learned']).toBe('(none)');
    const body = renderDistillBody(parsed);
    for (const s of DISTILL_SECTIONS) expect(body).toContain(`## ${s}`);
  });
});
