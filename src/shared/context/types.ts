import type { EvidenceScopeRef, EvidenceSelector } from '../evidence';

export type ContextPacketPurpose = 'ask' | 'task' | 'review' | 'project' | 'area' | 'resource';

export interface ContextPacketScope {
  kind: 'global' | EvidenceScopeRef['kind'];
  ref?: string;
}

export interface ContextBudget {
  max_tokens: number;
  estimated_tokens: number;
}

export interface ContextFreshness {
  evidence_until: string;
  stale_sources?: string[];
}

export type ContextSectionKind =
  | 'scope_summary'
  | 'recent_work'
  | 'relevant_evidence'
  | 'graph_neighbors'
  | 'memories'
  | 'synthesis'
  | 'open_loops'
  | 'suggested_next_steps';

export interface ContextSection {
  kind: ContextSectionKind;
  title: string;
  content: string;
  citations: EvidenceSelector[];
  priority: number;
}

export interface ContextPacket {
  id: string;
  purpose: ContextPacketPurpose;
  scope: ContextPacketScope;
  query?: string;
  generated_at: string;
  freshness: ContextFreshness;
  budget: ContextBudget;
  sections: ContextSection[];
  evidence: EvidenceSelector[];
  synthesis_refs: string[];
  memory_refs: string[];
  open_loop_refs?: string[];
}

export interface BuildContextPacketInput {
  purpose: ContextPacketPurpose;
  scope?: ContextPacketScope;
  query?: string;
  max_tokens?: number;
  evidence_limit?: number;
  graph_limit?: number;
  synthesis_mode?: 'lookup' | 'ensure' | 'off';
}
