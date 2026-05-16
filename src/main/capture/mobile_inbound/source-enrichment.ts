import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MobileCaptureManifest, MobileShareContext } from './types';

export type MobileSourcePlatform = 'wechat_article' | 'xiaohongshu' | 'x' | 'web' | 'unknown';

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

export interface SourceEnrichmentOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface MobileSourceEnrichment {
  platform: MobileSourcePlatform;
  parser_hint: string;
  status: 'success' | 'skipped' | 'failed';
  source_url: string | null;
  canonical_url: string | null;
  title?: string;
  author?: string;
  excerpt?: string;
  content_markdown?: string;
  fetched_at: string;
  error?: string;
  artifact_path?: string;
}

export async function enrichMobileShareSource(
  manifest: MobileCaptureManifest,
  options: SourceEnrichmentOptions = {}
): Promise<MobileSourceEnrichment | undefined> {
  const context = normalizedShareContext(manifest);
  if (!context) return undefined;
  const platform = normalizePlatform(context.source_platform);
  const sourceUrl = stringOrNull(context.source_url);
  const canonicalUrl = stringOrNull(context.canonical_url) ?? canonicalizeSourceUrl(sourceUrl, platform);
  const url = canonicalUrl ?? sourceUrl;
  const parserHint = stringOrNull(context.parser_hint) ?? parserHintForPlatform(platform);
  const fetchedAt = new Date().toISOString();

  if (!url || platform === 'unknown') {
    return {
      platform,
      parser_hint: parserHint,
      status: 'skipped',
      source_url: sourceUrl,
      canonical_url: canonicalUrl,
      title: stringOrNull(context.source_title) ?? undefined,
      excerpt: stringOrNull(context.raw_share_text) ?? undefined,
      fetched_at: fetchedAt,
      error: 'missing_supported_source_url'
    };
  }

  const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetcher) {
    return {
      platform,
      parser_hint: parserHint,
      status: 'skipped',
      source_url: sourceUrl,
      canonical_url: canonicalUrl,
      title: stringOrNull(context.source_title) ?? undefined,
      excerpt: stringOrNull(context.raw_share_text) ?? undefined,
      fetched_at: fetchedAt,
      error: 'fetch_unavailable'
    };
  }

  try {
    if (platform === 'x') {
      return await enrichXPost(fetcher, url, context, fetchedAt, options.timeoutMs);
    }
    return await enrichHtmlSource(fetcher, url, platform, parserHint, context, fetchedAt, options.timeoutMs);
  } catch (error) {
    return {
      platform,
      parser_hint: parserHint,
      status: 'failed',
      source_url: sourceUrl,
      canonical_url: canonicalUrl,
      title: stringOrNull(context.source_title) ?? undefined,
      excerpt: stringOrNull(context.raw_share_text) ?? undefined,
      fetched_at: fetchedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function writeSourceEnrichmentArtifact(
  vaultPath: string,
  manifest: MobileCaptureManifest,
  enrichment: MobileSourceEnrichment | undefined
): Promise<MobileSourceEnrichment | undefined> {
  if (!enrichment || enrichment.status !== 'success' || !enrichment.content_markdown?.trim()) {
    return enrichment;
  }
  const relPath = path.join('.orbit', 'capture', 'enrichments', manifest.id, 'source.md');
  const absPath = path.join(vaultPath, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, formatSourceArtifact(enrichment), 'utf8');
  return { ...enrichment, artifact_path: relPath };
}

export function formatSourceArtifact(enrichment: MobileSourceEnrichment): string {
  const lines = [
    '---',
    `platform: ${enrichment.platform}`,
    `source_url: ${enrichment.source_url ?? ''}`,
    `canonical_url: ${enrichment.canonical_url ?? ''}`,
    `fetched_at: ${enrichment.fetched_at}`,
    `status: ${enrichment.status}`,
    '---',
    '',
    `# ${enrichment.title ?? sourcePlatformLabel(enrichment.platform)}`,
    '',
    enrichment.author ? `Author: ${enrichment.author}` : '',
    enrichment.excerpt ? `> ${enrichment.excerpt}` : '',
    '',
    enrichment.content_markdown ?? ''
  ];
  return `${lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim()}\n`;
}

export function sourcePlatformLabel(platform: MobileSourcePlatform): string {
  if (platform === 'wechat_article') return 'WeChat article';
  if (platform === 'xiaohongshu') return 'Xiaohongshu note';
  if (platform === 'x') return 'X post';
  if (platform === 'web') return 'Web page';
  return 'Shared source';
}

function normalizedShareContext(manifest: MobileCaptureManifest): MobileShareContext | null {
  const context = manifest.context?.share_context;
  if (context && typeof context === 'object') return context;
  const url = firstUrl(manifest.content);
  if (!url) return null;
  const platform = normalizePlatformFromUrl(url);
  return {
    capture_method: 'manual_url',
    source_platform: platform,
    parser_hint: parserHintForPlatform(platform),
    source_url: url,
    canonical_url: canonicalizeSourceUrl(url, platform),
    raw_share_text: manifest.content
  };
}

async function enrichHtmlSource(
  fetcher: FetchLike,
  url: string,
  platform: MobileSourcePlatform,
  parserHint: string,
  context: MobileShareContext,
  fetchedAt: string,
  timeoutMs = 8000
): Promise<MobileSourceEnrichment> {
  const response = await fetchWithTimeout(fetcher, url, timeoutMs, {
    accept: 'text/html, application/xhtml+xml, text/plain;q=0.8, */*;q=0.5',
    'user-agent': 'Mozilla/5.0 OrbitMobileInbound/1.0'
  });
  if (!response.ok) throw new Error(`source_fetch_failed:${response.status}`);
  const html = await response.text();
  const title =
    extractMeta(html, 'og:title') ??
    extractMeta(html, 'twitter:title') ??
    extractTitle(html) ??
    stringOrNull(context.source_title) ??
    sourcePlatformLabel(platform);
  const excerpt =
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    stringOrNull(context.raw_share_text) ??
    undefined;
  const content =
    platform === 'wechat_article'
      ? extractWeChatArticleText(html) ?? htmlToMarkdown(extractElementById(html, 'js_content') ?? html)
      : htmlToMarkdown(html);
  return {
    platform,
    parser_hint: parserHint,
    status: 'success',
    source_url: stringOrNull(context.source_url),
    canonical_url: stringOrNull(context.canonical_url) ?? canonicalizeSourceUrl(url, platform),
    title,
    author:
      (platform === 'wechat_article' ? extractWeChatAuthor(html) : undefined) ??
      extractMeta(html, 'author') ??
      extractMeta(html, 'og:article:author') ??
      undefined,
    excerpt,
    content_markdown: content || excerpt || stringOrNull(context.raw_share_text) || undefined,
    fetched_at: fetchedAt
  };
}

async function enrichXPost(
  fetcher: FetchLike,
  url: string,
  context: MobileShareContext,
  fetchedAt: string,
  timeoutMs = 8000
): Promise<MobileSourceEnrichment> {
  const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(fetcher, endpoint, timeoutMs, {
    accept: 'application/json, */*;q=0.5',
    'user-agent': 'OrbitMobileInbound/1.0'
  });
  if (!response.ok) throw new Error(`x_oembed_failed:${response.status}`);
  const data = response.json ? await response.json() : JSON.parse(await response.text());
  const record = isRecord(data) ? data : {};
  const html = typeof record.html === 'string' ? record.html : '';
  const text = htmlToMarkdown(html);
  const authorName = typeof record.author_name === 'string' ? record.author_name : undefined;
  return {
    platform: 'x',
    parser_hint: stringOrNull(context.parser_hint) ?? 'x_post',
    status: 'success',
    source_url: stringOrNull(context.source_url),
    canonical_url: stringOrNull(context.canonical_url) ?? canonicalizeSourceUrl(url, 'x'),
    title: stringOrNull(context.source_title) ?? (authorName ? `X post by ${authorName}` : 'X post'),
    author: authorName,
    excerpt: text || stringOrNull(context.raw_share_text) || undefined,
    content_markdown: text || stringOrNull(context.raw_share_text) || undefined,
    fetched_at: fetchedAt
  };
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  url: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<FetchResponseLike> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizePlatform(value: unknown): MobileSourcePlatform {
  if (value === 'wechat_article' || value === 'xiaohongshu' || value === 'x' || value === 'web') return value;
  return 'unknown';
}

function normalizePlatformFromUrl(url: string): MobileSourcePlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'mp.weixin.qq.com') return 'wechat_article';
    if (host.endsWith('xiaohongshu.com') || host === 'xhslink.com') return 'xiaohongshu';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
    return 'web';
  } catch {
    return 'unknown';
  }
}

function parserHintForPlatform(platform: MobileSourcePlatform): string {
  if (platform === 'wechat_article') return 'wechat_article';
  if (platform === 'xiaohongshu') return 'xiaohongshu_note';
  if (platform === 'x') return 'x_post';
  return 'generic_url';
}

function canonicalizeSourceUrl(url: string | null, platform: MobileSourcePlatform): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (platform === 'x') {
      const match = parsed.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/i);
      if (match) return `https://x.com/${match[1]}/status/${match[2]}`;
      if (parsed.hostname.includes('twitter.com')) parsed.hostname = 'x.com';
    }
    return parsed.toString();
  } catch {
    return url;
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

function firstUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s)）]+/i)?.[0] ?? null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
