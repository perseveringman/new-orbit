import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TraceableEvent } from '@shared/events';
import type { DailyStats, DailySummary, DailyTimeline, MonthlyIndex, TimelineEntry, YearlyIndex } from '@shared/timeline';
import { shouldShowOnTimeline, TIMELINE_LAYER_1_KINDS } from '@shared/timeline';
import { currentEventReplayStore } from '../events/bus';
import { createNoteStore } from '../note/store';
import type { DailySummaryPayload } from '@shared/synthesis';
import { SynthesisRunner, createSynthesisJob } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';

export class TimelineStore {
  constructor(private readonly vaultPath: string) {}

  async getDay(date: string, developerMode = false): Promise<DailyTimeline> {
    const events = await this.eventsForDate(date, developerMode);
    const entries = events
      .map((event) => projectEvent(event, developerMode))
      .filter((entry): entry is TimelineEntry => entry !== null)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    return {
      date,
      entries,
      stats: buildStats(entries),
      summary: await this.readDailySummary(date)
    };
  }

  async getWeek(isoWeek: string): Promise<DailyTimeline[]> {
    const dates = datesForIsoWeek(isoWeek);
    return Promise.all(dates.map((date) => this.getDay(date)));
  }

  async getMonthlyIndex(month: string): Promise<MonthlyIndex> {
    const days = daysInMonth(month);
    const timelines = await Promise.all(days.map((date) => this.getDay(date)));
    return {
      month,
      days: timelines.map((timeline) => ({
        date: timeline.date,
        entry_count: timeline.entries.length,
        highlight_kinds: [...new Set(timeline.entries.slice(0, 5).map((entry) => entry.event_kind))],
        ...(timeline.summary?.headline ? { summary_headline: timeline.summary.headline } : {})
      }))
    };
  }

  async getYearlyIndex(year: number): Promise<YearlyIndex> {
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    const indexes = await Promise.all(months.map((month) => this.getMonthlyIndex(month)));
    return {
      year,
      months: indexes.map((index) => ({
        month: index.month,
        total_events: index.days.reduce((sum, day) => sum + day.entry_count, 0),
        days_active: index.days.filter((day) => day.entry_count > 0).length
      }))
    };
  }

