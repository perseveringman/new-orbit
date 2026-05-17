import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewRunDetail } from '../src/shared/review';
import { ReviewContent } from '../src/renderer/src/views/ReviewView';

describe('ReviewContent', () => {
  it('renders empty state guidance', () => {
    const html = renderToStaticMarkup(baseElement({ state: 'empty' }));

    expect(html).toContain('暂无复盘记录');
    expect(html).toContain('立即复盘');
  });

  it('renders findings and actions', () => {
    const html = renderToStaticMarkup(
      baseElement({ state: 'success', runs: [sampleDetail().run], detail: sampleDetail() })
    );

    expect(html).toContain('把未闭环的事变成下一步');
    expect(html).toContain('有笔记还没有归属领域');
    expect(html).toContain('笔记归属');
    expect(html).toContain('工作线索');
    expect(html).toContain('最近值得接住的线索');
    expect(html).toContain('可行动事项');
    expect(html).toContain('这次先略过');
    expect(html).toContain('我知道了');
  });

  it('shows analysis progress while generating a review', () => {
    const html = renderToStaticMarkup(baseElement({ state: 'loading', generating: true }));

    expect(html).toContain('正在生成行动复盘');
    expect(html).toContain('读取最近的项目、任务和笔记');
    expect(html).toContain('复盘中');
  });
});

function baseElement(
  overrides: Partial<Parameters<typeof ReviewContent>[0]> = {}
): ReturnType<typeof createElement> {
  return createElement(ReviewContent, {
    tab: 'weekly',
    runs: [],
    detail: null,
    state: 'success',
    error: null,
    generating: false,
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
        suggested_actions: [
          { id: 'action-1', kind: 'ignore', description: 'Ignore', executed: false }
        ]
      }
    ]
  };
}
