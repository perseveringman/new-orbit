import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import MiniSearch from 'minisearch';
import { ORBIT_DIR } from '@shared/constants';
import {
  wholeSourceSelector,
  type EvidenceChunk,
  type EvidenceChunkEmbedding,
  type EvidenceChunkFilter,
  type EvidenceChunkIndexFile,
  type EvidenceChunkSearchResult,
  type EvidenceContentView,
  type EvidenceSelector,
  type EvidenceScopeRef,
  type EvidenceSource
} from '@shared/evidence';
import { getAIConfigRuntime } from '../ai-config/runtime';
import {
  cosineSimilarity,
  embedTexts as embedLocalTexts,
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL
} from '../semantic/embedder';
import {
  EXTERNAL_AI_SESSION_PROVIDER_ID,
  readExternalAISessionMessages,
  type ExternalAISessionMessage,
  type ExternalAISessionRoot
} from './external-ai-sessions';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from './providers';
import { createEvidenceStore } from './store';

const DEFAULT_CHUNK_LIMIT = 500;
const MAX_CHARS_PER_CHUNK = 1200;
const CHUNK_OVERLAP_CHARS = 120;

export interface EvidenceIndexBuildOptions {
  includeActivities?: boolean;
  activityLimit?: number;
  includeExternalAISessions?: boolean;
  externalAISessionLimit?: number;
  externalAISessionRoots?: ExternalAISessionRoot[];
  force?: boolean;
  prefetchedSources?: EvidenceSource[];
}

interface ChunkBuildInput {
  title: string;
  text: string;
  ordinal: number;
  selector: EvidenceSelector;
}

interface ChunkEmbeddingBuildResult {
  model: string;
  dimensions: number;
  embeddings: Record<string, EvidenceChunkEmbedding>;
}

export function evidenceChunksPath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'evidence', 'chunks.json');
}

export class EvidenceChunkIndexStore {
  constructor(
    private readonly vaultPath: string,
    private readonly defaultOptions: EvidenceIndexBuildOptions = {}
  ) {}

  async rebuild(options: EvidenceIndexBuildOptions = {}): Promise<EvidenceChunkIndexFile> {
    const buildOptions = { ...this.defaultOptions, ...options };
    const sources = await includeRegisteredExternalAISessions(
      this.vaultPath,
      await syncOrbitEvidenceSources(this.vaultPath, buildOptions)
    );
    const provider = createOrbitEvidenceProvider(this.vaultPath);
    const chunks: Record<string, EvidenceChunk> = {};
    const sourceFingerprints: Record<string, string> = {};

    for (const source of sources.filter(isIndexableSource)) {
      sourceFingerprints[source.id] = source.fingerprint.value;
      const contentView = contentViewForSource(source);
      const inputs = await chunkInputsForSource(source, contentView, provider);

      inputs.forEach((input) => {
        const contentHash = hash(input.text);
        const chunk: EvidenceChunk = {
          id: `chunk:${source.id}:${input.ordinal}:${contentHash.slice(0, 12)}`,
          source_id: source.id,
          selector: input.selector,
          title: input.title,
          text: input.text,
          ordinal: input.ordinal,
          content_hash: contentHash,
          updated_at: source.updated_at,
          tokens: tokenize(input.text),
          entities: extractEntities([source.title, input.text].join('\n')),
          ...(source.scope_refs?.length ? { scope_refs: source.scope_refs } : {}),
          metadata: {
            source_kind: source.kind,
            source_title: source.title,
            source_ref: source.canonical_ref,
            selector_kind: input.selector.kind
          }
        };
        chunks[chunk.id] = chunk;
      });
    }
    const embeddingBuild = await buildChunkEmbeddings(this.vaultPath, Object.values(chunks));

    const index: EvidenceChunkIndexFile = {
      version: 1,
      chunks,
      source_fingerprints: sourceFingerprints,
      chunk_embeddings: embeddingBuild.embeddings,
      embedding_model: embeddingBuild.model,
      embedding_dimensions: embeddingBuild.dimensions,
      updated_at: new Date().toISOString()
    };
    await this.writeIndex(index);
    return index;
  }

