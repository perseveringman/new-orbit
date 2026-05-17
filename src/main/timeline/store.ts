import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TraceableEvent } from '@shared/events';
import type {
  DailyStats,
  DailySummary,
  DailyTimeline,
  MonthlyIndex,
  TimeSegmentGroup,
  TimelineEntry,
  TimelineExportResult,
  TimelineScope,
  WeeklyTimeline,
  YearlyIndex
} from '@shared/timeline';
import { shouldShowOnTimeline, TIMELINE_LAYER_1_KINDS } from '@shared/timeline';
import { currentEventReplayStore, publishTraceableEvent } from '../events/bus';
import { createNoteStore } from '../note/store';
import type { DailySummaryEvidenceLine, DailySummaryPayload } from '@shared/synthesis';
import { SynthesisRunner, createSynthesisJob, type SynthesisRuntimeRouter } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { buildDailyContextPacket, type DailyContextPacket } from './daily-context';

export interface TimelineStoreOptions {
  synthesisRouter?: SynthesisRuntimeRouter | null;
}

export class TimelineStore {
  constructor(
    private readonly vaultPath: string,
    private readonly options: TimelineStoreOptions = {}
  ) {}

  async getDay(date: string, developerMode = false): Promise<DailyTimeline> {
    const events = await this.eventsForDate(date, developerMode);
    const projected = events
      .map((event) => projectEvent(event, developerMode))
      .filter((entry): entry is TimelineEntry => entry !== null)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const entries = aggregateEntries(deriveEntryRelations(projected));
    return {
      date,
      entries,
      segments: groupByTimeSegment(entries),
      stats: buildStats(entries),
      summary: await this.readDailySummary(date)
    };
  }

  async getWeek(isoWeek: string): Promise<WeeklyTimeline> {
    const dates = datesForIsoWeek(isoWeek);
    const days = await Promise.all(dates.map((date) => this.getDay(date)));
    return {
      iso_week: isoWeek,
      range: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
      days,
      stats: mergeStats(days.map((day) => day.stats))
    };
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
    const context = await buildDailyContextPacket(this.vaultPath, timeline);
    const router = this.options.synthesisRouter ?? requireDefaultSynthesisRouter(this.vaultPath);
    const decision = await router.decide({ mode: 'synthesis', modelTier: 'heavy' }).catch(() => {
      throw new Error('daily_summary_ai_unavailable');
    });
    if (decision.track !== 'sdk' || !decision.endpointId) {
      throw new Error('daily_summary_ai_unavailable');
    }
    const lockedRouter: SynthesisRuntimeRouter = {
      decide: async () => decision,
      stream: (input, windows) => router.stream(input, windows)
    };
    const store = createSynthesisStore(this.vaultPath);
    const artifact = await new SynthesisRunner(store, { router: lockedRouter, maxBudgetUsd: 1, requireSdk: true }).run(
      createSynthesisJob({
        kind: 'summary.daily',
        scope_key: `daily:${date}`,
        priority: 'user-blocking',
        reason: 'manual',
        force: true,
        sources: context.sources,
        budget_usd: 0.2
      })
    );
    if (artifact.status === 'failed') {
      throw new Error(`daily_summary_ai_failed:${artifact.error ?? 'unknown'}`);
    }
    const payload = artifact.payload as DailySummaryPayload;
    const headline = payload.headline;
    const highlights = payload.highlights;
    const narrative = payload.narrative;
    const body = renderDailySummaryNoteBody(date, payload, context.packet);
    const notes = createNoteStore(this.vaultPath);
    const current = await this.readDailySummary(date);
    const currentNote = current?.note_path ? await notes.getByPath(current.note_path).catch(() => null) : null;
    const note = currentNote
      ? await notes.update(currentNote.frontmatter.id, { body })
      : await notes.create({
          type: 'daily_summary',
          title: `${date} 每日总结`,
          body,
          tags: ['daily-summary'],
          source: { kind: 'synthesis', ref: artifact.id },
          synthesis_ref: artifact.id
        });
    const summary: DailySummary = {
      generated_at: new Date().toISOString(),
      note_path: note.path,
      headline,
      narrative,
      highlights,
      synthesis_ref: artifact.id,
      status: artifact.status,
      source_count: context.packet.coverage.evidence_count,
      runtime: artifact.provenance.runtime,
      model: artifact.provenance.model,
      prompt_version: artifact.provenance.prompt_version
    };
    await this.writeSummary(date, summary);
    publishTraceableEvent({
      source: 'activity',
      kind: 'daily_summary.generated',
      summary: `生成 ${date} 每日总结`,
      payload: { date, note_path: note.path, artifact_id: artifact.id, headline }
    });
    return summary;
  }

