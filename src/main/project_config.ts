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

export interface AgentExposureSettings {
  mode: AgentExposureMode;
  exposeMcpBridge: boolean;
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
  template: string;
  created_at: string;
  vision_linked?: boolean;
  setup?: string[];
  teardown?: string[];
  agent_exposure: AgentExposureSettings;
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
    exposeMcpBridge: mode !== 'isolated',
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
    exposeMcpBridge:
      typeof raw['exposeMcpBridge'] === 'boolean' ? raw['exposeMcpBridge'] : defaults.exposeMcpBridge,
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

export function normalizeProjectConfig(raw: unknown): ProjectConfig {
  const record = isRecord(raw) ? raw : {};
  return {
    uid: typeof record['uid'] === 'string' ? record['uid'] : '',
    slug: typeof record['slug'] === 'string' ? record['slug'] : '',
    name: typeof record['name'] === 'string' ? record['name'] : undefined,
    template: typeof record['template'] === 'string' ? record['template'] : 'blank',
    created_at: typeof record['created_at'] === 'string' ? record['created_at'] : '',
    vision_linked: typeof record['vision_linked'] === 'boolean' ? record['vision_linked'] : true,
    setup: isStringArray(record['setup']),
    teardown: isStringArray(record['teardown']),
    agent_exposure: normalizeAgentExposureSettings(record['agent_exposure']),
    github: normalizeGitHubRepoBinding(record['github'])
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
