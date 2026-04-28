import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AreaDashboardData } from '../src/shared/area';
import { AreaDashboardContent } from '../src/renderer/src/views/AreaOverview';

describe('AreaDashboardContent', () => {
  it('renders dashboard cards, radar, reviews, and unassigned queue actions', () => {
    const html = renderToStaticMarkup(
      createElement(AreaDashboardContent, {
        dashboard: sampleDashboard(),
        suggestions: {
          'note:note-2': [
            {
              entity: { kind: 'note', id: 'note-2', title: 'Unassigned systems note' },
              area_slug: 'systems',
              confidence: 0.81,
              reason: 'Matched systems in title/body/tags.',
              synthesis_ref: 'synth-1'
            }
          ]
        },
        busyEntity: null,
        scopedChatMessage: 'Area-scoped chat ready',
        error: null,
        onSuggest: vi.fn(),
        onAssign: vi.fn(),
        onOpenScopedChat: vi.fn(),
        onCreateProject: vi.fn(),
        onOpenRoom: vi.fn()
      })
    );

    expect(html).toContain('Area Dashboard');
    expect(html).toContain('Health signals');
    expect(html).toContain('Active projects (1)');
    expect(html).toContain('Feed radar');
    expect(html).toContain('Scheduled reviews');
    expect(html).toContain('Unassigned queue (1)');
    expect(html).toContain('Assign to systems');
    expect(html).toContain('Area-scoped chat ready');
  });
});

function sampleDashboard(): AreaDashboardData {
  return {
    area: {
      uid: 'area-1',
      slug: 'systems',
      name: 'Systems',
      description: 'Long-term systems area.',
      status: 'active',
      tags: ['systems'],
      created_at: '2026-04-28T00:00:00.000Z',
      updated_at: '2026-04-28T00:00:00.000Z'
    },
    health: {
      score: 78,
      state: 'healthy',
      reasons: ['1 active project(s)', 'scheduled review exists']
    },
    active_projects: [
      {
        uid: 'project-1',
        slug: 'ops',
        name: 'Ops',
        status: 'active',
        relPath: '01_Projects/ops',
        task_count: 2
      }
    ],
    resources: [
      {
        frontmatter: {
          id: 'resource-1',
          type: 'resource',
          title: 'Systems',
          slug: 'systems',
          status: 'active',
          depth: 'exploring',
          created: '2026-04-28T00:00:00.000Z',
          updated: '2026-04-28T00:00:00.000Z',
          engagement_count: 1,
          tags: ['systems']
        },
        path: 'resources/systems/index.md',
        counts: {
          canonical: 0,
          distilled: 0,
          related: 0,
          people: 0,
          projects_touched: 0,
          timeline: 1
        }
      }
    ],
    recent_notes: [
      {
        frontmatter: {
          id: 'note-1',
          type: 'thought',
          title: 'Systems note',
          created: '2026-04-28T00:00:00.000Z',
          updated: '2026-04-28T00:00:00.000Z',
          para_kind: 'floating',
          tags: [],
          links_out: [],
          backlinks: []
        },
        body: '# Systems note',
        path: 'notes/thoughts/systems.md'
      }
    ],
    library_items: [],
    feed_sources: [
      {
        id: 'feed-1',
        title: 'Systems feed',
        url: 'https://example.com/feed.xml',
        kind: 'rss',
        enabled: true,
        added_at: '2026-04-28T00:00:00.000Z'
      }
    ],
    scheduled_reviews: [
      {
        id: 'scheduled-1',
        name: 'Area weekly review',
        schedule: { kind: 'weekly', day_of_week: [1], time: '09:00' },
        action: { kind: 'ask_anywhere', prompt: 'Review systems' },
        status: 'active',
        created_at: '2026-04-28T00:00:00.000Z',
        updated_at: '2026-04-28T00:00:00.000Z',
        source: 'system',
        total_runs: 0,
        success_runs: 0,
        failure_runs: 0,
        tags: ['area', 'review']
      }
    ],
    open_tasks: [],
    stats: {
      active_projects: 1,
      open_tasks: 2,
      resources: 1,
      recent_notes: 1,
      library_items: 0,
      feed_sources: 1,
      scheduled_reviews: 1,
      unassigned_candidates: 1
    },
    synthesis: null,
    unassigned_queue: [{ kind: 'note', id: 'note-2', title: 'Unassigned systems note' }]
  };
}
