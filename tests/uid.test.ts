import { describe, expect, it } from 'vitest';
import { ensureUid, parseFrontmatter } from '../src/main/uid';

describe('uid / frontmatter engine', () => {
  it('injects frontmatter with uid when none exists', () => {
    const src = '# hello\nworld\n';
    const { uid, content, changed } = ensureUid(src);
    expect(changed).toBe(true);
    expect(uid).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toMatch(/uid: [A-Za-z0-9_-]{12}/);
    expect(content).toContain('# hello');
  });

  it('adds uid but keeps other frontmatter keys', () => {
    const src = '---\ntitle: Alpha\ntags: a\n---\nbody\n';
    const { uid, content, changed } = ensureUid(src);
    expect(changed).toBe(true);
    const parsed = parseFrontmatter(content);
    expect(parsed.frontmatter['title']).toBe('Alpha');
    expect(parsed.frontmatter['tags']).toBe('a');
    expect(parsed.frontmatter['uid']).toBe(uid);
    expect(parsed.body).toContain('body');
  });

  it('is a no-op when uid already present', () => {
    const src = '---\nuid: abc123DEF456\ntitle: X\n---\nbody\n';
    const { uid, content, changed } = ensureUid(src);
    expect(changed).toBe(false);
    expect(uid).toBe('abc123DEF456');
    expect(content).toBe(src);
  });
});
