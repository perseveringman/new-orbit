import type { ResourceSuggestion } from '../resource';
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

export interface SynthesisPayloadMap {
  'summary.daily': DailySummaryPayload;
  'distill.library': LibraryDistillPayload;
  'emerge.resource': ResourceEmergencePayload;
  'classify.area': AreaClassificationPayload;
}

