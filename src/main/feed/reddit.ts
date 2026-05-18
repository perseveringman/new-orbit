import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_REDDIT_LIMIT = 20;
const REDDIT_USER_AGENT = 'OrbitFeedReader/1.0';

export type RedditSort = 'hot' | 'new' | 'top' | 'rising' | 'controversial';
export type RedditTimeFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

export interface RedditSourceDescriptor {
  url: string;
  source_type: 'subreddit';
  subreddit: string;
  sort: RedditSort;
  time?: RedditTimeFilter;
}

export interface RedditListOptions {
  limit?: number;
}

export interface RedditPostCandidate {
  id: string;
  title: string;
  author?: string;
  subreddit: string;
  text?: string;
  url: string;
  canonical_url: string;
  outbound_url?: string;
  created_at?: string;
  published_at?: string;
  score?: number;
  comments?: number;
  image_url?: string;
  is_self?: boolean;
}

export interface RedditComment {
  id: string;
  author?: string;
  text: string;
  score?: number;
  depth: number;
}

export interface RedditDiscussionArchive {
  post?: RedditPostCandidate;
  comments: RedditComment[];
}

export interface RedditFeedProvider {
  normalizeSource(input: string): RedditSourceDescriptor;
  listCandidates(source: RedditSourceDescriptor, options?: RedditListOptions): Promise<RedditPostCandidate[]>;
  fetchDiscussion(postIdOrUrl: string): Promise<RedditDiscussionArchive>;
  buildMarkdown(post: RedditPostCandidate, discussion?: RedditDiscussionArchive): string;
}

export const defaultRedditFeedProvider: RedditFeedProvider = {
  normalizeSource: normalizeRedditSource,
  listCandidates: listRedditPostCandidates,
  fetchDiscussion: fetchRedditDiscussion,
  buildMarkdown: buildRedditMarkdown
};

export function normalizeRedditSource(input: string): RedditSourceDescriptor {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('A subreddit name or Reddit URL is required.');

  if (!/^https?:\/\//i.test(trimmed)) {
    return descriptorForSubredditPath(trimmed);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid Reddit URL.');
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^old\./, '').replace(/^new\./, '').replace(/^m\./, '').toLowerCase();
  if (host !== 'reddit.com') {
    throw new Error('Only reddit.com subreddit URLs are supported for Reddit feed sources.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() !== 'r' || !segments[1]) {
    throw new Error('Use a subreddit URL such as https://www.reddit.com/r/LocalLLaMA/.');
  }
  return descriptorForSubredditPath(`r/${segments[1]}/${segments[2] ?? ''}`);
}

export function redditSourceTitle(source: RedditSourceDescriptor): string {
  return `r/${source.subreddit}`;
}

export function redditPostTitle(post: RedditPostCandidate): string {
  return clip(decodeHtmlEntities(post.title) || `Reddit post ${post.id}`, 120);
}

async function listRedditPostCandidates(source: RedditSourceDescriptor, options: RedditListOptions = {}): Promise<RedditPostCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_REDDIT_LIMIT);
  const openCliPosts = await listRedditWithOpenCli(source, limit).catch(() => []);
  if (openCliPosts.length > 0 && openCliPosts.some((post) => post.canonical_url.includes('/comments/'))) {
    return openCliPosts.slice(0, limit);
  }
  return listRedditWithPublicJson(source, limit);
}

