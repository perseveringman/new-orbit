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
import type { NoteWorkbenchPayload } from '@shared/note';
import type { RuntimeRouteDecision, SDKInvocationInput } from '@shared/runtime';
import type { SDKInvocationResult } from '../runtime/sdk/anthropic-sdk-adapter';
import { roughTokenEstimate } from '../runtime/sdk/cost';
import { getPromptTemplate } from './prompts/registry';
import type { SynthesisStore } from './store';

export interface SynthesisRunnerOptions {
  router?: SynthesisRuntimeRouter | null;
  maxBudgetUsd?: number;
}

export interface SynthesisRuntimeRouter {
  decide(input: { mode: 'synthesis'; modelTier?: 'heavy' }): Promise<RuntimeRouteDecision>;
  stream(input: SDKInvocationInput, windows: () => BrowserWindow[]): Promise<SDKInvocationResult>;
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
        const decision = await this.options.router.decide({ mode: 'synthesis', modelTier: 'heavy' });
        if (decision.track === 'sdk') {
          const result = await this.options.router.stream(
            {
              endpointId: decision.endpointId,
              model: decision.model,
              modelTier: 'heavy',
              system: rendered.system,
              messages: [{ role: 'user', content: rendered.user }],
              traceId,
              conversationId: traceId,
              mode: 'synthesis'
            },
            () => []
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

function localSynthesis(kind: SynthesisKind, sources: SynthesisSource[]): unknown {
  if (kind === 'summary.daily') return localDailySummary(sources);
  if (kind === 'summary.entity') return localEntitySummary(sources);
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
  return {};
}

function localDailySummary(sources: SynthesisSource[]): DailySummaryPayload {
  const timeline = sources.find((source) => source.kind === 'timeline_range')?.metadata as
    | { entries?: Array<{ icon?: string; title?: string }>; stats?: { total_events?: number } }
    | undefined;
  const entries = timeline?.entries ?? [];
  const count = timeline?.stats?.total_events ?? entries.length;
  const highlights = entries.slice(0, 5).map((entry) => `${entry.icon ?? '•'} ${entry.title ?? 'Timeline event'}`);
  return {
    headline: count > 0 ? `${count} meaningful events` : 'Quiet day',
    narrative:
      count > 0
        ? `Orbit captured ${count} timeline event(s). The main thread was: ${highlights.join(' / ')}.`
        : 'No user-visible activity was captured today.',
    highlights: highlights.length > 0 ? highlights : ['Rest / no captured events']
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
