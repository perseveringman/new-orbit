const DEFAULT_HN_LIMIT = 20;
const HN_API_ROOT = 'https://hacker-news.firebaseio.com/v0';

export type HackerNewsFeedType = 'top' | 'new' | 'best' | 'show' | 'ask' | 'jobs';

export interface HackerNewsSourceDescriptor {
  url: string;
  source_type: HackerNewsFeedType;
}

export interface HackerNewsListOptions {
  limit?: number;
}

export interface HackerNewsStoryCandidate {
  id: string;
  title: string;
  author?: string;
  text?: string;
  url: string;
  canonical_url: string;
  outbound_url?: string;
  published_at?: string;
  score?: number;
  comments?: number;
  story_type?: string;
}

export interface HackerNewsComment {
  id: string;
  author?: string;
  text: string;
  published_at?: string;
  depth: number;
}

export interface HackerNewsDiscussionArchive {
  story?: HackerNewsStoryCandidate;
  comments: HackerNewsComment[];
}

export interface HackerNewsFeedProvider {
  normalizeSource(input: string): HackerNewsSourceDescriptor;
  listCandidates(source: HackerNewsSourceDescriptor, options?: HackerNewsListOptions): Promise<HackerNewsStoryCandidate[]>;
  fetchDiscussion(storyId: string): Promise<HackerNewsDiscussionArchive>;
  buildMarkdown(story: HackerNewsStoryCandidate, discussion?: HackerNewsDiscussionArchive): string;
}

export const defaultHackerNewsFeedProvider: HackerNewsFeedProvider = {
  normalizeSource: normalizeHackerNewsSource,
  listCandidates: listHackerNewsCandidates,
  fetchDiscussion: fetchHackerNewsDiscussion,
  buildMarkdown: buildHackerNewsMarkdown
};

export function normalizeHackerNewsSource(input: string): HackerNewsSourceDescriptor {
  const trimmed = input.trim() || 'top';

  if (!/^https?:\/\//i.test(trimmed)) {
    return descriptorForFeedType(trimmed.replace(/^hn:/i, '').replace(/^hackernews:/i, ''));
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid Hacker News URL.');
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'news.ycombinator.com') {
    throw new Error('Only news.ycombinator.com URLs are supported for Hacker News feed sources.');
  }

  const firstSegment = parsed.pathname.split('/').filter(Boolean)[0] ?? 'news';
  if (firstSegment === 'item') throw new Error('Use a Hacker News listing such as top, newest, best, show, ask, or jobs.');
  return descriptorForFeedType(firstSegment);
}

export function hackerNewsSourceTitle(source: HackerNewsSourceDescriptor): string {
  return `Hacker News ${labelForFeedType(source.source_type)}`;
}

export function hackerNewsStoryTitle(story: HackerNewsStoryCandidate): string {
  return clip(decodeHtmlToText(story.title) || `Hacker News story ${story.id}`, 120);
}

async function listHackerNewsCandidates(
  source: HackerNewsSourceDescriptor,
  options: HackerNewsListOptions = {}
): Promise<HackerNewsStoryCandidate[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_HN_LIMIT, 100));
  const ids = (await fetchJson(`${HN_API_ROOT}/${endpointForFeedType(source.source_type)}.json`)) as unknown;
  if (!Array.isArray(ids)) return [];
  const selected = ids.filter((id): id is number => typeof id === 'number').slice(0, limit);
  const items = await Promise.all(selected.map((id) => fetchHackerNewsItem(id).catch(() => null)));
  return items.flatMap((item) => (item ? storyFromHackerNewsItem(item) : [])).slice(0, limit);
}

async function fetchHackerNewsDiscussion(storyId: string): Promise<HackerNewsDiscussionArchive> {
  const item = await fetchHackerNewsItem(storyId);
  const story = storyFromHackerNewsItem(item)[0];
  const kidIds = Array.isArray(item.kids) ? item.kids.filter((id): id is number => typeof id === 'number').slice(0, 25) : [];
  const comments = (
    await Promise.all(kidIds.map((id) => fetchHackerNewsCommentTree(id, 0).catch(() => [])))
  ).flat();
  return { story, comments: comments.slice(0, 80) };
}

