import type { EvidenceScopeRef, EvidenceSelector } from '../evidence';
import type { OpenLoopPayload, WorkContextPayload } from '../synthesis/payloads';

export type ContextPacketPurpose = 'ask' | 'task' | 'review' | 'project' | 'area' | 'resource';

export type ContextRetrievalIntent =
  | 'direct'
  | 'specific_lookup'
  | 'temporal_count'
  | 'multi_hop'
  | 'global_sensemaking'
  | 'external_session';

export type ContextRetrievalComplexity = 'low' | 'medium' | 'high';

export type ContextRetrievalRoute =
  | 'evidence_chunks'
  | 'semantic_index'
  | 'graph_neighbors'
  | 'memories'
  | 'synthesis'
  | 'external_ai_sessions';

export type ContextRetrievalStepKind =
  | 'route'
  | 'hybrid_search'
  | 'query_rewrite'
  | 'evidence_grade'
  | 'graph_expand'
  | 'source_read';

export interface ContextRetrievalStep {
  id: string;
  kind: ContextRetrievalStepKind;
  status: 'planned' | 'executed' | 'skipped';
  reason: string;
  query?: string;
  target?: string;
  result_count?: number;
  notes?: string;
}

export interface ContextRetrievalSufficiency {
  status: 'enough' | 'thin' | 'missing';
  score: number;
  reasons: string[];
}

export interface ContextRetrievalTrace {
  intent: ContextRetrievalIntent;
  complexity: ContextRetrievalComplexity;
  needs_retrieval: boolean;
  routes: ContextRetrievalRoute[];
  queries: string[];
  steps: ContextRetrievalStep[];
  sufficiency: ContextRetrievalSufficiency;
}

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
  | 'answer_guidance'
  | 'retrieval_trace'
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
  retrieval?: ContextRetrievalTrace;
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
  agentic_retrieval?: boolean;
}

export interface BuildWorkContextInput {
  scope?: ContextPacketScope;
  period?: { from: string; to: string };
  query?: string;
  limit?: number;
}

export interface WorkContextReport {
  work_context: WorkContextPayload;
  open_loops: OpenLoopPayload;
  evidence: EvidenceSelector[];
}
