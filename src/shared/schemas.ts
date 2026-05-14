import { z } from 'zod';
import type { TaskOrigin, TaskOwnerType } from './orchestration';

/**
 * PARA entity + task schemas. These live in the shared module so both the
 * main process (validation + migrations) and the renderer (views, forms) can
 * import them without duplication.
 */

export const PARA_ENTITY_TYPES = ['project', 'area', 'resource', 'archive'] as const;
export type ParaEntityType = (typeof PARA_ENTITY_TYPES)[number];

export const TASK_STATUSES = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const LEGACY_TASK_STATUSES = ['inbox', 'today'] as const;
export type LegacyTaskStatus = (typeof LEGACY_TASK_STATUSES)[number];
export const TASK_EXECUTION_MODES = ['human', 'assisted', 'agent', 'scheduled'] as const;
export type TaskExecutionMode = (typeof TASK_EXECUTION_MODES)[number];

export const PROJECT_STATUSES = ['active', 'paused', 'done', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const EFFORT_VALUES = ['xs', 's', 'm', 'l', 'xl'] as const;
export type Effort = (typeof EFFORT_VALUES)[number];

const KNOWN_TASK_STATUS_INPUTS = [...TASK_STATUSES, ...LEGACY_TASK_STATUSES] as const;

export function normalizeTaskStatus(value: unknown): TaskStatus | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'inbox') return 'backlog';
  if (value === 'today') return 'todo';
  if ((TASK_STATUSES as readonly string[]).includes(value)) return value as TaskStatus;
  return undefined;
}

export function normalizeTaskExecutionMode(value: unknown): TaskExecutionMode | undefined {
  if (typeof value !== 'string') return undefined;
  if ((TASK_EXECUTION_MODES as readonly string[]).includes(value)) return value as TaskExecutionMode;
  if (value === 'autonomous') return 'agent';
  if (value === 'manual') return 'human';
  return undefined;
}

export function taskExecutionMode(
  task: Pick<TaskRecord, 'execution_mode' | 'execution_strategy'>
): TaskExecutionMode {
  return task.execution_mode ?? (task.execution_strategy === 'autonomous' ? 'agent' : 'human');
}

export function isAgentClaimableTask(
  task: Pick<TaskRecord, 'execution_mode' | 'execution_strategy'>
): boolean {
  return taskExecutionMode(task) === 'agent';
}