  async syncIncremental(options: EvidenceIndexBuildOptions = {}): Promise<EvidenceChunkIndexFile> {
    const buildOptions = { ...this.defaultOptions, ...options };
    const sources = await includeRegisteredExternalAISessions(
      this.vaultPath,
      buildOptions.prefetchedSources ?? await syncOrbitEvidenceSources(this.vaultPath, buildOptions)
    );
    const provider = createOrbitEvidenceProvider(this.vaultPath);
    const current = await this.readIndex();
    const embeddingProvider = await embeddingProviderInfo(this.vaultPath);
    const providerChanged =
      current.embedding_model !== embeddingProvider.model ||
      current.embedding_dimensions !== embeddingProvider.dimensions;
    const chunks: Record<string, EvidenceChunk> = { ...current.chunks };
    const embeddings: Record<string, EvidenceChunkEmbedding> = providerChanged ? {} : { ...(current.chunk_embeddings ?? {}) };
    const sourceFingerprints: Record<string, string> = {};
    const indexableSources = sources.filter(isIndexableSource);
    const liveSourceIds = new Set(indexableSources.map((source) => source.id));

    for (const chunk of Object.values(chunks)) {
      if (liveSourceIds.has(chunk.source_id)) continue;
      delete chunks[chunk.id];
      delete embeddings[chunk.id];
    }

    for (const source of indexableSources) {
      sourceFingerprints[source.id] = source.fingerprint.value;
      const existingChunks = Object.values(chunks).filter((chunk) => chunk.source_id === source.id);
      const embeddingCurrent = !providerChanged && existingChunks.every((chunk) => {
        const embedding = embeddings[chunk.id];
        return embedding?.content_hash === chunk.content_hash &&
          embedding.model === embeddingProvider.model &&
          embedding.dimensions === embeddingProvider.dimensions;
      });
      const sourceUnchanged =
        !buildOptions.force &&
        current.source_fingerprints[source.id] === source.fingerprint.value &&
        existingChunks.length > 0 &&
        embeddingCurrent;
      if (sourceUnchanged) continue;

      removeSourceChunks(source.id, chunks, embeddings);
      const contentView = contentViewForSource(source);
      const inputs = await chunkInputsForSource(source, contentView, provider);
      const nextChunks = buildChunksForSource(source, inputs);
      const embeddingBuild = await buildChunkEmbeddings(this.vaultPath, nextChunks);
      for (const chunk of nextChunks) chunks[chunk.id] = chunk;
      Object.assign(embeddings, embeddingBuild.embeddings);
    }

    const index: EvidenceChunkIndexFile = {
      version: 1,
      chunks,
      source_fingerprints: sourceFingerprints,
      chunk_embeddings: embeddings,
      embedding_model: embeddingProvider.model,
      embedding_dimensions: embeddingProvider.dimensions,
      updated_at: new Date().toISOString()
    };
    await this.writeIndex(index);
    return index;
  }

  async list(filter: EvidenceChunkFilter = {}): Promise<EvidenceChunk[]> {
    const index = await this.readOrRebuild();
    return filterChunks(Object.values(index.chunks), filter)
      .slice(0, Math.max(1, filter.limit ?? DEFAULT_CHUNK_LIMIT));
  }

  async get(chunkId: string): Promise<EvidenceChunk | null> {
    const index = await this.readOrRebuild();
    return index.chunks[chunkId] ?? null;
  }

  async search(input: EvidenceChunkFilter & { query: string }): Promise<EvidenceChunkSearchResult[]> {
    const query = input.query.trim();
    if (!query) return [];
    const index = await this.readOrRebuild();
    const chunks = filterChunks(Object.values(index.chunks), { ...input, query: undefined, limit: undefined });
    const queryTokens = tokenize(query);
    const queryEntities = new Set(extractEntities(query).map(normalizeEntity));
    const sources = await createEvidenceStore(this.vaultPath).list({ include_unavailable: true, limit: 5000 });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const ftsScores = scoreChunksWithFts(chunks, query);
    const vectorScores = await scoreChunksWithVectors(this.vaultPath, chunks, query, index.chunk_embeddings ?? {});

    return chunks
      .map((chunk) => scoreChunk(
        chunk,
        queryTokens,
        queryEntities,
        sourceById.get(chunk.source_id),
        ftsScores.get(chunk.id) ?? 0,
        vectorScores.get(chunk.id) ?? 0
      ))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.chunk.updated_at.localeCompare(a.chunk.updated_at))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  private async readOrRebuild(): Promise<EvidenceChunkIndexFile> {
    return this.readIndex();
  }

