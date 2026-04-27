import type {
  AppSettings,
  BacklinkItem,
  CreateFileResult,
  DiagnosticsInfo,
  FileNode,
  FsEvent,
  ProjectFileNode,
  RenameResult,
  SearchHit,
  Theme,
  VaultInfo,
  VaultResult
} from './types';
import type {
  EntitySummary,
  ParaEntityType,
  TaskFilter,
  TaskRecord,
  TaskStatus
} from './schemas';
import type {
  AgentEvent,
  CostSummary,
  CostTodayResult,
  DailyReportResult,
  DetectResult,
  ReattachResult,
  RunSummary,
  SendAgentMessageResult,
  StartTaskArgs,
  StartTaskResult,
  TailQuery
} from './agent';
import type { AutoRunnerStatusDTO } from './auto_runner';
import type { ActivityEvent, ActivityQueryFilter } from './activity';
import type {
  DashboardAgentStats,
  DashboardKnowledgeStats,
  DashboardPendingStats,
  DashboardSummary,
  DashboardSystemHealth,
  DashboardThinkingStats
} from './dashboard';
import type { TraceableEvent, TraceableEventFilter, TraceableEventQueryResult } from './events';
import type { ChatAction, RuntimeEvent as ChatRuntimeEvent } from './chat-protocol';
import type {
  Conversation as ChatConversation,
  ConversationAnchor as ChatConversationAnchor,
  ConversationMeta as ChatConversationMeta,
  ConversationTurn as ChatConversationTurn,
  ConversationTurnRole as ChatConversationTurnRole
} from './conversation';

export interface ChatCreateConversationInput {
  anchor: ChatConversationAnchor;
  runtimeHint?: string;
  title?: string;
}

export interface ChatAppendTurnInput {
  conversationId: string;
  role: ChatConversationTurnRole;
  content: string;
  runtimeEventIds?: string[];
}
import type {
  Proposal,
  ProposalListFilter,
  ProposalResolveInput,
  ProposalSubmitInput,
  ProposalSyncSnapshot
} from './approval';
import type {
  InboxCaptureInput,
  InboxDismissInput,
  InboxEvent,
  InboxItem,
  InboxListFilter,
  InboxListResult,
  InboxMessageInput,
  InboxResolveInput
} from './inbox';
import type {
  AddFeedSubscriptionInput,
  CreateThoughtInput,
  FeedRefreshResult,
  FeedSubscription,
  LibraryReadingUpdateInput,
  LinkThoughtInput,
  PromoteLibraryArticleInput,
  PromoteResult,
  PromoteThoughtInput,
  SaveFeedItemInput,
  SaveLibraryArticleInput,
  UpdateThoughtInput
} from './capture';
import type { BudgetSettings } from './schemas';
import type {
  ChangesSummary,
  CheckReport,
  CommitSelectionArgs,
  DiffFile,
  DiffResult,
  EnvQueueStatus,
  GitStatusSummary,
  InstallResult,
  MergeResult,
  MergeStrategy,
  ResetAllResult,
  StagePathsArgs,
  WorktreeRecord
} from './git';
import type {
  GitHubConnection,
  GitHubProjectDetails,
  GitHubPullRequestSummary,
  GitHubProjectState,
  GitHubRepoBinding,
  GitHubRepoVisibility,
  GitHubTaskBinding,
  GitHubWorkspaceRepository
} from './github';
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
  RuntimeRegistrySnapshot,
  TaskLease
} from './orchestration';

/**
 * Typed IPC contract shared between main and renderer.
 *
 * Namespaces are fixed across milestones; handlers marked M3+ throw
 * 'not implemented' until their owning milestone lands.
 */
