import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createVault } from '../../src/main/vault';
import { createProject } from '../../src/main/project';
import { ensureVision, writeVision } from '../../src/main/vision';
import { callTool, type ToolContext } from '../../src/mcp/tools';
import * as frontmatter from '../../src/main/frontmatter';
import { VectorStore } from '../../src/main/vector';
import { getEmbedder } from '../../src/main/vector/embed';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-mcp-tools-'));
  await createVault(d);
  return d;
}

function ctx(vault: string, slug: string, projectUid: string): ToolContext {
  return {
    vault,
    projectUid,
    projectSlug: slug,
    now: () => new Date('2025-04-21T12:00:00Z')
  };
}

async function readJsonResult(content: { text: string }[]): Promise<unknown> {
  return JSON.parse(content[0]!.text);
}

describe('mcp/tools — create_task', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('drops a four-section md file under .agent/tasks/ scoped to the project', async () => {
    const proj = await createProject(vault, {
      slug: 'demo',
      template: 'blank',
      name: 'Demo'
    });
    const c = ctx(vault, 'demo', proj.uid);
    const r = await callTool(c, 'create_task', {
      title: 'Wire MCP',
      description: 'Hook up create_task',
      priority: 'high',
      tags: ['mcp', 'r5']
    });
    expect(r.isError).toBeFalsy();
    const payload = (await readJsonResult(r.content)) as { uid: string; path: string };
    expect(payload.uid).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const raw = await fs.readFile(payload.path, 'utf8');
    expect(raw).toContain('# Description');
    expect(raw).toContain('Hook up create_task');
    expect(raw).toContain('# Agent Thinking');
    expect(raw).toContain('# Execution Log');
    expect(raw).toContain('# Summary');
    expect(raw).toContain('priority: high');
    expect(raw).toMatch(/tags:\s*\n\s*-\s*mcp/);
    expect(raw).toContain(`project_uid: ${proj.uid}`);
    // Lives under the project's tasks dir (filename uses our pinned now()).
    expect(payload.path.endsWith('20250421_wire-mcp.md')).toBe(true);
  });

  it('rejects empty title', async () => {
    const proj = await createProject(vault, {
      slug: 'demo',
      template: 'blank',
      name: 'Demo'
    });
    const r = await callTool(ctx(vault, 'demo', proj.uid), 'create_task', {});
    expect(r.isError).toBe(true);
  });
});

describe('mcp/tools — update_task_status', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('updates status when the task is inside the locked project', async () => {
    const proj = await createProject(vault, {
      slug: 'p1',
      template: 'blank',
      name: 'P1'
    });
    const c = ctx(vault, 'p1', proj.uid);
    const created = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'T1' })).content
    )) as { uid: string; path: string };
    const r = await callTool(c, 'update_task_status', {
      task_uid: created.uid,
      status: 'doing'
    });
    expect(r.isError).toBeFalsy();
    const raw = await fs.readFile(created.path, 'utf8');
    expect(raw).toMatch(/status: doing/);
  });

  it('refuses cross-project task uids (project scope guard)', async () => {
    const a = await createProject(vault, {
      slug: 'alpha',
      template: 'blank',
      name: 'Alpha'
    });
    const b = await createProject(vault, {
      slug: 'beta',
      template: 'blank',
      name: 'Beta'
    });
    const ca = ctx(vault, 'alpha', a.uid);
    const cb = ctx(vault, 'beta', b.uid);
    const aTask = (await readJsonResult(
      (await callTool(ca, 'create_task', { title: 'A1' })).content
    )) as { uid: string };
    // Trying to mutate alpha's task while bound to beta must fail.
    const r = await callTool(cb, 'update_task_status', {
      task_uid: aTask.uid,
      status: 'done'
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/not in project scope beta/);
  });

  it('rejects unknown statuses', async () => {
    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    const c = ctx(vault, 'p', proj.uid);
    const t = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'X' })).content
    )) as { uid: string };
    const r = await callTool(c, 'update_task_status', {
      task_uid: t.uid,
      status: 'frobnicated'
    });
    expect(r.isError).toBe(true);
  });
});

