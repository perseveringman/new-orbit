import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ContextPacket } from '../src/shared/context';
import type { RecallResult } from '../src/shared/memory';
import type { SearchResult } from '../src/shared/semantic';
import { SearchContent } from '../src/renderer/src/views/SearchView';

describe('SearchContent', () => {
  it('renders the empty state with guidance and rebuild action', () => {
    const html = renderToStaticMarkup(
      createElement(SearchContent, {
        text: '',
        mode: 'hybrid',
        kind: 'all',
        layer: 'all',
        area: '',
        dateFrom: '',
        dateTo: '',
        status: {
          total_docs: 0,
          indexed_docs: 0,
          stale_docs: 0,
          embedding_model: 'local',
          embedding_dimensions: 384
        },
        results: [],
        memoryRecall: null,
        contextPacket: null,
        answer: null,
        state: 'empty',
        error: null,
        setText: vi.fn(),
        setMode: vi.fn(),
        setKind: vi.fn(),
        setLayer: vi.fn(),
        setArea: vi.fn(),
        setDateFrom: vi.fn(),
        setDateTo: vi.fn(),
        onRebuild: vi.fn(),
        onAnswer: vi.fn(),
        onAsk: vi.fn(),
        onMemoryFeedback: vi.fn()
      })
    );

    expect(html).toContain('暂无匹配文档');
    expect(html).toContain('重建索引');
  });

  it('renders stale status, synthesis answer, and Layer labels', () => {
    const html = renderToStaticMarkup(
      createElement(SearchContent, {
        text: 'memory',
        mode: 'hybrid',
        kind: 'all',
        layer: 'all',
        area: '',
        dateFrom: '',
        dateTo: '',
        status: {
          total_docs: 1,
          indexed_docs: 0,
          stale_docs: 1,
          embedding_model: 'local',
          embedding_dimensions: 384
        },
        results: [sampleResult()],
        memoryRecall: sampleRecall(),
        contextPacket: sampleContextPacket(),
        answer: {
          id: 'synth-1',
          kind: 'search.answer',
          scope_key: 'search.answer:test',
          sources: [],
          provenance: {
            runtime: 'local:heuristic',
            model: 'local',
            prompt_version: 'search.answer.v1',
            generated_at: '2026-04-30T00:00:00.000Z'
          },
          payload: { answer: 'Memory appears in one note.', citations: [], confidence: 0.5 },
          status: 'fresh',
          created_at: '2026-04-30T00:00:00.000Z'
        },
        state: 'success',
        error: null,
        setText: vi.fn(),
        setMode: vi.fn(),
        setKind: vi.fn(),
        setLayer: vi.fn(),
        setArea: vi.fn(),
        setDateFrom: vi.fn(),
        setDateTo: vi.fn(),
        onRebuild: vi.fn(),
        onAnswer: vi.fn(),
        onAsk: vi.fn(),
        onMemoryFeedback: vi.fn()
      })
    );

    expect(html).toContain('已过期');
    expect(html).toContain('AI 合成答案');
    expect(html).toContain('PMIL 上下文包');
    expect(html).toContain('Personal QA');
    expect(html).toContain('GraphRAG improves recall');
    expect(html).toContain('打开来源');
    expect(html).toContain('召回记忆');
    expect(html).toContain('Memory preference');
    expect(html).toContain('有帮助');
    expect(html).toContain('Layer 1');
    expect(html).toContain('Memory appears in one note.');
  });
});

function sampleResult(): SearchResult {
  return {
    doc: {
      id: 'note:1',
      entity_kind: 'note',
      entity_ref: '1',
      title: 'Memory note',
      content: 'Stable memory recall',
      layer: 1,
      layer_label: 'truth',
      updated_at: '2026-04-30T00:00:00.000Z'
    },
    score: 0.9,
    match_type: 'both',
    snippets: ['Stable memory recall'],
    entity_label: 'note · Layer 1',
    why: 'keyword 1.00 + semantic 0.80'
  };
}

function sampleContextPacket(): ContextPacket {
  return {
    id: 'ctx-1',
    purpose: 'ask',
    scope: { kind: 'global' },
    query: 'memory',
    generated_at: '2026-04-30T00:00:00.000Z',
    freshness: { evidence_until: '2026-04-30T00:00:00.000Z', stale_sources: [] },
    budget: { max_tokens: 1800, estimated_tokens: 80 },
    sections: [
      {
        kind: 'synthesis',
        title: 'Personal QA',
        content: 'GraphRAG improves recall by connecting evidence chunks, QA, and graph neighbors.',
        citations: [
          {
            source_id: 'evidence:note:1',
            kind: 'semantic_chunk',
            content_view: 'safe_projection'
          }
        ],
        priority: 25
      }
    ],
    evidence: [
      {
        source_id: 'evidence:note:1',
        kind: 'semantic_chunk',
        content_view: 'safe_projection'
      }
    ],
    synthesis_refs: ['synth-qa-1'],
    memory_refs: []
  };
}

function sampleRecall(): RecallResult {
  return {
    explanation: 'Recalled 1 memory item.',
    memories: [
      {
        id: 'mem-1',
        layer: 'semantic',
        kind: 'preference',
        title: 'Memory preference',
        summary: 'User prefers transparent memory.',
        sources: [],
        evidence_count: 2,
        confidence: 0.7,
        stability: 'stable',
        recall_count: 1,
        created_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z'
      }
    ],
    matches: [
      {
        memory_id: 'mem-1',
        score: 0.82,
        matched_terms: ['memory'],
        signals: {
          keyword_overlap: 1,
          entity_overlap: 0,
          confidence: 0.7,
          stability_boost: 0.15,
          recall_boost: 0.02,
          layer_boost: 0
        },
        reasons: ['matched terms: memory', 'stable memory']
      }
    ]
  };
}
