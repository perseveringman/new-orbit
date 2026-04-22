import { describe, expect, it } from 'vitest';
import { parseWikilinks, rewriteWikilinks } from '../src/main/wikilink';

describe('wikilink parser', () => {
  it('parses plain, aliased, nested-path and padded targets', () => {
    const src = 'see [[Alpha]] and [[Bravo|b]] plus [[a/b]] then [[  spaced  ]]';
    const out = parseWikilinks(src);
    expect(out.map((w) => w.target)).toEqual(['Alpha', 'Bravo', 'a/b', 'spaced']);
    expect(out[1]?.alias).toBe('b');
    expect(out[3]?.target).toBe('spaced');
  });

  it('rewrites [[Old]] → [[New]] preserving aliases and ignoring non-matches', () => {
    const src = '[[Old]] [[Old|rename]] [[Older]] [[old.md]]';
    const { content, changed } = rewriteWikilinks(src, 'Old', 'New');
    expect(changed).toBe(3);
    expect(content).toBe('[[New]] [[New|rename]] [[Older]] [[New]]');
  });

  it('rewrite is case-insensitive on the target name', () => {
    const src = '[[old]] [[OLD]] [[new]]';
    const { content, changed } = rewriteWikilinks(src, 'Old', 'Fresh');
    expect(changed).toBe(2);
    expect(content).toBe('[[Fresh]] [[Fresh]] [[new]]');
  });
});
