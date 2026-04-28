export const NOTE_TYPES = ['thought', 'longform', 'capture', 'voice_log', 'daily_summary'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_PARA_KINDS = ['floating', 'project', 'area', 'resource', 'archive'] as const;
export type NotePARAKind = (typeof NOTE_PARA_KINDS)[number];

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

export interface NoteFrontmatter {
  id: string;
  type: NoteType;
  title?: string;
  created: string;
  updated: string;
  para_kind: NotePARAKind;
  para_ref?: string;
  tags: string[];
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
  include_archived?: boolean;
}

export interface CreateNoteInput {
  type: NoteType;
  title?: string;
  body: string;
  para_kind?: NotePARAKind;
  para_ref?: string;
  tags?: string[];
  source?: NoteSource;
  special_marker?: SpecialMarker;
  audio?: NoteFrontmatter['audio'];
}

export interface UpdateNoteInput extends Partial<Omit<NoteFrontmatter, 'id' | 'created'>> {
  body?: string;
}

export interface SearchOptions {
  limit?: number;
}

export interface NoteChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'archived';
  note?: Note;
  noteId: string;
}
