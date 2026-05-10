import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject, listProjects, readProjectConfig } from '../src/main/project';
import { listTemplates } from '../src/main/templates';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-proj-create-'));
  await createVault(d);
  return d;
}

describe('project.create (R1)', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('listTemplates exposes blank, web-app, research, writing', () => {
    const ids = listTemplates().map((t) => t.id).sort();
    expect(ids).toEqual(['blank', 'research', 'web-app', 'writing']);
  });

  it('scaffolds a folder-backed project with .orbit, AGENT.md, README.md, .gitignore and a git repo', async () => {
    const res = await createProject(vault, {
      slug: 'my-demo',
      template: 'blank',
      name: 'My Demo',
      description: 'R1 smoke project'
    });
    expect(res.slug).toBe('my-demo');
    expect(res.uid).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(res.projectPath).toBe(path.join(vault, '01_Projects', 'my-demo'));

    // Expected files
    const agent = await fs.readFile(path.join(res.projectPath, 'AGENT.md'), 'utf8');
    expect(agent).toContain('My Demo');
    expect(agent).toContain('execution_context: worktree');
    expect(agent).not.toContain('{{');

    const readme = await fs.readFile(path.join(res.projectPath, 'README.md'), 'utf8');
    expect(readme).toContain(`uid: ${res.uid}`);
    expect(readme).toContain('type: project');
    expect(readme).toContain('slug: my-demo');
    expect(readme).toContain('status: active');
    expect(readme).toContain('template: blank');

    const gi = await fs.readFile(path.join(res.projectPath, '.gitignore'), 'utf8');
    expect(gi).toMatch(/node_modules/);
    expect(gi).toMatch(/dist/);

    const cfgRaw = await fs.readFile(
      path.join(res.projectPath, '.orbit', 'config.json'),
      'utf8'
    );
    const cfg = JSON.parse(cfgRaw) as { uid: string; slug: string; template: string };
    expect(cfg.uid).toBe(res.uid);
    expect(cfg.slug).toBe('my-demo');
    expect(cfg.template).toBe('blank');

    // Empty dirs placeholded
    const tasksStat = await fs.stat(path.join(res.projectPath, '.orbit', 'agent', 'tasks'));
    expect(tasksStat.isDirectory()).toBe(true);
    const memStat = await fs.stat(path.join(res.projectPath, '.orbit', 'agent', 'memories'));
    expect(memStat.isDirectory()).toBe(true);

    const skillsDir = path.join(res.projectPath, '.orbit', 'agent', 'skills');
    expect((await fs.stat(skillsDir)).isDirectory()).toBe(true);
    const logsDir = path.join(res.projectPath, '.orbit', 'agent', 'logs');
    expect((await fs.stat(logsDir)).isDirectory()).toBe(true);
    await expect(fs.stat(path.join(res.projectPath, 'tasks'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(res.projectPath, 'assets', '_manifest.md'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(res.projectPath, 'assets', 'imported'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(res.projectPath, 'assets', 'references'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(res.projectPath, 'outputs', '_manifest.md'))).resolves.toBeDefined();

    const skillFiles = [
      '_index.md',
      'orbit-world.md',
      'task-workflow.md',
      'project-understanding.md',
      'tooling-commands.md',
      'worktree-workflow.md',
      'safety-rules.md',
      'orbit-cli.md'
    ];
    for (const name of skillFiles) {
      const raw = await fs.readFile(path.join(skillsDir, name), 'utf8');
      expect(raw.length).toBeGreaterThan(20);
    }

    const claude = await fs.readFile(path.join(res.projectPath, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('.orbit/agent/skills/_index.md');
    expect(claude).toContain('.orbit/agent/logs/TIMELINE.md');

    const codex = await fs.readFile(path.join(res.projectPath, 'CODEX.md'), 'utf8');
    expect(codex).toContain('.orbit/agent/skills/_index.md');

    const gemini = await fs.readFile(path.join(res.projectPath, 'GEMINI.md'), 'utf8');
    expect(gemini).toContain('.orbit/agent/skills/_index.md');

    const timeline = await fs.readFile(
      path.join(res.projectPath, '.orbit', 'agent', 'logs', 'TIMELINE.md'),
      'utf8'
    );
    expect(timeline).toContain('# 操作时间线');

    // Git repo initialized
    const gitDir = await fs.stat(path.join(res.projectPath, '.git'));
    expect(gitDir.isDirectory()).toBe(true);
  });

  it('web-app, research, writing templates add their distinctive directories', async () => {
    const web = await createProject(vault, {
      slug: 'web1',
      template: 'web-app',
      name: 'Web1'
    });
    await fs.stat(path.join(web.projectPath, 'src'));
    await fs.stat(path.join(web.projectPath, 'docs'));

    const research = await createProject(vault, {
      slug: 'r1',
      template: 'research',
      name: 'R1'
    });
    await fs.stat(path.join(research.projectPath, 'docs'));
    await fs.stat(path.join(research.projectPath, 'notes'));
    await expect(readProjectConfig(research.projectPath)).resolves.toMatchObject({
      execution_context: 'sandbox'
    });
    await expect(fs.readFile(path.join(research.projectPath, 'AGENT.md'), 'utf8')).resolves.toContain(
      'execution_context: sandbox'
    );

    const writing = await createProject(vault, {
      slug: 'w1',
      template: 'writing',
      name: 'W1'
    });
    await fs.stat(path.join(writing.projectPath, 'drafts'));
    await fs.stat(path.join(writing.projectPath, 'final'));
    await expect(readProjectConfig(writing.projectPath)).resolves.toMatchObject({
      execution_context: 'sandbox'
    });
  });

  it('rejects existing slugs and invalid slugs', async () => {
    await createProject(vault, { slug: 'dup', template: 'blank', name: 'Dup' });
    await expect(
      createProject(vault, { slug: 'dup', template: 'blank', name: 'Dup2' })
    ).rejects.toThrow(/already exists/);

    await expect(
      createProject(vault, { slug: 'Not-Kebab', template: 'blank', name: 'x' })
    ).rejects.toThrow(/invalid slug/);

    await expect(
      createProject(vault, { slug: '-leading', template: 'blank', name: 'x' })
    ).rejects.toThrow(/invalid slug/);
  });

  it('listProjects surfaces the new folder-backed project as non-legacy', async () => {
    const res = await createProject(vault, {
      slug: 'alpha',
      template: 'blank',
      name: 'Alpha'
    });
    const list = await listProjects(vault);
    const p = list.find((x) => x.slug === 'alpha');
    expect(p).toBeTruthy();
    expect(p!.uid).toBe(res.uid);
    expect(p!.legacy).toBe(false);
    expect(p!.status).toBe('active');
    expect(p!.name).toBe('Alpha');
  });

  it('listProjects flags legacy single-file projects', async () => {
    await fs.writeFile(
      path.join(vault, '01_Projects', 'legacy-one.md'),
      '---\nuid: LEGACYUID1234\ntype: project\ntitle: Legacy One\nstatus: active\n---\nbody\n',
      'utf8'
    );
    const list = await listProjects(vault);
    const p = list.find((x) => x.slug === 'legacy-one');
    expect(p).toBeTruthy();
    expect(p!.legacy).toBe(true);
    expect(p!.uid).toBe('LEGACYUID1234');
  });
});
