import { useEffect, useMemo, useState } from 'react';
import type { DailyTimeline } from '@shared/timeline';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimelineView(): JSX.Element {
  const [date, setDate] = useState(today());
  const [developerMode, setDeveloperMode] = useState(false);
  const [timeline, setTimeline] = useState<DailyTimeline | null>(null);
  const groups = useMemo(() => groupByPeriod(timeline?.entries ?? []), [timeline]);

  async function reload(): Promise<void> {
    setTimeline(await window.orbit.timeline.getDay(date, { developerMode }));
  }

  useEffect(() => {
    void reload();
  }, [date, developerMode]);

  async function summarize(): Promise<void> {
    await window.orbit.timeline.generateDailySummary(date);
    await reload();
  }

  async function exportDay(): Promise<void> {
    await window.orbit.timeline.exportPDF({ kind: 'day', value: date });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Daily Timeline</h1>
            <p className="text-xs text-neutral-500">Layer 1/2 life log built from TraceableEvent.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
            <label className="flex items-center gap-1 text-xs text-neutral-500"><input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} /> Layer 2</label>
            <button onClick={() => void summarize()} className="rounded bg-sky-600 px-3 py-1.5 text-xs text-white">Summarize</button>
            <button onClick={() => void exportDay()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Export</button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {timeline ? (
          <div className="mx-auto max-w-4xl space-y-5">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-semibold">Today at a glance</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <Glance label="Events" value={timeline.stats.total_events} />
                <Glance label="Thoughts" value={timeline.stats.thoughts_count} />
                <Glance label="Library" value={timeline.stats.library_added} />
                <Glance label="Conversations" value={timeline.stats.conversations_count} />
              </div>
            </section>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
              <h2 className="text-sm font-semibold">AI Summary</h2>
              <p className="mt-2 text-sm">{timeline.summary?.narrative ?? 'No summary yet. Generate one when the day has enough signal.'}</p>
            </section>
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.label}</h2>
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <div key={entry.event_id} className={`rounded-xl border p-3 text-sm ${entry.layer === 2 ? 'border-violet-200 bg-violet-50/50 dark:border-violet-900/50 dark:bg-violet-950/20' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'}`}>
                      <div className="flex gap-2">
                        <span>{entry.icon}</span>
                        <div className="min-w-0">
                          <div className="font-medium">{entry.title}</div>
                          <div className="text-[11px] text-neutral-500">{new Date(entry.occurred_at).toLocaleTimeString()} · {entry.event_kind}</div>
                          {entry.summary ? <p className="mt-1 text-neutral-600 dark:text-neutral-300">{entry.summary}</p> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Loading timeline…</div>
        )}
      </main>
    </div>
  );
}

function Glance({ label, value }: { label: string; value: number }): JSX.Element {
  return <div><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-neutral-500">{label}</div></div>;
}

function groupByPeriod(entries: DailyTimeline['entries']): Array<{ label: string; entries: DailyTimeline['entries'] }> {
  const buckets = new Map<string, DailyTimeline['entries']>();
  for (const entry of entries) {
    const hour = Number(entry.occurred_at.slice(11, 13));
    const label = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    buckets.set(label, [...(buckets.get(label) ?? []), entry]);
  }
  return ['Night', 'Morning', 'Afternoon', 'Evening'].map((label) => ({ label, entries: buckets.get(label) ?? [] })).filter((group) => group.entries.length > 0);
}

