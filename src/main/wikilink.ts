export interface WikiLink {
  start: number;
  end: number;
  target: string; // trimmed
  alias?: string;
  raw: string;
}

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

export function parseWikilinks(content: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    const raw = m[0];
    const inner = m[1] ?? '';
    if (m.index === undefined) continue;
    const pipe = inner.indexOf('|');
    let target = inner;
    let alias: string | undefined;
    if (pipe !== -1) {
      target = inner.slice(0, pipe);
      alias = inner.slice(pipe + 1).trim();
    }
    target = target.trim();
    out.push({
      start: m.index,
      end: m.index + raw.length,
      target,
      alias,
      raw
    });
  }
  return out;
}

/**
 * Rewrite wikilinks whose target matches `oldName` (case-insensitive, with or
 * without `.md` extension) to `newName`. Preserves alias if any. Returns the
 * new content plus number of replacements.
 */
export function rewriteWikilinks(
  content: string,
  oldName: string,
  newName: string
): { content: string; changed: number } {
  const targets = normalizeCandidates(oldName);
  let changed = 0;
  const next = content.replace(WIKILINK_RE, (full, inner: string) => {
    const pipe = inner.indexOf('|');
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? '' : inner.slice(pipe);
    if (targets.has(stripMd(target).toLowerCase())) {
      changed++;
      return `[[${stripMd(newName)}${alias}]]`;
    }
    return full;
  });
  return { content: next, changed };
}

function stripMd(s: string): string {
  return s.replace(/\.md$/i, '');
}

function normalizeCandidates(name: string): Set<string> {
  const base = stripMd(name).toLowerCase();
  return new Set([base]);
}
