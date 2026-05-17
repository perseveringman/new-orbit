import { useEffect, useMemo, useState } from 'react';
import type { DailyTimeline, MonthlyIndex, TimelineExportResult, WeeklyTimeline, YearlyIndex } from '@shared/timeline';
import type { DailySummaryEvidenceLine, DailySummaryPayload, SynthesisArtifact } from '@shared/synthesis';
import type { Note } from '@shared/note';
import { AnalysisProgressCard } from '../components/AnalysisProgressCard';
import { SynthesisStatus } from '../components/synthesis';

type TimelineMode = 'day' | 'week' | 'month' | 'year';

const DAILY_SUMMARY_ANALYSIS_STEPS = [
  '读取这一天留下的时间线记录',
  '过滤技术噪声，只保留可复盘的事件',
  '把相近的写作、阅读和任务推进合并成线索',
  '提取今天真正完成的事情',
  '寻找还没有闭环的讨论和想法',
  '整理成一段能留到以后回看的每日复盘'
];

interface TimelineState {
  day: DailyTimeline | null;
  week: WeeklyTimeline | null;
  month: MonthlyIndex | null;
  year: YearlyIndex | null;
}

function today(): string {
  return localDateKey(new Date());
}

export function TimelineView(): JSX.Element {
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<TimelineMode>('day');
  const [developerMode, setDeveloperMode] = useState(false);
  const [state, setState] = useState<TimelineState>({ day: null, week: null, month: null, year: null });
  const [summaryArtifact, setSummaryArtifact] = useState<SynthesisArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
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
    setSummarizing(true);
    setLoading(true);
    setError(null);
    try {
      await window.orbit.timeline.generateDailySummary(date);
      await reload();
    } catch (err) {
      setError(formatSummaryError(err));
    } finally {
      setLoading(false);
      setSummarizing(false);
    }
  }

  async function exportScope(): Promise<void> {
    setExportResult(await window.orbit.timeline.exportPDF({ kind: mode, value: scopeValue }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">今日回顾</h1>
            <p className="text-xs text-neutral-500">按时间整理今天完成、推进、沉淀的事情。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setDate(shiftDate(date, -1))} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">←</button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => setDate(shiftDate(date, 1))} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">→</button>
            <ModeSwitcher mode={mode} onChange={setMode} />
            <label className="flex items-center gap-1 text-xs text-neutral-500">
              <input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} /> 技术记录
            </label>
            <button onClick={() => void summarize()} disabled={mode !== 'day' || summarizing} className="rounded bg-sky-600 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-neutral-300">{summarizing ? '复盘中…' : '生成真实复盘'}</button>
            <button onClick={() => void exportScope()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">导出 PDF</button>
          </div>
        </div>
        {exportResult ? <p className="mt-2 text-xs text-neutral-500">已导出 {exportResult.format.toUpperCase()} 到 {exportResult.path}</p> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">{error}</div> : null}
        {loading && !summarizing ? <div className="mx-auto max-w-5xl text-sm text-neutral-500">正在加载时间线…</div> : null}
        <TimelineContent
          mode={mode}
          day={state.day}
          week={state.week}
          month={state.month}
          year={state.year}
          summaryArtifact={summaryArtifact}
          summarizing={summarizing}
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
  summarizing = false,
  onSummarize
}: {
  mode: TimelineMode;
  day: DailyTimeline | null;
  week: WeeklyTimeline | null;
  month: MonthlyIndex | null;
  year: YearlyIndex | null;
  summaryArtifact?: SynthesisArtifact | null;
  summarizing?: boolean;
  onSummarize?: () => void;
}): JSX.Element {
  if (mode === 'week') return week ? <WeekPanel week={week} /> : <EmptyState title="未加载周时间线" />;
  if (mode === 'month') return month ? <MonthPanel month={month} /> : <EmptyState title="未加载月时间线" />;
  if (mode === 'year') return year ? <YearPanel year={year} /> : <EmptyState title="未加载年时间线" />;
  return day ? (
    <div className="space-y-5">
      {summarizing ? (
        <div className="mx-auto max-w-5xl">
          <AnalysisProgressCard
            title="正在生成每日复盘"
            description="Orbit 正在把今天的完成、推进、沉淀和未闭环线索整理成可以回看的总结。"
            steps={DAILY_SUMMARY_ANALYSIS_STEPS}
          />
        </div>
      ) : null}
      <DayPanel timeline={day} summaryArtifact={summaryArtifact ?? null} summarizing={summarizing} onSummarize={onSummarize} />
    </div>
  ) : <EmptyState title="未加载日时间线" />;
}

function DayPanel({ timeline, summaryArtifact, summarizing, onSummarize }: { timeline: DailyTimeline; summaryArtifact: SynthesisArtifact | null; summarizing: boolean; onSummarize?: () => void }): JSX.Element {
  const segments = timeline.segments ?? groupByPeriod(timeline.entries);
  const summaryPayload = summaryArtifact?.payload as DailySummaryPayload | undefined;
  const summarySourceCount = timeline.summary?.source_count ?? summaryPayload?.coverage?.evidence_count ?? summaryArtifact?.sources.length ?? 0;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">今日完成清单</h2>
            <p className="text-xs text-neutral-500">默认只显示可以复盘的成果和推进；技术记录可在右上角打开。</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <Glance label="记录" value={timeline.stats.total_events} />
          <Glance label="想法" value={timeline.stats.thoughts_count} />
          <Glance label="字数" value={timeline.stats.longforms_words} />
          <Glance label="收藏" value={timeline.stats.library_added} />
          <Glance label="任务" value={timeline.stats.tasks_completed} />
          <Glance label="讨论" value={timeline.stats.conversations_count} />
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AI 每日复盘</h2>
            <SynthesisStatus artifact={summaryArtifact} generatedAt={timeline.summary?.generated_at} sourceCount={summarySourceCount} onRefresh={onSummarize} />
          </div>
          <button onClick={onSummarize} disabled={summarizing} className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white disabled:cursor-wait disabled:opacity-70">{summarizing ? '复盘中…' : '生成真实复盘'}</button>
        </div>
        {timeline.summary?.headline ? <p className="mt-3 text-base font-semibold">{timeline.summary.headline}</p> : null}
        <p className="mt-2 text-sm">{timeline.summary?.narrative ?? '暂无摘要。当天有足够信号后即可生成。'}</p>
        {summaryPayload ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SummaryEvidenceList title="完成清单" items={summaryPayload.done_list} />
            <SummaryThreadList items={summaryPayload.main_threads} />
            <SummaryEvidenceList title="未闭环" items={summaryPayload.open_loops} />
            <SummaryEvidenceList title="明日延续" items={summaryPayload.tomorrow} />
          </div>
        ) : null}
        {timeline.summary?.runtime ? (
          <p className="mt-4 text-[11px] text-amber-800/70 dark:text-amber-100/70">
            由 {runtimeLabel(timeline.summary.runtime)} 生成{timeline.summary.model ? ` · ${timeline.summary.model}` : ''} · 基于 {summarySourceCount} 条证据
          </p>
        ) : null}
      </section>
      {timeline.entries.length === 0 ? <EmptyState title="安静的一天" description="这一天还没有留下可复盘的完成记录。" /> : null}
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
        <h2 className="text-sm font-semibold">第 {week.iso_week} 周</h2>
        <p className="text-xs text-neutral-500">{week.range.from} → {week.range.to}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Glance label="记录" value={week.stats.total_events} />
          <Glance label="想法" value={week.stats.thoughts_count} />
          <Glance label="收藏" value={week.stats.library_added} />
          <Glance label="任务" value={week.stats.tasks_completed} />
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-7">
        {week.days.map((day) => (
          <article key={day.date} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xs font-semibold">{day.date.slice(5)}</div>
            <div className="mt-2 text-2xl font-semibold">{day.stats.total_events}</div>
            <div className="text-[11px] text-neutral-500">记录</div>
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
      <h2 className="text-sm font-semibold">{month.month} 月</h2>
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
      <h2 className="text-sm font-semibold">{year.year} 年</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {year.months.map((month) => (
          <article key={month.month} className={`rounded-xl border p-4 ${heatClass(month.total_events)}`}>
            <div className="text-xs font-semibold">{month.month}</div>
            <div className="mt-2 text-2xl font-semibold">{month.total_events}</div>
            <div className="text-xs text-neutral-500">{month.days_active} 个活跃日</div>
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
      setError('未找到笔记。');
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
                编辑
              </button>
            ) : null}
          </div>
          <div className="text-[11px] text-neutral-500">{formatEntryTime(entry.occurred_at)} · {entryKindLabel(entry.event_kind)}{entry.layer === 2 ? ' · 技术记录' : ''}</div>
          {editing ? (
            <div className="mt-3 space-y-2">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                 placeholder="标题"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <textarea
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                className="h-36 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void saveEdit()} disabled={saving} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                  {saving ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700">
                  取消
                </button>
              </div>
            </div>
          ) : entry.summary ? (
            <p className="mt-1 text-neutral-600 dark:text-neutral-300">{entry.summary}</p>
          ) : null}
          {error ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
          {entry.refs?.length ? <p className="mt-1 text-[11px] text-neutral-500">关联：{entry.refs.map((ref) => ref.label ?? ref.ref).join(', ')}</p> : null}
          {entry.derived_from?.length ? <p className="mt-1 text-[11px] text-neutral-500">↳ 合并了 {entry.derived_from.length} 条相关记录</p> : null}
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
          {timelineModeLabel(item)}
        </button>
      ))}
    </div>
  );
}

function Glance({ label, value }: { label: string; value: number }): JSX.Element {
  return <div><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-neutral-500">{label}</div></div>;
}

function SummaryEvidenceList({ title, items }: { title: string; items?: DailySummaryEvidenceLine[] }): JSX.Element | null {
  const lines = (items ?? []).filter((item) => item.text.trim());
  if (!lines.length) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs leading-5">
        {lines.map((item, index) => (
          <li key={`${title}-${index}`}>- {item.text}</li>
        ))}
      </ul>
    </div>
  );
}

