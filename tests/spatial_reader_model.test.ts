import type { LibraryItem } from '@shared/library';
import { getLibraryReaderKind, readerKindLabel } from '../src/renderer/src/components/spatial-reader/reader-model';
import { describe, expect, it } from 'vitest';

function makeItem(overrides: Partial<LibraryItem['frontmatter']>, body = ''): LibraryItem {
  return {
    path: `library/articles/${overrides.id ?? 'item'}.md`,
    body,
    frontmatter: {
      id: overrides.id ?? 'item',
      kind: overrides.kind ?? 'article',
      title: overrides.title ?? 'Untitled',
      status: overrides.status ?? 'saved',
      created: '2026-05-28T00:00:00.000Z',
      updated: '2026-05-28T00:00:00.000Z',
      tags: [],
      ...overrides
    }
  };
}

describe('spatial reader model', () => {
  it('infers rich reader kinds from source metadata and body conventions', () => {
    expect(getLibraryReaderKind(makeItem({ local_path: '/tmp/research.pdf' }))).toBe('pdf');
    expect(getLibraryReaderKind(makeItem({ local_path: '/tmp/book.epub' }))).toBe('epub');
    expect(getLibraryReaderKind(makeItem({ local_path: '/tmp/note.markdown' }))).toBe('markdown');
    expect(getLibraryReaderKind(makeItem({ url: 'https://www.youtube.com/watch?v=abc123' }))).toBe('video');
    expect(getLibraryReaderKind(makeItem({ local_path: '/tmp/interview.mp3' }))).toBe('podcast');
    expect(getLibraryReaderKind(makeItem({ source: { kind: 'manual', provider: 'podwise' } }))).toBe('podcast');
    expect(getLibraryReaderKind(makeItem({}, '## Transcript\n\n[Host] `12000` hello'))).toBe('podcast');
  });

  it('uses Chinese labels for every rich reader kind', () => {
    expect(readerKindLabel('markdown')).toBe('Markdown 阅读器');
    expect(readerKindLabel('pdf')).toBe('PDF 阅读器');
    expect(readerKindLabel('epub')).toBe('EPUB 阅读器');
    expect(readerKindLabel('video')).toBe('视频阅读器');
    expect(readerKindLabel('podcast')).toBe('播客阅读器');
  });
});
