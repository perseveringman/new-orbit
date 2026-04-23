import type {
  AppSettings,
  BacklinkItem,
  CreateFileResult,
  DiagnosticsInfo,
  FileNode,
  FsEvent,
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
  StartTaskArgs,
  StartTaskResult,
  TailQuery
} from './agent';
import type { BudgetSettings } from './schemas';
import type {
  CheckReport,
  DiffResult,
  EnvQueueStatus,
  GitStatusSummary,
  InstallResult,
  MergeResult,
  MergeStrategy,
  ResetAllResult,
  WorktreeRecord
} from './git';
import type {
  GitHubCheckSummary,
  GitHubConnection,
  GitHubIssueSummary,
  GitHubProjectDetails,
  GitHubPullRequestSummary,
  GitHubProjectState,
  GitHubRepoBinding,
  GitHubRepoVisibility,
  GitHubTaskBinding,
  GitHubWorkspaceRepository,
  NightShiftGitHubOptions
} from './github';

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
    event: 'fs:event'
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
    listTemplates: 'project:listTemplates',
    ensureMcpConfig: 'project:ensureMcpConfig'
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
    mergeGhost: 'git:mergeGhost'
  },
  env: {
    status: 'env:status',
    event: 'env:event'
  },
  agent: {
    detect: 'agent:detect',
    startTask: 'agent:startTask',
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
  nightShift: {
    start: 'nightShift:start',
    cancel: 'nightShift:cancel',
    status: 'nightShift:status',
    list: 'nightShift:list',
    progress: 'nightShift:progress',
    done: 'nightShift:done'
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
    update: 'vaultConfig:update'
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
  exposeMcpBridge?: boolean;
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

export interface EnsureMcpConfigResultDTO {
  uid: string;
  slug: string;
  configPath: string;
  written: boolean;
  mcpServerPath: string;
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
  project_uid: string;
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

export type NightShiftTaskPhase =
  | 'pending'
  | 'worktree'
  | 'running'
  | 'pre-merge'
  | 'pr'
  | 'done'
  | 'blocked'
  | 'cancelled';

export interface NightShiftTaskStatusDTO {
  taskUid: string;
  title: string;
  projectUid: string;
  phase: NightShiftTaskPhase;
  detail?: string;
  branch?: string;
  prUrl?: string;
  prNumber?: number;
  issueNumber?: number;
  checks?: GitHubCheckSummary[];
  startedAt?: string;
  endedAt?: string;
}

export interface NightShiftRunDTO {
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  concurrency: number;
  createPR: boolean;
  tasks: NightShiftTaskStatusDTO[];
  summary?: { done: number; blocked: number; cancelled: number };
}

export interface NightShiftPlanDTO {
  taskUids: string[];
  concurrency?: number;
  createPR?: boolean;
  github?: NightShiftGitHubOptions;
}

export interface NightShiftProgressEventDTO {
  runId: string;
  taskUid: string;
  phase: NightShiftTaskPhase;
  detail?: string;
}

export interface NightShiftDoneEventDTO {
  runId: string;
  summary: { done: number; blocked: number; cancelled: number };
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
    ensureMcpConfig(uid: string): Promise<EnsureMcpConfigResultDTO>;
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
  };
  env: {
    status(): Promise<EnvQueueStatus>;
    onEvent(cb: (s: EnvQueueStatus) => void): () => void;
  };
  agent: {
    detect(): Promise<DetectResult>;
    startTask(args: StartTaskArgs): Promise<StartTaskResult>;
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
  nightShift: {
    start(plan: NightShiftPlanDTO): Promise<{ runId: string }>;
    cancel(runId: string): Promise<void>;
    status(runId: string): Promise<NightShiftRunDTO | null>;
    list(): Promise<NightShiftRunDTO[]>;
    onProgress(cb: (ev: NightShiftProgressEventDTO) => void): () => void;
    onDone(cb: (ev: NightShiftDoneEventDTO) => void): () => void;
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
  };
}
