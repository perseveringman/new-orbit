import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { StartTaskResult } from '../src/shared/agent';
import type { WorktreeRecord } from '../src/shared/git';
import type { TaskRecord } from '../src/shared/schemas';
import type { ExecutionContext } from '../src/main/execution';
import type { RunnerPool } from '../src/main/agent/pool';
import { AutoRunnerDispatcher } from '../src/main/auto_runner/dispatcher';
import type { AutoRunnerEventBridge } from '../src/main/auto_runner/event_bridge';

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: `file:${overrides.uid ?? 'task'}`,
    source: 'file',
    status: 'todo',
    title: overrides.uid ?? 'Task',
    filePath: `/vault/${overrides.uid ?? 'task'}.md`,
    relPath: `${overrides.uid ?? 'task'}.md`,
    project_uid: 'project_1',
    created_by: 'user',
    approved_by: 'user',
    depends_on: [],
    ...overrides
  };
}

function worktree(id: string): WorktreeRecord {
  return {
    id,
    branch: `orbit/ghost/${id}`,
    path: `/vault/.orbit/worktrees/${id}`,
    createdAt: '2026-04-26T00:00:00.000Z',
    status: 'active'
  };
}

function fakeContext(kind: 'worktree' | 'sandbox' = 'worktree'): ExecutionContext {
  const rec = worktree('wt1');
  return {
    kind,
    create: vi.fn(async () => rec),
    list: vi.fn(async () => []),
    remove: vi.fn(async () => undefined),
    resetAll: vi.fn(async () => ({ removed: 0, errors: [] })),
    get: vi.fn(async () => rec),
    setStatus: vi.fn(async () => undefined)
  };
}

function fakePool(status: 'done' | 'error' | 'killed' = 'done'): RunnerPool {
  const pool = new EventEmitter() as unknown as RunnerPool;
  (pool as unknown as { get: unknown }).get = vi.fn(() => ({
    snapshot: () => ({
      summary: {
        runId: 'run_1',
        taskId: 'file:ready',
        status,
        startedAt: '2026-04-26T00:00:00.000Z',
        cwd: '/vault/.orbit/worktrees/wt1'
      },
      events: [],
      tally: {}
    })
  }));
  return pool;
}

function fakeBridge(): AutoRunnerEventBridge {
  return {
    runStarted: vi.fn(),
    runCompleted: vi.fn(),
    runFailed: vi.fn(async () => undefined),
    sandboxUnsupported: vi.fn(async () => undefined)
  } as unknown as AutoRunnerEventBridge;
}

