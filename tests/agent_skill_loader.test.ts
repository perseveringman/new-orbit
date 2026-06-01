import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SkillSettingsResolver } from '@shared/agent-tools';
import { SkillLoader } from '../src/main/agent-tools/skill-loader';

// space.context 在 'space' source skill 测试里依赖 vault 的真实 PARA 结构，
// 全部测试用 scope=global 即可避开 space 加载分支。
vi.mock('../src/main/space/context', () => ({
  getSpace: async () => null
}));

async function writeSkill(
  dir: string,
  name: string,
  frontmatter: string,
  body = 'Skill body content.'
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${name}.md`),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    'utf8'
  );
}

describe('SkillLoader', () => {
  let appDir: string;
  let vault: string;

  beforeEach(async () => {
    appDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-skills-app-'));
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-skills-vault-'));
  });
  afterEach(async () => {
    await rm(appDir, { recursive: true, force: true });
    await rm(vault, { recursive: true, force: true });
  });

  it('returns empty array when no skill dirs exist', async () => {
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    expect(await loader.load()).toEqual([]);
  });

  it('parses frontmatter and uses filename when name is missing', async () => {
    await writeSkill(
      appDir,
      'thought-capture',
      'description: Quick capture flows\nscopes: [global, project]\ntools: [orbit_resource_create]'
    );
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'thought-capture',
      description: 'Quick capture flows',
      scopes: ['global', 'project'],
      tools: ['orbit_resource_create'],
      source: 'app'
    });
    expect(skills[0]?.body).toBe('Skill body content.');
  });

  it('falls back to filename when frontmatter has no name', async () => {
    await writeSkill(appDir, 'fallback-skill', 'description: x');
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills[0]?.name).toBe('fallback-skill');
  });

  it('vault-level skill overrides app-level skill of same name', async () => {
    await writeSkill(appDir, 'shared', 'description: app version', 'app body');
    const vaultSkillsDir = path.join(vault, '.orbit', 'skills');
    await writeSkill(vaultSkillsDir, 'shared', 'description: vault version', 'vault body');

    const loader = new SkillLoader({ vaultPath: vault, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.source).toBe('vault');
    expect(skills[0]?.body).toBe('vault body');
    expect(skills[0]?.description).toBe('vault version');
  });

  it('marks skill disabled when requires.files target is missing', async () => {
    const vaultSkillsDir = path.join(vault, '.orbit', 'skills');
    await writeSkill(
      vaultSkillsDir,
      'needs-inbox',
      'description: x\nrequires:\n  files:\n    - 00_Inbox/'
    );
    const loader = new SkillLoader({ vaultPath: vault, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills[0]?.disabledReason).toContain('00_Inbox/');
  });

  it('passes requires.files when target exists', async () => {
    await mkdir(path.join(vault, '00_Inbox'), { recursive: true });
    const vaultSkillsDir = path.join(vault, '.orbit', 'skills');
    await writeSkill(
      vaultSkillsDir,
      'needs-inbox',
      'description: x\nrequires:\n  files:\n    - 00_Inbox/'
    );
    const loader = new SkillLoader({ vaultPath: vault, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills[0]?.disabledReason).toBeUndefined();
  });

  it('uses settings resolver to evaluate requires.config', async () => {
    const vaultSkillsDir = path.join(vault, '.orbit', 'skills');
    await writeSkill(
      vaultSkillsDir,
      'needs-flag',
      'description: x\nrequires:\n  config:\n    - app.features.thoughts.enabled'
    );
    const enabled: SkillSettingsResolver = { isTruthy: () => true };
    const disabled: SkillSettingsResolver = { isTruthy: () => false };

    const enabledLoader = new SkillLoader({
      vaultPath: vault,
      appSkillsDir: appDir,
      settings: enabled
    });
    expect((await enabledLoader.load())[0]?.disabledReason).toBeUndefined();

    const disabledLoader = new SkillLoader({
      vaultPath: vault,
      appSkillsDir: appDir,
      settings: disabled
    });
    expect((await disabledLoader.load())[0]?.disabledReason).toContain('app.features.thoughts.enabled');
  });

  it('infers skill env requirements and marks missing skill config', async () => {
    await writeSkill(
      appDir,
      'get',
      'description: x',
      'Use Authorization: $GETNOTE_API_KEY and X-Client-ID: $GETNOTE_CLIENT_ID.'
    );
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skill = (await loader.load())[0];
    expect(skill?.requires.env).toEqual(['GETNOTE_API_KEY', 'GETNOTE_CLIENT_ID']);
    expect(skill?.runtimeStatus.missingEnv).toEqual(['GETNOTE_API_KEY', 'GETNOTE_CLIENT_ID']);
    expect(skill?.disabledReason).toContain('GETNOTE_API_KEY');
  });

  it('reads skill runtime config without exposing secret values', async () => {
    await writeSkill(
      appDir,
      'get',
      'description: x',
      'Use Authorization: $GETNOTE_API_KEY and X-Client-ID: $GETNOTE_CLIENT_ID.'
    );
    await writeFile(
      path.join(appDir, 'config.json'),
      JSON.stringify({
        version: 1,
        entries: {
          get: {
            env: {
              GETNOTE_API_KEY: 'gk_live_secret',
              GETNOTE_CLIENT_ID: 'cli_secret'
            }
          }
        }
      }),
      'utf8'
    );
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skill = (await loader.load())[0];
    expect(skill?.runtimeStatus.configuredEnv).toEqual(['GETNOTE_API_KEY', 'GETNOTE_CLIENT_ID']);
    expect(skill?.runtimeStatus.missingEnv).toEqual([]);
    expect(skill?.disabledReason).toBeUndefined();
    expect(JSON.stringify(skill)).not.toContain('gk_live_secret');
  });

  it('drops invalid frontmatter values gracefully', async () => {
    await writeSkill(
      appDir,
      'messy',
      'scopes: [global, not-a-scope, area]\ntools: [orbit_x, 42, ""]\nparams:\n  - name: a\n  - notObject'
    );
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills[0]?.scopes).toEqual(['global', 'area']);
    expect(skills[0]?.tools).toEqual(['orbit_x']);
    expect(skills[0]?.params).toEqual([{ name: 'a' }]);
  });

  it('skips non-md files in skill dirs', async () => {
    await mkdir(appDir, { recursive: true });
    await writeFile(path.join(appDir, 'notes.txt'), 'ignore me', 'utf8');
    await writeSkill(appDir, 'real', 'description: ok');
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('real');
  });

  it('sorts skills by name', async () => {
    await writeSkill(appDir, 'beta', 'description: ');
    await writeSkill(appDir, 'alpha', 'description: ');
    const loader = new SkillLoader({ vaultPath: null, appSkillsDir: appDir });
    const skills = await loader.load();
    expect(skills.map((s) => s.name)).toEqual(['alpha', 'beta']);
  });
});
