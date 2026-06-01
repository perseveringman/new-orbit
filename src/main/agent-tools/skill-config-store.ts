import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { SkillRuntimeConfigInput } from '@shared/agent-tools';

export interface SkillRuntimeConfigEntry {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

interface SkillConfigFile {
  version: 1;
  entries: Record<string, SkillRuntimeConfigEntry>;
}

const CONFIG_FILENAME = 'config.json';

export async function readSkillRuntimeConfigs(
  skillDir: string
): Promise<Record<string, SkillRuntimeConfigEntry>> {
  const file = await readConfigFile(configPath(skillDir));
  return file.entries;
}

export async function readSkillRuntimeConfig(
  skillDir: string,
  skillName: string
): Promise<SkillRuntimeConfigEntry> {
  const entries = await readSkillRuntimeConfigs(skillDir);
  return normalizeEntry(entries[skillName]);
}

export async function updateSkillRuntimeConfig(
  skillDir: string,
  skillName: string,
  input: SkillRuntimeConfigInput
): Promise<SkillRuntimeConfigEntry> {
  const target = configPath(skillDir);
  const file = await readConfigFile(target);
  const current = normalizeEntry(file.entries[skillName]);
  const next: SkillRuntimeConfigEntry = { ...current };

  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (input.clearApiKey) delete next.apiKey;
  if (typeof input.apiKey === 'string') {
    const apiKey = input.apiKey.trim();
    if (apiKey) next.apiKey = apiKey;
  }

  if (input.env) {
    const env = { ...(next.env ?? {}) };
    for (const [rawKey, rawValue] of Object.entries(input.env)) {
      const key = normalizeEnvName(rawKey);
      if (!key) continue;
      const value = rawValue.trim();
      if (value) env[key] = value;
    }
    if (Object.keys(env).length) next.env = env;
    else delete next.env;
  }

  if (input.clearEnv?.length) {
    const env = { ...(next.env ?? {}) };
    for (const key of input.clearEnv) delete env[normalizeEnvName(key)];
    if (Object.keys(env).length) next.env = env;
    else delete next.env;
  }

  if (input.config && Object.keys(input.config).length) {
    next.config = { ...(next.config ?? {}), ...input.config };
  }

  file.entries[skillName] = pruneEntry(next);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(target, 0o600).catch(() => undefined);
  return normalizeEntry(file.entries[skillName]);
}

export function resolveSkillEnvValue(
  envName: string,
  entry: SkillRuntimeConfigEntry,
  requiredEnv: readonly string[]
): string | null {
  const key = normalizeEnvName(envName);
  if (!key) return null;
  const explicit = entry.env?.[key]?.trim();
  if (explicit) return explicit;

  const primaryApiKeyName = requiredEnv.find((name) => /(^|_)API_KEY$/i.test(name));
  if (primaryApiKeyName === key && entry.apiKey?.trim()) return entry.apiKey.trim();
  return null;
}

export function configPath(skillDir: string): string {
  return path.join(skillDir, CONFIG_FILENAME);
}

async function readConfigFile(filePath: string): Promise<SkillConfigFile> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyConfigFile();
    const rec = parsed as Record<string, unknown>;
    const entriesRaw = rec['entries'];
    const entries: Record<string, SkillRuntimeConfigEntry> = {};
    if (entriesRaw && typeof entriesRaw === 'object') {
      for (const [name, value] of Object.entries(entriesRaw as Record<string, unknown>)) {
        entries[name] = normalizeEntry(value);
      }
    }
    return { version: 1, entries };
  } catch {
    return emptyConfigFile();
  }
}

function emptyConfigFile(): SkillConfigFile {
  return { version: 1, entries: {} };
}

function normalizeEntry(value: unknown): SkillRuntimeConfigEntry {
  if (!value || typeof value !== 'object') return {};
  const rec = value as Record<string, unknown>;
  const entry: SkillRuntimeConfigEntry = {};
  if (typeof rec['enabled'] === 'boolean') entry.enabled = rec['enabled'];
  if (typeof rec['apiKey'] === 'string' && rec['apiKey'].trim()) entry.apiKey = rec['apiKey'].trim();
  if (rec['env'] && typeof rec['env'] === 'object') {
    const env: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(rec['env'] as Record<string, unknown>)) {
      const key = normalizeEnvName(rawKey);
      if (key && typeof rawValue === 'string' && rawValue.trim()) env[key] = rawValue.trim();
    }
    if (Object.keys(env).length) entry.env = env;
  }
  if (rec['config'] && typeof rec['config'] === 'object' && !Array.isArray(rec['config'])) {
    entry.config = rec['config'] as Record<string, unknown>;
  }
  return entry;
}

function pruneEntry(entry: SkillRuntimeConfigEntry): SkillRuntimeConfigEntry {
  const next: SkillRuntimeConfigEntry = {};
  if (typeof entry.enabled === 'boolean') next.enabled = entry.enabled;
  if (entry.apiKey?.trim()) next.apiKey = entry.apiKey.trim();
  if (entry.env && Object.keys(entry.env).length) next.env = entry.env;
  if (entry.config && Object.keys(entry.config).length) next.config = entry.config;
  return next;
}

function normalizeEnvName(value: string): string {
  const key = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(key) ? key : '';
}
