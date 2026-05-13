/**
 * Agent authority contracts.
 *
 * These types model delegated authority for Ask Anywhere and future tool
 * families. Approval is one way to create a grant; the runtime should evaluate
 * tool calls against these grants before executing shell/browser/subagent style
 * capabilities.
 */

export const AUTHORITY_RISK_LEVELS = [
  'L0_observe',
  'L1_bounded_local',
  'L2_reversible_draft',
  'L3_layer1_direct_write',
  'L4_external_side_effect',
  'L5_dangerous_elevated'
] as const;

export type AuthorityRiskLevel = (typeof AUTHORITY_RISK_LEVELS)[number];

export const AUTHORITY_TOOL_FAMILIES = [
  'orbit',
  'web',
  'shell',
  'browser',
  'subagent',
  'automation',
  'media',
  'plugin'
] as const;

export type AuthorityToolFamily = (typeof AUTHORITY_TOOL_FAMILIES)[number];

export const AUTHORITY_EFFECTS = ['allow', 'ask', 'deny', 'sandbox_only'] as const;

export type AuthorityEffect = (typeof AUTHORITY_EFFECTS)[number];

export const AUTHORITY_SCOPE_KINDS = [
  'global',
  'conversation',
  'project',
  'task',
  'area',
  'resource',
  'cwd',
  'domain'
] as const;

export type AuthorityScopeKind = (typeof AUTHORITY_SCOPE_KINDS)[number];

export const AUTHORITY_PERMISSIONS = [
  'read',
  'network',
  'write_sandbox',
  'write_worktree',
  'write_vault_append',
  'write_vault_direct',
  'external_submit',
  'secrets',
  'spawn_subagent',
  'elevated'
] as const;

export type AuthorityPermission = (typeof AUTHORITY_PERMISSIONS)[number];

export const AUTHORITY_REVIEW_MODES = [
  'direct',
  'inline_preflight',
  'inbox_approval',
  'diff_review',
  'manual_final_click'
] as const;

export type AuthorityReviewMode = (typeof AUTHORITY_REVIEW_MODES)[number];

export const AUTHORITY_PROFILE_IDS = [
  'strict',
  'balanced',
  'builder',
  'research',
  'autopilot',
  'custom'
] as const;

export type AuthorityProfileId = (typeof AUTHORITY_PROFILE_IDS)[number];

export interface AuthorityScope {
  kind: AuthorityScopeKind;
  ref?: string;
}

export interface AuthorityBudget {
  maxToolCalls?: number;
  maxMinutes?: number;
  maxCostUsd?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export interface AuthoritySubject {
  toolFamily: AuthorityToolFamily;
  toolName?: string;
  commandPrefix?: string[];
  cwd?: string;
  domains?: string[];
  browserActions?: string[];
  subagentProfile?: string;
  pluginId?: string;
}

export interface AuthorityRule {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'system' | 'migration';
  enabled: boolean;
  priority: number;
  effect: AuthorityEffect;
  profile?: AuthorityProfileId;
  scope: AuthorityScope;
  subject: AuthoritySubject;
  permissions: AuthorityPermission[];
  riskCeiling?: AuthorityRiskLevel;
  review?: AuthorityReviewMode;
  budget?: AuthorityBudget;
  expiresAt?: string;
  rationale?: string;
}

export interface AuthorityRequest {
  toolFamily: AuthorityToolFamily;
  toolName: string;
  conversationId?: string;
  projectId?: string;
  taskId?: string;
  areaSlug?: string;
  resourceSlug?: string;
  cwd?: string;
  command?: string[];
  domain?: string;
  browserAction?: string;
  subagentProfile?: string;
  permissions: AuthorityPermission[];
  risk: AuthorityRiskLevel;
  summary: string;
}

export interface AuthorityDecision {
  effect: AuthorityEffect;
  review: AuthorityReviewMode;
  matchedRuleId?: string;
  reason: string;
}

export interface AutopilotSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  profile: AuthorityProfileId;
  scope: AuthorityScope;
  toolFamilies: AuthorityToolFamily[];
  permissions: AuthorityPermission[];
  riskCeiling: AuthorityRiskLevel;
  budget?: AuthorityBudget;
  expiresAt: string;
  conversationId?: string;
  projectId?: string;
}

export interface AuthorityProfileDefinition {
  id: AuthorityProfileId;
  label: string;
  description: string;
  defaultEffectByRisk: Record<AuthorityRiskLevel, AuthorityEffect>;
  hardDenyPermissions: AuthorityPermission[];
}

export const BUILT_IN_AUTHORITY_PROFILES: readonly AuthorityProfileDefinition[] = [
  {
    id: 'strict',
    label: 'Strict',
    description: 'Ask for all non-trivial actions. Best for new users and sensitive vaults.',
    defaultEffectByRisk: {
      L0_observe: 'allow',
      L1_bounded_local: 'ask',
      L2_reversible_draft: 'ask',
      L3_layer1_direct_write: 'ask',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['secrets', 'elevated']
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Allow read and bounded local work; ask before writes and side effects.',
    defaultEffectByRisk: {
      L0_observe: 'allow',
      L1_bounded_local: 'allow',
      L2_reversible_draft: 'sandbox_only',
      L3_layer1_direct_write: 'ask',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['secrets', 'elevated']
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Optimized for project worktrees: shell build/test and reversible drafts can run.',
    defaultEffectByRisk: {
      L0_observe: 'allow',
      L1_bounded_local: 'allow',
      L2_reversible_draft: 'allow',
      L3_layer1_direct_write: 'ask',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['secrets', 'elevated', 'external_submit']
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Optimized for web/browser reading and vault recall; writes still ask.',
    defaultEffectByRisk: {
      L0_observe: 'allow',
      L1_bounded_local: 'allow',
      L2_reversible_draft: 'ask',
      L3_layer1_direct_write: 'ask',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['secrets', 'elevated', 'external_submit']
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    description: 'Temporary high-trust mode. Must be bounded by scope, expiry, and budget.',
    defaultEffectByRisk: {
      L0_observe: 'allow',
      L1_bounded_local: 'allow',
      L2_reversible_draft: 'allow',
      L3_layer1_direct_write: 'allow',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['secrets', 'elevated']
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'User-managed grants and denies.',
    defaultEffectByRisk: {
      L0_observe: 'ask',
      L1_bounded_local: 'ask',
      L2_reversible_draft: 'ask',
      L3_layer1_direct_write: 'ask',
      L4_external_side_effect: 'ask',
      L5_dangerous_elevated: 'deny'
    },
    hardDenyPermissions: ['elevated']
  }
];

export function authorityRuleIsExpired(rule: Pick<AuthorityRule, 'expiresAt'>, now = Date.now()): boolean {
  return Boolean(rule.expiresAt && Date.parse(rule.expiresAt) <= now);
}

export function autopilotSessionIsExpired(
  session: Pick<AutopilotSession, 'expiresAt'>,
  now = Date.now()
): boolean {
  return Date.parse(session.expiresAt) <= now;
}