export const ProjectFrontmatter = z.object({
  uid: z.string(),
  type: z.literal('project'),
  title: z.string(),
  status: z.enum(PROJECT_STATUSES),
  area_uid: z.string().optional(),
  started_at: z.string().optional(),
  due: z.string().optional(),
  tags: z.array(z.string()).optional()
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatter>;

export const AreaFrontmatter = z.object({
  uid: z.string(),
  type: z.literal('area'),
  title: z.string(),
  standard: z.string().optional(),
  tags: z.array(z.string()).optional()
});
export type AreaFrontmatter = z.infer<typeof AreaFrontmatter>;

export const ResourceFrontmatter = z.object({
  uid: z.string(),
  type: z.literal('resource'),
  title: z.string(),
  source_project_uid: z.string().optional(),
  tags: z.array(z.string()).optional()
});
export type ResourceFrontmatter = z.infer<typeof ResourceFrontmatter>;

export const ArchiveFrontmatter = z.object({
  uid: z.string(),
  type: z.literal('archive'),
  title: z.string(),
  archived_at: z.string(),
  original_type: z.enum(['project', 'area', 'resource']),
  tags: z.array(z.string()).optional()
});
export type ArchiveFrontmatter = z.infer<typeof ArchiveFrontmatter>;

export const TaskFrontmatter = z.object({
  uid: z.string(),
  type: z.literal('task'),
  title: z.string(),
  status: z.preprocess(
    (value) => normalizeTaskStatus(value) ?? value,
    z.enum(TASK_STATUSES)
  ),
  project_uid: z.string().optional(),
  area_uid: z.string().optional(),
  resource_uid: z.string().optional(),
  due: z.string().optional(),
  // R3: accept legacy xs/s/m/l/xl labels *or* a raw hour count so the
  // TaskEditor can surface a numeric "effort in hours" field without breaking
  // older task files.
  effort: z.union([z.enum(EFFORT_VALUES), z.number().nonnegative()]).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  agent_block_reason: z.string().optional(),
  // --- R3 additions (all optional — legacy tasks parse unchanged) ---
  git_branch: z.string().optional(),
  worktree_path: z.string().optional(),
  pr_url: z.string().optional(),
  github_issue_number: z.number().int().positive().optional(),
  github_issue_title: z.string().optional(),
  github_issue_url: z.string().optional(),
  execution_mode: z.enum(TASK_EXECUTION_MODES).optional(),
  execution_strategy: z.enum(['manual', 'autonomous']).optional(),
  origin: z.enum(['human', 'agent', 'system', 'imported']).optional(),
  created_by: z.string().default('user'),
  approved_by: z.string().nullable().default('user'),
  approved_at: z.string().nullable().default(null),
  proposed_by_agent_run: z.string().nullable().default(null),
  proposed_during_task: z.string().nullable().default(null),
  proposal_id: z.string().nullable().default(null),
  approval_decision_note: z.string().nullable().default(null),
  assigned_to: z.string().optional(),
  owner_type: z.enum(['agent', 'binding', 'human']).optional(),
  owner_id: z.string().optional(),
  claimed_at: z.string().optional(),
  active_run_id: z.string().optional(),
  parent_task_uid: z.string().optional(),
  generated_from_task_uid: z.string().optional(),
  source_conversation_id: z.string().optional(),
  conversation_ids: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).default([]),
  derived_from: z.string().nullable().default(null),
  role_binding_id: z.string().optional(),
  recommended_role: z.string().optional(),
  candidate_role_slugs: z.array(z.string()).optional(),
  /** UID list of tasks that must complete before this one (DAG parent refs). */
  pre_conditions: z.array(z.string()).optional(),
  blocked_reason: z.string().optional(),
  budget_limit: z.number().positive().optional(),
  /** R6: marked by Daily Review as recommended for today. */
  recommended: z.boolean().optional()
});
export type TaskFrontmatter = z.infer<typeof TaskFrontmatter>;

export const AnyEntityFrontmatter = z.discriminatedUnion('type', [
  ProjectFrontmatter,
  AreaFrontmatter,
  ResourceFrontmatter,
  ArchiveFrontmatter,
  TaskFrontmatter
]);
export type AnyEntityFrontmatter = z.infer<typeof AnyEntityFrontmatter>;

/**
 * Infer PARA entity type from the top-level folder name within the vault.
 * Returns `null` when the file is outside the four PARA roots.
 */
export function inferTypeFromPath(relPath: string): ParaEntityType | null {
  const top = relPath.split('/')[0] ?? '';
  switch (top) {
    case '01_Projects':
      return 'project';
    case '02_Areas':
      return 'area';
    case '03_Resources':
      return 'resource';
    case '04_Archives':
      return 'archive';
    default:
      return null;
  }
}

// --- Task index shapes (cross-process) ---

export type TaskSource = 'file' | 'inline';

export interface TaskRecord {
  id: string;
  source: TaskSource;
  status: TaskStatus;
  title: string;
  filePath: string;   // absolute
  relPath: string;    // vault-relative, POSIX
  uid?: string;       // file tasks only
  line?: number;      // inline tasks only, 1-based
  project_uid?: string;
  area_uid?: string;
  resource_uid?: string;
  due?: string;
  effort?: Effort | number;
  tags?: string[];
  priority?: 'low' | 'med' | 'high';
  execution_mode?: TaskExecutionMode;
  execution_strategy?: 'manual' | 'autonomous';
  pre_conditions?: string[];
  content_hash?: string;
  /** True when project_uid cannot be resolved in the current vault. */
  lost?: boolean;
  /** R6: Orbit Daily Review recommended this task. */
  recommended?: boolean;
  origin?: TaskOrigin;
  created_by?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  proposed_by_agent_run?: string | null;
  proposed_during_task?: string | null;
  proposal_id?: string | null;
  approval_decision_note?: string | null;
  assigned_to?: string;
  owner_type?: TaskOwnerType;
  owner_id?: string;
  claimed_at?: string;
  active_run_id?: string;
  parent_task_uid?: string;
  generated_from_task_uid?: string;
  source_conversation_id?: string;
  conversation_ids?: string[];
  depends_on?: string[];
  derived_from?: string | null;
  role_binding_id?: string;
  recommended_role?: string;
  candidate_role_slugs?: string[];
  blocked_reason?: string;
  budget_limit?: number;
  ready?: boolean;
}

export interface EntitySummary {
  type: ParaEntityType;
  uid: string;
  title: string;
  relPath: string;
  path: string;
  status?: string;        // project status
  area_uid?: string;
  archived_at?: string;
  original_type?: ParaEntityType;
}

export interface TaskFilter {
  status?: TaskStatus;
  execution_mode?: TaskExecutionMode;
  project_uid?: string;
  area_uid?: string;
  resource_uid?: string;
  due_before?: string; // ISO date
  tag?: string;
}

// --- Area-as-folder config schema ---
export const AreaConfigSchema = z.object({
  uid: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['active', 'dormant', 'archived']).default('active'),
  template: z.string().optional(),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string().optional(),
  vision_refs: z.array(z.string()).optional()
});
export type AreaConfig = z.infer<typeof AreaConfigSchema>;

