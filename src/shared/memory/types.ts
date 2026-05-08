import type { Resource } from '../resource';
import type { SynthesisArtifact, SynthesisSource } from '../synthesis';

export const MEMORY_KINDS = ['interest', 'preference', 'pattern', 'lesson', 'entity_memory', 'goal'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_STABILITIES = ['volatile', 'stable', 'core'] as const;
export type MemoryStability = (typeof MEMORY_STABILITIES)[number];

export interface MemoryNode {
  id: string;
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
  theme: string;
  memories: string[];
  coherence: number;
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
  occurred_at: string;
}

export interface MemoryExtractionInput {
  source_kind: 'conversation' | 'review' | 'timeline_span' | 'manual';
  source_ref: string;
  content: string;
}

export interface CreateMemoryInput {
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
  kind?: MemoryKind | 'all';
  stability?: MemoryStability | 'all';
  include_archived?: boolean;
  query?: string;
}

export interface RecallOptions {
  user_id?: string;
  scope?: string;
  max_memories?: number;
  min_confidence?: number;
  exclude_volatile?: boolean;
  triggered_by?: RecallEvent['triggered_by'];
  used_in?: RecallEvent['used_in'];
}

export interface RecallResult {
  memories: MemoryNode[];
  explanation: string;
}

export interface RecallStats {
  total: number;
  by_kind: Record<string, number>;
}

export interface MemoryDigestPayload {
  period: { from: string; to: string };
  new_memories: MemoryNode[];
  reinforced_memories: string[];
  fading_memories: string[];
  clusters: MemoryCluster[];
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

export function isMemoryStability(value: string): value is MemoryStability {
  return (MEMORY_STABILITIES as readonly string[]).includes(value);
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
