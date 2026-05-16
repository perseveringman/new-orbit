import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryNode } from '../src/shared/memory';
import { MemoryContent } from '../src/renderer/src/views/MemoryView';

describe('MemoryContent', () => {
  it('renders empty guidance', () => {
    const html = renderToStaticMarkup(baseElement({ nodes: [], state: 'empty' }));

    expect(html).toContain('暂无记忆');
    expect(html).toContain('开始一次随处问对话');
  });

  it('renders memory stats and actions', () => {
    const html = renderToStaticMarkup(baseElement({ nodes: [sampleMemory()], state: 'success' }));

    expect(html).toContain('透明的长期记忆');
    expect(html).toContain('Read source first');
    expect(html).toContain('记忆图谱');
    expect(html).toContain('本地 Agent 会话中心');
    expect(html).toContain('保存为笔记');
    expect(html).toContain('转为 Orbit 会话');
    expect(html).toContain('实体画像');
    expect(html).toContain('来源证据');
    expect(html).toContain('查看证据');
    expect(html).toContain('不相关');
    expect(html).toContain('提升为 Resource');
    expect(html).toContain('语义');
    expect(html).toContain('稳定');
  });
});

function baseElement(
  overrides: Partial<Parameters<typeof MemoryContent>[0]> = {}
): ReturnType<typeof createElement> {
  return createElement(MemoryContent, {
    kind: 'all',
    layer: 'all',
    nodes: [],
    graph: {
      nodes: [],
      relations: [],
      generated_at: '2026-04-30T00:00:00.000Z'
    },
    state: 'success',
    error: null,
    digest: null,
    onKindChange: vi.fn(),
    onLayerChange: vi.fn(),
    onReload: vi.fn(),
    onCreate: vi.fn(),
    onArchive: vi.fn(),
    onConfirm: vi.fn(),
    onDigest: vi.fn(),
    onFeedback: vi.fn(),
    onPromote: vi.fn(),
    ...overrides
  });
}

function sampleMemory(): MemoryNode {
  return {
    id: 'mem-1',
    layer: 'semantic',
    kind: 'preference',
    title: 'Read source first',
    summary: 'User prefers reading source before docs.',
    sources: [
      {
        kind: 'note',
        ref: 'note-1',
        title: 'Source note',
        excerpt: 'User prefers reading source before docs.'
      }
    ],
    evidence_count: 3,
    confidence: 0.8,
    stability: 'stable',
    recall_count: 2,
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z'
  };
}
