export const SYNTHESIS_KINDS = [
  'summary.daily',
  'summary.weekly',
  'summary.monthly',
  'summary.yearly',
  'summary.entity',
  'distill.library',
  'emerge.resource',
  'relate.notes',
  'classify.area',
  'timeline.narrative',
  'memory.digest',
  'search.answer',
  'qa.personal',
  'work.context',
  'report.open_loops',
  'review.weekly',
  'feed.digest',
  'feed.cluster',
  'feed.report.daily',
  'feed.item.translation',
  'feed.youtube.subtitle.ai',
  'feed.item.analysis'
] as const;

export type SynthesisKind = (typeof SYNTHESIS_KINDS)[number];

export const SYNTHESIS_STATUSES = ['fresh', 'stale', 'superseded', 'failed'] as const;
export type SynthesisStatusValue = (typeof SYNTHESIS_STATUSES)[number];

export const SYNTHESIS_SOURCE_KINDS = [
  'note',
  'library',
  'feed',
  'resource',
  'project',
  'area',
  'task',
  'conversation',
  'event',
  'timeline_range',
  'kb',
  'raw'
] as const;

export type SynthesisSourceKind = (typeof SYNTHESIS_SOURCE_KINDS)[number];

export interface SynthesisSource {
  kind: SynthesisSourceKind;
  ref?: string;
  range?: { from: string; to: string };
  weight?: number;
  title?: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface SynthesisProvenance {
  runtime: 'sdk:anthropic' | 'sdk:minimax' | 'sdk:deepseek' | 'cli:claude' | string;
  model: string;
  prompt_version: string;
  generated_at: string;
  cost_usd?: number;
  tokens?: {
    input: number;
    output: number;
    cache_read?: number;
  };
  trace_id?: string;
}

export interface SynthesisArtifact<TPayload = unknown> {
  id: string;
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  provenance: SynthesisProvenance;
  payload: TPayload;
  status: SynthesisStatusValue;
  created_at: string;
  invalidated_at?: string;
  superseded_by?: string;
  user_edited?: boolean;
  error?: string;
}

export type SynthesisJobPriority = 'user-blocking' | 'interactive' | 'background' | 'maintenance';
export type SynthesisJobReason = 'missing' | 'stale' | 'manual' | 'scheduled';
export type SynthesisJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'budget_exceeded';

export interface SynthesisJob {
  id: string;
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  priority: SynthesisJobPriority;
  reason: SynthesisJobReason;
  created_at: string;
  budget_usd?: number;
  status: SynthesisJobStatus;
  artifact_id?: string;
  error?: string;
}

export interface PromptTemplate {
  kind: SynthesisKind;
  version: string;
  defaultBudget: { input_tokens: number; output_tokens: number; usd?: number };
}

export interface EnsureSynthesisInput {
  kind: SynthesisKind;
  scope_key: string;
  sources: SynthesisSource[];
  priority?: SynthesisJobPriority;
  reason?: SynthesisJobReason;
  force?: boolean;
  budget_usd?: number;
}

export interface SynthesisFilter {
  kind?: SynthesisKind;
  scope_key?: string;
  status?: SynthesisStatusValue;
  limit?: number;
}

export interface ApplyUserEditInput {
  artifact_id: string;
  payload: unknown;
}

export interface SynthesisIndexFile {
  version: 1;
  latest: Record<string, string>;
}

export interface SynthesisDLQEntry {
  id: string;
  job: SynthesisJob;
  error: string;
  at: string;
  raw_output?: string;
}
