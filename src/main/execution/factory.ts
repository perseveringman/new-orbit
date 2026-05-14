import { WorktreeManager, type WorktreeManagerDeps } from '../git/worktree';
import {
  projectExecutionContextKind,
  readProjectConfig,
  type ProjectConfig,
  type ProjectExecutionContext
} from '../project_config';
import { projectWorktreeRoot, resolveProjectWorkdir } from '../project_workdir';
import { PROJECTS_DIR } from '@shared/constants';
import path from 'node:path';
import { DirectExecutionContext } from './direct';
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
  vaultPath?: string;
};

export function selectExecutionContextKind(
  config: Pick<ProjectConfig, 'execution_context'> | null | undefined
): ProjectExecutionContext {
  return projectExecutionContextKind(config);
}

export function createExecutionContext(
  kind: ProjectExecutionContext,
  deps: ExecutionContextFactoryDeps
): ExecutionContext {
  if (kind === 'sandbox') {
    return new UnsupportedSandboxExecutionContext();
  }
  if (kind === 'direct') {
    return new DirectExecutionContext();
  }
  return new WorktreeExecutionContext(createWorktreeManager(deps));
}

export async function createExecutionContextForProject(
  projectDir: string,
  deps: ProjectExecutionContextFactoryDeps = {}
): Promise<ExecutionContext> {
  const config = await readProjectConfig(projectDir);
  const kind = selectExecutionContextKind(config);
  if (kind === 'direct') return new DirectExecutionContext();
  if (deps.worktreeManager) {
    return createExecutionContext(kind, { worktreeManager: deps.worktreeManager });
  }
  const vaultPath = deps.vaultPath ?? inferVaultPathFromProjectDir(projectDir);
  const workdir = resolveProjectWorkdir(projectDir, config);
  const uid = config?.uid || path.basename(projectDir);
  const slug = config?.slug || path.basename(projectDir);
  const executionContext = config?.execution_context ?? {
    kind,
    worktree_root: 'workdir-sibling' as const,
    worktree_dir_name: '.orbit-worktrees'
  };
  const worktreeRoot = projectWorktreeRoot({
    vaultPath,
    projectDir,
    slug,
    uid,
    workdir,
    executionContext
  });
  return createExecutionContext(kind, {
    vault: vaultPath,
    vaultPath,
    projectPath: projectDir,
    repoRoot: config?.git?.root_path ?? workdir,
    worktreeRoot,
    ...deps
  });
}

function createWorktreeManager(deps: ExecutionContextFactoryDeps): WorktreeManager {
  if ('worktreeManager' in deps) {
    return deps.worktreeManager;
  }
  return new WorktreeManager(deps);
}

function inferVaultPathFromProjectDir(projectDir: string): string {
  const parent = path.dirname(projectDir);
  if (path.basename(parent) === PROJECTS_DIR) return path.dirname(parent);
  return projectDir;
}