  private async readIndex(): Promise<EvidenceChunkIndexFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(evidenceChunksPath(this.vaultPath), 'utf8')) as Partial<EvidenceChunkIndexFile>;
      return {
        version: 1,
        chunks: parsed.chunks && typeof parsed.chunks === 'object' ? (parsed.chunks as Record<string, EvidenceChunk>) : {},
        source_fingerprints: parsed.source_fingerprints && typeof parsed.source_fingerprints === 'object'
          ? (parsed.source_fingerprints as Record<string, string>)
          : {},
        chunk_embeddings: parsed.chunk_embeddings && typeof parsed.chunk_embeddings === 'object'
          ? (parsed.chunk_embeddings as Record<string, EvidenceChunkEmbedding>)
          : {},
        ...(typeof parsed.embedding_model === 'string' ? { embedding_model: parsed.embedding_model } : {}),
        ...(typeof parsed.embedding_dimensions === 'number' ? { embedding_dimensions: parsed.embedding_dimensions } : {}),
        ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
      };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, chunks: {}, source_fingerprints: {} };
      throw error;
    }
  }

  private async writeIndex(index: EvidenceChunkIndexFile): Promise<void> {
    const file = evidenceChunksPath(this.vaultPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
}

export function createEvidenceChunkIndexStore(
  vaultPath: string,
  options: EvidenceIndexBuildOptions = {}
): EvidenceChunkIndexStore {
  return new EvidenceChunkIndexStore(vaultPath, options);
}

async function chunkInputsForSource(
  source: EvidenceSource,
  contentView: EvidenceContentView,
  provider: ReturnType<typeof createOrbitEvidenceProvider>
): Promise<ChunkBuildInput[]> {
  if (source.kind === 'external_ai_session') {
    const messageInputs = await messageRangeChunkInputs(source, contentView);
    if (messageInputs.length) return messageInputs;
  }
  const read = await provider.read(wholeSourceSelector(source.id, contentView, 'evidence chunk index')).catch(() => null);
  const text = read?.excerpts.map((excerpt) => excerpt.text).join('\n\n').trim() ?? '';
  const parts = chunkText(text || [source.title, source.summary, source.canonical_ref].filter(Boolean).join('\n'));
  return parts.map((part, index) => ({
    title: index === 0 ? source.title : `${source.title} #${index + 1}`,
    text: part,
    ordinal: index,
    selector: {
      source_id: source.id,
      kind: 'semantic_chunk',
      range: { from: index, to: index },
      content_view: contentView,
      reason: 'chunk index'
    }
  }));
}

function buildChunksForSource(source: EvidenceSource, inputs: ChunkBuildInput[]): EvidenceChunk[] {
  return inputs.map((input) => {
    const contentHash = hash(input.text);
    return {
      id: `chunk:${source.id}:${input.ordinal}:${contentHash.slice(0, 12)}`,
      source_id: source.id,
      selector: input.selector,
      title: input.title,
      text: input.text,
      ordinal: input.ordinal,
      content_hash: contentHash,
      updated_at: source.updated_at,
      tokens: tokenize(input.text),
      entities: extractEntities([source.title, input.text].join('\n')),
      ...(source.scope_refs?.length ? { scope_refs: source.scope_refs } : {}),
      metadata: {
        source_kind: source.kind,
        source_title: source.title,
        source_ref: source.canonical_ref,
        selector_kind: input.selector.kind
      }
    } satisfies EvidenceChunk;
  });
}

function removeSourceChunks(
  sourceId: string,
  chunks: Record<string, EvidenceChunk>,
  embeddings: Record<string, EvidenceChunkEmbedding>
): void {
  for (const chunk of Object.values(chunks)) {
    if (chunk.source_id !== sourceId) continue;
    delete chunks[chunk.id];
    delete embeddings[chunk.id];
  }
}

async function messageRangeChunkInputs(
  source: EvidenceSource,
  contentView: EvidenceContentView
): Promise<ChunkBuildInput[]> {
  const messages = await readExternalAISessionMessages(source, contentView).catch(() => []);
  if (!messages.length) return [];
  const groups: Array<{ from: number; to: number; text: string }> = [];
  let current: ExternalAISessionMessage[] = [];
  let currentLength = 0;
  for (const message of messages) {
    const rendered = `${message.role}${message.timestamp ? ` [${message.timestamp}]` : ''}: ${message.text}`;
    if (current.length && currentLength + rendered.length > MAX_CHARS_PER_CHUNK) {
      groups.push({
        from: current[0]!.index,
        to: current.at(-1)!.index,
        text: current.map((item) => `${item.role}${item.timestamp ? ` [${item.timestamp}]` : ''}: ${item.text}`).join('\n\n')
      });
      current = [];
      currentLength = 0;
    }
    current.push(message);
    currentLength += rendered.length;
  }
  if (current.length) {
    groups.push({
      from: current[0]!.index,
      to: current.at(-1)!.index,
      text: current.map((item) => `${item.role}${item.timestamp ? ` [${item.timestamp}]` : ''}: ${item.text}`).join('\n\n')
    });
  }
  return groups.map((group, index) => ({
    title: index === 0 ? source.title : `${source.title} messages ${group.from}-${group.to}`,
    text: group.text,
    ordinal: index,
    selector: {
      source_id: source.id,
      kind: 'message_range',
      range: { from: group.from, to: group.to },
      role_filter: ['user', 'assistant'],
      content_view: contentView,
      reason: 'external session message range index'
    }
  }));
}

function filterChunks(chunks: EvidenceChunk[], filter: EvidenceChunkFilter = {}): EvidenceChunk[] {
  const query = filter.query?.trim().toLowerCase();
  const entity = normalizeEntity(filter.entity);
  return chunks
    .filter((chunk) => !filter.source_id || chunk.source_id === filter.source_id)
    .filter((chunk) => !filter.scope || matchesScope(chunk.scope_refs, filter.scope))
    .filter((chunk) => !entity || chunk.entities.some((candidate) => normalizeEntity(candidate) === entity))
    .filter((chunk) => !query || [chunk.title, chunk.text, chunk.entities.join(' ')].join('\n').toLowerCase().includes(query))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.ordinal - b.ordinal);
}

