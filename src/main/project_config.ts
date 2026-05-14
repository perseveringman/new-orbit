import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_AGENT_DIR,
  PROJECT_CONFIG,
  PROJECT_ORBIT_CONFIG,
  PROJECT_ORBIT_DIR
} from '@shared/constants';
import type { GitHubRepoBinding } from '@shared/github';

export type AgentExposureMode = 'isolated' | 'bridge' | 'compatible';
export type ProjectExecutionContext = 'worktree' | 'direct' | 'sandbox';
export type ProjectWorkdirKind = 'local';
export type ProjectLinkedVia =
  | 'link-existing'
  | 'scaffold-new'
  | 'legacy-in-vault'
  | 'migrated-from-vault';
export type ProjectWorktreeRoot = 'workdir-sibling' | 'vault';

export interface ProjectWorkdirPermissions {
  agent_write: boolean;
  auto_runner: boolean;
}

export interface ProjectWorkdirRef {
  path: string;
  kind: ProjectWorkdirKind;
  linked_at: string;
  linked_via: ProjectLinkedVia;
  permissions: ProjectWorkdirPermissions;
}

export interface ProjectGitInfo {
  is_repo: boolean;
  root_path?: string;
  default_branch?: string;
  remote_origin?: string;
  github_binding?: GitHubRepoBinding;
}

export interface ProjectExecutionContextConfig {
  kind: ProjectExecutionContext;
  worktree_root: ProjectWorktreeRoot;
  worktree_dir_name: string;
}

export interface ProjectWatcherConfig {
  enabled: boolean;
  extra_ignores: string[];
}

export interface AgentExposureSettings {
  mode: AgentExposureMode;
  exposeAgentMdBridge: boolean;
  exposeAgentsMdBridge: boolean;
  consumeCommunityAgentMd: boolean;
  consumeCommunityAgentsMd: boolean;
  consumeCommunityDotAgent: boolean;
}