  async updateDailySummary(date: string, patch: { narrative?: string; headline?: string }): Promise<DailySummary> {
    const current = (await this.readDailySummary(date)) ?? (await this.generateDailySummary(date));
    const next: DailySummary = { ...current, ...patch, generated_at: new Date().toISOString() };
    await this.writeSummary(date, next);
    return next;
  }

  async exportPDF(scope: TimelineScope): Promise<TimelineExportResult> {
    const safeValue = scope.value.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const outPath = path.join(this.vaultPath, '.orbit', 'timeline', 'exports', `${scope.kind}-${safeValue}.pdf`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, renderSimplePdf(await this.renderExportText(scope)));
    return { path: outPath, format: 'pdf', scope };
  }

  private async renderExportText(scope: TimelineScope): Promise<string> {
    if (scope.kind === 'day') return renderTimelineText(await this.getDay(scope.value));
    if (scope.kind === 'week') return renderWeekText(await this.getWeek(scope.value));
    if (scope.kind === 'month') return renderMonthText(await this.getMonthlyIndex(scope.value));
    return renderYearText(await this.getYearlyIndex(Number(scope.value)));
  }

  private async eventsForDate(date: string, developerMode: boolean): Promise<TraceableEvent[]> {
    const store = currentEventReplayStore();
    if (!store) return [];
    const result = await store.query({ limit: 10_000 });
    return result.events
      .filter((event) => timelineDateKey(event.at) === date)
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

export function createTimelineStore(vaultPath: string, options: TimelineStoreOptions = {}): TimelineStore {
  return new TimelineStore(vaultPath, options);
}

function renderDailySummaryNoteBody(date: string, payload: DailySummaryPayload, context: DailyContextPacket): string {
  return [
    `# ${date} AI 每日复盘`,
    '',
    payload.narrative,
    '',
    renderStringSection('今日亮点', payload.highlights),
    renderEvidenceSection('完成清单', payload.done_list),
    renderThreadSection('主线推进', payload.main_threads),
    renderEvidenceSection('未闭环', payload.open_loops),
    renderEvidenceSection('明日延续', payload.tomorrow),
    '## 生成依据',
    '',
    `- 基于 ${context.coverage.evidence_count} 条证据`,
    `- 覆盖事件：${context.coverage.included_kinds.join('、') || '无'}`,
    `- 忽略记录：${context.coverage.omitted_count} 条`,
    ''
  ]
    .join('\n');
}

function renderStringSection(title: string, items: string[] | undefined): string {
  const lines = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return [`## ${title}`, '', ...(lines.length ? lines.map((item) => `- ${item}`) : ['- 暂无']), ''].join('\n');
}

function renderEvidenceSection(title: string, items: DailySummaryEvidenceLine[] | undefined): string {
  const lines = (items ?? []).map((item) => item.text.trim()).filter(Boolean);
  return [`## ${title}`, '', ...(lines.length ? lines.map((item) => `- ${item}`) : ['- 暂无']), ''].join('\n');
}

function renderThreadSection(title: string, items: DailySummaryPayload['main_threads']): string {
  const threads = items ?? [];
  return [
    `## ${title}`,
    '',
    ...(threads.length
      ? threads.map((item) => `- ${item.title}：${item.summary}`)
      : ['- 暂无']),
    ''
  ].join('\n');
}

function requireDefaultSynthesisRouter(vaultPath: string): SynthesisRuntimeRouter {
  try {
    return getSDKRuntime(vaultPath).router;
  } catch {
    throw new Error('daily_summary_ai_unavailable');
  }
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
    summary: summaryFor(kind, payload, event.summary),
    refs: refsFor(kind, payload),
    aggregation_key: aggregationKeyFor(kind, payload)
  };
  return base;
}

function summaryFor(kind: string, payload: Record<string, unknown>, fallback?: string): string | undefined {
  if (kind === 'note.updated' && typeof payload['word_delta'] === 'number') {
    const target = titleSuffix(payload['title']);
    return `${target ? `${target} ` : ''}${formatWordDelta(payload['word_delta'])}`;
  }
  if (kind === 'conversation.meaningful' && typeof payload['message_count'] === 'number') {
    return `${payload['message_count']} 条消息`;
  }
  const raw = payload['title'] ?? fallback;
  return raw === undefined ? undefined : String(raw).slice(0, 180);
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
  if (kind === 'daily_summary.generated') return '🌙';
  if (kind === 'library.item.read') return '📖';
  if (kind === 'library.item.annotated') return '🖍️';
  if (kind === 'library.item.distilled') return '💎';
  if (kind.startsWith('library.')) return '📚';
  if (kind === 'feed.source.added') return '📡';
  if (kind === 'feed.item.saved_to_library') return '📌';
  if (kind.startsWith('kb.')) return '🧠';
  if (kind.startsWith('scheduled_task.')) return '⏰';
  if (kind.startsWith('conversation.')) return '💬';
  if (kind.startsWith('resource.')) return '🧩';
  if (kind.startsWith('agent.')) return '🤖';
  if (kind.startsWith('task.')) return '✅';
  return '•';
}

function titleFor(kind: string, payload: Record<string, unknown>, specialKind?: string): string {
  if (specialKind) {
    const marker = specialMarkerLabel(specialKind);
    const suffix = titleSuffix(payload['title']);
    return suffix ? `${marker}${suffix}` : marker;
  }
  if (kind === 'note.created') return `捕获${noteTypeLabel(payload['type'])}${titleSuffix(payload['title'])}`;
  if (kind === 'note.updated') return `更新笔记${titleSuffix(payload['title'])}`;
  if (kind === 'note.archived') return `归档笔记${titleSuffix(payload['title'])}`;
  if (kind === 'library.item.added') return `收藏资料${titleSuffix(payload['title'])}`;
  if (kind === 'library.item.read') return `读完资料${titleSuffix(payload['title'])}`;
  if (kind === 'library.item.annotated') return `标注资料${titleSuffix(payload['title'])}`;
  if (kind === 'library.item.status_changed') return `更新资料状态为 ${statusLabel(payload['status'])}`;
  if (kind === 'library.item.distilled') return `提炼资料${titleSuffix(payload['title'])}`;
  if (kind === 'library.item.linked_to_resource') return '把资料关联到资源';
  if (kind === 'feed.source.added') return `订阅信息源${titleSuffix(payload['title'])}`;
  if (kind === 'feed.item.saved_to_library') return `从信息流收藏${titleSuffix(payload['title'])}`;
  if (kind === 'daily_summary.generated') return `生成今日总结${titleSuffix(payload['headline'])}`;
  if (kind === 'kb.imported') return `导入知识库${titleSuffix(payload['name'])}`;
  if (kind === 'kb.doc.activated' || kind === 'kb.activated') return '把知识片段沉淀为笔记';
  if (kind === 'kb.welcome_analysis_completed') return `完成知识库初始分析${titleSuffix(payload['name'])}`;
  if (kind === 'scheduled_task.created') return `创建定时任务${titleSuffix(payload['name'])}`;
  if (kind === 'scheduled_task.execution.completed') return `完成定时任务${titleSuffix(payload['name'] ?? payload['task_id'])}`;
  if (kind === 'task.completed') return `完成任务${titleSuffix(payload['title'] ?? payload['taskId'])}`;
  if (kind === 'conversation.started') return '开始一次对话';
  if (kind === 'conversation.meaningful') return '推进了一次有效讨论';
  if (kind === 'resource.created') return `创建资源主题${titleSuffix(payload['title'])}`;
  if (kind === 'resource.updated') return `更新资源主题${titleSuffix(payload['title'])}`;
  if (kind === 'resource.ref.linked') return `把素材关联到资源${titleSuffix(payload['title'])}`;
  if (kind === 'resource.ref.promoted') return `沉淀资源素材${titleSuffix(payload['title'])}`;
  if (kind === 'resource.engagement') return `推进资源主题${titleSuffix(payload['title'])}`;
  if (kind === 'resource.archived') return `归档资源主题${titleSuffix(payload['title'])}`;
  if (kind === 'agent.run.started') return '开始执行代理任务';
  if (kind === 'agent.run.completed') return '代理任务执行完成';
  if (kind === 'agent.run.interrupted') return '代理任务已中断';
  if (kind === 'runtime.sdk.invocation.started') return '开始模型调用';
  if (kind === 'runtime.sdk.cost') return '记录模型调用成本';
  if (kind === 'runtime.sdk.invocation.completed') return '模型调用完成';
  if (kind === 'synthesis.artifact.created') return '生成智能摘要素材';
  if (kind === 'synthesis.artifact.stale') return '智能摘要需要刷新';
  if (kind === 'synthesis.artifact.superseded') return '智能摘要已被新版本替换';
  if (kind === 'synthesis.artifact.failed') return '智能摘要生成失败';
  if (kind === 'synthesis.artifact.user_edited') return '用户编辑了智能摘要';
  if (kind === 'conversation.turn.added') return '记录一轮对话';
  if (kind === 'conversation.message.added') return '记录一条对话消息';
  if (kind === 'inbox.item.created') return '新增待处理事项';
  if (kind === 'inbox.item.resolved') return '处理完成待办事项';
  if (kind === 'activity.user') return '记录用户操作';
  if (kind === 'activity.system') return '记录系统操作';
  return semanticFallback(kind);
}

function refsFor(kind: string, payload: Record<string, unknown>): TimelineEntry['refs'] {
  if (kind.startsWith('note.') && typeof payload['path'] === 'string') {
    return [{ kind: 'note', ref: payload['path'], label: String(payload['title'] ?? payload['note_id'] ?? 'note') }];
  }
  if (kind === 'daily_summary.generated' && typeof payload['note_path'] === 'string') {
    return [{ kind: 'note', ref: payload['note_path'], label: String(payload['headline'] ?? '每日总结') }];
  }
  if (kind.startsWith('library.') && typeof payload['item_id'] === 'string') {
    return [{ kind: 'library', ref: payload['item_id'], label: String(payload['title'] ?? payload['item_id']) }];
  }
  if (kind === 'feed.item.saved_to_library' && typeof payload['library_item_id'] === 'string') {
    return [{ kind: 'library', ref: payload['library_item_id'], label: String(payload['title'] ?? payload['library_item_id']) }];
  }
  if (kind.startsWith('kb.') && typeof payload['kb_id'] === 'string') {
    return [{ kind: 'kb', ref: payload['kb_id'], label: String(payload['name'] ?? payload['kb_id']) }];
  }
  if (kind.startsWith('scheduled_task.') && typeof payload['task_id'] === 'string') {
    return [{ kind: 'task', ref: payload['task_id'], label: String(payload['name'] ?? payload['task_id']) }];
  }
  if (kind.startsWith('task.') && typeof payload['taskId'] === 'string') {
    return [{ kind: 'task', ref: payload['taskId'], label: String(payload['title'] ?? payload['taskId']) }];
  }
  if (kind.startsWith('conversation.') && typeof payload['conversationId'] === 'string') {
    return [{ kind: 'conversation', ref: payload['conversationId'], label: String(payload['scope'] ?? payload['conversationId']) }];
  }
  if (kind.startsWith('resource.') && typeof payload['slug'] === 'string') {
    return [{ kind: 'resource', ref: payload['slug'], label: String(payload['title'] ?? payload['slug']) }];
  }
  const refs = [...refsFromAreas(payload), ...refsFromResourceRefs(payload)];
  return refs.length > 0 ? refs : undefined;
}

function aggregationKeyFor(kind: string, payload: Record<string, unknown>): string | undefined {
  if (kind === 'note.updated' && payload['note_id']) return `note-update:${String(payload['note_id'])}`;
  if (kind === 'library.item.annotated' && payload['item_id']) return `library-annotation:${String(payload['item_id'])}`;
  if (kind === 'task.completed' && payload['projectId']) return `task-completed:${String(payload['projectId'])}`;
  return undefined;
}

function buildStats(entries: TimelineEntry[]): DailyStats {
  const originalEvents = entries.flatMap((entry) => [entry, ...(entry.derived_from ?? []).map((eventId) => ({ ...entry, event_id: eventId }))]);
  return {
    total_events: originalEvents.length,
    thoughts_count: originalEvents.filter((entry) => entry.event_kind === 'note.created' && entry.icon === '💭').length,
    longforms_wrote: entries.filter((entry) => entry.event_kind.startsWith('note.') && entry.icon === '✍️').length,
    longforms_words: sumWordDeltas(entries),
    library_added: originalEvents.filter((entry) => entry.event_kind === 'library.item.added').length,
    library_read: originalEvents.filter((entry) => entry.event_kind === 'library.item.read').length,
    tasks_completed: originalEvents.filter((entry) => entry.event_kind === 'task.completed').length,
    projects_touched: refsByKind(entries, 'project'),
    areas_touched: refsByKind(entries, 'area'),
    resources_touched: refsByKind(entries, 'resource'),
    conversations_count: originalEvents.filter((entry) => entry.event_kind.startsWith('conversation.')).length
  };
}

function refsByKind(entries: TimelineEntry[], kind: 'project' | 'area' | 'resource'): string[] {
  return [...new Set(entries.flatMap((entry) => entry.refs ?? []).filter((ref) => ref.kind === kind).map((ref) => ref.ref))];
}

function refsFromAreas(payload: Record<string, unknown>): NonNullable<TimelineEntry['refs']> {
  const areas = payload['areas'];
  if (!Array.isArray(areas)) return [];
  return areas.flatMap((area): NonNullable<TimelineEntry['refs']> => {
    if (typeof area === 'string') return [{ kind: 'area', ref: area, label: area }];
    if (typeof area === 'object' && area !== null) {
      const record = area as { id?: unknown; title?: unknown; name?: unknown };
      const ref = String(record.id ?? record.title ?? record.name ?? '');
      if (ref) return [{ kind: 'area', ref, label: String(record.title ?? record.name ?? ref) }];
    }
    return [];
  });
}

function refsFromResourceRefs(payload: Record<string, unknown>): NonNullable<TimelineEntry['refs']> {
  const refs = payload['resource_refs'];
  return Array.isArray(refs) ? refs.filter((ref): ref is string => typeof ref === 'string').map((ref) => ({ kind: 'resource', ref, label: ref })) : [];
}

function deriveEntryRelations(entries: TimelineEntry[]): TimelineEntry[] {
  const feedPromotions = new Map<string, TimelineEntry>();
  for (const entry of entries) {
    if (entry.event_kind !== 'feed.item.saved_to_library') continue;
    for (const ref of entry.refs ?? []) {
      if (ref.kind === 'library') feedPromotions.set(ref.ref, entry);
    }
  }
  return entries.map((entry) => {
    if (entry.event_kind !== 'library.item.added') return entry;
    const libraryRef = entry.refs?.find((ref) => ref.kind === 'library')?.ref;
    const feedEntry = libraryRef ? feedPromotions.get(libraryRef) : undefined;
    if (!feedEntry) return entry;
    return { ...entry, derived_from: [...new Set([...(entry.derived_from ?? []), feedEntry.event_id])] };
  });
}

function aggregateEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const sorted = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const result: TimelineEntry[] = [];
  const windowMs = 10 * 60 * 1000;
  for (const entry of sorted) {
    const last = result[result.length - 1];
    if (!entry.aggregation_key || !last?.aggregation_key || entry.aggregation_key !== last.aggregation_key) {
      result.push(entry);
      continue;
    }
    const delta = Date.parse(entry.occurred_at) - Date.parse(last.occurred_at);
    if (delta < 0 || delta > windowMs) {
      result.push(entry);
      continue;
    }
    const derived = [...new Set([...(last.derived_from ?? []), entry.event_id, ...(entry.derived_from ?? [])])];
    result[result.length - 1] = {
      ...last,
      title: aggregateTitle(last, derived.length + 1),
      summary: aggregateSummary(last, entry),
      derived_from: derived
    };
  }
  return result;
}