async function buildChunkEmbeddings(vaultPath: string, chunks: EvidenceChunk[]): Promise<ChunkEmbeddingBuildResult> {
  if (!chunks.length) {
    const provider = await embeddingProviderInfo(vaultPath);
    return { ...provider, embeddings: {} };
  }
  const texts = chunks.map((chunk) => [chunk.title, chunk.entities.join(' '), chunk.text].filter(Boolean).join('\n'));
  const embedded = await embedEvidenceTexts(vaultPath, texts);
  const now = new Date().toISOString();
  return {
    model: embedded.model,
    dimensions: embedded.dimensions,
    embeddings: Object.fromEntries(chunks.map((chunk, index) => [chunk.id, {
      chunk_id: chunk.id,
      model: embedded.model,
      dimensions: embedded.dimensions,
      content_hash: chunk.content_hash,
      vector: embedded.vectors[index] ?? [],
      embedded_at: now
    } satisfies EvidenceChunkEmbedding]))
  };
}

async function embeddingProviderInfo(vaultPath: string): Promise<{ model: string; dimensions: number }> {
  try {
    const resolved = await getAIConfigRuntime(vaultPath).service.resolveEmbedding('memory');
    if (resolved) return { model: resolved.provider.model, dimensions: resolved.provider.dimensions };
  } catch {
    /* fallback below */
  }
  return { model: LOCAL_EMBEDDING_MODEL, dimensions: LOCAL_EMBEDDING_DIMENSIONS };
}