export interface ProjectConfig {
  uid: string;
  slug: string;
  name?: string;
  type: 'project';
  template?: string;
  workdir?: ProjectWorkdirRef;
  git?: ProjectGitInfo;
  execution_context: ProjectExecutionContextConfig;
  created_at: string;
  vision_linked?: boolean;
  setup?: string[];
  teardown?: string[];
  vendor_bridge_files: boolean;
  watcher: ProjectWatcherConfig;
  agent_exposure?: AgentExposureSettings;
  github?: GitHubRepoBinding;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeGitHubRepoBinding(raw: unknown): GitHubRepoBinding | undefined {
  if (!isRecord(raw)) return undefined;
  const provider = raw['provider'];
  const owner = raw['owner'];
  const repo = raw['repo'];
  const fullName = raw['fullName'];
  const url = raw['url'];
  const cloneUrlHttps = raw['cloneUrlHttps'];
  const defaultBranch = raw['defaultBranch'];
  const visibility = raw['visibility'];
  const connectedAt = raw['connectedAt'];
  if (
    provider !== 'github' ||
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    typeof fullName !== 'string' ||
    typeof url !== 'string' ||
    typeof cloneUrlHttps !== 'string' ||
    typeof defaultBranch !== 'string' ||
    (visibility !== 'public' && visibility !== 'private' && visibility !== 'internal') ||
    typeof connectedAt !== 'string'
  ) {
    return undefined;
  }
  return {
    provider,
    owner,
    repo,
    fullName,
    url,
    cloneUrlHttps,
    cloneUrlSsh: typeof raw['cloneUrlSsh'] === 'string' ? raw['cloneUrlSsh'] : null,
    defaultBranch,
    visibility,
    connectedAt,
    lastFetchedAt:
      typeof raw['lastFetchedAt'] === 'string' || raw['lastFetchedAt'] === null
        ? (raw['lastFetchedAt'] as string | null)
        : null
  };
}

export function defaultAgentExposureSettings(mode: AgentExposureMode = 'isolated'): AgentExposureSettings {
  return {
    mode,
    exposeAgentMdBridge: false,
    exposeAgentsMdBridge: mode !== 'isolated',
    consumeCommunityAgentMd: mode === 'compatible',
    consumeCommunityAgentsMd: mode === 'compatible',
    consumeCommunityDotAgent: mode === 'compatible'
  };
}

export function normalizeAgentExposureSettings(raw: unknown): AgentExposureSettings {
  const mode =
    raw === 'isolated' || raw === 'bridge' || raw === 'compatible'
      ? raw
      : isRecord(raw) && (raw['mode'] === 'isolated' || raw['mode'] === 'bridge' || raw['mode'] === 'compatible')
        ? (raw['mode'] as AgentExposureMode)
        : 'isolated';
  const defaults = defaultAgentExposureSettings(mode);
  if (!isRecord(raw)) return defaults;
  return {
    mode,
    exposeAgentMdBridge:
      typeof raw['exposeAgentMdBridge'] === 'boolean'
        ? raw['exposeAgentMdBridge']
        : defaults.exposeAgentMdBridge,
    exposeAgentsMdBridge:
      typeof raw['exposeAgentsMdBridge'] === 'boolean'
        ? raw['exposeAgentsMdBridge']
        : defaults.exposeAgentsMdBridge,
    consumeCommunityAgentMd:
      typeof raw['consumeCommunityAgentMd'] === 'boolean'
        ? raw['consumeCommunityAgentMd']
        : defaults.consumeCommunityAgentMd,
    consumeCommunityAgentsMd:
      typeof raw['consumeCommunityAgentsMd'] === 'boolean'
        ? raw['consumeCommunityAgentsMd']
        : defaults.consumeCommunityAgentsMd,
    consumeCommunityDotAgent:
      typeof raw['consumeCommunityDotAgent'] === 'boolean'
        ? raw['consumeCommunityDotAgent']
        : defaults.consumeCommunityDotAgent
  };
}

export function normalizeProjectExecutionContext(raw: unknown): ProjectExecutionContext {
  return raw === 'sandbox' || raw === 'direct' || raw === 'worktree' ? raw : 'worktree';
}

export function normalizeProjectExecutionContextConfig(
  raw: unknown
): ProjectExecutionContextConfig {
  if (isRecord(raw)) {
    return {
      kind: normalizeProjectExecutionContext(raw['kind']),
      worktree_root:
        raw['worktree_root'] === 'vault' || raw['worktree_root'] === 'workdir-sibling'
          ? raw['worktree_root']
          : 'workdir-sibling',
      worktree_dir_name:
        typeof raw['worktree_dir_name'] === 'string' && raw['worktree_dir_name'].trim()
          ? raw['worktree_dir_name'].trim()
          : '.orbit-worktrees'
    };
  }
  return {
    kind: normalizeProjectExecutionContext(raw),
    worktree_root: 'workdir-sibling',
    worktree_dir_name: '.orbit-worktrees'
  };
}

function normalizeWorkdirPermissions(raw: unknown): ProjectWorkdirPermissions {
  const record = isRecord(raw) ? raw : {};
  return {
    agent_write:
      typeof record['agent_write'] === 'boolean' ? record['agent_write'] : true,
    auto_runner:
      typeof record['auto_runner'] === 'boolean' ? record['auto_runner'] : true
  };
}

function normalizeProjectWorkdir(raw: unknown): ProjectWorkdirRef | undefined {
  if (!isRecord(raw) || typeof raw['path'] !== 'string' || !raw['path'].trim()) {
    return undefined;
  }
  return {
    path: raw['path'],
    kind: raw['kind'] === 'local' ? 'local' : 'local',
    linked_at:
      typeof raw['linked_at'] === 'string' ? raw['linked_at'] : new Date(0).toISOString(),
    linked_via:
      raw['linked_via'] === 'scaffold-new' ||
      raw['linked_via'] === 'legacy-in-vault' ||
      raw['linked_via'] === 'migrated-from-vault' ||
      raw['linked_via'] === 'link-existing'
        ? raw['linked_via']
        : 'link-existing',
    permissions: normalizeWorkdirPermissions(raw['permissions'])
  };
}

function normalizeProjectGitInfo(raw: unknown, legacyGithub?: GitHubRepoBinding): ProjectGitInfo | undefined {
  if (!isRecord(raw)) {
    return legacyGithub ? { is_repo: true, github_binding: legacyGithub } : undefined;
  }
  const info: ProjectGitInfo = {
    is_repo: raw['is_repo'] === true
  };
  if (typeof raw['root_path'] === 'string') info.root_path = raw['root_path'];
  if (typeof raw['default_branch'] === 'string') info.default_branch = raw['default_branch'];
  if (typeof raw['remote_origin'] === 'string') info.remote_origin = raw['remote_origin'];
  const binding = normalizeGitHubRepoBinding(raw['github_binding']) ?? legacyGithub;
  if (binding) info.github_binding = binding;
  return info;
}

function normalizeWatcherConfig(raw: unknown): ProjectWatcherConfig {
  const record = isRecord(raw) ? raw : {};
  return {
    enabled: typeof record['enabled'] === 'boolean' ? record['enabled'] : true,
    extra_ignores: isStringArray(record['extra_ignores'])
  };
}

export function projectExecutionContextKind(
  config: Pick<ProjectConfig, 'execution_context'> | null | undefined
): ProjectExecutionContext {
  const raw = config?.execution_context as unknown;
  return isRecord(raw)
    ? normalizeProjectExecutionContext(raw['kind'])
    : normalizeProjectExecutionContext(raw);
}

export function normalizeProjectConfig(raw: unknown): ProjectConfig {
  const record = isRecord(raw) ? raw : {};
  const legacyGithub = normalizeGitHubRepoBinding(record['github']);
  const agentExposure = normalizeAgentExposureSettings(record['agent_exposure']);
  return {
    uid: typeof record['uid'] === 'string' ? record['uid'] : '',
    slug: typeof record['slug'] === 'string' ? record['slug'] : '',
    name: typeof record['name'] === 'string' ? record['name'] : undefined,
    type: 'project',
    template: typeof record['template'] === 'string' ? record['template'] : 'blank',
    workdir: normalizeProjectWorkdir(record['workdir']),
    git: normalizeProjectGitInfo(record['git'], legacyGithub),
    execution_context: normalizeProjectExecutionContextConfig(record['execution_context']),
    created_at: typeof record['created_at'] === 'string' ? record['created_at'] : '',
    vision_linked: typeof record['vision_linked'] === 'boolean' ? record['vision_linked'] : true,
    setup: isStringArray(record['setup']),
    teardown: isStringArray(record['teardown']),
    vendor_bridge_files:
      typeof record['vendor_bridge_files'] === 'boolean'
        ? record['vendor_bridge_files']
        : agentExposure.mode !== 'isolated',
    watcher: normalizeWatcherConfig(record['watcher']),
    agent_exposure: agentExposure,
    github: legacyGithub
  };
}

export function projectConfigCandidates(dir: string): string[] {
  return [
    path.join(dir, PROJECT_ORBIT_DIR, PROJECT_ORBIT_CONFIG),
    path.join(dir, PROJECT_AGENT_DIR, PROJECT_CONFIG)
  ];
}

export async function readProjectConfig(dir: string): Promise<ProjectConfig | null> {
  for (const file of projectConfigCandidates(dir)) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      return normalizeProjectConfig(JSON.parse(raw));
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function writeProjectConfig(dir: string, config: ProjectConfig): Promise<string> {
  const file = path.join(dir, PROJECT_ORBIT_DIR, PROJECT_ORBIT_CONFIG);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return file;
}
