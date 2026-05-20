import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_X_LIMIT = 20;
const OPENCLI_X_DEFAULT_TIMEOUT_MS = 45_000;
const OPENCLI_X_TIMELINE_TIMEOUT_MS = 90_000;
const OPENCLI_X_THREAD_TIMEOUT_MS = 60_000;
const OPENCLI_X_PROFILE_TIMEOUT_MS = 30_000;
const DEFAULT_TCO_RESOLUTION_TIMEOUT_MS = 5_000;
const TCO_URL_PATTERN = /https?:\/\/t\.co\/[A-Za-z0-9]+/gi;
const defaultTcoResolutionCache = new Map<string, Promise<string | null>>();

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
  timeout_ms?: number;
  resolve_tco_redirects?: boolean;
  tco_timeout_ms?: number;
  tco_url_resolver?: XShortUrlResolver;
}

export type XShortUrlResolver = (url: string, options?: { timeout_ms?: number }) => Promise<string | null>;

export interface XPostUrlEntity {
  url: string;
  expanded_url?: string;
  display_url?: string;
  unwound_url?: string;
  title?: string;
  description?: string;
  resolved_via: 'x_entity' | 'tco_redirect';
}

export interface XUserProfile {
  handle: string;
  name?: string;
  bio?: string;
  location?: string;
  url?: string;
  profile_url?: string;
  avatar_url?: string;
  verified?: boolean;
  followers?: number;
  following?: number;
  tweets?: number;
  created_at?: string;
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
  url_entities?: XPostUrlEntity[];
}

export interface XThreadArchive {
  tweets: XPostCandidate[];
}

export interface XFeedProvider {
  normalizeSource(input: string): XSourceDescriptor;
  listCandidates(source: XSourceDescriptor, options?: XListOptions): Promise<XPostCandidate[]>;
  fetchProfile?(handle: string): Promise<XUserProfile | null>;
  fetchThread(tweetId: string): Promise<XThreadArchive>;
  buildMarkdown(post: XPostCandidate, thread?: XThreadArchive): string;
}

export const defaultXFeedProvider: XFeedProvider = {
  normalizeSource: normalizeXSource,
  listCandidates: listXPostCandidates,
  fetchProfile: fetchXProfile,
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
    const { stdout } = await runOpenCliTwitter(['timeline', '--type', timelineType, '--limit', String(limit), '-f', 'json'], {
      timeoutMs: options.timeout_ms ?? OPENCLI_X_TIMELINE_TIMEOUT_MS
    });
    return (await parseXPostRecords(stdout, options)).slice(0, limit);
  }
  if (!source.handle) throw new Error('x_profile_handle_missing');
  const handle = source.handle;
  const { stdout } = await runOpenCliTwitter(['search', `from:${handle}`, '--filter', 'live', '--limit', String(limit), '-f', 'json'], {
    timeoutMs: options.timeout_ms ?? OPENCLI_X_DEFAULT_TIMEOUT_MS
  });
  return (await parseXPostRecords(stdout, options))
    .filter((post) => post.author.toLowerCase() === handle.toLowerCase())
    .slice(0, limit);
}

async function fetchXThread(tweetId: string): Promise<XThreadArchive> {
  const id = extractTweetId(tweetId);
  if (!id) throw new Error(`invalid_x_tweet_id:${tweetId}`);
  const { stdout } = await runOpenCliTwitter(['thread', id, '-f', 'json'], { timeoutMs: OPENCLI_X_THREAD_TIMEOUT_MS });
  return { tweets: await parseXPostRecords(stdout) };
}

async function fetchXProfile(handle: string): Promise<XUserProfile | null> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return null;
  const { stdout } = await runOpenCliTwitter(['profile', normalized, '-f', 'json'], { timeoutMs: OPENCLI_X_PROFILE_TIMEOUT_MS });
  return parseXProfileRecords(stdout).find((profile) => profile.handle.toLowerCase() === normalized.toLowerCase()) ?? null;
}

