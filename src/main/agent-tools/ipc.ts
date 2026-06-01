import { ipcMain } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as frontmatter from '../frontmatter';
import type {
  AgentSkillDeleteInput,
  AgentSkillRegistrySnapshot,
  AgentSkillSaveInput,
  AgentSkillView,
  AgentToolRegistrySnapshot,
  EditableSkillSource,
  SkillSource
} from '@shared/agent-tools';
import { IPC } from '@shared/ipc';
import { buildAgentToolRegistrySnapshot } from './catalog';
import { SkillLoader } from './skill-loader';

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
      const vaultPath = getVaultPath();
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
      if (input.requires?.files?.length || input.requires?.config?.length) {
        fm.requires = {
          ...(input.requires.files?.length ? { files: input.requires.files } : {}),
          ...(input.requires.config?.length ? { config: input.requires.config } : {})
        };
      }
      if (input.model?.trim()) fm.model = input.model.trim();
      const body = input.body.trimEnd();
      await fs.writeFile(target, frontmatter.write(fm, `\n\n${body}\n`), 'utf8');
      const loader = new SkillLoader({ vaultPath });
      const saved = (await loader.loadAll()).find(
        (skill) => skill.source === input.source && skill.name === name
      );
      if (!saved) throw new Error(`skill_save_failed:${name}`);
      return {
        ...saved,
        effective: effectiveSkillKeys(await loader.loadAll()).has(skillIdentity(saved.source, saved.name)),
        editable: true
      };
    }
  );
  ipcMain.handle(IPC.skills.delete, async (_event, input: AgentSkillDeleteInput): Promise<void> => {
    const vaultPath = getVaultPath();
    const name = assertSafeSkillName(input.name);
    await fs.rm(path.join(skillDir(input.source, vaultPath), `${name}.md`), { force: true });
  });
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
  const name = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name) || name.includes('..')) {
    throw new Error('invalid_skill_name');
  }
  return name;
}