export const IPC = {
  workspace: {
    pickAndOpen: 'workspace:pickAndOpen',
    createNew: 'workspace:createNew',
    openPath: 'workspace:openPath',
    current: 'workspace:current',
    close: 'workspace:close',
    crashLogPath: 'workspace:crashLogPath',
    reportCrash: 'workspace:reportCrash',
    revealUserData: 'workspace:revealUserData',
    revealVaultOrbit: 'workspace:revealVaultOrbit',
    diagnostics: 'workspace:diagnostics'
  },
  settings: {
    get: 'settings:get',
    setTheme: 'settings:setTheme',
    update: 'settings:update',
    detectClaude: 'settings:detectClaude'
  },
  fs: {
    listTree: 'fs:listTree',
    exists: 'fs:exists',
    readFile: 'fs:readFile',
    writeFile: 'fs:writeFile',
    createFile: 'fs:createFile',
    rename: 'fs:rename',
    deleteFile: 'fs:deleteFile',
    resolveUid: 'fs:resolveUid',
    uidOf: 'fs:uidOf',
    search: 'fs:search',
    backlinksOf: 'fs:backlinksOf',
    findByContentHash: 'fs:findByContentHash',
    rescueOrphan: 'fs:rescueOrphan',
    event: 'fs:event',
    listProjectTree: 'fs:listProjectTree',
    createDirectory: 'fs:createDirectory'
  },
  para: {
    listEntities: 'para:listEntities',
    listTasks: 'para:listTasks',
    updateTaskStatus: 'para:updateTaskStatus',
    closeProject: 'para:closeProject'
  },
  project: {
    create: 'project:create',
    list: 'project:list',
    archive: 'project:archive',
    getTasks: 'project:getTasks',
    listTemplates: 'project:listTemplates'
  },
  runtime: {
    list: 'runtime:list',
    refresh: 'runtime:refresh',
    get: 'runtime:get',
    event: 'runtime:event'
  },
  dashboard: {
    summary: 'dashboard:summary',
    pendingStats: 'dashboard:pendingStats',
    agentStats: 'dashboard:agentStats',
    knowledgeStats: 'dashboard:knowledgeStats',
    thinkingStats: 'dashboard:thinkingStats',
    systemHealth: 'dashboard:systemHealth'
  },
  planner: {
    listProposals: 'planner:listProposals',
    getProposal: 'planner:getProposal',
    saveProposal: 'planner:saveProposal',
    publishProposal: 'planner:publishProposal',
    chat: 'planner:chat',
    generateProposal: 'planner:generateProposal'
  },
  conversation: {
    get: 'conversation:get',
    send: 'conversation:send',
    switchRuntime: 'conversation:switchRuntime',
    event: 'conversation:event'
  },
  chat: {
    /** RuntimeEvent 流（Chat 解耦 M2 起，M4/M5 消费）。 */
    runtimeEvent: 'chat:runtimeEvent',
    /** ChatAction 入站（renderer → main）。 */
    action: 'chat:action',
    /** Conversation 数据模型（M3）。 */
    conversationGet: 'chat:conversation:get',
    conversationList: 'chat:conversation:list',
    conversationCreate: 'chat:conversation:create',
    conversationAppendTurn: 'chat:conversation:appendTurn',
    conversationFindByAnchor: 'chat:conversation:findByAnchor'
  },
  dispatch: {
    status: 'dispatch:status',
    releaseTask: 'dispatch:releaseTask',
    retryTask: 'dispatch:retryTask',
    event: 'dispatch:event'
  },
  role: {
    listTemplates: 'role:listTemplates',
    listTemplateVersions: 'role:listTemplateVersions',
    listBindings: 'role:listBindings',
    createBinding: 'role:createBinding',
    updateBinding: 'role:updateBinding',
    getBindingTasks: 'role:getBindingTasks',
    getBindingReports: 'role:getBindingReports'
  },
  task: {
    create: 'task:create',
    get: 'task:get',
    updateFrontmatter: 'task:updateFrontmatter',
    updateSection: 'task:updateSection',
    appendExecutionLog: 'task:appendExecutionLog',
    relink: 'task:relink'
  },
  migrations: {
    runV3: 'migrations:runV3'
  },
  vision: {
    get: 'vision:get',
    update: 'vision:update'
  },
  git: {
    status: 'git:status',
    commit: 'git:commit',
    createWorktree: 'git:createWorktree',
    listWorktrees: 'git:listWorktrees',
    getDiff: 'git:getDiff',
    removeWorktree: 'git:removeWorktree',
    resetAll: 'git:resetAll',
    ghostCommit: 'git:ghostCommit',
    preMergeCheck: 'git:preMergeCheck',
    mergeGhost: 'git:mergeGhost',
    getChanges: 'git:getChanges',
    getWorkingTreeDiff: 'git:getWorkingTreeDiff',
    stagePaths: 'git:stagePaths',
    unstagePaths: 'git:unstagePaths',
    discardPaths: 'git:discardPaths',
    commitSelection: 'git:commitSelection'
  },
  env: {
    status: 'env:status',
    event: 'env:event'
  },
  agent: {
    detect: 'agent:detect',
    startTask: 'agent:startTask',
    sendMessage: 'agent:sendMessage',
    stop: 'agent:stop',
    list: 'agent:list',
    tail: 'agent:tail',
    reattach: 'agent:reattach',
    costToday: 'agent:costToday',
    costRun: 'agent:costRun',
    costDailyReport: 'agent:cost:dailyReport',
    budgetGet: 'agent:budget:get',
    budgetUpdate: 'agent:budget:update',
    event: 'agent:event',
    installInWorktree: 'agent:installInWorktree'
  },
  distill: {
    project: 'distill:project',
    cancel: 'distill:cancel',
    suggest: 'distill:suggest',
    reindex: 'distill:reindex',
    experienceFor: 'distill:experienceFor'
  },
  activity: {
    query: 'activity:query'
  },
  events: {
    query: 'events:query',
    gc: 'events:gc',
    event: 'events:event'
  },
  approval: {
    submit: 'approval:submit',
    resolve: 'approval:resolve',
    list: 'approval:list',
    get: 'approval:get',
    event: 'approval:event'
  },
  inbox: {
    emitMessage: 'inbox:emitMessage',
    emitCapture: 'inbox:emitCapture',
    list: 'inbox:list',
    get: 'inbox:get',
    resolve: 'inbox:resolve',
    dismiss: 'inbox:dismiss',
    archive: 'inbox:archive',
    event: 'inbox:event'
  },
  capture: {
    feed: {
      listSubscriptions: 'capture:feed:listSubscriptions',
      addSubscription: 'capture:feed:addSubscription',
      removeSubscription: 'capture:feed:removeSubscription',
      refresh: 'capture:feed:refresh',
      listPending: 'capture:feed:listPending',
      fadeOut: 'capture:feed:fadeOut',
      saveToLibrary: 'capture:feed:saveToLibrary',
      history: 'capture:feed:history'
    },
    library: {
      save: 'capture:library:save',
      list: 'capture:library:list',
      get: 'capture:library:get',
      readContent: 'capture:library:readContent',
      updateReading: 'capture:library:updateReading',
      promote: 'capture:library:promote',
      dismiss: 'capture:library:dismiss'
    },
    thought: {
      create: 'capture:thought:create',
      list: 'capture:thought:list',
      get: 'capture:thought:get',
      update: 'capture:thought:update',
      promote: 'capture:thought:promote',
      link: 'capture:thought:link',
      dismiss: 'capture:thought:dismiss'
    }
  },
  quickCapture: {
    open: 'quickCapture:open'
  },
  terminal: {
    open: 'terminal:open',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    list: 'terminal:list',
    data: 'terminal:data',
    exit: 'terminal:exit'
  },
  terminalAgent: {
    list: 'terminalAgent:list',
    detail: 'terminalAgent:detail',
    event: 'terminalAgent:event'
  },
  review: {
    generate: 'review:generate',
    get: 'review:get',
    list: 'review:list'
  },
  autoRunner: {
    status: 'autoRunner:status',
    start: 'autoRunner:start',
    stop: 'autoRunner:stop',
    event: 'autoRunner:event'
  },
  envExt: {
    hasGhCli: 'env:hasGhCli'
  },
  github: {
    authenticate: 'github:authenticate',
    listRepositories: 'github:listRepositories',
    getConnection: 'github:getConnection',
    getProjectState: 'github:getProjectState',
    getProjectDetails: 'github:getProjectDetails',
    publishProject: 'github:publishProject',
    importRepository: 'github:importRepository',
    createPullRequest: 'github:createPullRequest',
    bindTaskIssue: 'github:bindTaskIssue',
    unbindTaskIssue: 'github:unbindTaskIssue'
  },
  area: {
    list: 'area:list',
    create: 'area:create',
    getConfig: 'area:getConfig',
    setConfig: 'area:setConfig'
  },
  vaultConfig: {
    get: 'vaultConfig:get',
    update: 'vaultConfig:update',
    inspect: 'vaultConfig:inspect',
    linkDirectory: 'vaultConfig:linkDirectory',
    unlinkDirectory: 'vaultConfig:unlinkDirectory',
    importDirectory: 'vaultConfig:importDirectory'
  }
} as const;

