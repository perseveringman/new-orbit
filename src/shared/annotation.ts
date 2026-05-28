import type { EvidenceSelector } from './evidence';
import type { SynthesisArtifact } from './synthesis';

export const ANNOTATION_TARGET_KINDS = [
  'library_item',
  'note',
  'resource',
  'conversation',
  'annotation',
  'synthesis_artifact'
] as const;

export const ANNOTATION_ANCHOR_KINDS = [
  'whole_source',
  'text_quote',
  'line_range',
  'message_range',
  'time_range',
  'rect',
  'annotation_body_range'
] as const;

export const ANNOTATION_TYPES = [
  'highlight',
  'underline',
  'comment',
  'resource_note',
  'ai_note'
] as const;

export const ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

export const ANNOTATION_AI_ACTIONS = ['translate', 'explain', 'formula', 'related'] as const;

export type AnnotationTargetKind = (typeof ANNOTATION_TARGET_KINDS)[number];
export type AnnotationAnchorKind = (typeof ANNOTATION_ANCHOR_KINDS)[number];
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];
export type AnnotationAiAction = (typeof ANNOTATION_AI_ACTIONS)[number];

export interface AnnotationTargetRef {
  kind: AnnotationTargetKind;
  ref: string;
  title_snapshot?: string;
  evidence_source_id?: string;
}

export interface AnnotationQuoteAnchor {
  exact: string;
  prefix?: string;
  suffix?: string;
  content_hash?: string;
}

export interface AnnotationRectAnchor {
  page?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationMessageRangeAnchor {
  from_turn_id: string;
  to_turn_id?: string;
}

export interface AnnotationAnchor {
  kind: AnnotationAnchorKind;
  selector?: EvidenceSelector;
  quote?: AnnotationQuoteAnchor;
  rects?: AnnotationRectAnchor[];
  message_range?: AnnotationMessageRangeAnchor;
  range?: {
    from?: string | number;
    to?: string | number;
  };
}

export interface AnnotationRecord {
  id: string;
  target: AnnotationTargetRef;
  context_target?: AnnotationTargetRef;
  anchor: AnnotationAnchor;
  type: AnnotationType;
  color?: AnnotationColor;
  title: string;
  body_markdown: string;
  parent_annotation_id?: string;
  created_at: string;
  updated_at: string;
  created_by: 'user' | 'agent';
  linked_note_id?: string;
  artifact_refs?: string[];
  metadata?: Record<string, unknown>;
  archived?: boolean;
}

export interface CreateAnnotationInput {
  target: AnnotationTargetRef;
  context_target?: AnnotationTargetRef;
  anchor: AnnotationAnchor;
  type: AnnotationType;
  color?: AnnotationColor;
  title?: string;
  body_markdown: string;
  parent_annotation_id?: string;
  created_by?: 'user' | 'agent';
  linked_note_id?: string;
  artifact_refs?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAnnotationInput {
  target?: AnnotationTargetRef;
  context_target?: AnnotationTargetRef | null;
  anchor?: AnnotationAnchor;
  type?: AnnotationType;
  color?: AnnotationColor | null;
  title?: string;
  body_markdown?: string;
  parent_annotation_id?: string | null;
  linked_note_id?: string | null;
  artifact_refs?: string[];
  metadata?: Record<string, unknown> | null;
  archived?: boolean;
}

export interface AnnotationFilter {
  target?: AnnotationTargetRef;
  context_target?: AnnotationTargetRef;
  include_archived?: boolean;
  type?: AnnotationType;
  parent_annotation_id?: string;
}

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationSize {
  width: number;
  height: number;
}

export interface AnnotationViewState {
  space_id: string;
  annotation_id: string;
  position: AnnotationPoint;
  size: AnnotationSize;
  z_index: number;
  status: 'open' | 'minimized' | 'closed';
  updated_at: string;
}

export interface UpdateAnnotationViewStateInput {
  position?: AnnotationPoint;
  size?: AnnotationSize;
  z_index?: number;
  status?: AnnotationViewState['status'];
}

export interface GenerateAnnotationInput {
  action: AnnotationAiAction;
  target: AnnotationTargetRef;
  context_target?: AnnotationTargetRef;
  anchor: AnnotationAnchor;
  selected_text: string;
  canvas_item_ids?: string[];
  color?: AnnotationColor;
  parent_annotation_id?: string;
}

export interface GenerateAnnotationResult {
  annotation: AnnotationRecord;
  artifact: SynthesisArtifact<AnnotationSynthesisPayload>;
}

export interface AnnotationSynthesisPayload {
  action: AnnotationAiAction;
  title: string;
  body_markdown: string;
  summary?: string;
  confidence?: number;
  warnings?: string[];
}
