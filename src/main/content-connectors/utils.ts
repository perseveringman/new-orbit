import { createHash } from 'node:crypto';
import type { ContentPlatform, ContentParseInput } from './types';

export function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function firstUrl(value: string | null | undefined): string | null {
  return value?.match(/https?:\/\/[^\s)）]+/i)?.[0] ?? null;
}

export function normalizePlatform(value: unknown): ContentPlatform {
  if (value === 'wechat_article' || value === 'xiaohongshu' || value === 'x' || value === 'web') return value;
  return 'unknown';
}

export function platformFromUrl(url: string | null | undefined): ContentPlatform {
  if (!url) return 'unknown';
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

export function platformForInput(input: ContentParseInput): ContentPlatform {
  const hinted = normalizePlatform(input.platformHint);
  if (hinted !== 'unknown') return hinted;
  return platformFromUrl(normalizeUrl(input.canonicalUrl) ?? normalizeUrl(input.url) ?? firstUrl(input.text));
}

export function parserHintForPlatform(platform: ContentPlatform): string {
  if (platform === 'wechat_article') return 'wechat_article';
  if (platform === 'xiaohongshu') return 'xiaohongshu_note';
  if (platform === 'x') return 'x_post';
  return 'generic_url';
}

export function canonicalizeUrl(url: string | null, platform: ContentPlatform): string | null {
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

export function sourceUrlForInput(input: ContentParseInput): string | null {
  return normalizeUrl(input.url) ?? firstUrl(input.text);
}

export function canonicalUrlForInput(input: ContentParseInput, platform: ContentPlatform): string | null {
  return normalizeUrl(input.canonicalUrl) ?? canonicalizeUrl(sourceUrlForInput(input), platform);
}

export function sourcePlatformLabel(platform: ContentPlatform): string {
  if (platform === 'wechat_article') return 'WeChat article';
  if (platform === 'xiaohongshu') return 'Xiaohongshu note';
  if (platform === 'x') return 'X post';
  if (platform === 'web') return 'Web page';
  return 'Shared source';
}

export function stableContentKey(url: string | null, fallback: string): string {
  return createHash('sha1').update(url || fallback).digest('hex').slice(0, 20);
}

export function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3)).trim()}...`;
}