async function listRedditWithOpenCli(source: RedditSourceDescriptor, limit: number): Promise<RedditPostCandidate[]> {
  const args = [
    'reddit',
    'subreddit',
    source.subreddit,
    '--sort',
    source.sort,
    '--limit',
    String(limit),
    '-f',
    'json'
  ];
  if ((source.sort === 'top' || source.sort === 'controversial') && source.time) {
    args.splice(5, 0, '--time', source.time);
  }
  const { stdout } = await execFileAsync('opencli', args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return parseRedditPostRecords(stdout, source);
}

async function listRedditWithPublicJson(source: RedditSourceDescriptor, limit: number): Promise<RedditPostCandidate[]> {
  const url = new URL(`https://www.reddit.com/r/${source.subreddit}/${source.sort}.json`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('raw_json', '1');
  if ((source.sort === 'top' || source.sort === 'controversial') && source.time) url.searchParams.set('t', source.time);
  const parsed = await fetchJson(url.toString());
  if (!isRecord(parsed)) return [];
  const children = asArray(readPath(parsed, ['data', 'children']));
  return children
    .flatMap((child) => {
      const data = isRecord(child) ? readPath(child, ['data']) : null;
      return isRecord(data) ? redditPostFromApiRecord(data, source) : [];
    })
    .slice(0, limit);
}

async function fetchRedditDiscussion(postIdOrUrl: string): Promise<RedditDiscussionArchive> {
  const publicDiscussion = await fetchRedditDiscussionWithPublicJson(postIdOrUrl).catch(() => null);
  if (publicDiscussion?.comments.length) return publicDiscussion;
  const openCliDiscussion = await fetchRedditDiscussionWithOpenCli(postIdOrUrl).catch(() => null);
  return openCliDiscussion ?? { comments: [] };
}

async function fetchRedditDiscussionWithOpenCli(postIdOrUrl: string): Promise<RedditDiscussionArchive> {
  const { stdout } = await execFileAsync(
    'opencli',
    ['reddit', 'read', postIdOrUrl, '--sort', 'best', '--limit', '25', '--depth', '2', '--replies', '5', '--max-length', '2000', '-f', 'json'],
    { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  );
  const parsed = parseJsonValue(stdout);
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : [];
  const comments = rows.flatMap((row, index) => {
    if (!isRecord(row)) return [];
    const text = stringValue(row.text) ?? stringValue(row.body) ?? stringValue(row.comment);
    if (!text) return [];
    const type = stringValue(row.type)?.toLowerCase();
    if (type === 'post') return [];
    return [
      {
        id: stringValue(row.id) ?? `opencli-comment-${index}`,
        author: stringValue(row.author),
        text,
        score: numberValue(row.score) ?? numberValue(row.upvotes),
        depth: numberValue(row.depth) ?? 0
      }
    ];
  });
  return { comments };
}

async function fetchRedditDiscussionWithPublicJson(postIdOrUrl: string): Promise<RedditDiscussionArchive> {
  const id = extractRedditPostId(postIdOrUrl);
  const url = /^https?:\/\//i.test(postIdOrUrl)
    ? new URL(postIdOrUrl)
    : new URL(`https://www.reddit.com/comments/${id ?? postIdOrUrl}.json`);
  url.pathname = url.pathname.replace(/\/+$/, '') + '.json';
  url.searchParams.set('limit', '25');
  url.searchParams.set('depth', '2');
  url.searchParams.set('raw_json', '1');
  const parsed = await fetchJson(url.toString());
  if (!Array.isArray(parsed)) return { comments: [] };
  const postData = readPath(parsed[0], ['data', 'children', 0, 'data']);
  const commentsRoot = readPath(parsed[1], ['data', 'children']);
  return {
    post: isRecord(postData) ? redditPostFromApiRecord(postData, undefined)[0] : undefined,
    comments: parseRedditCommentChildren(asArray(commentsRoot), 0).slice(0, 50)
  };
}

function buildRedditMarkdown(post: RedditPostCandidate, discussion?: RedditDiscussionArchive): string {
  const comments = discussion?.comments ?? [];
  const lines = [
    `# ${redditPostTitle(post)}`,
    '',
    `Source: ${post.canonical_url}`,
    post.outbound_url ? `Outbound: ${post.outbound_url}` : null,
    '',
    `- subreddit: r/${post.subreddit}`,
    post.author ? `- author: u/${post.author}` : null,
    typeof post.score === 'number' ? `- score: ${post.score}` : null,
    typeof post.comments === 'number' ? `- comments: ${post.comments}` : null,
    post.published_at ? `- published_at: ${post.published_at}` : null,
    '',
    post.text ? decodeHtmlEntities(post.text) : null,
    comments.length ? '## Comments' : null,
    ...comments.map((comment) => {
      const indent = '  '.repeat(Math.max(0, comment.depth));
      const meta = [comment.author ? `u/${comment.author}` : 'unknown', typeof comment.score === 'number' ? `${comment.score} points` : null]
        .filter(Boolean)
        .join(' | ');
      return `${indent}- ${meta}\n${indent}  ${decodeHtmlEntities(comment.text).replace(/\n/g, `\n${indent}  `)}`;
    })
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n').trim();
}

function parseRedditPostRecords(stdout: string, source: RedditSourceDescriptor): RedditPostCandidate[] {
  const parsed = parseJsonValue(stdout);
  const records = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : [];
  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    const title = stringValue(record.title);
    const url = stringValue(record.url) ?? stringValue(record.link) ?? stringValue(record.permalink);
    if (!title || !url) return [];
    const id = stringValue(record.id) ?? stringValue(record.post_id) ?? extractRedditPostId(url) ?? shortHash(`${title}\n${url}`);
    const canonicalUrl = canonicalRedditPostUrl(url, id);
    const outboundUrl = canonicalUrl === url ? stringValue(record.outbound_url) : url;
    const createdAt = stringValue(record.created_at) ?? stringValue(record.createdAt);
    return [
      {
        id,
        title,
        author: normalizeRedditUser(stringValue(record.author) ?? ''),
        subreddit: source.subreddit,
        text: stringValue(record.text) ?? stringValue(record.selftext),
        url: canonicalUrl,
        canonical_url: canonicalUrl,
        ...(outboundUrl ? { outbound_url: outboundUrl } : {}),
        ...(createdAt ? { created_at: createdAt } : {}),
        ...(dateIsoOrUndefined(createdAt) ? { published_at: dateIsoOrUndefined(createdAt) } : {}),
        score: numberValue(record.score) ?? numberValue(record.upvotes),
        comments: numberValue(record.comments) ?? numberValue(record.num_comments),
        image_url: stringValue(record.thumbnail)
      }
    ];
  });
}

function redditPostFromApiRecord(data: Record<string, unknown>, source?: RedditSourceDescriptor): RedditPostCandidate[] {
  const id = stringValue(data.id);
  const title = stringValue(data.title);
  const subreddit = stringValue(data.subreddit) ?? source?.subreddit;
  if (!id || !title || !subreddit) return [];
  const permalink = stringValue(data.permalink);
  const canonicalUrl = permalink ? `https://www.reddit.com${permalink}` : `https://www.reddit.com/comments/${id}`;
  const rawUrl = stringValue(data.url) ?? canonicalUrl;
  const isSelf = Boolean(data.is_self) || rawUrl.includes(`/r/${subreddit}/comments/`);
  const outboundUrl = !isSelf && rawUrl !== canonicalUrl ? rawUrl : undefined;
  const createdUtc = numberValue(data.created_utc);
  const publishedAt = createdUtc ? new Date(createdUtc * 1000).toISOString() : undefined;
  const thumbnail = stringValue(data.thumbnail);
  return [
    {
      id,
      title,
      author: normalizeRedditUser(stringValue(data.author) ?? ''),
      subreddit,
      text: stringValue(data.selftext),
      url: canonicalUrl,
      canonical_url: canonicalUrl,
      ...(outboundUrl ? { outbound_url: outboundUrl } : {}),
      ...(publishedAt ? { published_at: publishedAt, created_at: publishedAt } : {}),
      score: numberValue(data.score),
      comments: numberValue(data.num_comments),
      image_url: thumbnail && /^https?:\/\//i.test(thumbnail) ? thumbnail : undefined,
      is_self: isSelf
    }
  ];
}

function parseRedditCommentChildren(children: unknown[], depth: number): RedditComment[] {
  const comments: RedditComment[] = [];
  for (const child of children) {
    if (!isRecord(child) || stringValue(child.kind) === 'more') continue;
    const data = readPath(child, ['data']);
    if (!isRecord(data)) continue;
    const text = stringValue(data.body);
    const id = stringValue(data.id);
    if (text && id) {
      comments.push({
        id,
        author: normalizeRedditUser(stringValue(data.author) ?? ''),
        text,
        score: numberValue(data.score),
        depth
      });
    }
    const replies = readPath(data, ['replies', 'data', 'children']);
    if (Array.isArray(replies) && depth < 2) comments.push(...parseRedditCommentChildren(replies, depth + 1));
  }
  return comments;
}

function descriptorForSubredditPath(value: string): RedditSourceDescriptor {
  const trimmed = value.trim().replace(/^reddit:/i, '').replace(/^\/+/, '');
  const segments = trimmed.split('/').filter(Boolean);
  const subreddit = normalizeSubreddit(segments[0]?.toLowerCase() === 'r' ? segments[1] : segments[0]);
  const sort = normalizeSort(segments[0]?.toLowerCase() === 'r' ? segments[2] : segments[1]);
  return {
    url: `https://www.reddit.com/r/${subreddit}/${sort}/`,
    source_type: 'subreddit',
    subreddit,
    sort
  };
}

function normalizeSubreddit(value?: string): string {
  const subreddit = (value ?? '').trim().replace(/^r\//i, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit) && subreddit.toLowerCase() !== 'all') {
    throw new Error('Invalid subreddit name.');
  }
  return subreddit;
}

function normalizeSort(value?: string): RedditSort {
  const sort = (value ?? 'hot').toLowerCase();
  if (sort === 'hot' || sort === 'new' || sort === 'top' || sort === 'rising' || sort === 'controversial') return sort;
  return 'hot';
}

function normalizeRedditUser(value: string): string | undefined {
  const normalized = value.trim().replace(/^u\//i, '').replace(/^@/, '');
  return normalized || undefined;
}

function canonicalRedditPostUrl(url: string, id: string): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/comments\/([A-Za-z0-9]+)/i);
    if (match) return `https://www.reddit.com${parsed.pathname.replace(/\/+$/, '')}/`;
  } catch {
    // fall through
  }
  return `https://www.reddit.com/comments/${id}/`;
}

function extractRedditPostId(value: string): string | null {
  return value.match(/\/comments\/([A-Za-z0-9]+)/i)?.[1] ?? (/^[A-Za-z0-9]{5,}$/.test(value) ? value : null);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'user-agent': REDDIT_USER_AGENT, accept: 'application/json' } });
  if (!response.ok) throw new Error(`reddit_fetch_failed:${response.status}`);
  return response.json() as Promise<unknown>;
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

function readPath(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (typeof key === 'number') return Array.isArray(current) ? current[key] : undefined;
    return isRecord(current) ? current[key] : undefined;
  }, value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function clampLimit(value: number): number {
  return Math.max(1, Math.min(value, 100));
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
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
}
