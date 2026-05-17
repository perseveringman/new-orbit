import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RuntimeRouteDecision } from '@shared/runtime';
import { SynthesisRunner, type SynthesisRuntimeRouter, createSynthesisJob } from '../src/main/synthesis/runner';
import { SynthesisScheduler } from '../src/main/synthesis/scheduler';
import { synthesisDlqDir } from '../src/main/synthesis/index-file';
import { createSynthesisStore, type SynthesisStore } from '../src/main/synthesis/store';

describe('Synthesis Layer foundation', () => {
  let vault: string;
  let store: SynthesisStore;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-synthesis-'));
    store = createSynthesisStore(vault);
  });

  afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('writes artifacts and indexes latest by scope key', async () => {
    const artifact = await store.writeFresh({
      kind: 'summary.daily',
      scope_key: 'daily:2026-04-28',
      sources: [{ kind: 'timeline_range', ref: '2026-04-28' }],
      provenance: provenance('summary.daily.v2'),
      payload: { headline: 'Day', narrative: 'A day', highlights: [] }
    });
    expect(await store.latest('daily:2026-04-28')).toMatchObject({ id: artifact.id, status: 'fresh' });
  });

  it('supersedes old artifacts on recompute instead of overwriting', async () => {
    const first = await store.writeFresh({
      kind: 'summary.daily',
      scope_key: 'daily:2026-04-28',
      sources: [{ kind: 'timeline_range', ref: '2026-04-28' }],
      provenance: provenance('summary.daily.v2'),
      payload: { headline: 'Old', narrative: 'Old', highlights: [] }
    });
    const second = await store.writeFresh({
      kind: 'summary.daily',
      scope_key: 'daily:2026-04-28',
      sources: [{ kind: 'timeline_range', ref: '2026-04-28' }],
      provenance: provenance('summary.daily.v2'),
      payload: { headline: 'New', narrative: 'New', highlights: [] }
    });
    expect(await store.get(first.id)).toMatchObject({ status: 'superseded', superseded_by: second.id });
    expect(await store.latest('daily:2026-04-28')).toMatchObject({ id: second.id, status: 'fresh' });
  });

  it('marks fresh artifacts stale without mutating payload', async () => {
    const artifact = await store.writeFresh({
      kind: 'distill.library',
      scope_key: 'library:item-1',
      sources: [{ kind: 'library', ref: 'item-1' }],
      provenance: provenance('distill.library.v1'),
      payload: { title: 'Item', summary: 'Summary', key_points: [], suggested_note_type: 'capture' }
    });
    const stale = await store.markStale('library:item-1', 'library.item.annotated');
    expect(stale).toMatchObject({ id: artifact.id, status: 'stale', error: 'library.item.annotated' });
  });

  it('scheduler rejects jobs over budget and writes DLQ entries', async () => {
    const scheduler = new SynthesisScheduler(store, new SynthesisRunner(store, { maxBudgetUsd: 0 }));
    await expect(
      scheduler.ensure({
        kind: 'summary.daily',
        scope_key: 'daily:budget',
        sources: [{ kind: 'timeline_range', ref: 'budget' }]
      })
    ).rejects.toThrow(/synthesis_budget_exceeded/);
    await expect(readdir(synthesisDlqDir(vault))).resolves.toHaveLength(1);
  });

  it('stores prompt version and provenance for generated artifacts', async () => {
    const artifact = await new SynthesisRunner(store).run(
      createSynthesisJob({
        kind: 'summary.daily',
        scope_key: 'daily:provenance',
        sources: [{ kind: 'timeline_range', ref: 'provenance', metadata: { entries: [], stats: { total_events: 0 } } }]
      })
    );
    expect(artifact.provenance).toMatchObject({
      runtime: 'local:heuristic',
      model: 'orbit-local-heuristic',
      prompt_version: 'summary.daily.v2'
    });
  });

  it('turns malformed model output into a failed artifact and DLQ entry', async () => {
    const router: SynthesisRuntimeRouter = {
      decide: async (): Promise<RuntimeRouteDecision> => ({
        mode: 'synthesis',
        track: 'sdk',
        runtime: 'sdk:anthropic',
        endpointId: 'anthropic',
        model: 'claude-test',
        reason: 'test'
      }),
      stream: async () => ({
        text: '{not valid json',
        eventIds: [],
        inputTokens: 10,
        outputTokens: 3
      })
    };
    const artifact = await new SynthesisRunner(store, { router }).run(
      createSynthesisJob({
        kind: 'summary.daily',
        scope_key: 'daily:malformed',
        sources: [{ kind: 'timeline_range', ref: 'malformed' }]
      })
    );
    expect(artifact.status).toBe('failed');
    await expect(readdir(synthesisDlqDir(vault))).resolves.toHaveLength(1);
  });
});

function provenance(promptVersion: string) {
  return {
    runtime: 'local:test',
    model: 'test',
    prompt_version: promptVersion,
    generated_at: new Date().toISOString()
  };
}
