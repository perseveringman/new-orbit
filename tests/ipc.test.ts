import { describe, expect, it } from 'vitest';
import { IPC, type OrbitApi } from '../src/shared/ipc';
import { DEFAULT_AUTO_RUNNER_SETTINGS, DEFAULT_BUDGET } from '../src/shared/schemas';

describe('IPC contract', () => {
  it('exposes the required namespaces', () => {
    expect(Object.keys(IPC).sort()).toEqual(
      [
        'activity',
        'agent',
        'approval',
        'area',
        'assets',
        'autoRunner',
        'capture',
        'chat',
        'conversation',
        'dashboard',
        'dispatch',
        'distill',
        'env',
        'envExt',
        'events',
        'evidence',
        'externalGateway',
        'feeds',
        'fs',
        'gateway',
        'git',
        'github',
        'inbox',
        'knowledgeBase',
        'library',
        'memory',
        'migrations',
        'notes',
        'onboarding',
        'para',
        'planner',
        'project',
        'quickCapture',
        'resources',
        'review',
        'role',
        'runtime',
        'scheduledTasks',
        'settings',
        'space',
        'stage',
        'semantic',
        'synthesis',
        'task',
        'terminal',
        'terminalAgent',
        'timeline',
        'tools',
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
    expect(keys).toEqual(['event', 'get', 'send', 'switchRuntime'].sort());
    for (const v of Object.values(IPC.conversation)) {
      expect(v.startsWith('conversation:')).toBe(true);
    }
  });

  it('chat namespace declares first-class conversation channels', () => {
    const keys = Object.keys(IPC.chat).sort();
    expect(keys).toEqual(
      [
        'conversationAppendTurn',
        'conversationArchive',
        'conversationCreate',
        'conversationFindByAnchor',
        'conversationGet',
        'conversationLastActive',
        'conversationList',
        'conversationSetLastActive',
        'conversationUpdate',
        'action',
        'runtimeEvent'
      ].sort()
    );
    for (const v of Object.values(IPC.chat)) expect(v.startsWith('chat:')).toBe(true);
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
        'sendMessage',
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

  it('scheduledTasks namespace declares Phase 8 management aliases', () => {
    const keys = Object.keys(IPC.scheduledTasks).sort();
    expect(keys).toEqual(
      [
        'create',
        'delete',
        'disable',
        'enable',
        'event',
        'executions',
        'get',
        'getExecutions',
        'list',
        'parseNaturalLanguage',
        'pause',
        'resume',
        'runNow',
        'triggerNow',
        'update'
      ].sort()
    );
    for (const v of Object.values(IPC.scheduledTasks)) expect(v.startsWith('scheduledTasks:')).toBe(true);
  });

  it('gateway namespace declares daemon, channel, and message APIs', () => {
    const keys = Object.keys(IPC.gateway).sort();
    expect(keys).toEqual(
      [
        'addChannel',
        'configGet',
        'configUpdate',
        'disableChannel',
        'enableChannel',
        'event',
        'generateBindCode',
        'getMessages',
        'getStatus',
        'listChannels',
        'removeChannel',
        'routeInbound',
        'sendOutbound',
        'setVaultPath',
        'start',
        'startDaemon',
        'status',
        'stop',
        'stopDaemon',
        'updateChannel'
      ].sort()
    );
    for (const v of Object.values(IPC.gateway)) expect(v.startsWith('gateway:')).toBe(true);
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

  it('library namespace declares Phase 6.2 workstation channels', () => {
    const keys = Object.keys(IPC.library).sort();
    expect(keys).toEqual(
      [
        'acceptDistillation',
        'annotate',
        'archive',
        'distill',
        'get',
        'list',
        'markRead',
        'save',
        'update'
      ].sort()
    );
    for (const v of Object.values(IPC.library)) expect(v.startsWith('library:')).toBe(true);
  });

  it('feeds namespace declares Phase 6.3 reader channels', () => {
    const keys = Object.keys(IPC.feeds).sort();
    expect(keys).toEqual(
      [
        'cluster',
        'digest',
        'fetch',
        'itemsAttachAiSubtitleTranslation',
        'itemsContent',
        'itemsIgnore',
        'itemsList',
        'itemsMarkSeen',
        'itemsSaveToLibrary',
        'report',
        'runsList',
        'sourcesCreate',
        'sourcesDelete',
        'sourcesList',
        'sourcesUpdate'
      ].sort()
    );
    for (const v of Object.values(IPC.feeds)) expect(v.startsWith('feeds:')).toBe(true);
  });

  it('resources namespace declares Phase 6.5 workstation channels', () => {
    const keys = Object.keys(IPC.resources).sort();
    expect(keys).toEqual(
      [
        'archive',
        'create',
        'createFromSuggestion',
        'engage',
        'event',
        'get',
        'linkRef',
        'list',
        'promoteRef',
        'suggestFromNotes',
        'unlinkRef',
        'update'
      ].sort()
    );
    for (const v of Object.values(IPC.resources)) expect(v.startsWith('resources:')).toBe(true);
  });

  it('area namespace declares Phase 6.6 dashboard + assignment channels', () => {
    const keys = Object.keys(IPC.area).sort();
    expect(keys).toEqual(
      [
        'archive',
        'assign',
        'create',
        'dashboard',
        'event',
        'get',
        'getConfig',
        'list',
        'setConfig',
        'suggestAssignments',
        'unassign',
        'update'
      ].sort()
    );
    for (const v of Object.values(IPC.area)) expect(v.startsWith('area:')).toBe(true);
  });

  it('semantic namespace declares Phase 7 search channels', () => {
    const keys = Object.keys(IPC.semantic).sort();
    expect(keys).toEqual(
      ['search', 'getDocument', 'indexStatus', 'rebuildIndex', 'searchAndAnswer', 'event'].sort()
    );
    for (const v of Object.values(IPC.semantic)) expect(v.startsWith('semantic:')).toBe(true);
  });

  it('memory namespace declares Phase 7 memory channels', () => {
    const keys = Object.keys(IPC.memory).sort();
    expect(keys).toEqual(
      [
        'archive',
        'clusters',
        'create',
        'event',
        'feedback',
        'generateDigest',
        'get',
        'graph',
        'list',
        'merge',
        'promoteToProject',
        'promoteToResource',
        'recall',
        'recallStats',
        'update'
      ].sort()
    );
    for (const v of Object.values(IPC.memory)) expect(v.startsWith('memory:')).toBe(true);
  });

  it('evidence namespace declares PMIL evidence drill-down channels', () => {
    const keys = Object.keys(IPC.evidence).sort();
    expect(keys).toEqual(['get', 'list', 'read', 'sync'].sort());
    for (const v of Object.values(IPC.evidence)) expect(v.startsWith('evidence:')).toBe(true);
  });

  it('review namespace declares Phase 7 review-system channels while preserving daily journal channels', () => {
    const keys = Object.keys(IPC.review).sort();
    expect(keys).toEqual(
      [
        'acknowledge',
        'archiveRun',
        'executeAction',
        'generate',
        'get',
        'getRun',
        'list',
        'listRuns',
        'triggerReview'
      ].sort()
    );
    for (const v of Object.values(IPC.review)) expect(v.startsWith('review:')).toBe(true);
  });

  it('vision namespace declares structured goal channels while preserving Vision.md channels', () => {
    const keys = Object.keys(IPC.vision).sort();
    expect(keys).toEqual(
      [
        'completeMilestone',
        'createGoal',
        'detectDrift',
        'get',
        'getAlignment',
        'getGoal',
        'listGoals',
        'triggerReview',
        'update',
        'updateGoal'
      ].sort()
    );
    for (const v of Object.values(IPC.vision)) expect(v.startsWith('vision:')).toBe(true);
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
      autoRunner: { ...DEFAULT_AUTO_RUNNER_SETTINGS },
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
          workdirPath: '/tmp/project-1',
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
