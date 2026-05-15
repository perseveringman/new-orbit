export const NOTE_TYPES = ['thought', 'longform', 'capture', 'voice_log', 'daily_summary'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_PARA_KINDS = ['floating', 'project', 'area', 'resource', 'archive'] as const;
export type NotePARAKind = (typeof NOTE_PARA_KINDS)[number];

export const NOTE_WORKBENCH_BUCKETS = ['inbox', 'connect', 'express', 'settled'] as const;
export type NoteWorkbenchBucket = (typeof NOTE_WORKBENCH_BUCKETS)[number];

export const NOTE_SUGGESTION_KINDS = [
  'summarize',
  'classify_area',
  'link_resource',
  'relate_note',
  'add_tags',
  'distill_longform',
  'propose_task',
  'create_resource_seed',
  'mark_special'
] as const;
export type NoteSuggestionKind = (typeof NOTE_SUGGESTION_KINDS)[number];

export const NOTE_RELATION_KINDS = ['supports', 'contradicts', 'extends', 'duplicates', 'source_for', 'belongs_to'] as const;
export type NoteRelationKind = (typeof NOTE_RELATION_KINDS)[number];

export type NoteSuggestionRisk = 'low' | 'needs_confirm' | 'proposal';
export type NoteSuggestionStatus = 'proposed' | 'accepted' | 'dismissed';

export const SPECIAL_MARKER_KINDS = [
  'insight',
  'breakthrough',
  'setback',
  'milestone',
  'gratitude',
  'reflection'
] as const;
export type SpecialMarkerKind = (typeof SPECIAL_MARKER_KINDS)[number];

export interface SpecialMarker {
  kind: SpecialMarkerKind;
  icon: string;
}

export interface NoteSource {
  kind: 'library' | 'kb' | 'url' | 'conversation' | 'feed' | 'manual' | 'synthesis';
  ref?: string;
  excerpt?: string;
}

export interface NoteAreaRef {
  area_slug: string;
  primary?: boolean;
  assigned_at: string;
  assigned_by: 'user' | 'synthesis';
}

export interface NoteFrontmatter {
  id: string;
  type: NoteType;
  title?: string;
  created: string;
  updated: string;
  para_kind: NotePARAKind;
  para_ref?: string;
  tags: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  source?: NoteSource;
  audio?: {
    path: string;
    duration_sec: number;
    transcribed: boolean;
  };
  links_out: string[];
  backlinks: string[];
  word_count?: number;
  author?: string;
  visibility?: 'normal' | 'private';
  special_marker?: SpecialMarker;
  synthesis_ref?: string;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  body: string;
  path: string;
}

export interface NoteFilter {
  type?: NoteType;
  para_kind?: NotePARAKind;
  para_ref?: string;
  tag?: string;
  area_slug?: string;
  resource_ref?: string;
  source_kind?: NoteSource['kind'];
  include_archived?: boolean;
}

export interface CreateNoteInput {
  type: NoteType;
  title?: string;
  body: string;
  para_kind?: NotePARAKind;
  para_ref?: string;
  tags?: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  source?: NoteSource;
  special_marker?: SpecialMarker;
  synthesis_ref?: string;
  audio?: NoteFrontmatter['audio'];
}

export interface UpdateNoteInput extends Partial<Omit<NoteFrontmatter, 'id' | 'created'>> {
  body?: string;
}

export interface SearchOptions {
  limit?: number;
}

export interface NoteQueueFilter extends NoteFilter {
  bucket?: NoteWorkbenchBucket | 'all';
  query?: string;
}

export interface NoteQueueItem {
  note_id: string;
  title: string;
  path: string;
  type: NoteType;
  updated: string;
  bucket: NoteWorkbenchBucket;
  reasons: string[];
  action_count: number;
  tags: string[];
  areas: string[];
  resource_refs: string[];
}

export interface NoteSuggestionTarget {
  kind: 'area' | 'resource' | 'note' | 'tag' | 'task' | 'longform' | 'marker' | 'summary';
  ref: string;
  title?: string;
}

export interface NoteWorkbenchSuggestion {
  id: string;
  kind: NoteSuggestionKind;
  title: string;
  summary: string;
  confidence: number;
  risk: NoteSuggestionRisk;
  status: NoteSuggestionStatus;
  evidence?: string[];
  target?: NoteSuggestionTarget;
  patch?: Partial<Pick<NoteFrontmatter, 'tags' | 'areas' | 'resource_refs' | 'special_marker' | 'synthesis_ref'>>;
  params?: Record<string, unknown>;
  artifact_id?: string;
  created_at: string;
}

export interface NoteRelationSuggestion {
  id: string;
  kind: NoteRelationKind;
  target_note_id: string;
  target_path: string;
  target_title: string;
  confidence: number;
  reason: string;
  evidence: string[];
  status: NoteSuggestionStatus;
  artifact_id?: string;
  created_at: string;
}

export interface NoteWorkbenchPayload {
  summary: string;
  key_points: string[];
  suggested_tags: string[];
  suggestions: NoteWorkbenchSuggestion[];
  relations: NoteRelationSuggestion[];
}

export interface NoteWorkbench {
  note: Note;
  bucket: NoteWorkbenchBucket;
  bucket_reasons: string[];
  payload: NoteWorkbenchPayload;
  artifact_id: string;
  relation_artifact_id?: string;
}

export interface NoteWorkbenchInput {
  noteId: string;
  force?: boolean;
}

export interface NoteSuggestionAcceptInput {
  noteId: string;
  suggestionId: string;
  artifactId?: string;
}

export interface NoteSuggestionAcceptResult {
  suggestion: NoteWorkbenchSuggestion | NoteRelationSuggestion;
  note?: Note;
  created?: {
    kind: 'note' | 'resource' | 'task_proposal';
    id: string;
    title?: string;
    path?: string;
  };
}

export interface NoteChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'archived';
  note?: Note;
  noteId: string;
}
