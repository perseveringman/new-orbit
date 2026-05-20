import type { NoteAreaRef } from './note';
import type { LibraryItem } from './library';
import type { SynthesisArtifact } from './synthesis';

export const FEED_SOURCE_KINDS = [
  'rss',
  'youtube',
  'twitter',
  'reddit',
  'hackernews',
  'newsletter',
  'podcast',
  'github',
  'custom'
] as const;
export type FeedSourceKind = (typeof FEED_SOURCE_KINDS)[number];

export const FEED_ITEM_STATUSES = ['new', 'seen', 'ignored', 'saved', 'expired'] as const;
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number];

export type FeedSourcePriority = 'low' | 'normal' | 'high';
export type FeedInitialBackfillMode = 'recent' | 'full';

export interface FeedFetchPolicy {
  interval_minutes?: number;
  max_items_per_fetch?: number;
  initial_backfill?: FeedInitialBackfillMode;
  initial_backfill_count?: number;
  backfill_days?: number;
  respect_cache?: boolean;
}

export interface FeedProcessingPolicy {
  extract_readable?: boolean;
  auto_translate_to?: string;
  auto_analyze?: boolean;
  generate_item_summary?: boolean;
  preferred_languages?: string[];
  max_transcripts_per_fetch?: number;
  capture_comments?: boolean;
  include_replies?: boolean;
}

export interface FeedRetentionPolicy {
  keep_raw_days?: number;
  keep_ignored_days?: number;
  auto_expire_unsaved_days?: number;
}

export interface FeedSource {
  id: string;
  title: string;
  url: string;
  kind: FeedSourceKind;
  metadata?: FeedSourceMetadata;
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  tags?: string[];
  priority?: FeedSourcePriority;
  fetch_policy?: FeedFetchPolicy;
  processing_policy?: FeedProcessingPolicy;
  retention_policy?: FeedRetentionPolicy;
  enabled: boolean;
  added_at: string;
  updated_at?: string;
  last_fetched_at?: string;
  last_fetch_error?: string;
}

export interface CreateFeedSourceInput {
  title?: string;
  url: string;
  kind?: FeedSourceKind;
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  tags?: string[];
  priority?: FeedSourcePriority;
  fetch_policy?: FeedFetchPolicy;
  processing_policy?: FeedProcessingPolicy;
  retention_policy?: FeedRetentionPolicy;
  enabled?: boolean;
}

export interface UpdateFeedSourceInput {
  title?: string;
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  tags?: string[];
  priority?: FeedSourcePriority;
  fetch_policy?: FeedFetchPolicy;
  processing_policy?: FeedProcessingPolicy;
  retention_policy?: FeedRetentionPolicy;
  enabled?: boolean;
}

export type FeedFetchRunStatus = 'running' | 'success' | 'partial' | 'failure';
export type FeedFetchRunStageStatus = 'pending' | 'running' | 'success' | 'partial' | 'failure' | 'skipped';

export interface FeedFetchRunStage {
  id: string;
  label: string;
  status: FeedFetchRunStageStatus;
  detail?: string;
  total?: number;
  completed?: number;
  started_at?: string;
  completed_at?: string;
}

export interface FeedFetchRun {
  id: string;
  source_id: string;
  source_url: string;
  started_at: string;
  completed_at?: string;
  status: FeedFetchRunStatus;
  fetched: number;
  created: number;
  skipped: number;
  failed?: number;
  error?: string;
  raw_feed_ref?: string;
  stages?: FeedFetchRunStage[];
  stats?: Record<string, number | string | boolean | undefined>;
}

export interface FeedReadableRef {
  kind:
    | 'feed_xml'
    | 'article_html'
    | 'article_markdown'
    | 'youtube_candidate_json'
    | 'youtube_info_json'
    | 'youtube_subtitle'
    | 'youtube_transcript_segments'
    | 'youtube_bilingual_transcript'
    | 'youtube_transcript_markdown'
    | 'x_candidate_json'
    | 'x_thread_json'
    | 'x_post_markdown'
    | 'reddit_candidate_json'
    | 'reddit_discussion_json'
    | 'reddit_post_markdown'
    | 'hackernews_candidate_json'
    | 'hackernews_discussion_json'
    | 'hackernews_story_markdown'
    | 'artifact';
  path?: string;
  artifact_id?: string;
  content_hash?: string;
  created_at: string;
}

