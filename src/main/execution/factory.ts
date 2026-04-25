import { WorktreeManager, type WorktreeManagerDeps } from '../git/worktree';
import {
  readProjectConfig,
  type ProjectConfig,
  type ProjectExecutionContext
} from '../project_config';
import { UnsupportedSandboxExecutionContext } from './sandbox';
import type { ExecutionContext } from './types';
import { WorktreeExecutionContext } from './worktree';

export type ExecutionContextFactoryDeps =
  | WorktreeManagerDeps
  | {
      worktreeManager: WorktreeManager;
    };

export type ProjectExecutionContextFactoryDeps = Partial<Omit<WorktreeManagerDeps, 'vault'>> & {
  worktreeManager?: WorktreeManager;
};

export function selectExecutionContextKind(
  config: Pick<ProjectConfig, 'execution_context'> | null | undefined
): ProjectExecutionContext {
  return config?.execution_context ?? 'worktree';
}

export function createExecutionContext(
  kind: ProjectExecutionContext,
  deps: ExecutionContextFactoryDeps
): ExecutionContext {
  if (kind === 'sandbox') {
    return new UnsupportedSandboxExecutionContext();
  }
  return new WorktreeExecutionContext(createWorktreeManager(deps));
}

export async function createExecutionContextForProject(
  projectDir: string,
  deps: ProjectExecutionContextFactoryDeps = {}
): Promise<ExecutionContext> {
  const config = await readProjectConfig(projectDir);
  const kind = selectExecutionContextKind(config);
  if (deps.worktreeManager) {
    return createExecutionContext(kind, { worktreeManager: deps.worktreeManager });
  }
  return createExecutionContext(kind, {
    vault: projectDir,
    ...deps
  });
}

function createWorktreeManager(deps: ExecutionContextFactoryDeps): WorktreeManager {
  if ('worktreeManager' in deps) {
    return deps.worktreeManager;
  }
  return new WorktreeManager(deps);
}
