import type { InboxItem } from './inbox';
import type { LibraryItem } from './library';
import type { Note } from './note';

export interface FeedSubscription {
  id: string;
  kind: 'rss';
  url: string;
  title: string;
  category?: string;
  added_at: string;
  last_fetched_at?: string;
  fetch_interval_seconds: number;
  last_fetch_error?: string;
}

export interface AddFeedSubscriptionInput {
  url: string;
  title?: string;
  category?: string;
  fetchIntervalSeconds?: number;
}

export interface FeedRefreshResult {
  subscriptionId: string;
  fetched: number;
  created: number;
  skipped: number;
  error?: string;
}

export interface FeedHistoryResult {
  item: InboxItem;
  archived: boolean;
}

export interface SaveFeedItemInput {
  note?: string;
  actor?: 'user' | 'agent';
}

export interface SaveLibraryArticleInput {
  url: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  source?: 'manual' | 'feed_upgrade' | 'quick_capture' | 'share';
  sourceNote?: string;
  originFeedSubscriptionId?: string;
  originFeedItemId?: string;
  content?: string;
  actor?: 'user' | 'agent';
}

export interface LibraryReadingUpdateInput {
  scrollPosition: number;
  readingSecondsDelta?: number;
  markRead?: boolean;
}

export interface PromoteLibraryArticleInput {
  targetPath?: string;
  noAiSummary?: boolean;
  actor?: 'user' | 'agent';
}

export interface PromoteResult {
  item: InboxItem;
  resourcePath: string;
}

export interface CreateThoughtInput {
  content: string;
  tags?: string[];
  createdFrom?: 'quick_capture' | 'manual' | 'voice' | 'agent';
  actor?: 'user' | 'agent';
  actorId?: string;
}

export interface UpdateThoughtInput {
  content?: string;
  tags?: string[];
  actor?: 'user' | 'agent';
}

export interface PromoteThoughtInput {
  targetPath?: string;
  actor?: 'user' | 'agent';
}

export interface LinkThoughtInput {
  projectUid: string;
  projectReadmePath: string;
  actor?: 'user' | 'agent';
}

export type CaptureAttachmentKind = 'file' | 'audio';

export interface CaptureAttachmentInput {
  name: string;
  dataBase64: string;
  mimeType?: string;
  kind?: CaptureAttachmentKind;
}

export interface CaptureAttachment {
  id: string;
  name: string;
  path: string;
  mimeType?: string;
  kind: CaptureAttachmentKind;
  size: number;
}

export type QuickCaptureSuggestionAction =
  | 'save_to_library'
  | 'bookmark'
  | 'create_task'
  | 'transcribe_voice'
  | 'distill_later';

export type QuickCaptureSuggestionRisk = 'low' | 'needs_confirm' | 'proposal';

export interface QuickCaptureSuggestion {
  id: string;
  action: QuickCaptureSuggestionAction;
  label: string;
  detail?: string;
  confidence: number;
  risk: QuickCaptureSuggestionRisk;
  params?: Record<string, unknown>;
  source: 'heuristic' | 'gemini_flash';
}

export interface QuickCaptureSuggestDraftInput {
  content: string;
  hasAudio?: boolean;
  attachmentNames?: string[];
}

export interface QuickCaptureSuggestDraftResult {
  title?: string;
  tags: string[];
  suggestions: QuickCaptureSuggestion[];
  model?: string;
  source: 'heuristic' | 'gemini_flash' | 'mixed';
}

export interface CreateCaptureNoteInput {
  content: string;
  tags?: string[];
  specialKind?: string | null;
  attachments?: CaptureAttachmentInput[];
  audio?: CaptureAttachmentInput & { durationSec?: number };
  sourceUrl?: string;
  sourceTitle?: string;
  acceptedSuggestionActions?: QuickCaptureSuggestionAction[];
}

export interface CreateCaptureNoteResult {
  note: Note;
  attachments: CaptureAttachment[];
}

export type CaptureLinkKind = 'bookmark' | 'read_later';

export interface CreateCaptureLinkInput {
  url: string;
  kind: CaptureLinkKind;
  title?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateCaptureLinkResult {
  item: LibraryItem;
}

export interface CreateCaptureTaskInput {
  title: string;
  details?: string;
  tags?: string[];
}

export interface CreateCaptureTaskResult {
  item: InboxItem;
}
