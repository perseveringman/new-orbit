import { randomUUID } from 'node:crypto';
import type { BuildContextPacketInput, ContextPacket, ContextPacketScope, ContextSection } from '@shared/context';
import {
  evidenceSourceId,
  type EvidenceChunk,
  type EvidenceChunkSearchResult,
  type EvidenceScopeRef,
  type EvidenceSelector,
  type EvidenceSource,
  type EvidenceSourceKind
} from '@shared/evidence';
import type { GraphNeighbor } from '@shared/graph';
import type { MemoryNode, RecallResult } from '@shared/memory';
import type { SynthesisSource } from '@shared/synthesis';
import { createEvidenceChunkIndexStore } from '../evidence/chunk-index';
import { createEvidenceGraphStore } from '../evidence/graph-store';
import { ensurePersonalQA, listPersonalQAHits, type PersonalQAHitsResult } from './personal-qa';
import { recallContext } from '../memory/recall-service';

const DEFAULT_MAX_TOKENS = 2400;
const DEFAULT_EVIDENCE_LIMIT = 8;
const DEFAULT_GRAPH_LIMIT = 10;

type PacketEvidenceResult = EvidenceChunkSearchResult | { chunk: EvidenceChunk; score: number; why: string };

export async function buildContextPacket(vaultPath: string, input: BuildContextPacketInput): Promise<ContextPacket> {
  const generatedAt = new Date().toISOString();
  const scope = input.scope ?? { kind: 'global' };
  const evidenceScope = contextScopeToEvidenceScope(scope);
  const chunkStore = createEvidenceChunkIndexStore(vaultPath);
  const graphStore = createEvidenceGraphStore(vaultPath);
  const evidenceLimit = Math.max(1, input.evidence_limit ?? DEFAULT_EVIDENCE_LIMIT);

  const evidenceResults = input.query?.trim()
    ? await chunkStore.search({
        query: input.query,
        ...(evidenceScope ? { scope: evidenceScope } : {}),
        limit: evidenceLimit
      })
    : (await chunkStore.list({
        ...(evidenceScope ? { scope: evidenceScope } : {}),
        limit: evidenceLimit
      })).map((chunk) => ({ chunk, score: 0, why: 'recent scoped evidence' }));

  const evidenceSection = buildEvidenceSection(evidenceResults);
  const synthesisMode = input.synthesis_mode ?? 'ensure';
  if (synthesisMode === 'ensure') {
    await ensurePersonalQA(vaultPath, { scope, query: input.query, limit: 4 });
  }
  const personalQAHits = synthesisMode === 'off'
    ? []
    : await listPersonalQAHits(vaultPath, { scope, query: input.query, limit: 4 });
  const personalQASection = buildPersonalQASection(personalQAHits);
  const memoryRecall = await buildMemoryRecall(vaultPath, input);
  const memorySection = buildMemorySection(memoryRecall);
  const graphSection = await buildGraphSection(graphStore, evidenceResults.map((result) => result.chunk), input.graph_limit ?? DEFAULT_GRAPH_LIMIT);
  const maxTokens = input.max_tokens ?? DEFAULT_MAX_TOKENS;
  const sections = [buildScopeSection(scope), evidenceSection, personalQASection, memorySection, graphSection]
    .filter((section): section is ContextSection => Boolean(section))
    .sort((a, b) => a.priority - b.priority);
  const fittedSections = fitSections(sections, maxTokens);

  const evidence = dedupeSelectors(fittedSections.flatMap((section) => section.citations));
  const estimatedTokens = estimateTokens(fittedSections.map((section) => section.content).join('\n\n'));
  const staleSources = evidenceResults
    .flatMap((result) => {
      const source = sourceFromResult(result);
      return source ? [source] : [];
    })
    .filter((source) => source.availability === 'changed' || source.availability === 'missing')
    .map((source) => source.id);
  return {
    id: `ctx-${randomUUID()}`,
    purpose: input.purpose,
    scope,
    ...(input.query?.trim() ? { query: input.query.trim() } : {}),
    generated_at: generatedAt,
    freshness: {
      evidence_until: maxUpdatedAt(evidenceResults.map((result) => result.chunk)) ?? generatedAt,
      stale_sources: Array.from(new Set(staleSources))
    },
    budget: {
      max_tokens: maxTokens,
      estimated_tokens: estimatedTokens
    },
    sections: fittedSections,
    evidence,
    synthesis_refs: personalQASection && fittedSections.includes(personalQASection)
      ? personalQAHits.map((hit) => hit.artifact.id)
      : [],
    memory_refs: memorySection && fittedSections.includes(memorySection)
      ? memoryRecall.memories.map((memory) => memory.id)
      : []
  };
}

