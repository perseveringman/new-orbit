import type { NoteAreaRef } from './note';
import type { SynthesisArtifact } from './synthesis';

export const LIBRARY_KINDS = ['article', 'markdown', 'pdf', 'epub', 'video', 'podcast', 'bookmark'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_STATUSES = ['saved', 'reading', 'read', 'distilled', 'archived'] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export type LibrarySourceKind = 'url' | 'feed' | 'manual' | 'quick_capture' | 'share';

export interface LibrarySource {
  kind: LibrarySourceKind;
  url?: string;
  canonical_url?: string;
  provider?: string;
  external_id?: string;
  capture_id?: string;
  feed_item_id?: string;
  feed_source_id?: string;
  feed_fetch_run_id?: string;
  source_title?: string;
  raw_share_text?: string;
  origin_app?: string;
  parser_hint?: string;
  content_status?: 'pending' | 'parsed' | 'failed' | 'skipped';
  content_connector_id?: string;
  content_connector_version?: string;
  content_error?: string;
  content_fetched_at?: string;
  channel_name?: string;
  channel_id?: string;
  author?: string;
  duration_seconds?: number;
  fetched_at?: string;
  published_at?: string;
  language?: string;
  note?: string;
  preferred_transcript_track_id?: string;
  preferred_bilingual_pair_id?: string;
  transcript_tracks?: LibraryTranscriptTrackRef[];
  bilingual_pairs?: LibraryBilingualPairRef[];
}

export interface LibraryTranscriptTrackRef {
  id: string;
  language: string;
  label: string;
  source: string;
  source_kind: string;
  status: string;
  alignment: string;
  segments_ref_path?: string;
  markdown_ref_path?: string;
  translation_of_track_id?: string;
  generated_from_track_id?: string;
  artifact_id?: string;
}

export interface LibraryBilingualPairRef {
  id: string;
  source_track_id: string;
  translation_track_id: string;
  mode: 'interleaved';
  markdown_ref_path?: string;
}

export interface LibraryAnnotation {
  id: string;
  at: string;
  type: 'highlight' | 'underline' | 'bold' | 'comment';
  text: string;
  comment?: string;
  color?: string;
  note_id?: string;
}

export interface LibraryItemFrontmatter {
  id: string;
  kind: LibraryKind;
  title: string;
  url?: string;
  local_path?: string;
  status: LibraryStatus;
  created: string;
  updated: string;
  tags: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  source?: LibrarySource;
  reading_progress?: number;
  total_reading_seconds?: number;
  annotations?: LibraryAnnotation[];
  source_snapshot_ref?: string;
  source_html_ref?: string;
  promoted_enrichment_artifact_ids?: string[];
  feed_collection_artifact_ids?: string[];
  preferred_display_artifact_id?: string;
  distillation_artifact_ids?: string[];
  distilled_note_ids?: string[];
}

export interface LibraryItem {
  frontmatter: LibraryItemFrontmatter;
  body: string;
  path: string;
}

export interface LibraryFilter {
  kind?: LibraryKind;
  status?: LibraryStatus;
  tag?: string;
  area_slug?: string;
  resource_ref?: string;
  include_archived?: boolean;
}

export interface SaveLibraryItemInput {
  id?: string;
  kind?: LibraryKind;
  title?: string;
  url?: string;
  local_path?: string;
  body?: string;
  tags?: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  source?: LibrarySource;
  source_snapshot_ref?: string;
  source_html_ref?: string;
  promoted_enrichment_artifact_ids?: string[];
  feed_collection_artifact_ids?: string[];
  preferred_display_artifact_id?: string;
}

export interface UpdateLibraryItemInput extends Partial<Omit<LibraryItemFrontmatter, 'id' | 'created'>> {
  body?: string;
}

export interface AddLibraryAnnotationInput {
  type?: LibraryAnnotation['type'];
  text: string;
  comment?: string;
  color?: string;
}

export interface LibraryReadingUpdateInputV2 {
  progress?: number;
  readingSecondsDelta?: number;
  markRead?: boolean;
}

export interface AcceptLibraryDistillationInput {
  artifact_id: string;
  target_type?: 'capture' | 'longform';
  user_body?: string;
}

export interface LibraryDistillationResult {
  artifact: SynthesisArtifact;
  item: LibraryItem;
}

export interface LibraryAcceptDistillationResult {
  item: LibraryItem;
  note_id: string;
  note_path: string;
}