export interface FeedPinnedBy {
  kind: 'library' | 'digest' | 'cluster' | 'report';
  ref: string;
  at: string;
}

export type FeedTranscriptTrackSource = 'youtube' | 'ai' | 'user';
export type FeedTranscriptTrackSourceKind = 'manual' | 'auto' | 'ai_translation' | 'user_edit';
export type FeedTranscriptTrackStatus = 'available' | 'captured' | 'generating' | 'failed';
export type FeedTranscriptAlignment = 'segment_exact' | 'segment_grouped' | 'freeform';

export interface FeedTranscriptSegment {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence?: number;
  source_segment_ids?: string[];
  translated_from_segment_ids?: string[];
}

export interface FeedTranscriptSegmentsFile {
  version: 1;
  item_id?: string;
  track_id: string;
  language: string;
  source: FeedTranscriptTrackSource;
  source_kind: FeedTranscriptTrackSourceKind;
  translation_of_track_id?: string;
  generated_from_track_id?: string;
  segments: FeedTranscriptSegment[];
}

export interface FeedTranscriptTrackRef {
  id: string;
  language: string;
  label: string;
  source: FeedTranscriptTrackSource;
  source_kind: FeedTranscriptTrackSourceKind;
  status: FeedTranscriptTrackStatus;
  alignment: FeedTranscriptAlignment;
  raw_ref?: FeedReadableRef;
  segments_ref?: FeedReadableRef;
  markdown_ref?: FeedReadableRef;
  translation_of_track_id?: string;
  generated_from_track_id?: string;
  artifact_id?: string;
  content_hash?: string;
  created_at: string;
  error?: string;
}

export interface FeedBilingualPairRef {
  id: string;
  source_track_id: string;
  translation_track_id: string;
  mode: 'interleaved';
  markdown_ref?: FeedReadableRef;
  created_at: string;
}

export interface FeedMediaPayload {
  kind: 'video' | 'audio';
  provider: 'youtube';
  duration_seconds?: number;
  transcript_tracks: FeedTranscriptTrackRef[];
  preferred_track_id?: string;
  preferred_bilingual_pair_id?: string;
  bilingual_pairs?: FeedBilingualPairRef[];
}

export interface FeedItem {
  id: string;
  source_id: string;
  fetch_run_id?: string;
  guid?: string;
  title: string;
  url: string;
  canonical_url?: string;
  dedupe_key?: string;
  author?: string;
  published_at?: string;
  fetched_at: string;
  site_name?: string;
  language?: string;
  summary?: string;
  excerpt?: string;
  image_url?: string;
  content_hash?: string;
  metadata?: FeedItemMetadata;
  media?: FeedMediaPayload;
  raw_ref?: FeedReadableRef;
  raw_refs?: FeedReadableRef[];
  extracted_ref?: FeedReadableRef;
  enrichment_artifact_ids?: string[];
  collection_artifact_ids?: string[];
  pinned_by?: FeedPinnedBy[];
  status: FeedItemStatus;
  saved_library_item_id?: string;
  seen_at?: string;
  ignored_at?: string;
}

export interface FeedItemContent {
  item: FeedItem;
  content: string;
  ref?: FeedReadableRef;
  content_kind: FeedReadableRef['kind'] | 'missing';
}

export interface FeedItemFilter {
  source_id?: string;
  status?: FeedItemStatus;
  include_ignored?: boolean;
  include_saved?: boolean;
}

export interface FeedFetchResult {
  run_id?: string;
  source_id: string;
  fetched: number;
  created: number;
  skipped: number;
  failed?: number;
  error?: string;
}

export type FeedTaskPlatform = 'rss' | 'youtube' | 'x' | 'reddit' | 'hackernews' | 'custom';
export type FeedTaskKind = 'source.initial_fetch' | 'source.refresh';
export type FeedTaskPriority = 'manual' | 'scheduled' | 'background';
export type FeedTaskStatus = 'queued' | 'running' | 'retry_wait' | 'success' | 'failed' | 'cancelled';

