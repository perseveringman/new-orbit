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
import type { AgentToolRegistrySnapshot } from './agent-tools';
import type {
  Conversation as ChatConversation,
  ConversationAnchor as ChatConversationAnchor,
  ConversationScope as ChatConversationScope,
  ConversationMeta as ChatConversationMeta,
  ConversationTurn as ChatConversationTurn,
  ConversationTurnRole as ChatConversationTurnRole
} from './conversation';

export interface ChatCreateConversationInput {
  anchor: ChatConversationAnchor;
  scope?: ChatConversationScope;
  runtimeHint?: string;
  title?: string;
}

export interface ChatAppendTurnInput {
  conversationId: string;
  role: ChatConversationTurnRole;
  content: string;
  runtimeEventIds?: string[];
  artifactRefs?: string[];
}

export interface ChatUpdateConversationInput {
  title?: string;
  summary?: string;
  tags?: string[];
  archived?: boolean;
  scope?: ChatConversationScope;
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
  CaptureAttachmentInput,
  CaptureAttachment,
  CreateCaptureLinkInput,
  CreateCaptureLinkResult,
  CreateCaptureNoteInput,
  CreateCaptureNoteResult,
  CreateCaptureTaskInput,
  CreateCaptureTaskResult,
  CreateThoughtInput,
  FeedRefreshResult,
  FeedSubscription,
  LibraryReadingUpdateInput,
  LinkThoughtInput,
  PromoteLibraryArticleInput,
  PromoteResult,
  PromoteThoughtInput,
  QuickCaptureSuggestDraftInput,
  QuickCaptureSuggestDraftResult,
  SaveFeedItemInput,
  SaveLibraryArticleInput,
  UpdateThoughtInput
} from './capture';
import type {
  CreateNoteInput,
  Note,
  NoteChangeEvent,
  NoteFilter,
  NoteQueueFilter,
  NoteQueueItem,
  NoteSuggestionAcceptInput,
  NoteSuggestionAcceptResult,
  NoteWorkbench,
  NoteWorkbenchInput,
  SearchOptions,
  UpdateNoteInput
} from './note';
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
} from './library';
import type {
  CreateFeedSourceInput,
  FeedAiSubtitleTranslationInput,
  FeedAiSubtitleTranslationResult,
  FeedClusterPayload,
  FeedDigestPayload,
  FeedFetchResult,
  FeedFetchRun,
  FeedItem,
  FeedItemContent,
  FeedItemFilter,
  FeedReportPayload,
  FeedSource,
  FeedSynthesisResult,
  SaveFeedToLibraryInput,
  SaveFeedToLibraryResult,
  UpdateFeedSourceInput
} from './feed';
import type {
  ActivateKnowledgeBaseInput,
  ImportKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseSearchHit,
  OnboardingStatus,
  WelcomeAnalysisResult
} from './knowledge-base';
import type {
  CreateScheduledTaskInput,
  NaturalLanguageScheduleResult,
  ScheduledTask,
  ScheduledTaskExecution,
  ScheduledTaskFilter
} from './scheduled-task';
import type { DailySummary, DailyTimeline, MonthlyIndex, TimelineExportResult, TimelineScope, WeeklyTimeline, YearlyIndex } from './timeline';
import type { Artifact, ConversationStage } from './stage';
import type {
  CreateResourceFromSuggestionInput,
  CreateResourceInput,
  LinkResourceRefInput,
  PromoteResourceRefInput,
  Resource,
  ResourceChangeEvent,
  ResourceEngagement,
  ResourceEngagementInput,
  ResourceFilter,
  ResourceSuggestion,
  ResourceSuggestionOptions,
  ResourceSummary,
  UpdateResourceInput
} from './resource';
import type {
  ChannelConfig,
  ChannelInboundMessage,
  ChannelOutboundMessage,
  GatewayConfig,
  GatewayMessage,
  GatewayRouteResult,
  GatewayStatus
} from './gateway';
import type {
  ExternalGatewayConfig,
  ExternalGatewayPushSubscription,
  ExternalGatewayRequestLogEntry,
  ExternalGatewaySessionMapping,
  ExternalGatewayStatus
} from './external-gateway';
import type {
  AreaAssignmentInput,
  AreaAssignmentSuggestion,
  AreaChangeEvent,
  AreaConfig,
  AreaDashboardData,
  AreaEntityRef,
  AreaStatus,
  AreaUnassignmentInput
} from './area';
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
import type {
  RuntimeRouteDecision,
  RuntimeRouteInput,
  SDKEndpointDefaults,
  SDKEndpointInput,
  SDKEndpointRegistrySnapshot,
  SDKEndpointTestResult,
  SDKEndpointView
} from './runtime';
import type {
  ApplyUserEditInput,
  EnsureSynthesisInput,
  SynthesisArtifact,
  SynthesisFilter
} from './synthesis';
import type {
  AddAssetPinInput,
  AddAssetScopeInput,
  AssetHealthResult,
  AssetManifest,
  AssetPin,
  AssetScanOptions,
  AssetScanResult,
  AssetScope,
  AssetScopeStats,
  UpdateAssetScopeInput
} from './assets';
import type { SpaceContextBundle, SpaceContextOptions, SpaceSummary, SpaceType } from './space';
import type {
  SearchAnswerResponse,
  SearchQuery,
  SearchResponse,
  SemanticDocument,
  SemanticIndexStatus
} from './semantic';
import type {
  EvidenceReadResult,
  EvidenceSelector,
  EvidenceSource,
  EvidenceSourceFilter
} from './evidence';
import type {
  CreateMemoryInput,
  MemoryCluster,
  MemoryDigestResult,
  MemoryFilter,
  MemoryGraph,
  MemoryNode,
  PromoteMemoryToProjectResult,
  PromoteMemoryToResourceResult,
  RecallOptions,
  RecallResult,
  RecallStats,
  UpdateMemoryInput
} from './memory';
import type {
  ReviewAction,
  ReviewFilter,
  ReviewKind,
  ReviewRun,
  ReviewRunDetail
} from './review';
import type {
  CreateGoalInput,
  UpdateGoalInput,
  VisionAlignmentMap,
  VisionDriftWarning,
  VisionGoal,
  VisionGoalDetail,
  VisionHorizon,
  VisionMilestone,
  VisionReview
} from './vision';

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
    linkExisting: 'project:linkExisting',
    scaffoldNew: 'project:scaffoldNew',
    relinkWorkdir: 'project:relinkWorkdir',
    migrateWorkdir: 'project:migrateWorkdir',
    probeWorkdir: 'project:probeWorkdir',
    chooseDirectory: 'project:chooseDirectory',
    list: 'project:list',
    archive: 'project:archive',
    getTasks: 'project:getTasks',
    listTemplates: 'project:listTemplates'
  },
  assets: {
    manifestGet: 'assets:manifest:get',
    scopeAdd: 'assets:scope:add',
    scopeUpdate: 'assets:scope:update',
    scopeRemove: 'assets:scope:remove',
    scopeScan: 'assets:scope:scan',
    scopeStat: 'assets:scope:stat',
    pinAdd: 'assets:pin:add',
    pinRemove: 'assets:pin:remove',
    read: 'assets:read',
    healthCheck: 'assets:health:check'
  },
  space: {
    context: 'space:context',
    list: 'space:list',
    get: 'space:get'
  },
  runtime: {
    list: 'runtime:list',
    refresh: 'runtime:refresh',
    get: 'runtime:get',
    event: 'runtime:event',
    sdk: {
      snapshot: 'runtime:sdk:snapshot',
      upsertEndpoint: 'runtime:sdk:endpoint:upsert',
      deleteEndpoint: 'runtime:sdk:endpoint:delete',
      setApiKey: 'runtime:sdk:key:set',
      deleteApiKey: 'runtime:sdk:key:delete',
      setDefaults: 'runtime:sdk:defaults:set',
      testEndpoint: 'runtime:sdk:endpoint:test',
      decide: 'runtime:sdk:decide'
    }
  },
  tools: {
    snapshot: 'tools:snapshot'
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
    conversationUpdate: 'chat:conversation:update',
    conversationArchive: 'chat:conversation:archive',
    conversationAppendTurn: 'chat:conversation:appendTurn',
    conversationFindByAnchor: 'chat:conversation:findByAnchor',
    conversationLastActive: 'chat:conversation:lastActive',
    conversationSetLastActive: 'chat:conversation:setLastActive'
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
    update: 'vision:update',
    listGoals: 'vision:listGoals',
    getGoal: 'vision:getGoal',
    createGoal: 'vision:createGoal',
    updateGoal: 'vision:updateGoal',
    completeMilestone: 'vision:completeMilestone',
    getAlignment: 'vision:getAlignment',
    detectDrift: 'vision:detectDrift',
    triggerReview: 'vision:triggerReview'
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
    },
    quick: {
      saveAttachment: 'capture:quick:attachment:save',
      suggestDraft: 'capture:quick:suggestDraft',
      createNote: 'capture:quick:note:create',
      createLink: 'capture:quick:link:create',
      createTask: 'capture:quick:task:create'
    }
  },
  feeds: {
    sourcesList: 'feeds:sources:list',
    sourcesCreate: 'feeds:sources:create',
    sourcesUpdate: 'feeds:sources:update',
    sourcesDelete: 'feeds:sources:delete',
    fetch: 'feeds:fetch',
    runsList: 'feeds:runs:list',
    itemsList: 'feeds:items:list',
    itemsContent: 'feeds:items:content',
    itemsMarkSeen: 'feeds:items:markSeen',
    itemsIgnore: 'feeds:items:ignore',
    itemsSaveToLibrary: 'feeds:items:saveToLibrary',
    itemsAttachAiSubtitleTranslation: 'feeds:items:attachAiSubtitleTranslation',
    digest: 'feeds:digest',
    cluster: 'feeds:cluster',
    report: 'feeds:report'
  },
  notes: {
    list: 'notes:list',
    get: 'notes:get',
    getByPath: 'notes:getByPath',
    queue: 'notes:queue',
    workbench: 'notes:workbench',
    acceptSuggestion: 'notes:suggestion:accept',
    dismissSuggestion: 'notes:suggestion:dismiss',
    create: 'notes:create',
    update: 'notes:update',
    delete: 'notes:delete',
    archive: 'notes:archive',
    search: 'notes:search',
    event: 'notes:event'
  },
  library: {
    save: 'library:save',
    list: 'library:list',
    get: 'library:get',
    update: 'library:update',
    annotate: 'library:annotate',
    markRead: 'library:markRead',
    archive: 'library:archive',
    distill: 'library:distill',
    acceptDistillation: 'library:acceptDistillation'
  },
  knowledgeBase: {
    list: 'knowledgeBase:list',
    import: 'knowledgeBase:import',
    remove: 'knowledgeBase:remove',
    rescan: 'knowledgeBase:rescan',
    search: 'knowledgeBase:search',
    activate: 'knowledgeBase:activate'
  },
  onboarding: {
    status: 'onboarding:status',
    skip: 'onboarding:skip',
    runWelcomeAnalysis: 'onboarding:runWelcomeAnalysis',
    applySuggestions: 'onboarding:applySuggestions'
  },
  scheduledTasks: {
    list: 'scheduledTasks:list',
    get: 'scheduledTasks:get',
    create: 'scheduledTasks:create',
    update: 'scheduledTasks:update',
    delete: 'scheduledTasks:delete',
    pause: 'scheduledTasks:pause',
    resume: 'scheduledTasks:resume',
    enable: 'scheduledTasks:enable',
    disable: 'scheduledTasks:disable',
    triggerNow: 'scheduledTasks:triggerNow',
    runNow: 'scheduledTasks:runNow',
    executions: 'scheduledTasks:executions',
    getExecutions: 'scheduledTasks:getExecutions',
    parseNaturalLanguage: 'scheduledTasks:parseNaturalLanguage',
    event: 'scheduledTasks:event'
  },
  timeline: {
    getDay: 'timeline:getDay',
    getWeek: 'timeline:getWeek',
    getMonth: 'timeline:getMonth',
    getYear: 'timeline:getYear',
    getMonthlyIndex: 'timeline:getMonthlyIndex',
    getYearlyIndex: 'timeline:getYearlyIndex',
    generateDailySummary: 'timeline:generateDailySummary',
    updateDailySummary: 'timeline:updateDailySummary',
    exportPDF: 'timeline:exportPDF',
    event: 'timeline:event'
  },
  synthesis: {
    get: 'synthesis:get',
    getArtifact: 'synthesis:getArtifact',
    getMany: 'synthesis:getMany',
    list: 'synthesis:list',
    ensure: 'synthesis:ensure',
    recompute: 'synthesis:recompute',
    markStale: 'synthesis:markStale',
    applyUserEdit: 'synthesis:applyUserEdit'
  },
  semantic: {
    search: 'semantic:search',
    getDocument: 'semantic:getDocument',
    indexStatus: 'semantic:indexStatus',
    rebuildIndex: 'semantic:rebuildIndex',
    searchAndAnswer: 'semantic:searchAndAnswer',
    event: 'semantic:event'
  },
  evidence: {
    list: 'evidence:list',
    get: 'evidence:get',
    read: 'evidence:read',
    sync: 'evidence:sync'
  },
  memory: {
    list: 'memory:list',
    get: 'memory:get',
    create: 'memory:create',
    update: 'memory:update',
    archive: 'memory:archive',
    merge: 'memory:merge',
    promoteToResource: 'memory:promoteToResource',
    promoteToProject: 'memory:promoteToProject',
    recall: 'memory:recall',
    recallStats: 'memory:recallStats',
    clusters: 'memory:clusters',
    graph: 'memory:graph',
    feedback: 'memory:feedback',
    generateDigest: 'memory:generateDigest',
    event: 'memory:event'
  },
  stage: {
    get: 'stage:get',
    addArtifact: 'stage:addArtifact',
    execAction: 'stage:execAction',
    removeArtifact: 'stage:removeArtifact',
    event: 'stage:event'
  },
  gateway: {
    configGet: 'gateway:config:get',
    configUpdate: 'gateway:config:update',
    status: 'gateway:status',
    getStatus: 'gateway:getStatus',
    start: 'gateway:start',
    startDaemon: 'gateway:daemon:start',
    stop: 'gateway:stop',
    stopDaemon: 'gateway:daemon:stop',
    setVaultPath: 'gateway:daemon:setVaultPath',
    listChannels: 'gateway:channels:list',
    addChannel: 'gateway:channel:add',
    updateChannel: 'gateway:channel:update',
    enableChannel: 'gateway:channel:enable',
    disableChannel: 'gateway:channel:disable',
    removeChannel: 'gateway:channel:remove',
    generateBindCode: 'gateway:channel:generateBindCode',
    getMessages: 'gateway:messages:get',
    sendOutbound: 'gateway:outbound:send',
    routeInbound: 'gateway:routeInbound',
    event: 'gateway:event'
  },
  externalGateway: {
    configGet: 'externalGateway:config:get',
    configUpdate: 'externalGateway:config:update',
    status: 'externalGateway:status',
    start: 'externalGateway:start',
    stop: 'externalGateway:stop',
    sessions: 'externalGateway:sessions',
    requestLog: 'externalGateway:requestLog',
    subscriptions: 'externalGateway:subscriptions',
    upsertSubscription: 'externalGateway:subscription:upsert',
    event: 'externalGateway:event'
  },
  resources: {
    list: 'resources:list',
    get: 'resources:get',
    create: 'resources:create',
    update: 'resources:update',
    archive: 'resources:archive',
    linkRef: 'resources:linkRef',
    unlinkRef: 'resources:unlinkRef',
    promoteRef: 'resources:promoteRef',
    engage: 'resources:engage',
    suggestFromNotes: 'resources:suggestFromNotes',
    createFromSuggestion: 'resources:createFromSuggestion',
    event: 'resources:event'
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
    list: 'review:list',
    listRuns: 'review:listRuns',
    getRun: 'review:getRun',
    triggerReview: 'review:triggerReview',
    acknowledge: 'review:acknowledge',
    executeAction: 'review:executeAction',
    archiveRun: 'review:archiveRun'
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
    get: 'area:get',
    create: 'area:create',
    update: 'area:update',
    archive: 'area:archive',
    getConfig: 'area:getConfig',
    setConfig: 'area:setConfig',
    dashboard: 'area:dashboard',
    assign: 'area:assign',
    unassign: 'area:unassign',
    suggestAssignments: 'area:suggestAssignments',
    event: 'area:event'
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
  area_slugs?: string[];
  path: string;
  coordinationPath: string;
  workdirPath: string;
  workdirMissing?: boolean;
  readmePath: string;
  relPath: string;
  legacy: boolean;
  github?: GitHubRepoBinding;
  git?: ProjectGitInfoDTO;
  workdir?: ProjectWorkdirRefDTO;
  execution_context?: ProjectExecutionContextDTO;
  vendor_bridge_files?: boolean;
}

