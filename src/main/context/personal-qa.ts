import { createHash } from 'node:crypto';
import type { ContextPacketScope } from '@shared/context';
import type { EvidenceChunk, EvidenceScopeRef, EvidenceSelector } from '@shared/evidence';
import type {
  PersonalQAPayload,
  SynthesisArtifact,
  SynthesisSource,
  SynthesisSourceKind
} from '@shared/synthesis';
import {
  createEvidenceChunkIndexStore,
  extractEntities,
  tokenize
} from '../evidence/chunk-index';
import { createSynthesisStore } from '../synthesis/store';

const DEFAULT_QA_LIMIT = 4;
const MAX_QA_CANDIDATE_CHUNKS = 80;
const MAX_CHUNKS_PER_QA = 4;

export interface EnsurePersonalQAInput {
  scope?: ContextPacketScope;
  query?: string;
  limit?: number;
  force?: boolean;
}

export interface PersonalQAHitsInput {
  scope?: ContextPacketScope;
  query?: string;
  limit?: number;
}

export interface PersonalQAHitsResult {
  artifact: SynthesisArtifact<PersonalQAPayload>;
  score: number;
  why: string;
}

interface EntityChunkGroup {
  entity: string;
  chunks: EvidenceChunk[];
  score: number;
}

export async function ensurePersonalQA(
  vaultPath: string,
  input: EnsurePersonalQAInput = {}
): Promise<Array<SynthesisArtifact<PersonalQAPayload>>> {
  const scope = input.scope ?? { kind: 'global' };
  const limit = Math.max(1, input.limit ?? DEFAULT_QA_LIMIT);
  const chunks = await candidateChunks(vaultPath, input);
  const groups = groupChunksForQA(chunks, input.query).slice(0, limit);
  const store = createSynthesisStore(vaultPath);
  const artifacts: Array<SynthesisArtifact<PersonalQAPayload>> = [];

  for (const group of groups) {
    const question = questionFor(group.entity, scope);
    const sourceHash = sourceHashFor(group.chunks);
    const scopeKey = personalQAScopeKey(scope, question);
    const current = await store.latest(scopeKey) as SynthesisArtifact<PersonalQAPayload> | null;
    if (!input.force && current?.kind === 'qa.personal' && isPersonalQAPayload(current.payload) && current.payload.source_hash === sourceHash) {
      artifacts.push(current);
      continue;
    }

    const payload = payloadForGroup(group, scope, question, sourceHash);
    const artifact = await store.writeFresh({
      kind: 'qa.personal',
      scope_key: scopeKey,
      sources: group.chunks.map(chunkToSynthesisSource),
      provenance: {
        runtime: 'local:deterministic',
        model: 'orbit-pmil-personal-qa',
        prompt_version: 'qa.personal.v1',
        generated_at: new Date().toISOString()
      },
      payload
    }) as SynthesisArtifact<PersonalQAPayload>;
    artifacts.push(artifact);
  }

  return artifacts;
}

export async function listPersonalQAHits(
  vaultPath: string,
  input: PersonalQAHitsInput = {}
): Promise<PersonalQAHitsResult[]> {
  const scope = input.scope ?? { kind: 'global' };
  const query = input.query?.trim() ?? '';
  const scopePrefix = `${personalQAScopePrefix(scope)}:`;
  const artifacts = (await createSynthesisStore(vaultPath).list({
    kind: 'qa.personal',
    status: 'fresh',
    limit: 500
  })) as Array<SynthesisArtifact<PersonalQAPayload>>;

  return artifacts
    .filter((artifact) => artifact.scope_key.startsWith(scopePrefix))
    .filter((artifact) => isPersonalQAPayload(artifact.payload))
    .map((artifact) => scorePersonalQA(artifact, query))
    .filter((result) => !query || result.score > 0)
    .sort((a, b) => b.score - a.score || b.artifact.created_at.localeCompare(a.artifact.created_at))
    .slice(0, Math.max(1, input.limit ?? DEFAULT_QA_LIMIT));
}

export function isPersonalQAPayload(payload: unknown): payload is PersonalQAPayload {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      typeof (payload as PersonalQAPayload).question === 'string' &&
      typeof (payload as PersonalQAPayload).answer === 'string' &&
      Array.isArray((payload as PersonalQAPayload).evidence) &&
      Array.isArray((payload as PersonalQAPayload).source_chunk_ids)
  );
}