export interface FeedTask {
  id: string;
  kind: FeedTaskKind;
  source_id: string;
  source_title?: string;
  source_url?: string;
  platform: FeedTaskPlatform;
  priority: FeedTaskPriority;
  status: FeedTaskStatus;
  dedupe_key: string;
  attempts: number;
  max_attempts: number;
  due_at: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  lease_expires_at?: string;
  error?: string;
  run_ids?: string[];
  result?: FeedFetchResult;
}

export interface FeedTaskLaneSnapshot {
  platform: FeedTaskPlatform;
  running: number;
  queued: number;
  retry_wait: number;
}

export interface FeedTaskSnapshot {
  jobs: FeedTask[];
  total: number;
  running: number;
  queued: number;
  retry_wait: number;
  success: number;
  failed: number;
  cancelled: number;
  created: number;
  fetched: number;
  lanes: FeedTaskLaneSnapshot[];
}

export interface EnqueueFeedTaskInput {
  source_id?: string;
  kind?: FeedTaskKind;
  priority?: FeedTaskPriority;
  force?: boolean;
}

export interface EnqueueFeedTaskResult {
  jobs: FeedTask[];
  snapshot: FeedTaskSnapshot;
}

export type FeedChangeEventType =
  | 'sources_changed'
  | 'items_changed'
  | 'runs_changed'
  | 'tasks_changed'
  | 'synthesis_changed';

export interface FeedChangeEvent {
  type: FeedChangeEventType;
  at: string;
  vault_path?: string;
  source_id?: string;
  item_id?: string;
  run_id?: string;
  task_id?: string;
  synthesis_kind?: string;
  snapshot?: FeedTaskSnapshot;
}

export type YouTubeSourceType = 'channel' | 'playlist' | 'video';

export interface FeedSourceMetadata {
  provider?: string;
  youtube_source_type?: YouTubeSourceType;
  youtube_initial_backfill_completed_at?: string;
  x_source_type?: 'profile' | 'timeline';
  x_timeline_type?: 'following' | 'for-you';
  x_handle?: string;
  x_profile_name?: string;
  reddit_subreddit?: string;
  reddit_sort?: string;
  reddit_time?: string;
  hn_feed_type?: string;
}

export interface FeedExternalUrlEntity {
  url: string;
  expanded_url?: string;
  display_url?: string;
  unwound_url?: string;
  title?: string;
  description?: string;
  resolved_via?: 'x_entity' | 'tco_redirect';
}

export interface FeedItemMetadata {
  provider?: string;
  external_id?: string;
  source_type?: YouTubeSourceType;
  source_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  channel_name?: string;
  channel_id?: string;
  uploader_id?: string;
  uploader_url?: string;
  published_at?: string;
  upload_date?: string;
  duration_seconds?: number;
  duration_human?: string;
  view_count?: number;
  like_count?: number;
  language?: string;
  availability?: string;
  has_transcript?: boolean;
  subtitle_format?: string;
  subtitle_language?: string;
  subtitle_status?: 'captured' | 'available_but_not_downloaded' | 'not_exposed';
  subtitle_requested_languages?: string[];
  subtitle_available_languages?: string[];
  automatic_caption_languages?: string[];
  subtitle_track_count?: number;
  subtitle_languages?: string[];
  preferred_transcript_track_id?: string;
  subtitle_download_errors?: string[];
  last_processing_error?: string;
  x_source_type?: 'profile' | 'timeline';
  x_timeline_type?: 'following' | 'for-you';
  x_handle?: string;
  author_handle?: string;
  author_name?: string;
  author_bio?: string;
  author_location?: string;
  author_url?: string;
  author_profile_url?: string;
  author_avatar_url?: string;
  author_verified?: boolean;
  author_followers_count?: number;
  author_following_count?: number;
  author_tweet_count?: number;
  author_profile_created_at?: string;
  author_profile_cached_at?: string;
  is_reply?: boolean;
  reply_to?: string;
  retweet_count?: number;
  reply_count?: number;
  quoted_url?: string;
  x_urls?: FeedExternalUrlEntity[];
  subreddit?: string;
  reddit_sort?: string;
  outbound_url?: string;
  score_count?: number;
  comment_count?: number;
  hn_feed_type?: string;
  hn_discussion_url?: string;
}

