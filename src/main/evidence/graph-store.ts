import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { EvidenceChunk, EvidenceScopeRef, EvidenceSelector, EvidenceSource } from '@shared/evidence';
import type { GraphEdge, GraphEdgeKind, GraphNeighbor, GraphNeighborhood, GraphNode, GraphQuery, KnowledgeGraph } from '@shared/graph';
import { createEvidenceChunkIndexStore, evidenceChunksPath, type EvidenceIndexBuildOptions } from './chunk-index';
import { createEvidenceStore } from './store';

const DEFAULT_GRAPH_LIMIT = 50;

export function graphDir(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'graph');
}

export function knowledgeGraphPath(vaultPath: string): string {
  return path.join(graphDir(vaultPath), 'pmil-graph.json');
}

export function sourceNodeId(sourceId: string): string {
  return `source:${sourceId}`;
}

export function entityNodeId(entity: string): string {
  return `entity:${hash(normalizeEntity(entity)).slice(0, 16)}`;
}

export function scopeNodeId(scope: EvidenceScopeRef): string {
  return `scope:${scope.kind}:${hash(scope.ref).slice(0, 16)}`;
}

export class EvidenceGraphStore {
  constructor(
    private readonly vaultPath: string,
    private readonly defaultOptions: EvidenceIndexBuildOptions = {}
  ) {}

  async rebuild(options: EvidenceIndexBuildOptions = {}): Promise<KnowledgeGraph> {
    const buildOptions = { ...this.defaultOptions, ...options };
    const chunkIndex = await createEvidenceChunkIndexStore(this.vaultPath, buildOptions).rebuild();
    const sources = await createEvidenceStore(this.vaultPath).list({ include_unavailable: true, limit: 10000 });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const graph: KnowledgeGraph = {
      version: 1,
      nodes: {},
      edges: {},
      updated_at: new Date().toISOString()
    };

    for (const source of sources) {
      addNode(graph, sourceNode(source));
      for (const scope of source.scope_refs ?? []) {
        addNode(graph, scopeNode(scope, source.updated_at));
        addEdge(graph, {
          from: sourceNodeId(source.id),
          to: scopeNodeId(scope),
          kind: 'scoped_to',
          selector: {
            source_id: source.id,
            kind: 'whole_source',
            content_view: 'metadata',
            reason: 'source scope'
          },
          source_id: source.id,
          updated_at: source.updated_at
        });
      }
    }

    for (const chunk of Object.values(chunkIndex.chunks)) {
      const source = sourceById.get(chunk.source_id);
      if (!source) continue;
      const entities = chunk.entities.slice(0, 12);
      for (const entity of entities) {
        addNode(graph, entityNode(entity, chunk.updated_at));
        addEdge(graph, {
          from: sourceNodeId(chunk.source_id),
          to: entityNodeId(entity),
          kind: 'mentions',
          selector: chunk.selector,
          source_id: chunk.source_id,
          updated_at: chunk.updated_at
        });
      }
      for (const [left, right] of entityPairs(entities.slice(0, 8))) {
        addEdge(graph, {
          from: entityNodeId(left),
          to: entityNodeId(right),
          kind: 'co_occurs',
          selector: chunk.selector,
          source_id: chunk.source_id,
          updated_at: chunk.updated_at,
          metadata: { left, right }
        });
      }
    }

    await this.writeGraph(graph);
    return graph;
  }

  async get(): Promise<KnowledgeGraph> {
    const graph = await this.readGraph();
    await createEvidenceChunkIndexStore(this.vaultPath, this.defaultOptions).list({ limit: 1 });
    const chunksUpdatedAt = await readChunkIndexUpdatedAt(this.vaultPath);
    if (Object.keys(graph.nodes).length && (!chunksUpdatedAt || (graph.updated_at ?? '') >= chunksUpdatedAt)) {
      return graph;
    }
    return this.rebuild({ includeActivities: false });
  }

  async neighbors(query: GraphQuery): Promise<GraphNeighborhood> {
    const graph = await this.get();
    const centerId = query.node_id ?? (query.entity ? entityNodeId(query.entity) : query.scope ? scopeNodeId(query.scope) : undefined);
    if (!centerId) return { center: null, neighbors: [] };
    const center = graph.nodes[centerId] ?? null;
    const neighbors: GraphNeighbor[] = [];
    for (const edge of Object.values(graph.edges)) {
      if (edge.from === centerId) {
        const node = graph.nodes[edge.to];
        if (node) neighbors.push({ node, edge, direction: 'out' });
      } else if (edge.to === centerId) {
        const node = graph.nodes[edge.from];
        if (node) neighbors.push({ node, edge, direction: 'in' });
      }
    }
    neighbors.sort((a, b) => b.edge.weight - a.edge.weight || b.node.weight - a.node.weight);
    const limited = neighbors.slice(0, Math.max(1, query.limit ?? DEFAULT_GRAPH_LIMIT));
    return { center, neighbors: limited };
  }

