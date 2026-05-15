import type { EvidenceScopeRef, EvidenceSelector } from '../evidence';

export const GRAPH_NODE_KINDS = ['evidence_source', 'entity', 'scope'] as const;
export const GRAPH_EDGE_KINDS = ['mentions', 'co_occurs', 'scoped_to'] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  weight: number;
  source_id?: string;
  entity?: string;
  scope?: EvidenceScopeRef;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  weight: number;
  evidence_selectors: EvidenceSelector[];
  source_ids: string[];
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  version: 1;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  updated_at?: string;
}

export interface GraphNeighbor {
  node: GraphNode;
  edge: GraphEdge;
  direction: 'in' | 'out';
}

export interface GraphNeighborhood {
  center: GraphNode | null;
  neighbors: GraphNeighbor[];
}

export interface GraphQuery {
  node_id?: string;
  entity?: string;
  scope?: EvidenceScopeRef;
  limit?: number;
}
