import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ResetAllResult, WorktreeRecord } from '../src/shared/git';
import type { WorktreeManager } from '../src/main/git/worktree';
import {
  createExecutionContextForProject,
  selectExecutionContextKind,
  WorktreeExecutionContext
} from '../src/main/execution';
import { writeProjectConfig } from '../src/main/project_config';

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
    expect(selectExecutionContextKind({ execution_context: 'worktree' })).toBe('worktree');
    expect(selectExecutionContextKind({ execution_context: 'sandbox' })).toBe('sandbox');
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
        template: 'blank',
        execution_context: 'sandbox',
        created_at: '2026-04-26T00:00:00.000Z',
        vision_linked: true,
        setup: [],
        teardown: [],
        agent_exposure: {
          mode: 'isolated',
          exposeMcpBridge: false,
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
});
