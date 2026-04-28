import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TraceableEvent } from '../src/shared/events';
import { configureEventReplay, currentEventReplayStore } from '../src/main/events/bus';
import { createTimelineStore } from '../src/main/timeline/store';

let vault: string;

beforeEach(async () => {
  vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-timeline-'));
  configureEventReplay(vault);
});

afterEach(async () => {
  configureEventReplay(null);
  await rm(vault, { recursive: true, force: true });
});

describe('TimelineStore Phase 6.4 projection', () => {
  it('projects Layer 1 events, hides Layer 0/3 noise, and aggregates related saves', async () => {
    await appendEvents([
      event('note-1', '2026-04-28T10:00:00.000Z', 'note.updated', {
        note_id: 'note-a',
        type: 'longform',
        title: 'Orbit essay',
        word_delta: 120,
        resource_refs: ['second-brain']
      }),
      event('note-2', '2026-04-28T10:05:00.000Z', 'note.updated', {
        note_id: 'note-a',
        type: 'longform',
        title: 'Orbit essay',
        word_delta: 80
      }),
      event('feed-fetch', '2026-04-28T10:10:00.000Z', 'feed.items.fetched', { source_id: 'rss', fetched: 2, created: 2 }),
      event('feed-save', '2026-04-28T10:20:00.000Z', 'feed.item.saved_to_library', {
        item_id: 'feed-a',
        library_item_id: 'lib-a',
        title: 'Layering article'
      }),
      event('agent-done', '2026-04-28T10:30:00.000Z', 'agent.run.completed', { runId: 'run-a' })
    ]);

    const timeline = await createTimelineStore(vault).getDay('2026-04-28');

    expect(timeline.entries.map((entry) => entry.event_kind)).toEqual(['note.updated', 'feed.item.saved_to_library']);
    expect(timeline.entries[0]).toMatchObject({
      title: 'Updated longform (2 saves)',
      summary: '+200 words across aggregated saves',
      derived_from: ['note-2']
    });
    expect(timeline.stats.total_events).toBe(3);
    expect(timeline.stats.longforms_words).toBe(200);
    expect(timeline.stats.resources_touched).toEqual(['second-brain']);
    expect(timeline.segments?.[0]?.label).toBe('Morning');
  });

  it('shows Layer 2 only in developer mode and keeps raw feed fetch hidden', async () => {
    await appendEvents([
      event('agent-started', '2026-04-28T09:00:00.000Z', 'agent.run.started', { runId: 'run-a', runtime: { kind: 'cli', id: 'test' } }),
      event('feed-fetch', '2026-04-28T09:05:00.000Z', 'feed.items.fetched', { source_id: 'rss', fetched: 1, created: 1 })
    ]);

    expect((await createTimelineStore(vault).getDay('2026-04-28')).entries).toEqual([]);
    const devEntries = (await createTimelineStore(vault).getDay('2026-04-28', true)).entries;
    expect(devEntries).toHaveLength(1);
    expect(devEntries[0]).toMatchObject({ event_kind: 'agent.run.started', layer: 2 });
  });

  it('builds week/month/year views and exports a PDF file', async () => {
    await appendEvents([
      event('note-1', '2026-04-28T09:00:00.000Z', 'note.created', { note_id: 'n1', type: 'thought', title: 'Morning idea', path: 'notes/thoughts/morning.md' }),
      event('library-1', '2026-04-29T09:00:00.000Z', 'library.item.added', { item_id: 'lib-a', title: 'Article' })
    ]);
    const store = createTimelineStore(vault);

    const week = await store.getWeek('2026-W18');
    const month = await store.getMonthlyIndex('2026-04');
    const year = await store.getYearlyIndex(2026);
    const exported = await store.exportPDF({ kind: 'day', value: '2026-04-28' });

    expect(week.stats.total_events).toBe(2);
    expect(month.days.find((day) => day.date === '2026-04-28')?.entry_count).toBe(1);
    expect(year.months.find((item) => item.month === '2026-04')?.days_active).toBe(2);
    expect(exported.path.endsWith('.pdf')).toBe(true);
    expect(await readFile(exported.path, 'utf8')).toContain('%PDF-1.4');
  });

  it('generates a daily summary artifact and materialized daily-summary note on explicit action', async () => {
    await appendEvents([
      event('note-1', '2026-04-28T09:00:00.000Z', 'note.created', { note_id: 'n1', type: 'thought', title: 'Summary input', path: 'notes/thoughts/input.md' })
    ]);

    const summary = await createTimelineStore(vault).generateDailySummary('2026-04-28');

    expect(summary).toMatchObject({ headline: '1 meaningful events', status: 'fresh' });
    expect(summary.synthesis_ref).toBeTruthy();
    expect(summary.note_path).toMatch(/notes\/daily-summaries\/.+\.md/);
  });
});

async function appendEvents(events: TraceableEvent[]): Promise<void> {
  const store = currentEventReplayStore();
  if (!store) throw new Error('event store not configured');
  for (const item of events) await store.append(item);
}

function event(id: string, at: string, kind: TraceableEvent['kind'], payload: TraceableEvent['payload']): TraceableEvent {
  if (!kind) throw new Error('kind required');
  return {
    id,
    at,
    source: 'activity',
    type: kind,
    kind,
    traceId: `trace-${id}`,
    spanId: `span-${id}`,
    summary: id,
    payload
  };
}
