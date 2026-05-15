import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type {
  DailySummaryPayload,
  EnsureSynthesisInput,
  ResourceEmergencePayload,
  SynthesisArtifact,
  SynthesisJob,
  SynthesisKind,
  SynthesisProvenance,
  SynthesisSource
} from '@shared/synthesis';
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
