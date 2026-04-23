import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type ArchiveProjectResultDTO,
  type CloseProjectResult,
  type CreateGitHubPullRequestArgsDTO,
  type CreateProjectArgsDTO,
  type CreateProjectResultDTO,
  type CreateTaskArgsDTO,
  type CreateTaskResultDTO,
  type DailyReviewDTO,
  type DistillResult,
  type DistillSuggestHit,
  type EnsureMcpConfigResultDTO,
  type EntityFilter,
  type GitHubRepositoryListArgsDTO,
  type GitHubTaskIssueBindingArgsDTO,
  type ImportGitHubRepositoryArgsDTO,
  type ImportGitHubRepositoryResultDTO,
  type JournalListItemDTO,
  type NightShiftDoneEventDTO,
  type NightShiftPlanDTO,
  type NightShiftProgressEventDTO,
  type NightShiftRunDTO,
  type OrbitApi,
  type OrphanRescueCandidate,
  type PublishProjectToGitHubArgsDTO,
  type ProjectSummaryDTO,
  type SearchOpts,
  type TemplateMetaDTO,
  type TerminalAgentSessionDetailDTO,
  type TerminalAgentEventDTO,
  type TerminalAgentSessionDTO,
    type TerminalDataEventDTO,
  type TerminalExitEventDTO,
  type TerminalOpenArgsDTO,
  type TerminalSessionInfoDTO,
  type V3MigrationReport
} from '@shared/ipc';
import type {
  GitHubConnection,
  GitHubProjectDetails,
  GitHubProjectState,
  GitHubPullRequestSummary,
  GitHubTaskBinding,
  GitHubWorkspaceRepository
} from '@shared/github';
import type { FsEvent, Theme } from '@shared/types';
import type { EntitySummary, TaskFilter, TaskRecord, TaskStatus } from '@shared/schemas';
import type {
  AgentEvent,
  StartTaskArgs,
  TailQuery
} from '@shared/agent';
import type { BudgetSettings } from '@shared/schemas';

