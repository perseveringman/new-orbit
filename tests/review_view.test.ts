import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewRunDetail } from '../src/shared/review';
import { ReviewContent } from '../src/renderer/src/views/ReviewView';

describe('ReviewContent', () => {
  it('renders empty state guidance', () => {
    const html = renderToStaticMarkup(baseElement({ state: 'empty' }));

    expect(html).toContain('No review runs yet');
    expect(html).toContain('Run review now');
  });

  it('renders findings and actions', () => {
    const html = renderToStaticMarkup(baseElement({ state: 'success', runs: [sampleDetail().run], detail: sampleDetail() }));

    expect(html).toContain('Find stale, unassigned, and dormant work');
    expect(html).toContain('Unassigned notes');
    expect(html).toContain('Personal Memory Intelligence');
    expect(html).toContain('当前工作上下文');
    expect(html).toContain('Acknowledge');
  });
});

function baseElement(overrides: Partial<Parameters<typeof ReviewContent>[0]> = {}): ReturnType<typeof createElement> {
  return createElement(ReviewContent, {
    tab: 'weekly',
    runs: [],
    detail: null,
    state: 'success',
    error: null,
    onTab: vi.fn(),
    onTrigger: vi.fn(),
    onReload: vi.fn(),
    onAcknowledge: vi.fn(),
    onExecute: vi.fn(),
    ...overrides
  });
}

function sampleDetail(): ReviewRunDetail {
  return {
    run: {
      id: 'review-1',
      kind: 'weekly',
      period: { from: '2026-04-24T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' },
      status: 'generated',
      created_at: '2026-04-30T00:00:00.000Z'
    },
    artifact: {
      id: 'synth-review-1',
      kind: 'review.weekly',
      scope_key: 'review:weekly:2026-04-24:global',
      sources: [],
      provenance: {
        runtime: 'local:heuristic',
        model: 'orbit-review-discovery',
        prompt_version: 'review.weekly.v1',
        generated_at: '2026-04-30T00:00:00.000Z'
      },
      payload: {
        pmil: {
          current_focus: 'PMIL, Ask Anywhere',
          active_threads: [
            {
              title: 'Ask context',
              summary: 'PMIL context packet is being connected to Ask Anywhere.',
              confidence: 0.75,
              likely_next_steps: ['Expose evidence drill-down.']
            }
          ],
          open_loops: [
            {
              title: 'Expose evidence drill-down',
              kind: 'task_candidate',
              severity: 'suggestion',
              rationale: 'Evidence selectors should be inspectable.'
            }
          ]
        }
      },
      status: 'fresh',
      created_at: '2026-04-30T00:00:00.000Z'
    },
    findings: [
      {
        id: 'finding-1',
        review_run_id: 'review-1',
        severity: 'suggestion',
        category: 'unassigned-note',
        title: 'Unassigned notes',
        rationale: 'Notes need Area assignment.',
        suggested_actions: [{ id: 'action-1', kind: 'ignore', description: 'Ignore', executed: false }]
      }
    ]
  };
}
