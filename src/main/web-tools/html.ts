const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ENTITY_MAP[entity] ?? full;
  });
}

export function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t\r\f\v]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripHtml(match[1] ?? '') : '';
  return title || undefined;
}

export function clipText(input: string, maxChars: number): { text: string; truncated: boolean } {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: `${input.slice(0, Math.max(0, maxChars - 80))}\n\n[orbit_truncated]`, truncated: true };
}
