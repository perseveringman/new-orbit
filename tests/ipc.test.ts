import { describe, expect, it } from 'vitest';
import { IPC, type OrbitApi } from '../src/shared/ipc';
import { DEFAULT_BUDGET } from '../src/shared/schemas';

describe('IPC contract', () => {
  it('exposes the required namespaces', () => {
    expect(Object.keys(IPC).sort()).toEqual(
      [
        'agent',
        'area',
        'conversation',
        'dispatch',
        'distill',
        'env',
        'envExt',
        'fs',
        'git',
        'github',
        'migrations',
        'nightShift',
        'para',
        'planner',
        'project',
        'review',
        'role',
        'runtime',
        'settings',
        'task',
        'terminal',
        'terminalAgent',
        'vaultConfig',
        'vision',
        'workspace'
      ].sort()
    );
  });

  it('workspace + settings channels are typed strings', () => {
    expect(typeof IPC.workspace.pickAndOpen).toBe('string');
    expect(typeof IPC.settings.setTheme).toBe('string');
  });

  it('conversation namespace declares task chat channels', () => {
    const keys = Object.keys(IPC.conversation).sort();
    expect(keys).toEqual(['event', 'get', 'send'].sort());
    for (const v of Object.values(IPC.conversation)) {
      expect(v.startsWith('conversation:')).toBe(true);
    }
  });

  it('agent namespace declares the M4 + M5 + M6 channels', () => {
    const keys = Object.keys(IPC.agent).sort();
    expect(keys).toEqual(
      [
        'budgetGet',
        'budgetUpdate',
        'costDailyReport',
        'costRun',
        'costToday',
        'detect',
        'event',
        'installInWorktree',
        'list',
        'reattach',
        'startTask',
        'stop',
        'tail'
      ].sort()
    );
    // All channel values start with their namespace so main-side registration can't collide.
    for (const v of Object.values(IPC.agent)) expect(v.startsWith('agent:')).toBe(true);
  });

  it('git namespace declares M5 worktree + merge channels + inspector changes channels', () => {
    const keys = Object.keys(IPC.git).sort();
    expect(keys).toEqual(
      [
        'commit',
        'commitSelection',
        'createWorktree',
        'discardPaths',
        'getChanges',
        'getDiff',
        'getWorkingTreeDiff',
        'ghostCommit',
        'listWorktrees',
        'mergeGhost',
        'preMergeCheck',
        'removeWorktree',
        'resetAll',
        'stagePaths',
        'status',
        'unstagePaths'
      ].sort()
    );
    for (const v of Object.values(IPC.git)) expect(v.startsWith('git:')).toBe(true);
  });

  it('terminal namespace declares R4 pty channels + events', () => {
    const keys = Object.keys(IPC.terminal).sort();
    expect(keys).toEqual(
      ['data', 'exit', 'kill', 'list', 'open', 'resize', 'write'].sort()
    );
    for (const v of Object.values(IPC.terminal)) expect(v.startsWith('terminal:')).toBe(true);
  });

  it('terminalAgent namespace declares session awareness channels', () => {
    const keys = Object.keys(IPC.terminalAgent).sort();
    expect(keys).toEqual(['detail', 'event', 'list'].sort());
    for (const v of Object.values(IPC.terminalAgent)) {
      expect(v.startsWith('terminalAgent:')).toBe(true);
    }
  });

  it('github namespace declares workspace + project + binding channels', () => {
    const keys = Object.keys(IPC.github).sort();
    expect(keys).toEqual(
      [
        'authenticate',
        'bindTaskIssue',
        'createPullRequest',
        'getConnection',
        'getProjectDetails',
        'getProjectState',
        'importRepository',
        'listRepositories',
        'publishProject',
        'unbindTaskIssue'
      ].sort()
    );
    for (const v of Object.values(IPC.github)) expect(v.startsWith('github:')).toBe(true);
  });

  it('fs namespace declares vault + project tree channels', () => {
    const keys = Object.keys(IPC.fs).sort();
    expect(keys).toContain('listTree');
    expect(keys).toContain('listProjectTree');
    expect(keys).toContain('createDirectory');
    for (const v of Object.values(IPC.fs)) expect(v.startsWith('fs:')).toBe(true);
  });

  it('OrbitApi type shape is assignable', () => {
    const defSettings = {
      lastVaultPath: null,
      theme: 'dark' as const,
      budget: { ...DEFAULT_BUDGET },
      reopenLastVault: true,
      claudePath: '',
      anthropicApiKey: '',
      vectorWakeThreshold: 0.2,
      autoRunner: {
        enabled: false,
        maxConcurrent: 2,
        hourlyTaskLimit: 10,
        tickIntervalMs: 5000
      },
      worktreeGcEnabled: true,
      worktreeGcDays: 7
    };
    // Compile-time test: this block will fail typecheck if the shape drifts.
    const shape: Pick<OrbitApi, 'workspace' | 'settings' | 'github'> = {
      workspace: {
        pickAndOpen: async () => ({ ok: false, reason: 'cancelled' }),
        createNew: async () => ({ ok: false, reason: 'cancelled' }),
        openPath: async (_p: string) => ({ ok: false, reason: 'cancelled' }),
        current: async () => null,
        close: async () => undefined,
        crashLogPath: async () => '/tmp/does-not-matter.log',
        reportCrash: async () => '/tmp/does-not-matter.log',
        revealUserData: async () => undefined,
        revealVaultOrbit: async () => undefined,
        diagnostics: async () => ({
          version: '0.0.0',
          os: 'test',
          arch: 'x64',
          electron: '0.0.0',
          node: '0.0.0',
          vaultPath: null,
          claudePath: null,
          claudeVersion: null,
          crashLogPath: '/tmp/none.log',
          userDataPath: '/tmp/userData'
        })
      },
      settings: {
        get: async () => defSettings,
        setTheme: async (t) => ({ ...defSettings, theme: t }),
        update: async (partial) => ({ ...defSettings, ...partial }),
        detectClaude: async () => ({ available: false, error: 'test' })
      },
      github: {
        getConnection: async () => ({ available: true, authenticated: false, host: 'github.com' }),
        authenticate: async () => ({
          available: true,
          authenticated: true,
          host: 'github.com',
          viewer: 'orbit-test'
        }),
        listRepositories: async () => [],
        getProjectState: async () => ({
          connection: { available: true, authenticated: false, host: 'github.com' },
          binding: null,
          sync: null,
          pullRequest: null,
          canPublish: true
        }),
        getProjectDetails: async () => ({
          overview: {
            connection: { available: true, authenticated: false, host: 'github.com' },
            binding: null,
            sync: null,
            pullRequest: null,
            canPublish: true
          },
          issues: [],
          pullRequests: [],
          checks: [],
          reviews: [],
          worktrees: [],
          taskBindings: [],
          lastSyncedAt: null
        }),
        publishProject: async () => ({
          connection: { available: true, authenticated: false, host: 'github.com' },
          binding: null,
          sync: null,
          pullRequest: null,
          canPublish: false
        }),
        importRepository: async () => ({
          uid: 'project-1',
          slug: 'project-1',
          projectPath: '/tmp/project-1',
          binding: null
        }),
        createPullRequest: async () => ({
          number: 1,
          url: 'https://github.com/acme/repo/pull/1',
          title: 'Test',
          state: 'open',
          baseBranch: 'main',
          headBranch: 'feature/test'
        }),
        bindTaskIssue: async () => ({
          taskId: 'file:task.md',
          taskTitle: 'Task',
          issueNumber: 1,
          issueTitle: 'Issue',
          issueUrl: 'https://github.com/acme/repo/issues/1'
        }),
        unbindTaskIssue: async () => undefined
      }
    };
    expect(shape.workspace).toBeDefined();
    expect(shape.settings).toBeDefined();
    expect(shape.github).toBeDefined();
  });
});
