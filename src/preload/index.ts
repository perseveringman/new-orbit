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
  Conversation as ChatConversation,
  ConversationMeta as ChatConversationMeta,
  ConversationTurn as ChatConversationTurn
} from '@shared/conversation';
import type { ChatAppendTurnInput, ChatCreateConversationInput } from '@shared/ipc';
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
import type { CreateNoteInput, Note, NoteChangeEvent, NoteFilter, SearchOptions, UpdateNoteInput } from '@shared/note';
import type {
  AcceptLibraryDistillationInput,
  AddLibraryAnnotationInput,
  LibraryAcceptDistillationResult,
  LibraryDistillationResult,
  LibraryFilter,
  LibraryItem,
  LibraryReadingUpdateInputV2,
  SaveLibraryItemInput,
  UpdateLibraryItemInput
} from '@shared/library';
import type {
  CreateFeedSourceInput,
  FeedClusterPayload,
  FeedDigestPayload,
  FeedFetchResult,
  FeedItem,
  FeedItemFilter,
  FeedSource,
  FeedSynthesisResult,
  SaveFeedToLibraryInput,
  SaveFeedToLibraryResult,
  UpdateFeedSourceInput
} from '@shared/feed';
import type {
  ActivateKnowledgeBaseInput,
  ImportKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseSearchHit,
  OnboardingStatus,
  WelcomeAnalysisResult
} from '@shared/knowledge-base';
import type {
  CreateScheduledTaskInput,
  NaturalLanguageScheduleResult,
  ScheduledTask,
  ScheduledTaskExecution,
  ScheduledTaskFilter
} from '@shared/scheduled-task';
import type { DailySummary, DailyTimeline, MonthlyIndex, TimelineExportResult, TimelineScope, WeeklyTimeline, YearlyIndex } from '@shared/timeline';
import type { Artifact, ConversationStage } from '@shared/stage';
import type {
  ChannelConfig,
  ChannelInboundMessage,
  ChannelOutboundMessage,
  GatewayConfig,
  GatewayMessage,
  GatewayRouteResult,
  GatewayStatus
} from '@shared/gateway';
import type { ResourceChangeEvent } from '@shared/resource';
import type { SearchQuery, SemanticIndexStatus } from '@shared/semantic';
import type { CreateMemoryInput, MemoryFilter, RecallOptions, UpdateMemoryInput } from '@shared/memory';
import type { ReviewFilter, ReviewKind } from '@shared/review';
import type { CreateGoalInput, UpdateGoalInput, VisionHorizon } from '@shared/vision';
import type {
  AreaAssignmentInput,
  AreaAssignmentSuggestion,
  AreaChangeEvent,
  AreaDashboardData,
  AreaEntityRef,
  AreaUnassignmentInput
} from '@shared/area';
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
    },
    sdk: {
      snapshot: () => ipcRenderer.invoke(IPC.runtime.sdk.snapshot),
      upsertEndpoint: (input) => ipcRenderer.invoke(IPC.runtime.sdk.upsertEndpoint, input),
      deleteEndpoint: (endpointId) => ipcRenderer.invoke(IPC.runtime.sdk.deleteEndpoint, endpointId),
      setApiKey: (endpointId, apiKey) => ipcRenderer.invoke(IPC.runtime.sdk.setApiKey, endpointId, apiKey),
      deleteApiKey: (endpointId) => ipcRenderer.invoke(IPC.runtime.sdk.deleteApiKey, endpointId),
      setDefaults: (defaults) => ipcRenderer.invoke(IPC.runtime.sdk.setDefaults, defaults),
      testEndpoint: (endpointId, model, prompt) =>
        ipcRenderer.invoke(IPC.runtime.sdk.testEndpoint, endpointId, model, prompt),
      decide: (input) => ipcRenderer.invoke(IPC.runtime.sdk.decide, input)
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
    update: (raw: string) => ipcRenderer.invoke(IPC.vision.update, raw),
    listGoals: (horizon?: VisionHorizon) => ipcRenderer.invoke(IPC.vision.listGoals, horizon),
    getGoal: (id: string) => ipcRenderer.invoke(IPC.vision.getGoal, id),
    createGoal: (input: CreateGoalInput) => ipcRenderer.invoke(IPC.vision.createGoal, input),
    updateGoal: (id: string, patch: UpdateGoalInput) => ipcRenderer.invoke(IPC.vision.updateGoal, id, patch),
    completeMilestone: (id: string) => ipcRenderer.invoke(IPC.vision.completeMilestone, id),
    getAlignment: () => ipcRenderer.invoke(IPC.vision.getAlignment),
    detectDrift: () => ipcRenderer.invoke(IPC.vision.detectDrift),
    triggerReview: () => ipcRenderer.invoke(IPC.vision.triggerReview)
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
      ipcRenderer.invoke(IPC.chat.action, action),
    getConversation: (id: string): Promise<ChatConversation | null> =>
      ipcRenderer.invoke(IPC.chat.conversationGet, id),
    listConversations: (): Promise<ChatConversationMeta[]> =>
      ipcRenderer.invoke(IPC.chat.conversationList),
    createConversation: (input: ChatCreateConversationInput): Promise<ChatConversation> =>
      ipcRenderer.invoke(IPC.chat.conversationCreate, input),
    updateConversation: (id, patch) =>
      ipcRenderer.invoke(IPC.chat.conversationUpdate, id, patch),
    archiveConversation: (id) =>
      ipcRenderer.invoke(IPC.chat.conversationArchive, id),
    appendTurn: (input: ChatAppendTurnInput): Promise<ChatConversationTurn> =>
      ipcRenderer.invoke(IPC.chat.conversationAppendTurn, input),
    findConversationsByAnchor: (kind: string, refId: string): Promise<ChatConversationMeta[]> =>
      ipcRenderer.invoke(IPC.chat.conversationFindByAnchor, kind, refId),
    getLastActiveConversation: (scope) =>
      ipcRenderer.invoke(IPC.chat.conversationLastActive, scope),
    setLastActiveConversation: (scope, id) =>
      ipcRenderer.invoke(IPC.chat.conversationSetLastActive, scope, id)
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
  notes: {
    list: (filter?: NoteFilter): Promise<Note[]> => ipcRenderer.invoke(IPC.notes.list, filter),
    get: (noteId: string): Promise<Note | null> => ipcRenderer.invoke(IPC.notes.get, noteId),
    getByPath: (notePath: string): Promise<Note | null> =>
      ipcRenderer.invoke(IPC.notes.getByPath, notePath),
    create: (input: CreateNoteInput): Promise<Note> => ipcRenderer.invoke(IPC.notes.create, input),
    update: (noteId: string, patch: UpdateNoteInput): Promise<Note> =>
      ipcRenderer.invoke(IPC.notes.update, noteId, patch),
    delete: (noteId: string): Promise<void> => ipcRenderer.invoke(IPC.notes.delete, noteId),
    archive: (noteId: string): Promise<void> => ipcRenderer.invoke(IPC.notes.archive, noteId),
    search: (query: string, options?: SearchOptions): Promise<Note[]> =>
      ipcRenderer.invoke(IPC.notes.search, query, options),
    onEvent: (cb: (event: NoteChangeEvent) => void) => {
      const listener = (_: unknown, event: NoteChangeEvent): void => cb(event);
      ipcRenderer.on(IPC.notes.event, listener);
      return () => ipcRenderer.removeListener(IPC.notes.event, listener);
    }
  },
  library: {
    save: (input: SaveLibraryItemInput): Promise<LibraryItem> => ipcRenderer.invoke(IPC.library.save, input),
    list: (filter?: LibraryFilter): Promise<LibraryItem[]> => ipcRenderer.invoke(IPC.library.list, filter),
    get: (id: string): Promise<LibraryItem | null> => ipcRenderer.invoke(IPC.library.get, id),
    update: (id: string, patch: UpdateLibraryItemInput): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.library.update, id, patch),
    annotate: (id: string, input: AddLibraryAnnotationInput): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.library.annotate, id, input),
    markRead: (id: string, input?: LibraryReadingUpdateInputV2): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.library.markRead, id, input),
    archive: (id: string): Promise<LibraryItem> => ipcRenderer.invoke(IPC.library.archive, id),
    distill: (id: string): Promise<LibraryDistillationResult> => ipcRenderer.invoke(IPC.library.distill, id),
    acceptDistillation: (input: AcceptLibraryDistillationInput): Promise<LibraryAcceptDistillationResult> =>
      ipcRenderer.invoke(IPC.library.acceptDistillation, input)
  },
  feeds: {
    listSources: (): Promise<FeedSource[]> => ipcRenderer.invoke(IPC.feeds.sourcesList),
    createSource: (input: CreateFeedSourceInput): Promise<FeedSource> =>
      ipcRenderer.invoke(IPC.feeds.sourcesCreate, input),
    updateSource: (id: string, patch: UpdateFeedSourceInput): Promise<FeedSource> =>
      ipcRenderer.invoke(IPC.feeds.sourcesUpdate, id, patch),
    deleteSource: (id: string): Promise<FeedSource | null> => ipcRenderer.invoke(IPC.feeds.sourcesDelete, id),
    fetch: (sourceId?: string): Promise<FeedFetchResult[]> => ipcRenderer.invoke(IPC.feeds.fetch, sourceId),
    listItems: (filter?: FeedItemFilter): Promise<FeedItem[]> => ipcRenderer.invoke(IPC.feeds.itemsList, filter),
    markSeen: (id: string): Promise<FeedItem> => ipcRenderer.invoke(IPC.feeds.itemsMarkSeen, id),
    ignore: (id: string): Promise<FeedItem> => ipcRenderer.invoke(IPC.feeds.itemsIgnore, id),
    saveToLibrary: (id: string, input?: SaveFeedToLibraryInput): Promise<SaveFeedToLibraryResult> =>
      ipcRenderer.invoke(IPC.feeds.itemsSaveToLibrary, id, input),
    digest: (date: string): Promise<FeedSynthesisResult<FeedDigestPayload>> =>
      ipcRenderer.invoke(IPC.feeds.digest, date),
    cluster: (scope?: string): Promise<FeedSynthesisResult<FeedClusterPayload>> =>
      ipcRenderer.invoke(IPC.feeds.cluster, scope)
  },
  knowledgeBase: {
    list: (): Promise<KnowledgeBase[]> => ipcRenderer.invoke(IPC.knowledgeBase.list),
    import: (input: ImportKnowledgeBaseInput): Promise<KnowledgeBase> =>
      ipcRenderer.invoke(IPC.knowledgeBase.import, input),
    remove: (kbId: string, deleteFiles?: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.knowledgeBase.remove, kbId, deleteFiles),
    rescan: (kbId: string): Promise<KnowledgeBase> =>
      ipcRenderer.invoke(IPC.knowledgeBase.rescan, kbId),
    search: (kbId: string | 'all', query: string): Promise<KnowledgeBaseSearchHit[]> =>
      ipcRenderer.invoke(IPC.knowledgeBase.search, kbId, query),
    activate: (input: ActivateKnowledgeBaseInput): Promise<Note> =>
      ipcRenderer.invoke(IPC.knowledgeBase.activate, input)
  },
  onboarding: {
    status: (): Promise<OnboardingStatus> => ipcRenderer.invoke(IPC.onboarding.status),
    skip: (): Promise<void> => ipcRenderer.invoke(IPC.onboarding.skip),
    runWelcomeAnalysis: (kbIds: string[]): Promise<WelcomeAnalysisResult> =>
      ipcRenderer.invoke(IPC.onboarding.runWelcomeAnalysis, kbIds),
    applySuggestions: (result: WelcomeAnalysisResult): Promise<void> =>
      ipcRenderer.invoke(IPC.onboarding.applySuggestions, result)
  },
  scheduledTasks: {
    list: (filter?: ScheduledTaskFilter): Promise<ScheduledTask[]> =>
      ipcRenderer.invoke(IPC.scheduledTasks.list, filter),
    get: (taskId: string): Promise<ScheduledTask | null> =>
      ipcRenderer.invoke(IPC.scheduledTasks.get, taskId),
    create: (input: CreateScheduledTaskInput): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.create, input),
    update: (taskId: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.update, taskId, patch),
    delete: (taskId: string): Promise<void> => ipcRenderer.invoke(IPC.scheduledTasks.delete, taskId),
    pause: (taskId: string): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.pause, taskId),
    resume: (taskId: string): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.resume, taskId),
    disable: (taskId: string): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.disable, taskId),
    enable: (taskId: string): Promise<ScheduledTask> =>
      ipcRenderer.invoke(IPC.scheduledTasks.enable, taskId),
    triggerNow: (taskId: string): Promise<ScheduledTaskExecution> =>
      ipcRenderer.invoke(IPC.scheduledTasks.triggerNow, taskId),
    runNow: (taskId: string): Promise<ScheduledTaskExecution> =>
      ipcRenderer.invoke(IPC.scheduledTasks.runNow, taskId),
    executions: (taskId: string, limit?: number, offset?: number): Promise<ScheduledTaskExecution[]> =>
      ipcRenderer.invoke(IPC.scheduledTasks.executions, taskId, limit, offset),
    getExecutions: (taskId: string, limit?: number, offset?: number): Promise<ScheduledTaskExecution[]> =>
      ipcRenderer.invoke(IPC.scheduledTasks.getExecutions, taskId, limit, offset),
    parseNaturalLanguage: (text: string): Promise<NaturalLanguageScheduleResult> =>
      ipcRenderer.invoke(IPC.scheduledTasks.parseNaturalLanguage, text),
    onEvent: (cb: (event: { type: string; task?: ScheduledTask; execution?: ScheduledTaskExecution }) => void) => {
      const listener = (_: unknown, event: { type: string; task?: ScheduledTask; execution?: ScheduledTaskExecution }): void => cb(event);
      ipcRenderer.on(IPC.scheduledTasks.event, listener);
      return () => ipcRenderer.removeListener(IPC.scheduledTasks.event, listener);
    }
  },
  timeline: {
    getDay: (date: string, options?: { developerMode?: boolean }): Promise<DailyTimeline> =>
      ipcRenderer.invoke(IPC.timeline.getDay, date, options),
    getWeek: (isoWeek: string): Promise<WeeklyTimeline> =>
      ipcRenderer.invoke(IPC.timeline.getWeek, isoWeek),
    getMonth: (month: string): Promise<MonthlyIndex> => ipcRenderer.invoke(IPC.timeline.getMonth, month),
    getYear: (year: number): Promise<YearlyIndex> => ipcRenderer.invoke(IPC.timeline.getYear, year),
    getMonthlyIndex: (month: string): Promise<MonthlyIndex> =>
      ipcRenderer.invoke(IPC.timeline.getMonthlyIndex, month),
    getYearlyIndex: (year: number): Promise<YearlyIndex> =>
      ipcRenderer.invoke(IPC.timeline.getYearlyIndex, year),
    generateDailySummary: (date: string): Promise<DailySummary> =>
      ipcRenderer.invoke(IPC.timeline.generateDailySummary, date),
    updateDailySummary: (date: string, patch: { narrative?: string; headline?: string }): Promise<DailySummary> =>
      ipcRenderer.invoke(IPC.timeline.updateDailySummary, date, patch),
    exportPDF: (scope: TimelineScope): Promise<TimelineExportResult> =>
      ipcRenderer.invoke(IPC.timeline.exportPDF, scope),
    onEvent: (cb: (event: DailyTimeline) => void) => {
      const listener = (_: unknown, event: DailyTimeline): void => cb(event);
      ipcRenderer.on(IPC.timeline.event, listener);
      return () => ipcRenderer.removeListener(IPC.timeline.event, listener);
    }
  },
  synthesis: {
    get: (scopeKey) => ipcRenderer.invoke(IPC.synthesis.get, scopeKey),
    getArtifact: (artifactId) => ipcRenderer.invoke(IPC.synthesis.getArtifact, artifactId),
    getMany: (scopeKeys) => ipcRenderer.invoke(IPC.synthesis.getMany, scopeKeys),
    list: (filter) => ipcRenderer.invoke(IPC.synthesis.list, filter),
    ensure: (input) => ipcRenderer.invoke(IPC.synthesis.ensure, input),
    recompute: (scopeKey, options) => ipcRenderer.invoke(IPC.synthesis.recompute, scopeKey, options),
    markStale: (scopeKey, reason) => ipcRenderer.invoke(IPC.synthesis.markStale, scopeKey, reason),
    applyUserEdit: (input) => ipcRenderer.invoke(IPC.synthesis.applyUserEdit, input)
  },
  semantic: {
    search: (query: SearchQuery) => ipcRenderer.invoke(IPC.semantic.search, query),
    getDocument: (docId: string) => ipcRenderer.invoke(IPC.semantic.getDocument, docId),
    indexStatus: () => ipcRenderer.invoke(IPC.semantic.indexStatus),
    rebuildIndex: () => ipcRenderer.invoke(IPC.semantic.rebuildIndex),
    searchAndAnswer: (query: SearchQuery) => ipcRenderer.invoke(IPC.semantic.searchAndAnswer, query),
    onEvent: (cb: (event: { type: string; status?: SemanticIndexStatus }) => void) => {
      const listener = (_: unknown, event: { type: string; status?: SemanticIndexStatus }): void => cb(event);
      ipcRenderer.on(IPC.semantic.event, listener);
      return () => ipcRenderer.removeListener(IPC.semantic.event, listener);
    }
  },
  memory: {
    list: (filter?: MemoryFilter) => ipcRenderer.invoke(IPC.memory.list, filter),
    get: (id: string) => ipcRenderer.invoke(IPC.memory.get, id),
    create: (input: CreateMemoryInput) => ipcRenderer.invoke(IPC.memory.create, input),
    update: (id: string, patch: UpdateMemoryInput) => ipcRenderer.invoke(IPC.memory.update, id, patch),
    archive: (id: string) => ipcRenderer.invoke(IPC.memory.archive, id),
    merge: (fromId: string, toId: string) => ipcRenderer.invoke(IPC.memory.merge, fromId, toId),
    promoteToResource: (id: string) => ipcRenderer.invoke(IPC.memory.promoteToResource, id),
    promoteToProject: (id: string) => ipcRenderer.invoke(IPC.memory.promoteToProject, id),
    recall: (query: string, options?: RecallOptions) => ipcRenderer.invoke(IPC.memory.recall, query, options),
    recallStats: (id: string) => ipcRenderer.invoke(IPC.memory.recallStats, id),
    clusters: () => ipcRenderer.invoke(IPC.memory.clusters),
    generateDigest: () => ipcRenderer.invoke(IPC.memory.generateDigest),
    onEvent: (cb: (event: { type: string; count?: number }) => void) => {
      const listener = (_: unknown, event: { type: string; count?: number }): void => cb(event);
      ipcRenderer.on(IPC.memory.event, listener);
      return () => ipcRenderer.removeListener(IPC.memory.event, listener);
    }
  },
  stage: {
    get: (conversationId: string): Promise<ConversationStage> =>
      ipcRenderer.invoke(IPC.stage.get, conversationId),
    addArtifact: (
      conversationId: string,
      artifact: Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>
    ): Promise<Artifact> => ipcRenderer.invoke(IPC.stage.addArtifact, conversationId, artifact),
    execAction: (conversationId: string, artifactId: string, actionId: string, params?: unknown): Promise<void> =>
      ipcRenderer.invoke(IPC.stage.execAction, conversationId, artifactId, actionId, params),
    removeArtifact: (conversationId: string, artifactId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.stage.removeArtifact, conversationId, artifactId),
    onEvent: (cb: (stage: ConversationStage) => void) => {
      const listener = (_: unknown, stage: ConversationStage): void => cb(stage);
      ipcRenderer.on(IPC.stage.event, listener);
      return () => ipcRenderer.removeListener(IPC.stage.event, listener);
    }
  },
  gateway: {
    getConfig: (): Promise<GatewayConfig> => ipcRenderer.invoke(IPC.gateway.configGet),
    updateConfig: (patch: Partial<GatewayConfig>): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.configUpdate, patch),
    status: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.status),
    getStatus: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.getStatus),
    start: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.start),
    startDaemon: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.startDaemon),
    stop: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.stop),
    stopDaemon: (): Promise<GatewayStatus> => ipcRenderer.invoke(IPC.gateway.stopDaemon),
    setVaultPath: (vaultPath: string): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.setVaultPath, vaultPath),
    listChannels: (): Promise<ChannelConfig[]> => ipcRenderer.invoke(IPC.gateway.listChannels),
    addChannel: (channel: Omit<ChannelConfig, 'id'> & { id?: string }): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.addChannel, channel),
    updateChannel: (channelId: string, patch: Partial<ChannelConfig>): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.updateChannel, channelId, patch),
    enableChannel: (channelId: string): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.enableChannel, channelId),
    disableChannel: (channelId: string): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.disableChannel, channelId),
    removeChannel: (channelId: string): Promise<GatewayConfig> =>
      ipcRenderer.invoke(IPC.gateway.removeChannel, channelId),
    generateBindCode: (orbitUserId?: string): Promise<{ code: string; expires_at: string }> =>
      ipcRenderer.invoke(IPC.gateway.generateBindCode, orbitUserId),
    getMessages: (limit?: number): Promise<GatewayMessage[]> =>
      ipcRenderer.invoke(IPC.gateway.getMessages, limit),
    sendOutbound: (message: ChannelOutboundMessage): Promise<GatewayRouteResult> =>
      ipcRenderer.invoke(IPC.gateway.sendOutbound, message),
    routeInbound: (message: ChannelInboundMessage): Promise<GatewayRouteResult> =>
      ipcRenderer.invoke(IPC.gateway.routeInbound, message),
    onEvent: (cb: (status: GatewayStatus) => void) => {
      const listener = (_: unknown, status: GatewayStatus): void => cb(status);
      ipcRenderer.on(IPC.gateway.event, listener);
      return () => ipcRenderer.removeListener(IPC.gateway.event, listener);
    }
  },
  resources: {
    list: (filter) => ipcRenderer.invoke(IPC.resources.list, filter),
    get: (resourceIdOrSlug) => ipcRenderer.invoke(IPC.resources.get, resourceIdOrSlug),
    create: (input) => ipcRenderer.invoke(IPC.resources.create, input),
    update: (resourceIdOrSlug, patch) => ipcRenderer.invoke(IPC.resources.update, resourceIdOrSlug, patch),
    archive: (resourceIdOrSlug) => ipcRenderer.invoke(IPC.resources.archive, resourceIdOrSlug),
    linkRef: (resourceIdOrSlug, input) => ipcRenderer.invoke(IPC.resources.linkRef, resourceIdOrSlug, input),
    unlinkRef: (resourceIdOrSlug, refId) => ipcRenderer.invoke(IPC.resources.unlinkRef, resourceIdOrSlug, refId),
    promoteRef: (resourceIdOrSlug, input) => ipcRenderer.invoke(IPC.resources.promoteRef, resourceIdOrSlug, input),
    engage: (resourceIdOrSlug, input) => ipcRenderer.invoke(IPC.resources.engage, resourceIdOrSlug, input),
    suggestFromNotes: (options) => ipcRenderer.invoke(IPC.resources.suggestFromNotes, options),
    createFromSuggestion: (input) => ipcRenderer.invoke(IPC.resources.createFromSuggestion, input),
    onEvent: (cb) => {
      const listener = (_: unknown, event: ResourceChangeEvent): void => cb(event);
      ipcRenderer.on(IPC.resources.event, listener);
      return () => ipcRenderer.removeListener(IPC.resources.event, listener);
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
    list: (): Promise<JournalListItemDTO[]> => ipcRenderer.invoke(IPC.review.list),
    listRuns: (filter?: ReviewFilter) => ipcRenderer.invoke(IPC.review.listRuns, filter),
    getRun: (id: string) => ipcRenderer.invoke(IPC.review.getRun, id),
    triggerReview: (kind: ReviewKind, scopeRef?: string) =>
      ipcRenderer.invoke(IPC.review.triggerReview, kind, scopeRef),
    acknowledge: (findingId: string) => ipcRenderer.invoke(IPC.review.acknowledge, findingId),
    executeAction: (actionId: string) => ipcRenderer.invoke(IPC.review.executeAction, actionId),
    archiveRun: (id: string) => ipcRenderer.invoke(IPC.review.archiveRun, id)
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
    get: (areaSlugOrUid: string) => ipcRenderer.invoke(IPC.area.get, areaSlugOrUid),
    create: (args: CreateAreaArgsDTO) => ipcRenderer.invoke(IPC.area.create, args),
    update: (areaSlugOrUid: string, patch) =>
      ipcRenderer.invoke(IPC.area.update, areaSlugOrUid, patch),
    archive: (areaSlugOrUid: string) => ipcRenderer.invoke(IPC.area.archive, areaSlugOrUid),
    getConfig: (areaPath: string) => ipcRenderer.invoke(IPC.area.getConfig, areaPath),
    setConfig: (areaPath: string, patch: Partial<AreaConfigDTO>) =>
      ipcRenderer.invoke(IPC.area.setConfig, areaPath, patch),
    dashboard: (areaSlugOrUid: string): Promise<AreaDashboardData> =>
      ipcRenderer.invoke(IPC.area.dashboard, areaSlugOrUid),
    assign: (input: AreaAssignmentInput) => ipcRenderer.invoke(IPC.area.assign, input),
    unassign: (input: AreaUnassignmentInput) => ipcRenderer.invoke(IPC.area.unassign, input),
    suggestAssignments: (entity: AreaEntityRef): Promise<AreaAssignmentSuggestion[]> =>
      ipcRenderer.invoke(IPC.area.suggestAssignments, entity),
    onEvent: (cb: (event: AreaChangeEvent) => void) => {
      const listener = (_: unknown, event: AreaChangeEvent): void => cb(event);
      ipcRenderer.on(IPC.area.event, listener);
      return () => ipcRenderer.removeListener(IPC.area.event, listener);
    }
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
