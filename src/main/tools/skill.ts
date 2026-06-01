import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { LoadedSkill, SkillSource } from '@shared/agent-tools';
import { ORBIT_DIR } from '@shared/constants';
import { currentSession } from '../fs';
import { cliServerError } from '../cli_server/errors';
import { SkillLoader } from '../agent-tools/skill-loader';

const DEFAULT_RESOURCE_MAX_CHARS = 20_000;
const MAX_RESOURCE_CHARS = 80_000;
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.csv',
  '.tsv',
  '.html',
  '.xml'
]);

export async function readSkillTool(params: unknown): Promise<unknown> {
  const input = objectParams(params, 'skill.read');
  const skill = await resolveRequestedSkill({
    vaultPath: openVaultPath(),
    name: stringParam(input, 'skill'),
    source: optionalSkillSource(input, 'source')
  });
  return renderSkillForAgent(skill);
}

export async function readSkillResourceTool(params: unknown): Promise<unknown> {
  const input = objectParams(params, 'skill.resource.read');
  const skill = await resolveRequestedSkill({
    vaultPath: openVaultPath(),
    name: stringParam(input, 'skill'),
    source: optionalSkillSource(input, 'source')
  });
  const relPath = normalizeResourcePath(stringParam(input, 'path'));
  const maxChars = boundedMaxChars(input['max_chars']);
  const abs = path.resolve(path.dirname(skill.path), relPath);
  const root = path.dirname(skill.path);
  if (!isInside(root, abs)) {
    throw cliServerError('path_outside_skill', `skill resource path escapes skill folder: ${relPath}`);
  }
  if (isSecretSkillPath(relPath)) {
    throw cliServerError('skill_resource_forbidden', 'secret skill config files cannot be read');
  }
  const ext = path.extname(abs).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw cliServerError('skill_resource_unsupported', `unsupported skill resource type: ${ext || 'unknown'}`);
  }
  const stat = await fs.stat(abs).catch(() => {
    throw cliServerError('not_found', `skill resource not found: ${relPath}`);
  });
  if (!stat.isFile()) {
    throw cliServerError('invalid_path', `skill resource is not a file: ${relPath}`);
  }
  const raw = await fs.readFile(abs, 'utf8');
  const content = truncate(raw, maxChars);
  return {
    skill: skill.name,
    source: skill.source,
    path: relPath,
    absolutePath: abs,
    content,
    truncated: raw.length > content.length
  };
}

export async function resolveRequestedSkill(input: {
  vaultPath: string | null;
  name: string;
  source?: SkillSource;
  appSkillsDir?: string;
}): Promise<LoadedSkill> {
  const loader = new SkillLoader({
    vaultPath: input.vaultPath,
    appSkillsDir: input.appSkillsDir
  });
  const skills = input.source ? await loader.loadAll() : await loader.load();
  const normalized = input.name.toLowerCase();
  const skill = skills.find(
    (candidate) =>
      candidate.name.toLowerCase() === normalized &&
      (!input.source || candidate.source === input.source)
  );
  if (!skill) throw cliServerError('skill_not_found', `skill not found: ${input.name}`);
  return skill;
}

