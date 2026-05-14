import type { AgentEvent } from './agent';
import type { TaskStatus } from './schemas';

export const TASK_ORIGINS = ['human', 'agent', 'system', 'imported'] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];

export const TASK_OWNER_TYPES = ['agent', 'binding', 'human'] as const;
export type TaskOwnerType = (typeof TASK_OWNER_TYPES)[number];

export const RUNTIME_PROVIDERS = [
  'claude',
  'codex',
  'copilot',
  'gemini',
  'opencode',
  'custom'
] as const;
export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];

export const RUNTIME_STATUSES = ['online', 'offline', 'degraded'] as const;
export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

export const DISPATCH_MODES = ['manual-only', 'suggested', 'autonomous'] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

export const BINDING_HEALTH_STATUSES = ['healthy', 'degraded', 'paused', 'blocked'] as const;
export type BindingHealth = (typeof BINDING_HEALTH_STATUSES)[number];

export const LEASE_STATUSES = [
  'claimed',
  'running',
  'needs_attention',
  'released',
  'completed',
  'failed'
] as const;
export type TaskLeaseStatus = (typeof LEASE_STATUSES)[number];

export const PROPOSAL_STATUSES = ['draft', 'accepted', 'rejected', 'published'] as const;
export type PlanProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const IMPLEMENTATION_REPORT_STATUSES = [
  'running',
  'completed',
  'needs_attention',
  'failed',
  'released'
] as const;
export type ImplementationReportStatus = (typeof IMPLEMENTATION_REPORT_STATUSES)[number];

export const PLANNER_AGENT_IDS = ['plan-agent', 'architect-agent', 'executor-agent'] as const;
export type PlannerAgentId = (typeof PLANNER_AGENT_IDS)[number];

export interface RuntimeModelOption {
  id: string;
  label: string;
  description?: string;
}

export interface RuntimeDescriptor {
  runtimeId: string;
  mode: 'local';
  provider: RuntimeProvider;
  name: string;
  binaryPath: string;
  version: string | null;
  status: RuntimeStatus;
  discoveredAt: string;
  lastSeenAt: string;
  capabilities: {
    supportsResume: boolean;
    supportsHooks: boolean;
    supportsWorktree: boolean;
    supportsBackgroundRuns: boolean;
    supportsLongContext?: boolean;
  };
  limits: {
    maxConcurrentRuns: number;
  };
  defaultModel?: string | null;
  modelOptions?: RuntimeModelOption[];
  activeRunIds?: string[];
  metadata?: Record<string, string>;
}

export interface RuntimeRegistrySnapshot {
  refreshedAt: string;
  runtimes: RuntimeDescriptor[];
}

export interface RoleTemplate {
  id: string;
  slug: string;
  name: string;
  kind: 'builtin' | 'custom';
  latestVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  instructions: string;
  skillRefs: string[];
  modelPreference?: string;
  providerPreferences?: RuntimeProvider[];
  defaultConcurrency: number;
  defaultDispatchMode: DispatchMode;
  allowAutonomous: boolean;
  outputStyle?: string;
  changeSummary?: string;
  createdAt: string;
}

export interface ProjectRoleBinding {
  id: string;
  projectUid: string;
  templateId: string;
  templateVersionId: string;
  overlayInstructions?: string;
  enabledSkillRefs?: string[];
  disabledSkillRefs?: string[];
  runtimePreference?: string;
  modelPreference?: string;
  concurrencyOverride?: number;
  dispatchMode: DispatchMode;
  health: BindingHealth;
  taskFilter?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLease {
  leaseId: string;
  taskId: string;
  taskUid?: string;
  runtimeId: string;
  bindingId?: string;
  agentId?: string;
  ownerType: TaskOwnerType;
  ownerId: string;
  status: TaskLeaseStatus;
  claimedAt: string;
  lastHeartbeatAt?: string;
  runId?: string;
  reportId?: string;
  releaseReason?: string;
  failureReason?: string;
}

export type BindingLease = TaskLease;

export interface PlanProposalNode {
  taskUid: string;
  title: string;
  description?: string;
  status?: Extract<TaskStatus, 'backlog' | 'waiting' | 'todo' | 'doing' | 'blocked' | 'done'>;
  executionStrategy?: 'manual' | 'autonomous';
  recommendedOwnerType?: TaskOwnerType | 'either';
  recommendedRole?: string;
  candidateRoleSlugs?: string[];
  parentTaskUid?: string;
  generatedFromTaskUid?: string;
  preConditions?: string[];
  dependsOn?: string[];
  derivedFrom?: string;
  priority?: 'low' | 'med' | 'high';
  due?: string;
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl' | number;
  tags?: string[];
  position?: {
    x: number;
    y: number;
  };
}

export interface PlanProposalEdge {
  id: string;
  fromTaskUid: string;
  toTaskUid: string;
  kind: 'depends_on' | 'blocks' | 'parent_child';
}

export interface PlanProposal {
  proposalId: string;
  projectUid: string;
  version: number;
  title: string;
  summary: string;
  status: PlanProposalStatus;
  createdAt: string;
  updatedAt: string;
  source: 'human' | 'planner';
  nodes: PlanProposalNode[];
  edges: PlanProposalEdge[];
  inputSummary?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  publishedAt?: string;
}

export interface PlannerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  agentId?: PlannerAgentId;
  content: string;
}

export interface PlannerChatReply {
  runId: string;
  agentId: PlannerAgentId;
  message: string;
}

export interface PlannerProposalReply extends PlannerChatReply {
  proposal: PlanProposal;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  segmentId?: string;
  createdAt: string;
}

export type AgentSessionStatus =
  | 'idle'
  | 'launching'
  | 'running'
  | 'awaiting_user'
  | 'completed'
  | 'failed_retryable'
  | 'failed_terminal';

export interface RunSegment {
  id: string;
  taskId: string;
  runId: string;
  leaseId?: string;
  bindingId?: string;
  runtimeId?: string;
  vendorSessionId?: string;
  trigger: 'dispatch' | 'manual';
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'needs_attention';
  sessionStatus?: AgentSessionStatus;
  summary?: string;
  events?: AgentEvent[];
  startedAt: string;
  endedAt?: string;
}

export interface TaskConversation {
  taskId: string;
  taskUid: string;
  projectUid?: string;
  segments: RunSegment[];
  turns: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanPublishResult {
  proposalId: string;
  projectUid: string;
  createdTaskUids: string[];
  updatedTaskUids: string[];
  unchangedTaskUids: string[];
  waitingTaskUids: string[];
  todoTaskUids: string[];
  publishedAt: string;
}

export interface ImplementationReport {
  reportId: string;
  projectUid?: string;
  taskId: string;
  taskUid?: string;
  title: string;
  bindingId?: string;
  runtimeId?: string;
  runId?: string;
  status: ImplementationReportStatus;
  summary: string;
  direction?: string;
  details: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface DispatchSnapshot {
  refreshedAt: string;
  runtimes: RuntimeDescriptor[];
  templates: RoleTemplate[];
  templateVersions: RoleTemplateVersion[];
  bindings: ProjectRoleBinding[];
  leases: TaskLease[];
  reports: ImplementationReport[];
}
