import type { NoteAreaRef } from './note';
import type { LibraryItem } from './library';
import type { SynthesisArtifact } from './synthesis';

export const FEED_SOURCE_KINDS = ['rss', 'youtube', 'twitter', 'newsletter', 'custom'] as const;
export type FeedSourceKind = (typeof FEED_SOURCE_KINDS)[number];

export const FEED_ITEM_STATUSES = ['new', 'seen', 'ignored', 'saved'] as const;
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number];

export interface FeedSource {
  id: string;
  title: string;
  url: string;
  kind: FeedSourceKind;
  areas?: NoteAreaRef[];
  enabled: boolean;
  added_at: string;
  last_fetched_at?: string;
  last_fetch_error?: string;
}

export interface CreateFeedSourceInput {
  title?: string;
  url: string;
  kind?: FeedSourceKind;
  areas?: NoteAreaRef[];
  enabled?: boolean;
}

export interface UpdateFeedSourceInput {
  title?: string;
  areas?: NoteAreaRef[];
  enabled?: boolean;
}

export interface FeedItem {
  id: string;
  source_id: string;
  title: string;
  url: string;
  author?: string;
  published_at?: string;
  fetched_at: string;
  summary?: string;
  image_url?: string;
  status: FeedItemStatus;
  saved_library_item_id?: string;
  seen_at?: string;
  ignored_at?: string;
}

export interface FeedItemFilter {
  source_id?: string;
  status?: FeedItemStatus;
  include_ignored?: boolean;
  include_saved?: boolean;
}

export interface FeedFetchResult {
  source_id: string;
  fetched: number;
  created: number;
  skipped: number;
  error?: string;
}

export interface SaveFeedToLibraryInput {
  note?: string;
  tags?: string[];
}

export interface SaveFeedToLibraryResult {
  feed_item: FeedItem;
  library_item: LibraryItem;
}

export interface FeedDigestPayload {
  date: string;
  item_count: number;
  headline: string;
  highlights: Array<{ title: string; url: string; summary?: string }>;
}

export interface FeedClusterPayload {
  scope: string;
  clusters: Array<{ label: string; item_ids: string[]; rationale: string }>;
}

export interface FeedSynthesisResult<TPayload = unknown> {
  artifact: SynthesisArtifact<TPayload>;
}