export function renderSkillForAgent(skill: LoadedSkill): unknown {
  const requiredEnv = skill.runtimeStatus.requiredEnv;
  const configuredEnv = skill.runtimeStatus.configuredEnv;
  const missingEnv = skill.runtimeStatus.missingEnv;
  return {
    name: skill.name,
    description: skill.description,
    source: skill.source,
    path: skill.path,
    scopes: skill.scopes,
    tools: skill.tools,
    requires: skill.requires,
    disabledReason: skill.disabledReason ?? null,
    runtimeStatus: {
      enabled: skill.runtimeStatus.enabled,
      apiKeySet: skill.runtimeStatus.apiKeySet,
      requiredEnv,
      configuredEnv,
      missingEnv,
      configKeys: skill.runtimeStatus.configKeys
    },
    diagnostics: skill.diagnostics,
    orbitRuntimeNotes: [
      'This skill is running inside Orbit Ask Anywhere, not Claude Desktop, Codex, OpenClaw, or another host.',
      'If the skill asks for API keys or env vars, direct the user to Orbit 技能库 -> 密钥. Never ask the user to edit Claude Desktop config for Orbit skill credentials.',
      requiredEnv.length
        ? `Required env: ${requiredEnv.join(', ')}.`
        : 'This skill does not declare required env.',
      configuredEnv.length || skill.runtimeStatus.apiKeySet
        ? `Configured env: ${configuredEnv.join(', ') || 'primary API key set'}.`
        : 'Configured env: none.',
      missingEnv.length ? `Missing env: ${missingEnv.join(', ')}.` : 'Missing env: none.',
      skill.diagnostics.missingReferences.length
        ? `Missing referenced files: ${skill.diagnostics.missingReferences.join(', ')}. Report this package problem instead of inventing the missing details.`
        : 'Missing referenced files: none.'
    ],
    declaredSlashCommands: extractSlashCommands(skill.body),
    referencedResources: extractSkillResourcePaths(skill.body),
    instructions: skill.body
  };
}

function openVaultPath(): string | null {
  return currentSession()?.vault ?? null;
}

function objectParams(params: unknown, method: string): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw cliServerError('invalid_params', `${method} params must be an object`);
  }
  return params as Record<string, unknown>;
}

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw cliServerError('invalid_params', `${key} is required`);
  }
  return value.trim();
}

function optionalSkillSource(
  params: Record<string, unknown>,
  key: string
): SkillSource | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (value === 'app' || value === 'vault' || value === 'space') return value;
  throw cliServerError('invalid_params', `invalid skill source: ${String(value)}`);
}

function boundedMaxChars(value: unknown): number {
  if (value === undefined) return DEFAULT_RESOURCE_MAX_CHARS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw cliServerError('invalid_params', 'max_chars must be a positive integer');
  }
  return Math.min(value, MAX_RESOURCE_CHARS);
}

function normalizeResourcePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('://')) {
    throw cliServerError('invalid_params', 'skill resource path must be relative');
  }
  if (normalized.split('/').some((part) => part === '..' || part === '' || part.startsWith('.'))) {
    throw cliServerError('invalid_params', 'skill resource path contains an unsafe segment');
  }
  return normalized;
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isSecretSkillPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return lower === 'config.json' || lower.endsWith('/config.json') || lower.includes('/.env');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[orbit_truncated: ${value.length - maxChars} chars omitted]`;
}

function extractSlashCommands(body: string): string[] {
  const out = new Set<string>();
  const pattern = /\/([A-Za-z0-9._-]+)(?:\s+([A-Za-z0-9._-]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const primary = match[1];
    if (!primary) continue;
    const second = match[2];
    out.add(second ? `/${primary} ${second}` : `/${primary}`);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function extractSkillResourcePaths(body: string): string[] {
  const out = new Set<string>();
  const linkPattern = /\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(body))) {
    const raw = decodeURIComponent((match[1] ?? '').trim().split('#')[0] ?? '');
    if (isSkillResourceReference(raw)) out.add(stripResourcePrefix(raw));
  }
  const barePattern = /\b(?:references|assets|templates|examples|docs)\/[A-Za-z0-9._/-]+\b/g;
  while ((match = barePattern.exec(body))) {
    const raw = match[0];
    if (isSkillResourceReference(raw)) out.add(stripResourcePrefix(raw));
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function isSkillResourceReference(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('://')) return false;
  return /^(?:\.\/)?(?:references|assets|templates|examples|docs)\//.test(value);
}

function stripResourcePrefix(value: string): string {
  return value.replace(/^\.\//, '');
}

export function orbitSkillConfigLocation(skill: LoadedSkill): string {
  if (skill.source === 'app') return path.join(os.homedir(), '.orbit', 'skills', 'config.json');
  if (skill.source === 'vault') return path.join(path.dirname(skill.path), 'config.json');
  return path.join(path.dirname(skill.path), ORBIT_DIR, 'skills', 'config.json');
}
