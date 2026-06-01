/**
 * SkillLoader — 三级目录扫描 + frontmatter 解析 + requires 检测。
 *
 * 设计参考：plans/swift-vortex-darwin.md §2.2/§4
 *
 * 加载顺序（后者覆盖前者同名 skill）：
 *   1. ~/.orbit/skills/*.md             — 应用级（跨 vault 共享）
 *   2. <vault>/.orbit/skills/*.md       — vault 级
 *   3. <space>/.orbit/skills/*.md       — space 级（仅当 scope.kind ∈ {project, area, resource}）
 *
 * Phase C 范围：
 *   - 解析 SkillFrontmatter 并归一化为 LoadedSkill
 *   - requires.files：vault 内相对路径 fs.access 检测
 *   - requires.config：通过注入的 SkillSettingsResolver 检测
 *   - install 字段彻底忽略（plans §B5）
 *   - 失败的 skill 仍保留在 listAll() 中，但 disabledReason 非空，激活时被 orchestrator 过滤掉
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as frontmatter from '../frontmatter';
import type { ConversationScope } from '@shared/conversation';
import { ORBIT_DIR } from '@shared/constants';
import type {
  LoadedSkill,
  SkillDiagnostics,
  SkillFrontmatter,
  SkillParam,
  SkillRequires,
  SkillRuntimeStatus,
  SkillSettingsResolver,
  SkillSource
} from '@shared/agent-tools';
import { getSpace } from '../space/context';
import {
  readSkillRuntimeConfigs,
  resolveSkillEnvValue,
  type SkillRuntimeConfigEntry
} from './skill-config-store';

/** 用于解析 ConversationScope 到 space 路径。 */
async function resolveSpaceDir(
  vaultPath: string,
  scope: ConversationScope | undefined
): Promise<string | null> {
  if (!scope) return null;
  if (scope.kind === 'project') {
    const space = await getSpace(vaultPath, scope.project_id).catch(() => null);
    return space ? space.path : null;
  }
  if (scope.kind === 'area') {
    const space = await getSpace(vaultPath, scope.area_slug).catch(() => null);
    return space ? space.path : null;
  }
  if (scope.kind === 'resource') {
    const space = await getSpace(vaultPath, scope.resource_slug).catch(() => null);
    return space ? space.path : null;
  }
  return null;
}

export interface SkillLoaderDeps {
  /** 当前打开的 vault 根；为空则 vault/space 级跳过。 */
  vaultPath: string | null;
  /** 当前 ConversationScope；用于决定要不要扫 space 级。 */
  scope?: ConversationScope;
  /** Settings 注入；不传则不能检测 requires.config（视为通过）。 */
  settings?: SkillSettingsResolver;
  /** 测试用：覆盖应用级目录（默认 ~/.orbit/skills）。 */
  appSkillsDir?: string;
}

export async function resolveSkillDirs(
  deps: SkillLoaderDeps
): Promise<Array<{ dir: string; source: SkillSource }>> {
  const dirs: Array<{ dir: string; source: SkillSource }> = [];
  const appDir = deps.appSkillsDir ?? path.join(os.homedir(), '.orbit', 'skills');
  dirs.push({ dir: appDir, source: 'app' });
  if (deps.vaultPath) {
    dirs.push({
      dir: path.join(deps.vaultPath, ORBIT_DIR, 'skills'),
      source: 'vault'
    });
    const spaceDir = await resolveSpaceDir(deps.vaultPath, deps.scope);
    if (spaceDir) {
      dirs.push({ dir: path.join(spaceDir, ORBIT_DIR, 'skills'), source: 'space' });
    }
  }
  return dirs;
}

export class SkillLoader {
  constructor(private readonly deps: SkillLoaderDeps) {}

