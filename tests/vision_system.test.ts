import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGoalStore } from '../src/main/vision/goal-store';
import { runVisionReview } from '../src/main/vision/review';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-vision-'));
});

afterEach(async () => {
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Vision System', () => {
  it('creates goals with milestones and preserves hierarchy refs', async () => {
    const store = createGoalStore(vaultPath);
    const parent = await store.create({ title: 'Build meaningful software', horizon: '5y', area_refs: ['coding'] });
    const child = await store.create({ title: 'Ship Orbit', horizon: 'quarter', parent_goal_id: parent.id, area_refs: ['coding'], milestones: [{ title: 'Semantic Search' }] });

    const detail = await store.get(child.id);

    expect(detail?.goal.parent_goal_id).toBe(parent.id);
    expect(detail?.milestones[0].title).toBe('Semantic Search');
  });

  it('calculates alignment and drift warnings', async () => {
    const store = createGoalStore(vaultPath);
    const goal = await store.create({ title: 'Write more', horizon: 'quarter', area_refs: ['writing'], priority: 80 });

    const alignment = await store.getAlignment();
    const drift = await store.detectDrift();

    expect(alignment.find((item) => item.goal_id === goal.id)?.alignment_score).toBe(0);
    expect(drift[0]).toMatchObject({ goal_id: goal.id, area_slug: 'writing' });
  });

  it('completes milestones and triggers quarterly review artifacts', async () => {
    const store = createGoalStore(vaultPath);
    const goal = await store.create({ title: 'Finish memory layer', horizon: 'quarter', area_refs: [] , milestones: [{ title: 'Memory Explorer' }] });
    const detail = await store.get(goal.id);
    const completed = await store.completeMilestone(detail!.milestones[0].id);
    const review = await runVisionReview(vaultPath);

    expect(completed.completed_at).toBeDefined();
    expect(review.period).toBe('quarterly');
    expect(review.artifact_id).toMatch(/^synth-/);
  });
});