function aggregateTitle(entry: TimelineEntry, count: number): string {
  if (entry.event_kind === 'note.updated') return `持续写作（${count} 次保存）`;
  if (entry.event_kind === 'library.item.annotated') return `连续标注资料（${count} 条）`;
  if (entry.event_kind === 'task.completed') return `完成 ${count} 个任务`;
  return `${entry.title}（${count} 条记录）`;
}

function aggregateSummary(a: TimelineEntry, b: TimelineEntry): string | undefined {
  if (a.event_kind === 'note.updated') {
    const words = wordDeltaFromSummary(a.summary) + wordDeltaFromSummary(b.summary);
    if (words !== 0) return `累计${formatWordDelta(words)}`;
  }
  return a.summary ?? b.summary;
}

function groupByTimeSegment(entries: TimelineEntry[]): TimeSegmentGroup[] {
  const definitions: Array<Omit<TimeSegmentGroup, 'entries'> & { from: number; to: number }> = [
    { id: 'night', label: '凌晨', range: '00:00-06:00', from: 0, to: 6 },
    { id: 'morning', label: '上午', range: '06:00-12:00', from: 6, to: 12 },
    { id: 'noon', label: '中午', range: '12:00-14:00', from: 12, to: 14 },
    { id: 'afternoon', label: '下午', range: '14:00-18:00', from: 14, to: 18 },
    { id: 'evening', label: '晚上', range: '18:00-24:00', from: 18, to: 24 }
  ];
  return definitions
    .map(({ from, to, ...segment }) => ({
      ...segment,
      entries: entries.filter((entry) => {
        const hour = wallClockHour(entry.occurred_at);
        return hour >= from && hour < to;
      })
    }))
    .filter((segment) => segment.entries.length > 0);
}

