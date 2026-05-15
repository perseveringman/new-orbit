import { useEffect, useMemo, useState } from 'react';
import type { DailyTimeline, MonthlyIndex, TimelineExportResult, WeeklyTimeline, YearlyIndex } from '@shared/timeline';
import type { SynthesisArtifact } from '@shared/synthesis';
import type { Note } from '@shared/note';
import { SynthesisStatus } from '../components/synthesis';

type TimelineMode = 'day' | 'week' | 'month' | 'year';

interface TimelineState {
  day: DailyTimeline | null;
  week: WeeklyTimeline | null;
  month: MonthlyIndex | null;
  year: YearlyIndex | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimelineView(): JSX.Element {
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<TimelineMode>('day');
  const [developerMode, setDeveloperMode] = useState(false);
  const [state, setState] = useState<TimelineState>({ day: null, week: null, month: null, year: null });
  const [summaryArtifact, setSummaryArtifact] = useState<SynthesisArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<TimelineExportResult | null>(null);

  const scopeValue = useMemo(() => scopeValueFor(mode, date), [date, mode]);

  async function reload(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'day') {
        const day = await window.orbit.timeline.getDay(date, { developerMode });
        setState((current) => ({ ...current, day }));
        setSummaryArtifact(day.summary?.synthesis_ref ? await window.orbit.synthesis.getArtifact(day.summary.synthesis_ref) : null);
      } else if (mode === 'week') {
        const week = await window.orbit.timeline.getWeek(scopeValue);
        setState((current) => ({ ...current, week }));
      } else if (mode === 'month') {
        const month = await window.orbit.timeline.getMonth(scopeValue);
        setState((current) => ({ ...current, month }));
      } else {
        const year = await window.orbit.timeline.getYear(Number(scopeValue));
        setState((current) => ({ ...current, year }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [date, developerMode, mode, scopeValue]);

  useEffect(() => {
    return window.orbit.timeline.onEvent((timeline) => {
      if (mode === 'day' && timeline.date === date) setState((current) => ({ ...current, day: timeline }));
    });
  }, [date, mode]);

  async function summarize(): Promise<void> {
    await window.orbit.timeline.generateDailySummary(date);
    await reload();
  }

  async function exportScope(): Promise<void> {
    setExportResult(await window.orbit.timeline.exportPDF({ kind: mode, value: scopeValue }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Daily Timeline</h1>
            <p className="text-xs text-neutral-500">Life log projected from TraceableEvent. Layer 1 by default; Layer 2 only in developer mode.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setDate(shiftDate(date, -1))} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">←</button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => setDate(shiftDate(date, 1))} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">→</button>
            <ModeSwitcher mode={mode} onChange={setMode} />
            <label className="flex items-center gap-1 text-xs text-neutral-500">
              <input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} /> Layer 2
            </label>
            <button onClick={() => void summarize()} disabled={mode !== 'day'} className="rounded bg-sky-600 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-neutral-300">Summarize</button>
            <button onClick={() => void exportScope()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Export PDF</button>
          </div>
        </div>
        {exportResult ? <p className="mt-2 text-xs text-neutral-500">Exported {exportResult.format.toUpperCase()} to {exportResult.path}</p> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">{error}</div> : null}
        {loading ? <div className="text-sm text-neutral-500">Loading timeline…</div> : null}
        <TimelineContent
          mode={mode}
          day={state.day}
          week={state.week}
          month={state.month}
          year={state.year}
          summaryArtifact={summaryArtifact}
          onSummarize={() => void summarize()}
        />
      </main>
    </div>
  );
}

export function TimelineContent({
  mode,
  day,
  week,
  month,
  year,
  summaryArtifact,
  onSummarize
}: {
  mode: TimelineMode;
  day: DailyTimeline | null;
  week: WeeklyTimeline | null;
  month: MonthlyIndex | null;
  year: YearlyIndex | null;
  summaryArtifact?: SynthesisArtifact | null;
  onSummarize?: () => void;
}): JSX.Element {
  if (mode === 'week') return week ? <WeekPanel week={week} /> : <EmptyState title="No week loaded" />;
  if (mode === 'month') return month ? <MonthPanel month={month} /> : <EmptyState title="No month loaded" />;
  if (mode === 'year') return year ? <YearPanel year={year} /> : <EmptyState title="No year loaded" />;
  return day ? <DayPanel timeline={day} summaryArtifact={summaryArtifact ?? null} onSummarize={onSummarize} /> : <EmptyState title="No day loaded" />;
}

function DayPanel({ timeline, summaryArtifact, onSummarize }: { timeline: DailyTimeline; summaryArtifact: SynthesisArtifact | null; onSummarize?: () => void }): JSX.Element {
  const segments = timeline.segments ?? groupByPeriod(timeline.entries);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Today at a glance</h2>
            <p className="text-xs text-neutral-500">Layer 1 events are shown by default; technical Layer 2 events are visually marked.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <Glance label="Events" value={timeline.stats.total_events} />
          <Glance label="Thoughts" value={timeline.stats.thoughts_count} />
          <Glance label="Words" value={timeline.stats.longforms_words} />
          <Glance label="Library" value={timeline.stats.library_added} />
          <Glance label="Tasks" value={timeline.stats.tasks_completed} />
          <Glance label="Chats" value={timeline.stats.conversations_count} />
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AI Daily Summary</h2>
            <SynthesisStatus artifact={summaryArtifact} generatedAt={timeline.summary?.generated_at} sourceCount={summaryArtifact?.sources.length ?? 0} onRefresh={onSummarize} />
          </div>
          <button onClick={onSummarize} className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white">Generate</button>
        </div>
        <p className="mt-2 text-sm">{timeline.summary?.narrative ?? 'No summary yet. Generate one when the day has enough signal.'}</p>
      </section>
      {timeline.entries.length === 0 ? <EmptyState title="Quiet day" description="No user-visible Layer 1 events were captured for this day." /> : null}
      {segments.map((group) => (
        <section key={group.id}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.label} · {group.range}</h2>
          <div className="space-y-2">
            {group.entries.map((entry) => <EntryCard key={entry.event_id} entry={entry} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function WeekPanel({ week }: { week: WeeklyTimeline }): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Week {week.iso_week}</h2>
        <p className="text-xs text-neutral-500">{week.range.from} → {week.range.to}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Glance label="Events" value={week.stats.total_events} />
          <Glance label="Thoughts" value={week.stats.thoughts_count} />
          <Glance label="Library" value={week.stats.library_added} />
          <Glance label="Tasks" value={week.stats.tasks_completed} />
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-7">
        {week.days.map((day) => (
          <article key={day.date} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xs font-semibold">{day.date.slice(5)}</div>
            <div className="mt-2 text-2xl font-semibold">{day.stats.total_events}</div>
            <div className="text-[11px] text-neutral-500">events</div>
            {day.summary?.headline ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{day.summary.headline}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function MonthPanel({ month }: { month: MonthlyIndex }): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h2 className="text-sm font-semibold">Month {month.month}</h2>
      <div className="grid grid-cols-7 gap-2">
        {month.days.map((day) => (
          <article key={day.date} className={`min-h-24 rounded-xl border p-3 ${heatClass(day.entry_count)}`}>
            <div className="text-xs font-semibold">{day.date.slice(-2)}</div>
            <div className="mt-2 text-lg font-semibold">{day.entry_count}</div>
            {day.summary_headline ? <p className="mt-1 text-[11px]">{day.summary_headline}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function YearPanel({ year }: { year: YearlyIndex }): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h2 className="text-sm font-semibold">Year {year.year}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {year.months.map((month) => (
          <article key={month.month} className={`rounded-xl border p-4 ${heatClass(month.total_events)}`}>
            <div className="text-xs font-semibold">{month.month}</div>
            <div className="mt-2 text-2xl font-semibold">{month.total_events}</div>
            <div className="text-xs text-neutral-500">{month.days_active} active days</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EntryCard({ entry }: { entry: DailyTimeline['entries'][number] }): JSX.Element {
  const notePath = entry.event_kind.startsWith('note.') ? entry.refs?.find((ref) => ref.kind === 'note')?.ref : undefined;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEdit(): Promise<void> {
    if (!notePath) return;
    setError(null);
    const loaded = await window.orbit.notes.getByPath(notePath);
    if (!loaded) {
      setError('Note not found.');
      return;
    }
    setNote(loaded);
    setDraftTitle(loaded.frontmatter.title ?? '');
    setDraftBody(loaded.body);
    setEditing(true);
  }

  async function saveEdit(): Promise<void> {
    if (!note) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await window.orbit.notes.update(note.frontmatter.id, {
        title: draftTitle.trim() || note.frontmatter.title,
        body: draftBody
      });
      setNote(updated);
      setEditing(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`rounded-xl border p-3 text-sm ${entry.layer === 2 ? 'border-violet-200 bg-violet-50/50 dark:border-violet-900/50 dark:bg-violet-950/20' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'}`}>
      <div className="flex gap-2">
        <span>{entry.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="font-medium">{entry.title}</div>
            {notePath ? (
              <button type="button" onClick={() => void startEdit()} className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                Edit
              </button>
            ) : null}
          </div>
          <div className="text-[11px] text-neutral-500">{new Date(entry.occurred_at).toLocaleTimeString()} · {entry.event_kind}{entry.layer === 2 ? ' · Layer 2' : ''}</div>
          {editing ? (
            <div className="mt-3 space-y-2">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <textarea
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                className="h-36 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void saveEdit()} disabled={saving} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : entry.summary ? (
            <p className="mt-1 text-neutral-600 dark:text-neutral-300">{entry.summary}</p>
          ) : null}
          {error ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
          {entry.refs?.length ? <p className="mt-1 text-[11px] text-neutral-500">Refs: {entry.refs.map((ref) => ref.label ?? ref.ref).join(', ')}</p> : null}
          {entry.derived_from?.length ? <p className="mt-1 text-[11px] text-neutral-500">↳ related events: {entry.derived_from.length}</p> : null}
        </div>
      </div>
    </article>
  );
}

function ModeSwitcher({ mode, onChange }: { mode: TimelineMode; onChange: (mode: TimelineMode) => void }): JSX.Element {
  return (
    <div className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
      {(['day', 'week', 'month', 'year'] as const).map((item) => (
        <button key={item} onClick={() => onChange(item)} className={`rounded-md px-2 py-1 text-xs capitalize ${mode === item ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-500'}`}>
          {item}
        </button>
      ))}
    </div>
  );
}

function Glance({ label, value }: { label: string; value: number }): JSX.Element {
  return <div><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-neutral-500">{label}</div></div>;
}

function EmptyState({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
      <div className="font-medium text-neutral-700 dark:text-neutral-200">{title}</div>
      {description ? <p className="mt-1">{description}</p> : null}
    </div>
  );
}

function groupByPeriod(entries: DailyTimeline['entries']): NonNullable<DailyTimeline['segments']> {
  const buckets = new Map<string, DailyTimeline['entries']>();
  for (const entry of entries) {
    const hour = Number(entry.occurred_at.slice(11, 13));
    const id = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'evening';
    buckets.set(id, [...(buckets.get(id) ?? []), entry]);
  }
  const labels = {
    night: ['Night', '00:00-06:00'],
    morning: ['Morning', '06:00-12:00'],
    noon: ['Noon', '12:00-14:00'],
    afternoon: ['Afternoon', '14:00-18:00'],
    evening: ['Evening', '18:00-24:00']
  } as const;
  return (Object.keys(labels) as Array<keyof typeof labels>)
    .map((id) => ({ id, label: labels[id][0], range: labels[id][1], entries: buckets.get(id) ?? [] }))
    .filter((group) => group.entries.length > 0);
}

function shiftDate(date: string, deltaDays: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

function scopeValueFor(mode: TimelineMode, date: string): string {
  if (mode === 'week') return isoWeekFromDate(date);
  if (mode === 'month') return date.slice(0, 7);
  if (mode === 'year') return date.slice(0, 4);
  return date;
}

function isoWeekFromDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function heatClass(count: number): string {
  if (count === 0) return 'border-neutral-200 bg-white text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900';
  if (count < 3) return 'border-sky-100 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100';
  if (count < 8) return 'border-sky-200 bg-sky-100 text-sky-950 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-50';
  return 'border-sky-300 bg-sky-200 text-sky-950 dark:border-sky-700 dark:bg-sky-800 dark:text-white';
}
