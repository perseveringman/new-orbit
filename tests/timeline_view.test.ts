import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  DailyTimeline,
  MonthlyIndex,
  WeeklyTimeline,
  YearlyIndex
} from '../src/shared/timeline';
import type { SynthesisArtifact } from '../src/shared/synthesis';
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
        summaryArtifact: sampleArtifact(),
        onSummarize: vi.fn()
      })
    );

    expect(html).toContain('今日完成清单');
    expect(html).toContain('完成记录');
    expect(html).toContain('AI 每日复盘');
    expect(html).toContain('完成清单');
    expect(html).toContain('主线推进');
    expect(html).toContain('17:00');
    expect(html).toContain('合并了 1 条相关记录');
    expect(html).toContain('second-brain');
  });

  it('shows analysis progress while generating a daily summary', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineContent, {
        mode: 'day',
        day: sampleDay(),
        week: null,
        month: null,
        year: null,
        summaryArtifact: sampleArtifact(),
        summarizing: true,
        onSummarize: vi.fn()
      })
    );

    expect(html).toContain('正在生成每日复盘');
    expect(html).toContain('读取这一天留下的时间线记录');
    expect(html).toContain('复盘中');
  });

  it('renders week, month, year, and quiet day states', () => {
    expect(
      renderToStaticMarkup(
        createElement(TimelineContent, {
          mode: 'week',
          day: null,
          week: sampleWeek(),
          month: null,
          year: null
        })
      )
    ).toContain('第 2026-W18 周');
    expect(
      renderToStaticMarkup(
        createElement(TimelineContent, {
          mode: 'month',
          day: null,
          week: null,
          month: sampleMonth(),
          year: null
        })
      )
    ).toContain('2026-04 月');
    expect(
      renderToStaticMarkup(
        createElement(TimelineContent, {
          mode: 'year',
          day: null,
          week: null,
          month: null,
          year: sampleYear()
        })
      )
    ).toContain('2026 年');
    expect(
      renderToStaticMarkup(
        createElement(TimelineContent, {
          mode: 'day',
          day: {
            ...sampleDay(),
            entries: [],
            segments: [],
            stats: { ...sampleDay().stats, total_events: 0 }
          },
          week: null,
          month: null,
          year: null
        })
      )
    ).toContain('安静的一天');
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
        title: '完成记录',
        summary: '捕获了一个想法',
        refs: [{ kind: 'resource', ref: 'second-brain', label: 'second-brain' }],
        derived_from: ['event-0']
      }
    ],
    segments: [
      {
        id: 'morning',
        label: '上午',
        range: '06:00-12:00',
        entries: [
          {
            event_id: 'event-1',
            event_kind: 'note.created',
            occurred_at: '2026-04-28T09:00:00.000Z',
            layer: 1,
            icon: '💭',
            title: '完成记录',
            summary: '捕获了一个想法',
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
      narrative: 'You captured a useful thought.',
      source_count: 1,
      runtime: 'sdk:anthropic',
      model: 'claude-test',
      prompt_version: 'summary.daily.v2'
    }
  };
}

function sampleArtifact(): SynthesisArtifact {
  return {
    id: 'syn-1',
    kind: 'summary.daily',
    scope_key: 'daily:2026-04-28',
    sources: [{ kind: 'timeline_range', ref: '2026-04-28' }],
    provenance: {
      runtime: 'sdk:anthropic',
      model: 'claude-test',
      prompt_version: 'summary.daily.v2',
      generated_at: '2026-04-28T20:00:00.000Z'
    },
    payload: {
      headline: 'Thinking day',
      narrative: 'You captured a useful thought.',
      highlights: ['捕获了一个想法'],
      done_list: [{ text: '捕获了一个想法', evidence_ids: ['event-1:1'] }],
      main_threads: [{ title: '想法沉淀', summary: '围绕 second-brain 留下了一条记录。', evidence_ids: ['event-1:1'] }],
      open_loops: [],
      tomorrow: [],
      coverage: { evidence_count: 1, included_kinds: ['note.created'], omitted_count: 0 }
    },
    status: 'fresh',
    created_at: '2026-04-28T20:00:00.000Z'
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
    days: [
      {
        date: '2026-04-28',
        entry_count: 1,
        highlight_kinds: ['note.created'],
        summary_headline: 'Thinking day'
      }
    ]
  };
}

function sampleYear(): YearlyIndex {
  return {
    year: 2026,
    months: [{ month: '2026-04', total_events: 1, days_active: 1 }]
  };
}