// --- Vault extended config (adds external_notes_paths) ---
export const VaultExtConfigSchema = z.object({
  external_notes_paths: z.array(z.string()).default([])
});
export type VaultExtConfig = z.infer<typeof VaultExtConfigSchema>;

// --- Budget settings (M6) ---
export const BudgetSettingsSchema = z.object({
  perRunTokens: z.number().int().nonnegative().nullable().default(200_000),
  perRunUSD: z.number().nonnegative().nullable().default(5),
  dailyTokens: z.number().int().nonnegative().nullable().default(1_000_000),
  dailyUSD: z.number().nonnegative().nullable().default(20),
  warnAtPercent: z.number().min(0).max(100).default(80),
  hardStop: z.boolean().default(true)
});
export type BudgetSettings = z.infer<typeof BudgetSettingsSchema>;

export const DEFAULT_BUDGET: BudgetSettings = {
  perRunTokens: 200_000,
  perRunUSD: 5,
  dailyTokens: 1_000_000,
  dailyUSD: 20,
  warnAtPercent: 80,
  hardStop: true
};

// --- Auto-runner settings (v2 Phase 4) ---

const RuntimePrioritySchema = z.preprocess((value) => {
  const input = Array.isArray(value) ? value : ['claude', 'codex', 'copilot'];
  const seen = new Set<string>();
  return input.filter((entry): entry is string => {
    if (typeof entry !== 'string') return false;
    if (entry !== 'claude' && entry !== 'codex' && entry !== 'copilot') return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });
}, z.array(z.enum(['claude', 'codex', 'copilot'])).default(['claude', 'codex', 'copilot']));

export const AutoRunnerSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  maxConcurrent: z.number().int().min(1).max(10).default(2),
  hourlyTaskLimit: z.number().int().min(1).max(100).default(10),
  tickIntervalMs: z.number().int().min(1000).max(60_000).default(5000),
  defaultBudgetPerTask: z.number().positive().default(20),
  staleTimeoutMinutes: z.number().int().min(1).max(24 * 60).default(15),
  runtimePriority: RuntimePrioritySchema
});
export type AutoRunnerSettings = z.infer<typeof AutoRunnerSettingsSchema>;

