import { publishTraceableEvent } from './events/bus';
import { createEvidenceChunkIndexStore, type EvidenceIndexBuildOptions } from './evidence/chunk-index';
import { syncMemoryFromTruthLayer } from './memory/source-sync';
import { createSemanticIndexStore } from './semantic/index-store';
import type { EvidenceSourceKind } from '@shared/evidence';
import type { SemanticIndexStatus } from '@shared/semantic';

export interface RagDataPlaneSyncOptions extends EvidenceIndexBuildOptions {
  reason: string;
  rebuildSemantic?: boolean;
  syncMemory?: boolean;
  memorySourceKinds?: EvidenceSourceKind[];
  archiveMissingMemorySources?: boolean;
}

export interface RagDataPlaneSyncResult {
  reason: string;
  chunk_count: number;
  source_count: number;
  semantic_status?: SemanticIndexStatus;
  memory_count?: number;
  synced_at: string;
}

export async function syncRagDataPlane(
  vaultPath: string,
  options: RagDataPlaneSyncOptions
): Promise<RagDataPlaneSyncResult> {
  const chunkIndex = await createEvidenceChunkIndexStore(vaultPath).syncIncremental(options);
  const semanticStatus = options.rebuildSemantic
    ? await createSemanticIndexStore(vaultPath).rebuildIndex()
    : undefined;
  const memory = options.syncMemory
    ? await syncMemoryFromTruthLayer(vaultPath, {
        sourceKinds: options.memorySourceKinds,
        includeExternalAISessions: options.includeExternalAISessions,
        archiveMissingSources: options.archiveMissingMemorySources
      })
    : undefined;
  const result: RagDataPlaneSyncResult = {
    reason: options.reason,
    chunk_count: Object.keys(chunkIndex.chunks).length,
    source_count: Object.keys(chunkIndex.source_fingerprints).length,
    ...(semanticStatus ? { semantic_status: semanticStatus } : {}),
    ...(memory ? { memory_count: memory.memory_count } : {}),
    synced_at: new Date().toISOString()
  };
  publishTraceableEvent({
    source: 'synthesis',
    type: 'rag.data_plane.synced',
    summary: `RAG data plane synced: ${options.reason}`,
    payload: result
  });
  return result;
}

export async function ensureInitialSemanticIndex(vaultPath: string): Promise<SemanticIndexStatus> {
  const store = createSemanticIndexStore(vaultPath);
  const status = await store.status();
  if (status.total_docs > 0) return status;
  return store.rebuildIndex();
}