  async load(): Promise<LoadedSkill[]> {
    const merged = new Map<string, LoadedSkill>();
    for (const skill of await this.loadAll()) {
      merged.set(skill.name, skill);
    }

    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadAll(): Promise<LoadedSkill[]> {
    const out: LoadedSkill[] = [];
    for (const { dir, source } of await resolveSkillDirs(this.deps)) {
      out.push(...(await this.scanDir(dir, source)));
    }
    return out.sort(
      (a, b) => sourceOrder(a.source) - sourceOrder(b.source) || a.name.localeCompare(b.name)
    );
  }

  private async scanDir(dir: string, source: SkillSource): Promise<LoadedSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const runtimeConfigs = await readSkillRuntimeConfigs(dir);
    const out: LoadedSkill[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(dir, entry);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = frontmatter.read(raw);
        const fm = normaliseFrontmatter(parsed.data, entry);
        const requires = fm.requires ?? {};
        const body = parsed.body.trim();
        const requiredEnv = uniqueStrings([...(requires.env ?? []), ...inferSkillEnvNames(body)]);
        const runtimeConfig = runtimeConfigs[fm.name] ?? {};
        const runtimeStatus = buildRuntimeStatus(runtimeConfig, requiredEnv);
        const diagnostics = await this.evaluateDiagnostics(filePath, body);
        const disabledReason = await this.evaluateRequires(requires, runtimeStatus);
        const skill: LoadedSkill = {
          name: fm.name,
          description: fm.description ?? '',
          scopes: fm.scopes ?? [],
          tools: fm.tools ?? [],
          params: fm.params ?? [],
          requires: {
            ...requires,
            ...(requiredEnv.length ? { env: requiredEnv } : {})
          },
          body,
          source,
          path: filePath,
          runtimeStatus,
          diagnostics,
          ...(fm.model ? { model: fm.model } : {}),
          ...(disabledReason ? { disabledReason } : {})
        };
        out.push(skill);
      } catch (err) {
        console.warn('[skill-loader] failed to parse', filePath, err);
      }
    }
    return out;
  }

  private async evaluateRequires(
    requires: SkillRequires,
    runtimeStatus: SkillRuntimeStatus
  ): Promise<string | undefined> {
    const vault = this.deps.vaultPath;
    // requires.files：vault 内相对路径必须存在；vault 缺失时跳过检测（视为通过）
    if (requires.files && requires.files.length > 0) {
      if (!vault) {
        // 没 vault 又要求文件 → 视为不满足
        return `requires.files needs a vault: ${requires.files.join(', ')}`;
      }
      for (const rel of requires.files) {
        const target = path.join(vault, rel);
        try {
          await fs.access(target);
        } catch {
          return `missing required file/folder: ${rel}`;
        }
      }
    }
    if (requires.config && requires.config.length > 0) {
      const settings = this.deps.settings;
      if (!settings) {
        // 没注入 settings → 不能检测，保守视为通过（避免误屏蔽）
        return undefined;
      }
      for (const key of requires.config) {
        if (!settings.isTruthy(key)) {
          return `config flag not enabled: ${key}`;
        }
      }
    }
    if (runtimeStatus.enabled === false) {
      return 'skill disabled in Orbit skill config';
    }
    if (runtimeStatus.missingEnv.length > 0) {
      return `missing skill env: ${runtimeStatus.missingEnv.join(', ')}`;
    }
    return undefined;
  }

  private async evaluateDiagnostics(filePath: string, body: string): Promise<SkillDiagnostics> {
    const missingReferences: string[] = [];
    const dir = path.dirname(filePath);
    for (const rel of extractReferencedFiles(body)) {
      try {
        await fs.access(path.join(dir, rel));
      } catch {
        missingReferences.push(rel);
      }
    }
    return { missingReferences };
  }
}

function sourceOrder(source: SkillSource): number {
  if (source === 'app') return 0;
  if (source === 'vault') return 1;
  return 2;
}

// =================================================================================
// frontmatter 归一化（ts 类型化解析）
// =================================================================================

