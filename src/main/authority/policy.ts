import {
  BUILT_IN_AUTHORITY_PROFILES,
  authorityRuleIsExpired,
  autopilotSessionIsExpired,
  type AuthorityDecision,
  type AuthorityEffect,
  type AuthorityProfileId,
  type AuthorityRequest,
  type AuthorityRiskLevel,
  type AuthorityRule,
  type AutopilotSession
} from '@shared/authority';

const RISK_ORDER: Record<AuthorityRiskLevel, number> = {
  L0_observe: 0,
  L1_bounded_local: 1,
  L2_reversible_draft: 2,
  L3_layer1_direct_write: 3,
  L4_external_side_effect: 4,
  L5_dangerous_elevated: 5
};

export interface AuthorityEvaluationInput {
  request: AuthorityRequest;
  rules: readonly AuthorityRule[];
  autopilotSessions?: readonly AutopilotSession[];
  defaultProfile?: AuthorityProfileId;
  now?: number;
}

export function evaluateAuthority(input: AuthorityEvaluationInput): AuthorityDecision {
  const now = input.now ?? Date.now();
  const matchingDeny = orderedRules(input.rules, now).find(
    (rule) => rule.effect === 'deny' && ruleMatchesRequest(rule, input.request)
  );
  if (matchingDeny) {
    return {
      effect: 'deny',
      review: 'inline_preflight',
      matchedRuleId: matchingDeny.id,
      reason: 'matched explicit deny rule'
    };
  }

  const matchingRule = orderedRules(input.rules, now).find((rule) =>
    ruleMatchesRequest(rule, input.request)
  );
  if (matchingRule) {
    return {
      effect: matchingRule.effect,
      review: matchingRule.review ?? reviewForEffect(matchingRule.effect),
      matchedRuleId: matchingRule.id,
      reason: 'matched authority grant'
    };
  }

  const autopilot = (input.autopilotSessions ?? []).find((session) =>
    autopilotMatchesRequest(session, input.request, now)
  );
  if (autopilot) {
    return {
      effect: 'allow',
      review: 'direct',
      matchedRuleId: autopilot.id,
      reason: 'matched active autopilot session'
    };
  }

  const profile = BUILT_IN_AUTHORITY_PROFILES.find(
    (candidate) => candidate.id === (input.defaultProfile ?? 'balanced')
  ) ?? BUILT_IN_AUTHORITY_PROFILES[1];
  if (profile.hardDenyPermissions.some((permission) => input.request.permissions.includes(permission))) {
    return {
      effect: 'deny',
      review: 'inline_preflight',
      reason: `profile hard-denies requested permission under ${profile.id}`
    };
  }
  const effect = profile.defaultEffectByRisk[input.request.risk];
  return {
    effect,
    review: reviewForEffect(effect),
    reason: `default ${profile.id} profile for ${input.request.risk}`
  };
}

function orderedRules(rules: readonly AuthorityRule[], now: number): AuthorityRule[] {
  return rules
    .filter((rule) => rule.enabled && !authorityRuleIsExpired(rule, now))
    .slice()
    .sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));
}

function ruleMatchesRequest(rule: AuthorityRule, request: AuthorityRequest): boolean {
  if (rule.subject.toolFamily !== request.toolFamily) return false;
  if (rule.subject.toolName && rule.subject.toolName !== request.toolName) return false;
  if (!scopeMatches(rule, request)) return false;
  if (rule.riskCeiling && RISK_ORDER[request.risk] > RISK_ORDER[rule.riskCeiling]) return false;
  if (!rule.permissions.every((permission) => request.permissions.includes(permission))) return false;
  if (rule.subject.commandPrefix && !commandStartsWith(request.command, rule.subject.commandPrefix)) {
    return false;
  }
  if (rule.subject.cwd && request.cwd !== rule.subject.cwd) return false;
  if (rule.subject.domains?.length && (!request.domain || !rule.subject.domains.includes(request.domain))) {
    return false;
  }
  if (
    rule.subject.browserActions?.length &&
    (!request.browserAction || !rule.subject.browserActions.includes(request.browserAction))
  ) {
    return false;
  }
  if (rule.subject.subagentProfile && rule.subject.subagentProfile !== request.subagentProfile) {
    return false;
  }
  return true;
}

function scopeMatches(rule: AuthorityRule, request: AuthorityRequest): boolean {
  switch (rule.scope.kind) {
    case 'global':
      return true;
    case 'conversation':
      return Boolean(rule.scope.ref && request.conversationId === rule.scope.ref);
    case 'project':
      return Boolean(rule.scope.ref && request.projectId === rule.scope.ref);
    case 'task':
      return Boolean(rule.scope.ref && request.taskId === rule.scope.ref);
    case 'area':
      return Boolean(rule.scope.ref && request.areaSlug === rule.scope.ref);
    case 'resource':
      return Boolean(rule.scope.ref && request.resourceSlug === rule.scope.ref);
    case 'cwd':
      return Boolean(rule.scope.ref && request.cwd?.startsWith(rule.scope.ref));
    case 'domain':
      return Boolean(rule.scope.ref && request.domain === rule.scope.ref);
  }
}

function autopilotMatchesRequest(
  session: AutopilotSession,
  request: AuthorityRequest,
  now: number
): boolean {
  if (!session.enabled || autopilotSessionIsExpired(session, now)) return false;
  if (!session.toolFamilies.includes(request.toolFamily)) return false;
  if (RISK_ORDER[request.risk] > RISK_ORDER[session.riskCeiling]) return false;
  if (!request.permissions.every((permission) => session.permissions.includes(permission))) return false;
  switch (session.scope.kind) {
    case 'global':
      return true;
    case 'conversation':
      return Boolean(session.scope.ref && request.conversationId === session.scope.ref);
    case 'project':
      return Boolean(session.scope.ref && request.projectId === session.scope.ref);
    case 'task':
      return Boolean(session.scope.ref && request.taskId === session.scope.ref);
    case 'cwd':
      return Boolean(session.scope.ref && request.cwd?.startsWith(session.scope.ref));
    case 'domain':
      return Boolean(session.scope.ref && request.domain === session.scope.ref);
    case 'area':
      return Boolean(session.scope.ref && request.areaSlug === session.scope.ref);
    case 'resource':
      return Boolean(session.scope.ref && request.resourceSlug === session.scope.ref);
  }
}

function commandStartsWith(command: string[] | undefined, prefix: string[]): boolean {
  if (!command || command.length < prefix.length) return false;
  return prefix.every((part, index) => command[index] === part);
}

function reviewForEffect(effect: AuthorityEffect): AuthorityDecision['review'] {
  switch (effect) {
    case 'allow':
      return 'direct';
    case 'sandbox_only':
      return 'diff_review';
    case 'ask':
      return 'inline_preflight';
    case 'deny':
      return 'inline_preflight';
  }
}
