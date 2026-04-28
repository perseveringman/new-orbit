import type { NoteAreaRef } from './note';
import type { SynthesisArtifact } from './synthesis';

export const LIBRARY_KINDS = ['article', 'pdf', 'video', 'bookmark'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_STATUSES = ['saved', 'reading', 'read', 'distilled', 'archived'] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export type LibrarySourceKind = 'url' | 'feed' | 'manual' | 'quick_capture' | 'share';

export interface LibrarySource {
  kind: LibrarySourceKind;
  url?: string;
  feed_item_id?: string;
  feed_source_id?: string;
  note?: string;
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
  kind?: LibraryKind;
  title?: string;
  url?: string;
  local_path?: string;
  body?: string;
  tags?: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  source?: LibrarySource;
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
