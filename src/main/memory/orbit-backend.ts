import type {
  CreateMemoryInput,
  MemoryBackendDescriptor,
  MemoryFilter,
  MemoryNode,
  RecallOptions,
  RecallResult,
  UpdateMemoryInput
} from '@shared/memory';
import { recallWithStore } from './recall-service';
import { createMemoryStore, type MemoryStore } from './store';
import type { MemoryBackend } from './backend-types';

export class OrbitMemoryBackend implements MemoryBackend {
  private readonly store: MemoryStore;

  constructor(vaultPath: string) {
    this.store = createMemoryStore(vaultPath);
  }

  async descriptor(): Promise<MemoryBackendDescriptor> {
    return {
      id: 'orbit',
      label: 'Orbit 自研记忆',
      description: '使用 Orbit 本地 MemoryNode、证据链、稳定度演化和显式提升流程。',
      capabilities: [
        'list',
        'create',
        'update',
        'archive',
        'merge',
        'recall',
        'feedback',
        'graph',
        'clusters',
        'promote'
      ],
      active: false,
      configured: true,
      health: 'ready',
      details: '本地后端可用。'
    };
  }

  list(filter?: MemoryFilter): Promise<MemoryNode[]> {
    return this.store.list(filter);
  }

  get(id: string): Promise<MemoryNode | null> {
    return this.store.get(id);
  }

  create(input: CreateMemoryInput): Promise<MemoryNode> {
    return this.store.create(input);
  }

  update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode> {
    return this.store.update(id, patch);
  }

  archive(id: string): Promise<void> {
    return this.store.archive(id);
  }

  merge(fromId: string, toId: string): Promise<MemoryNode> {
    return this.store.merge(fromId, toId);
  }

  promoteToResource(id: string) {
    return this.store.promoteToResource(id);
  }

  promoteToProject(id: string) {
    return this.store.promoteToProject(id);
  }

  recall(query: string, options?: RecallOptions): Promise<RecallResult> {
    return recallWithStore(this.store, query, options);
  }

  recallStats(id: string) {
    return this.store.getRecallStats(id);
  }

  clusters() {
    return this.store.listClusters();
  }

  graph(filter?: MemoryFilter) {
    return this.store.graph(filter);
  }

  feedback(id: string, helpful: boolean): Promise<MemoryNode> {
    return this.store.recordFeedback(id, helpful);
  }
}
