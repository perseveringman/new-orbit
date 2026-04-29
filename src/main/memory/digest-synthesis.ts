import type { MemoryDigestPayload, MemoryDigestResult } from '@shared/memory';
import type { SynthesisProvenance } from '@shared/synthesis';
import { createSynthesisStore } from '../synthesis/store';
import { createMemoryStore, type MemoryStore } from './store';

export async function generateMemoryDigest(vaultPath: string, period = currentMonthPeriod()): Promise<MemoryDigestResult> {
  const store = createMemoryStore(vaultPath);
  return generateMemoryDigestWithStore(vaultPath, store, period);
}

export async function generateMemoryDigestWithStore(
  vaultPath: string,
  store: MemoryStore,
  period = currentMonthPeriod()
): Promise<MemoryDigestResult> {
  const memories = await store.list({ include_archived: false });
  const clusters = await store.listClusters();
  const payload: MemoryDigestPayload = {
    period,
    new_memories: memories.filter((memory) => memory.created_at >= period.from && memory.created_at <= period.to),
    reinforced_memories: memories.filter((memory) => memory.evidence_count >= 3 || memory.recall_count > 0).map((memory) => memory.id),
    fading_memories: memories.filter((memory) => memory.stability === 'volatile' && memory.recall_count === 0).map((memory) => memory.id),
    clusters
  };
  const provenance: SynthesisProvenance = {
    runtime: 'local:heuristic',
    model: 'orbit-memory-digest',
    prompt_version: 'memory.digest.v1',
    generated_at: new Date().toISOString(),
    tokens: {
      input: memories.length,
      output: JSON.stringify(payload).length
    }
  };
  const artifact = await createSynthesisStore(vaultPath).writeFresh({
    kind: 'memory.digest',
    scope_key: `mem-digest:${period.from.slice(0, 7)}`,
    sources: memories.map((memory) => ({
      kind: 'raw',
      ref: memory.id,
      title: memory.title,
      excerpt: memory.summary
    })),
    provenance,
    payload
  });
  return { artifact: artifact as MemoryDigestResult['artifact'], memories, clusters };
}

function currentMonthPeriod(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString();
  return { from, to };
}
