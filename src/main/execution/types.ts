import type { ResetAllResult, WorktreeRecord } from '@shared/git';
import type { CreateOpts, RemoveOpts } from '../git/worktree';
import type { ProjectExecutionContext } from '../project_config';

export type ExecutionContextKind = ProjectExecutionContext;

export interface ExecutionContext {
  readonly kind: ExecutionContextKind;

  create(opts?: CreateOpts): Promise<WorktreeRecord>;
  list(): Promise<WorktreeRecord[]>;
  remove(id: string, opts?: RemoveOpts): Promise<void>;
  resetAll(): Promise<ResetAllResult>;
  get(id: string): Promise<WorktreeRecord | null>;
  setStatus(id: string, status: WorktreeRecord['status']): Promise<void>;
}
