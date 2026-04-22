import YAML from 'yaml';

export interface FrontmatterReadResult {
  data: Record<string, unknown>;
  body: string;
  raw: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse a YAML frontmatter block from the head of `raw`. Keeps the rest of the
 * file as `body` byte-for-byte. `raw` is the original fence (or `''` when no
 * frontmatter was present).
 */
export function read(raw: string): FrontmatterReadResult {
  const m = raw.match(FM_RE);
  if (!m) return { data: {}, body: raw, raw: '' };
  const block = m[1] ?? '';
  let data: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(block);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { data, body: raw.slice((m[0] ?? '').length), raw: m[0] ?? '' };
}

/**
 * Serialize `data` back to a `---` fenced block followed by `body` (appended
 * verbatim). Object-property insertion order is preserved by the `yaml`
 * package, so callers that care about key order should build the object in the
 * order they want.
 */
export function write(data: Record<string, unknown>, body: string): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return body;
  const doc = new YAML.Document();
  doc.contents = doc.createNode(data);
  // yaml appends trailing newline; trim one so we can control the fence.
  const yamlStr = doc.toString().replace(/\n$/, '');
  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Merge `updates` into existing frontmatter, then serialize. `updates` entries
 * with `undefined` value delete the key. Keys absent from `updates` are
 * preserved in their original order.
 */
export function update(
  raw: string,
  updates: Record<string, unknown>
): { content: string; changed: boolean; data: Record<string, unknown> } {
  const { data, body } = read(raw);
  let changed = false;
  const next: Record<string, unknown> = { ...data };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) {
      if (k in next) {
        delete next[k];
        changed = true;
      }
    } else if (!deepEq(next[k], v)) {
      next[k] = v;
      changed = true;
    }
  }
  // Preserve key order: take original order, append new keys at end.
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(data)) if (k in next) ordered[k] = next[k];
  for (const k of Object.keys(next)) if (!(k in ordered)) ordered[k] = next[k];
  const content = changed ? write(ordered, body) : raw;
  return { content, changed, data: ordered };
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!deepEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
