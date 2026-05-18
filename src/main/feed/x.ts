import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_X_LIMIT = 20;

export type XSourceType = 'profile' | 'timeline';
export type XTimelineType = 'following' | 'for-you';

export interface XSourceDescriptor {
  url: string;
  source_type: XSourceType;
  handle?: string;
  timeline_type?: XTimelineType;
}

export interface XListOptions {
  limit?: number;
}

export interface XPostCandidate {
  id: string;
  author: string;
  text: string;
  url: string;
  canonical_url: string;
  created_at?: string;
  published_at?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  views?: number;
  is_reply?: boolean;
  reply_to?: string;
}

export interface XThreadArchive {
  tweets: XPostCandidate[];
}

export interface XFeedProvider {
  normalizeSource(input: string): XSourceDescriptor;
  listCandidates(source: XSourceDescriptor, options?: XListOptions): Promise<XPostCandidate[]>;
  fetchThread(tweetId: string): Promise<XThreadArchive>;
  buildMarkdown(post: XPostCandidate, thread?: XThreadArchive): string;
}

export const defaultXFeedProvider: XFeedProvider = {
  normalizeSource: normalizeXSource,
  listCandidates: listXPostCandidates,
  fetchThread: fetchXThread,
  buildMarkdown: buildXPostMarkdown
};

export function normalizeXSource(input: string): XSourceDescriptor {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('An X handle, timeline type, or profile URL is required.');

  const timeline = timelineTypeFromInput(trimmed);
  if (timeline) return descriptorForTimeline(timeline);

  if (!/^https?:\/\//i.test(trimmed)) {
    return descriptorForHandle(trimmed);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid X profile URL.');
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^mobile\./, '').toLowerCase();
  if (host !== 'x.com' && host !== 'twitter.com') {
    throw new Error('Only x.com or twitter.com profile URLs are supported for X feed sources.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const handle = segments[0];
  const timelineFromPath = handle ? timelineTypeFromInput(handle) : null;
  if (timelineFromPath || ['home'].includes(handle?.toLowerCase() ?? '')) {
    return descriptorForTimeline(timelineFromPath ?? 'for-you');
  }
  if (!handle || ['i', 'explore', 'search', 'notifications', 'messages'].includes(handle.toLowerCase())) {
    throw new Error('Use an X profile URL or handle, not a single post or app page.');
  }
  return descriptorForHandle(handle);
}

export function xSourceTitle(source: XSourceDescriptor): string {
  if (source.source_type === 'timeline') return source.timeline_type === 'following' ? 'X Following' : 'X For You';
  return `@${source.handle}`;
}

export function xPostTitle(post: XPostCandidate): string {
  const firstLine = decodeHtmlEntities(post.text).split(/\r?\n/).find((line) => line.trim())?.trim();
  return clip(firstLine || `X post ${post.id}`, 96);
}

async function listXPostCandidates(source: XSourceDescriptor, options: XListOptions = {}): Promise<XPostCandidate[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_X_LIMIT, 100));
  if (source.source_type === 'timeline') {
    const timelineType = source.timeline_type ?? 'for-you';
    const { stdout } = await runOpenCliTwitter(['timeline', '--type', timelineType, '--limit', String(limit), '-f', 'json']);
    return parseXPostRecords(stdout).slice(0, limit);
  }
  if (!source.handle) throw new Error('x_profile_handle_missing');
  const handle = source.handle;
  const { stdout } = await runOpenCliTwitter(['search', `from:${handle}`, '--filter', 'live', '--limit', String(limit), '-f', 'json']);
  return parseXPostRecords(stdout).filter((post) => post.author.toLowerCase() === handle.toLowerCase()).slice(0, limit);
}

async function fetchXThread(tweetId: string): Promise<XThreadArchive> {
  const id = extractTweetId(tweetId);
  if (!id) throw new Error(`invalid_x_tweet_id:${tweetId}`);
  const { stdout } = await runOpenCliTwitter(['thread', id, '-f', 'json']);
  return { tweets: parseXPostRecords(stdout) };
}