describe('mcp/tools — append_execution_log + log_thinking', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('appends timestamped lines to # Execution Log', async () => {
    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    const c = ctx(vault, 'p', proj.uid);
    const t = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'X' })).content
    )) as { uid: string; path: string };
    await callTool(c, 'append_execution_log', {
      task_uid: t.uid,
      line: 'started step 1'
    });
    await callTool(c, 'append_execution_log', {
      task_uid: t.uid,
      line: 'finished step 1'
    });
    const raw = await fs.readFile(t.path, 'utf8');
    expect(raw).toMatch(
      /# Execution Log\n- \[2025-04-21T12:00:00\.000Z\] started step 1\n- \[2025-04-21T12:00:00\.000Z\] finished step 1/
    );
  });

  it('log_thinking appends without a timestamp under # Agent Thinking', async () => {
    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    const c = ctx(vault, 'p', proj.uid);
    const t = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'X' })).content
    )) as { uid: string; path: string };
    await callTool(c, 'log_thinking', {
      task_uid: t.uid,
      note: 'plan: split into 3 steps'
    });
    const raw = await fs.readFile(t.path, 'utf8');
    expect(raw).toMatch(/# Agent Thinking\nplan: split into 3 steps/);
  });
});

describe('mcp/tools — get_vision', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('returns the body, frontmatter stripped', async () => {
    await ensureVision(vault);
    await writeVision(
      vault,
      ['---', 'uid: vis123', 'type: vision', '---', '# North Star', '', 'Be useful.'].join('\n')
    );
    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    const r = await callTool(ctx(vault, 'p', proj.uid), 'get_vision', {});
    expect(r.content[0]!.text).toBe('# North Star\n\nBe useful.');
  });

  it('returns empty string when Vision.md absent', async () => {
    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    await fs.rm(path.join(vault, 'Vision.md'), { force: true });
    const r = await callTool(ctx(vault, 'p', proj.uid), 'get_vision', {});
    expect(r.content[0]!.text).toBe('');
  });
});

describe('mcp/tools — search_global_context', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('reads the persisted vector store and ranks hits', async () => {
    const store = new VectorStore(vault);
    await store.load();
    const e = getEmbedder();
    store.upsert({
      id: 'r1',
      uid: 'u-r1',
      kind: 'resource',
      relPath: '03_Resources/r1.md',
      title: 'How we ship Orbit',
      excerpt: 'Notes on shipping Orbit reliably',
      embedding: e.embed('shipping orbit reliable releases')
    });
    store.upsert({
      id: 'r2',
      uid: 'u-r2',
      kind: 'resource',
      relPath: '03_Resources/r2.md',
      title: 'Cooking pasta',
      excerpt: 'Boil water; add pasta.',
      embedding: e.embed('boil water salt pasta cooking')
    });
    await store.flush();

    const proj = await createProject(vault, {
      slug: 'p',
      template: 'blank',
      name: 'P'
    });
    const r = await callTool(ctx(vault, 'p', proj.uid), 'search_global_context', {
      query: 'orbit shipping',
      k: 2
    });
    const payload = (await readJsonResult(r.content)) as {
      hits: { uid: string; score: number }[];
    };
    expect(payload.hits[0]!.uid).toBe('u-r1');
    expect(payload.hits[0]!.score).toBeGreaterThan(payload.hits[1]?.score ?? -1);
  });
});

describe('mcp/tools — checkpoint_commit', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('stages + commits with an Orbit-Task trailer', async () => {
    const proj = await createProject(vault, {
      slug: 'cp',
      template: 'blank',
      name: 'CP'
    });
    // Write a new file to give the commit something fresh.
    await fs.writeFile(path.join(proj.projectPath, 'note.md'), 'hello\n', 'utf8');
    const c = ctx(vault, 'cp', proj.uid);
    const r = await callTool(c, 'checkpoint_commit', {
      message: 'wip: notes',
      task_uid: 'task-uid-123'
    });
    expect(r.isError).toBeFalsy();
    const payload = (await readJsonResult(r.content)) as {
      committed: boolean;
      sha: string;
      message: string;
    };
    expect(payload.committed).toBe(true);
    expect(payload.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(payload.message).toBe('wip: notes\n\nOrbit-Task: task-uid-123');
    // Verify the trailer made it into the actual commit.
    await new Promise<void>((resolve, reject) => {
      const g = spawn('git', ['log', '-1', '--pretty=%B'], { cwd: proj.projectPath });
      let out = '';
      g.stdout.on('data', (b: Buffer) => (out += b.toString('utf8')));
      g.on('close', (code) => {
        if (code !== 0) return reject(new Error(`git log failed (${code})`));
        expect(out).toContain('wip: notes');
        expect(out).toContain('Orbit-Task: task-uid-123');
        resolve();
      });
    });
  });

  it('returns committed:false on a clean working tree', async () => {
    const proj = await createProject(vault, {
      slug: 'cp2',
      template: 'blank',
      name: 'CP2'
    });
    const r = await callTool(ctx(vault, 'cp2', proj.uid), 'checkpoint_commit', {
      message: 'noop'
    });
    const payload = (await readJsonResult(r.content)) as { committed: boolean };
    expect(payload.committed).toBe(false);
  });
});

void frontmatter; // keep import for type narrowing in future expansions