  async generateDailySummary(date: string): Promise<DailySummary> {
    const timeline = await this.getDay(date, false);
    const store = createSynthesisStore(this.vaultPath);
    const artifact = await new SynthesisRunner(store).run(
      createSynthesisJob({
        kind: 'summary.daily',
        scope_key: `daily:${date}`,
        priority: 'user-blocking',
        reason: 'manual',
        force: true,
        sources: [
          {
            kind: 'timeline_range',
            ref: date,
            range: { from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` },
            metadata: { entries: timeline.entries, stats: timeline.stats }
          }
        ]
      })
    );
    const payload = artifact.payload as DailySummaryPayload;
    const headline = payload.headline;
    const highlights = payload.highlights;
    const narrative = payload.narrative;
    const body = `# ${date} Daily Summary\n\n${narrative}\n\n## Highlights\n\n${highlights.map((item) => `- ${item}`).join('\n') || '- Rest / no captured events'}\n`;
    const notes = createNoteStore(this.vaultPath);
    const current = await this.readDailySummary(date);
    const currentNote = current?.note_path ? await notes.getByPath(current.note_path).catch(() => null) : null;
    const note = currentNote
      ? await notes.update(currentNote.frontmatter.id, { body })
      : await notes.create({
          type: 'daily_summary',
          title: `${date} Daily Summary`,
          body,
          tags: ['daily-summary'],
          source: { kind: 'synthesis', ref: artifact.id }
        });
    const summary: DailySummary = {
      generated_at: new Date().toISOString(),
      note_path: note.path,
      headline,
      narrative,
      highlights,
      synthesis_ref: artifact.id,
      status: artifact.status
    };
    await this.writeSummary(date, summary);
    return summary;
  }

  async updateDailySummary(date: string, patch: { narrative?: string; headline?: string }): Promise<DailySummary> {
    const current = (await this.readDailySummary(date)) ?? (await this.generateDailySummary(date));
    const next: DailySummary = { ...current, ...patch, generated_at: new Date().toISOString() };
    await this.writeSummary(date, next);
    return next;
  }

  async exportMarkdown(scope: { kind: string; value: string }): Promise<{ path: string }> {
    const outPath = path.join(this.vaultPath, '.orbit', 'timeline', 'exports', `${scope.kind}-${scope.value}.md`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    if (scope.kind === 'day') {
      const timeline = await this.getDay(scope.value);
      await fs.writeFile(outPath, renderTimelineMarkdown(timeline), 'utf8');
    } else {
      await fs.writeFile(outPath, `# Timeline export: ${scope.kind} ${scope.value}\n\nGenerated by Orbit.\n`, 'utf8');
    }
    return { path: outPath };
  }

  private async eventsForDate(date: string, developerMode: boolean): Promise<TraceableEvent[]> {
    const store = currentEventReplayStore();
    if (!store) return [];
    const result = await store.query({ limit: 10_000 });
    return result.events
      .filter((event) => event.at.startsWith(date))
      .filter((event) => shouldShowOnTimeline(event.kind ?? event.type, developerMode));
  }

  private summaryPath(date: string): string {
    return path.join(this.vaultPath, '.orbit', 'timeline', 'summaries', `${date}.json`);
  }

  private async readDailySummary(date: string): Promise<DailySummary | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.summaryPath(date), 'utf8')) as DailySummary;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async writeSummary(date: string, summary: DailySummary): Promise<void> {
    await fs.mkdir(path.dirname(this.summaryPath(date)), { recursive: true });
    await fs.writeFile(this.summaryPath(date), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
}

export function createTimelineStore(vaultPath: string): TimelineStore {
  return new TimelineStore(vaultPath);
}

function projectEvent(event: TraceableEvent, developerMode: boolean): TimelineEntry | null {
  const kind = event.kind ?? event.type;
  if (!shouldShowOnTimeline(kind, developerMode)) return null;
  const layer: 1 | 2 = TIMELINE_LAYER_1_KINDS.has(kind) ? 1 : 2;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const noteType = String(payload['type'] ?? '');
  const special = payload['special_marker'] as { kind?: string; icon?: string } | undefined;
  const base: TimelineEntry = {
    event_id: event.id,
    event_kind: kind,
    trace_id: event.traceId,
    occurred_at: event.at,
    layer,
    icon: iconFor(kind, noteType, special?.icon),
    title: titleFor(kind, payload, special?.kind),
    summary: String(payload['title'] ?? event.summary ?? '').slice(0, 180),
    refs: refsFor(kind, payload),
    aggregation_key: aggregationKeyFor(kind, payload)
  };
  return base;
}

function iconFor(kind: string, noteType: string, specialIcon?: string): string {
  if (specialIcon) return specialIcon;
  if (kind === 'note.created') {
    if (noteType === 'thought') return '💭';
    if (noteType === 'longform') return '✍️';
    if (noteType === 'voice_log') return '🎤';
    if (noteType === 'daily_summary') return '🌙';
    return '📌';
  }
  if (kind.startsWith('library.')) return '📚';
  if (kind.startsWith('feed.')) return '🛰️';
  if (kind.startsWith('kb.')) return '🧠';
  if (kind.startsWith('scheduled_task.')) return '⏰';
  if (kind.startsWith('conversation.')) return '💬';
  if (kind.startsWith('resource.')) return '🧩';
  if (kind.startsWith('agent.')) return '🤖';
  if (kind.startsWith('task.')) return '✅';
  return '•';
}

function titleFor(kind: string, payload: Record<string, unknown>, specialKind?: string): string {
  if (specialKind) return `${specialKind}: ${String(payload['title'] ?? 'special capture')}`;
  if (kind === 'note.created') return `Captured ${String(payload['type'] ?? 'note')}`;
  if (kind === 'note.updated') return `Updated ${String(payload['title'] ?? 'note')}`;
  if (kind === 'note.archived') return `Archived ${String(payload['title'] ?? 'note')}`;
  if (kind === 'library.item.added') return `Saved Library item ${String(payload['title'] ?? '')}`.trim();
  if (kind === 'kb.imported') return `Imported KB ${String(payload['name'] ?? '')}`.trim();
  if (kind === 'kb.doc.activated' || kind === 'kb.activated') return 'Activated knowledge into note';
  if (kind === 'scheduled_task.execution.completed') return 'Scheduled task ran';
  if (kind === 'resource.created') return `Created Resource ${String(payload['title'] ?? '')}`.trim();
  if (kind === 'resource.updated') return `Updated Resource ${String(payload['title'] ?? '')}`.trim();
  if (kind === 'resource.ref.linked') return `Linked material to ${String(payload['title'] ?? 'Resource')}`;
  if (kind === 'resource.engagement') return `Engaged Resource ${String(payload['title'] ?? '')}`.trim();
  if (kind === 'resource.archived') return `Archived Resource ${String(payload['title'] ?? '')}`.trim();
  return kind.replace(/\./g, ' ');
}

function refsFor(kind: string, payload: Record<string, unknown>): TimelineEntry['refs'] {
  if (kind.startsWith('note.') && typeof payload['path'] === 'string') {
    return [{ kind: 'note', ref: payload['path'], label: String(payload['title'] ?? payload['note_id'] ?? 'note') }];
  }
  if (kind.startsWith('kb.') && typeof payload['kb_id'] === 'string') {
    return [{ kind: 'kb', ref: payload['kb_id'], label: String(payload['name'] ?? payload['kb_id']) }];
  }
  if (kind.startsWith('scheduled_task.') && typeof payload['task_id'] === 'string') {
    return [{ kind: 'task', ref: payload['task_id'], label: String(payload['name'] ?? payload['task_id']) }];
  }
  if (kind.startsWith('resource.') && typeof payload['slug'] === 'string') {
    return [{ kind: 'resource', ref: payload['slug'], label: String(payload['title'] ?? payload['slug']) }];
  }
  return undefined;
}

function aggregationKeyFor(kind: string, payload: Record<string, unknown>): string | undefined {
  if (kind === 'note.updated' && payload['note_id']) return `note-update:${String(payload['note_id'])}`;
  return undefined;
}

function buildStats(entries: TimelineEntry[]): DailyStats {
  return {
    total_events: entries.length,
    thoughts_count: entries.filter((entry) => entry.event_kind === 'note.created' && entry.icon === '💭').length,
    longforms_wrote: entries.filter((entry) => entry.event_kind.startsWith('note.') && entry.icon === '✍️').length,
    longforms_words: 0,
    library_added: entries.filter((entry) => entry.event_kind === 'library.item.added').length,
    library_read: entries.filter((entry) => entry.event_kind === 'library.item.read').length,
    tasks_completed: entries.filter((entry) => entry.event_kind === 'task.completed').length,
    projects_touched: refsByKind(entries, 'project'),
    areas_touched: refsByKind(entries, 'area'),
    resources_touched: refsByKind(entries, 'resource'),
    conversations_count: entries.filter((entry) => entry.event_kind.startsWith('conversation.')).length
  };
}

function refsByKind(entries: TimelineEntry[], kind: 'project' | 'area' | 'resource'): string[] {
  return [...new Set(entries.flatMap((entry) => entry.refs ?? []).filter((ref) => ref.kind === kind).map((ref) => ref.ref))];
}

function datesForIsoWeek(isoWeek: string): string[] {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

function daysInMonth(month: string): string[] {
  const [yearValue, monthValue] = month.split('-').map(Number);
  if (!yearValue || !monthValue) return [];
  const count = new Date(yearValue, monthValue, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function renderTimelineMarkdown(timeline: DailyTimeline): string {
  return `# Timeline ${timeline.date}\n\n${timeline.summary?.narrative ?? ''}\n\n${timeline.entries
    .map((entry) => `- ${entry.occurred_at.slice(11, 16)} ${entry.icon} **${entry.title}** ${entry.summary ?? ''}`)
    .join('\n')}\n`;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
