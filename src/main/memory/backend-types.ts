import type {
  CreateMemoryInput,
  MemoryBackendDescriptor,
  MemoryCluster,
  MemoryFilter,
  MemoryGraph,
  MemoryNode,
  PromoteMemoryToProjectResult,
  PromoteMemoryToResourceResult,
  RecallOptions,
  RecallResult,
  RecallStats,
  UpdateMemoryInput
} from '@shared/memory';

export interface MemoryBackend {
  descriptor(): Promise<MemoryBackendDescriptor>;
  test?(): Promise<MemoryBackendDescriptor>;
  dispose?(): Promise<void>;
  list(filter?: MemoryFilter): Promise<MemoryNode[]>;
  get(id: string): Promise<MemoryNode | null>;
  create(input: CreateMemoryInput): Promise<MemoryNode>;
  update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode>;
  archive(id: string): Promise<void>;
  merge(fromId: string, toId: string): Promise<MemoryNode>;
  promoteToResource(id: string): Promise<PromoteMemoryToResourceResult>;
  promoteToProject(id: string): Promise<PromoteMemoryToProjectResult>;
  recall(query: string, options?: RecallOptions): Promise<RecallResult>;
  recallStats(id: string): Promise<RecallStats>;
  clusters(): Promise<MemoryCluster[]>;
  graph(filter?: MemoryFilter): Promise<MemoryGraph>;
  feedback(id: string, helpful: boolean): Promise<MemoryNode>;
}