function normaliseFrontmatter(
  raw: Record<string, unknown>,
  filename: string
): SkillFrontmatter {
  const name =
    typeof raw['name'] === 'string' && raw['name']
      ? raw['name']
      : filename.replace(/\.md$/i, '');
  const fm: SkillFrontmatter = { name };
  if (typeof raw['description'] === 'string') fm.description = raw['description'];
  if (typeof raw['model'] === 'string') fm.model = raw['model'];
  if (Array.isArray(raw['scopes'])) {
    fm.scopes = raw['scopes'].filter(
      (v): v is ConversationScope['kind'] =>
        typeof v === 'string' &&
        ['global', 'task', 'project', 'area', 'resource', 'note', 'library', 'external'].includes(
          v
        )
    );
  }
  if (Array.isArray(raw['tools'])) {
    fm.tools = raw['tools'].filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (Array.isArray(raw['params'])) {
    fm.params = raw['params']
      .map((p): SkillParam | null => {
        if (!p || typeof p !== 'object') return null;
        const rec = p as Record<string, unknown>;
        if (typeof rec['name'] !== 'string' || !rec['name']) return null;
        const param: SkillParam = { name: rec['name'] };
        if (typeof rec['description'] === 'string') param.description = rec['description'];
        if (rec['required'] === true) param.required = true;
        return param;
      })
      .filter((p): p is SkillParam => p !== null);
  }
  if (raw['requires'] && typeof raw['requires'] === 'object') {
    const req = raw['requires'] as Record<string, unknown>;
    const requires: SkillRequires = {};
    if (Array.isArray(req['files'])) {
      requires.files = req['files'].filter((v): v is string => typeof v === 'string');
    }
    if (Array.isArray(req['config'])) {
      requires.config = req['config'].filter((v): v is string => typeof v === 'string');
    }
    if (Array.isArray(req['env'])) {
      requires.env = req['env'].filter((v): v is string => typeof v === 'string');
    }
    if (requires.files || requires.config || requires.env) fm.requires = requires;
  }
  return fm;
}

export function inferSkillEnvNames(body: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /\$([A-Z][A-Z0-9_]{2,79})\b/g,
    /`([A-Z][A-Z0-9_]{2,79})`/g,
    /\b([A-Z][A-Z0-9_]*(?:API_KEY|CLIENT_ID|ACCESS_TOKEN|AUTH_TOKEN|TOKEN|SECRET))\b/g
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body))) {
      const name = match[1];
      if (name && isLikelySecretEnvName(name)) out.add(name);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function buildRuntimeStatus(
  config: SkillRuntimeConfigEntry,
  requiredEnv: string[]
): SkillRuntimeStatus {
  const configuredEnv = Object.keys(config.env ?? {}).sort((a, b) => a.localeCompare(b));
  const missingEnv = requiredEnv.filter((name) => !resolveSkillEnvValue(name, config, requiredEnv));
  return {
    enabled: config.enabled !== false,
    apiKeySet: Boolean(config.apiKey?.trim()),
    requiredEnv,
    configuredEnv,
    missingEnv,
    configKeys: Object.keys(config.config ?? {}).sort((a, b) => a.localeCompare(b))
  };
}

function extractReferencedFiles(body: string): string[] {
  const out = new Set<string>();
  const linkPattern = /\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(body))) {
    const raw = decodeURIComponent((match[1] ?? '').trim().split('#')[0] ?? '');
    if (isRelativeReference(raw)) out.add(raw);
  }
  const barePattern = /\breferences\/[A-Za-z0-9._/-]+\b/g;
  while ((match = barePattern.exec(body))) {
    const raw = match[0];
    if (isRelativeReference(raw)) out.add(raw);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function isRelativeReference(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('://')) return false;
  return value.startsWith('references/') || value.startsWith('./references/');
}

function isLikelySecretEnvName(name: string): boolean {
  return /(^|_)(API_KEY|CLIENT_ID|ACCESS_TOKEN|AUTH_TOKEN|TOKEN|SECRET)$/i.test(name);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