async function embedEvidenceTexts(vaultPath: string, texts: string[]): Promise<{ model: string; dimensions: number; vectors: number[][] }> {
  try {
    const resolved = await getAIConfigRuntime(vaultPath).service.resolveEmbedding('memory');
    if (resolved) {
      const vectors: number[][] = [];
      for (const batch of batches(texts, 48)) {
        vectors.push(...await getAIConfigRuntime(vaultPath).service.embedTexts(batch, { providerId: resolved.provider.id }));
      }
      return {
        model: resolved.provider.model,
        dimensions: resolved.provider.dimensions,
        vectors: vectors.map(normalizeVector)
      };
    }
  } catch {
    /* fallback below */
  }
  const local = await embedLocalTexts(texts);
  return {
    model: LOCAL_EMBEDDING_MODEL,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    vectors: local.map((item) => Array.from(item.vector))
  };
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (!norm) return vector.map((value) => Number(value) || 0);
  return vector.map((value) => (Number(value) || 0) / norm);
}

function scoreChunksWithFts(chunks: EvidenceChunk[], query: string): Map<string, number> {
  if (!chunks.length) return new Map();
  const mini = new MiniSearch<{ id: string; title: string; text: string; entities: string }>({
    fields: ['title', 'text', 'entities'],
    storeFields: ['id']
  });
  mini.addAll(chunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    text: chunk.text,
    entities: chunk.entities.join(' ')
  })));
  const results = mini.search(query, { prefix: true, fuzzy: 0.2 });
  const max = Math.max(...results.map((result) => result.score), 0);
  return new Map(results.map((result) => [String(result.id), max ? result.score / max : 0]));
}

async function scoreChunksWithVectors(
  vaultPath: string,
  chunks: EvidenceChunk[],
  query: string,
  embeddings: Record<string, EvidenceChunkEmbedding>
): Promise<Map<string, number>> {
  if (!chunks.length || !Object.keys(embeddings).length) return new Map();
  const embedded = await embedEvidenceTexts(vaultPath, [query]).catch(() => null);
  const queryVector = embedded?.vectors[0];
  if (!queryVector?.length) return new Map();
  const queryFloat = Float32Array.from(queryVector);
  const out = new Map<string, number>();
  for (const chunk of chunks) {
    const embedding = embeddings[chunk.id];
    if (!embedding || embedding.content_hash !== chunk.content_hash || !embedding.vector.length) continue;
    out.set(chunk.id, Math.max(0, cosineSimilarity(queryFloat, Float32Array.from(embedding.vector))));
  }
  return out;
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize('NFKC')
        .split(/[^a-z0-9\u4e00-\u9fff._:-]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .filter((token) => !STOPWORDS.has(token))
    )
  );
}