async function runOpenCliTwitter(args: string[], options: { timeoutMs: number }): Promise<{ stdout: string; stderr: string }> {
  const command = ['twitter', ...args];
  try {
    return await execFileAsync('opencli', command, { timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    if (!isTransientOpenCliBrowserError(error)) throw toOpenCliError(error, command, options.timeoutMs);
    await delay(750);
    try {
      return await execFileAsync('opencli', command, { timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    } catch (retryError) {
      throw toOpenCliError(retryError, command, options.timeoutMs);
    }
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

function toOpenCliError(error: unknown, args: string[], timeoutMs: number): Error {
  if (!isRecord(error)) return new Error(String(error));
  const lines = [
    stringValue(error.message) ?? `Command failed: opencli ${args.join(' ')}`,
    isOpenCliTimeoutError(error) ? `OpenCLI timed out after ${formatDuration(timeoutMs)}.` : null,
    stringValue(error.stderr) ? `stderr: ${clip(stringValue(error.stderr) ?? '', 1200)}` : null,
    stringValue(error.stdout) ? `stdout: ${clip(stringValue(error.stdout) ?? '', 1200)}` : null,
    stringValue(error.signal) ? `signal: ${stringValue(error.signal)}` : null,
    typeof error.code === 'number' || typeof error.code === 'string' ? `exit code: ${String(error.code)}` : null
  ].filter((line): line is string => Boolean(line));
  return new Error([...new Set(lines)].join('\n'));
}

function isOpenCliTimeoutError(error: Record<string, unknown>): boolean {
  return error.killed === true || error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
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

async function parseXPostRecords(stdout: string, options: XListOptions = {}): Promise<XPostCandidate[]> {
  const parsed = parseJsonValue(stdout);
  const records = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : [];
  const posts = await Promise.all(records.map((record) => parseXPostRecord(record, options)));
  return posts.flat();
}

async function parseXPostRecord(record: unknown, options: XListOptions): Promise<XPostCandidate[]> {
  if (!isRecord(record)) return [];
  const id = stringValue(record.id) ?? extractTweetId(stringValue(record.url) ?? '');
  const author = normalizeHandle(stringValue(record.author) ?? stringValue(record.username) ?? '');
  const rawText = stringValue(record.text) ?? stringValue(record.content) ?? '';
  if (!id || !author || !rawText.trim()) return [];
  const resolved = await resolveXPostTextUrls(rawText, collectXUrlEntities(record), options);
  const url = stringValue(record.url) ?? `https://x.com/${author}/status/${id}`;
  const canonicalUrl = canonicalXPostUrl(url, author, id);
  const createdAt = stringValue(record.created_at) ?? stringValue(record.createdAt);
  const publishedAt = dateIsoOrUndefined(createdAt);
  const replyTo = stringValue(record.in_reply_to) ?? stringValue(record.in_reply_to_status_id);
  return [
    {
      id,
      author,
      text: resolved.text,
      url,
      canonical_url: canonicalUrl,
      ...(createdAt ? { created_at: createdAt } : {}),
      ...(publishedAt ? { published_at: publishedAt } : {}),
      likes: numberValue(record.likes),
      retweets: numberValue(record.retweets),
      replies: numberValue(record.replies),
      views: numberValue(record.views),
      is_reply: Boolean(replyTo) || resolved.text.trim().startsWith('@'),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(resolved.url_entities.length ? { url_entities: resolved.url_entities } : {})
    }
  ];
}

async function resolveXPostTextUrls(
  rawText: string,
  entityUrls: XPostUrlEntity[],
  options: XListOptions
): Promise<{ text: string; url_entities: XPostUrlEntity[] }> {
  const merged = mergeXUrlEntities(entityUrls);
  let text = replaceXShortUrls(rawText, merged);
  if (options.resolve_tco_redirects !== false) {
    const resolver = options.tco_url_resolver ?? defaultResolveTcoUrl;
    const unresolvedShortUrls = extractTcoUrls(text).filter((url) => !merged.some((entity) => entity.url === url && preferredXUrl(entity)));
    const fallbackEntities = (
      await Promise.all(
        unresolvedShortUrls.map(async (url): Promise<XPostUrlEntity | null> => {
          const expanded = await resolveTcoUrl(url, resolver, options.tco_timeout_ms);
          return expanded ? { url, expanded_url: expanded, resolved_via: 'tco_redirect' } : null;
        })
      )
    ).filter((entity): entity is XPostUrlEntity => Boolean(entity));
    if (fallbackEntities.length) {
      merged.push(...fallbackEntities);
      text = replaceXShortUrls(text, fallbackEntities);
    }
  }
  return { text, url_entities: mergeXUrlEntities(merged) };
}

function collectXUrlEntities(record: Record<string, unknown>): XPostUrlEntity[] {
  return mergeXUrlEntities([
    ...collectUrlEntitiesFromContainer(record.entities),
    ...collectUrlEntitiesFromContainer(record.legacy),
    ...collectUrlEntitiesFromContainer(record.extended_tweet),
    ...collectUrlEntitiesFromContainer(record.note_tweet),
    ...collectUrlEntitiesFromContainer(record.urls),
    ...collectUrlEntitiesFromContainer(record.links)
  ]);
}

function collectUrlEntitiesFromContainer(value: unknown): XPostUrlEntity[] {
  if (Array.isArray(value)) return value.flatMap(parseXUrlEntity);
  if (!isRecord(value)) return [];
  return [
    ...collectUrlEntitiesFromContainer(value.urls),
    ...collectUrlEntitiesFromContainer(value.entities),
    ...collectUrlEntitiesFromContainer(value.entity_set),
    ...collectUrlEntitiesFromContainer(value.legacy),
    ...collectUrlEntitiesFromContainer(value.result),
    ...collectUrlEntitiesFromContainer(value.note_tweet_results)
  ];
}

function parseXUrlEntity(value: unknown): XPostUrlEntity[] {
  if (typeof value === 'string') {
    const url = httpUrlOrUndefined(value);
    return url ? [{ url, resolved_via: isTcoUrl(url) ? 'tco_redirect' : 'x_entity' }] : [];
  }
  if (!isRecord(value)) return [];
  const url = httpUrlOrUndefined(stringValue(value.url) ?? stringValue(value.tco_url) ?? stringValue(value.short_url));
  const expandedUrl = httpUrlOrUndefined(
    stringValue(value.expanded_url) ?? stringValue(value.expandedUrl) ?? stringValue(value.expanded) ?? stringValue(value.href)
  );
  const unwoundUrl = httpUrlOrUndefined(stringValue(value.unwound_url) ?? stringValue(value.unwoundUrl));
  const displayUrl = stringValue(value.display_url) ?? stringValue(value.displayUrl);
  const fallbackUrl = url ?? expandedUrl ?? unwoundUrl;
  if (!fallbackUrl) return [];
  return [
    {
      url: url ?? fallbackUrl,
      ...(expandedUrl ? { expanded_url: expandedUrl } : {}),
      ...(displayUrl ? { display_url: displayUrl } : {}),
      ...(unwoundUrl ? { unwound_url: unwoundUrl } : {}),
      ...(stringValue(value.title) ? { title: stringValue(value.title) } : {}),
      ...(stringValue(value.description) ? { description: stringValue(value.description) } : {}),
      resolved_via: 'x_entity'
    }
  ];
}

function parseXProfileRecords(stdout: string): XUserProfile[] {
  const parsed = parseJsonValue(stdout);
  const records = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : [];
  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    const handle = normalizeHandle(
      stringValue(record.screen_name) ??
        stringValue(record.username) ??
        stringValue(record.handle) ??
        stringValue(record.author) ??
        ''
    );
    if (!handle) return [];
    const profileUrl = httpUrlOrUndefined(stringValue(record.profile_url) ?? stringValue(record.profileUrl)) ?? `https://x.com/${handle}`;
    return [
      {
        handle,
        ...(stringValue(record.name) ?? stringValue(record.display_name) ? { name: stringValue(record.name) ?? stringValue(record.display_name) } : {}),
        ...(stringValue(record.bio) ?? stringValue(record.description) ? { bio: stringValue(record.bio) ?? stringValue(record.description) } : {}),
        ...(stringValue(record.location) ? { location: stringValue(record.location) } : {}),
        ...(httpUrlOrUndefined(stringValue(record.url) ?? stringValue(record.website)) ? { url: httpUrlOrUndefined(stringValue(record.url) ?? stringValue(record.website)) } : {}),
        profile_url: profileUrl,
        ...(profileAvatarUrl(record) ? { avatar_url: profileAvatarUrl(record) } : {}),
        ...(typeof record.verified === 'boolean' ? { verified: record.verified } : {}),
        followers: numberValue(record.followers) ?? numberValue(record.followers_count),
        following: numberValue(record.following) ?? numberValue(record.friends_count),
        tweets: numberValue(record.tweets) ?? numberValue(record.statuses_count),
        ...(dateIsoOrUndefined(stringValue(record.created_at) ?? stringValue(record.createdAt)) ? {
          created_at: dateIsoOrUndefined(stringValue(record.created_at) ?? stringValue(record.createdAt))
        } : {})
      }
    ];
  });
}

function profileAvatarUrl(record: Record<string, unknown>): string | undefined {
  return httpUrlOrUndefined(
    stringValue(record.avatar_url) ??
      stringValue(record.avatarUrl) ??
      stringValue(record.profile_image_url_https) ??
      stringValue(record.profile_image_url) ??
      stringValue(record.profileImageUrl) ??
      stringValue(record.picture)
  );
}

function mergeXUrlEntities(entities: XPostUrlEntity[]): XPostUrlEntity[] {
  const byKey = new Map<string, XPostUrlEntity>();
  for (const entity of entities) {
    const key = entity.url;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...(existing ?? entity),
      ...entity,
      expanded_url: entity.expanded_url ?? existing?.expanded_url,
      display_url: entity.display_url ?? existing?.display_url,
      unwound_url: entity.unwound_url ?? existing?.unwound_url,
      title: entity.title ?? existing?.title,
      description: entity.description ?? existing?.description,
      resolved_via: existing?.resolved_via === 'x_entity' || entity.resolved_via === 'x_entity' ? 'x_entity' : 'tco_redirect'
    });
  }
  return [...byKey.values()];
}

function replaceXShortUrls(text: string, entities: XPostUrlEntity[]): string {
  return [...entities]
    .filter((entity) => isTcoUrl(entity.url))
    .sort((a, b) => b.url.length - a.url.length)
    .reduce((next, entity) => {
      const replacement = preferredXUrl(entity);
      return replacement && replacement !== entity.url ? next.split(entity.url).join(replacement) : next;
    }, text);
}

function preferredXUrl(entity: XPostUrlEntity): string | undefined {
  return entity.expanded_url ?? entity.unwound_url ?? (isTcoUrl(entity.url) ? undefined : entity.url);
}

function extractTcoUrls(text: string): string[] {
  return [...new Set([...text.matchAll(TCO_URL_PATTERN)].map((match) => match[0]))];
}

async function resolveTcoUrl(url: string, resolver: XShortUrlResolver, timeoutMs?: number): Promise<string | null> {
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TCO_RESOLUTION_TIMEOUT_MS;
  if (resolver === defaultResolveTcoUrl) {
    const cacheKey = `${url}:${effectiveTimeoutMs}`;
    let cached = defaultTcoResolutionCache.get(cacheKey);
    if (!cached) {
      cached = resolver(url, { timeout_ms: effectiveTimeoutMs }).catch(() => null);
      defaultTcoResolutionCache.set(cacheKey, cached);
    }
    return httpUrlOrUndefined((await cached) ?? undefined) ?? null;
  }
  try {
    const resolved = await resolver(url, { timeout_ms: effectiveTimeoutMs });
    return httpUrlOrUndefined(resolved ?? undefined) ?? null;
  } catch {
    return null;
  }
}

async function defaultResolveTcoUrl(url: string, options: { timeout_ms?: number } = {}): Promise<string | null> {
  const timeoutMs = options.timeout_ms ?? DEFAULT_TCO_RESOLUTION_TIMEOUT_MS;
  if (hasHttpProxyEnv()) {
    const curlResolved = await resolveTcoUrlWithCurl(url, timeoutMs);
    if (curlResolved) return curlResolved;
  }
  try {
    const fetchResolved = await resolveTcoUrlWithFetch(url, timeoutMs);
    if (fetchResolved) return fetchResolved;
  } catch {
    // Some local Node runtimes do not inherit curl-style proxy settings; curl remains a practical fallback.
  }
  return await resolveTcoUrlWithCurl(url, timeoutMs);
}

async function resolveTcoUrlWithFetch(url: string, timeoutMs: number): Promise<string | null> {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.5' }
  });
  const location = response.headers.get('location');
  if (!location) return null;
  return new URL(location, url).toString();
}

async function resolveTcoUrlWithCurl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const { stdout } = await execFileAsync(
      'curl',
      ['-sS', '-I', '--max-time', String(seconds), '--user-agent', 'Mozilla/5.0', url],
      { timeout: timeoutMs + 1000, maxBuffer: 64 * 1024 }
    );
    const location = stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^location:\s*(.+)$/i)?.[1]?.trim())
      .find((value): value is string => Boolean(value));
    return location ? new URL(location, url).toString() : null;
  } catch {
    return null;
  }
}

function hasHttpProxyEnv(): boolean {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
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

function httpUrlOrUndefined(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isTcoUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, '').toLowerCase() === 't.co';
  } catch {
    return false;
  }
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
