export type ContentPlatform = 'wechat_article' | 'xiaohongshu' | 'x' | 'youtube' | 'web' | 'unknown';

export type ContentParseStatus = 'success' | 'skipped' | 'failed';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json?(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<FetchResponseLike>;

export interface ContentParseInput {
  url?: string | null;
  canonicalUrl?: string | null;
  title?: string | null;
  text?: string | null;
  platformHint?: string | null;
  parserHint?: string | null;
  sourceKind?: 'library' | 'feed' | 'mobile_share' | 'manual';
}

export interface ContentConnectorContext {
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export interface ContentConnectorAttempt {
  connector_id: string;
  status: ContentParseStatus;
  error?: string;
}

export interface ParsedContent {
  platform: ContentPlatform;
  parser_hint: string;
  status: ContentParseStatus;
  source_url: string | null;
  canonical_url: string | null;
  title?: string;
  author?: string;
  excerpt?: string;
  content_markdown?: string;
  content_html?: string;
  fetched_at: string;
  connector_id: string;
  connector_version: string;
  error?: string;
  attempts?: ContentConnectorAttempt[];
  metadata?: Record<string, unknown>;
}

export interface ContentConnector {
  id: string;
  version: string;
  priority: number;
  canHandle(input: ContentParseInput): boolean;
  parse(input: ContentParseInput, context: ContentConnectorContext): Promise<ParsedContent>;
}
