import { ipcMain } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as frontmatter from '../frontmatter';
import type {
  AgentSkillDeleteInput,
  AgentSkillConfigUpdateInput,
  AgentSkillRegistrySnapshot,
  AgentSkillSaveInput,
  AgentSkillView,
  AgentToolRegistrySnapshot,
  EditableSkillSource,
  SkillSource,
  SkillStoreDetail,
  SkillStoreInstallInput,
  SkillStoreSearchInput,
  SkillStoreSearchResult
} from '@shared/agent-tools';
import { IPC } from '@shared/ipc';
import { buildAgentToolRegistrySnapshot } from './catalog';
import { SkillLoader } from './skill-loader';
import { getSkillHubDetail, searchSkillHub } from './skillhub';
import { updateSkillRuntimeConfig } from './skill-config-store';

let wired = false;

export function registerAgentToolsIpc(getVaultPath: () => string | null): void {
  if (wired) return;
  wired = true;
  ipcMain.handle(IPC.tools.snapshot, async (): Promise<AgentToolRegistrySnapshot> => {
    return buildAgentToolRegistrySnapshot();
  });
  ipcMain.handle(IPC.skills.list, async (_event, scope): Promise<AgentSkillRegistrySnapshot> => {
    const vaultPath = getVaultPath();
    const loader = new SkillLoader({ vaultPath, scope });
    const skills = await loader.loadAll();
    const effectiveKeys = effectiveSkillKeys(skills);
    return {
      generatedAt: Date.now(),
      skills: skills.map((skill): AgentSkillView => ({
        ...skill,
        effective: effectiveKeys.has(skillIdentity(skill.source, skill.name)),
        editable: skill.source === 'app' || skill.source === 'vault'
      })),
      sources: {
        appDir: skillDir('app', vaultPath),
        ...(vaultPath ? { vaultDir: skillDir('vault', vaultPath) } : {})
      }
    };
  });
  ipcMain.handle(
    IPC.skills.save,
    async (_event, input: AgentSkillSaveInput): Promise<AgentSkillView> => {
      return saveSkillFile(getVaultPath(), input);
    }
  );
  ipcMain.handle(IPC.skills.delete, async (_event, input: AgentSkillDeleteInput): Promise<void> => {
    const vaultPath = getVaultPath();
    const name = assertSafeSkillName(input.name);
    await fs.rm(path.join(skillDir(input.source, vaultPath), `${name}.md`), { force: true });
  });
  ipcMain.handle(
    IPC.skills.configUpdate,
    async (_event, input: AgentSkillConfigUpdateInput): Promise<AgentSkillView> => {
      const vaultPath = getVaultPath();
      const name = assertSafeSkillName(input.name);
      await updateSkillRuntimeConfig(skillDir(input.source, vaultPath), name, input.runtimeConfig);
      return loadSkillView(vaultPath, input.source, name);
    }
  );
  ipcMain.handle(
    IPC.skills.storeSearch,
    async (_event, input?: SkillStoreSearchInput): Promise<SkillStoreSearchResult> => {
      return searchSkillHub(input ?? {});
    }
  );
  ipcMain.handle(IPC.skills.storeDetail, async (_event, slug: string): Promise<SkillStoreDetail> => {
    return getSkillHubDetail(slug);
  });
  ipcMain.handle(
    IPC.skills.storeInstall,
    async (_event, input: SkillStoreInstallInput): Promise<AgentSkillView> => {
      const detail = await getSkillHubDetail(input.slug);
      if (!detail.skillMarkdown?.trim()) throw new Error('skillhub_skill_markdown_missing');
      const parsed = frontmatter.read(detail.skillMarkdown);
      const data = parsed.data;
      const name = assertSafeSkillName(
        input.name?.trim() || stringValue(data['name']) || detail.item.slug
      );
      return saveSkillFile(getVaultPath(), {
        source: input.source,
        name,
        description:
          detail.item.descriptionZh ?? stringValue(data['description']) ?? detail.item.description,
        scopes: scopeValues(data['scopes']),
        tools: stringArray(data['tools']),
        params: Array.isArray(data['params']) ? (data['params'] as AgentSkillSaveInput['params']) : [],
        requires: requiresValue(data['requires']),
        model: stringValue(data['model']),
        body: parsed.body.trim()
      });
    }
  );
}