function payloadForGroup(
  group: EntityChunkGroup,
  scope: ContextPacketScope,
  question: string,
  sourceHash: string
): PersonalQAPayload {
  const citations = dedupeSelectors(group.chunks.map((chunk) => chunk.selector));
  const entities = dedupeStrings([
    group.entity,
    ...group.chunks.flatMap((chunk) => chunk.entities)
  ]).slice(0, 12);
  return {
    question,
    answer: answerForGroup(group),
    confidence: Number(Math.min(0.88, 0.46 + group.chunks.length * 0.08 + group.score * 0.02).toFixed(2)),
    entities,
    evidence: citations,
    source_chunk_ids: group.chunks.map((chunk) => chunk.id),
    source_hash: sourceHash,
    useful_for: usefulForScope(scope)
  };
}

async function candidateChunks(vaultPath: string, input: EnsurePersonalQAInput): Promise<EvidenceChunk[]> {
  const scope = input.scope ? contextScopeToEvidenceScope(input.scope) : null;
  const store = createEvidenceChunkIndexStore(vaultPath);
  const limit = Math.max(MAX_QA_CANDIDATE_CHUNKS, (input.limit ?? DEFAULT_QA_LIMIT) * 12);
  if (input.query?.trim()) {
    const results = await store.search({
      query: input.query.trim(),
      ...(scope ? { scope } : {}),
      limit
    });
    return dedupeChunks(results.map((result) => result.chunk));
  }
  return store.list({
    ...(scope ? { scope } : {}),
    limit
  });
}

function groupChunksForQA(chunks: EvidenceChunk[], query?: string): EntityChunkGroup[] {
  const queryTokens = tokenize(query ?? '');
  const queryEntities = new Set(extractEntities(query ?? '').map(normalizeEntityKey));
  const groups = new Map<string, EntityChunkGroup>();

  for (const chunk of chunks) {
    const entities = chunk.entities.length ? chunk.entities : fallbackEntities(chunk);
    for (const entity of entities.slice(0, 8)) {
      const key = normalizeEntityKey(entity);
      if (!key) continue;
      const current = groups.get(key) ?? { entity, chunks: [], score: 0 };
      if (!current.chunks.some((candidate) => candidate.id === chunk.id)) {
        current.chunks.push(chunk);
      }
      groups.set(key, current);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      chunks: group.chunks.slice(0, MAX_CHUNKS_PER_QA),
      score: scoreGroup(group, queryTokens, queryEntities)
    }))
    .filter((group) => group.chunks.length > 0)
    .sort((a, b) => b.score - a.score || b.chunks.length - a.chunks.length || a.entity.localeCompare(b.entity));
}

function scoreGroup(group: EntityChunkGroup, queryTokens: string[], queryEntities: Set<string>): number {
  const entityKey = normalizeEntityKey(group.entity);
  const entityTokens = new Set(tokenize(group.entity));
  const queryTokenHits = queryTokens.filter((token) => entityTokens.has(token) || entityKey.includes(token)).length;
  const directEntityHit = queryEntities.has(entityKey) ? 8 : 0;
  const chunkHits = group.chunks.length * 1.4;
  const recencyBoost = group.chunks.some((chunk) => chunk.updated_at) ? 0.2 : 0;
  return Number((directEntityHit + queryTokenHits * 2 + chunkHits + recencyBoost).toFixed(4));
}

function questionFor(entity: string, scope: ContextPacketScope): string {
  if (scope.kind === 'global' || !scope.ref) return `What do I know about ${entity}?`;
  return `What do I know about ${entity} in ${scope.kind}:${scope.ref}?`;
}

function answerForGroup(group: EntityChunkGroup): string {
  const snippets = group.chunks
    .slice(0, 3)
    .map((chunk, index) => `${index + 1}. ${snippet(chunk.text, 180)}`)
    .join(' ');
  return `Based on ${group.chunks.length} evidence chunk(s), ${group.entity} currently appears in these traces: ${snippets}`;
}

