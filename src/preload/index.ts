import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type ArchiveProjectResultDTO,
  type DispatchEventDTO,
  type AreaConfigDTO,
  type CloseProjectResult,
  type CreateAreaArgsDTO,
  type CreateGitHubPullRequestArgsDTO,
  type CreateProjectArgsDTO,
  type CreateProjectResultDTO,
  type CreateTaskArgsDTO,
  type CreateTaskResultDTO,
  type DailyReviewDTO,
  type DistillResult,
  type DistillSuggestHit,
  type ExternalNotesPathInfoDTO,
  type EntityFilter,
  type GitHubRepositoryListArgsDTO,
  type GitHubTaskIssueBindingArgsDTO,
  type ImportNotesResultDTO,
  type ImportGitHubRepositoryArgsDTO,
  type ImportGitHubRepositoryResultDTO,
  type JournalListItemDTO,
  type OrbitApi,
  type OrphanRescueCandidate,
  type PublishProjectToGitHubArgsDTO,
  type ProjectSummaryDTO,
  type RoleEventDTO,
  type SearchOpts,
  type TemplateMetaDTO,
  type TerminalAgentSessionDetailDTO,
  type TerminalAgentEventDTO,
  type TerminalAgentSessionDTO,
  type TerminalDataEventDTO,
  type TerminalExitEventDTO,
  type TerminalOpenArgsDTO,
  type TerminalSessionInfoDTO,
  type RuntimeEventDTO,
  type V3MigrationReport,
  type VaultExtConfigDTO
} from '@shared/ipc';
import type { CommitSelectionArgs, StagePathsArgs } from '@shared/git';
import type { AutoRunnerStatusDTO } from '@shared/auto_runner';
import type {
  GitHubConnection,
  GitHubProjectDetails,
  GitHubProjectState,
  GitHubPullRequestSummary,
  GitHubTaskBinding,
  GitHubWorkspaceRepository
} from '@shared/github';
import type { FsEvent, ProjectFileNode, Theme } from '@shared/types';
import type { ActivityEvent, ActivityQueryFilter } from '@shared/activity';
import type {
  DashboardAgentStats,
  DashboardKnowledgeStats,
  DashboardPendingStats,
  DashboardSummary,
  DashboardSystemHealth,
  DashboardThinkingStats
} from '@shared/dashboard';
import type { TraceableEvent, TraceableEventFilter } from '@shared/events';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import type {
  Proposal,
  ProposalListFilter,
  ProposalResolveInput,
  ProposalSubmitInput,
  ProposalSyncSnapshot
} from '@shared/approval';
import type {
  InboxCaptureInput,
  InboxDismissInput,
  InboxEvent,
  InboxItem,
  InboxListFilter,
  InboxListResult,
  InboxMessageInput,
  InboxResolveInput
} from '@shared/inbox';
import type {
  AddFeedSubscriptionInput,
  CreateThoughtInput,
  LibraryReadingUpdateInput,
  LinkThoughtInput,
  PromoteLibraryArticleInput,
  PromoteThoughtInput,
  SaveFeedItemInput,
  SaveLibraryArticleInput,
  UpdateThoughtInput
} from '@shared/capture';
import type { EntitySummary, TaskFilter, TaskRecord, TaskStatus } from '@shared/schemas';
import type {
  ConversationTurn,
  DispatchSnapshot,
  ImplementationReport,
  PlanProposal,
  PlanPublishResult,
  PlannerAgentId,
  PlannerChatMessage,
  PlannerChatReply,
  PlannerProposalReply,
  ProjectRoleBinding,
  TaskConversation,
  RoleTemplate,
  RoleTemplateVersion,
  RuntimeDescriptor,
  RuntimeRegistrySnapshot
} from '@shared/orchestration';
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
    },
    listProjectTree: (root: string): Promise<ProjectFileNode> =>
      ipcRenderer.invoke(IPC.fs.listProjectTree, root),
    createDirectory: (parent: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.fs.createDirectory, parent, name)
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
      ipcRenderer.invoke(IPC.project.listTemplates)
  },
  runtime: {
    list: (): Promise<RuntimeDescriptor[]> => ipcRenderer.invoke(IPC.runtime.list),
    refresh: (): Promise<RuntimeRegistrySnapshot> => ipcRenderer.invoke(IPC.runtime.refresh),
    get: (runtimeId: string): Promise<RuntimeDescriptor | null> =>
      ipcRenderer.invoke(IPC.runtime.get, runtimeId),
    onEvent: (cb: (ev: RuntimeEventDTO) => void) => {
      const listener = (_: unknown, ev: RuntimeEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.runtime.event, listener);
      return () => ipcRenderer.removeListener(IPC.runtime.event, listener);
    }
  },
  dashboard: {
    summary: (): Promise<DashboardSummary> => ipcRenderer.invoke(IPC.dashboard.summary),
    pendingStats: (): Promise<DashboardPendingStats> =>
      ipcRenderer.invoke(IPC.dashboard.pendingStats),
    agentStats: (): Promise<DashboardAgentStats> => ipcRenderer.invoke(IPC.dashboard.agentStats),
    knowledgeStats: (): Promise<DashboardKnowledgeStats> =>
      ipcRenderer.invoke(IPC.dashboard.knowledgeStats),
    thinkingStats: (): Promise<DashboardThinkingStats> =>
      ipcRenderer.invoke(IPC.dashboard.thinkingStats),
    systemHealth: (): Promise<DashboardSystemHealth> =>
      ipcRenderer.invoke(IPC.dashboard.systemHealth)
  },
  planner: {
    listProposals: (projectUid: string): Promise<PlanProposal[]> =>
      ipcRenderer.invoke(IPC.planner.listProposals, projectUid),
    getProposal: (projectUid: string, proposalId: string): Promise<PlanProposal | null> =>
      ipcRenderer.invoke(IPC.planner.getProposal, projectUid, proposalId),
    saveProposal: (proposal: PlanProposal): Promise<PlanProposal> =>
      ipcRenderer.invoke(IPC.planner.saveProposal, proposal),
    publishProposal: (projectUid: string, proposalId: string): Promise<PlanPublishResult> =>
      ipcRenderer.invoke(IPC.planner.publishProposal, projectUid, proposalId),
    chat: (
      projectUid: string,
      agentId: PlannerAgentId,
      messages: PlannerChatMessage[]
    ): Promise<PlannerChatReply> => ipcRenderer.invoke(IPC.planner.chat, projectUid, agentId, messages),
    generateProposal: (
      projectUid: string,
      agentId: PlannerAgentId,
      messages: PlannerChatMessage[]
    ): Promise<PlannerProposalReply> =>
      ipcRenderer.invoke(IPC.planner.generateProposal, projectUid, agentId, messages)
  },
  conversation: {
    get: (taskId: string): Promise<TaskConversation | null> =>
      ipcRenderer.invoke(IPC.conversation.get, taskId),
    send: (
      taskId: string,
      message: string
    ): Promise<{ turnId: string; runId: string; segmentId: string }> =>
      ipcRenderer.invoke(IPC.conversation.send, taskId, message),
    switchRuntime: (
      taskUid: string,
      runtimeId: string
    ): Promise<{ runId: string; segmentId?: string }> =>
      ipcRenderer.invoke(IPC.conversation.switchRuntime, taskUid, runtimeId),
    onEvent: (cb: (ev: { taskId: string; turn: ConversationTurn }) => void) => {
      const listener = (_: unknown, ev: { taskId: string; turn: ConversationTurn }): void => cb(ev);
      ipcRenderer.on(IPC.conversation.event, listener);
      return () => ipcRenderer.removeListener(IPC.conversation.event, listener);
    }
  },
  dispatch: {
    status: (projectUid?: string): Promise<DispatchSnapshot> =>
      ipcRenderer.invoke(IPC.dispatch.status, projectUid),
    releaseTask: (taskId: string, reason?: string) =>
      ipcRenderer.invoke(IPC.dispatch.releaseTask, taskId, reason),
    retryTask: (taskId: string) => ipcRenderer.invoke(IPC.dispatch.retryTask, taskId),
    onEvent: (cb: (ev: DispatchEventDTO) => void) => {
      const listener = (_: unknown, ev: DispatchEventDTO): void => cb(ev);
      ipcRenderer.on(IPC.dispatch.event, listener);
      return () => ipcRenderer.removeListener(IPC.dispatch.event, listener);
    }
  },
  role: {
    listTemplates: (): Promise<RoleTemplate[]> => ipcRenderer.invoke(IPC.role.listTemplates),
    listTemplateVersions: (templateId: string): Promise<RoleTemplateVersion[]> =>
      ipcRenderer.invoke(IPC.role.listTemplateVersions, templateId),
    listBindings: (projectUid: string): Promise<ProjectRoleBinding[]> =>
      ipcRenderer.invoke(IPC.role.listBindings, projectUid),
    createBinding: (projectUid: string, binding: ProjectRoleBinding): Promise<ProjectRoleBinding> =>
      ipcRenderer.invoke(IPC.role.createBinding, projectUid, binding),
    updateBinding: (
      projectUid: string,
      bindingId: string,
      patch: Partial<ProjectRoleBinding>
    ): Promise<ProjectRoleBinding> =>
      ipcRenderer.invoke(IPC.role.updateBinding, projectUid, bindingId, patch),
    getBindingTasks: (projectUid: string, bindingId: string): Promise<TaskRecord[]> =>
      ipcRenderer.invoke(IPC.role.getBindingTasks, projectUid, bindingId),
    getBindingReports: (
      projectUid: string,
      bindingId: string
    ): Promise<ImplementationReport[]> =>
      ipcRenderer.invoke(IPC.role.getBindingReports, projectUid, bindingId)
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
      ipcRenderer.invoke(IPC.git.mergeGhost, id, opts),
    getChanges: (args: { cwd: string }) => ipcRenderer.invoke(IPC.git.getChanges, args),
    getWorkingTreeDiff: (args: { cwd: string; pathspec?: string[] }) =>
      ipcRenderer.invoke(IPC.git.getWorkingTreeDiff, args),
    stagePaths: (args: StagePathsArgs) => ipcRenderer.invoke(IPC.git.stagePaths, args),
    unstagePaths: (args: StagePathsArgs) => ipcRenderer.invoke(IPC.git.unstagePaths, args),
    discardPaths: (args: StagePathsArgs) => ipcRenderer.invoke(IPC.git.discardPaths, args),
    commitSelection: (args: CommitSelectionArgs) =>
      ipcRenderer.invoke(IPC.git.commitSelection, args)
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
    sendMessage: (runId: string, message: string) =>
      ipcRenderer.invoke(IPC.agent.sendMessage, runId, message),
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
  chat: {
    onRuntimeEvent: (cb: (ev: RuntimeEvent) => void) => {
      const listener = (_: unknown, ev: RuntimeEvent): void => cb(ev);
      ipcRenderer.on(IPC.chat.runtimeEvent, listener);
      return () => ipcRenderer.removeListener(IPC.chat.runtimeEvent, listener);
    },
    sendAction: (action: ChatAction): Promise<void> =>
      ipcRenderer.invoke(IPC.chat.action, action)
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
  activity: {
    query: (filter?: ActivityQueryFilter): Promise<ActivityEvent[]> =>
      ipcRenderer.invoke(IPC.activity.query, filter)
  },
  events: {
    query: (filter?: TraceableEventFilter) => ipcRenderer.invoke(IPC.events.query, filter),
    gc: (maxFiles?: number) => ipcRenderer.invoke(IPC.events.gc, maxFiles),
    onEvent: (cb: (event: TraceableEvent) => void) => {
      const listener = (_: unknown, event: TraceableEvent): void => cb(event);
      ipcRenderer.on(IPC.events.event, listener);
      return () => ipcRenderer.removeListener(IPC.events.event, listener);
    }
  },
  approval: {
    submit: (input: ProposalSubmitInput): Promise<Proposal> =>
      ipcRenderer.invoke(IPC.approval.submit, input),
    resolve: (
      id: string,
      input: ProposalResolveInput
    ): Promise<{ proposal: Proposal; sync: ProposalSyncSnapshot }> =>
      ipcRenderer.invoke(IPC.approval.resolve, id, input),
    list: (filter?: ProposalListFilter): Promise<Proposal[]> =>
      ipcRenderer.invoke(IPC.approval.list, filter),
    get: (id: string): Promise<Proposal | null> =>
      ipcRenderer.invoke(IPC.approval.get, id),
    onEvent: (cb: (event: {
      type: string;
      proposal: Proposal;
      snapshot: ProposalSyncSnapshot;
    }) => void) => {
      const listener = (_: unknown, event: {
        type: string;
        proposal: Proposal;
        snapshot: ProposalSyncSnapshot;
      }): void => cb(event);
      ipcRenderer.on(IPC.approval.event, listener);
      return () => ipcRenderer.removeListener(IPC.approval.event, listener);
    }
  },
  inbox: {
    emitMessage: (input: InboxMessageInput): Promise<InboxItem> =>
      ipcRenderer.invoke(IPC.inbox.emitMessage, input),
    emitCapture: (input: InboxCaptureInput): Promise<InboxItem> =>
      ipcRenderer.invoke(IPC.inbox.emitCapture, input),
    list: (filter?: InboxListFilter): Promise<InboxListResult> =>
      ipcRenderer.invoke(IPC.inbox.list, filter),
    get: (id: string): Promise<InboxItem | null> => ipcRenderer.invoke(IPC.inbox.get, id),
    resolve: (
      id: string,
      input?: InboxResolveInput
    ): Promise<{ item: InboxItem; proposal?: Proposal | null }> =>
      ipcRenderer.invoke(IPC.inbox.resolve, id, input),
    dismiss: (
      id: string,
      input?: InboxDismissInput
    ): Promise<{ item: InboxItem; proposal?: Proposal | null }> =>
      ipcRenderer.invoke(IPC.inbox.dismiss, id, input),
    archive: (id: string): Promise<InboxItem> => ipcRenderer.invoke(IPC.inbox.archive, id),
    onEvent: (cb: (event: InboxEvent) => void) => {
      const listener = (_: unknown, event: InboxEvent): void => cb(event);
      ipcRenderer.on(IPC.inbox.event, listener);
      return () => ipcRenderer.removeListener(IPC.inbox.event, listener);
    }
  },
  capture: {
    feed: {
      listSubscriptions: () => ipcRenderer.invoke(IPC.capture.feed.listSubscriptions),
      addSubscription: (input: AddFeedSubscriptionInput) =>
        ipcRenderer.invoke(IPC.capture.feed.addSubscription, input),
      removeSubscription: (id: string) => ipcRenderer.invoke(IPC.capture.feed.removeSubscription, id),
      refresh: (subscriptionId?: string) => ipcRenderer.invoke(IPC.capture.feed.refresh, subscriptionId),
      listPending: () => ipcRenderer.invoke(IPC.capture.feed.listPending),
      fadeOut: (id: string) => ipcRenderer.invoke(IPC.capture.feed.fadeOut, id),
      saveToLibrary: (id: string, input?: SaveFeedItemInput) =>
        ipcRenderer.invoke(IPC.capture.feed.saveToLibrary, id, input),
      history: () => ipcRenderer.invoke(IPC.capture.feed.history)
    },
    library: {
      save: (input: SaveLibraryArticleInput) => ipcRenderer.invoke(IPC.capture.library.save, input),
      list: (status?: InboxItem['status']) => ipcRenderer.invoke(IPC.capture.library.list, status),
      get: (id: string) => ipcRenderer.invoke(IPC.capture.library.get, id),
      readContent: (id: string) => ipcRenderer.invoke(IPC.capture.library.readContent, id),
      updateReading: (id: string, input: LibraryReadingUpdateInput) =>
        ipcRenderer.invoke(IPC.capture.library.updateReading, id, input),
      promote: (id: string, input?: PromoteLibraryArticleInput) =>
        ipcRenderer.invoke(IPC.capture.library.promote, id, input),
      dismiss: (id: string, actor?: 'user' | 'agent') =>
        ipcRenderer.invoke(IPC.capture.library.dismiss, id, actor)
    },
    thought: {
      create: (input: CreateThoughtInput) => ipcRenderer.invoke(IPC.capture.thought.create, input),
      list: () => ipcRenderer.invoke(IPC.capture.thought.list),
      get: (id: string) => ipcRenderer.invoke(IPC.capture.thought.get, id),
      update: (id: string, input: UpdateThoughtInput) =>
        ipcRenderer.invoke(IPC.capture.thought.update, id, input),
      promote: (id: string, input?: PromoteThoughtInput) =>
        ipcRenderer.invoke(IPC.capture.thought.promote, id, input),
      link: (id: string, input: LinkThoughtInput) =>
        ipcRenderer.invoke(IPC.capture.thought.link, id, input),
      dismiss: (id: string, actor?: 'user' | 'agent') =>
        ipcRenderer.invoke(IPC.capture.thought.dismiss, id, actor)
    }
  },
  quickCapture: {
    onOpen: (cb: () => void) => {
      const listener = (): void => cb();
      ipcRenderer.on(IPC.quickCapture.open, listener);
      return () => ipcRenderer.removeListener(IPC.quickCapture.open, listener);
    }
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
  autoRunner: {
    status: (): Promise<AutoRunnerStatusDTO> => ipcRenderer.invoke(IPC.autoRunner.status),
    start: (): Promise<AutoRunnerStatusDTO> => ipcRenderer.invoke(IPC.autoRunner.start),
    stop: (): Promise<AutoRunnerStatusDTO> => ipcRenderer.invoke(IPC.autoRunner.stop),
    onEvent: (cb: (ev: { type: string; event: unknown }) => void) => {
      const listener = (_: unknown, ev: { type: string; event: unknown }): void => cb(ev);
      ipcRenderer.on(IPC.autoRunner.event, listener);
      return () => ipcRenderer.removeListener(IPC.autoRunner.event, listener);
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
  },
  area: {
    list: () => ipcRenderer.invoke(IPC.area.list),
    create: (args: CreateAreaArgsDTO) => ipcRenderer.invoke(IPC.area.create, args),
    getConfig: (areaPath: string) => ipcRenderer.invoke(IPC.area.getConfig, areaPath),
    setConfig: (areaPath: string, patch: Partial<AreaConfigDTO>) =>
      ipcRenderer.invoke(IPC.area.setConfig, areaPath, patch)
  },
  vaultConfig: {
    get: () => ipcRenderer.invoke(IPC.vaultConfig.get),
    update: (patch: Partial<VaultExtConfigDTO>) => ipcRenderer.invoke(IPC.vaultConfig.update, patch),
    inspect: (): Promise<ExternalNotesPathInfoDTO[]> => ipcRenderer.invoke(IPC.vaultConfig.inspect),
    linkDirectory: (): Promise<VaultExtConfigDTO | null> =>
      ipcRenderer.invoke(IPC.vaultConfig.linkDirectory),
    unlinkDirectory: (dirPath: string): Promise<VaultExtConfigDTO> =>
      ipcRenderer.invoke(IPC.vaultConfig.unlinkDirectory, dirPath),
    importDirectory: (): Promise<ImportNotesResultDTO | null> =>
      ipcRenderer.invoke(IPC.vaultConfig.importDirectory)
  }
};

contextBridge.exposeInMainWorld('orbit', api);
