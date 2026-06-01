import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderSkillForAgent, resolveRequestedSkill } from '../src/main/tools/skill';

async function writeSkill(
  dir: string,
  name: string,
  frontmatter: string,
  body: string
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.md`), `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
}

describe('agent skill tools', () => {
  it('loads a disabled skill for grounded configuration guidance without exposing secrets', async () => {
    const appDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-skill-tool-'));
    try {
      await writeSkill(
        appDir,
        'Get',
        'name: Get\ndescription: 得到笔记',
        [
          'Use Authorization: $GETNOTE_API_KEY and X-Client-ID: $GETNOTE_CLIENT_ID.',
          'When missing, ask the user to run `/note config`.',
          'Details: [oauth](references/oauth.md).'
        ].join('\n')
      );
      await writeFile(
        path.join(appDir, 'config.json'),
        JSON.stringify({
          version: 1,
          entries: {
            Get: {
              env: {
                GETNOTE_API_KEY: 'gk_live_secret'
              }
            }
          }
        }),
        'utf8'
      );

      const skill = await resolveRequestedSkill({ vaultPath: null, appSkillsDir: appDir, name: 'get' });
      const result = renderSkillForAgent(skill) as {
        runtimeStatus: { configuredEnv: string[]; missingEnv: string[] };
        declaredSlashCommands: string[];
        referencedResources: string[];
        instructions: string;
      };

      expect(result.runtimeStatus.configuredEnv).toEqual(['GETNOTE_API_KEY']);
      expect(result.runtimeStatus.missingEnv).toEqual(['GETNOTE_CLIENT_ID']);
      expect(result.declaredSlashCommands).toContain('/note config');
      expect(result.referencedResources).toContain('references/oauth.md');
      expect(result.instructions).toContain('$GETNOTE_API_KEY');
      expect(JSON.stringify(result)).not.toContain('gk_live_secret');
    } finally {
      await rm(appDir, { recursive: true, force: true });
    }
  });
});
