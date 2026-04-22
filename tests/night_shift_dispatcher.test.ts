import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CheckReport } from '@shared/git';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import {
  NightShiftDispatcher,
  topoSort,
  type StubRunner,
  type RunnerSpawnArgs
} from '../src/main/night_shift/dispatcher';
import * as frontmatter from '../src/main/frontmatter';

async function tmpVault(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-ns-'));
  await createVault(d);
  return d;
}

async function writeTask(
  vault: string,
  projectSlug: string,
  uid: string,
  title: string,
  opts: { pre?: string[]; status?: string } = {}
): Promise<string> {
  const taskDir = path.join(vault, '01_Projects', projectSlug, '.agent', 'tasks');
  await fs.mkdir(taskDir, { recursive: true });
  const abs = path.join(taskDir, `${uid}.md`);
  const fm: string[] = ['---'];
  fm.push(`uid: ${uid}`);
  fm.push(`type: task`);
  fm.push(`title: ${JSON.stringify(title)}`);
  fm.push(`status: ${opts.status ?? 'inbox'}`);
  if (opts.pre && opts.pre.length) {
    fm.push(`pre_conditions: [${opts.pre.map((u) => JSON.stringify(u)).join(', ')}]`);
  }
  fm.push('---');
  fm.push('');
  fm.push('## Description');
  fm.push(title);
  fm.push('');
  fm.push('## Thinking');
  fm.push('## Execution Log');
  fm.push('## Summary');
  await fs.writeFile(abs, fm.join('\n') + '\n', 'utf8');
  return abs;
}

function passingCheck(): CheckReport {
  return {
    build: { ok: true, exitCode: 0, logTail: '' },
    secrets: { ok: true, findings: [] },
    at: new Date().toISOString(),
    headSha: 'abc'
  };
}

function failingCheck(): CheckReport {
  return {
    build: { ok: false, exitCode: 1, logTail: 'npm ERR! missing script' },
    secrets: { ok: true, findings: [] },
    at: new Date().toISOString(),
    headSha: 'abc'
  };
}

function makeOkRunner(): (a: RunnerSpawnArgs) => Promise<StubRunner> {
  return async (a: RunnerSpawnArgs): Promise<StubRunner> => ({
    runId: `fake-${a.taskUid}`,
    stop: async () => undefined,
    whenExit: () => Promise.resolve({ ok: true })
  });
}

async function waitForDone(disp: NightShiftDispatcher, runId: string): Promise<void> {
  await new Promise<void>((resolve) => disp.once('done', () => resolve()));
  void runId;
}

describe('topoSort', () => {
  it('orders deps before dependents', () => {
    const r = topoSort([
      { uid: 'a', deps: ['b'] },
      { uid: 'b', deps: [] },
      { uid: 'c', deps: ['a'] }
    ]);
    expect(r.cycle).toBeNull();
    expect(r.order).toEqual(['b', 'a', 'c']);
  });

  it('detects cycles', () => {
    const r = topoSort([
      { uid: 'a', deps: ['b'] },
      { uid: 'b', deps: ['a'] }
    ]);
    expect(r.cycle).not.toBeNull();
  });

  it('ignores external deps that are not in the set', () => {
    const r = topoSort([
      { uid: 'a', deps: ['external-x'] }
    ]);
    expect(r.cycle).toBeNull();
    expect(r.order).toEqual(['a']);
  });
});