const api: OrbitApi = {
  workspace: {
    pickAndOpen: () => ipcRenderer.invoke(IPC.workspace.pickAndOpen),
    createNew: () => ipcRenderer.invoke(IPC.workspace.createNew),
    openPath: (p: string) => ipcRenderer.invoke(IPC.workspace.openPath, p),
    current: () => ipcRenderer.invoke(IPC.workspace.current),
    close: () => ipcRenderer.invoke(IPC.workspace.close),
    crashLogPath: () => ipcRenderer.invoke(IPC.workspace.crashLogPath),
    reportCrash: (rec) => ipcRenderer.invoke(IPC.workspace.reportCrash, rec),
    revealUserData: () => ipcRenderer.invoke(IPC.workspace.revealUserData),
    revealVaultOrbit: () => ipcRenderer.invoke(IPC.workspace.revealVaultOrbit),
    diagnostics: () => ipcRenderer.invoke(IPC.workspace.diagnostics)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    setTheme: (t: Theme) => ipcRenderer.invoke(IPC.settings.setTheme, t),
    update: (partial) => ipcRenderer.invoke(IPC.settings.update, partial),
    detectClaude: () => ipcRenderer.invoke(IPC.settings.detectClaude)
  },
  fs: {
    listTree: (vault: string) => ipcRenderer.invoke(IPC.fs.listTree, vault),
    exists: (p: string): Promise<boolean> => ipcRenderer.invoke(IPC.fs.exists, p),
    readFile: (p: string) => ipcRenderer.invoke(IPC.fs.readFile, p),
    writeFile: (p: string, c: string) => ipcRenderer.invoke(IPC.fs.writeFile, p, c),
    createFile: (dir: string, name: string, content?: string) =>
      ipcRenderer.invoke(IPC.fs.createFile, dir, name, content),
    rename: (o: string, n: string) => ipcRenderer.invoke(IPC.fs.rename, o, n),
    deleteFile: (p: string) => ipcRenderer.invoke(IPC.fs.deleteFile, p),
    resolveUid: (uid: string) => ipcRenderer.invoke(IPC.fs.resolveUid, uid),
    uidOf: (rel: string) => ipcRenderer.invoke(IPC.fs.uidOf, rel),
    search: (q: string, opts?: SearchOpts) => ipcRenderer.invoke(IPC.fs.search, q, opts),
    backlinksOf: (p: string) => ipcRenderer.invoke(IPC.fs.backlinksOf, p),
    findByContentHash: (h: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.fs.findByContentHash, h),
    rescueOrphan: (p: string): Promise<OrphanRescueCandidate[]> =>
      ipcRenderer.invoke(IPC.fs.rescueOrphan, p),
    onEvent: (cb: (ev: FsEvent) => void) => {
      const listener = (_: unknown, ev: FsEvent): void => cb(ev);
      ipcRenderer.on(IPC.fs.event, listener);
      return () => ipcRenderer.removeListener(IPC.fs.event, listener);
    }
  },
  para: {
    listEntities: (filter?: EntityFilter): Promise<EntitySummary[]> =>
      ipcRenderer.invoke(IPC.para.listEntities, filter),
    listTasks: (filter?: TaskFilter): Promise<TaskRecord[]> =>
      ipcRenderer.invoke(IPC.para.listTasks, filter),
    updateTaskStatus: (id: string, status: TaskStatus): Promise<TaskRecord | null> =>
      ipcRenderer.invoke(IPC.para.updateTaskStatus, id, status),
    closeProject: (p: string): Promise<CloseProjectResult> =>
      ipcRenderer.invoke(IPC.para.closeProject, p)
  },
  project: {
    create: (args: CreateProjectArgsDTO): Promise<CreateProjectResultDTO> =>
      ipcRenderer.invoke(IPC.project.create, args),
    list: (): Promise<ProjectSummaryDTO[]> => ipcRenderer.invoke(IPC.project.list),
    archive: (uid: string): Promise<ArchiveProjectResultDTO> =>
      ipcRenderer.invoke(IPC.project.archive, uid),
    getTasks: (uid: string): Promise<TaskRecord[]> =>
      ipcRenderer.invoke(IPC.project.getTasks, uid),
    listTemplates: (): Promise<TemplateMetaDTO[]> =>
      ipcRenderer.invoke(IPC.project.listTemplates),
    ensureMcpConfig: (uid: string): Promise<EnsureMcpConfigResultDTO> =>
      ipcRenderer.invoke(IPC.project.ensureMcpConfig, uid)
  },
  task: {
    create: (args: CreateTaskArgsDTO): Promise<CreateTaskResultDTO> =>
      ipcRenderer.invoke(IPC.task.create, args),
    get: (absPath: string) => ipcRenderer.invoke(IPC.task.get, absPath),
    updateFrontmatter: (
      absPath: string,
      patch: Record<string, unknown>
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.task.updateFrontmatter, absPath, patch),
    updateSection: (
      absPath: string,
      section: 'description' | 'thinking' | 'executionLog' | 'summary',
      content: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.task.updateSection, absPath, section, content),
    appendExecutionLog: (absPath: string, line: string): Promise<void> =>
      ipcRenderer.invoke(IPC.task.appendExecutionLog, absPath, line),
    relink: (absPath: string, newProjectUid: string) =>
      ipcRenderer.invoke(IPC.task.relink, absPath, newProjectUid)
  },
  migrations: {
    runV3: (opts?: { dryRun?: boolean }): Promise<V3MigrationReport> =>
      ipcRenderer.invoke(IPC.migrations.runV3, opts)
  },
  vision: {
    get: () => ipcRenderer.invoke(IPC.vision.get),
    update: (raw: string) => ipcRenderer.invoke(IPC.vision.update, raw)
  },
  git: {
    status: (opts?: { cwd?: string }) => ipcRenderer.invoke(IPC.git.status, opts),
    commit: (m: string) => ipcRenderer.invoke(IPC.git.commit, m),
    createWorktree: (opts?: { taskId?: string }) =>
      ipcRenderer.invoke(IPC.git.createWorktree, opts),
    listWorktrees: () => ipcRenderer.invoke(IPC.git.listWorktrees),
    getDiff: (args: { worktreeId: string; base?: string }) =>
      ipcRenderer.invoke(IPC.git.getDiff, args),
    removeWorktree: (id: string, opts?: { force?: boolean }) =>
      ipcRenderer.invoke(IPC.git.removeWorktree, id, opts),
    resetAll: () => ipcRenderer.invoke(IPC.git.resetAll),
    ghostCommit: (args: { worktreeId: string; message: string; author?: string }) =>
      ipcRenderer.invoke(IPC.git.ghostCommit, args),
    preMergeCheck: (id: string) => ipcRenderer.invoke(IPC.git.preMergeCheck, id),
    mergeGhost: (id: string, opts: { strategy: 'fast-forward' | 'squash' }) =>
      ipcRenderer.invoke(IPC.git.mergeGhost, id, opts)
  },
  env: {
    status: () => ipcRenderer.invoke(IPC.env.status),
    onEvent: (cb: (s: { queued: number; active: string | null }) => void) => {
      const listener = (_: unknown, s: { queued: number; active: string | null }): void =>
        cb(s);
      ipcRenderer.on(IPC.env.event, listener);
      return () => ipcRenderer.removeListener(IPC.env.event, listener);
    }
  },
  agent: {
    detect: () => ipcRenderer.invoke(IPC.agent.detect),
    startTask: (args: StartTaskArgs) => ipcRenderer.invoke(IPC.agent.startTask, args),
    stop: (id: string) => ipcRenderer.invoke(IPC.agent.stop, id),
    list: () => ipcRenderer.invoke(IPC.agent.list),
    tail: (id: string, q?: TailQuery) => ipcRenderer.invoke(IPC.agent.tail, id, q),
    reattach: (id: string, sinceIdx?: number) =>
      ipcRenderer.invoke(IPC.agent.reattach, id, sinceIdx),
    costToday: () => ipcRenderer.invoke(IPC.agent.costToday),
    costRun: (id: string) => ipcRenderer.invoke(IPC.agent.costRun, id),
    costDailyReport: (args?: { date?: string }) =>
      ipcRenderer.invoke(IPC.agent.costDailyReport, args),
    budgetGet: () => ipcRenderer.invoke(IPC.agent.budgetGet),
    budgetUpdate: (partial: Partial<BudgetSettings>) =>
      ipcRenderer.invoke(IPC.agent.budgetUpdate, partial),
    onEvent: (cb: (e: { runId: string; event: AgentEvent }) => void) => {
      const listener = (_: unknown, ev: { runId: string; event: AgentEvent }): void => cb(ev);
      ipcRenderer.on(IPC.agent.event, listener);
      return () => ipcRenderer.removeListener(IPC.agent.event, listener);
    },
    installInWorktree: (args: {
      worktreeId: string;
      manager: 'npm' | 'pnpm' | 'yarn';
      args?: string[];
    }) => ipcRenderer.invoke(IPC.agent.installInWorktree, args)
  },
  distill: {
    project: (uid: string): Promise<DistillResult> =>
      ipcRenderer.invoke(IPC.distill.project, uid),
    cancel: (runId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.distill.cancel, runId),
    suggest: (taskId: string): Promise<DistillSuggestHit[]> =>
      ipcRenderer.invoke(IPC.distill.suggest, taskId),
    reindex: (): Promise<{ count: number }> => ipcRenderer.invoke(IPC.distill.reindex),
    experienceFor: (runId: string): Promise<DistillSuggestHit[]> =>
      ipcRenderer.invoke(IPC.distill.experienceFor, runId)
  },
  terminal: {
    open: (args: TerminalOpenArgsDTO): Promise<TerminalSessionInfoDTO> =>
      ipcRenderer.invoke(IPC.terminal.open, args),
    write: (id: string, data: string): Promise<void> =>
      ipcRenderer.invoke(IPC.terminal.write, id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(IPC.terminal.resize, id, cols, rows),
    kill: (id: string): Promise<void> => ipcRenderer.invoke(IPC.terminal.kill, id),
    list: (): Promise<TerminalSessionInfoDTO[]> => ipcRenderer.invoke(IPC.terminal.list),
    onData: (cb: (ev: TerminalDataEventDTO) => void) => {
      const listener = (_: unknown, ev: TerminalDataEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.terminal.data, listener);
      return () => ipcRenderer.removeListener(IPC.terminal.data, listener);
    },
    onExit: (cb: (ev: TerminalExitEventDTO) => void) => {
      const listener = (_: unknown, ev: TerminalExitEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.terminal.exit, listener);
      return () => ipcRenderer.removeListener(IPC.terminal.exit, listener);
    }
  },
  terminalAgent: {
    list: (projectUid: string): Promise<TerminalAgentSessionDTO[]> =>
      ipcRenderer.invoke(IPC.terminalAgent.list, projectUid),
    detail: (projectUid: string, sessionId: string): Promise<TerminalAgentSessionDetailDTO | null> =>
      ipcRenderer.invoke(IPC.terminalAgent.detail, projectUid, sessionId),
    onEvent: (cb: (ev: TerminalAgentEventDTO) => void) => {
      const listener = (_: unknown, ev: TerminalAgentEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.terminalAgent.event, listener);
      return () => ipcRenderer.removeListener(IPC.terminalAgent.event, listener);
    }
  },
  review: {
    generate: (date?: string): Promise<DailyReviewDTO> =>
      ipcRenderer.invoke(IPC.review.generate, date),
    get: (date?: string): Promise<DailyReviewDTO | null> =>
      ipcRenderer.invoke(IPC.review.get, date),
    list: (): Promise<JournalListItemDTO[]> => ipcRenderer.invoke(IPC.review.list)
  },
  nightShift: {
    start: (plan: NightShiftPlanDTO): Promise<{ runId: string }> =>
      ipcRenderer.invoke(IPC.nightShift.start, plan),
    cancel: (runId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.nightShift.cancel, runId),
    status: (runId: string): Promise<NightShiftRunDTO | null> =>
      ipcRenderer.invoke(IPC.nightShift.status, runId),
    list: (): Promise<NightShiftRunDTO[]> => ipcRenderer.invoke(IPC.nightShift.list),
    onProgress: (cb: (ev: NightShiftProgressEventDTO) => void) => {
      const listener = (_: unknown, ev: NightShiftProgressEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.nightShift.progress, listener);
      return () => ipcRenderer.removeListener(IPC.nightShift.progress, listener);
    },
    onDone: (cb: (ev: NightShiftDoneEventDTO) => void) => {
      const listener = (_: unknown, ev: NightShiftDoneEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.nightShift.done, listener);
      return () => ipcRenderer.removeListener(IPC.nightShift.done, listener);
    }
  },
  envExt: {
    hasGhCli: (): Promise<boolean> => ipcRenderer.invoke(IPC.envExt.hasGhCli)
  },
  github: {
    getConnection: (): Promise<GitHubConnection> => ipcRenderer.invoke(IPC.github.getConnection),
    authenticate: (): Promise<GitHubConnection> => ipcRenderer.invoke(IPC.github.authenticate),
    listRepositories: (args?: GitHubRepositoryListArgsDTO): Promise<GitHubWorkspaceRepository[]> =>
      ipcRenderer.invoke(IPC.github.listRepositories, args),
    getProjectState: (projectUid: string): Promise<GitHubProjectState> =>
      ipcRenderer.invoke(IPC.github.getProjectState, projectUid),
    getProjectDetails: (projectUid: string): Promise<GitHubProjectDetails> =>
      ipcRenderer.invoke(IPC.github.getProjectDetails, projectUid),
    publishProject: (args: PublishProjectToGitHubArgsDTO): Promise<GitHubProjectState> =>
      ipcRenderer.invoke(IPC.github.publishProject, args),
    importRepository: (
      args: ImportGitHubRepositoryArgsDTO
    ): Promise<ImportGitHubRepositoryResultDTO> =>
      ipcRenderer.invoke(IPC.github.importRepository, args),
    createPullRequest: (
      args: CreateGitHubPullRequestArgsDTO
    ): Promise<GitHubPullRequestSummary> =>
      ipcRenderer.invoke(IPC.github.createPullRequest, args),
    bindTaskIssue: (args: GitHubTaskIssueBindingArgsDTO): Promise<GitHubTaskBinding> =>
      ipcRenderer.invoke(IPC.github.bindTaskIssue, args),
    unbindTaskIssue: (taskPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.github.unbindTaskIssue, taskPath)
  }
};

contextBridge.exposeInMainWorld('orbit', api);
