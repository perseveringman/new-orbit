import type { ResetAllResult, WorktreeRecord } from '@shared/git';
import { WorktreeManager, type CreateOpts, type RemoveOpts } from '../git/worktree';
import type { ExecutionContext } from './types';

export class WorktreeExecutionContext implements ExecutionContext {
  readonly kind = 'worktree' as const;

  constructor(private readonly manager: WorktreeManager) {}

  create(opts?: CreateOpts): Promise<WorktreeRecord> {
    return this.manager.create(opts);
  }

  list(): Promise<WorktreeRecord[]> {
    return this.manager.list();
  }

  remove(id: string, opts?: RemoveOpts): Promise<void> {
    return this.manager.remove(id, opts);
  }

  resetAll(): Promise<ResetAllResult> {
    return this.manager.resetAll();
  }

  get(id: string): Promise<WorktreeRecord | null> {
    return this.manager.get(id);
  }

  setStatus(id: string, status: WorktreeRecord['status']): Promise<void> {
    return this.manager.setStatus(id, status);
  }
}