// --- R4: embedded terminal (node-pty) payloads ---

export interface TerminalOpenArgsDTO {
  cwd: string;
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  initialCommand?: string;
  agentLaunch?: TerminalAgentLaunchDTO;
}

export interface TerminalAgentLaunchDTO {
  launcherCommand: string;
  prompt: string;
}

export interface TerminalSessionInfoDTO {
  id: string;
  pid: number;
  cwd: string;
  shell: string;
  createdAt: string;
  paneId?: string;
  projectUid?: string;
  projectSlug?: string;
}

export interface TerminalDataEventDTO {
  id: string;
  data: string;
}

export interface TerminalExitEventDTO {
  id: string;
  exitCode: number;
  signal?: number;
  paneId?: string;
  projectUid?: string;
  projectSlug?: string;
}

export interface TerminalAgentSessionDTO {
  sessionId: string;
  paneId: string;
  projectUid: string;
  roomKind?: 'project' | 'area';
  agentType: string;
  vendorSessionId?: string;
  status: 'active' | 'completed' | 'interrupted';
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  title?: string;
  summary?: string;
  stats: {
    promptCount: number;
    permissionCount: number;
  };
  resumeSessionId?: string | null;
  resumeCommand?: string | null;
}

export interface TerminalAgentSessionMessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
}

