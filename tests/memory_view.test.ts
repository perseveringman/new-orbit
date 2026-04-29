import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryNode } from '../src/shared/memory';
import { MemoryContent } from '../src/renderer/src/views/MemoryView';

describe('MemoryContent', () => {
  it('renders empty guidance', () => {
    const html = renderToStaticMarkup(baseElement({ nodes: [], state: 'empty' }));

    expect(html).toContain('No memories yet');
    expect(html).toContain('Start an Ask-Anywhere conversation');
  });

  it('renders memory stats and actions', () => {
    const html = renderToStaticMarkup(baseElement({ nodes: [sampleMemory()], state: 'success' }));

    expect(html).toContain('Transparent long-term memory');
    expect(html).toContain('Read source first');
    expect(html).toContain('Promote to Resource');
    expect(html).toContain('Stable');
  });
});

function baseElement(overrides: Partial<Parameters<typeof MemoryContent>[0]> = {}): ReturnType<typeof createElement> {
  return createElement(MemoryContent, {
    kind: 'all',
    nodes: [],
    state: 'success',
    error: null,
    digest: null,
    onKindChange: vi.fn(),
    onReload: vi.fn(),
    onCreate: vi.fn(),
    onArchive: vi.fn(),
    onConfirm: vi.fn(),
    onDigest: vi.fn(),
    onPromote: vi.fn(),
    ...overrides
  });
}

function sampleMemory(): MemoryNode {
  return {
    id: 'mem-1',
    kind: 'preference',
    title: 'Read source first',
    summary: 'User prefers reading source before docs.',
    sources: [],
    evidence_count: 3,
    confidence: 0.8,
    stability: 'stable',
    recall_count: 2,
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z'
  };
}
