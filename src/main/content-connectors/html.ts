const MAX_READABLE_MARKDOWN_CHARS = 250000;
const MAX_READABLE_HTML_CHARS = 800000;

export function looksLikeHtml(value: string | undefined | null): value is string {
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value);
}

export function decodeHtmlEntities(value: string): string {
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

export function decodePotentialHtml(value: string): string {
  if (looksLikeHtml(value)) return value;
  const decoded = decodeHtmlEntities(value);
  return looksLikeHtml(decoded) ? decoded : value;
}

export function sanitizeReadableHtml(value: string): string {
  const html = decodePotentialHtml(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?>/gi, '');

  return html
    .replace(/\s(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\sstyle\s*=\s*(['"])([\s\S]*?)\1/gi, (_match, quote: string, style: string) => {
      const safe = sanitizeInlineStyle(style);
      return safe ? ` style=${quote}${safe}${quote}` : '';
    })
    .trim()
    .slice(0, MAX_READABLE_HTML_CHARS);
}

export function htmlToReadableMarkdown(value: string): string {
  let html = decodePotentialHtml(value);
  html = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = htmlAttr(tag, 'data-src') ?? htmlAttr(tag, 'src') ?? htmlAttr(tag, 'data-original');
      if (!src || isTransparentImage(src)) return '';
      const alt = htmlAttr(tag, 'alt') ?? '图片';
      return `\n\n![${escapeMarkdownText(decodeHtmlEntities(alt))}](${src})\n\n`;
    })
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
      const label = htmlToPlainText(text) || href;
      return `[${escapeMarkdownText(label)}](${href})`;
    })
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, tag: string, text: string) => {
      const level = Number(tag.slice(1));
      return `\n\n${'#'.repeat(Math.max(1, Math.min(level, 6)))} ${htmlToPlainText(text)}\n\n`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|header|footer|blockquote)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, text: string) => `**${htmlToPlainText(text)}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, text: string) => `*${htmlToPlainText(text)}*`)
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(html)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_READABLE_MARKDOWN_CHARS);
}

function sanitizeInlineStyle(value: string): string {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/expression\s*\(|javascript:|behavior\s*:|-moz-binding\s*:|url\s*\(/i.test(part))
    .join('; ');
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlAttr(tag: string, name: string): string | undefined {
  const escaped = escapeRegExp(name);
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2]?.trim();
}

function isTransparentImage(value: string): boolean {
  return /^data:image\/(?:gif|png|svg\+xml);/i.test(value) && value.length < 180;
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[[\]\\]/g, '\\$&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
