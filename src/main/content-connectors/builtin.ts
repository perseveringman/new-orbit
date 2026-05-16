import type {
  ContentConnector,
  ContentConnectorContext,
  ContentParseInput,
  FetchLike,
  ParsedContent
} from './types';
import {
  canonicalUrlForInput,
  parserHintForPlatform,
  platformForInput,
  sourcePlatformLabel,
  sourceUrlForInput,
  stringOrNull
} from './utils';

const BUILTIN_VERSION = '1.0.0';

export function createBuiltinContentConnector(): ContentConnector {
  return {
    id: 'builtin.web-readable',
    version: BUILTIN_VERSION,
    priority: 10,
    canHandle(input) {
      return Boolean(sourceUrlForInput(input));
    },
    async parse(input, context) {
      return parseBuiltin(input, context);
    }
  };
}

async function parseBuiltin(input: ContentParseInput, context: ContentConnectorContext): Promise<ParsedContent> {
  const platform = platformForInput(input);
  const sourceUrl = sourceUrlForInput(input);
  const canonicalUrl = canonicalUrlForInput(input, platform);
  const url = canonicalUrl ?? sourceUrl;
  const parserHint = stringOrNull(input.parserHint) ?? parserHintForPlatform(platform);
  const fetchedAt = (context.now?.() ?? new Date()).toISOString();
  const base = {
    platform,
    parser_hint: parserHint,
    source_url: sourceUrl,
    canonical_url: canonicalUrl,
    fetched_at: fetchedAt,
    connector_id: 'builtin.web-readable',
    connector_version: BUILTIN_VERSION
  };

  if (!url || platform === 'unknown') {
    return {
      ...base,
      status: 'skipped',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: 'missing_supported_source_url'
    };
  }

  const fetcher = context.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetcher) {
    return {
      ...base,
      status: 'skipped',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: 'fetch_unavailable'
    };
  }

  try {
    if (platform === 'x') return await parseXPost(fetcher, url, input, fetchedAt, context.timeoutMs);
    return await parseHtmlSource(fetcher, url, platform, input, fetchedAt, context.timeoutMs);
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      title: stringOrNull(input.title) ?? undefined,
      excerpt: stringOrNull(input.text) ?? undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function parseHtmlSource(
  fetcher: FetchLike,
  url: string,
  platform: ParsedContent['platform'],
  input: ContentParseInput,
  fetchedAt: string,
  timeoutMs = 8000
): Promise<ParsedContent> {
  const response = await fetchWithTimeout(fetcher, url, timeoutMs, {
    accept: 'text/html, application/xhtml+xml, text/plain;q=0.8, */*;q=0.5',
    'user-agent': 'Mozilla/5.0 OrbitContentConnector/1.0'
  });
  if (!response.ok) throw new Error(`source_fetch_failed:${response.status}`);
  const html = await response.text();
  const title =
    extractMeta(html, 'og:title') ??
    extractMeta(html, 'twitter:title') ??
    extractTitle(html) ??
    stringOrNull(input.title) ??
    sourcePlatformLabel(platform);
  const excerpt = extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ?? stringOrNull(input.text) ?? undefined;
  const content =
    platform === 'wechat_article'
      ? extractWeChatArticleText(html) ?? htmlToMarkdown(extractElementById(html, 'js_content') ?? html)
      : htmlToMarkdown(html);
  return {
    platform,
    parser_hint: stringOrNull(input.parserHint) ?? parserHintForPlatform(platform),
    status: 'success',
    source_url: sourceUrlForInput(input),
    canonical_url: canonicalUrlForInput(input, platform),
    title,
    author:
      (platform === 'wechat_article' ? extractWeChatAuthor(html) : undefined) ??
      extractMeta(html, 'author') ??
      extractMeta(html, 'og:article:author') ??
      undefined,
    excerpt,
    content_markdown: content || excerpt || stringOrNull(input.text) || undefined,
    fetched_at: fetchedAt,
    connector_id: 'builtin.web-readable',
    connector_version: BUILTIN_VERSION
  };
}

async function parseXPost(
  fetcher: FetchLike,
  url: string,
  input: ContentParseInput,
  fetchedAt: string,
  timeoutMs = 8000
): Promise<ParsedContent> {
  const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(fetcher, endpoint, timeoutMs, {
    accept: 'application/json, */*;q=0.5',
    'user-agent': 'OrbitContentConnector/1.0'
  });
  if (!response.ok) throw new Error(`x_oembed_failed:${response.status}`);
  const data = response.json ? await response.json() : JSON.parse(await response.text());
  const record = isRecord(data) ? data : {};
  const html = typeof record.html === 'string' ? record.html : '';
  const text = htmlToMarkdown(html);
  const authorName = typeof record.author_name === 'string' ? record.author_name : undefined;
  return {
    platform: 'x',
    parser_hint: stringOrNull(input.parserHint) ?? 'x_post',
    status: 'success',
    source_url: sourceUrlForInput(input),
    canonical_url: canonicalUrlForInput(input, 'x'),
    title: stringOrNull(input.title) ?? (authorName ? `X post by ${authorName}` : 'X post'),
    author: authorName,
    excerpt: text || stringOrNull(input.text) || undefined,
    content_markdown: text || stringOrNull(input.text) || undefined,
    fetched_at: fetchedAt,
    connector_id: 'builtin.web-readable',
    connector_version: BUILTIN_VERSION
  };
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  url: string,
  timeoutMs: number,
  headers: Record<string, string>
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = escapeRegExp(key);
  return decodeHtml(
    matchFirst(html, new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i')) ??
      matchFirst(html, new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i')) ??
      ''
  );
}

function extractTitle(html: string): string | undefined {
  return decodeHtml(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? '');
}

function extractElementById(html: string, id: string): string | undefined {
  const escaped = escapeRegExp(id);
  return matchFirst(html, new RegExp(`<[^>]+id=["']${escaped}["'][^>]*>([\\s\\S]*?)(?:<script\\b|</body>)`, 'i'));
}

function htmlToMarkdown(html: string): string {
  return (decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|main|header|footer|li|blockquote|h[1-6])>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
  ) ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 40000);
}

function extractWeChatArticleText(html: string): string | undefined {
  return plainTextToMarkdown(
    extractJsStringProperty(html, 'content_noencode') ?? extractJsStringProperty(html, 'content') ?? ''
  );
}

function extractWeChatAuthor(html: string): string | undefined {
  return decodeHtml(extractJsStringProperty(html, 'nickname') ?? '');
}

function extractJsStringProperty(html: string, key: string): string | undefined {
  const escaped = escapeRegExp(key);
  const raw = matchFirst(html, new RegExp(`${escaped}:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'i'));
  if (!raw) return undefined;
  return decodeJsString(raw);
}

function decodeJsString(value: string): string {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function plainTextToMarkdown(value: string): string | undefined {
  return (
    decodeHtmlEntities(value)
      .split(/\r?\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 40000) || undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function matchFirst(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1]?.trim();
}

function decodeHtml(value: string): string | undefined {
  const decoded = decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();
  return decoded || undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
