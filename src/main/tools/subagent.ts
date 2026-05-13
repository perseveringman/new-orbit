import path from 'node:path';
import type {
  AuthorityPermission,
  AuthorityRequest,
  AuthorityRiskLevel
} from '@shared/authority';
import { currentSession } from '../fs';
import { assertInsideVault, isInsideRoot } from '../pathGuard';
import { detectClaude } from '../agent/cli';
import { getPool } from '../agent/pool';
import { getHookRuntimeConfig } from '../agent/ipc';
import { getSettings } from '../settings';
import { authorityBlockedResult, evaluateVaultAuthority } from '../authority/runtime';
import { cliServerError } from '../cli_server/errors';

type SubagentProfile = 'researcher' | 'reviewer' | 'worker';

interface SubagentSpawnParams {
  prompt?: unknown;
  profile?: unknown;
  title?: unknown;
  scope?: unknown;
}

interface SubagentStopParams {
  run_id?: unknown;
}

export async function spawnSubagentTool(rawParams: unknown): Promise<unknown> {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  const params = asObject<SubagentSpawnParams>(rawParams, 'subagent.spawn');
  const prompt = requireString(params.prompt, 'prompt');
  const profile = parseProfile(params.profile);
  const cwd = resolveScopeCwd(session.vault, params.scope);
  const classification = classifyProfile(profile, cwd, session.vault);
  const request: AuthorityRequest = {
    toolFamily: 'subagent',
    toolName: 'orbit_subagent_spawn',
    cwd,
    subagentProfile: profile,
    permissions: classification.permissions,
    risk: classification.risk,
    summary: `Spawn ${profile} subagent: ${prompt.slice(0, 160)}`
  };
  const decision = await evaluateVaultAuthority(session.vault, request);
  if (decision.effect !== 'allow') return authorityBlockedResult(request, decision);

  const detect = await detectClaude();
  if (!detect.available || !detect.path) {
    throw cliServerError('runtime_unavailable', detect.error ?? 'Claude Code CLI is not available');
  }
  const title = typeof params.title === 'string' && params.title.trim()
    ? params.title.trim().slice(0, 80)
    : `${profile}: ${prompt.slice(0, 48)}`;
  const apiKey = await resolveAnthropicApiKey();
  const hookConfig = await getHookRuntimeConfig().catch(() => undefined);
  const runner = await getPool().spawn({
    claudePath: detect.path,
    prompt: buildSubagentPrompt(profile, prompt, cwd),
    cwd,
    taskId: null,
    title: `[Subagent] ${title}`,
    vaultPath: session.vault,
    runtimeProvider: 'claude',
    ...(hookConfig ? { hookConfig } : {}),
    ...(apiKey ? { apiKey } : {})
  });

  return {
    ok: true,
    runId: runner.runId,
    profile,
    cwd,
    status: runner.summary.status,
    title: runner.summary.title,
    authority: decision
  };
}

export function listSubagentsTool(): unknown {
  return {
    ok: true,
    runs: getPool().list().filter((run) => run.title?.startsWith('[Subagent]'))
  };
}

export async function stopSubagentTool(rawParams: unknown): Promise<unknown> {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  const params = asObject<SubagentStopParams>(rawParams, 'subagent.stop');
  const runId = requireString(params.run_id, 'run_id');
  const request: AuthorityRequest = {
    toolFamily: 'subagent',
    toolName: 'orbit_subagent_stop',
    permissions: ['spawn_subagent'],
    risk: 'L2_reversible_draft',
    summary: `Stop subagent run ${runId}`
  };
  const decision = await evaluateVaultAuthority(session.vault, request);
  if (decision.effect !== 'allow') return authorityBlockedResult(request, decision);
  await getPool().kill(runId, 'subagent_stop');
  return { ok: true, runId, authority: decision };
}

function asObject<T>(rawParams: unknown, method: string): T {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    throw cliServerError('invalid_params', `${method} params must be an object`);
  }
  return rawParams as T;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw cliServerError('invalid_params', `${field} is required`);
  }
  return value.trim();
}

function parseProfile(value: unknown): SubagentProfile {
  if (value === undefined || value === null || value === '') return 'researcher';
  if (value === 'researcher' || value === 'reviewer' || value === 'worker') return value;
  throw cliServerError('invalid_params', 'profile must be researcher, reviewer, or worker');
}

function resolveScopeCwd(vaultPath: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return vaultPath;
  if (typeof value !== 'string') throw cliServerError('invalid_params', 'scope must be a string');
  if (path.isAbsolute(value)) return path.resolve(value);
  return assertInsideVault(vaultPath, value);
}

function classifyProfile(
  profile: SubagentProfile,
  cwd: string,
  vaultPath: string
): { risk: AuthorityRiskLevel; permissions: AuthorityPermission[] } {
  const outsideVault = !isInsideRoot(vaultPath, cwd);
  if (profile === 'worker') {
    return {
      risk: outsideVault ? 'L3_layer1_direct_write' : 'L2_reversible_draft',
      permissions: outsideVault ? ['read', 'write_worktree', 'spawn_subagent'] : ['read', 'write_sandbox', 'spawn_subagent']
    };
  }
  return {
    risk: outsideVault ? 'L3_layer1_direct_write' : 'L1_bounded_local',
    permissions: ['read', 'spawn_subagent']
  };
}

function buildSubagentPrompt(profile: SubagentProfile, userPrompt: string, cwd: string): string {
  const guardrail =
    profile === 'worker'
      ? 'You may implement bounded changes only when the task explicitly asks for them. Keep changes scoped and report changed files.'
      : 'You are read-only. Do not edit, delete, move, install, commit, push, or perform external side effects. Return findings with file paths and concise reasoning.';
  return [
    `You are an Orbit Ask Anywhere ${profile} subagent.`,
    `Working directory: ${cwd}`,
    guardrail,
    'You are not alone in this workspace. Do not revert changes made by others.',
    '',
    '<task>',
    userPrompt,
    '</task>'
  ].join('\n');
}

async function resolveAnthropicApiKey(): Promise<string | undefined> {
  try {
    const settings = await getSettings();
    const key = (settings as unknown as { anthropicApiKey?: string }).anthropicApiKey;
    return key ?? process.env['ANTHROPIC_API_KEY'];
  } catch {
    return process.env['ANTHROPIC_API_KEY'];
  }
}
