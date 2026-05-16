import { createHash } from 'node:crypto';
import type { EntityProfilePayload, SynthesisArtifact, SynthesisSource } from '@shared/synthesis';
import type { EvidenceChunk, EvidenceChunkSearchResult, EvidenceSelector } from '@shared/evidence';
import { createEvidenceChunkIndexStore } from '../evidence/chunk-index';
import { createEvidenceGraphStore } from '../evidence/graph-store';
import { createEvidenceStore } from '../evidence/store';
import { createSynthesisJob, SynthesisRunner, type SynthesisRuntimeRouter } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';

export interface EntityProfileOptions {
  force?: boolean;
  router?: SynthesisRuntimeRouter | null;
  maxBudgetUsd?: number;
}

export function entityProfileScopeKey(entity: string): string {
  return `entity.profile:${hash(normalizeEntity(entity)).slice(0, 24)}`;
}

export async function ensureEntityProfile(
  vaultPath: string,
  entity: string,
  options: EntityProfileOptions = {}
): Promise<SynthesisArtifact<EntityProfilePayload> | null> {
  const normalized = normalizeEntity(entity);
  if (!normalized) return null;
  const store = createSynthesisStore(vaultPath);
  const scopeKey = entityProfileScopeKey(entity);
  const source = await entityToSynthesisSource(vaultPath, entity);
  const sourceHash = String(source.metadata?.['source_hash'] ?? '');
  const latest = await store.latest(scopeKey) as SynthesisArtifact<EntityProfilePayload> | null;
  if (!options.force && latest?.kind === 'entity.profile' && latest.status === 'fresh' && latest.payload.source_hash === sourceHash) {
    return latest;
  }
  const runner = new SynthesisRunner(store, {
    router: options.router,
    maxBudgetUsd: options.maxBudgetUsd ?? 1
  });
  return runner.run(
    createSynthesisJob({
      kind: 'entity.profile',
      scope_key: scopeKey,
      sources: [source],
      priority: 'interactive',
      reason: options.force ? 'manual' : 'missing',
      force: true
    })
  ) as Promise<SynthesisArtifact<EntityProfilePayload>>;
}

export async function listEntityProfilesForResults(
  vaultPath: string,
  results: EvidenceChunkSearchResult[],
  options: EntityProfileOptions & { ensure?: boolean; limit?: number } = {}
): Promise<Array<SynthesisArtifact<EntityProfilePayload>>> {
  const entities = topEntities(results.map((result) => result.chunk)).slice(0, Math.max(1, options.limit ?? 2));
  const store = createSynthesisStore(vaultPath);
  const artifacts: Array<SynthesisArtifact<EntityProfilePayload>> = [];
  for (const entity of entities) {
    if (options.ensure) {
      const artifact = await ensureEntityProfile(vaultPath, entity, options);
      if (artifact) artifacts.push(artifact);
      continue;
    }
    const artifact = await store.latest(entityProfileScopeKey(entity));
    if (artifact?.kind === 'entity.profile' && artifact.status === 'fresh') {
      artifacts.push(artifact as SynthesisArtifact<EntityProfilePayload>);
    }
  }
  return artifacts;
}

async function entityToSynthesisSource(vaultPath: string, entity: string): Promise<SynthesisSource> {
  const chunkStore = createEvidenceChunkIndexStore(vaultPath);
  const graphStore = createEvidenceGraphStore(vaultPath);
  const chunks = await chunkStore.list({ entity, limit: 12 });
  const graph = await graphStore.neighbors({ entity, limit: 16 });
  const evidence = dedupeSelectors([
    ...chunks.map((chunk) => chunk.selector),
    ...graph.neighbors.flatMap((neighbor) => neighbor.edge.evidence_selectors.slice(0, 2))
  ]).slice(0, 20);
  const sourceTitles = await sourceTitleMap(vaultPath, chunks.map((chunk) => chunk.source_id));
  const relatedEntities = graph.neighbors
    .filter((neighbor) => neighbor.node.kind === 'entity')
    .map((neighbor) => ({
      entity: neighbor.node.label,
      relation: neighbor.edge.kind,
      weight: neighbor.edge.weight,
      evidence: neighbor.edge.evidence_selectors.slice(0, 4)
    }))
    .slice(0, 12);
  const topSources = chunks.slice(0, 8).map((chunk) => ({
    source_id: chunk.source_id,
    title: sourceTitles.get(chunk.source_id) ?? chunk.title,
    source_kind: typeof chunk.metadata?.['source_kind'] === 'string' ? chunk.metadata['source_kind'] : undefined,
    reason: `mentions ${entity}`,
    evidence: [chunk.selector]
  }));
  const sourceHash = hash(JSON.stringify({
    entity,
    chunks: chunks.map((chunk) => [chunk.id, chunk.content_hash]),
    neighbors: graph.neighbors.map((neighbor) => [neighbor.node.id, neighbor.edge.id, neighbor.edge.weight])
  }));
  return {
    kind: 'raw',
    ref: entityProfileScopeKey(entity),
    title: `Entity profile: ${entity}`,
    excerpt: chunks.map((chunk) => `${chunk.title}\n${chunk.text}`).join('\n\n').slice(0, 7000),
    metadata: {
      entity,
      related_entities: relatedEntities,
      top_sources: topSources,
      evidence,
      source_hash: sourceHash
    }
  };
}

async function sourceTitleMap(vaultPath: string, sourceIds: string[]): Promise<Map<string, string>> {
  const store = createEvidenceStore(vaultPath);
  const sources = await Promise.all(Array.from(new Set(sourceIds)).map((id) => store.get(id)));
  return new Map(sources.filter(Boolean).map((source) => [source!.id, source!.title]));
}

function topEntities(chunks: EvidenceChunk[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const chunk of chunks) {
    for (const entity of chunk.entities) {
      const key = normalizeEntity(entity);
      if (!key) continue;
      const current = counts.get(key);
      counts.set(key, { label: current?.label ?? entity, count: (current?.count ?? 0) + 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((entry) => entry.label);
}

function dedupeSelectors(selectors: EvidenceSelector[]): EvidenceSelector[] {
  const seen = new Set<string>();
  return selectors.filter((selector) => {
    const key = `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeEntity(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, ' ').trim();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
