import type { ResetAllResult, WorktreeRecord } from '@shared/git';
import type { CreateOpts, RemoveOpts } from '../git/worktree';
import type { ExecutionContext } from './types';

export class UnsupportedSandboxExecutionContext implements ExecutionContext {
  readonly kind = 'sandbox' as const;

  create(_opts?: CreateOpts): Promise<WorktreeRecord> {
    return Promise.reject(this.notImplemented());
  }

  list(): Promise<WorktreeRecord[]> {
    return Promise.reject(this.notImplemented());
  }

  remove(_id: string, _opts?: RemoveOpts): Promise<void> {
    return Promise.reject(this.notImplemented());
  }

  resetAll(): Promise<ResetAllResult> {
    return Promise.reject(this.notImplemented());
  }

  get(_id: string): Promise<WorktreeRecord | null> {
    return Promise.reject(this.notImplemented());
  }

  setStatus(_id: string, _status: WorktreeRecord['status']): Promise<void> {
    return Promise.reject(this.notImplemented());
  }

  private notImplemented(): Error {
    return new Error('Sandbox ExecutionContext is not implemented');
  }
}