async function saveSkillFile(
  vaultPath: string | null,
  input: AgentSkillSaveInput
): Promise<AgentSkillView> {
  const name = assertSafeSkillName(input.name);
  const dir = skillDir(input.source, vaultPath);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${name}.md`);
  const originalName = input.originalName ? assertSafeSkillName(input.originalName) : null;
  if (originalName && originalName !== name) {
    await fs.rm(path.join(dir, `${originalName}.md`), { force: true });
  }
  const fm: Record<string, unknown> = { name };
  if (input.description?.trim()) fm.description = input.description.trim();
  if (input.scopes?.length) fm.scopes = input.scopes;
  if (input.tools?.length) fm.tools = input.tools;
  if (input.params?.length) fm.params = input.params;
  if (input.requires?.files?.length || input.requires?.config?.length || input.requires?.env?.length) {
    fm.requires = {
      ...(input.requires.files?.length ? { files: input.requires.files } : {}),
      ...(input.requires.config?.length ? { config: input.requires.config } : {}),
      ...(input.requires.env?.length ? { env: input.requires.env } : {})
    };
  }
  if (input.model?.trim()) fm.model = input.model.trim();
  const body = input.body.trimEnd();
  await fs.writeFile(target, frontmatter.write(fm, `\n\n${body}\n`), 'utf8');
  if (input.runtimeConfig) {
    await updateSkillRuntimeConfig(dir, name, input.runtimeConfig);
  }
  return loadSkillView(vaultPath, input.source, name);
}

async function loadSkillView(
  vaultPath: string | null,
  source: EditableSkillSource,
  name: string
): Promise<AgentSkillView> {
  const loader = new SkillLoader({ vaultPath });
  const allSkills = await loader.loadAll();
  const saved = allSkills.find((skill) => skill.source === source && skill.name === name);
  if (!saved) throw new Error(`skill_save_failed:${name}`);
  return {
    ...saved,
    effective: effectiveSkillKeys(allSkills).has(skillIdentity(saved.source, saved.name)),
    editable: true
  };
}

function effectiveSkillKeys(skills: Array<{ source: SkillSource; name: string }>): Set<string> {
  const byName = new Map<string, { source: SkillSource; name: string }>();
  for (const skill of skills) byName.set(skill.name, skill);
  return new Set([...byName.values()].map((skill) => skillIdentity(skill.source, skill.name)));
}

function skillIdentity(source: SkillSource, name: string): string {
  return `${source}:${name}`;
}

function skillDir(source: EditableSkillSource, vaultPath: string | null): string {
  if (source === 'app') return path.join(os.homedir(), '.orbit', 'skills');
  if (!vaultPath) throw new Error('no_vault');
  return path.join(vaultPath, '.orbit', 'skills');
}

function assertSafeSkillName(value: string): string {
  const name = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name) || name.includes('..')) {
    throw new Error('invalid_skill_name');
  }
  return name;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function scopeValues(value: unknown): AgentSkillSaveInput['scopes'] {
  const valid = new Set(['global', 'task', 'project', 'area', 'resource', 'note', 'library', 'external']);
  return stringArray(value).filter((item): item is NonNullable<AgentSkillSaveInput['scopes']>[number] =>
    valid.has(item)
  );
}

function requiresValue(value: unknown): AgentSkillSaveInput['requires'] {
  if (!value || typeof value !== 'object') return {};
  const rec = value as Record<string, unknown>;
  return {
    files: stringArray(rec['files']),
    config: stringArray(rec['config']),
    env: stringArray(rec['env'])
  };
}