function buildScopeSection(scope: ContextPacketScope): ContextSection {
  const label = scope.kind === 'global' ? 'global' : `${scope.kind}:${scope.ref ?? ''}`;
  return {
    kind: 'scope_summary',
    title: 'Scope',
    content: `Current context scope: ${label}`,
    citations: [],
    priority: 10
  };
}

function buildEvidenceSection(results: PacketEvidenceResult[]): ContextSection | null {
  if (!results.length) return null;
  return {
    kind: 'relevant_evidence',
    title: 'Relevant Evidence',
    content: results
      .map((result, index) => {
        const score = result.score ? ` score=${result.score}` : '';
        return `${index + 1}. ${result.chunk.title}${score} (${result.why})\n${snippet(result.chunk.text)}`;
      })
      .join('\n\n'),
    citations: results.map((result) => result.chunk.selector),
    priority: 20
  };
}

function sourceFromResult(result: PacketEvidenceResult): EvidenceSource | null {
  return 'source' in result ? result.source ?? null : null;
}

function buildPersonalQASection(hits: PersonalQAHitsResult[]): ContextSection | null {
  if (!hits.length) return null;
  return {
    kind: 'synthesis',
    title: 'Personal QA',
    content: hits
      .map((hit, index) => {
        const payload = hit.artifact.payload;
        return `${index + 1}. ${payload.question} score=${hit.score} (${hit.why})\n${snippet(payload.answer)}`;
      })
      .join('\n\n'),
    citations: dedupeSelectors(hits.flatMap((hit) => hit.artifact.payload.evidence)),
    priority: 25
  };
}

async function buildMemoryRecall(
  vaultPath: string,
  input: BuildContextPacketInput
): Promise<RecallResult> {
  if (!input.query?.trim()) {
    return { memories: [], matches: [], explanation: 'No memory query provided.' };
  }
  try {
    return await recallContext(vaultPath, input.query, {
      max_memories: 4,
      min_confidence: 0.4,
      triggered_by: { kind: contextPurposeToRecallTrigger(input.purpose), ref: input.scope?.ref },
      used_in: 'context_injection'
    });
  } catch {
    return { memories: [], matches: [], explanation: 'Memory recall unavailable.' };
  }
}

function buildMemorySection(recall: RecallResult): ContextSection | null {
  if (!recall.memories.length) return null;
  const lines = recall.memories.map((memory, index) => {
    const match = recall.matches.find((item) => item.memory_id === memory.id);
    const score = match ? ` score=${match.score}` : '';
    const reasons = match?.reasons.length ? ` (${match.reasons.slice(0, 2).join('; ')})` : '';
    return `${index + 1}. ${memory.title}${score}${reasons}\n${snippet(memory.summary)}`;
  });
  return {
    kind: 'memories',
    title: 'Memories',
    content: lines.join('\n\n'),
    citations: dedupeSelectors(recall.memories.flatMap(evidenceSelectorsFromMemory)),
    priority: 27
  };
}

function contextPurposeToRecallTrigger(purpose: BuildContextPacketInput['purpose']): 'ask' | 'task' | 'review' | 'manual' {
  if (purpose === 'ask') return 'ask';
  if (purpose === 'task' || purpose === 'project' || purpose === 'area' || purpose === 'resource') return 'task';
  if (purpose === 'review') return 'review';
  return 'manual';
}

function evidenceSelectorsFromMemory(memory: MemoryNode): EvidenceSelector[] {
  return memory.sources.flatMap(evidenceSelectorsFromSource);
}

