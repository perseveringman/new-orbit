import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  CreateMemoryInput,
  MemoryBackendId,
  MemorySourceSyncError,
  MemorySourceSyncOptions,
  MemorySourceSyncResult
} from '@shared/memory';
import type { EvidenceSource, EvidenceSourceKind } from '@shared/evidence';
import { wholeSourceSelector } from '@shared/evidence';
import type { SynthesisSource, SynthesisSourceKind } from '@shared/synthesis';
import { createOrbitEvidenceProvider, syncOrbitEvidenceSources } from '../evidence/providers';
import { EXTERNAL_AI_SESSION_PROVIDER_ID, readExternalAISessionSourceText } from '../evidence/external-ai-sessions';
import { readMemoryBackendConfig } from './backend-config';
import { getActiveMemoryBackend } from './backend-registry';
import type { MemoryBackend } from './backend-types';
import { extractMemoryCandidates } from './extractor';

const SYNC_VERSION = 1;
const DEFAULT_LIMIT = 200;
const DEFAULT_MAX_MEMORIES_PER_SOURCE = 2;

const DEFAULT_SOURCE_KINDS: EvidenceSourceKind[] = [
  'note',
  'library_item',
  'resource',
  'project',
  'area',
  'task',
  'conversation',
  'kb_doc',
  'external_file',
  'external_ai_session'
];

interface MemorySourceSyncRecord {
  backend: MemoryBackendId;
  source_id: string;
  source_kind: EvidenceSourceKind;
  source_title: string;
  fingerprint: string;
  memory_ids: string[];
  updated_at: string;
}

interface MemorySourceSyncFile {
  version: typeof SYNC_VERSION;
  records: Record<string, MemorySourceSyncRecord>;
  updated_at?: string;
}

interface UpsertStats {
  created: number;
  updated: number;
  archived: number;
  memoryIds: string[];
}

