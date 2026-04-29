import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VisionContent } from '../src/renderer/src/views/VisionView';

describe('VisionContent', () => {
  it('renders empty state guidance', () => {
    const html = renderToStaticMarkup(baseElement({ state: 'empty' }));
    expect(html).toContain('No structured goals yet');
    expect(html).toContain('Create goal');
  });

  it('renders goals, alignment, and drift', () => {
    const html = renderToStaticMarkup(baseElement({
      state: 'success',
      goals: [{
        id: 'goal-1',
        title: 'Write more',
        horizon: 'quarter',
        description: 'Publish essays',
        area_refs: ['writing'],
        status: 'active',
        priority: 80,
        created_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z'
      }],
      alignment: [{ goal_id: 'goal-1', alignment_score: 25, evidence: { active_projects: 1, completed_projects: 0, resources_touched: 0, notes_count: 0, time_spent_hours: 0 } }],
      drift: [{ goal_id: 'goal-1', area_slug: 'writing', drift_type: 'neglect', severity: 'high', rationale: 'Low writing activity.', suggested_action: 'Create writing task.' }]
    }));

    expect(html).toContain('Goals, alignment, and drift');
    expect(html).toContain('Write more');
    expect(html).toContain('Low writing activity.');
  });
});

function baseElement(overrides: Partial<Parameters<typeof VisionContent>[0]> = {}): ReturnType<typeof createElement> {
  return createElement(VisionContent, {
    goals: [],
    alignment: [],
    drift: [],
    state: 'success',
    error: null,
    onCreate: vi.fn(),
    onReview: vi.fn(),
    onReload: vi.fn(),
    ...overrides
  });
}
