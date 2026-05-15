import type { ResourceSuggestion } from '../resource';
import type { FeedClusterPayload, FeedDigestPayload } from '../feed';
import type { NoteRelationSuggestion, NoteWorkbenchPayload } from '../note';
import type { EvidenceSelector } from '../evidence';
import type { SynthesisSource } from './types';

export interface DailySummaryPayload {
  headline: string;
  narrative: string;
  highlights: string[];
  tomorrow?: string[];
}

export interface LibraryDistillPayload {
  title: string;
  summary: string;
  key_points: string[];
  quotes?: string[];
  suggested_note_type: 'capture' | 'longform';
}

export interface ResourceEmergencePayload {
  suggestions: ResourceSuggestion[];
}

export interface AreaClassificationPayload {
  suggestions: Array<{
    area_slug: string;
    confidence: number;
    reason: string;
    primary?: boolean;
  }>;
}

export interface ResourceEmergenceItemPayload {
  title: string;
  slug: string;
  rationale: string;
  samples: SynthesisSource[];
  suggested_sections: Array<{ section: string; source: SynthesisSource }>;
}

export interface PersonalQAPayload {
  question: string;
  answer: string;
  confidence: number;
  entities: string[];
  evidence: EvidenceSelector[];
  source_chunk_ids: string[];
  source_hash: string;
  useful_for: Array<'ask' | 'task_context' | 'review' | 'resource' | 'project' | 'area'>;
}

export interface WorkContextPayload {
  id: string;
  scope: { kind: 'global' | 'project' | 'area' | 'resource'; ref?: string };
  period: { from: string; to: string };
  current_focus: string;
  active_threads: Array<{
    title: string;
    summary: string;
    evidence: EvidenceSelector[];
    confidence: number;
    likely_next_steps: string[];
    blockers?: string[];
  }>;
  decisions: Array<{
    title: string;
    status: 'made' | 'pending' | 'reversed';
    evidence: EvidenceSelector[];
  }>;
  open_loops: string[];
}

export interface OpenLoopPayload {
  scope: { kind: 'global' | 'project' | 'area' | 'resource'; ref?: string };
  period: { from: string; to: string };
  loops: Array<{
    id: string;
    title: string;
    kind: 'question' | 'task_candidate' | 'decision_pending' | 'follow_up' | 'stale_context';
    status: 'candidate' | 'accepted' | 'dismissed' | 'resolved';
    severity: 'info' | 'suggestion' | 'warning';
    rationale: string;
    evidence: EvidenceSelector[];
    suggested_actions: Array<
      | { kind: 'create_task'; title: string; project_ref?: string }
      | { kind: 'create_note'; title: string; note_type: 'thought' | 'capture' | 'longform' }
      | { kind: 'link_resource'; resource_ref: string }
      | { kind: 'schedule_review'; date?: string }
    >;
  }>;
}

export interface SynthesisPayloadMap {
  'summary.daily': DailySummaryPayload;
  'summary.entity': NoteWorkbenchPayload;
  'distill.library': LibraryDistillPayload;
  'emerge.resource': ResourceEmergencePayload;
  'relate.notes': { relations: NoteRelationSuggestion[] };
  'classify.area': AreaClassificationPayload;
  'qa.personal': PersonalQAPayload;
  'work.context': WorkContextPayload;
  'report.open_loops': OpenLoopPayload;
  'feed.digest': FeedDigestPayload;
  'feed.cluster': FeedClusterPayload;
}
