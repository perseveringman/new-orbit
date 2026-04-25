import type { InboxItem } from './inbox';

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
  createdFrom?: 'quick_capture' | 'manual' | 'agent';
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
