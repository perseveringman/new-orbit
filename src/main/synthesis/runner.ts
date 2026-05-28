import { createHash, randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type {
  DailySummaryPayload,
  EntityProfilePayload,
  EnsureSynthesisInput,
  ExternalSessionDistillPayload,
  PersonalQAPayload,
  ResourceEmergencePayload,
  SynthesisArtifact,
  SynthesisJob,
  SynthesisKind,
  SynthesisProvenance,
  SynthesisSource
} from '@shared/synthesis';
import type { EvidenceSelector } from '@shared/evidence';
import type { FeedClusterPayload, FeedDigestPayload, FeedItemAnalysisPayload, FeedReportPayload } from '@shared/feed';
import type { NoteWorkbenchPayload } from '@shared/note';
import type { RuntimeRouteDecision, SDKInvocationInput } from '@shared/runtime';
import type { SDKInvocationResult } from '../runtime/sdk/anthropic-sdk-adapter';
import { roughTokenEstimate } from '../runtime/sdk/cost';
import { getPromptTemplate } from './prompts/registry';
import type { SynthesisStore } from './store';

export interface SynthesisRunnerOptions {
  router?: SynthesisRuntimeRouter | null;
  maxBudgetUsd?: number;
  requireSdk?: boolean;
  timeoutMs?: number;
}

export interface SynthesisRuntimeRouter {
  decide(input: { mode: 'synthesis'; modelTier?: 'heavy' }): Promise<RuntimeRouteDecision>;
  stream(
    input: SDKInvocationInput & { signal?: AbortSignal },
    windows: () => BrowserWindow[]
  ): Promise<SDKInvocationResult>;
}

export class SynthesisRunner {
  constructor(
    private readonly store: SynthesisStore,
    private readonly options: SynthesisRunnerOptions = {}
  ) {}

  async run(job: SynthesisJob): Promise<SynthesisArtifact> {
    const template = getPromptTemplate(job.kind);
    const effectiveBudget = job.budget_usd ?? template.defaultBudget.usd;
    if (effectiveBudget !== undefined && this.options.maxBudgetUsd !== undefined && effectiveBudget > this.options.maxBudgetUsd) {
      const error = `synthesis_budget_exceeded:${effectiveBudget}`;
      await this.store.pushDlq({ ...job, status: 'budget_exceeded', error }, error);
      throw new Error(error);
    }

    const promptInput = { kind: job.kind, scope_key: job.scope_key, sources: job.sources };
    const rendered = template.render(promptInput);
    const traceId = `synthesis-${randomUUID()}`;
    const started = new Date().toISOString();

    try {
      if (this.options.router) {
        const decision = await withTimeout(
          this.options.router.decide({ mode: 'synthesis', modelTier: 'heavy' }),
          this.options.timeoutMs,
          'synthesis_route_timeout'
        );
        if (decision.track === 'sdk') {
          const controller = this.options.timeoutMs ? new AbortController() : null;
          const streamInput: SDKInvocationInput & { signal?: AbortSignal } = {
            endpointId: decision.endpointId,
            model: decision.model,
            modelTier: 'heavy',
            system: rendered.system,
            messages: [{ role: 'user', content: rendered.user }],
            traceId,
            conversationId: traceId,
            mode: 'synthesis',
            ...(controller ? { signal: controller.signal } : {})
          };
          const result = await withTimeout(
            this.options.router.stream(streamInput, () => []),
            this.options.timeoutMs,
            'synthesis_stream_timeout',
            () => controller?.abort()
          );
          const payload = template.parse(result.text);
          return this.store.writeFresh({
            kind: job.kind,
            scope_key: job.scope_key,
            sources: job.sources,
            payload,
            provenance: {
              runtime: decision.runtime,
              model: decision.model ?? 'unknown',
              prompt_version: template.version,
              generated_at: started,
              tokens: { input: result.inputTokens, output: result.outputTokens },
              ...(result.totalUsd !== undefined ? { cost_usd: result.totalUsd } : {}),
              trace_id: traceId
            }
          });
        }
      }

      if (this.options.requireSdk) throw new Error('synthesis_sdk_unavailable');

      const payload = localSynthesis(job.kind, job.sources);
      return this.store.writeFresh({
        kind: job.kind,
        scope_key: job.scope_key,
        sources: job.sources,
        payload,
        provenance: {
          runtime: 'local:heuristic',
          model: 'orbit-local-heuristic',
          prompt_version: template.version,
          generated_at: started,
          tokens: {
            input: roughTokenEstimate(rendered.system + rendered.user),
            output: roughTokenEstimate(JSON.stringify(payload))
          },
          trace_id: traceId
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.pushDlq({ ...job, status: 'failed', error: message }, message);
      return this.store.writeFailed({
        kind: job.kind,
        scope_key: job.scope_key,
        sources: job.sources,
        error: message,
        provenance: {
          runtime: 'failed',
          model: 'unknown',
          prompt_version: template.version,
          generated_at: started,
          trace_id: traceId
        }
      });
    }
  }
}

export function createSynthesisJob(input: EnsureSynthesisInput): SynthesisJob {
  return {
    id: `synthesis-job-${randomUUID()}`,
    kind: input.kind,
    scope_key: input.scope_key,
    sources: input.sources,
    priority: input.priority ?? 'interactive',
    reason: input.reason ?? (input.force ? 'manual' : 'missing'),
    created_at: new Date().toISOString(),
    ...(input.budget_usd !== undefined ? { budget_usd: input.budget_usd } : {}),
    status: 'queued'
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  errorCode: string,
  onTimeout?: () => void
): Promise<T> {
  if (timeoutMs === undefined || timeoutMs <= 0) return promise;
  let timeoutId: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${errorCode}:${timeoutMs}`));
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeoutId));
  });
}

function localSynthesis(kind: SynthesisKind, sources: SynthesisSource[]): unknown {
  if (kind === 'summary.daily') return localDailySummary(sources);
  if (kind === 'summary.entity') return localEntitySummary(sources);
  if (kind === 'annotation.selection') return localAnnotationSelection(sources);
  if (kind === 'emerge.resource') return localResourceEmergence(sources);
  if (kind === 'distill.library') {
    const first = sources[0];
    const title = String(first?.title ?? first?.metadata?.['title'] ?? 'Library distill');
    const excerpt = String(first?.excerpt ?? first?.metadata?.['content'] ?? '');
    return {
      title,
      summary: excerpt.slice(0, 600) || 'No content available to distill.',
      key_points: excerpt ? [excerpt.slice(0, 180)] : [],
      suggested_note_type: 'capture'
    };
  }
  if (kind === 'classify.area') return { suggestions: [] };
  if (kind === 'relate.notes') return { relations: localNoteRelations(sources) };
  if (kind === 'search.answer') return localSearchAnswer(sources);
  if (kind === 'qa.personal') return localPersonalQA(sources);
  if (kind === 'distill.external_session') return localExternalSessionDistill(sources);
  if (kind === 'entity.profile') return localEntityProfile(sources);
  if (kind === 'feed.item.analysis') return localFeedItemAnalysis(sources);
  if (kind === 'feed.digest') return localFeedDigest(sources);
  if (kind === 'feed.cluster') return localFeedCluster(sources);
  if (kind === 'feed.report.daily') return localFeedReport(sources);
  return {};
}

function localAnnotationSelection(sources: SynthesisSource[]): unknown {
  const raw = sources.find((source) => source.kind === 'raw')?.metadata;
  const action = raw?.['action'];
  const selected = String(raw?.['selected_text'] ?? '');
  return {
    action:
      action === 'translate' || action === 'explain' || action === 'formula' || action === 'related'
        ? action
        : 'explain',
    title: 'AI 标注不可用',
    body_markdown: selected
      ? `AI Endpoint 未配置，无法生成真实 AI 标注。\n\n> ${selected.slice(0, 240)}`
      : 'AI Endpoint 未配置，无法生成真实 AI 标注。',
    confidence: 0,
    warnings: ['sdk_unavailable']
  };
}

function localDailySummary(sources: SynthesisSource[]): DailySummaryPayload {
  const timeline = sources.find((source) => source.kind === 'timeline_range')?.metadata as
    | {
        packet?: {
          entries?: Array<{ icon?: string; title?: string }>;
          stats?: { total_events?: number };
          coverage?: { evidence_count?: number; included_kinds?: string[]; omitted_count?: number };
        };
        entries?: Array<{ icon?: string; title?: string }>;
        stats?: { total_events?: number };
      }
    | undefined;
  const entries = timeline?.entries ?? timeline?.packet?.entries ?? [];
  const count = timeline?.stats?.total_events ?? timeline?.packet?.stats?.total_events ?? entries.length;
  const highlights = entries.slice(0, 5).map((entry) => `${entry.icon ?? '•'} ${entry.title ?? '时间线记录'}`);
  return {
    headline: count > 0 ? `${count} 条可复盘记录` : '安静的一天',
    narrative:
      count > 0
        ? `Orbit 捕获了 ${count} 条时间线记录：${highlights.join(' / ')}。`
        : '今天还没有捕获到可复盘的用户活动。',
    highlights: highlights.length > 0 ? highlights : ['暂无可复盘记录'],
    done_list: highlights.map((text, index) => ({ text, evidence_ids: [`local-${index + 1}`] })),
    main_threads: [],
    open_loops: [],
    tomorrow: [],
    coverage: {
      evidence_count: timeline?.packet?.coverage?.evidence_count ?? entries.length,
      included_kinds: timeline?.packet?.coverage?.included_kinds ?? [],
      omitted_count: timeline?.packet?.coverage?.omitted_count ?? 0
    }
  };
}

function localResourceEmergence(sources: SynthesisSource[]): ResourceEmergencePayload {
  const raw = sources.find((source) => source.kind === 'raw')?.metadata;
  const suggestions = Array.isArray(raw?.['suggestions']) ? raw['suggestions'] : [];
  return { suggestions: suggestions as ResourceEmergencePayload['suggestions'] };
}

function localEntitySummary(sources: SynthesisSource[]): NoteWorkbenchPayload {
  const raw = sources.find((source) => source.kind === 'raw')?.metadata;
  if (raw && typeof raw === 'object') {
    const payload = raw['payload'];
    if (payload && typeof payload === 'object') return payload as NoteWorkbenchPayload;
  }
  const first = sources[0];
  const excerpt = String(first?.excerpt ?? first?.metadata?.['content'] ?? '');
  return {
    summary: excerpt.slice(0, 420) || 'No entity content available.',
    key_points: excerpt ? [excerpt.slice(0, 160)] : [],
    suggested_tags: [],
    suggestions: [],
    relations: []
  };
}

function localNoteRelations(sources: SynthesisSource[]): NoteWorkbenchPayload['relations'] {
  const raw = sources.find((source) => source.kind === 'raw')?.metadata;
  const relations = raw && typeof raw === 'object' ? raw['relations'] : undefined;
  return Array.isArray(relations) ? (relations as NoteWorkbenchPayload['relations']) : [];
}

function localSearchAnswer(sources: SynthesisSource[]): { answer: string; citations: Array<{ doc_id: string; title: string }>; confidence: number } {
  const top = sources.slice(0, 5);
  if (!top.length) {
    return {
      answer: 'No matching Orbit documents were found.',
      citations: [],
      confidence: 0
    };
  }
  const citations = top.map((source) => ({
    doc_id: source.ref ?? 'unknown',
    title: source.title ?? source.ref ?? 'Untitled'
  }));
  const answer = `I found ${top.length} relevant Orbit document(s). The strongest matches are ${citations.map((item) => item.title).join(', ')}.`;
  return { answer, citations, confidence: 0.55 };
}

function localPersonalQA(sources: SynthesisSource[]): PersonalQAPayload {
  const top = sources.slice(0, 4);
  const title = top[0]?.title ?? top[0]?.ref ?? 'this evidence';
  const excerpts = top.map((source) => source.excerpt).filter((excerpt): excerpt is string => Boolean(excerpt));
  return {
    question: `What do I know about ${title}?`,
    answer: excerpts.length
      ? `Based on ${top.length} source(s): ${excerpts.map((excerpt, index) => `${index + 1}. ${excerpt.slice(0, 180)}`).join(' ')}`
      : 'No source excerpts were provided.',
    confidence: excerpts.length ? 0.45 : 0,
    entities: [],
    evidence: [],
    source_chunk_ids: top
      .map((source) => source.metadata?.['chunk_id'])
      .filter((value): value is string => typeof value === 'string'),
    source_hash: createHash('sha256').update(JSON.stringify(top.map((source) => [source.kind, source.ref, source.excerpt]))).digest('hex'),
    useful_for: ['ask']
  };
}

function localExternalSessionDistill(sources: SynthesisSource[]): ExternalSessionDistillPayload {
  const source = sources[0];
  const excerpt = String(source?.excerpt ?? '');
  const selector = selectorFromSource(source);
  const lines = meaningfulLines(excerpt);
  const agent = stringFromMetadata(source, 'agent');
  const projectRef = stringFromMetadata(source, 'project_ref') ?? stringFromMetadata(source, 'project_name');
  const entities = uniqueStrings([
    ...stringArrayFromMetadata(source, 'entities'),
    ...extractCapitalizedEntities(excerpt)
  ]).slice(0, 12);
  const decisionLines = lines.filter((line) => /decision|decided|choose|选择|决定|结论|should|must/u.test(line.toLowerCase())).slice(0, 5);
  const openLoopLines = lines.filter((line) => /\?|？|todo|follow|next|block|blocked|待办|下一步|问题|卡住/u.test(line.toLowerCase())).slice(0, 5);
  const keyPoints = lines.slice(0, 6).map((line) => trimSentence(line, 180));
  const sourceId = String(source?.ref ?? selector?.source_id ?? 'external-session');
  const evidence = selector ? [selector] : [];
  return {
    source_id: sourceId,
    title: String(source?.title ?? 'Agent session'),
    ...(agent ? { agent } : {}),
    ...(projectRef ? { project_ref: projectRef } : {}),
    summary: excerpt
      ? trimSentence(excerpt.replace(/\s+/gu, ' '), 520)
      : 'No safe projection was available for this external agent session.',
    key_points: keyPoints.length ? keyPoints : ['No key points could be derived from the safe projection.'],
    decisions: decisionLines.map((line) => ({ title: trimSentence(line, 160), evidence })),
    open_loops: openLoopLines.map((line) => ({ title: trimSentence(line, 160), evidence })),
    next_actions: openLoopLines.map((line) => trimSentence(line, 140)),
    entities,
    evidence,
    source_hash: String(source?.metadata?.['source_hash'] ?? hashSources(sources))
  };
}

function localEntityProfile(sources: SynthesisSource[]): EntityProfilePayload {
  const raw = sources.find((source) => source.kind === 'raw')?.metadata;
  const entity = typeof raw?.['entity'] === 'string'
    ? raw['entity']
    : String(sources[0]?.title ?? sources[0]?.ref ?? 'Entity');
  const excerpt = sources.map((source) => source.excerpt).filter(Boolean).join('\n');
  const evidence = selectorArrayFromUnknown(raw?.['evidence']);
  const related = Array.isArray(raw?.['related_entities'])
    ? raw['related_entities'] as EntityProfilePayload['related_entities']
    : [];
  const topSources = Array.isArray(raw?.['top_sources'])
    ? raw['top_sources'] as EntityProfilePayload['top_sources']
    : [];
  return {
    entity,
    summary: excerpt
      ? `${entity} appears across ${topSources.length || sources.length} source(s). ${trimSentence(excerpt.replace(/\s+/gu, ' '), 360)}`
      : `${entity} is present in the personal knowledge graph, but there is not enough source text for a rich profile yet.`,
    aliases: stringArrayFromUnknown(raw?.['aliases']),
    related_entities: related.slice(0, 10),
    top_sources: topSources.slice(0, 8),
    open_questions: meaningfulLines(excerpt)
      .filter((line) => /\?|？|unknown|unclear|待定|问题/u.test(line.toLowerCase()))
      .slice(0, 5)
      .map((line) => trimSentence(line, 140)),
    evidence,
    source_hash: String(raw?.['source_hash'] ?? hashSources(sources))
  };
}

function localFeedItemAnalysis(sources: SynthesisSource[]): FeedItemAnalysisPayload {
  const source = sources[0];
  const text = `${source?.title ?? ''}\n${source?.excerpt ?? ''}`;
  const entities = extractCapitalizedEntities(text).slice(0, 10);
  const related = localFeedRelatedRefs(source);
  const relevance = localFeedRelevance(source);
  const novelty = localFeedNovelty(source, sources);
  const triage = relevance >= 0.72 ? 'save' : relevance >= 0.48 ? 'skim' : 'ignore';
  const itemId = String(source?.ref ?? 'feed-item');
  const summary = trimSentence(String(source?.excerpt ?? source?.title ?? 'Feed signal'), 420);
  return {
    item_id: itemId,
    summary,
    key_points: localFeedLines(source).slice(0, 5),
    key_claims: localFeedLines(source).slice(0, 4),
    entities,
    why_it_matters: related.length
      ? `与 ${related.map((item) => item.title ?? item.ref).join('、')} 有显式关联，值得进一步分拣。`
      : relevance >= 0.5
        ? '该信号与来源标题、标签或摘要中的高频主题相关，适合快速扫读后决定是否保存。'
        : '目前缺少与用户 Area/Resource 的明确关联，适合略读或忽略。',
    triage_label: triage,
    relevance_score: relevance,
    novelty_score: novelty,
    confidence: source?.excerpt ? 0.62 : 0.38,
    related,
    suggested_actions: [
      triage === 'ignore' ? '忽略此信号，避免污染资料库。' : '判断是否保存到资料库。',
      related.length ? '保存时带上相关 Area/Resource 引用。' : '如果反复出现，再考虑建立 Resource 或 Watch。'
    ],
    action_candidates: [
      triage === 'ignore'
        ? { kind: 'ignore', label: '忽略', reason: '相关性较低，当前不值得进入 Library。', item_ids: [itemId], confidence: 0.62 }
        : {
            kind: related.some((item) => item.kind === 'resource') ? 'save_to_library_with_resource' : 'save_to_library',
            label: '保存到资料库',
            reason: related.length ? '此信号与已有关注方向有明确连接。' : '内容可能值得读完后再提炼。',
            item_ids: [itemId],
            resource_ref: related.find((item) => item.kind === 'resource')?.ref,
            confidence: relevance
          }
    ],
    risks: source?.excerpt ? [] : ['缺少可读正文，判断主要依赖标题和来源元数据。']
  };
}

function localFeedDigest(sources: SynthesisSource[]): FeedDigestPayload {
  const date = dateFromFeedScope(sources);
  const ranked = [...sources].sort((a, b) => localFeedRelevance(b) - localFeedRelevance(a));
  return {
    date,
    item_count: sources.length,
    headline: sources.length ? `${sources.length} 条 Feed 信号，优先处理 ${Math.min(5, sources.length)} 条` : '今天没有新的 Feed 信号',
    highlights: ranked.slice(0, 8).map((source) => ({
      item_id: String(source.ref ?? ''),
      source_id: String(source.metadata?.['source_id'] ?? ''),
      title: source.title ?? String(source.ref ?? 'Untitled'),
      url: String(source.metadata?.['url'] ?? ''),
      published_at: typeof source.metadata?.['published_at'] === 'string' ? source.metadata['published_at'] : undefined,
      summary: trimSentence(String(source.excerpt ?? ''), 240),
      why_it_matters: localFeedRelatedRefs(source).length
        ? '命中已有 Area/Resource 关注方向。'
        : '来自订阅源的新信号，适合快速扫读。',
      relevance_score: localFeedRelevance(source),
      novelty_score: localFeedNovelty(source, sources),
      suggested_action: localFeedRelevance(source) >= 0.55 ? 'save_to_library' : 'watch'
    })),
    recommendations: ranked.slice(0, 3).map((source) => ({
      kind: localFeedRelevance(source) >= 0.55 ? 'save_to_library' : 'watch',
      label: localFeedRelevance(source) >= 0.55 ? '优先判断是否保存' : '观察是否重复出现',
      reason: source.title ?? source.ref ?? 'Feed signal',
      item_ids: source.ref ? [source.ref] : [],
      confidence: localFeedRelevance(source)
    }))
  };
}

function localFeedCluster(sources: SynthesisSource[]): FeedClusterPayload {
  const buckets = new Map<string, SynthesisSource[]>();
  for (const source of sources) {
    const label = localFeedClusterLabel(source);
    buckets.set(label, [...(buckets.get(label) ?? []), source]);
  }
  return {
    scope: String(sources[0]?.metadata?.['scope'] ?? 'all'),
    clusters: [...buckets.entries()].slice(0, 8).map(([label, bucket]) => ({
      label,
      item_ids: bucket.map((source) => String(source.ref ?? '')).filter(Boolean),
      source_ids: uniqueStrings(bucket.map((source) => String(source.metadata?.['source_id'] ?? '')).filter(Boolean)),
      rationale: `按标题、摘要和显式关注方向聚合了 ${bucket.length} 条信号。`,
      key_claims: bucket.flatMap((source) => localFeedLines(source).slice(0, 1)).slice(0, 5),
      relevance_score: Math.max(...bucket.map(localFeedRelevance), 0),
      novelty_score: Math.max(...bucket.map((source) => localFeedNovelty(source, sources)), 0),
      related: bucket.flatMap(localFeedRelatedRefs).slice(0, 5),
      suggested_actions: [
        {
          kind: bucket.some((source) => localFeedRelevance(source) >= 0.55) ? 'save_to_library' : 'watch',
          label: bucket.some((source) => localFeedRelevance(source) >= 0.55) ? '保存代表性条目' : '继续观察',
          reason: `${label} 主题出现 ${bucket.length} 次。`,
          item_ids: bucket.map((source) => String(source.ref ?? '')).filter(Boolean),
          confidence: Math.min(0.85, 0.45 + bucket.length * 0.1)
        }
      ]
    }))
  };
}

function localFeedReport(sources: SynthesisSource[]): FeedReportPayload {
  const digestArtifactId = stringFromMetadata(sources[0], 'digest_artifact_id');
  const clusterArtifactId = stringFromMetadata(sources[0], 'cluster_artifact_id');
  const bySource = new Map<string, SynthesisSource[]>();
  for (const source of sources) {
    const key = String(source.metadata?.['source_id'] ?? 'unknown');
    bySource.set(key, [...(bySource.get(key) ?? []), source]);
  }
  const ranked = [...sources].sort((a, b) => localFeedRelevance(b) - localFeedRelevance(a));
  return {
    date: dateFromFeedScope(sources),
    item_count: sources.length,
    ...(digestArtifactId ? { digest_artifact_id: digestArtifactId } : {}),
    ...(clusterArtifactId ? { cluster_artifact_id: clusterArtifactId } : {}),
    headline: sources.length ? `今日 Feed 有 ${sources.length} 条信号，${ranked[0]?.title ?? '暂无明显主线'}` : '今日 Feed 没有新信号',
    executive_summary: ranked.length
      ? `优先关注：${ranked.slice(0, 3).map((source) => source.title ?? source.ref).join(' / ')}。`
      : '没有足够信号生成报告。',
    sections: [...bySource.entries()].map(([sourceId, bucket]) => ({
      title: sourceId,
      item_ids: bucket.map((source) => String(source.ref ?? '')).filter(Boolean),
      summary: bucket.slice(0, 3).map((source) => source.title ?? source.ref ?? 'Untitled').join(' / '),
      key_changes: bucket.flatMap((source) => localFeedLines(source).slice(0, 1)).slice(0, 4),
      repeated_claims: repeatedFeedClaims(bucket),
      why_it_matters: bucket.some((source) => localFeedRelatedRefs(source).length > 0)
        ? '该组信号命中已有关注方向。'
        : '该组信号目前主要作为来源动态观察。',
      recommended_item_ids: bucket
        .filter((source) => localFeedRelevance(source) >= 0.55)
        .map((source) => String(source.ref ?? ''))
        .filter(Boolean)
    })),
    recommendations: ranked.slice(0, 5).map((source) => ({
      kind: localFeedRelevance(source) >= 0.55 ? 'save_to_library' : 'watch',
      label: localFeedRelevance(source) >= 0.55 ? '保存代表性信号' : '保持观察',
      reason: source.title ?? source.ref ?? 'Feed signal',
      item_ids: source.ref ? [source.ref] : [],
      confidence: localFeedRelevance(source)
    }))
  };
}

function localFeedRelatedRefs(source: SynthesisSource | undefined): NonNullable<FeedItemAnalysisPayload['related']> {
  const areaRefs = stringArrayFromMetadata(source, 'area_refs');
  const resourceRefs = stringArrayFromMetadata(source, 'resource_refs');
  return [
    ...areaRefs.map((ref) => ({
      kind: 'area' as const,
      ref,
      confidence: 0.72,
      reason: '来源显式关联到这个 Area。'
    })),
    ...resourceRefs.map((ref) => ({
      kind: 'resource' as const,
      ref,
      confidence: 0.78,
      reason: '来源显式关联到这个 Resource。'
    }))
  ];
}

function localFeedRelevance(source: SynthesisSource | undefined): number {
  if (!source) return 0;
  let score = 0.35;
  if (localFeedRelatedRefs(source).length > 0) score += 0.35;
  if (stringArrayFromMetadata(source, 'tags').length > 0) score += 0.1;
  if (String(source.excerpt ?? '').length > 280) score += 0.08;
  if (source.metadata?.['source_priority'] === 'high') score += 0.12;
  if (source.metadata?.['status'] === 'saved') score += 0.12;
  return Math.max(0, Math.min(1, score));
}

function localFeedNovelty(source: SynthesisSource | undefined, allSources: SynthesisSource[]): number {
  if (!source) return 0;
  const label = localFeedClusterLabel(source);
  const peers = allSources.filter((item) => localFeedClusterLabel(item) === label).length;
  const base = peers <= 1 ? 0.76 : peers === 2 ? 0.58 : 0.42;
  return Math.max(0, Math.min(1, base));
}

function localFeedLines(source: SynthesisSource | undefined): string[] {
  const excerpt = String(source?.excerpt ?? '');
  const lines = meaningfulLines(excerpt).slice(0, 8);
  return lines.length ? lines : [trimSentence(String(source?.title ?? source?.ref ?? 'Feed signal'), 160)];
}

function localFeedClusterLabel(source: SynthesisSource): string {
  const text = `${source.title ?? ''} ${source.excerpt ?? ''}`;
  const explicit = stringArrayFromMetadata(source, 'resource_refs')[0] ?? stringArrayFromMetadata(source, 'area_refs')[0];
  if (explicit) return explicit;
  return extractCapitalizedEntities(text)[0]?.toLowerCase() ?? text.split(/\s+/u).find((part) => part.length > 4)?.toLowerCase() ?? 'signals';
}

function repeatedFeedClaims(sources: SynthesisSource[]): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const line of localFeedLines(source).slice(0, 3)) {
      const key = trimSentence(line.toLowerCase(), 80);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([line]) => line)
    .slice(0, 5);
}

function dateFromFeedScope(sources: SynthesisSource[]): string {
  const scope = String(sources[0]?.metadata?.['scope_key'] ?? sources[0]?.metadata?.['scope'] ?? '');
  const match = scope.match(/\d{4}-\d{2}-\d{2}/u);
  if (match) return match[0];
  const fetchedAt = sources.map((source) => String(source.metadata?.['fetched_at'] ?? '')).find(Boolean);
  return fetchedAt?.match(/\d{4}-\d{2}-\d{2}/u)?.[0] ?? new Date().toISOString().slice(0, 10);
}

function selectorFromSource(source: SynthesisSource | undefined): EvidenceSelector | null {
  return selectorFromUnknown(source?.metadata?.['selector']);
}

function selectorFromUnknown(value: unknown): EvidenceSelector | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<EvidenceSelector>;
  if (typeof candidate.source_id !== 'string' || typeof candidate.kind !== 'string' || typeof candidate.content_view !== 'string') {
    return null;
  }
  return candidate as EvidenceSelector;
}

function selectorArrayFromUnknown(value: unknown): EvidenceSelector[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const selector = selectorFromUnknown(item);
    return selector ? [selector] : [];
  }) : [];
}

function stringFromMetadata(source: SynthesisSource | undefined, key: string): string | undefined {
  const value = source?.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArrayFromMetadata(source: SynthesisSource | undefined, key: string): string[] {
  return stringArrayFromUnknown(source?.metadata?.[key]);
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function meaningfulLines(text: string): string[] {
  return uniqueStrings(
    text
      .split(/\n+|(?<=[。！？.!?])\s+/u)
      .map((line) => line.replace(/^(user|assistant|system|tool):\s*/iu, '').trim())
      .filter((line) => line.length >= 16)
  ).slice(0, 24);
}

function extractCapitalizedEntities(text: string): string[] {
  return Array.from(text.matchAll(/\b[A-Z][A-Za-z0-9_.:-]{1,40}(?:\s+[A-Z][A-Za-z0-9_.:-]{1,40}){0,2}\b/g))
    .map((match) => match[0])
    .filter((item) => item.length > 2);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimSentence(value: string, max: number): string {
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max).trim()}...`;
}

function hashSources(sources: SynthesisSource[]): string {
  return createHash('sha256')
    .update(JSON.stringify(sources.map((source) => [source.kind, source.ref, source.title, source.excerpt, source.metadata])))
    .digest('hex');
}