function evidenceSelectorsFromSource(source: SynthesisSource): EvidenceSelector[] {
  const direct = evidenceSelectorFromMetadata(source.metadata);
  if (direct) return [direct];
  const kind = synthesisSourceToEvidenceKind(source.kind);
  if (!kind || !source.ref) return [];
  return [
    {
      source_id: evidenceSourceId(kind, source.ref),
      kind: 'whole_source',
      content_view: 'safe_projection',
      reason: 'memory source'
    }
  ];
}

function evidenceSelectorFromMetadata(metadata?: Record<string, unknown>): EvidenceSelector | null {
  const selector = metadata?.['selector'];
  if (!selector || typeof selector !== 'object') return null;
  const candidate = selector as Partial<EvidenceSelector>;
  if (typeof candidate.source_id !== 'string' || typeof candidate.kind !== 'string' || typeof candidate.content_view !== 'string') {
    return null;
  }
  return candidate as EvidenceSelector;
}

function synthesisSourceToEvidenceKind(kind: SynthesisSource['kind']): EvidenceSourceKind | null {
  if (kind === 'library') return 'library_item';
  if (kind === 'event') return 'activity_event';
  if (kind === 'kb') return 'kb_doc';
  if (kind === 'note' || kind === 'resource' || kind === 'project' || kind === 'area' || kind === 'task' || kind === 'conversation') {
    return kind;
  }
  return null;
}

async function buildGraphSection(
  graphStore: ReturnType<typeof createEvidenceGraphStore>,
  chunks: EvidenceChunk[],
  limit: number
): Promise<ContextSection | null> {
  const entities = topEntities(chunks).slice(0, 4);
  if (!entities.length) return null;
  const neighborhoods: Array<{ entity: string; graph: Awaited<ReturnType<typeof graphStore.neighbors>> }> = [];
  for (const entity of entities) {
    neighborhoods.push({ entity, graph: await graphStore.neighbors({ entity, limit }) });
  }
  const lines: string[] = [];
  const citations: EvidenceSelector[] = [];

  for (const item of neighborhoods) {
    const neighbors = item.graph.neighbors.slice(0, limit);
    if (!neighbors.length) continue;
    lines.push(`${item.entity}: ${neighbors.map(formatNeighbor).join('; ')}`);
    for (const neighbor of neighbors) citations.push(...neighbor.edge.evidence_selectors.slice(0, 3));
  }

  if (!lines.length) return null;
  return {
    kind: 'graph_neighbors',
    title: 'Graph Neighbors',
    content: lines.join('\n'),
    citations: dedupeSelectors(citations),
    priority: 30
  };
}

function formatNeighbor(neighbor: GraphNeighbor): string {
  const arrow = neighbor.direction === 'out' ? '->' : '<-';
  return `${neighbor.edge.kind} ${arrow} ${neighbor.node.label} (${neighbor.edge.weight})`;
}

function topEntities(chunks: EvidenceChunk[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const chunk of chunks) {
    for (const entity of chunk.entities) {
      const key = entity.toLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label ?? entity, count: (current?.count ?? 0) + 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((entry) => entry.label);
}

function fitSections(sections: ContextSection[], maxTokens: number): ContextSection[] {
  const out: ContextSection[] = [];
  let total = 0;
  for (const section of sections) {
    const next = estimateTokens(section.content);
    if (out.length && total + next > maxTokens) continue;
    total += next;
    out.push(section);
  }
  return out;
}

function contextScopeToEvidenceScope(scope: ContextPacketScope): EvidenceScopeRef | null {
  if (scope.kind === 'global' || !scope.ref) return null;
  return { kind: scope.kind, ref: scope.ref };
}

function maxUpdatedAt(chunks: EvidenceChunk[]): string | null {
  return chunks.map((chunk) => chunk.updated_at).sort().at(-1) ?? null;
}

function snippet(text: string): string {
  return text.length <= 420 ? text : `${text.slice(0, 420).trim()}...`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function dedupeSelectors(selectors: EvidenceSelector[]): EvidenceSelector[] {
  const seen = new Set<string>();
  const out: EvidenceSelector[] = [];
  for (const selector of selectors) {
    const key = `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selector);
  }
  return out;
}
