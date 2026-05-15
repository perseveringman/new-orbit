import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
        status: { total_docs: 0, indexed_docs: 0, stale_docs: 0, embedding_model: 'local', embedding_dimensions: 384 },
        results: [],
        memoryRecall: null,
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

    expect(html).toContain('No matching documents yet');
    expect(html).toContain('Rebuild index');
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
        status: { total_docs: 1, indexed_docs: 0, stale_docs: 1, embedding_model: 'local', embedding_dimensions: 384 },
        results: [sampleResult()],
        memoryRecall: sampleRecall(),
        answer: {
          id: 'synth-1',
          kind: 'search.answer',
          scope_key: 'search.answer:test',
          sources: [],
          provenance: { runtime: 'local:heuristic', model: 'local', prompt_version: 'search.answer.v1', generated_at: '2026-04-30T00:00:00.000Z' },
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

    expect(html).toContain('Stale');
    expect(html).toContain('AI synthesis answer');
    expect(html).toContain('Recalled memory');
    expect(html).toContain('Memory preference');
    expect(html).toContain('Helpful');
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
