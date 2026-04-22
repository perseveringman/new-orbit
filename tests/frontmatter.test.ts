import { describe, expect, it } from 'vitest';
import * as fm from '../src/main/frontmatter';

describe('frontmatter YAML round-trip', () => {
  it('preserves body byte-for-byte on update', () => {
    const body =
      '# Heading\n\nA paragraph with\ntwo lines.\n\n中文 / emoji 🎯 / tab\there.\n';
    const raw = '---\ntitle: Alpha\ntags:\n  - a\n  - b\n---\n' + body;
    const r = fm.read(raw);
    expect(r.data).toEqual({ title: 'Alpha', tags: ['a', 'b'] });
    expect(r.body).toBe(body);

    const updated = fm.update(raw, { status: 'active' });
    const r2 = fm.read(updated.content);
    expect(r2.body).toBe(body);
    expect(r2.data['title']).toBe('Alpha');
    expect(r2.data['status']).toBe('active');
    // Key order: original keys come first, new key appended.
    expect(Object.keys(r2.data)).toEqual(['title', 'tags', 'status']);
  });

  it('writes a valid block for non-ASCII strings and arrays', () => {
    const out = fm.write({ title: '週報 / 週報', tags: ['研究', 'alpha'] }, 'body text\n');
    expect(out.startsWith('---\n')).toBe(true);
    const r = fm.read(out);
    expect(r.data).toEqual({ title: '週報 / 週報', tags: ['研究', 'alpha'] });
    expect(r.body).toBe('body text\n');
  });

  it('deletes keys when update value is undefined', () => {
    const raw = '---\na: 1\nb: 2\n---\nX\n';
    const { content, changed } = fm.update(raw, { a: undefined });
    expect(changed).toBe(true);
    const r = fm.read(content);
    expect(r.data).toEqual({ b: 2 });
  });

  it('is a no-op when nothing actually changes', () => {
    const raw = '---\na: 1\n---\nhi\n';
    const { content, changed } = fm.update(raw, { a: 1 });
    expect(changed).toBe(false);
    expect(content).toBe(raw);
  });
});