export function extractEntities(text: string): string[] {
  const counts = new Map<string, number>();
  addEntityMatches(counts, text, /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu);
  addEntityMatches(counts, text, /[`"“”'「」《》]([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff ._:-]{1,60}?)[`"“”'「」《》]/gu);
  addEntityMatches(counts, text, /\b[A-Z][A-Za-z0-9_.:-]{1,40}(?:\s+[A-Z][A-Za-z0-9_.:-]{1,40}){0,3}\b/g);
  addEntityMatches(counts, text, /#([A-Za-z0-9_\-\u4e00-\u9fff]{2,40})/gu);
  return Array.from(counts.entries())
    .filter(([entity]) => entity.length >= 2 && !STOPWORDS.has(entity.toLowerCase()))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([entity]) => entity);
}

function isIndexableSource(source: EvidenceSource): boolean {
  return source.availability !== 'missing' && source.privacy.index_level !== 'metadata_only';
}

async function includeRegisteredExternalAISessions(
  vaultPath: string,
  sources: EvidenceSource[]
): Promise<EvidenceSource[]> {
  if (sources.some((source) => source.provider_id === EXTERNAL_AI_SESSION_PROVIDER_ID || source.kind === 'external_ai_session')) {
    return uniqueSources(sources);
  }
  const registered = await createEvidenceStore(vaultPath).list({
    provider_id: EXTERNAL_AI_SESSION_PROVIDER_ID,
    include_unavailable: true,
    limit: 5000
  });
  return uniqueSources([...sources, ...registered]);
}

function uniqueSources(sources: EvidenceSource[]): EvidenceSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

function contentViewForSource(source: EvidenceSource): EvidenceContentView {
  return source.privacy.index_level === 'metadata_only' ? 'metadata' : 'safe_projection';
}

function chunkText(text: string): string[] {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const maxEnd = Math.min(cleaned.length, cursor + MAX_CHARS_PER_CHUNK);
    let end = maxEnd;
    if (maxEnd < cleaned.length) {
      const boundary = Math.max(
        cleaned.lastIndexOf('。', maxEnd),
        cleaned.lastIndexOf('！', maxEnd),
        cleaned.lastIndexOf('？', maxEnd),
        cleaned.lastIndexOf('.', maxEnd),
        cleaned.lastIndexOf(' ', maxEnd)
      );
      if (boundary > cursor + 400) end = boundary + 1;
    }
    chunks.push(cleaned.slice(cursor, end).trim());
    if (end >= cleaned.length) break;
    cursor = Math.max(end - CHUNK_OVERLAP_CHARS, cursor + 1);
  }
  return chunks.filter(Boolean);
}

function scoreChunk(
  chunk: EvidenceChunk,
  queryTokens: string[],
  queryEntities: Set<string>,
  source: EvidenceSource | undefined,
  ftsScore: number,
  vectorScore: number
): EvidenceChunkSearchResult {
  const tokenSet = new Set(chunk.tokens);
  const tokenHits = queryTokens.filter((token) => tokenSet.has(token)).length;
  const entityHits = chunk.entities.filter((entity) => queryEntities.has(normalizeEntity(entity))).length;
  const phraseHit = queryTokens.length > 1 && chunk.text.toLowerCase().includes(queryTokens.join(' ')) ? 1 : 0;
  const titleHit = queryTokens.some((token) => chunk.title.toLowerCase().includes(token)) ? 1 : 0;
  const sourceBoost = source?.availability === 'changed' ? 0.05 : 0;
  const lexicalScore = Math.min(1, tokenHits / Math.max(1, queryTokens.length) + entityHits * 0.25 + phraseHit * 0.2 + titleHit * 0.15);
  const score = vectorScore * 0.45 + ftsScore * 0.35 + lexicalScore * 0.2 + sourceBoost;
  const why = [
    ftsScore ? `fts ${ftsScore.toFixed(2)}` : '',
    vectorScore ? `vector ${vectorScore.toFixed(2)}` : '',
    lexicalScore ? `lexical ${lexicalScore.toFixed(2)}` : '',
    tokenHits ? `${tokenHits} token hit${tokenHits === 1 ? '' : 's'}` : '',
    entityHits ? `${entityHits} entity hit${entityHits === 1 ? '' : 's'}` : '',
    phraseHit ? 'phrase' : '',
    titleHit ? 'title' : ''
  ].filter(Boolean).join(' + ') || 'low hybrid overlap';
  return {
    chunk,
    ...(source ? { source } : {}),
    score: Number(score.toFixed(4)),
    why,
    match_type: vectorScore > 0.08 && (ftsScore > 0 || lexicalScore > 0) ? 'hybrid' : vectorScore > ftsScore && vectorScore > lexicalScore ? 'semantic' : 'keyword',
    keyword_score: Number(lexicalScore.toFixed(4)),
    fts_score: Number(ftsScore.toFixed(4)),
    vector_score: Number(vectorScore.toFixed(4))
  };
}

function addEntityMatches(counts: Map<string, number>, text: string, pattern: RegExp): void {
  for (const match of text.matchAll(pattern)) {
    const entity = normalizeEntityLabel(match[1] ?? match[0]);
    if (!entity) continue;
    counts.set(entity, (counts.get(entity) ?? 0) + 1);
  }
}

function normalizeEntityLabel(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(/^#+/u, '').trim().slice(0, 80);
}

function normalizeEntity(value: string | undefined): string {
  return normalizeEntityLabel(value ?? '').toLowerCase();
}

function matchesScope(scopes: EvidenceScopeRef[] | undefined, scope: EvidenceScopeRef): boolean {
  return scopes?.some((candidate) => candidate.kind === scope.kind && candidate.ref === scope.ref) ?? false;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}

function sameFingerprintMap(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'you',
  'your',
  'are',
  'was',
  'were',
  'have',
  'has',
  'into',
  'about',
  'note',
  'notes',
  'project',
  'resource',
  'conversation'
]);
