import type { ResetAllResult, WorktreeRecord } from '@shared/git';
import type { CreateOpts, RemoveOpts } from '../git/worktree';
import type { ExecutionContext } from './types';

export class DirectExecutionContext implements ExecutionContext {
  readonly kind = 'direct' as const;

  async create(_opts?: CreateOpts): Promise<WorktreeRecord> {
    throw new Error('Direct ExecutionContext does not create worktrees');
  }

  async list(): Promise<WorktreeRecord[]> {
    return [];
  }

  async remove(_id: string, _opts?: RemoveOpts): Promise<void> {
    return;
  }

  async resetAll(): Promise<ResetAllResult> {
    return { removed: 0, errors: [] };
  }

  async get(_id: string): Promise<WorktreeRecord | null> {
    return null;
  }

  async setStatus(_id: string, _status: WorktreeRecord['status']): Promise<void> {
    return;
  }
}