function buildHackerNewsMarkdown(story: HackerNewsStoryCandidate, discussion?: HackerNewsDiscussionArchive): string {
  const comments = discussion?.comments ?? [];
  const lines = [
    `# ${hackerNewsStoryTitle(story)}`,
    '',
    `Source: ${story.canonical_url}`,
    story.outbound_url ? `Outbound: ${story.outbound_url}` : null,
    '',
    story.author ? `- author: ${story.author}` : null,
    typeof story.score === 'number' ? `- score: ${story.score}` : null,
    typeof story.comments === 'number' ? `- comments: ${story.comments}` : null,
    story.published_at ? `- published_at: ${story.published_at}` : null,
    '',
    story.text ? decodeHtmlToText(story.text) : null,
    comments.length ? '## Comments' : null,
    ...comments.map((comment) => {
      const indent = '  '.repeat(Math.max(0, comment.depth));
      const meta = [comment.author ?? 'unknown', comment.published_at].filter(Boolean).join(' | ');
      return `${indent}- ${meta}\n${indent}  ${decodeHtmlToText(comment.text).replace(/\n/g, `\n${indent}  `)}`;
    })
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n').trim();
}

async function fetchHackerNewsCommentTree(id: number, depth: number): Promise<HackerNewsComment[]> {
  const item = await fetchHackerNewsItem(id);
  if (item.deleted || item.dead || item.type !== 'comment' || !item.text) return [];
  const comment: HackerNewsComment = {
    id: String(item.id),
    author: stringValue(item.by),
    text: decodeHtmlToText(stringValue(item.text) ?? ''),
    published_at: timestampToIso(item.time),
    depth
  };
  const kidIds = Array.isArray(item.kids) ? item.kids.filter((kid): kid is number => typeof kid === 'number').slice(0, 5) : [];
  const replies = depth < 2 ? (await Promise.all(kidIds.map((kid) => fetchHackerNewsCommentTree(kid, depth + 1).catch(() => [])))).flat() : [];
  return [comment, ...replies];
}

async function fetchHackerNewsItem(id: string | number): Promise<Record<string, unknown>> {
  const item = await fetchJson(`${HN_API_ROOT}/item/${id}.json`);
  if (!isRecord(item)) throw new Error(`hackernews_item_not_found:${id}`);
  return item;
}

function storyFromHackerNewsItem(item: Record<string, unknown>): HackerNewsStoryCandidate[] {
  const id = numberValue(item.id);
  const title = stringValue(item.title);
  if (!id || !title) return [];
  const canonicalUrl = `https://news.ycombinator.com/item?id=${id}`;
  const outboundUrl = stringValue(item.url);
  const url = outboundUrl ?? canonicalUrl;
  return [
    {
      id: String(id),
      title,
      author: stringValue(item.by),
      text: stringValue(item.text) ? decodeHtmlToText(stringValue(item.text) ?? '') : undefined,
      url,
      canonical_url: canonicalUrl,
      ...(outboundUrl ? { outbound_url: outboundUrl } : {}),
      published_at: timestampToIso(item.time),
      score: numberValue(item.score),
      comments: numberValue(item.descendants),
      story_type: stringValue(item.type)
    }
  ];
}

function descriptorForFeedType(value: string): HackerNewsSourceDescriptor {
  const sourceType = normalizeFeedType(value);
  return {
    url: `https://news.ycombinator.com/${pathForFeedType(sourceType)}`,
    source_type: sourceType
  };
}

function normalizeFeedType(value: string): HackerNewsFeedType {
  const normalized = (value || 'top').trim().toLowerCase();
  if (normalized === 'news' || normalized === 'top') return 'top';
  if (normalized === 'newest' || normalized === 'new') return 'new';
  if (normalized === 'best') return 'best';
  if (normalized === 'show' || normalized === 'shownews') return 'show';
  if (normalized === 'ask' || normalized === 'asknews') return 'ask';
  if (normalized === 'jobs' || normalized === 'job') return 'jobs';
  throw new Error('Unsupported Hacker News source. Use top, new, best, show, ask, or jobs.');
}

function endpointForFeedType(value: HackerNewsFeedType): string {
  if (value === 'top') return 'topstories';
  if (value === 'new') return 'newstories';
  if (value === 'best') return 'beststories';
  if (value === 'show') return 'showstories';
  if (value === 'ask') return 'askstories';
  return 'jobstories';
}

function pathForFeedType(value: HackerNewsFeedType): string {
  if (value === 'top') return 'news';
  if (value === 'new') return 'newest';
  return value;
}

function labelForFeedType(value: HackerNewsFeedType): string {
  if (value === 'new') return 'new';
  return value;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`hackernews_fetch_failed:${response.status}`);
  return response.json() as Promise<unknown>;
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

function timestampToIso(value: unknown): string | undefined {
  const seconds = numberValue(value);
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}

function decodeHtmlToText(value: string): string {
  return value
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
}