export type ProjectExecutionContextDTO = 'worktree' | 'direct' | 'sandbox';
export type ProjectLinkedViaDTO =
  | 'link-existing'
  | 'scaffold-new'
  | 'legacy-in-vault'
  | 'migrated-from-vault';

export interface ProjectWorkdirPermissionsDTO {
  agent_write: boolean;
  auto_runner: boolean;
}

export interface ProjectWorkdirRefDTO {
  path: string;
  kind: 'local';
  linked_at: string;
  linked_via: ProjectLinkedViaDTO;
  permissions: ProjectWorkdirPermissionsDTO;
}

export interface ProjectGitInfoDTO {
  is_repo: boolean;
  root_path?: string;
  default_branch?: string;
  remote_origin?: string;
  github_binding?: GitHubRepoBinding;
}

export interface ProjectWorkdirProbeDTO {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  hasCodeMarkers: boolean;
  markers: string[];
  packageManager?: string;
  git?: ProjectGitInfoDTO;
  recommendedExecutionContext: ProjectExecutionContextDTO;
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

export interface LinkExistingProjectArgsDTO {
  slug: string;
  name: string;
  workdirPath: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  execution_context?: ProjectExecutionContextDTO;
  vendor_bridge_files?: boolean;
}

export interface ScaffoldNewProjectArgsDTO {
  slug: string;
  name: string;
  parentDir: string;
  dirName?: string;
  template: string;
  description?: string;
  uid?: string;
  area_uid?: string;
  tags?: string[];
  initializeGit?: boolean;
  execution_context?: ProjectExecutionContextDTO;
  vendor_bridge_files?: boolean;
}

export interface RelinkProjectWorkdirArgsDTO {
  uid: string;
  workdirPath: string;
  execution_context?: ProjectExecutionContextDTO;
  vendor_bridge_files?: boolean;
}

export interface MigrateProjectWorkdirArgsDTO {
  uid: string;
  targetDir: string;
  removeCopiedFiles?: boolean;
  initializeGit?: boolean;
  execution_context?: ProjectExecutionContextDTO;
}

export interface CreateProjectResultDTO {
  projectPath: string;
  relPath: string;
  uid: string;
  slug: string;
}

export interface ProjectWorkdirMutationResultDTO extends CreateProjectResultDTO {
  workdirPath: string;
  copiedFiles?: string[];
  removedFiles?: string[];
  skippedFiles?: string[];
}

export interface ChooseDirectoryResultDTO {
  canceled: boolean;
  path?: string;
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
  targetDir?: string;
  agent_exposure?: AgentExposureSettingsDTO;
}

export interface ImportGitHubRepositoryResultDTO {
  projectPath: string;
  workdirPath: string;
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
  resource_uid?: string;
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
  description?: string;
  status: AreaStatus;
  template?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  path: string;
  relPath: string;
  hasVision: boolean;
}

export interface AreaConfigDTO extends AreaConfig {}

export interface CreateAreaArgsDTO {
  slug: string;
  name: string;
  description?: string;
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

export interface UpdateAreaArgsDTO {
  name?: string;
  description?: string;
  status?: AreaStatus;
  tags?: string[];
  vision_refs?: string[];
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
    linkExisting(args: LinkExistingProjectArgsDTO): Promise<CreateProjectResultDTO>;
    scaffoldNew(args: ScaffoldNewProjectArgsDTO): Promise<CreateProjectResultDTO>;
    relinkWorkdir(args: RelinkProjectWorkdirArgsDTO): Promise<ProjectWorkdirMutationResultDTO>;
    migrateWorkdir(args: MigrateProjectWorkdirArgsDTO): Promise<ProjectWorkdirMutationResultDTO>;
    probeWorkdir(path: string): Promise<ProjectWorkdirProbeDTO>;
    chooseDirectory(): Promise<ChooseDirectoryResultDTO>;
    list(): Promise<ProjectSummaryDTO[]>;
    archive(uid: string): Promise<ArchiveProjectResultDTO>;
    getTasks(uid: string): Promise<TaskRecord[]>;
    listTemplates(): Promise<TemplateMetaDTO[]>;
  };
  assets: {
    getManifest(projectUid: string): Promise<AssetManifest>;
    addScope(projectUid: string, input: AddAssetScopeInput): Promise<AssetScope>;
    updateScope(projectUid: string, scopeId: string, patch: UpdateAssetScopeInput): Promise<AssetScope>;
    removeScope(projectUid: string, scopeId: string): Promise<AssetManifest>;
    scanScope(projectUid: string, scopeId: string, options?: AssetScanOptions): Promise<AssetScanResult>;
    statScope(projectUid: string, scopeId: string): Promise<AssetScopeStats>;
    addPin(projectUid: string, input: AddAssetPinInput): Promise<AssetPin>;
    removePin(projectUid: string, pinId: string): Promise<AssetManifest>;
    read(projectUid: string, targetPath: string): Promise<{ path: string; content: string }>;
    healthCheck(projectUid: string): Promise<AssetHealthResult>;
  };
  space: {
    list(filter?: { type?: SpaceType }): Promise<SpaceSummary[]>;
    get(spaceId: string): Promise<SpaceSummary | null>;
    context(spaceId: string, options?: SpaceContextOptions): Promise<SpaceContextBundle>;
  };
  runtime: {
    list(): Promise<RuntimeDescriptor[]>;
    refresh(): Promise<RuntimeRegistrySnapshot>;
    get(runtimeId: string): Promise<RuntimeDescriptor | null>;
    onEvent(cb: (ev: RuntimeEventDTO) => void): () => void;
    sdk: {
      snapshot(): Promise<SDKEndpointRegistrySnapshot>;
      upsertEndpoint(input: SDKEndpointInput): Promise<SDKEndpointView>;
      deleteEndpoint(endpointId: string): Promise<void>;
      setApiKey(endpointId: string, apiKey: string): Promise<SDKEndpointView>;
      deleteApiKey(endpointId: string): Promise<SDKEndpointView>;
      setDefaults(defaults: SDKEndpointDefaults): Promise<SDKEndpointDefaults>;
      testEndpoint(
        endpointId: string,
        model?: string,
        prompt?: string
      ): Promise<SDKEndpointTestResult>;
      decide(input: RuntimeRouteInput): Promise<RuntimeRouteDecision>;
    };
  };
  tools: {
    snapshot(): Promise<AgentToolRegistrySnapshot>;
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
    updateConversation(id: string, patch: ChatUpdateConversationInput): Promise<ChatConversation | null>;
    archiveConversation(id: string): Promise<ChatConversation | null>;
    appendTurn(input: ChatAppendTurnInput): Promise<ChatConversationTurn>;
    findConversationsByAnchor(kind: string, refId: string): Promise<ChatConversationMeta[]>;
    getLastActiveConversation(scope: ChatConversationScope): Promise<ChatConversation | null>;
    setLastActiveConversation(scope: ChatConversationScope, id: string): Promise<void>;
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
    listGoals(horizon?: VisionHorizon): Promise<VisionGoal[]>;
    getGoal(id: string): Promise<VisionGoalDetail | null>;
    createGoal(input: CreateGoalInput): Promise<VisionGoal>;
    updateGoal(id: string, patch: UpdateGoalInput): Promise<VisionGoal>;
    completeMilestone(id: string): Promise<VisionMilestone>;
    getAlignment(): Promise<VisionAlignmentMap[]>;
    detectDrift(): Promise<VisionDriftWarning[]>;
    triggerReview(): Promise<VisionReview>;
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
    quick: {
      saveAttachment(input: CaptureAttachmentInput): Promise<CaptureAttachment>;
      suggestDraft(input: QuickCaptureSuggestDraftInput): Promise<QuickCaptureSuggestDraftResult>;
      createNote(input: CreateCaptureNoteInput): Promise<CreateCaptureNoteResult>;
      createLink(input: CreateCaptureLinkInput): Promise<CreateCaptureLinkResult>;
      createTask(input: CreateCaptureTaskInput): Promise<CreateCaptureTaskResult>;
    };
  };
  notes: {
    list(filter?: NoteFilter): Promise<Note[]>;
    get(noteId: string): Promise<Note | null>;
    getByPath(path: string): Promise<Note | null>;
    queue(filter?: NoteQueueFilter): Promise<NoteQueueItem[]>;
    workbench(input: NoteWorkbenchInput): Promise<NoteWorkbench>;
    acceptSuggestion(input: NoteSuggestionAcceptInput): Promise<NoteSuggestionAcceptResult>;
    dismissSuggestion(input: NoteSuggestionAcceptInput): Promise<NoteSuggestionAcceptResult>;
    create(input: CreateNoteInput): Promise<Note>;
    update(noteId: string, patch: UpdateNoteInput): Promise<Note>;
    delete(noteId: string): Promise<void>;
    archive(noteId: string): Promise<void>;
    search(query: string, options?: SearchOptions): Promise<Note[]>;
    onEvent(cb: (event: NoteChangeEvent) => void): () => void;
  };
  library: {
    save(input: SaveLibraryItemInput): Promise<LibraryItem>;
    list(filter?: LibraryFilter): Promise<LibraryItem[]>;
    get(id: string): Promise<LibraryItem | null>;
    update(id: string, patch: UpdateLibraryItemInput): Promise<LibraryItem>;
    annotate(id: string, input: AddLibraryAnnotationInput): Promise<LibraryItem>;
    markRead(id: string, input?: LibraryReadingUpdateInputV2): Promise<LibraryItem>;
    archive(id: string): Promise<LibraryItem>;
    distill(id: string): Promise<LibraryDistillationResult>;
    acceptDistillation(input: AcceptLibraryDistillationInput): Promise<LibraryAcceptDistillationResult>;
  };
  feeds: {
    listSources(): Promise<FeedSource[]>;
    createSource(input: CreateFeedSourceInput): Promise<FeedSource>;
    updateSource(id: string, patch: UpdateFeedSourceInput): Promise<FeedSource>;
    deleteSource(id: string): Promise<FeedSource | null>;
    fetch(sourceId?: string): Promise<FeedFetchResult[]>;
    listRuns(sourceId?: string): Promise<FeedFetchRun[]>;
    listItems(filter?: FeedItemFilter): Promise<FeedItem[]>;
    getItemContent(id: string): Promise<FeedItemContent>;
    markSeen(id: string): Promise<FeedItem>;
    ignore(id: string): Promise<FeedItem>;
    saveToLibrary(id: string, input?: SaveFeedToLibraryInput): Promise<SaveFeedToLibraryResult>;
    attachAiSubtitleTranslation(id: string, input: FeedAiSubtitleTranslationInput): Promise<FeedAiSubtitleTranslationResult>;
    digest(date: string): Promise<FeedSynthesisResult<FeedDigestPayload>>;
    cluster(scope?: string): Promise<FeedSynthesisResult<FeedClusterPayload>>;
    report(date: string): Promise<FeedSynthesisResult<FeedReportPayload>>;
  };
  knowledgeBase: {
    list(): Promise<KnowledgeBase[]>;
    import(input: ImportKnowledgeBaseInput): Promise<KnowledgeBase>;
    remove(kbId: string, deleteFiles?: boolean): Promise<void>;
    rescan(kbId: string): Promise<KnowledgeBase>;
    search(kbId: string | 'all', query: string): Promise<KnowledgeBaseSearchHit[]>;
    activate(input: ActivateKnowledgeBaseInput): Promise<Note>;
  };
  onboarding: {
    status(): Promise<OnboardingStatus>;
    skip(): Promise<void>;
    runWelcomeAnalysis(kbIds: string[]): Promise<WelcomeAnalysisResult>;
    applySuggestions(result: WelcomeAnalysisResult): Promise<void>;
  };
  scheduledTasks: {
    list(filter?: ScheduledTaskFilter): Promise<ScheduledTask[]>;
    get(taskId: string): Promise<ScheduledTask | null>;
    create(input: CreateScheduledTaskInput): Promise<ScheduledTask>;
    update(taskId: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask>;
    delete(taskId: string): Promise<void>;
    pause(taskId: string): Promise<ScheduledTask>;
    resume(taskId: string): Promise<ScheduledTask>;
    enable(taskId: string): Promise<ScheduledTask>;
    disable(taskId: string): Promise<ScheduledTask>;
    triggerNow(taskId: string): Promise<ScheduledTaskExecution>;
    runNow(taskId: string): Promise<ScheduledTaskExecution>;
    executions(taskId: string, limit?: number, offset?: number): Promise<ScheduledTaskExecution[]>;
    getExecutions(taskId: string, limit?: number, offset?: number): Promise<ScheduledTaskExecution[]>;
    parseNaturalLanguage(text: string): Promise<NaturalLanguageScheduleResult>;
    onEvent(cb: (event: { type: string; task?: ScheduledTask; execution?: ScheduledTaskExecution }) => void): () => void;
  };
  timeline: {
    getDay(date: string, options?: { developerMode?: boolean }): Promise<DailyTimeline>;
    getWeek(isoWeek: string): Promise<WeeklyTimeline>;
    getMonth(month: string): Promise<MonthlyIndex>;
    getYear(year: number): Promise<YearlyIndex>;
    getMonthlyIndex(month: string): Promise<MonthlyIndex>;
    getYearlyIndex(year: number): Promise<YearlyIndex>;
    generateDailySummary(date: string): Promise<DailySummary>;
    updateDailySummary(date: string, patch: { narrative?: string; headline?: string }): Promise<DailySummary>;
    exportPDF(scope: TimelineScope): Promise<TimelineExportResult>;
    onEvent(cb: (event: DailyTimeline) => void): () => void;
  };
  synthesis: {
    get(scopeKey: string): Promise<SynthesisArtifact | null>;
    getArtifact(artifactId: string): Promise<SynthesisArtifact | null>;
    getMany(scopeKeys: string[]): Promise<Record<string, SynthesisArtifact | null>>;
    list(filter?: SynthesisFilter): Promise<SynthesisArtifact[]>;
    ensure(input: EnsureSynthesisInput): Promise<SynthesisArtifact>;
    recompute(scopeKey: string, options?: { force?: boolean }): Promise<SynthesisArtifact>;
    markStale(scopeKey: string, reason?: string): Promise<SynthesisArtifact | null>;
    applyUserEdit(input: ApplyUserEditInput): Promise<SynthesisArtifact>;
  };
  semantic: {
    search(query: SearchQuery): Promise<SearchResponse>;
    getDocument(docId: string): Promise<SemanticDocument>;
    indexStatus(): Promise<SemanticIndexStatus>;
    rebuildIndex(): Promise<SemanticIndexStatus>;
    searchAndAnswer(query: SearchQuery): Promise<SearchAnswerResponse>;
    onEvent(cb: (event: { type: string; status?: SemanticIndexStatus }) => void): () => void;
  };
  evidence: {
    list(filter?: EvidenceSourceFilter): Promise<EvidenceSource[]>;
    get(sourceId: string): Promise<EvidenceSource | null>;
    read(selector: EvidenceSelector): Promise<EvidenceReadResult>;
    sync(options?: { includeExternalAISessions?: boolean; externalAISessionLimit?: number }): Promise<EvidenceSource[]>;
  };
  memory: {
    list(filter?: MemoryFilter): Promise<MemoryNode[]>;
    get(id: string): Promise<MemoryNode | null>;
    create(input: CreateMemoryInput): Promise<MemoryNode>;
    update(id: string, patch: UpdateMemoryInput): Promise<MemoryNode>;
    archive(id: string): Promise<void>;
    merge(fromId: string, toId: string): Promise<MemoryNode>;
    promoteToResource(id: string): Promise<PromoteMemoryToResourceResult>;
    promoteToProject(id: string): Promise<PromoteMemoryToProjectResult>;
    recall(query: string, options?: RecallOptions): Promise<RecallResult>;
    recallStats(id: string): Promise<RecallStats>;
    clusters(): Promise<MemoryCluster[]>;
    graph(filter?: MemoryFilter): Promise<MemoryGraph>;
    feedback(id: string, helpful: boolean): Promise<MemoryNode>;
    generateDigest(): Promise<MemoryDigestResult>;
    onEvent(cb: (event: { type: string; count?: number }) => void): () => void;
  };
  stage: {
    get(conversationId: string): Promise<ConversationStage>;
    addArtifact(conversationId: string, artifact: Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>): Promise<Artifact>;
    execAction(conversationId: string, artifactId: string, actionId: string, params?: unknown): Promise<void>;
    removeArtifact(conversationId: string, artifactId: string): Promise<void>;
    onEvent(cb: (stage: ConversationStage) => void): () => void;
  };
  gateway: {
    getConfig(): Promise<GatewayConfig>;
    updateConfig(patch: Partial<GatewayConfig>): Promise<GatewayConfig>;
    status(): Promise<GatewayStatus>;
    getStatus(): Promise<GatewayStatus>;
    start(): Promise<GatewayStatus>;
    startDaemon(): Promise<GatewayStatus>;
    stop(): Promise<GatewayStatus>;
    stopDaemon(): Promise<GatewayStatus>;
    setVaultPath(vaultPath: string): Promise<GatewayConfig>;
    listChannels(): Promise<ChannelConfig[]>;
    addChannel(channel: Omit<ChannelConfig, 'id'> & { id?: string }): Promise<GatewayConfig>;
    updateChannel(channelId: string, patch: Partial<ChannelConfig>): Promise<GatewayConfig>;
    enableChannel(channelId: string): Promise<GatewayConfig>;
    disableChannel(channelId: string): Promise<GatewayConfig>;
    removeChannel(channelId: string): Promise<GatewayConfig>;
    generateBindCode(orbitUserId?: string): Promise<{ code: string; expires_at: string }>;
    getMessages(limit?: number): Promise<GatewayMessage[]>;
    sendOutbound(message: ChannelOutboundMessage): Promise<GatewayRouteResult>;
    routeInbound(message: ChannelInboundMessage): Promise<GatewayRouteResult>;
    onEvent(cb: (status: GatewayStatus) => void): () => void;
  };
  externalGateway: {
    getConfig(): Promise<ExternalGatewayConfig>;
    updateConfig(patch: Partial<ExternalGatewayConfig>): Promise<ExternalGatewayConfig>;
    status(): Promise<ExternalGatewayStatus>;
    start(): Promise<ExternalGatewayStatus>;
    stop(): Promise<ExternalGatewayStatus>;
    listSessions(): Promise<ExternalGatewaySessionMapping[]>;
    listRequestLog(limit?: number): Promise<ExternalGatewayRequestLogEntry[]>;
    listSubscriptions(): Promise<ExternalGatewayPushSubscription[]>;
    upsertSubscription(
      input: Omit<ExternalGatewayPushSubscription, 'id' | 'createdAt'> & Partial<Pick<ExternalGatewayPushSubscription, 'id' | 'createdAt'>>
    ): Promise<ExternalGatewayPushSubscription>;
    onEvent(cb: (status: ExternalGatewayStatus) => void): () => void;
  };
  resources: {
    list(filter?: ResourceFilter): Promise<ResourceSummary[]>;
    get(resourceIdOrSlug: string): Promise<Resource | null>;
    create(input: CreateResourceInput): Promise<Resource>;
    update(resourceIdOrSlug: string, patch: UpdateResourceInput): Promise<Resource>;
    archive(resourceIdOrSlug: string): Promise<Resource>;
    linkRef(resourceIdOrSlug: string, input: LinkResourceRefInput): Promise<Resource>;
    unlinkRef(resourceIdOrSlug: string, refId: string): Promise<Resource>;
    promoteRef(resourceIdOrSlug: string, input: PromoteResourceRefInput): Promise<Resource>;
    engage(resourceIdOrSlug: string, input?: ResourceEngagementInput): Promise<ResourceEngagement>;
    suggestFromNotes(options?: ResourceSuggestionOptions): Promise<ResourceSuggestion[]>;
    createFromSuggestion(input: CreateResourceFromSuggestionInput): Promise<Resource>;
    onEvent(cb: (event: ResourceChangeEvent) => void): () => void;
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
    listRuns(filter?: ReviewFilter): Promise<ReviewRun[]>;
    getRun(id: string): Promise<ReviewRunDetail | null>;
    triggerReview(kind: ReviewKind, scopeRef?: string): Promise<ReviewRun>;
    acknowledge(findingId: string): Promise<void>;
    executeAction(actionId: string): Promise<ReviewAction>;
    archiveRun(id: string): Promise<void>;
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
    get(areaSlugOrUid: string): Promise<AreaConfigDTO | null>;
    create(args: CreateAreaArgsDTO): Promise<CreateAreaResultDTO>;
    update(areaSlugOrUid: string, patch: UpdateAreaArgsDTO): Promise<AreaConfigDTO>;
    archive(areaSlugOrUid: string): Promise<AreaConfigDTO>;
    getConfig(areaPath: string): Promise<AreaConfigDTO>;
    setConfig(areaPath: string, patch: Partial<AreaConfigDTO>): Promise<AreaConfigDTO>;
    dashboard(areaSlugOrUid: string): Promise<AreaDashboardData>;
    assign(input: AreaAssignmentInput): Promise<AreaConfigDTO | null>;
    unassign(input: AreaUnassignmentInput): Promise<AreaConfigDTO | null>;
    suggestAssignments(entity: AreaEntityRef): Promise<AreaAssignmentSuggestion[]>;
    onEvent(cb: (event: AreaChangeEvent) => void): () => void;
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