function SummaryThreadList({ items }: { items?: DailySummaryPayload['main_threads'] }): JSX.Element | null {
  const threads = items ?? [];
  if (!threads.length) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold">主线推进</h3>
      <ul className="mt-2 space-y-2 text-xs leading-5">
        {threads.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <span className="font-medium">{item.title}</span>：{item.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
      <div className="font-medium text-neutral-700 dark:text-neutral-200">{title}</div>
      {description ? <p className="mt-1">{description}</p> : null}
    </div>
  );
}

function formatSummaryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('daily_summary_ai_unavailable')) {
    return '未配置可用 AI 端点，无法生成真实每日复盘。请先在设置里配置 AI 端点。';
  }
  if (message.includes('daily_summary_ai_failed')) {
    return 'AI 生成每日复盘失败，请稍后重试或检查当前 AI 端点配置。';
  }
  return message;
}

function runtimeLabel(runtime: string): string {
  if (runtime === 'sdk:anthropic') return 'Anthropic';
  if (runtime === 'sdk:minimax') return 'Minimax';
  if (runtime === 'sdk:deepseek') return 'DeepSeek';
  if (runtime.startsWith('sdk:')) return runtime.slice(4);
  return runtime;
}

function timelineModeLabel(mode: TimelineMode): string {
  const labels: Record<TimelineMode, string> = {
    day: '日',
    week: '周',
    month: '月',
    year: '年'
  };
  return labels[mode];
}

function entryKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    'note.created': '捕获',
    'note.updated': '写作更新',
    'note.archived': '归档',
    'library.item.added': '资料收藏',
    'library.item.annotated': '阅读标注',
    'library.item.status_changed': '资料状态',
    'library.item.read': '阅读完成',
    'library.item.distilled': '资料提炼',
    'library.item.linked_to_resource': '资源关联',
    'feed.source.added': '信息源',
    'feed.item.saved_to_library': '信息流收藏',
    'daily_summary.generated': '每日总结',
    'kb.imported': '知识库',
    'kb.doc.activated': '知识沉淀',
    'kb.activated': '知识沉淀',
    'kb.welcome_analysis_completed': '知识分析',
    'scheduled_task.created': '定时任务',
    'scheduled_task.execution.completed': '定时任务完成',
    'task.completed': '任务完成',
    'conversation.started': '对话',
    'conversation.meaningful': '有效讨论',
    'resource.created': '资源主题',
    'resource.updated': '资源更新',
    'resource.ref.linked': '素材关联',
    'resource.ref.promoted': '素材沉淀',
    'resource.engagement': '资源推进',
    'resource.archived': '资源归档',
    'agent.run.started': '代理开始',
    'agent.run.completed': '代理完成',
    'agent.run.interrupted': '代理中断',
    'runtime.sdk.invocation.started': '模型调用',
    'runtime.sdk.cost': '调用成本',
    'runtime.sdk.invocation.completed': '调用完成',
    'synthesis.artifact.created': '智能生成',
    'synthesis.artifact.stale': '智能生成过期',
    'synthesis.artifact.superseded': '智能生成替换',
    'synthesis.artifact.failed': '智能生成失败',
    'synthesis.artifact.user_edited': '智能生成编辑',
    'conversation.turn.added': '对话轮次',
    'conversation.message.added': '对话消息',
    'inbox.item.created': '待处理事项',
    'inbox.item.resolved': '处理完成',
    'activity.user': '用户操作',
    'activity.system': '系统操作'
  };
  return labels[kind] ?? '记录';
}

function formatEntryTime(value: string): string {
  return wallClockTime(value);
}

function groupByPeriod(entries: DailyTimeline['entries']): NonNullable<DailyTimeline['segments']> {
  const buckets = new Map<string, DailyTimeline['entries']>();
  for (const entry of entries) {
    const hour = wallClockHour(entry.occurred_at);
    const id = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'evening';
    buckets.set(id, [...(buckets.get(id) ?? []), entry]);
  }
  const labels = {
    night: ['凌晨', '00:00-06:00'],
    morning: ['上午', '06:00-12:00'],
    noon: ['中午', '12:00-14:00'],
    afternoon: ['下午', '14:00-18:00'],
    evening: ['晚上', '18:00-24:00']
  } as const;
  return (Object.keys(labels) as Array<keyof typeof labels>)
    .map((id) => ({ id, label: labels[id][0], range: labels[id][1], entries: buckets.get(id) ?? [] }))
    .filter((group) => group.entries.length > 0);
}

function shiftDate(date: string, deltaDays: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, (month || 1) - 1, (day || 1) + deltaDays);
  return localDateKey(next);
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

function localDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-');
}

function wallClockTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value.slice(11, 16);
  }
  return parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function wallClockHour(value: string): number {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.getHours();
  const match = value.match(/T(\d{2})/);
  return match ? Number(match[1]) : 0;
}
