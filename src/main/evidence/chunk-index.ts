import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  wholeSourceSelector,
  type EvidenceChunk,
  type EvidenceChunkFilter,
  type EvidenceChunkIndexFile,
  type EvidenceChunkSearchResult,
  type EvidenceContentView,
  type EvidenceScopeRef,
  type EvidenceSource
} from '@shared/evidence';
import type { ExternalAISessionRoot } from './external-ai-sessions';
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
    const sources = await syncOrbitEvidenceSources(this.vaultPath, buildOptions);
    const provider = createOrbitEvidenceProvider(this.vaultPath);
    const chunks: Record<string, EvidenceChunk> = {};
    const sourceFingerprints: Record<string, string> = {};

    for (const source of sources.filter(isIndexableSource)) {
      sourceFingerprints[source.id] = source.fingerprint.value;
      const contentView = contentViewForSource(source);
      const read = await provider.read(wholeSourceSelector(source.id, contentView, 'evidence chunk index')).catch(() => null);
      const text = read?.excerpts.map((excerpt) => excerpt.text).join('\n\n').trim() ?? '';
      const parts = chunkText(text || [source.title, source.summary, source.canonical_ref].filter(Boolean).join('\n'));

      parts.forEach((part, index) => {
        const contentHash = hash(part);
        const selector = {
          source_id: source.id,
          kind: 'semantic_chunk' as const,
          range: { from: index, to: index },
          content_view: contentView,
          reason: 'chunk index'
        };
        const chunk: EvidenceChunk = {
          id: `chunk:${source.id}:${index}:${contentHash.slice(0, 12)}`,
          source_id: source.id,
          selector,
          title: index === 0 ? source.title : `${source.title} #${index + 1}`,
          text: part,
          ordinal: index,
          content_hash: contentHash,
          updated_at: source.updated_at,
          tokens: tokenize(part),
          entities: extractEntities([source.title, part].join('\n')),
          ...(source.scope_refs?.length ? { scope_refs: source.scope_refs } : {}),
          metadata: {
            source_kind: source.kind,
            source_title: source.title,
            source_ref: source.canonical_ref
          }
        };
        chunks[chunk.id] = chunk;
      });
    }

    const index: EvidenceChunkIndexFile = {
      version: 1,
      chunks,
      source_fingerprints: sourceFingerprints,
      updated_at: new Date().toISOString()
    };
    await this.writeIndex(index);
    return index;
  }

  async list(filter: EvidenceChunkFilter = {}): Promise<EvidenceChunk[]> {
    const index = await this.readOrRebuild();
    const query = filter.query?.trim().toLowerCase();
    const entity = normalizeEntity(filter.entity);
    return Object.values(index.chunks)
      .filter((chunk) => !filter.source_id || chunk.source_id === filter.source_id)
      .filter((chunk) => !filter.scope || matchesScope(chunk.scope_refs, filter.scope))
      .filter((chunk) => !entity || chunk.entities.some((candidate) => normalizeEntity(candidate) === entity))
      .filter((chunk) => !query || [chunk.title, chunk.text, chunk.entities.join(' ')].join('\n').toLowerCase().includes(query))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.ordinal - b.ordinal)
      .slice(0, Math.max(1, filter.limit ?? DEFAULT_CHUNK_LIMIT));
  }

  async get(chunkId: string): Promise<EvidenceChunk | null> {
    const index = await this.readOrRebuild();
    return index.chunks[chunkId] ?? null;
  }

  async search(input: EvidenceChunkFilter & { query: string }): Promise<EvidenceChunkSearchResult[]> {
    const query = input.query.trim();
    if (!query) return [];
    const chunks = await this.list({ ...input, query: undefined, limit: undefined });
    const queryTokens = tokenize(query);
    const queryEntities = new Set(extractEntities(query).map(normalizeEntity));
    const sources = await createEvidenceStore(this.vaultPath).list({ include_unavailable: true, limit: 5000 });
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    return chunks
      .map((chunk) => scoreChunk(chunk, queryTokens, queryEntities, sourceById.get(chunk.source_id)))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.chunk.updated_at.localeCompare(a.chunk.updated_at))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  private async readOrRebuild(): Promise<EvidenceChunkIndexFile> {
    const current = await this.readIndex();
    const sources = await syncOrbitEvidenceSources(this.vaultPath, {
      ...this.defaultOptions,
      includeActivities: false
    });
    const fingerprints = Object.fromEntries(
      sources.filter(isIndexableSource).map((source) => [source.id, source.fingerprint.value])
    );
    if (Object.keys(current.chunks).length && sameFingerprintMap(current.source_fingerprints, fingerprints)) {
      return current;
    }
    return this.rebuild({ includeActivities: false });
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
  source?: EvidenceSource
): EvidenceChunkSearchResult {
  const tokenSet = new Set(chunk.tokens);
  const tokenHits = queryTokens.filter((token) => tokenSet.has(token)).length;
  const entityHits = chunk.entities.filter((entity) => queryEntities.has(normalizeEntity(entity))).length;
  const phraseHit = queryTokens.length > 1 && chunk.text.toLowerCase().includes(queryTokens.join(' ')) ? 1 : 0;
  const titleHit = queryTokens.some((token) => chunk.title.toLowerCase().includes(token)) ? 1 : 0;
  const sourceBoost = source?.availability === 'changed' ? 0.05 : 0;
  const score = tokenHits / Math.max(1, queryTokens.length) + entityHits * 0.6 + phraseHit * 0.3 + titleHit * 0.2 + sourceBoost;
  const why = [
    tokenHits ? `${tokenHits} token hit${tokenHits === 1 ? '' : 's'}` : '',
    entityHits ? `${entityHits} entity hit${entityHits === 1 ? '' : 's'}` : '',
    phraseHit ? 'phrase' : '',
    titleHit ? 'title' : ''
  ].filter(Boolean).join(' + ') || 'low lexical overlap';
  return {
    chunk,
    ...(source ? { source } : {}),
    score: Number(score.toFixed(4)),
    why
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
