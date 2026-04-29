import type { MemoryNode, RecallOptions, RecallResult } from '@shared/memory';
import { tokenize } from '../semantic/embedder';
import { createMemoryStore, type MemoryStore } from './store';

export async function recallContext(
  vaultPath: string,
  query: string,
  options: RecallOptions = {}
): Promise<RecallResult> {
  const store = createMemoryStore(vaultPath);
  return recallWithStore(store, query, options);
}

export async function recallWithStore(
  store: MemoryStore,
  query: string,
  options: RecallOptions = {}
): Promise<RecallResult> {
  const max = Math.max(1, Math.min(20, options.max_memories ?? 5));
  const minConfidence = options.min_confidence ?? 0.4;
  const queryTokens = tokenize(query);
  const scored = (await store.list())
    .filter((memory) => memory.confidence >= minConfidence)
    .filter((memory) => !options.exclude_volatile || memory.stability !== 'volatile')
    .map((memory) => ({
      memory,
      score: memoryScore(memory, queryTokens)
    }))
    .filter((item) => item.score > 0 || !queryTokens.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  for (const item of scored) {
    await store.recordRecall(item.memory.id, {
      triggered_by: options.triggered_by ?? { kind: 'manual' },
      used_in: options.used_in ?? 'context_injection'
    });
  }

  const memories = await Promise.all(scored.map((item) => store.get(item.memory.id))).then((items) =>
    items.filter((item): item is MemoryNode => Boolean(item))
  );
  return {
    memories,
    explanation: memories.length
      ? `Recalled ${memories.length} memory item(s) by matching query terms with confidence and stability.`
      : 'No memory matched the query and confidence filters.'
  };
}

function memoryScore(memory: MemoryNode, queryTokens: string[]): number {
  const tokens = new Set(tokenize([memory.title, memory.summary, memory.detail, memory.related_entities?.join(' ')].filter(Boolean).join(' ')));
  const overlap = queryTokens.length ? queryTokens.filter((token) => tokens.has(token)).length / queryTokens.length : 1;
  const stabilityBoost = memory.stability === 'core' ? 0.3 : memory.stability === 'stable' ? 0.15 : 0;
  const recallBoost = Math.min(0.2, memory.recall_count * 0.02);
  return overlap * 0.65 + memory.confidence * 0.25 + stabilityBoost + recallBoost;
}
