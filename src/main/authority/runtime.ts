import type {
  AuthorityDecision,
  AuthorityProfileId,
  AuthorityRequest
} from '@shared/authority';
import { createAuthorityGrantStore } from './grant-store';
import { evaluateAuthority } from './policy';

export interface AuthorityBlockedResult {
  ok: false;
  blocked: true;
  request: AuthorityRequest;
  decision: AuthorityDecision;
  message: string;
}

export async function evaluateVaultAuthority(
  vaultPath: string,
  request: AuthorityRequest,
  defaultProfile: AuthorityProfileId = 'balanced'
): Promise<AuthorityDecision> {
  const store = createAuthorityGrantStore(vaultPath);
  const [rules, autopilotSessions] = await Promise.all([
    store.listRules(),
    store.listAutopilotSessions()
  ]);
  return evaluateAuthority({
    request,
    rules,
    autopilotSessions,
    defaultProfile
  });
}

export function authorityBlockedResult(
  request: AuthorityRequest,
  decision: AuthorityDecision
): AuthorityBlockedResult {
  return {
    ok: false,
    blocked: true,
    request,
    decision,
    message:
      decision.effect === 'deny'
        ? `Blocked by Agent Authority: ${decision.reason}`
        : `Agent Authority requires ${decision.review} before running this tool.`
  };
}