  async findEntities(query: string, limit = 20): Promise<GraphNode[]> {
    const normalized = normalizeEntity(query);
    const graph = await this.get();
    return Object.values(graph.nodes)
      .filter((node) => node.kind === 'entity')
      .filter((node) => normalizeEntity(node.label).includes(normalized) || normalized.includes(normalizeEntity(node.label)))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(1, limit));
  }

  private async readGraph(): Promise<KnowledgeGraph> {
    try {
      const parsed = JSON.parse(await fs.readFile(knowledgeGraphPath(this.vaultPath), 'utf8')) as Partial<KnowledgeGraph>;
      return {
        version: 1,
        nodes: parsed.nodes && typeof parsed.nodes === 'object' ? (parsed.nodes as Record<string, GraphNode>) : {},
        edges: parsed.edges && typeof parsed.edges === 'object' ? (parsed.edges as Record<string, GraphEdge>) : {},
        ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
      };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, nodes: {}, edges: {} };
      throw error;
    }
  }

  private async writeGraph(graph: KnowledgeGraph): Promise<void> {
    const file = knowledgeGraphPath(this.vaultPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
}

export function createEvidenceGraphStore(
  vaultPath: string,
  options: EvidenceIndexBuildOptions = {}
): EvidenceGraphStore {
  return new EvidenceGraphStore(vaultPath, options);
}

function sourceNode(source: EvidenceSource): GraphNode {
  return {
    id: sourceNodeId(source.id),
    kind: 'evidence_source',
    label: source.title,
    weight: source.availability === 'available' ? 1 : 0.5,
    source_id: source.id,
    updated_at: source.updated_at,
    metadata: {
      source_kind: source.kind,
      canonical_ref: source.canonical_ref,
      availability: source.availability
    }
  };
}

function entityNode(entity: string, updatedAt: string): GraphNode {
  return {
    id: entityNodeId(entity),
    kind: 'entity',
    label: entity,
    entity,
    weight: 1,
    updated_at: updatedAt
  };
}

function scopeNode(scope: EvidenceScopeRef, updatedAt: string): GraphNode {
  return {
    id: scopeNodeId(scope),
    kind: 'scope',
    label: `${scope.kind}:${scope.ref}`,
    scope,
    weight: 1,
    updated_at: updatedAt
  };
}

function addNode(graph: KnowledgeGraph, node: GraphNode): void {
  const current = graph.nodes[node.id];
  if (!current) {
    graph.nodes[node.id] = node;
    return;
  }
  graph.nodes[node.id] = {
    ...current,
    weight: current.weight + node.weight,
    updated_at: current.updated_at > node.updated_at ? current.updated_at : node.updated_at
  };
}

function addEdge(
  graph: KnowledgeGraph,
  input: {
    from: string;
    to: string;
    kind: GraphEdgeKind;
    selector: EvidenceSelector;
    source_id: string;
    updated_at: string;
    metadata?: Record<string, unknown>;
  }
): void {
  if (input.from === input.to) return;
  const edgeId = edgeKey(input.from, input.to, input.kind);
  const current = graph.edges[edgeId];
  if (!current) {
    graph.edges[edgeId] = {
      id: edgeId,
      from: input.from,
      to: input.to,
      kind: input.kind,
      weight: 1,
      evidence_selectors: [input.selector],
      source_ids: [input.source_id],
      updated_at: input.updated_at,
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    return;
  }
  graph.edges[edgeId] = {
    ...current,
    weight: current.weight + 1,
    evidence_selectors: appendUniqueSelector(current.evidence_selectors, input.selector).slice(0, 20),
    source_ids: Array.from(new Set([...current.source_ids, input.source_id])).slice(0, 50),
    updated_at: current.updated_at > input.updated_at ? current.updated_at : input.updated_at,
    metadata: { ...(current.metadata ?? {}), ...(input.metadata ?? {}) }
  };
}

function entityPairs(entities: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      pairs.push([entities[i], entities[j]]);
    }
  }
  return pairs;
}

function appendUniqueSelector(selectors: EvidenceSelector[], selector: EvidenceSelector): EvidenceSelector[] {
  const key = selectorKey(selector);
  return selectors.some((item) => selectorKey(item) === key) ? selectors : [...selectors, selector];
}

function selectorKey(selector: EvidenceSelector): string {
  return `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
}

function edgeKey(from: string, to: string, kind: GraphEdgeKind): string {
  if (kind === 'co_occurs') {
    const [left, right] = [from, to].sort();
    return `edge:${kind}:${hash(`${left}|${right}`).slice(0, 18)}`;
  }
  return `edge:${kind}:${hash(`${from}|${to}`).slice(0, 18)}`;
}

function normalizeEntity(entity: string): string {
  return entity.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}

async function readChunkIndexUpdatedAt(vaultPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(evidenceChunksPath(vaultPath), 'utf8')) as { updated_at?: unknown };
    return typeof parsed.updated_at === 'string' ? parsed.updated_at : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