export interface TerminalAgentSessionDetailDTO extends TerminalAgentSessionDTO {
  messages: TerminalAgentSessionMessageDTO[];
}

export interface TerminalAgentEventDTO {
  eventType: 'Start' | 'Stop' | 'PermissionRequest' | 'Progress';
  rawEventType?: string;
  payload?: Record<string, unknown>;
  paneId?: string;
  projectUid?: string;
  ts: string;
  agentType?: string;
  sessionId?: string;
  status?: 'active' | 'completed' | 'interrupted';
  reason?: 'hook' | 'exit';
}

export interface SearchOpts {
  limit?: number;
}

export interface EntityFilter {
  type?: ParaEntityType;
}

export interface CloseProjectResult {
  oldPath: string;
  newPath: string;
  newRelPath: string;
  uid: string;
  archivedAt: string;
  linksUpdated: number;
}

// --- R1: project-as-folder IPC payloads ---

export interface TemplateMetaDTO {
  id: string;
  label: string;
  description: string;
}

export interface ProjectSummaryDTO {
  uid: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  tags?: string[];
  created_at?: string;
  archived_at?: string;
  template?: string;
  area_uid?: string;
  path: string;
  readmePath: string;
  relPath: string;
  legacy: boolean;
  github?: GitHubRepoBinding;
}

export interface AgentExposureSettingsDTO {
  mode: 'isolated' | 'bridge' | 'compatible';
  exposeAgentMdBridge?: boolean;
  exposeAgentsMdBridge?: boolean;
  consumeCommunityAgentMd?: boolean;
  consumeCommunityAgentsMd?: boolean;
  consumeCommunityDotAgent?: boolean;
}

export interface CreateProjectArgsDTO {
  slug: string;
  template: string;
  name: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  agent_exposure?: AgentExposureSettingsDTO;
}

export interface CreateProjectResultDTO {
  projectPath: string;
  relPath: string;
  uid: string;
  slug: string;
}

export interface ArchiveProjectResultDTO {
  oldPath: string;
  newPath: string;
  uid: string;
  slug: string;
  archivedAt: string;
}

export interface PublishProjectToGitHubArgsDTO {
  projectUid: string;
  owner: string;
  repo: string;
  visibility: GitHubRepoVisibility;
  defaultBranch?: string;
}

export interface ImportGitHubRepositoryArgsDTO {
  owner: string;
  repo: string;
  slug?: string;
  name?: string;
  agent_exposure?: AgentExposureSettingsDTO;
}

export interface ImportGitHubRepositoryResultDTO {
  projectPath: string;
  uid: string;
  slug: string;
  binding: GitHubRepoBinding | null;
}

export interface CreateGitHubPullRequestArgsDTO {
  projectUid: string;
  title?: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
}

export interface GitHubRepositoryListArgsDTO {
  owner?: string;
  query?: string;
}

export interface GitHubTaskIssueBindingArgsDTO {
  taskPath: string;
  issueNumber: number;
  issueTitle?: string;
  issueUrl?: string;
}

export interface CreateTaskArgsDTO {
  project_uid?: string;
  area_uid?: string;
  title: string;
  description?: string;
  uid?: string;
  frontmatter?: Record<string, unknown>;
}

export interface CreateTaskResultDTO {
  taskPath: string;
  relPath: string;
  uid: string;
}

export type TaskSectionName = 'description' | 'thinking' | 'executionLog' | 'summary';

export interface TaskSectionsDTO {
  description: string;
  thinking: string;
  executionLog: string;
  summary: string;
  other: string;
}

export interface TaskGetResultDTO {
  frontmatter: Record<string, unknown>;
  sections: TaskSectionsDTO;
  raw: string;
}

export interface OrphanRescueCandidate {
  commit: string;
  at: string; // ISO timestamp
  oldPath: string; // vault-relative
  newPath?: string;
  repo: 'vault' | 'project';
  repoPath: string; // abs
}

export interface V3MigrationReport {
  migrated: string[];
  skipped: string[];
  failed?: { slug: string; error: string }[];
  snapshotSha?: string | null;
  dryRun: boolean;
}

export interface TaskRelinkResultDTO {
  taskPath: string;
  relPath: string;
  uid: string;
  projectUid: string;
  moved: boolean;
}

export interface VisionDTO {
  exists: boolean;
  raw: string;
  body: string;
  data: Record<string, unknown>;
  excerpt: string;
}

// --- Area DTOs ---

