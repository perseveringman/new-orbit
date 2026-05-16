import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { ExternalAISessionSettings } from '@shared/evidence';
import {
  defaultExternalAISessionRoots,
  type ExternalAISessionRoot,
  type ExternalAISessionScanOptions
} from './external-ai-sessions';

export const DEFAULT_EXTERNAL_AI_SESSION_SETTINGS: ExternalAISessionSettings = {
  enabled: true,
  limit: 300,
  roots: [],
  includeAgents: [],
  excludeAgents: [],
  includeProjects: [],
  excludeProjects: [],
  includePathSubstrings: [],
  excludePathSubstrings: [],
  indexLevel: 'safe_projection',
  includeToolOutputs: false
};

export function externalAISessionSettingsPath(vaultPath: string): string {
  return path.join(vaultPath, ORBIT_DIR, 'evidence', 'external-ai-sessions.settings.json');
}

export async function readExternalAISessionSettings(vaultPath: string): Promise<ExternalAISessionSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(externalAISessionSettingsPath(vaultPath), 'utf8')) as Partial<ExternalAISessionSettings>;
    return normalizeExternalAISessionSettings(parsed);
  } catch (error) {
    if (isNotFound(error)) return { ...DEFAULT_EXTERNAL_AI_SESSION_SETTINGS };
    throw error;
  }
}

export async function updateExternalAISessionSettings(
  vaultPath: string,
  patch: Partial<ExternalAISessionSettings>
): Promise<ExternalAISessionSettings> {
  const current = await readExternalAISessionSettings(vaultPath);
  const next = normalizeExternalAISessionSettings({
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  });
  const file = externalAISessionSettingsPath(vaultPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function resolveExternalAISessionScanOptions(
  vaultPath: string,
  overrides: {
    externalAISessionLimit?: number;
    externalAISessionRoots?: ExternalAISessionRoot[];
  } = {}
): Promise<ExternalAISessionScanOptions> {
  const settings = await readExternalAISessionSettings(vaultPath);
  if (!settings.enabled) {
    return {
      roots: [],
      limit: 1,
      indexLevel: settings.indexLevel,
      includeToolOutputs: settings.includeToolOutputs
    };
  }
  return {
    roots: overrides.externalAISessionRoots ?? rootsForSettings(settings),
    limit: overrides.externalAISessionLimit ?? settings.limit,
    includeAgents: settings.includeAgents,
    excludeAgents: settings.excludeAgents,
    includeProjects: settings.includeProjects,
    excludeProjects: settings.excludeProjects,
    includePathSubstrings: settings.includePathSubstrings,
    excludePathSubstrings: settings.excludePathSubstrings,
    indexLevel: settings.indexLevel,
    includeToolOutputs: settings.includeToolOutputs
  };
}

function rootsForSettings(settings: ExternalAISessionSettings): ExternalAISessionRoot[] {
  return settings.roots.length ? settings.roots : defaultExternalAISessionRoots();
}

function normalizeExternalAISessionSettings(input: Partial<ExternalAISessionSettings> = {}): ExternalAISessionSettings {
  const indexLevel = input.indexLevel === 'metadata_only' || input.indexLevel === 'safe_projection' || input.indexLevel === 'full_text'
    ? input.indexLevel
    : DEFAULT_EXTERNAL_AI_SESSION_SETTINGS.indexLevel;
  return {
    enabled: input.enabled ?? DEFAULT_EXTERNAL_AI_SESSION_SETTINGS.enabled,
    limit: clampInt(input.limit, 1, 5000, DEFAULT_EXTERNAL_AI_SESSION_SETTINGS.limit),
    roots: normalizeRoots(input.roots),
    includeAgents: normalizeStringList(input.includeAgents),
    excludeAgents: normalizeStringList(input.excludeAgents),
    includeProjects: normalizeStringList(input.includeProjects),
    excludeProjects: normalizeStringList(input.excludeProjects),
    includePathSubstrings: normalizeStringList(input.includePathSubstrings),
    excludePathSubstrings: normalizeStringList(input.excludePathSubstrings),
    indexLevel,
    includeToolOutputs: input.includeToolOutputs ?? DEFAULT_EXTERNAL_AI_SESSION_SETTINGS.includeToolOutputs,
    ...(typeof input.updated_at === 'string' ? { updated_at: input.updated_at } : {})
  };
}

function normalizeRoots(roots: unknown): ExternalAISessionRoot[] {
  if (!Array.isArray(roots)) return [];
  return roots.flatMap((root): ExternalAISessionRoot[] => {
    if (!root || typeof root !== 'object') return [];
    const record = root as Record<string, unknown>;
    if (typeof record['agent'] !== 'string' || typeof record['dir'] !== 'string') return [];
    return [{
      agent: record['agent'].trim(),
      dir: record['dir'].trim(),
      ...(typeof record['source'] === 'string' ? { source: record['source'].trim() } : {}),
      ...(typeof record['enabled'] === 'boolean' ? { enabled: record['enabled'] } : {})
    }].filter((item) => item.agent && item.dir);
  });
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