function mergeStats(stats: DailyStats[]): DailyStats {
  return {
    total_events: sum(stats, 'total_events'),
    thoughts_count: sum(stats, 'thoughts_count'),
    longforms_wrote: sum(stats, 'longforms_wrote'),
    longforms_words: sum(stats, 'longforms_words'),
    library_added: sum(stats, 'library_added'),
    library_read: sum(stats, 'library_read'),
    tasks_completed: sum(stats, 'tasks_completed'),
    projects_touched: unique(stats.flatMap((item) => item.projects_touched)),
    areas_touched: unique(stats.flatMap((item) => item.areas_touched)),
    resources_touched: unique(stats.flatMap((item) => item.resources_touched)),
    conversations_count: sum(stats, 'conversations_count')
  };
}

function sum(stats: DailyStats[], key: keyof Pick<DailyStats, 'total_events' | 'thoughts_count' | 'longforms_wrote' | 'longforms_words' | 'library_added' | 'library_read' | 'tasks_completed' | 'conversations_count'>): number {
  return stats.reduce((total, item) => total + item[key], 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sumWordDeltas(entries: TimelineEntry[]): number {
  return entries.reduce((total, entry) => total + wordDeltaFromSummary(entry.summary), 0);
}

function wordDeltaFromSummary(summary: string | undefined): number {
  if (!summary) return 0;
  const added = summary.match(/新增\s+(\d+)\s*字/);
  if (added) return Number(added[1]);
  const removed = summary.match(/删减\s+(\d+)\s*字/);
  if (removed) return -Number(removed[1]);
  const legacy = summary.match(/([+-]?\d+)\s+words?/);
  return legacy ? Number(legacy[1]) : 0;
}

function formatWordDelta(value: number): string {
  if (value > 0) return `新增 ${value} 字`;
  if (value < 0) return `删减 ${Math.abs(value)} 字`;
  return '字数无变化';
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

function renderTimelineText(timeline: DailyTimeline): string {
  const summary = timeline.summary ? `今日总结：${timeline.summary.headline}\n${timeline.summary.narrative}\n\n` : '';
  const stats = `记录：${timeline.stats.total_events}  想法：${timeline.stats.thoughts_count}  收藏：${timeline.stats.library_added}  讨论：${timeline.stats.conversations_count}\n\n`;
  const entries = (timeline.segments ?? groupByTimeSegment(timeline.entries))
    .map(
      (segment) =>
        `${segment.label} (${segment.range})\n${segment.entries
          .map((entry) => `  ${wallClockTime(entry.occurred_at)} ${entry.icon} ${entry.title}${entry.summary ? ` - ${entry.summary}` : ''}`)
          .join('\n')}`
    )
    .join('\n\n');
  return `今日回顾 ${timeline.date}\n\n${summary}${stats}${entries || '暂无可复盘记录。'}`;
}

function renderWeekText(week: WeeklyTimeline): string {
  return `周回顾 ${week.iso_week}\n${week.range.from} 至 ${week.range.to}\n\n${week.days
    .map((day) => `${day.date}: ${day.stats.total_events} 条记录${day.summary?.headline ? ` - ${day.summary.headline}` : ''}`)
    .join('\n')}`;
}

function renderMonthText(index: MonthlyIndex): string {
  return `月回顾 ${index.month}\n\n${index.days.map((day) => `${day.date}: ${day.entry_count} 条记录`).join('\n')}`;
}

function renderYearText(index: YearlyIndex): string {
  return `年回顾 ${index.year}\n\n${index.months
    .map((month) => `${month.month}: ${month.total_events} 条记录，${month.days_active} 个活跃日`)
    .join('\n')}`;
}

function noteTypeLabel(value: unknown): string {
  const type = String(value ?? 'note');
  if (type === 'thought') return '想法';
  if (type === 'longform') return '长文';
  if (type === 'voice_log') return '语音日志';
  if (type === 'daily_summary') return '每日总结';
  if (type === 'capture') return '捕获';
  return '笔记';
}

function statusLabel(value: unknown): string {
  const status = String(value ?? 'unknown');
  if (status === 'unread') return '待读';
  if (status === 'reading') return '阅读中';
  if (status === 'read') return '已读';
  if (status === 'distilled') return '已提炼';
  if (status === 'archived') return '已归档';
  return '已更新';
}

function specialMarkerLabel(value: string): string {
  if (value === 'insight') return '灵感时刻';
  if (value === 'breakthrough') return '突破';
  if (value === 'setback') return '挫折';
  if (value === 'milestone') return '里程碑';
  if (value === 'gratitude') return '感恩';
  if (value === 'reflection') return '反思';
  return '特殊记录';
}

function titleSuffix(value: unknown): string {
  const title = String(value ?? '').trim();
  return title ? `《${title}》` : '';
}

function semanticFallback(kind: string): string {
  return kind ? '未分类记录' : '记录';
}

function timelineDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T/);
    return match?.[1] ?? value.slice(0, 10);
  }
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0')
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

function renderSimplePdf(text: string): Buffer {
  const lines = text
    .split('\n')
    .flatMap((line) => wrapLine(line, 92))
    .slice(0, 45);
  const content = ['BT', '/F1 10 Tf', '50 780 Td', '14 TL', ...lines.map((line, index) => `${index === 0 ? '' : 'T* '}${pdfText(line)} Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += width) chunks.push(line.slice(index, index + width));
  return chunks;
}

function pdfText(value: string): string {
  return `(${value.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
