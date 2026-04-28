import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DailyTimeline, MonthlyIndex, WeeklyTimeline, YearlyIndex } from '../src/shared/timeline';
import { TimelineContent } from '../src/renderer/src/views/TimelineView';

describe('TimelineContent', () => {
  it('renders day glance, summary, entries, refs, and derived relation hints', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineContent, {
        mode: 'day',
        day: sampleDay(),
        week: null,
        month: null,
        year: null,
        summaryArtifact: null,
        onSummarize: vi.fn()
      })
    );

    expect(html).toContain('Today at a glance');
    expect(html).toContain('Layer 1 event');
    expect(html).toContain('AI Daily Summary');
    expect(html).toContain('related events: 1');
    expect(html).toContain('second-brain');
  });

  it('renders week, month, year, and quiet day states', () => {
    expect(renderToStaticMarkup(createElement(TimelineContent, { mode: 'week', day: null, week: sampleWeek(), month: null, year: null }))).toContain('Week 2026-W18');
    expect(renderToStaticMarkup(createElement(TimelineContent, { mode: 'month', day: null, week: null, month: sampleMonth(), year: null }))).toContain('Month 2026-04');
    expect(renderToStaticMarkup(createElement(TimelineContent, { mode: 'year', day: null, week: null, month: null, year: sampleYear() }))).toContain('Year 2026');
    expect(renderToStaticMarkup(createElement(TimelineContent, { mode: 'day', day: { ...sampleDay(), entries: [], segments: [], stats: { ...sampleDay().stats, total_events: 0 } }, week: null, month: null, year: null }))).toContain('Quiet day');
  });
});

function sampleDay(): DailyTimeline {
  return {
    date: '2026-04-28',
    entries: [
      {
        event_id: 'event-1',
        event_kind: 'note.created',
        occurred_at: '2026-04-28T09:00:00.000Z',
        layer: 1,
        icon: '💭',
        title: 'Layer 1 event',
        summary: 'Captured a thought',
        refs: [{ kind: 'resource', ref: 'second-brain', label: 'second-brain' }],
        derived_from: ['event-0']
      }
    ],
    segments: [
      {
        id: 'morning',
        label: 'Morning',
        range: '06:00-12:00',
        entries: [
          {
            event_id: 'event-1',
            event_kind: 'note.created',
            occurred_at: '2026-04-28T09:00:00.000Z',
            layer: 1,
            icon: '💭',
            title: 'Layer 1 event',
            summary: 'Captured a thought',
            refs: [{ kind: 'resource', ref: 'second-brain', label: 'second-brain' }],
            derived_from: ['event-0']
          }
        ]
      }
    ],
    stats: {
      total_events: 1,
      thoughts_count: 1,
      longforms_wrote: 0,
      longforms_words: 0,
      library_added: 0,
      library_read: 0,
      tasks_completed: 0,
      projects_touched: [],
      areas_touched: [],
      resources_touched: ['second-brain'],
      conversations_count: 0
    },
    summary: {
      generated_at: '2026-04-28T20:00:00.000Z',
      note_path: 'notes/daily-summaries/2026-04-28.md',
      headline: 'Thinking day',
      narrative: 'You captured a useful thought.'
    }
  };
}

function sampleWeek(): WeeklyTimeline {
  return {
    iso_week: '2026-W18',
    range: { from: '2026-04-27', to: '2026-05-03' },
    days: [sampleDay()],
    stats: sampleDay().stats
  };
}

function sampleMonth(): MonthlyIndex {
  return {
    month: '2026-04',
    days: [{ date: '2026-04-28', entry_count: 1, highlight_kinds: ['note.created'], summary_headline: 'Thinking day' }]
  };
}

function sampleYear(): YearlyIndex {
  return {
    year: 2026,
    months: [{ month: '2026-04', total_events: 1, days_active: 1 }]
  };
}
