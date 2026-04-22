import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { distillProject } from '../src/main/distill/distill';
import type { CostRecord } from '../src/shared/agent';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() }
}));

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-distill-'));
  await fs.mkdir(path.join(d, '.orbit'), { recursive: true });
  await fs.mkdir(path.join(d, '.orbit/logs'), { recursive: true });
  await fs.mkdir(path.join(d, '.orbit/cost'), { recursive: true });
  await fs.mkdir(path.join(d, '01_Projects'), { recursive: true });
  await fs.mkdir(path.join(d, '02_Areas'), { recursive: true });
  await fs.mkdir(path.join(d, '03_Resources'), { recursive: true });
  await fs.mkdir(path.join(d, '04_Archives/2025'), { recursive: true });
  await fs.writeFile(path.join(d, '.orbit', 'refmap.json'), '{}\n', 'utf8');
  await fs.writeFile(
    path.join(d, '.orbit', 'config.json'),
    JSON.stringify({ version: '0.1.0', createdAt: new Date().toISOString(), name: 't' }),
    'utf8'
  );
  return d;
}

async function readCosts(vault: string): Promise<CostRecord[]> {
  const dir = path.join(vault, '.orbit', 'cost');
  const files = await fs.readdir(dir);
  const recs: CostRecord[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      recs.push(JSON.parse(line) as CostRecord);
    }
  }
  return recs;
}

describe('distillProject closure flow', () => {
  it('writes a resource with correct frontmatter + cost record with reason distilled', async () => {
    const vault = await tmpVault();
    try {
      const archivedAbs = path.join(vault, '04_Archives', '2025', 'P1.md');
      await fs.writeFile(
        archivedAbs,
        '---\nuid: PROJUID123456\ntype: archive\ntitle: P1\narchived_at: 2025-06-01T00:00:00.000Z\noriginal_type: project\n---\nproject body content\n',
        'utf8'
      );
      // A supporting resource file tagged to the project.
      await fs.writeFile(
        path.join(vault, '03_Resources', 'Support.md'),
        '---\nuid: SUPPORT11\ntype: resource\ntitle: Support\nproject_uid: PROJUID123456\n---\nsupport\n',
        'utf8'
      );

      const { openFsSession, closeFsSession, registerFsIpc } = await import(
        '../src/main/fs'
      );
      registerFsIpc();
      await openFsSession(vault);
      const { currentSession } = await import('../src/main/fs');
      const sess = currentSession()!;

      const runner = {
        async run(args: { prompt: string; title: string }): Promise<{
          runId: string;
          finalText: string;
        }> {
          expect(args.prompt).toContain('# Persona');
          expect(args.prompt).toContain('## Vision');
          return {
            runId: 'test-run-1',
            finalText: [
              '## Vision',
              'Restore calm workflow.',
              '## Key Decisions',
              '- chose JS fallback',
              '## Artifacts & Code',
              '- src/main/distill/distill.ts',
              '## Lessons Learned',
              '- keep it small',
              '## Reusable Patterns',
              '- embed input = title + body',
              '## Cost Snapshot',
              'tiny',
              '## Next Steps',
              '- M8 packaging'
            ].join('\n')
          };
        }
      };

      const res = await distillProject(
        { projectUid: 'PROJUID123456', archivedAbsPath: archivedAbs },
        { session: sess, runner }
      );

      expect(res.resourceRelPath.startsWith('03_Resources/distilled/')).toBe(true);
      const raw = await fs.readFile(res.resourcePath, 'utf8');
      expect(raw).toMatch(/type:\s*resource/);
      expect(raw).toMatch(/source_project_uid:\s*PROJUID123456/);
      expect(raw).toMatch(/title:\s*['"]?Distilled: P1['"]?/);
      expect(raw).toMatch(/- distilled/);
      expect(raw).toMatch(/## Vision/);
      expect(raw).toMatch(/## Next Steps/);

      const costs = await readCosts(vault);
      expect(costs.length).toBe(1);
      expect(costs[0]!.reason).toBe('distilled');
      expect(costs[0]!.runId).toBe('test-run-1');

      await closeFsSession();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
