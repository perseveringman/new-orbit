import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TraceableEvent } from '../src/shared/events';
import type { RuntimeRouteDecision } from '../src/shared/runtime';
import { configureEventReplay, currentEventReplayStore } from '../src/main/events/bus';
import { createNoteStore } from '../src/main/note/store';
import { createTimelineStore } from '../src/main/timeline/store';
import type { SynthesisRuntimeRouter } from '../src/main/synthesis/runner';

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
      title: '持续写作（2 次保存）',
      summary: '累计新增 200 字',
      derived_from: ['note-2']
    });
    expect(timeline.stats.total_events).toBe(3);
    expect(timeline.stats.longforms_words).toBe(200);
    expect(timeline.stats.resources_touched).toEqual(['second-brain']);
    expect(timeline.segments?.[0]?.label).toBe('晚上');
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

  it('refuses to generate a fake daily summary when no AI endpoint is available', async () => {
    await appendEvents([
      event('note-1', '2026-04-28T09:00:00.000Z', 'note.created', { note_id: 'n1', type: 'thought', title: 'Summary input', path: 'notes/thoughts/input.md' })
    ]);

    await expect(createTimelineStore(vault).generateDailySummary('2026-04-28')).rejects.toThrow('daily_summary_ai_unavailable');
  });

  it('generates a real daily summary artifact and materialized daily-summary note on explicit action', async () => {
    const note = await createNoteStore(vault).create({
      type: 'thought',
      title: 'Summary input',
      body: '今天想明白了 Timeline 应该是 done list，而不是系统日志。'
    });
    await appendEvents([
      event('note-1', '2026-04-28T09:00:00.000Z', 'note.created', { note_id: note.frontmatter.id, type: 'thought', title: 'Summary input', path: note.path })
    ]);

    let promptText = '';
    const router: SynthesisRuntimeRouter = {
      decide: async (): Promise<RuntimeRouteDecision> => ({
        mode: 'synthesis',
        track: 'sdk',
        runtime: 'sdk:anthropic',
        endpointId: 'anthropic',
        model: 'claude-test',
        reason: 'test'
      }),
      stream: async (input) => {
        promptText = String(input.messages[0]?.content ?? '');
        return {
          text: JSON.stringify({
            headline: '真实复盘',
            narrative: '今天沉淀了一条可复盘的想法。',
            highlights: ['捕获了 Summary input'],
            done_list: [{ text: '捕获了 Summary input', evidence_ids: ['note-1:1'] }],
            main_threads: [{ title: '想法沉淀', summary: '当天围绕 Summary input 留下了记录。', evidence_ids: ['note-1:1'] }],
            open_loops: [],
            tomorrow: [],
            coverage: { evidence_count: 1, included_kinds: ['note.created'], omitted_count: 0 }
          }),
          eventIds: [],
          inputTokens: 100,
          outputTokens: 50
        };
      }
    };

    const summary = await createTimelineStore(vault, { synthesisRouter: router }).generateDailySummary('2026-04-28');

    expect(promptText).toContain('今天想明白了 Timeline 应该是 done list');
    expect(promptText).toContain('"local_time": "17:00"');
    expect(summary).toMatchObject({
      headline: '真实复盘',
      status: 'fresh',
      source_count: 1,
      runtime: 'sdk:anthropic',
      model: 'claude-test',
      prompt_version: 'summary.daily.v2'
    });
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
