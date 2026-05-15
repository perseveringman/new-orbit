import type { Resource } from '../resource';
import type { SynthesisArtifact, SynthesisSource } from '../synthesis';

export const MEMORY_KINDS = ['interest', 'preference', 'pattern', 'lesson', 'entity_memory', 'goal'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_LAYERS = ['semantic', 'episodic', 'procedural'] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

export const MEMORY_STABILITIES = ['volatile', 'stable', 'core'] as const;
export type MemoryStability = (typeof MEMORY_STABILITIES)[number];

export interface MemoryNode {
  id: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  title: string;
  summary: string;
  detail?: string;
  sources: SynthesisSource[];
  evidence_count: number;
  confidence: number;
  stability: MemoryStability;
  related_entities?: string[];
  recall_count: number;
  created_at: string;
  updated_at: string;
  last_recalled_at?: string;
  archived?: boolean;
  user_confirmed?: boolean;
}

export interface MemoryCluster {
  id: string;
  layer: MemoryLayer;
  theme: string;
  memories: string[];
  coherence: number;
}

export const MEMORY_RELATION_KINDS = ['shared_entity', 'shared_source', 'theme_overlap'] as const;
export type MemoryRelationKind = (typeof MEMORY_RELATION_KINDS)[number];

export interface MemoryRelation {
  id: string;
  from_id: string;
  to_id: string;
  kind: MemoryRelationKind;
  label: string;
  strength: number;
  evidence: string[];
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  relations: MemoryRelation[];
  generated_at: string;
}

export interface RecallEvent {
  id: string;
  memory_id: string;
  triggered_by: {
    kind: 'search' | 'ask' | 'task' | 'review' | 'manual';
    ref?: string;
  };
  used_in: 'context_injection' | 'suggestion' | 'question_answer';
  was_helpful?: boolean;
  score?: number;
  matched_terms?: string[];
  reasons?: string[];
  occurred_at: string;
}

export interface MemoryExtractionInput {
  source_kind: 'conversation' | 'review' | 'timeline_span' | 'manual';
  source_ref: string;
  content: string;
}

export interface CreateMemoryInput {
  layer?: MemoryLayer;
  kind: MemoryKind;
  title: string;
  summary: string;
  detail?: string;
  sources?: SynthesisSource[];
  evidence_count?: number;
  confidence?: number;
  related_entities?: string[];
  user_confirmed?: boolean;
}

export interface UpdateMemoryInput {
  layer?: MemoryLayer;
  kind?: MemoryKind;
  title?: string;
  summary?: string;
  detail?: string;
  sources?: SynthesisSource[];
  evidence_count?: number;
  confidence?: number;
  stability?: MemoryStability;
  related_entities?: string[];
  user_confirmed?: boolean;
  archived?: boolean;
}

export interface MemoryFilter {
  layer?: MemoryLayer | 'all';
  kind?: MemoryKind | 'all';
  stability?: MemoryStability | 'all';
  include_archived?: boolean;
  query?: string;
}

export interface RecallOptions {
  user_id?: string;
  scope?: string;
  layer?: MemoryLayer | 'all';
  max_memories?: number;
  min_confidence?: number;
  exclude_volatile?: boolean;
  triggered_by?: RecallEvent['triggered_by'];
  used_in?: RecallEvent['used_in'];
}

export interface RecallResult {
  memories: MemoryNode[];
  explanation: string;
  matches: MemoryRecallMatch[];
}

export interface MemoryRecallSignals {
  keyword_overlap: number;
  entity_overlap: number;
  confidence: number;
  stability_boost: number;
  recall_boost: number;
  layer_boost: number;
}

export interface MemoryRecallMatch {
  memory_id: string;
  recall_event_id?: string;
  score: number;
  matched_terms: string[];
  signals: MemoryRecallSignals;
  reasons: string[];
}

export interface RecallStats {
  total: number;
  by_kind: Record<string, number>;
  recent: RecallEvent[];
}

export interface MemoryDigestPayload {
  period: { from: string; to: string };
  new_memories: MemoryNode[];
  reinforced_memories: string[];
  fading_memories: string[];
  clusters: MemoryCluster[];
  layer_counts: Record<MemoryLayer, { total: number; stable: number; core: number; recalled: number }>;
}

export interface PromoteMemoryToResourceResult {
  resource: Resource;
  memory: MemoryNode;
}

export interface PromoteMemoryToProjectResult {
  project: {
    uid: string;
    slug: string;
    name: string;
    relPath: string;
  };
  memory: MemoryNode;
}

export interface MemoryDigestResult {
  artifact: SynthesisArtifact<MemoryDigestPayload>;
  memories: MemoryNode[];
  clusters: MemoryCluster[];
}

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

export function isMemoryLayer(value: string): value is MemoryLayer {
  return (MEMORY_LAYERS as readonly string[]).includes(value);
}

export function isMemoryStability(value: string): value is MemoryStability {
  return (MEMORY_STABILITIES as readonly string[]).includes(value);
}

export function deriveMemoryLayer(kind: MemoryKind): MemoryLayer {
  if (kind === 'lesson') return 'episodic';
  if (kind === 'pattern') return 'procedural';
  return 'semantic';
}

export function deriveMemoryStability(input: {
  evidence_count: number;
  confidence: number;
  recall_count: number;
  user_confirmed?: boolean;
  current?: MemoryStability;
}): MemoryStability {
  if (input.current === 'core') return 'core';
  if (input.user_confirmed && input.evidence_count >= 10 && input.recall_count >= 5 && input.confidence >= 0.75) return 'core';
  if ((input.user_confirmed && input.confidence >= 0.6) || (input.evidence_count >= 3 && input.confidence >= 0.6)) return 'stable';
  return 'volatile';
}
