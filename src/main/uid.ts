import { customAlphabet } from 'nanoid';
import * as frontmatter from './frontmatter';

// URL-safe alphabet, 12 chars = ~71 bits of entropy
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const gen = customAlphabet(alphabet, 12);

export function newUid(): string {
  return gen();
}

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
  raw: string;
}

/**
 * Back-compat wrapper over the YAML-aware `frontmatter.read` used by older
 * callers (refmap, index_store). Prefer `frontmatter.read` in new code.
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
  const r = frontmatter.read(content);
  return {
    frontmatter: r.data,
    body: r.body,
    hasFrontmatter: r.raw !== '',
    raw: r.raw
  };
}

/**
 * Ensure the markdown file has a `uid` in frontmatter. Returns the uid plus
 * (optionally) rewritten content when an injection was needed. Never clobbers
 * an existing uid. Key order is preserved: `uid` is placed first for new
 * frontmatter, or kept in its existing position if already present.
 */
export function ensureUid(content: string): {
  uid: string;
  content: string;
  changed: boolean;
} {
  const parsed = frontmatter.read(content);
  const existing = parsed.data['uid'];
  if (typeof existing === 'string' && existing.trim()) {
    return { uid: existing.trim(), content, changed: false };
  }
  const uid = newUid();
  // Force `uid` to first key by constructing a fresh ordered object.
  const merged: Record<string, unknown> = { uid, ...parsed.data };
  const next = frontmatter.write(merged, parsed.body);
  return { uid, content: next, changed: true };
}