export async function syncMemoryFromTruthLayer(
  vaultPath: string,
  options: MemorySourceSyncOptions = {}
): Promise<MemorySourceSyncResult> {
  const backendId = (await readMemoryBackendConfig(vaultPath)).active;
  const backend = await getActiveMemoryBackend(vaultPath);
  const state = await readSyncState(vaultPath);
  const provider = createOrbitEvidenceProvider(vaultPath);
  const sourceKinds = new Set(options.sourceKinds?.length ? options.sourceKinds : DEFAULT_SOURCE_KINDS);
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const maxMemoriesPerSource = Math.max(1, Math.min(5, options.maxMemoriesPerSource ?? DEFAULT_MAX_MEMORIES_PER_SOURCE));
  const byKind: Partial<Record<EvidenceSourceKind, number>> = {};
  const errors: MemorySourceSyncError[] = [];
  const seenRecordKeys = new Set<string>();
  let processed = 0;
  let skipped = 0;
  let created = 0;
  let updated = 0;
  let archived = 0;
  let memoryCount = 0;

  const sources = (await syncOrbitEvidenceSources(vaultPath, {
    includeActivities: false,
    includeExternalAISessions: options.includeExternalAISessions ?? true,
    externalAISessionLimit: limit
  }))
    .filter((source) => sourceKinds.has(source.kind))
    .filter(isSynthesisAllowed)
    .slice(0, limit);

  for (const source of sources) {
    const recordKey = syncRecordKey(backendId, source.id);
    seenRecordKeys.add(recordKey);
    byKind[source.kind] = (byKind[source.kind] ?? 0) + 1;

    const fingerprint = sourceFingerprint(source);
    const existing = state.records[recordKey];
    if (!options.force && existing?.fingerprint === fingerprint && existing.memory_ids.length > 0) {
      skipped += 1;
      memoryCount += existing.memory_ids.length;
      continue;
    }

    try {
      const text = await readSourceText(provider, source);
      const candidates = buildMemoryCandidates(source, text, maxMemoriesPerSource);
      if (!candidates.length) {
        skipped += 1;
        continue;
      }
      const stats = await upsertSourceMemories(backend, candidates, existing?.memory_ids ?? []);
      created += stats.created;
      updated += stats.updated;
      archived += stats.archived;
      memoryCount += stats.memoryIds.length;
      processed += 1;
      state.records[recordKey] = {
        backend: backendId,
        source_id: source.id,
        source_kind: source.kind,
        source_title: source.title,
        fingerprint,
        memory_ids: stats.memoryIds,
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      errors.push({
        source_id: source.id,
        title: source.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (options.archiveMissingSources) {
    for (const [recordKey, record] of Object.entries(state.records)) {
      if (record.backend !== backendId || seenRecordKeys.has(recordKey)) continue;
      for (const id of record.memory_ids) {
        await backend.archive(id).then(() => { archived += 1; }).catch(() => undefined);
      }
      delete state.records[recordKey];
    }
  }

  await writeSyncState(vaultPath, state);

  return {
    backend: backendId,
    source_count: sources.length,
    processed_count: processed,
    skipped_count: skipped,
    created_count: created,
    updated_count: updated,
    archived_count: archived,
    memory_count: memoryCount,
    by_kind: byKind,
    errors,
    synced_at: new Date().toISOString()
  };
}

function isSynthesisAllowed(source: EvidenceSource): boolean {
  if (source.availability !== 'available') return false;
  if (!source.privacy.allow_synthesis) return false;
  return source.privacy.index_level !== 'metadata_only';
}

async function readSourceText(
  provider: ReturnType<typeof createOrbitEvidenceProvider>,
  source: EvidenceSource
): Promise<string> {
  if (source.provider_id === EXTERNAL_AI_SESSION_PROVIDER_ID) {
    return cleanText(await readExternalAISessionSourceText(source, 'safe_projection') || source.summary || source.title);
  }
  const selector = wholeSourceSelector(source.id, 'safe_projection', 'memory source sync');
  const read = await provider.read(selector);
  const text = read.excerpts.map((excerpt) => excerpt.text).filter(Boolean).join('\n\n');
  return cleanText(text || source.summary || source.title);
}

function buildMemoryCandidates(
  source: EvidenceSource,
  text: string,
  maxMemoriesPerSource: number
): CreateMemoryInput[] {
  const synthesisSource = synthesisSourceForEvidence(source, text);
  const extracted = extractMemoryCandidates({
    source_kind: source.kind === 'conversation' ? 'conversation' : 'manual',
    source_ref: source.id,
    content: text
  }).map((candidate) => ({
    ...candidate,
    sources: [synthesisSource],
    related_entities: unique([...(candidate.related_entities ?? []), ...relatedEntitiesForSource(source)])
  }));
  const fallback = fallbackCandidateForSource(source, text, synthesisSource);
  return dedupeCandidates([fallback, ...extracted]).slice(0, maxMemoriesPerSource);
}

function fallbackCandidateForSource(
  source: EvidenceSource,
  text: string,
  synthesisSource: SynthesisSource
): CreateMemoryInput {
  const excerpt = snippet(text || source.summary || source.title, 420);
  const label = sourceKindLabel(source.kind);
  return {
    kind: 'entity_memory',
    title: `${label}：${source.title}`.slice(0, 80),
    summary: `${label}《${source.title}》是可引用的真相层来源：${excerpt}`,
    detail: [
      `来源类型：${label}`,
      `来源引用：${source.canonical_ref}`,
      `更新时间：${source.updated_at}`,
      '',
      snippet(text, 3000)
    ].join('\n'),
    sources: [synthesisSource],
    evidence_count: 1,
    confidence: source.ownership === 'orbit_owned' ? 0.58 : 0.52,
    related_entities: relatedEntitiesForSource(source)
  };
}

function synthesisSourceForEvidence(source: EvidenceSource, text: string): SynthesisSource {
  const selector = wholeSourceSelector(source.id, 'safe_projection', 'memory source sync');
  return {
    kind: synthesisKindForEvidence(source.kind),
    ref: evidenceRef(source),
    title: source.title,
    excerpt: snippet(text || source.summary || '', 500),
    metadata: {
      selector,
      source_id: source.id,
      evidence_kind: source.kind,
      source_fingerprint: sourceFingerprint(source),
      ownership: source.ownership,
      canonical_ref: source.canonical_ref,
      ...(source.metadata ?? {})
    }
  };
}

function synthesisKindForEvidence(kind: EvidenceSourceKind): SynthesisSourceKind {
  if (kind === 'library_item') return 'library';
  if (kind === 'activity_event') return 'event';
  if (kind === 'kb_doc') return 'kb';
  if (kind === 'external_ai_session') return 'external_ai_session';
  if (kind === 'note' || kind === 'resource' || kind === 'project' || kind === 'area' || kind === 'task' || kind === 'conversation') {
    return kind;
  }
  return 'raw';
}

async function upsertSourceMemories(
  backend: MemoryBackend,
  candidates: CreateMemoryInput[],
  previousIds: string[]
): Promise<UpsertStats> {
  const memoryIds: string[] = [];
  let created = 0;
  let updated = 0;
  let archived = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const previousId = previousIds[index];
    if (previousId) {
      const existing = await backend.get(previousId).catch(() => null);
      if (existing) {
        const next = await backend.update(previousId, candidate);
        memoryIds.push(next.id);
        updated += 1;
        continue;
      }
    }
    const createdMemory = await backend.create(candidate);
    memoryIds.push(createdMemory.id);
    created += 1;
  }

  for (const oldId of previousIds.slice(candidates.length)) {
    await backend.archive(oldId).then(() => { archived += 1; }).catch(() => undefined);
  }

  return { created, updated, archived, memoryIds };
}

function sourceFingerprint(source: EvidenceSource): string {
  return `${source.fingerprint.algorithm}:${source.fingerprint.value}`;
}

function evidenceRef(source: EvidenceSource): string {
  const entityRef = source.metadata?.['entity_ref'];
  return typeof entityRef === 'string' && entityRef ? entityRef : source.canonical_ref;
}

function relatedEntitiesForSource(source: EvidenceSource): string[] {
  const entities = [
    `${source.kind}:${evidenceRef(source)}`,
    ...((source.scope_refs ?? []).map((scope) => `${scope.kind}:${scope.ref}`))
  ];
  const connectorId = source.metadata?.['connector_id'];
  if (typeof connectorId === 'string' && connectorId) entities.push(`connector:${connectorId}`);
  const agent = source.metadata?.['agent'];
  if (typeof agent === 'string' && agent) entities.push(`agent:${agent}`);
  return unique(entities);
}

function dedupeCandidates(candidates: CreateMemoryInput[]): CreateMemoryInput[] {
  const seen = new Set<string>();
  const out: CreateMemoryInput[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function sourceKindLabel(kind: EvidenceSourceKind): string {
  switch (kind) {
    case 'note':
      return '笔记';
    case 'library_item':
      return '资料库';
    case 'resource':
      return '资源';
    case 'project':
      return '项目';
    case 'area':
      return '领域';
    case 'task':
      return '任务';
    case 'conversation':
      return '对话';
    case 'kb_doc':
      return '知识库';
    case 'external_file':
      return '连接器文档';
    case 'external_ai_session':
      return '本地 AI 会话';
    case 'activity_event':
      return '活动';
  }
}

function snippet(value: string, limit: number): string {
  return cleanText(value).slice(0, limit);
}

function cleanText(value: string): string {
  return value
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/<tool_use>[\s\S]*?<\/tool_use>/gu, ' ')
    .replace(/<tool_result>[\s\S]*?<\/tool_result>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function syncRecordKey(backend: MemoryBackendId, sourceId: string): string {
  return `${backend}:${sourceId}`;
}

function syncStatePath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'memory', 'source-sync.json');
}

async function readSyncState(vaultPath: string): Promise<MemorySourceSyncFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(syncStatePath(vaultPath), 'utf8')) as Partial<MemorySourceSyncFile>;
    return {
      version: SYNC_VERSION,
      records: parsed.records && typeof parsed.records === 'object' ? normalizeRecords(parsed.records) : {},
      ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {})
    };
  } catch (error) {
    if (isNotFound(error)) return { version: SYNC_VERSION, records: {} };
    throw error;
  }
}

async function writeSyncState(vaultPath: string, state: MemorySourceSyncFile): Promise<void> {
  const file = syncStatePath(vaultPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

function normalizeRecords(records: Record<string, MemorySourceSyncRecord>): Record<string, MemorySourceSyncRecord> {
  return Object.fromEntries(Object.entries(records).filter(([, record]) =>
    record &&
    (record.backend === 'orbit' || record.backend === 'hy-memory') &&
    typeof record.source_id === 'string' &&
    typeof record.fingerprint === 'string' &&
    Array.isArray(record.memory_ids)
  ));
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
