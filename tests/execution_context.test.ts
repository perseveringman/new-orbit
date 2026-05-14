import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { ResetAllResult, WorktreeRecord } from '../src/shared/git';
import type { WorktreeManager } from '../src/main/git/worktree';
import {
  createExecutionContextForProject,
  selectExecutionContextKind,
  WorktreeExecutionContext
} from '../src/main/execution';
import { writeProjectConfig } from '../src/main/project_config';
import { createVault } from '../src/main/vault';
import { createTask, linkExistingProject } from '../src/main/project';

function createRecord(id: string): WorktreeRecord {
  return {
    id,
    branch: `orbit/ghost/${id}`,
    path: `/vault/.orbit/worktrees/${id}`,
    createdAt: '2026-04-26T00:00:00.000Z',
    status: 'active'
  };
}

function stubWorktreeManager(): { manager: WorktreeManager; calls: string[] } {
  const calls: string[] = [];
  const record = createRecord('ctx1');
  const resetResult: ResetAllResult = { removed: 1, errors: [] };
  const manager = {
    create: async (): Promise<WorktreeRecord> => {
      calls.push('create');
      return record;
    },
    list: async (): Promise<WorktreeRecord[]> => {
      calls.push('list');
      return [record];
    },
    remove: async (): Promise<void> => {
      calls.push('remove');
    },
    resetAll: async (): Promise<ResetAllResult> => {
      calls.push('resetAll');
      return resetResult;
    },
    get: async (): Promise<WorktreeRecord | null> => {
      calls.push('get');
      return record;
    },
    setStatus: async (): Promise<void> => {
      calls.push('setStatus');
    }
  } as unknown as WorktreeManager;
  return { manager, calls };
}

describe('ExecutionContext', () => {
  it('selects worktree by default and preserves sandbox opt-in', () => {
    expect(selectExecutionContextKind(null)).toBe('worktree');
    expect(selectExecutionContextKind({ execution_context: executionContext('worktree') })).toBe('worktree');
    expect(selectExecutionContextKind({ execution_context: executionContext('sandbox') })).toBe('sandbox');
  });

  it('WorktreeExecutionContext delegates to WorktreeManager without changing behavior', async () => {
    const { manager, calls } = stubWorktreeManager();
    const context = new WorktreeExecutionContext(manager);

    await expect(context.create({ taskId: 'task-1' })).resolves.toMatchObject({ id: 'ctx1' });
    await expect(context.list()).resolves.toHaveLength(1);
    await expect(context.get('ctx1')).resolves.toMatchObject({ id: 'ctx1' });
    await expect(context.resetAll()).resolves.toEqual({ removed: 1, errors: [] });
    await expect(context.setStatus('ctx1', 'merged')).resolves.toBeUndefined();
    await expect(context.remove('ctx1', { force: true })).resolves.toBeUndefined();
    expect(calls).toEqual(['create', 'list', 'get', 'resetAll', 'setStatus', 'remove']);
  });

  it('factory reads project execution_context and returns unsupported sandbox context', async () => {
    const projectDir = path.join(process.cwd(), '.execution-context-test-project');
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.mkdir(projectDir, { recursive: true });
    try {
      const { manager } = stubWorktreeManager();
      await writeProjectConfig(projectDir, {
        uid: 'project-1',
        slug: 'project-1',
        name: 'Project 1',
        type: 'project',
        template: 'blank',
        execution_context: executionContext('sandbox'),
        created_at: '2026-04-26T00:00:00.000Z',
        vision_linked: true,
        setup: [],
        teardown: [],
        vendor_bridge_files: false,
        watcher: { enabled: true, extra_ignores: [] },
        agent_exposure: {
          mode: 'isolated',
          exposeAgentMdBridge: false,
          exposeAgentsMdBridge: false,
          consumeCommunityAgentMd: false,
          consumeCommunityAgentsMd: false,
          consumeCommunityDotAgent: false
        }
      });

      const context = await createExecutionContextForProject(projectDir, {
        worktreeManager: manager
      });
      expect(context.kind).toBe('sandbox');
      await expect(context.create()).rejects.toThrow('Sandbox ExecutionContext is not implemented');
    } finally {
      await fs.rm(projectDir, { recursive: true, force: true });
    }
  });

  it('creates worktrees beside an external project workdir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-external-worktree-'));
    const vault = path.join(root, 'vault');
    const repo = path.join(root, 'external-repo');
    try {
      await createVault(vault);
      await fs.mkdir(repo, { recursive: true });
      await fs.writeFile(path.join(repo, 'package.json'), '{"name":"external-repo"}\n', 'utf8');
      const git = simpleGit(repo);
      await git.init();
      await git.addConfig('user.name', 'Orbit', false, 'local').catch(() => undefined);
      await git.addConfig('user.email', 'orbit@localhost', false, 'local').catch(() => undefined);
      await git.add('.');
      await git.commit('init');
      await git.branch(['-M', 'main']);

      const project = await linkExistingProject(vault, {
        slug: 'external-repo',
        name: 'External Repo',
        workdirPath: repo,
        execution_context: 'worktree'
      });
      const task = await createTask(vault, {
        project_uid: project.uid,
        title: 'Use external worktree'
      });
      const context = await createExecutionContextForProject(project.projectPath, {
        vaultPath: vault
      });
      const record = await context.create({ taskId: task.uid });

      expect(record.path).toContain(path.join(root, '.orbit-worktrees', 'external-repo'));
      await expect(fs.readFile(path.join(record.path, 'package.json'), 'utf8')).resolves.toContain(
        'external-repo'
      );

      await context.remove(record.id, { force: true });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

function executionContext(kind: 'worktree' | 'direct' | 'sandbox') {
  return {
    kind,
    worktree_root: 'workdir-sibling' as const,
    worktree_dir_name: '.orbit-worktrees'
  };
}