function scorePersonalQA(
  artifact: SynthesisArtifact<PersonalQAPayload>,
  query: string
): PersonalQAHitsResult {
  if (!query) return { artifact, score: 0.5, why: 'recent personal QA' };
  const queryTokens = tokenize(query);
  const payload = artifact.payload;
  const text = [payload.question, payload.answer, payload.entities.join(' ')].join(' ').toLowerCase();
  const textTokens = new Set(tokenize(text));
  const tokenHits = queryTokens.filter((token) => textTokens.has(token) || text.includes(token)).length;
  const entityHits = payload.entities.filter((entity) => query.toLowerCase().includes(entity.toLowerCase())).length;
  const questionHit = payload.question.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
  const score = tokenHits / Math.max(1, queryTokens.length) + entityHits * 0.7 + questionHit * 0.4;
  const why = [
    tokenHits ? `${tokenHits} token hit${tokenHits === 1 ? '' : 's'}` : '',
    entityHits ? `${entityHits} entity hit${entityHits === 1 ? '' : 's'}` : '',
    questionHit ? 'question title' : ''
  ].filter(Boolean).join(' + ') || 'low lexical overlap';
  return { artifact, score: Number(score.toFixed(4)), why };
}

function chunkToSynthesisSource(chunk: EvidenceChunk): SynthesisSource {
  return {
    kind: synthesisSourceKind(chunk),
    ref: String(chunk.metadata?.['source_ref'] ?? chunk.source_id),
    title: chunk.title,
    excerpt: snippet(chunk.text, 360),
    weight: 1,
    metadata: {
      chunk_id: chunk.id,
      source_id: chunk.source_id,
      selector: chunk.selector,
      entities: chunk.entities
    }
  };
}

function synthesisSourceKind(chunk: EvidenceChunk): SynthesisSourceKind {
  const raw = String(chunk.metadata?.['source_kind'] ?? '');
  if (raw === 'library_item') return 'library';
  if (raw === 'activity_event') return 'event';
  if (raw === 'kb_doc') return 'kb';
  if (raw === 'external_file') return 'raw';
  if (DIRECT_SYNTHESIS_SOURCE_KINDS.has(raw as SynthesisSourceKind)) return raw as SynthesisSourceKind;
  return 'raw';
}

function usefulForScope(scope: ContextPacketScope): PersonalQAPayload['useful_for'] {
  if (scope.kind === 'project') return ['ask', 'task_context', 'review', 'project'];
  if (scope.kind === 'area') return ['ask', 'review', 'area'];
  if (scope.kind === 'resource') return ['ask', 'resource'];
  return ['ask', 'task_context', 'review'];
}

function fallbackEntities(chunk: EvidenceChunk): string[] {
  const fromTitle = extractEntities(chunk.title);
  if (fromTitle.length) return fromTitle;
  const title = chunk.title.replace(/\s+#\d+$/u, '').trim();
  return title ? [title] : [];
}

function personalQAScopeKey(scope: ContextPacketScope, question: string): string {
  return `${personalQAScopePrefix(scope)}:${hash(question).slice(0, 16)}`;
}

function personalQAScopePrefix(scope: ContextPacketScope): string {
  if (scope.kind === 'global' || !scope.ref) return 'qa.personal:global';
  return `qa.personal:${scope.kind}:${hash(scope.ref).slice(0, 16)}`;
}

function contextScopeToEvidenceScope(scope: ContextPacketScope): EvidenceScopeRef | null {
  if (scope.kind === 'global' || !scope.ref) return null;
  return { kind: scope.kind, ref: scope.ref };
}

function sourceHashFor(chunks: EvidenceChunk[]): string {
  return hash(chunks.map((chunk) => `${chunk.id}:${chunk.content_hash}`).sort().join('|'));
}

function snippet(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength).trim()}...`;
}

function dedupeChunks(chunks: EvidenceChunk[]): EvidenceChunk[] {
  const seen = new Set<string>();
  const out: EvidenceChunk[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    out.push(chunk);
  }
  return out;
}

function dedupeSelectors(selectors: EvidenceSelector[]): EvidenceSelector[] {
  const seen = new Set<string>();
  const out: EvidenceSelector[] = [];
  for (const selector of selectors) {
    const key = `${selector.source_id}:${selector.kind}:${selector.range?.from ?? ''}:${selector.range?.to ?? ''}:${selector.content_view}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selector);
  }
  return out;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeEntityKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeEntityKey(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const DIRECT_SYNTHESIS_SOURCE_KINDS = new Set<SynthesisSourceKind>([
  'note',
  'resource',
  'project',
  'area',
  'task',
  'conversation',
  'external_ai_session'
]);
