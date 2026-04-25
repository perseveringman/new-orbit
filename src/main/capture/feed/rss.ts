export interface ParsedFeedItem {
  guid?: string;
  url: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  imageUrl?: string;
}

export interface ParsedFeed {
  title: string;
  items: ParsedFeedItem[];
}

export function parseRss(xml: string, fallbackUrl: string, now: () => Date = () => new Date()): ParsedFeed {
  const channel = firstBlock(xml, 'channel') ?? xml;
  const title = textOf(channel, 'title') || hostnameTitle(fallbackUrl);
  const rssItems = blocks(channel, 'item');
  const atomItems = rssItems.length > 0 ? [] : blocks(xml, 'entry');
  const items = (rssItems.length > 0 ? rssItems : atomItems)
    .map((block) => parseItem(block, fallbackUrl, now))
    .filter((item): item is ParsedFeedItem => item !== null);
  return { title, items };
}

function parseItem(block: string, fallbackUrl: string, now: () => Date): ParsedFeedItem | null {
  const atomLink = firstLinkHref(block);
  const url = textOf(block, 'link') || atomLink || textOf(block, 'guid') || fallbackUrl;
  const title = textOf(block, 'title') || url;
  const guid = textOf(block, 'guid') || textOf(block, 'id') || url;
  const excerpt = stripHtml(textOf(block, 'description') || textOf(block, 'summary') || textOf(block, 'content:encoded'));
  const publishedRaw = textOf(block, 'pubDate') || textOf(block, 'published') || textOf(block, 'updated');
  const publishedAt = normalizeDate(publishedRaw, now);
  const imageUrl = firstMediaUrl(block);
  if (!url.trim()) return null;
  return {
    guid: guid.trim() || undefined,
    url: decodeEntities(url.trim()),
    title: decodeEntities(stripHtml(title.trim())),
    excerpt: decodeEntities(excerpt.trim()).slice(0, 500),
    publishedAt,
    ...(imageUrl ? { imageUrl } : {})
  };
}

function blocks(xml: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    result.push(match[1] ?? '');
  }
  return result;
}

function firstBlock(xml: string, tag: string): string | null {
  return blocks(xml, tag)[0] ?? null;
}

function textOf(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = regex.exec(xml);
  const raw = match?.[1] ?? '';
  return decodeEntities(stripCdata(raw)).trim();
}

function firstLinkHref(xml: string): string {
  const match = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(xml);
  return decodeEntities(match?.[1] ?? '').trim();
}

function firstMediaUrl(xml: string): string | undefined {
  const match = /<(?:media:content|media:thumbnail|enclosure)\b[^>]*url=["']([^"']+)["'][^>]*>/i.exec(xml);
  const value = decodeEntities(match?.[1] ?? '').trim();
  return value || undefined;
}

function stripCdata(value: string): string {
  return value.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
}

function stripHtml(value: string): string {
  return stripCdata(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_full, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity] ?? `&${entity};`;
  });
}

function normalizeDate(value: string, now: () => Date): string {
  if (!value) return now().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now().toISOString();
  return parsed.toISOString();
}

function hostnameTitle(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'RSS Feed';
  }
}
