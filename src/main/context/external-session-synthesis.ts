import { createHash } from 'node:crypto';
import type { ExternalSessionDistillPayload, SynthesisArtifact, SynthesisSource } from '@shared/synthesis';
import { wholeSourceSelector, type EvidenceChunkSearchResult, type EvidenceSelector, type EvidenceSource } from '@shared/evidence';
import { createEvidenceStore } from '../evidence/store';
import { createOrbitEvidenceProvider } from '../evidence/providers';
import { createSynthesisJob, SynthesisRunner, type SynthesisRuntimeRouter } from '../synthesis/runner';
import { createSynthesisStore } from '../synthesis/store';

export interface ExternalSessionDistillOptions {
  force?: boolean;
  router?: SynthesisRuntimeRouter | null;
  maxBudgetUsd?: number;
}

export function externalSessionDistillScopeKey(sourceId: string): string {
  return `distill.external_session:${hash(sourceId).slice(0, 24)}`;
}

export async function ensureExternalSessionDistillation(
  vaultPath: string,
  sourceId: string,
  options: ExternalSessionDistillOptions = {}
): Promise<SynthesisArtifact<ExternalSessionDistillPayload> | null> {
  const store = createSynthesisStore(vaultPath);
  const scopeKey = externalSessionDistillScopeKey(sourceId);
  const source = await createEvidenceStore(vaultPath).get(sourceId);
  if (!source || source.kind !== 'external_ai_session') return null;
  const synthesisSource = await externalSessionToSynthesisSource(vaultPath, source);
  const sourceHash = String(synthesisSource.metadata?.['source_hash'] ?? '');
  const latest = await store.latest(scopeKey) as SynthesisArtifact<ExternalSessionDistillPayload> | null;
  if (!options.force && latest?.kind === 'distill.external_session' && latest.status === 'fresh' && latest.payload.source_hash === sourceHash) {
    return latest;
  }
  const runner = new SynthesisRunner(store, {
    router: options.router,
    maxBudgetUsd: options.maxBudgetUsd ?? 1
  });
  return runner.run(
    createSynthesisJob({
      kind: 'distill.external_session',
      scope_key: scopeKey,
      sources: [synthesisSource],
      priority: 'interactive',
      reason: options.force ? 'manual' : 'missing',
      force: true
    })
  ) as Promise<SynthesisArtifact<ExternalSessionDistillPayload>>;
}

export async function listExternalSessionDistillationsForResults(
  vaultPath: string,
  results: EvidenceChunkSearchResult[],
  options: ExternalSessionDistillOptions & { ensure?: boolean; limit?: number } = {}
): Promise<Array<SynthesisArtifact<ExternalSessionDistillPayload>>> {
  const sourceIds = Array.from(new Set(results
    .filter((result) => result.source?.kind === 'external_ai_session' || result.chunk.metadata?.['source_kind'] === 'external_ai_session')
    .map((result) => result.chunk.source_id)))
    .slice(0, Math.max(1, options.limit ?? 3));
  const store = createSynthesisStore(vaultPath);
  const artifacts: Array<SynthesisArtifact<ExternalSessionDistillPayload>> = [];
  for (const sourceId of sourceIds) {
    if (options.ensure) {
      const artifact = await ensureExternalSessionDistillation(vaultPath, sourceId, options);
      if (artifact) artifacts.push(artifact);
      continue;
    }
    const artifact = await store.latest(externalSessionDistillScopeKey(sourceId));
    if (artifact?.kind === 'distill.external_session' && artifact.status === 'fresh') {
      artifacts.push(artifact as SynthesisArtifact<ExternalSessionDistillPayload>);
    }
  }
  return artifacts;
}

async function externalSessionToSynthesisSource(vaultPath: string, source: EvidenceSource): Promise<SynthesisSource> {
  const selector = wholeSourceSelector(source.id, 'safe_projection', 'external session distillation');
  const read = await createOrbitEvidenceProvider(vaultPath).read(selector);
  const text = read.excerpts.map((excerpt) => excerpt.text).join('\n\n').trim();
  return {
    kind: 'external_ai_session',
    ref: source.id,
    title: source.title,
    excerpt: text.slice(0, 8000),
    metadata: {
      selector,
      source_hash: hash([source.fingerprint.value, text].join('\n')),
      agent: stringMetadata(source, 'agent'),
      project_name: stringMetadata(source, 'project_name'),
      source_path: stringMetadata(source, 'path'),
      evidence: [selector] satisfies EvidenceSelector[]
    }
  };
}

function stringMetadata(source: EvidenceSource, key: string): string | undefined {
  const value = source.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
