import type { VaultSession } from '../fs';
import type { TaskRecord } from '@shared/schemas';
import { getEmbedder } from '../vector/embed';
import type { VectorSearchHit, VectorStore } from '../vector/index';

/**
 * Cosine threshold for the hash-trick embedding. Empirically tuned:
 * - Below ~0.15, most hits are random bag-of-words coincidence.
 * - Above ~0.2, hits consistently share >= 3 vocabulary-unique tokens,
 *   which is the signal we want for "wake up historical experience".
 * Real embedding providers can raise this (say 0.5+) since their geometry
 * is denser.
 */
export const WAKEUP_THRESHOLD = 0.2;

export function buildWakeupQuery(
  task: TaskRecord,
  entities: { uid: string; title: string; type: string }[]
): string {
  const proj = task.project_uid
    ? entities.find((e) => e.uid === task.project_uid && e.type === 'project')
    : undefined;
  const area = task.area_uid
    ? entities.find((e) => e.uid === task.area_uid && e.type === 'area')
    : undefined;
  return [task.title, proj?.title ?? '', area?.title ?? '', ...(task.tags ?? [])]
    .filter(Boolean)
    .join(' ');
}

/**
 * Pure helper: given a task, search the store for past experience and
 * return the hits that pass the wake-up threshold. Exported for tests.
 */
export function suggestExperience(
  session: VaultSession,
  store: VectorStore,
  task: TaskRecord,
  k = 3
): VectorSearchHit[] {
  const q = buildWakeupQuery(
    task,
    session.tasks.allEntities().map((e) => ({
      uid: e.uid,
      title: e.title,
      type: e.type
    }))
  );
  if (!q.trim()) return [];
  const vec = getEmbedder().embed(q);
  const hits = store.search(vec, k, { kind: ['resource', 'archive'] });
  return hits.filter((h) => h.score >= WAKEUP_THRESHOLD);
}

export function formatExperienceBlock(hits: VectorSearchHit[]): string {
  if (hits.length === 0) return '';
  const rows = hits.map(
    (h) =>
      `- **${h.meta.title}** — \`${h.meta.relPath}\` (score ${h.score.toFixed(3)})\n  ${h.meta.excerpt}`
  );
  return `# Relevant past experience\n${rows.join('\n')}\n`;
}

// Per-run injection record so the Agent panel can display a chip.
const injectionMap = new Map<string, VectorSearchHit[]>();

export function recordInjection(runId: string, hits: VectorSearchHit[]): void {
  if (!runId || hits.length === 0) return;
  injectionMap.set(runId, hits);
}

export function getInjection(runId: string): VectorSearchHit[] {
  return injectionMap.get(runId) ?? [];
}

export function clearInjection(runId: string): void {
  injectionMap.delete(runId);
}
