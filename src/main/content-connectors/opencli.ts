import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContentConnector, ContentConnectorContext, ContentParseInput, ParsedContent } from './types';
import {
  canonicalUrlForInput,
  parserHintForPlatform,
  platformForInput,
  sourcePlatformLabel,
  sourceUrlForInput,
  stringOrNull
} from './utils';

const execFileAsync = promisify(execFile);
const OPENCLI_VERSION = '0.1.0';

export function createOpenCliContentConnector(): ContentConnector {
  return {
    id: 'opencli',
    version: OPENCLI_VERSION,
    priority: 100,
    canHandle(input) {
      const platform = platformForInput(input);
      return platform === 'wechat_article' || platform === 'xiaohongshu' || platform === 'x';
    },
    async parse(input, context) {
      return parseWithOpenCli(input, context);
    }
  };
}

async function parseWithOpenCli(input: ContentParseInput, context: ContentConnectorContext): Promise<ParsedContent> {
  const platform = platformForInput(input);
  const sourceUrl = sourceUrlForInput(input);
  const canonicalUrl = canonicalUrlForInput(input, platform);
  const url = canonicalUrl ?? sourceUrl;
  const fetchedAt = (context.now?.() ?? new Date()).toISOString();
  const base = {
    platform,
    parser_hint: stringOrNull(input.parserHint) ?? parserHintForPlatform(platform),
    source_url: sourceUrl,
    canonical_url: canonicalUrl,
    fetched_at: fetchedAt,
    connector_id: 'opencli',
    connector_version: OPENCLI_VERSION
  };
  if (!url || platform === 'unknown') {
    return { ...base, status: 'skipped', error: 'missing_supported_source_url' };
  }

  const commands = commandCandidates(platform, url);
  let lastError = 'opencli_no_command_candidates';
  for (const args of commands) {
    try {
      const { stdout } = await execFileAsync('opencli', args, {
        timeout: context.timeoutMs ?? 12000,
        maxBuffer: 8 * 1024 * 1024
      });
      const parsed = parseOpenCliOutput(stdout, input, base);
      if (parsed.status === 'success' && (parsed.content_markdown?.trim() || parsed.title || parsed.excerpt)) {
        return parsed;
      }
      lastError = parsed.error ?? 'opencli_empty_result';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ...base,
    status: 'failed',
    title: stringOrNull(input.title) ?? undefined,
    excerpt: stringOrNull(input.text) ?? undefined,
    error: lastError
  };
}

function commandCandidates(platform: ParsedContent['platform'], url: string): string[][] {
  if (platform === 'wechat_article') return [['weixin', 'download', '--url', url, '-f', 'json'], ['weixin', 'download', '--url', url, '-f', 'md']];
  if (platform === 'xiaohongshu') return [['xiaohongshu', 'note', url, '-f', 'json']];
  if (platform === 'x') {
    const tweetId = extractTweetId(url) ?? url;
    return [['twitter', 'thread', tweetId, '-f', 'json'], ['twitter', 'article', tweetId, '-f', 'json']];
  }
  return [];
}

function parseOpenCliOutput(
  stdout: string,
  input: ContentParseInput,
  base: Omit<ParsedContent, 'status'>
): ParsedContent {
  const trimmed = stdout.trim();
  const json = parseJsonValue(trimmed);
  if (Array.isArray(json)) {
    return parseOpenCliArrayOutput(json, input, base);
  }
  if (isRecord(json)) {
    const record = json;
    const title = firstString(record, ['title', 'name', 'headline']) ?? stringOrNull(input.title) ?? sourcePlatformLabel(base.platform);
    const author = firstString(record, ['author', 'author_name', 'nickname', 'user', 'username']);
    const content =
      firstString(record, ['markdown', 'content_markdown', 'content', 'text', 'body']) ??
      stringOrNull(input.text) ??
      '';
    const excerpt = firstString(record, ['excerpt', 'summary', 'description']) ?? stringOrNull(input.text) ?? undefined;
    return {
      ...base,
      status: 'success',
      title,
      author,
      excerpt,
      content_markdown: normalizeMarkdown(content),
      metadata: { output_format: 'json' }
    };
  }
  if (base.platform === 'xiaohongshu' && looksLikeMediaDownloadTable(trimmed)) {
    return {
      ...base,
      status: 'failed',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: 'opencli_media_download_output_not_readable',
      metadata: { output_format: 'text' }
    };
  }
  return {
    ...base,
    status: 'success',
    title: stringOrNull(input.title) ?? sourcePlatformLabel(base.platform),
    excerpt: stringOrNull(input.text) ?? undefined,
    content_markdown: normalizeMarkdown(trimmed || stringOrNull(input.text) || ''),
    metadata: { output_format: 'text' }
  };
}

function parseOpenCliArrayOutput(
  records: unknown[],
  input: ContentParseInput,
  base: Omit<ParsedContent, 'status'>
): ParsedContent {
  const first = records.find(isRecord);
  if (!first) {
    return {
      ...base,
      status: 'failed',
      title: stringOrNull(input.title) ?? sourcePlatformLabel(base.platform),
      excerpt: stringOrNull(input.text) ?? undefined,
      error: 'opencli_empty_json_array'
    };
  }

  if (base.platform === 'x' && records.some((record) => isRecord(record) && typeof record.text === 'string')) {
    return parseOpenCliTwitterThread(records, input, base);
  }

  const title = firstString(first, ['title', 'name', 'headline']) ?? stringOrNull(input.title) ?? sourcePlatformLabel(base.platform);
  const author = firstString(first, ['author', 'author_name', 'nickname', 'user', 'username']);
  const content =
    firstString(first, ['markdown', 'content_markdown', 'content', 'text', 'body']) ??
    records.map((record) => (isRecord(record) ? firstString(record, ['content', 'text', 'body']) : undefined)).filter(Boolean).join('\n\n') ??
    stringOrNull(input.text) ??
    '';
  const excerpt = firstString(first, ['excerpt', 'summary', 'description']) ?? firstString(first, ['text', 'content']) ?? stringOrNull(input.text) ?? undefined;
  return {
    ...base,
    status: 'success',
    title,
    author,
    excerpt,
    content_markdown: normalizeMarkdown(content),
    metadata: { output_format: 'json', json_shape: 'array' }
  };
}

function parseOpenCliTwitterThread(
  records: unknown[],
  input: ContentParseInput,
  base: Omit<ParsedContent, 'status'>
): ParsedContent {
  const tweets = records.map(tweetRecord).filter((tweet): tweet is TweetRecord => Boolean(tweet?.text));
  const root = tweets[0];
  const title = stringOrNull(input.title) ?? (root?.author ? `X post by @${root.author}` : 'X post');
  const content = tweets
    .map((tweet, index) => {
      const heading = index === 0 ? `@${tweet.author ?? 'unknown'}` : `Reply by @${tweet.author ?? 'unknown'}`;
      const meta = [tweet.created_at, tweet.url].filter(Boolean).join(' | ');
      const metrics = [typeof tweet.likes === 'number' ? `${tweet.likes} likes` : null, typeof tweet.retweets === 'number' ? `${tweet.retweets} reposts` : null]
        .filter(Boolean)
        .join(' | ');
      return [`## ${heading}`, meta, decodeHtmlEntities(tweet.text), metrics].filter(Boolean).join('\n\n');
    })
    .join('\n\n---\n\n');

  return {
    ...base,
    status: 'success',
    title,
    author: root?.author,
    excerpt: root?.text ? decodeHtmlEntities(root.text) : stringOrNull(input.text) ?? undefined,
    content_markdown: normalizeMarkdown(content || stringOrNull(input.text) || ''),
    metadata: { output_format: 'json', json_shape: 'array', item_count: tweets.length }
  };
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
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
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

interface TweetRecord {
  author?: string;
  text: string;
  created_at?: string;
  url?: string;
  likes?: number;
  retweets?: number;
}

function tweetRecord(value: unknown): TweetRecord | null {
  if (!isRecord(value)) return null;
  const text = firstString(value, ['text', 'content']);
  if (!text) return null;
  const author = firstString(value, ['author', 'author_name', 'username', 'user']);
  return {
    author,
    text,
    created_at: firstString(value, ['created_at', 'createdAt']),
    url: firstString(value, ['url']),
    likes: typeof value.likes === 'number' ? value.likes : undefined,
    retweets: typeof value.retweets === 'number' ? value.retweets : undefined
  };
}

function extractTweetId(value: string): string | null {
  return value.match(/(?:status|statuses)\/(\d+)/i)?.[1] ?? (value.match(/^\d{8,}$/)?.[0] ?? null);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join('\n\n');
      if (joined.trim()) return joined.trim();
    }
  }
  return undefined;
}

function normalizeMarkdown(value: string): string | undefined {
  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim()
    .slice(0, 80000);
  return normalized || undefined;
}

function looksLikeMediaDownloadTable(value: string): boolean {
  return (
    /\|\s*index\s*\|\s*type\s*\|\s*status\s*\|\s*size\s*\|/i.test(value) &&
    /\|\s*\d+\s*\|\s*(image|video)\s*\|\s*success\s*\|/i.test(value)
  );
}
