import type { MemoryLayer, MemoryNode, MemoryRecallMatch, MemoryRecallSignals, RecallOptions, RecallResult } from '@shared/memory';
import { tokenize } from '../semantic/embedder';
import { createMemoryStore, type MemoryStore } from './store';

interface ScoredMemory {
  memory: MemoryNode;
  score: number;
  matchedTerms: string[];
  signals: MemoryRecallSignals;
  reasons: string[];
}

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
  const queryTokens = unique(tokenize(query));
  const scored = (await store.list({ layer: options.layer }))
    .filter((memory) => memory.confidence >= minConfidence)
    .filter((memory) => !options.exclude_volatile || memory.stability !== 'volatile')
    .map((memory) => scoreMemory(memory, query, queryTokens))
    .filter((item) => hasRetrievalSignal(item, queryTokens))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  const recallEventIds = new Map<string, string>();
  for (const item of scored) {
    const event = await store.recordRecall(item.memory.id, {
      triggered_by: options.triggered_by ?? { kind: 'manual' },
      used_in: options.used_in ?? 'context_injection',
      score: item.score,
      matched_terms: item.matchedTerms,
      reasons: item.reasons
    });
    recallEventIds.set(item.memory.id, event.id);
  }

  const memories = await Promise.all(scored.map((item) => store.get(item.memory.id))).then((items) =>
    items.filter((item): item is MemoryNode => Boolean(item))
  );
  const matches = scored.map((item) => memoryMatch(item, recallEventIds.get(item.memory.id)));
  return {
    memories,
    matches,
    explanation: memories.length
      ? `Recalled ${memories.length} memory item(s) using keyword, entity, layer, confidence, stability, and recall signals.`
      : 'No memory matched the query and confidence filters.'
  };
}

function scoreMemory(memory: MemoryNode, query: string, queryTokens: string[]): ScoredMemory {
  const tokens = new Set(tokenize(memoryCorpus(memory)));
  const matchedTerms = queryTokens.filter((token) => tokens.has(token)).slice(0, 8);
  const keywordOverlap = queryTokens.length ? matchedTerms.length / queryTokens.length : 1;
  const entityOverlap = entityOverlapScore(memory, queryTokens);
  const stabilityBoost = memory.stability === 'core' ? 0.3 : memory.stability === 'stable' ? 0.15 : 0;
  const recallBoost = Math.min(0.2, memory.recall_count * 0.02);
  const layerBoost = layerFitBoost(memory.layer, query);
  const signals: MemoryRecallSignals = {
    keyword_overlap: roundSignal(keywordOverlap),
    entity_overlap: roundSignal(entityOverlap),
    confidence: roundSignal(memory.confidence),
    stability_boost: roundSignal(stabilityBoost),
    recall_boost: roundSignal(recallBoost),
    layer_boost: roundSignal(layerBoost)
  };
  return {
    memory,
    matchedTerms,
    signals,
    reasons: recallReasons(memory, matchedTerms, signals),
    score: roundSignal(keywordOverlap * 0.45 + entityOverlap * 0.2 + memory.confidence * 0.18 + stabilityBoost + recallBoost + layerBoost)
  };
}

function hasRetrievalSignal(item: ScoredMemory, queryTokens: string[]): boolean {
  if (!queryTokens.length) return true;
  return item.signals.keyword_overlap > 0 || item.signals.entity_overlap > 0 || item.signals.layer_boost > 0;
}

function memoryMatch(item: ScoredMemory, recallEventId?: string): MemoryRecallMatch {
  return {
    memory_id: item.memory.id,
    ...(recallEventId ? { recall_event_id: recallEventId } : {}),
    score: item.score,
    matched_terms: item.matchedTerms,
    signals: item.signals,
    reasons: item.reasons
  };
}

function memoryCorpus(memory: MemoryNode): string {
  return [memory.layer, memory.kind, memory.title, memory.summary, memory.detail, memory.related_entities?.join(' ')]
    .filter(Boolean)
    .join(' ');
}

function entityOverlapScore(memory: MemoryNode, queryTokens: string[]): number {
  if (!memory.related_entities?.length || !queryTokens.length) return 0;
  const entityTokens = new Set(tokenize(memory.related_entities.join(' ')));
  if (!entityTokens.size) return 0;
  const matches = queryTokens.filter((token) => entityTokens.has(token)).length;
  return matches / Math.min(queryTokens.length, entityTokens.size);
}

function layerFitBoost(layer: MemoryLayer, query: string): number {
  const lower = query.toLowerCase();
  if (layer === 'episodic' && /(?:\b(?:previous|before|last|history|happened|when)\b|上次|之前|历史|发生|什么时候)/u.test(lower)) return 0.12;
  if (layer === 'procedural' && /(?:\b(?:how|should|workflow|process|style|avoid|next time)\b|怎么|应该|流程|方式|避免|下次)/u.test(lower)) return 0.12;
  if (layer === 'semantic' && /(?:\b(?:prefer|preference|goal|interest|interested)\b|偏好|目标|关注|兴趣)/u.test(lower)) return 0.08;
  return 0;
}

function recallReasons(memory: MemoryNode, matchedTerms: string[], signals: MemoryRecallSignals): string[] {
  const reasons: string[] = [];
  if (matchedTerms.length) reasons.push(`matched terms: ${matchedTerms.slice(0, 5).join(', ')}`);
  if (signals.entity_overlap > 0) reasons.push('related entity matched');
  if (signals.layer_boost > 0) reasons.push(`${memory.layer} memory fits the question`);
  if (memory.user_confirmed) reasons.push('user confirmed');
  if (memory.stability !== 'volatile') reasons.push(`${memory.stability} memory`);
  if (memory.recall_count > 0) reasons.push(`recalled ${memory.recall_count} time(s) before`);
  if (!reasons.length) reasons.push('highest confidence memory for an empty query');
  return reasons;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function roundSignal(value: number): number {
  return Math.round(value * 1000) / 1000;
}