export const DEFAULT_AUTO_RUNNER_SETTINGS: AutoRunnerSettings = {
  enabled: false,
  maxConcurrent: 2,
  hourlyTaskLimit: 10,
  tickIntervalMs: 5000,
  defaultBudgetPerTask: 20,
  staleTimeoutMinutes: 15,
  runtimePriority: ['claude', 'codex', 'copilot']
};

export function parseAutoRunnerSettings(input: unknown): AutoRunnerSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_AUTO_RUNNER_SETTINGS };
  const merged = {
    ...DEFAULT_AUTO_RUNNER_SETTINGS,
    ...(input as Record<string, unknown>)
  };
  const parsed = AutoRunnerSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_AUTO_RUNNER_SETTINGS };
}

/**
 * Parse a persisted budget value, tolerating missing keys and returning
 * defaults in place of invalid ones. Never throws.
 */
export function parseBudgetSettings(input: unknown): BudgetSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_BUDGET };
  const r = BudgetSettingsSchema.safeParse(input);
  if (r.success) return r.data;
  const merged = { ...DEFAULT_BUDGET, ...(input as Record<string, unknown>) };
  const r2 = BudgetSettingsSchema.safeParse(merged);
  return r2.success ? r2.data : { ...DEFAULT_BUDGET };
}

// --- App settings schema (M8) ---
export const ThemeSchema = z.enum(['light', 'dark', 'system']).default('dark');

export const AppSettingsSchema = z.object({
  lastVaultPath: z.string().nullable().default(null),
  theme: ThemeSchema,
  budget: BudgetSettingsSchema.default(DEFAULT_BUDGET),
  reopenLastVault: z.boolean().default(true),
  claudePath: z.string().default(''),
  anthropicApiKey: z.string().default(''),
  vectorWakeThreshold: z.number().min(0).max(1).default(0.2),
  autoRunner: AutoRunnerSettingsSchema.default(DEFAULT_AUTO_RUNNER_SETTINGS),
  autoDailyReview: z.boolean().optional(),
  autoDailyReviewAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  /** R7: enable periodic worktree cleanup (default on). */
  worktreeGcEnabled: z.boolean().default(true),
  /** R7: days since a done worktree's last activity before GC sweeps it. */
  worktreeGcDays: z.number().int().min(1).max(365).default(7)
});

export const DEFAULT_APP_SETTINGS: z.infer<typeof AppSettingsSchema> = {
  lastVaultPath: null,
  theme: 'dark',
  budget: { ...DEFAULT_BUDGET },
  reopenLastVault: true,
  claudePath: '',
  anthropicApiKey: '',
  vectorWakeThreshold: 0.2,
  autoRunner: { ...DEFAULT_AUTO_RUNNER_SETTINGS },
  worktreeGcEnabled: true,
  worktreeGcDays: 7
};

/**
 * Parse a persisted settings blob, tolerating missing/invalid fields by
 * back-filling with defaults. Clamps out-of-range numerics rather than
 * throwing.
 */
export function parseAppSettings(input: unknown): z.infer<typeof AppSettingsSchema> {
  const base = { ...DEFAULT_APP_SETTINGS };
  if (!input || typeof input !== 'object') return base;
  const obj = input as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...obj };

  // Clamp vectorWakeThreshold before schema parse so we don't drop to default.
  if (typeof merged.vectorWakeThreshold === 'number') {
    merged.vectorWakeThreshold = Math.min(1, Math.max(0, merged.vectorWakeThreshold));
  }
  // Normalize legacy theme values.
  if (merged.theme !== 'light' && merged.theme !== 'dark' && merged.theme !== 'system') {
    merged.theme = 'dark';
  }
  merged.budget = parseBudgetSettings(merged.budget);
  merged.autoRunner = parseAutoRunnerSettings(merged.autoRunner);

  const r = AppSettingsSchema.safeParse(merged);
  return r.success ? r.data : base;
}
