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
import { PROJECT_OPERATION_LOG, PROJECT_TIMELINE } from '../../src/shared/constants';

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

  it('records a blocked reason and clears it after the task resumes', async () => {
    const proj = await createProject(vault, {
      slug: 'p1',
      template: 'blank',
      name: 'P1'
    });
    const c = ctx(vault, 'p1', proj.uid);
    const created = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'T1' })).content
    )) as { uid: string; path: string };

    const blocked = await callTool(c, 'update_task_status', {
      task_uid: created.uid,
      status: 'blocked',
      reason: 'Need the API contract before implementation'
    });
    expect(blocked.isError).toBeFalsy();
    const blockedRaw = await fs.readFile(created.path, 'utf8');
    expect(blockedRaw).toMatch(/status: blocked/);
    expect(blockedRaw).toMatch(/blocked_reason: Need the API contract before implementation/);

    const resumed = await callTool(c, 'update_task_status', {
      task_uid: created.uid,
      status: 'doing'
    });
    expect(resumed.isError).toBeFalsy();
    const resumedRaw = await fs.readFile(created.path, 'utf8');
    expect(resumedRaw).toMatch(/status: doing/);
    expect(resumedRaw).not.toMatch(/blocked_reason:/);
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

describe('mcp/tools — scheme D agent context', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('records tool calls into operations.jsonl and TIMELINE.md', async () => {
    const proj = await createProject(vault, {
      slug: 'logs',
      template: 'blank',
      name: 'Logs'
    });
    const c = ctx(vault, 'logs', proj.uid);
    const created = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'Track me', priority: 'high' })).content
    )) as { uid: string };
    await callTool(c, 'update_task_status', {
      task_uid: created.uid,
      status: 'doing'
    });

    const rawLog = await fs.readFile(
      path.join(proj.projectPath, '.agent', 'logs', PROJECT_OPERATION_LOG),
      'utf8'
    );
    const entries = rawLog
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { tool: string; taskUid?: string; sessionPid: number });
    expect(entries.map((e) => e.tool)).toEqual(['create_task', 'update_task_status']);
    expect(entries[1]!.taskUid).toBe(created.uid);
    expect(entries[0]!.sessionPid).toBeGreaterThan(0);

    const timeline = await fs.readFile(
      path.join(proj.projectPath, '.agent', 'logs', PROJECT_TIMELINE),
      'utf8'
    );
    expect(timeline).toContain('# 操作时间线');
    expect(timeline).toContain('创建任务');
    expect(timeline).toContain(created.uid);
  });

  it('list_tasks returns structured tasks for the current project only', async () => {
    const alpha = await createProject(vault, {
      slug: 'alpha',
      template: 'blank',
      name: 'Alpha'
    });
    const beta = await createProject(vault, {
      slug: 'beta',
      template: 'blank',
      name: 'Beta'
    });
    const alphaCtx = ctx(vault, 'alpha', alpha.uid);
    const betaCtx = ctx(vault, 'beta', beta.uid);
    await callTool(alphaCtx, 'create_task', { title: 'Alpha one' });
    await callTool(alphaCtx, 'create_task', { title: 'Alpha two' });
    await callTool(betaCtx, 'create_task', { title: 'Beta only' });

    const payload = (await readJsonResult(
      (await callTool(alphaCtx, 'list_tasks', {})).content
    )) as {
      tasks: { title: string }[];
      count: number;
    };
    expect(payload.count).toBe(2);
    expect(payload.tasks.map((task) => task.title)).toEqual(['Alpha one', 'Alpha two']);
  });

  it('get_project_state returns git + active task summary', async () => {
    const proj = await createProject(vault, {
      slug: 'stateful',
      template: 'blank',
      name: 'Stateful'
    });
    const c = ctx(vault, 'stateful', proj.uid);
    const created = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'Active task' })).content
    )) as { uid: string };
    await callTool(c, 'update_task_status', { task_uid: created.uid, status: 'doing' });
    await fs.writeFile(path.join(proj.projectPath, 'scratch.txt'), 'dirty\n', 'utf8');

    const payload = (await readJsonResult(
      (await callTool(c, 'get_project_state', {})).content
    )) as {
      git: { isRepo: boolean; dirty: boolean };
      activeTasks: { uid: string; title: string; status: string }[];
    };
    expect(payload.git.isRepo).toBe(true);
    expect(payload.git.dirty).toBe(true);
    expect(payload.activeTasks).toEqual([
      { uid: created.uid, title: 'Active task', status: 'doing' }
    ]);
  });

  it('read_operation_log and query_operation_log expose recent structured entries', async () => {
    const proj = await createProject(vault, {
      slug: 'query',
      template: 'blank',
      name: 'Query'
    });
    const c = ctx(vault, 'query', proj.uid);
    const created = (await readJsonResult(
      (await callTool(c, 'create_task', { title: 'Find me' })).content
    )) as { uid: string };
    await callTool(c, 'update_task_status', { task_uid: created.uid, status: 'doing' });

    const recent = (await readJsonResult(
      (await callTool(c, 'read_operation_log', { limit: 1 })).content
    )) as { entries: { tool: string }[] };
    expect(recent.entries).toHaveLength(1);
    expect(recent.entries[0]!.tool).toBe('update_task_status');

    const filtered = (await readJsonResult(
      (
        await callTool(c, 'query_operation_log', {
          taskUid: created.uid,
          tool: 'update_task_status'
        })
      ).content
    )) as { entries: { taskUid?: string; tool: string }[] };
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0]!.tool).toBe('update_task_status');
    expect(filtered.entries[0]!.taskUid).toBe(created.uid);
  });
});

void frontmatter; // keep import for type narrowing in future expansions