export interface AreaSummaryDTO {
  uid: string;
  slug: string;
  name: string;
  template?: string;
  tags: string[];
  created_at: string;
  path: string;
  relPath: string;
  hasVision: boolean;
}

export interface AreaConfigDTO {
  uid: string;
  slug: string;
  name: string;
  template?: string;
  tags: string[];
  created_at: string;
}

export interface CreateAreaArgsDTO {
  slug: string;
  name: string;
  template?: string;
  tags?: string[];
  uid?: string;
  github?: {
    owner: string;
    repo: string;
  };
}

export interface CreateAreaResultDTO {
  areaPath: string;
  relPath: string;
  uid: string;
  slug: string;
}

export interface VaultExtConfigDTO {
  external_notes_paths: string[];
}

export interface ExternalNotesPathInfoDTO {
  path: string;
  label: string;
  noteCount: number;
  exists: boolean;
}

export interface ImportNotesResultDTO {
  sourcePath: string;
  targetPath: string;
  relPath: string;
  importedFiles: number;
}

export interface DistillResult {
  resourcePath: string;
  resourceRelPath: string;
  resourceUid: string;
  runId: string;
}

export interface DistillSuggestHit {
  id: string;
  score: number;
  meta: {
    uid: string;
    kind: 'resource' | 'project' | 'archive';
    relPath: string;
    title: string;
    excerpt: string;
  };
}

export interface RuntimeEventDTO {
  at: string;
  type: string;
  runtime?: RuntimeDescriptor;
  snapshot?: RuntimeRegistrySnapshot;
}

export interface DispatchEventDTO {
  at: string;
  type: string;
  lease?: TaskLease;
  report?: ImplementationReport;
  snapshot?: DispatchSnapshot;
}

export interface RoleEventDTO {
  at: string;
  type: string;
  binding?: ProjectRoleBinding;
  templates?: RoleTemplate[];
}

export interface DailyReviewDTO {
  date: string;
  path: string;
  relPath: string;
  content: string;
  recommendedTaskUids: string[];
  usedLlm: boolean;
}

export interface JournalListItemDTO {
  date: string;
  path: string;
  relPath: string;
  excerpt: string;
}