export interface SaveFeedToLibraryInput {
  note?: string;
  tags?: string[];
  areas?: NoteAreaRef[];
  resource_refs?: string[];
  include_enrichments?: boolean;
  preferred_display?: 'original' | 'translated';
  translation_artifact_id?: string;
}

export interface SaveFeedToLibraryResult {
  feed_item: FeedItem;
  library_item: LibraryItem;
}

export interface FeedDigestPayload {
  date: string;
  item_count: number;
  headline: string;
  highlights: FeedDigestHighlight[];
  recommendations?: FeedRecommendation[];
}

export interface FeedClusterPayload {
  scope: string;
  clusters: FeedCluster[];
}

export interface FeedItemTranslationPayload {
  item_id: string;
  source_language?: string;
  target_language: string;
  title: string;
  excerpt?: string;
  content: string;
  note?: string;
}

export interface FeedAiSubtitlePayload {
  item_id: string;
  source_track_id: string;
  target_language: string;
  mode: 'translate_subtitle';
  model: string;
  prompt_version: string;
  output_track_id: string;
  output_segments_ref: FeedReadableRef;
  output_markdown_ref?: FeedReadableRef;
}

export interface FeedAiSubtitleTranslationSegmentInput {
  source_segment_id?: string;
  source_segment_ids?: string[];
  start_ms?: number;
  end_ms?: number;
  text: string;
}

export interface FeedAiSubtitleTranslationInput {
  source_track_id?: string;
  target_language: string;
  translated_segments: FeedAiSubtitleTranslationSegmentInput[];
  model?: string;
  prompt_version?: string;
}

export interface FeedAiSubtitleTranslationResult {
  feed_item: FeedItem;
  artifact: SynthesisArtifact<FeedAiSubtitlePayload>;
  track: FeedTranscriptTrackRef;
  bilingual_pair: FeedBilingualPairRef;
}

export interface FeedItemAnalysisPayload {
  item_id: string;
  summary: string;
  key_points: string[];
  key_claims?: string[];
  entities: string[];
  why_it_matters?: string;
  triage_label?: FeedTriageLabel;
  relevance_score?: number;
  novelty_score?: number;
  confidence?: number;
  related?: FeedRelatedRef[];
  suggested_actions: string[];
  action_candidates?: FeedRecommendation[];
  risks?: string[];
}

export interface FeedReportPayload {
  date: string;
  item_count: number;
  digest_artifact_id?: string;
  cluster_artifact_id?: string;
  headline?: string;
  executive_summary?: string;
  sections: FeedReportSection[];
  recommendations?: FeedRecommendation[];
}

export type FeedTriageLabel = 'read_now' | 'save' | 'skim' | 'watch' | 'ignore';
export type FeedRecommendationKind =
  | 'read_now'
  | 'save_to_library'
  | 'save_to_library_with_resource'
  | 'ignore'
  | 'watch'
  | 'create_task'
  | 'save_report_as_note';

export interface FeedRelatedRef {
  kind: 'area' | 'resource';
  ref: string;
  title?: string;
  confidence: number;
  reason: string;
}

export interface FeedRecommendation {
  kind: FeedRecommendationKind;
  label: string;
  reason: string;
  item_ids?: string[];
  resource_ref?: string;
  area_ref?: string;
  confidence?: number;
}

export interface FeedDigestHighlight {
  item_id: string;
  source_id: string;
  title: string;
  url: string;
  published_at?: string;
  summary?: string;
  why_it_matters?: string;
  relevance_score?: number;
  novelty_score?: number;
  suggested_action?: FeedRecommendationKind;
}

export interface FeedCluster {
  label: string;
  item_ids: string[];
  source_ids?: string[];
  rationale: string;
  key_claims?: string[];
  relevance_score?: number;
  novelty_score?: number;
  related?: FeedRelatedRef[];
  suggested_actions?: FeedRecommendation[];
}

export interface FeedReportSection {
  title: string;
  item_ids: string[];
  summary: string;
  key_changes?: string[];
  repeated_claims?: string[];
  why_it_matters?: string;
  recommended_item_ids?: string[];
}

export interface FeedSynthesisResult<TPayload = unknown> {
  artifact: SynthesisArtifact<TPayload>;
}
