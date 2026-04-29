import { randomUUID } from 'node:crypto';
import type { VisionReview } from '@shared/vision';
import type { SynthesisProvenance } from '@shared/synthesis';
import { createSynthesisStore } from '../synthesis/store';
import { createGoalStore } from './goal-store';

export async function runVisionReview(vaultPath: string): Promise<VisionReview> {
  const store = createGoalStore(vaultPath);
  const [goals, drift] = await Promise.all([store.list(), store.detectDrift()]);
  const findings = [
    ...goals.filter((goal) => goal.status === 'active').map((goal) => ({
      goal_id: goal.id,
      severity: 'info' as const,
      title: `Review goal: ${goal.title}`,
      rationale: goal.target_outcome ?? goal.description
    })),
    ...drift.map((warning) => ({
      goal_id: warning.goal_id,
      severity: 'warning' as const,
      title: warning.suggested_action,
      rationale: warning.rationale
    }))
  ];
  const provenance: SynthesisProvenance = {
    runtime: 'local:heuristic',
    model: 'orbit-vision-review',
    prompt_version: 'vision.review.v1',
    generated_at: new Date().toISOString(),
    tokens: { input: goals.length, output: JSON.stringify(findings).length }
  };
  const artifact = await createSynthesisStore(vaultPath).writeFresh({
    kind: 'summary.entity',
    scope_key: `vision.review:${new Date().toISOString().slice(0, 10)}`,
    sources: goals.map((goal) => ({ kind: 'raw', ref: goal.id, title: goal.title, excerpt: goal.description })),
    provenance,
    payload: { findings, drift }
  });
  return {
    id: `vision-review-${randomUUID()}`,
    reviewed_at: new Date().toISOString(),
    period: 'quarterly',
    findings,
    goal_changes: [],
    artifact_id: artifact.id
  };
}