export interface OrbitApi {
  workspace: {
    pickAndOpen(): Promise<VaultResult>;
    createNew(): Promise<VaultResult>;
    openPath(path: string): Promise<VaultResult>;
    current(): Promise<VaultInfo | null>;
    close(): Promise<void>;
    crashLogPath(): Promise<string>;
    reportCrash(record: {
      origin: 'renderer' | 'preload';
      message: string;
      stack?: string;
      extra?: Record<string, unknown>;
    }): Promise<string>;
    revealUserData(): Promise<void>;
    revealVaultOrbit(): Promise<void>;
    diagnostics(): Promise<DiagnosticsInfo>;
  };
  settings: {
    get(): Promise<AppSettings>;
    setTheme(theme: Theme): Promise<AppSettings>;
    update(partial: Partial<AppSettings>): Promise<AppSettings>;
    detectClaude(): Promise<DetectResult>;
  };
  fs: {
    listTree(vaultPath: string): Promise<FileNode>;
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    createFile(
      dirPath: string,
      filename: string,
      initialContent?: string
    ): Promise<CreateFileResult>;
    rename(oldPath: string, newPath: string): Promise<RenameResult>;
    deleteFile(path: string): Promise<void>;
    resolveUid(uid: string): Promise<string | null>;
    uidOf(relPath: string): Promise<string | null>;
    search(query: string, opts?: SearchOpts): Promise<SearchHit[]>;
    backlinksOf(path: string): Promise<BacklinkItem[]>;
    findByContentHash(hash: string): Promise<string[]>;
    rescueOrphan(taskPath: string): Promise<OrphanRescueCandidate[]>;
    onEvent(cb: (ev: FsEvent) => void): () => void;
    listProjectTree(root: string): Promise<ProjectFileNode>;
    createDirectory(parent: string, name: string): Promise<void>;
  };
  para: {
    listEntities(filter?: EntityFilter): Promise<EntitySummary[]>;
    listTasks(filter?: TaskFilter): Promise<TaskRecord[]>;
    updateTaskStatus(id: string, status: TaskStatus): Promise<TaskRecord | null>;
    closeProject(absPath: string): Promise<CloseProjectResult>;
  };
  project: {
    create(args: CreateProjectArgsDTO): Promise<CreateProjectResultDTO>;
    list(): Promise<ProjectSummaryDTO[]>;
    archive(uid: string): Promise<ArchiveProjectResultDTO>;
    getTasks(uid: string): Promise<TaskRecord[]>;
    listTemplates(): Promise<TemplateMetaDTO[]>;
  };
  runtime: {
    list(): Promise<RuntimeDescriptor[]>;
    refresh(): Promise<RuntimeRegistrySnapshot>;
    get(runtimeId: string): Promise<RuntimeDescriptor | null>;
    onEvent(cb: (ev: RuntimeEventDTO) => void): () => void;
  };
  dashboard: {
    summary(): Promise<DashboardSummary>;
    pendingStats(): Promise<DashboardPendingStats>;
    agentStats(): Promise<DashboardAgentStats>;
    knowledgeStats(): Promise<DashboardKnowledgeStats>;
    thinkingStats(): Promise<DashboardThinkingStats>;
    systemHealth(): Promise<DashboardSystemHealth>;
  };
  planner: {
    listProposals(projectUid: string): Promise<PlanProposal[]>;
    getProposal(projectUid: string, proposalId: string): Promise<PlanProposal | null>;
    saveProposal(proposal: PlanProposal): Promise<PlanProposal>;
    publishProposal(projectUid: string, proposalId: string): Promise<PlanPublishResult>;
    chat(
      projectUid: string,
      agentId: PlannerAgentId,
      messages: PlannerChatMessage[]
    ): Promise<PlannerChatReply>;
    generateProposal(
      projectUid: string,
      agentId: PlannerAgentId,
      messages: PlannerChatMessage[]
    ): Promise<PlannerProposalReply>;
  };
  conversation: {
    get(taskId: string): Promise<TaskConversation | null>;
    send(taskId: string, message: string): Promise<{
      turnId: string;
      runId: string;
      segmentId: string;
    }>;
    switchRuntime(taskUid: string, runtimeId: string): Promise<{ runId: string; segmentId?: string }>;
    onEvent(cb: (ev: { taskId: string; turn: ConversationTurn }) => void): () => void;
  };
  chat: {
    /** 订阅业务无关 RuntimeEvent 流（M2 起）。 */
    onRuntimeEvent(cb: (ev: ChatRuntimeEvent) => void): () => void;
    /** 发送 ChatAction 到 main（M5+ 实装 host 处理）。 */
    sendAction(action: ChatAction): Promise<void>;
    /** Conversation 数据模型（M3）。 */
    getConversation(id: string): Promise<ChatConversation | null>;
    listConversations(): Promise<ChatConversationMeta[]>;
    createConversation(input: ChatCreateConversationInput): Promise<ChatConversation>;
    appendTurn(input: ChatAppendTurnInput): Promise<ChatConversationTurn>;
    findConversationsByAnchor(kind: string, refId: string): Promise<ChatConversationMeta[]>;
  };
  dispatch: {
    status(projectUid?: string): Promise<DispatchSnapshot>;
    releaseTask(taskId: string, reason?: string): Promise<TaskLease | null>;
    retryTask(taskId: string): Promise<TaskLease | null>;
    onEvent(cb: (ev: DispatchEventDTO) => void): () => void;
  };
  role: {
    listTemplates(): Promise<RoleTemplate[]>;
    listTemplateVersions(templateId: string): Promise<RoleTemplateVersion[]>;
    listBindings(projectUid: string): Promise<ProjectRoleBinding[]>;
    createBinding(projectUid: string, binding: ProjectRoleBinding): Promise<ProjectRoleBinding>;
    updateBinding(
      projectUid: string,
      bindingId: string,
      patch: Partial<ProjectRoleBinding>
    ): Promise<ProjectRoleBinding>;
    getBindingTasks(projectUid: string, bindingId: string): Promise<TaskRecord[]>;
    getBindingReports(projectUid: string, bindingId: string): Promise<ImplementationReport[]>;
  };
  task: {
    create(args: CreateTaskArgsDTO): Promise<CreateTaskResultDTO>;
    get(absPath: string): Promise<TaskGetResultDTO>;
    updateFrontmatter(
      absPath: string,
      patch: Record<string, unknown>
    ): Promise<void>;
    updateSection(
      absPath: string,
      section: TaskSectionName,
      content: string
    ): Promise<void>;
    appendExecutionLog(absPath: string, line: string): Promise<void>;
    relink(taskAbsPath: string, newProjectUid: string): Promise<TaskRelinkResultDTO>;
  };
  migrations: {
    runV3(opts?: { dryRun?: boolean }): Promise<V3MigrationReport>;
  };
  vision: {
    get(): Promise<VisionDTO>;
    update(raw: string): Promise<VisionDTO>;
  };
  git: {
    status(opts?: { cwd?: string }): Promise<GitStatusSummary>;
    commit(message: string): Promise<unknown>;
    createWorktree(opts?: { taskId?: string }): Promise<WorktreeRecord>;
    listWorktrees(): Promise<WorktreeRecord[]>;
    getDiff(args: { worktreeId: string; base?: string }): Promise<DiffResult>;
    removeWorktree(id: string, opts?: { force?: boolean }): Promise<void>;
    resetAll(): Promise<ResetAllResult>;
    ghostCommit(args: {
      worktreeId: string;
      message: string;
      author?: string;
    }): Promise<{ sha: string }>;
    preMergeCheck(worktreeId: string): Promise<CheckReport>;
    mergeGhost(
      worktreeId: string,
      opts: { strategy: MergeStrategy }
    ): Promise<MergeResult>;
    /** Inspector: staged-aware change summary for a given cwd. */
    getChanges(args: { cwd: string }): Promise<ChangesSummary>;
    /** Inspector: tracked working-tree patch summary relative to HEAD. */
    getWorkingTreeDiff(args: { cwd: string; pathspec?: string[] }): Promise<DiffFile[]>;
    /** Inspector: stage specific paths. */
    stagePaths(args: StagePathsArgs): Promise<void>;
    /** Inspector: unstage specific paths. */
    unstagePaths(args: StagePathsArgs): Promise<void>;
    /** Inspector: discard changes for specific paths (tracked: restore; untracked: delete). */
    discardPaths(args: StagePathsArgs): Promise<void>;
    /** Inspector: commit currently staged changes without implicit add -A. */
    commitSelection(args: CommitSelectionArgs): Promise<{ sha: string }>;
  };
  env: {
    status(): Promise<EnvQueueStatus>;
    onEvent(cb: (s: EnvQueueStatus) => void): () => void;
  };
  agent: {
    detect(): Promise<DetectResult>;
    startTask(args: StartTaskArgs): Promise<StartTaskResult>;
    sendMessage(runId: string, message: string): Promise<SendAgentMessageResult>;
    stop(runId: string): Promise<void>;
    list(): Promise<RunSummary[]>;
    tail(runId: string, q?: TailQuery): Promise<AgentEvent[]>;
    reattach(runId: string, sinceIdx?: number): Promise<ReattachResult>;
    costToday(): Promise<CostTodayResult>;
    costRun(runId: string): Promise<CostSummary>;
    costDailyReport(args?: { date?: string }): Promise<DailyReportResult>;
    budgetGet(): Promise<BudgetSettings>;
    budgetUpdate(partial: Partial<BudgetSettings>): Promise<BudgetSettings>;
    onEvent(cb: (e: { runId: string; event: AgentEvent }) => void): () => void;
    installInWorktree(args: {
      worktreeId: string;
      manager: 'npm' | 'pnpm' | 'yarn';
      args?: string[];
    }): Promise<InstallResult>;
  };
  distill: {
    project(projectUid: string): Promise<DistillResult>;
    cancel(runId: string): Promise<void>;
    suggest(taskId: string): Promise<DistillSuggestHit[]>;
    reindex(): Promise<{ count: number }>;
    experienceFor(runId: string): Promise<DistillSuggestHit[]>;
  };
  activity: {
    query(filter?: ActivityQueryFilter): Promise<ActivityEvent[]>;
  };
  events: {
    query(filter?: TraceableEventFilter): Promise<TraceableEventQueryResult>;
    gc(maxFiles?: number): Promise<number>;
    onEvent(cb: (event: TraceableEvent) => void): () => void;
  };
  approval: {
    submit(input: ProposalSubmitInput): Promise<Proposal>;
    resolve(
      id: string,
      input: ProposalResolveInput
    ): Promise<{
      proposal: Proposal;
      sync: ProposalSyncSnapshot;
    }>;
    list(filter?: ProposalListFilter): Promise<Proposal[]>;
    get(id: string): Promise<Proposal | null>;
    onEvent(
      cb: (event: { type: string; proposal: Proposal; snapshot: ProposalSyncSnapshot }) => void
    ): () => void;
  };
  inbox: {
    emitMessage(input: InboxMessageInput): Promise<InboxItem>;
    emitCapture(input: InboxCaptureInput): Promise<InboxItem>;
    list(filter?: InboxListFilter): Promise<InboxListResult>;
    get(id: string): Promise<InboxItem | null>;
    resolve(
      id: string,
      input?: InboxResolveInput
    ): Promise<{ item: InboxItem; proposal?: Proposal | null }>;
    dismiss(
      id: string,
      input?: InboxDismissInput
    ): Promise<{ item: InboxItem; proposal?: Proposal | null }>;
    archive(id: string): Promise<InboxItem>;
    onEvent(cb: (event: InboxEvent) => void): () => void;
  };
  capture: {
    feed: {
      listSubscriptions(): Promise<FeedSubscription[]>;
      addSubscription(input: AddFeedSubscriptionInput): Promise<FeedSubscription>;
      removeSubscription(id: string): Promise<FeedSubscription | null>;
      refresh(subscriptionId?: string): Promise<FeedRefreshResult[]>;
      listPending(): Promise<InboxItem[]>;
      fadeOut(id: string): Promise<InboxItem>;
      saveToLibrary(id: string, input?: SaveFeedItemInput): Promise<InboxItem>;
      history(): Promise<InboxItem[]>;
    };
    library: {
      save(input: SaveLibraryArticleInput): Promise<InboxItem>;
      list(status?: InboxItem['status']): Promise<InboxItem[]>;
      get(id: string): Promise<InboxItem | null>;
      readContent(id: string): Promise<string>;
      updateReading(id: string, input: LibraryReadingUpdateInput): Promise<InboxItem>;
      promote(id: string, input?: PromoteLibraryArticleInput): Promise<PromoteResult>;
      dismiss(id: string, actor?: 'user' | 'agent'): Promise<InboxItem>;
    };
    thought: {
      create(input: CreateThoughtInput): Promise<InboxItem>;
      list(): Promise<InboxItem[]>;
      get(id: string): Promise<InboxItem | null>;
      update(id: string, input: UpdateThoughtInput): Promise<InboxItem>;
      promote(id: string, input?: PromoteThoughtInput): Promise<PromoteResult>;
      link(id: string, input: LinkThoughtInput): Promise<InboxItem>;
      dismiss(id: string, actor?: 'user' | 'agent'): Promise<InboxItem>;
    };
  };
  quickCapture: {
    onOpen(cb: () => void): () => void;
  };
  terminal: {
    open(args: TerminalOpenArgsDTO): Promise<TerminalSessionInfoDTO>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    list(): Promise<TerminalSessionInfoDTO[]>;
    onData(cb: (ev: TerminalDataEventDTO) => void): () => void;
    onExit(cb: (ev: TerminalExitEventDTO) => void): () => void;
  };
  terminalAgent: {
    list(projectUid: string): Promise<TerminalAgentSessionDTO[]>;
    detail(projectUid: string, sessionId: string): Promise<TerminalAgentSessionDetailDTO | null>;
    onEvent(cb: (ev: TerminalAgentEventDTO) => void): () => void;
  };
  review: {
    generate(date?: string): Promise<DailyReviewDTO>;
    get(date?: string): Promise<DailyReviewDTO | null>;
    list(): Promise<JournalListItemDTO[]>;
  };
  autoRunner: {
    status(): Promise<AutoRunnerStatusDTO>;
    start(): Promise<AutoRunnerStatusDTO>;
    stop(): Promise<AutoRunnerStatusDTO>;
    onEvent(cb: (ev: { type: string; event: unknown }) => void): () => void;
  };
  envExt: {
    hasGhCli(): Promise<boolean>;
  };
  github: {
    getConnection(): Promise<GitHubConnection>;
    authenticate(): Promise<GitHubConnection>;
    listRepositories(args?: GitHubRepositoryListArgsDTO): Promise<GitHubWorkspaceRepository[]>;
    getProjectState(projectUid: string): Promise<GitHubProjectState>;
    getProjectDetails(projectUid: string): Promise<GitHubProjectDetails>;
    publishProject(args: PublishProjectToGitHubArgsDTO): Promise<GitHubProjectState>;
    importRepository(args: ImportGitHubRepositoryArgsDTO): Promise<ImportGitHubRepositoryResultDTO>;
    createPullRequest(args: CreateGitHubPullRequestArgsDTO): Promise<GitHubPullRequestSummary>;
    bindTaskIssue(args: GitHubTaskIssueBindingArgsDTO): Promise<GitHubTaskBinding>;
    unbindTaskIssue(taskPath: string): Promise<void>;
  };
  area: {
    list(): Promise<AreaSummaryDTO[]>;
    create(args: CreateAreaArgsDTO): Promise<CreateAreaResultDTO>;
    getConfig(areaPath: string): Promise<AreaConfigDTO>;
    setConfig(areaPath: string, patch: Partial<AreaConfigDTO>): Promise<AreaConfigDTO>;
  };
  vaultConfig: {
    get(): Promise<VaultExtConfigDTO>;
    update(patch: Partial<VaultExtConfigDTO>): Promise<VaultExtConfigDTO>;
    inspect(): Promise<ExternalNotesPathInfoDTO[]>;
    linkDirectory(): Promise<VaultExtConfigDTO | null>;
    unlinkDirectory(path: string): Promise<VaultExtConfigDTO>;
    importDirectory(): Promise<ImportNotesResultDTO | null>;
  };
}