async function runOpenCliTwitter(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('opencli', ['twitter', ...args], { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    if (!isTransientOpenCliBrowserError(error)) throw error;
    await delay(750);
    return execFileAsync('opencli', ['twitter', ...args], { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  }
}

function isTransientOpenCliBrowserError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return text.includes('no tab with id') || text.includes('pre-navigation') || text.includes('browser extension');
}

function errorText(error: unknown): string {
  if (!isRecord(error)) return String(error);
  return [error.message, error.stdout, error.stderr].filter((value): value is string => typeof value === 'string').join('\n');
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildXPostMarkdown(post: XPostCandidate, thread?: XThreadArchive): string {
  const tweets = thread?.tweets.length ? thread.tweets : [post];
  const body = tweets
    .map((tweet, index) => {
      const heading = index === 0 ? `@${tweet.author}` : `Reply by @${tweet.author}`;
      const meta = [tweet.published_at, tweet.canonical_url].filter(Boolean).join(' | ');
      const metrics = [
        typeof tweet.likes === 'number' ? `${tweet.likes} likes` : null,
        typeof tweet.retweets === 'number' ? `${tweet.retweets} reposts` : null,
        typeof tweet.replies === 'number' ? `${tweet.replies} replies` : null,
        typeof tweet.views === 'number' ? `${tweet.views} views` : null
      ]
        .filter(Boolean)
        .join(' | ');
      return [`## ${heading}`, meta, decodeHtmlEntities(tweet.text), metrics].filter(Boolean).join('\n\n');
    })
    .join('\n\n---\n\n');

  return [`# ${xPostTitle(post)}`, '', `Source: ${post.canonical_url}`, '', body].join('\n').trim();
}

function parseXPostRecords(stdout: string): XPostCandidate[] {
  const parsed = parseJsonValue(stdout);
  const records = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : [];
  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    const id = stringValue(record.id) ?? extractTweetId(stringValue(record.url) ?? '');
    const author = normalizeHandle(stringValue(record.author) ?? stringValue(record.username) ?? '');
    const text = stringValue(record.text) ?? stringValue(record.content) ?? '';
    if (!id || !author || !text.trim()) return [];
    const url = stringValue(record.url) ?? `https://x.com/${author}/status/${id}`;
    const canonicalUrl = canonicalXPostUrl(url, author, id);
    const createdAt = stringValue(record.created_at) ?? stringValue(record.createdAt);
    const publishedAt = dateIsoOrUndefined(createdAt);
    const replyTo = stringValue(record.in_reply_to) ?? stringValue(record.in_reply_to_status_id);
    return [
      {
        id,
        author,
        text,
        url,
        canonical_url: canonicalUrl,
        ...(createdAt ? { created_at: createdAt } : {}),
        ...(publishedAt ? { published_at: publishedAt } : {}),
        likes: numberValue(record.likes),
        retweets: numberValue(record.retweets),
        replies: numberValue(record.replies),
        views: numberValue(record.views),
        is_reply: Boolean(replyTo) || text.trim().startsWith('@'),
        ...(replyTo ? { reply_to: replyTo } : {})
      }
    ];
  });
}

function descriptorForHandle(value: string): XSourceDescriptor {
  const handle = normalizeHandle(value);
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error('Invalid X handle.');
  }
  return {
    url: `https://x.com/${handle}`,
    handle,
    source_type: 'profile'
  };
}

function descriptorForTimeline(timelineType: XTimelineType): XSourceDescriptor {
  return {
    url: `x://timeline/${timelineType}`,
    source_type: 'timeline',
    timeline_type: timelineType
  };
}

function timelineTypeFromInput(value: string): XTimelineType | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^x:/, '')
    .replace(/^twitter:/, '')
    .replace(/^\/+/, '')
    .replace(/^timeline\//, '')
    .replace(/^x:\/\/timeline\//, '');
  if (normalized === 'following') return 'following';
  if (normalized === 'foryou' || normalized === 'for-you' || normalized === 'for_you' || normalized === 'home') return 'for-you';
  return null;
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').replace(/\/+$/, '');
}

function canonicalXPostUrl(url: string, author: string, id: string): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/i);
    if (match) return `https://x.com/${author}/status/${match[1]}`;
    if (parsed.pathname.match(/^\/i\/status\/\d+/i)) return `https://x.com/${author}/status/${id}`;
  } catch {
    // fall through to deterministic URL below
  }
  return `https://x.com/${author}/status/${id}`;
}

function parseJsonValue(value: string): unknown | null {
  const start = value.search(/[[{]/);
  if (start < 0) return null;
  const opener = value[start];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(value.slice(start, index + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function dateIsoOrUndefined(value?: string): string | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function extractTweetId(value: string): string | null {
  return value.match(/(?:status|statuses)\/(\d+)/i)?.[1] ?? value.match(/^\d{8,}$/)?.[0] ?? null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3)).trim()}...`;
}