describe('NightShiftDispatcher', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await tmpVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('runs two tasks concurrently with stub runner, honours pre-merge success, marks done', async () => {
    await createProject(vault, { slug: 'p1', template: 'blank', name: 'P1' });
    await writeTask(vault, 'p1', 'nsuid000001', 'Task one');
    await writeTask(vault, 'p1', 'nsuid000002', 'Task two');

    const disp = new NightShiftDispatcher(vault, {
      spawnRunner: makeOkRunner(),
      preMergeCheck: async () => passingCheck(),
      hasGh: async () => false,
      createWorktree: async () => undefined,
      removeWorktree: async () => undefined
    });
    const runId = await disp.start({
      taskUids: ['nsuid000001', 'nsuid000002'],
      concurrency: 2,
      createPR: false
    });
    await waitForDone(disp, runId);
    const r = disp.get(runId)!;
    expect(r.status).toBe('done');
    expect(r.summary?.done).toBe(2);
    expect(r.summary?.blocked).toBe(0);
    // task file is marked done
    const raw = await fs.readFile(
      path.join(vault, '01_Projects', 'p1', '.agent', 'tasks', 'nsuid000001.md'),
      'utf8'
    );
    const { data } = frontmatter.read(raw);
    expect(data['status']).toBe('done');
    expect(data['git_branch']).toBe('orbit/night/nsuid000001');
  });

  it('DAG pre_conditions enforce execution order — dependent starts only after dep done', async () => {
    await createProject(vault, { slug: 'p2', template: 'blank', name: 'P2' });
    await writeTask(vault, 'p2', 'nsuid000010', 'First');
    await writeTask(vault, 'p2', 'nsuid000011', 'Second', { pre: ['nsuid000010'] });

    const events: string[] = [];
    const disp = new NightShiftDispatcher(vault, {
      spawnRunner: async (a) => {
        events.push(`start:${a.taskUid}`);
        return {
          runId: a.taskUid,
          stop: async () => undefined,
          whenExit: () =>
            new Promise((r) => setTimeout(() => r({ ok: true }), 10))
        };
      },
      preMergeCheck: async () => passingCheck(),
      hasGh: async () => false,
      createWorktree: async () => undefined,
      removeWorktree: async () => undefined
    });
    const runId = await disp.start({
      taskUids: ['nsuid000011', 'nsuid000010'],
      concurrency: 4,
      createPR: false
    });
    await waitForDone(disp, runId);
    expect(events[0]).toBe('start:nsuid000010');
    expect(events[1]).toBe('start:nsuid000011');
  });

  it('pre-merge failure → task blocked with reason in exec log', async () => {
    await createProject(vault, { slug: 'p3', template: 'blank', name: 'P3' });
    const abs = await writeTask(vault, 'p3', 'nsuid000020', 'Broken');
    const disp = new NightShiftDispatcher(vault, {
      spawnRunner: makeOkRunner(),
      preMergeCheck: async () => failingCheck(),
      hasGh: async () => false,
      createWorktree: async () => undefined,
      removeWorktree: async () => undefined
    });
    const runId = await disp.start({
      taskUids: ['nsuid000020'],
      concurrency: 1,
      createPR: false
    });
    await waitForDone(disp, runId);
    const r = disp.get(runId)!;
    expect(r.summary?.blocked).toBe(1);
    expect(r.summary?.done).toBe(0);

    const raw = await fs.readFile(abs, 'utf8');
    const { data, body } = frontmatter.read(raw);
    expect(data['status']).toBe('blocked');
    expect(body).toContain('build failed');
  });

  it('skips PR step when gh is not available', async () => {
    await createProject(vault, { slug: 'p4', template: 'blank', name: 'P4' });
    await writeTask(vault, 'p4', 'nsuid000030', 'NoGh');
    let ghCalls = 0;
    const disp = new NightShiftDispatcher(vault, {
      spawnRunner: makeOkRunner(),
      preMergeCheck: async () => passingCheck(),
      hasGh: async () => false,
      runGh: async () => {
        ghCalls++;
        return { stdout: '', code: 1 };
      },
      createWorktree: async () => undefined,
      removeWorktree: async () => undefined
    });
    const runId = await disp.start({
      taskUids: ['nsuid000030'],
      concurrency: 1,
      createPR: true
    });
    await waitForDone(disp, runId);
    expect(ghCalls).toBe(0);
  });

  it('cancel() stops all in-flight runners and marks pending tasks cancelled', async () => {
    await createProject(vault, { slug: 'p5', template: 'blank', name: 'P5' });
    await writeTask(vault, 'p5', 'nsuid000040', 'Slow A');
    await writeTask(vault, 'p5', 'nsuid000041', 'Slow B');

    const stopped: string[] = [];
    const disp = new NightShiftDispatcher(vault, {
      spawnRunner: async (a: RunnerSpawnArgs): Promise<StubRunner> => {
        let resolver: ((v: { ok: boolean; reason?: string }) => void) | null = null;
        const waiter = new Promise<{ ok: boolean; reason?: string }>((r) => {
          resolver = r;
        });
        return {
          runId: a.taskUid,
          stop: async (reason?: string) => {
            stopped.push(a.taskUid);
            resolver?.({ ok: false, reason: reason ?? 'stopped' });
          },
          whenExit: () => waiter
        };
      },
      preMergeCheck: async () => passingCheck(),
      hasGh: async () => false,
      createWorktree: async () => undefined,
      removeWorktree: async () => undefined
    });
    const runId = await disp.start({
      taskUids: ['nsuid000040', 'nsuid000041'],
      concurrency: 2,
      createPR: false
    });
    // give the dispatcher a tick to spawn runners
    await new Promise((r) => setTimeout(r, 30));
    const done = new Promise<void>((resolve) => disp.once('done', () => resolve()));
    await disp.cancel(runId);
    await done;
    const r = disp.get(runId)!;
    expect(r.status).toBe('cancelled');
    expect(stopped.length).toBe(2);
    // all tasks ended in cancelled or blocked state
    for (const t of r.tasks) {
      expect(['cancelled', 'blocked', 'done']).toContain(t.phase);
    }
  });
});
