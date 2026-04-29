import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ReviewFilter, ReviewKind } from '@shared/review';
import type { SynthesisProvenance } from '@shared/synthesis';
import { createSynthesisStore } from '../synthesis/store';
import { discoverReviewFindings } from './discovery';
import { reviewPeriod } from './scheduler';
import { createReviewStore, type ReviewStore } from './store';

let current: { vaultPath: string; store: ReviewStore } | null = null;

export function getReviewRuntime(vaultPath: string): { store: ReviewStore } {
  if (current?.vaultPath === vaultPath) return current;
  current = { vaultPath, store: createReviewStore(vaultPath) };
  return current;
}

export function registerReviewSystemIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, ...getReviewRuntime(vaultPath) };
  };

  ipcMain.handle(IPC.review.listRuns, (_event, filter?: ReviewFilter) => runtime().store.list(filter));
  ipcMain.handle(IPC.review.getRun, (_event, id: string) => runtime().store.getRun(id));
  ipcMain.handle(IPC.review.triggerReview, async (_event, kind: ReviewKind, scopeRef?: string) => {
    const { vaultPath, store } = runtime();
    const run = await store.start(kind, reviewPeriod(kind), scopeRef);
    const { findings, health } = await discoverReviewFindings(vaultPath, run);
    const provenance: SynthesisProvenance = {
      runtime: 'local:heuristic',
      model: 'orbit-review-discovery',
      prompt_version: `review.${kind}.v1`,
      generated_at: new Date().toISOString(),
      tokens: { input: findings.length, output: JSON.stringify(findings).length }
    };
    const artifact = await createSynthesisStore(vaultPath).writeFresh({
      kind: kind === 'monthly' ? 'summary.monthly' : kind === 'daily' ? 'summary.daily' : 'review.weekly',
      scope_key: `review:${kind}:${run.period.from.slice(0, 10)}:${scopeRef ?? 'global'}`,
      sources: [{ kind: 'raw', ref: run.id, title: `${kind} review`, metadata: { health } }],
      provenance,
      payload: { findings, health }
    });
    return store.complete(run, findings, artifact.id);
  });
  ipcMain.handle(IPC.review.acknowledge, (_event, findingId: string) => runtime().store.acknowledge(findingId));
  ipcMain.handle(IPC.review.executeAction, (_event, actionId: string) => runtime().store.executeAction(actionId));
  ipcMain.handle(IPC.review.archiveRun, (_event, id: string) => runtime().store.archiveRun(id));
}