describe('AutoRunnerDispatcher', () => {
  it('does not launch when disabled by settings', async () => {
    const startTask = vi.fn<[], Promise<StartTaskResult>>();
    const dispatcher = new AutoRunnerDispatcher({
      readSettings: async () => ({
        enabled: false,
        maxConcurrent: 2,
        hourlyTaskLimit: 10,
        tickIntervalMs: 5000
      }),
      listTasks: () => [task({ uid: 'ready' })],
      startTask,
      setInterval: (() => 1) as unknown as typeof setInterval,
      clearInterval: vi.fn()
    });

    await dispatcher.attach('/vault');
    await dispatcher.tick();

    expect(startTask).not.toHaveBeenCalled();
    await expect(dispatcher.status()).resolves.toMatchObject({
      enabled: false,
      readyTaskCount: 1
    });
  });

  it('launches only dependency-ready tasks within concurrency and hourly limits', async () => {
    const context = fakeContext();
    const updates: Array<{ task: string; patch: Record<string, unknown> }> = [];
    const startTask = vi.fn(async () => ({ kind: 'ok', runId: 'run_1' }) satisfies StartTaskResult);
    const bridge = fakeBridge();
    const dispatcher = new AutoRunnerDispatcher({
      readSettings: async () => ({
        enabled: true,
        maxConcurrent: 2,
        hourlyTaskLimit: 1,
        tickIntervalMs: 5000
      }),
      listTasks: () => [
        task({ uid: 'ready' }),
        task({ uid: 'dep', status: 'blocked' }),
        task({ uid: 'waiting', depends_on: ['dep'] })
      ],
      resolveProjectPath: async () => '/vault/01_Projects/demo',
      createContextForProject: async () => context,
      startTask,
      updateTask: async (entry, patch) => {
        updates.push({ task: entry.uid ?? entry.id, patch });
      },
      eventBridge: bridge,
      setInterval: (() => 1) as unknown as typeof setInterval,
      clearInterval: vi.fn()
    });

    await dispatcher.attach('/vault');
    await dispatcher.tick();

    expect(startTask).toHaveBeenCalledTimes(1);
    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'file:ready', worktreePath: '/vault/.orbit/worktrees/wt1' })
    );
    expect(updates.map((entry) => entry.patch)).toEqual([
      expect.objectContaining({ status: 'doing', owner_id: 'auto_runner' }),
      { active_run_id: 'run_1' }
    ]);
    expect(bridge.runStarted).toHaveBeenCalledTimes(1);
    await expect(dispatcher.status()).resolves.toMatchObject({
      running: [expect.objectContaining({ runId: 'run_1', taskUid: 'ready' })],
      hourlyStarted: 1,
      hourlyRemaining: 0
    });
  });

  it('emits a sandbox unsupported help event instead of launching', async () => {
    const bridge = fakeBridge();
    const updates: Record<string, unknown>[] = [];
    const startTask = vi.fn(async () => ({ kind: 'ok', runId: 'run_1' }) satisfies StartTaskResult);
    const dispatcher = new AutoRunnerDispatcher({
      readSettings: async () => ({
        enabled: true,
        maxConcurrent: 2,
        hourlyTaskLimit: 10,
        tickIntervalMs: 5000
      }),
      listTasks: () => [task({ uid: 'sandbox-task' })],
      resolveProjectPath: async () => '/vault/01_Projects/research',
      createContextForProject: async () => fakeContext('sandbox'),
      startTask,
      updateTask: async (_entry, patch) => {
        updates.push(patch);
      },
      eventBridge: bridge,
      setInterval: (() => 1) as unknown as typeof setInterval,
      clearInterval: vi.fn()
    });

    await dispatcher.attach('/vault');
    await dispatcher.tick();

    expect(startTask).not.toHaveBeenCalled();
    expect(updates).toEqual([
      expect.objectContaining({
        status: 'blocked',
        blocked_reason: expect.stringContaining('Sandbox ExecutionContext')
      })
    ]);
    expect(bridge.sandboxUnsupported).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Sandbox ExecutionContext') })
    );
  });

  it('bridges terminal pool completion to Activity and clears the lease', async () => {
    const pool = fakePool('done');
    const bridge = fakeBridge();
    const updates: Record<string, unknown>[] = [];
    const dispatcher = new AutoRunnerDispatcher({
      readSettings: async () => ({
        enabled: true,
        maxConcurrent: 1,
        hourlyTaskLimit: 10,
        tickIntervalMs: 5000
      }),
      listTasks: () => [task({ uid: 'ready' })],
      resolveProjectPath: async () => '/vault/01_Projects/demo',
      createContextForProject: async () => fakeContext(),
      startTask: async () => ({ kind: 'ok', runId: 'run_1' }),
      updateTask: async (_entry, patch) => {
        updates.push(patch);
      },
      eventBridge: bridge,
      pool,
      setInterval: (() => 1) as unknown as typeof setInterval,
      clearInterval: vi.fn()
    });

    await dispatcher.attach('/vault');
    await dispatcher.tick();
    pool.emit('event', {
      runId: 'run_1',
      event: { idx: 1, at: '2026-04-26T00:00:01.000Z', kind: 'done', text: 'exit 0' }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.runCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run_1', task: expect.objectContaining({ uid: 'ready' }) })
    );
    expect(updates.at(-1)).toEqual(
      expect.objectContaining({ owner_type: undefined, owner_id: undefined, active_run_id: undefined })
    );
    await expect(dispatcher.status()).resolves.toMatchObject({ running: [] });
  });
});
