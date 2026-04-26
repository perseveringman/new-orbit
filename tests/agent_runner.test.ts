import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { SpawnOptions, spawn as nodeSpawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRunner, mapStreamJson } from '../src/main/agent/runner';
import { RunnerPool } from '../src/main/agent/pool';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  pid = process.pid;
  kill(): boolean {
    this.killed = true;
    this.emit('close', 0);
    return true;
  }
}

function fakeSpawner(): { spawn: typeof nodeSpawn; last: () => FakeChild } {
  let last: FakeChild | null = null;
  const s = ((): FakeChild => {
    last = new FakeChild();
    return last;
  }) as unknown as typeof nodeSpawn;
  return { spawn: s, last: () => last as FakeChild };
}

function delayedCloseSpawner(): { spawn: typeof nodeSpawn; last: () => FakeChild } {
  let last: FakeChild | null = null;
  const s = ((): FakeChild => {
    last = new FakeChild();
    last.kill = (): boolean => {
      last!.killed = true;
      setTimeout(() => last?.emit('close', 0), 0);
      return true;
    };
    return last;
  }) as unknown as typeof nodeSpawn;
  return { spawn: s, last: () => last as FakeChild };
}

function capturingSpawner(): {
  spawn: typeof nodeSpawn;
  last: () => FakeChild;
  lastArgs: () => string[];
  lastOptions: () => SpawnOptions | undefined;
} {
  let last: FakeChild | null = null;
  let lastArgs: string[] = [];
  let lastOptions: SpawnOptions | undefined;
  const s = ((_: string, args?: readonly string[], options?: SpawnOptions): FakeChild => {
    last = new FakeChild();
    lastArgs = [...(args ?? [])];
    lastOptions = options;
    return last;
  }) as unknown as typeof nodeSpawn;
  return {
    spawn: s,
    last: () => last as FakeChild,
    lastArgs: () => lastArgs,
    lastOptions: () => lastOptions
  };
}

describe('mapStreamJson', () => {
  it('normalizes a cost/result event', () => {
    const ev = mapStreamJson(
      {
        type: 'result',
        input_tokens: 42,
        output_tokens: 88,
        total_cost_usd: 0.01
      },
      0
    );
    expect(ev.kind).toBe('cost');
    expect(ev.input_tokens).toBe(42);
    expect(ev.output_tokens).toBe(88);
    expect(ev.total_cost_usd).toBe(0.01);
  });
  it('extracts assistant text', () => {
    const ev = mapStreamJson(
      { type: 'message', role: 'assistant', content: [{ text: 'hi' }] },
      1
    );
    expect(ev.kind).toBe('message');
    expect(ev.text).toBe('hi');
  });
  it('extracts nested assistant text from real Claude stream-json events', () => {
    const ev = mapStreamJson(
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello from nested message' }]
        }
      },
      2
    );
    expect(ev.kind).toBe('message');
    expect(ev.text).toBe('hello from nested message');
  });
});

describe('RunnerPool', () => {
  it('rejects duplicate taskId with already_running', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-pool-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const pool = new RunnerPool();
      const { spawn } = fakeSpawner();

      const opts = {
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: 'file:foo',
        vaultPath: vault,
        spawner: spawn
      } as const;

      const first = await pool.spawn(opts);
      expect(first.runId).toBeTruthy();

      await expect(pool.spawn(opts)).rejects.toMatchObject({
        code: 'already_running'
      });

      // Simulate the first run completing so the task slot clears.
      await first.stop('test');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('emits unified compatibility events alongside legacy events', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-pool-unified-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const pool = new RunnerPool();
      const { spawn, last } = fakeSpawner();
      const seen: Array<{ legacy: string; unified: string }> = [];
      pool.on('event', (event) => {
        seen.push({ legacy: event.event.kind, unified: event.unifiedEvent.kind });
      });

      await pool.spawn({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: 'file:foo',
        vaultPath: vault,
        spawner: spawn,
        runtimeId: 'claude:/bin/true',
        runtimeName: 'Claude test'
      });
      const child = last();
      child.stdout.write('{"type":"message","role":"assistant","content":"hi"}\n');
      child.emit('close', 0);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(seen).toEqual(
        expect.arrayContaining([
          { legacy: 'message', unified: 'message' },
          { legacy: 'done', unified: 'done' }
        ])
      );
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});

describe('AgentRunner stream parsing', () => {
  it('parses JSON lines from stdout and emits typed events', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last } = fakeSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn,
        idleTimeoutMs: 60_000
      });

      const seen: string[] = [];
      runner.on('event', (ev) => seen.push(ev.kind));

      await runner.start();
      const child = last();
      child.stdout.write(
        '{"type":"message","role":"assistant","content":[{"text":"hi"}]}\n'
      );
      child.stdout.write('{"type":"result","input_tokens":10,"output_tokens":20}\n');
      // finish
      child.stdout.end();
      child.emit('close', 0);

      await new Promise((r) => setTimeout(r, 20));
      expect(seen).toContain('message');
      expect(seen).toContain('cost');
      expect(seen).toContain('done');
      // Log file was created
      const logs = await fs.readdir(path.join(vault, '.orbit', 'logs'));
      expect(logs.some((f) => f.endsWith('.log'))).toBe(true);
      const ndjson = logs.find((f) => f.endsWith('.ndjson'));
      expect(ndjson).toBeTruthy();
      const raw = await fs.readFile(path.join(vault, '.orbit', 'logs', ndjson!), 'utf8');
      const parsed = raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { kind: string });
      expect(parsed.some((ev) => ev.kind === 'message')).toBe(true);
      expect(parsed.some((ev) => ev.kind === 'cost')).toBe(true);
      expect(parsed.some((ev) => ev.kind === 'done')).toBe(true);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('starts Claude with -p prompt in one-shot mode without MCP auto-loading', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-input-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last, lastArgs, lastOptions } = capturingSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'plan the change',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn,
        idleTimeoutMs: 60_000
      });

      await runner.start();
      const child = last();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(lastArgs()).toContain('-p');
      expect(lastArgs()).toContain('plan the change');
      expect(lastArgs()).not.toContain('--input-format');
      expect(lastArgs()).not.toContain('--mcp-config');
      expect(lastOptions()?.stdio).toEqual(['ignore', 'pipe', 'pipe']);
      expect(child.stdin.read()).toBeNull();

      await runner.stop('test');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('treats stderr lines as stream text instead of terminal errors', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-stderr-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last } = fakeSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn,
        idleTimeoutMs: 60_000
      });

      await runner.start();
      const child = last();
      child.stderr.write('Warning: no stdin data received in 3s\n');
      child.emit('close', 0);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stderrEvent = runner
        .snapshot()
        .events.find((event) => event.text?.includes('no stdin data received in 3s'));
      expect(stderrEvent?.kind).toBe('text');
      expect(stderrEvent?.data).toEqual({ stream: 'stderr' });

      await runner.stop('test');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('does not leak an unhandled rejection when the active file disappears during shutdown', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-race-'));
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last } = fakeSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn,
        idleTimeoutMs: 60_000
      });

      await runner.start();
      const child = last();
      const renameSpy = vi
        .spyOn(nodeFs.promises, 'rename')
        .mockRejectedValueOnce(
          Object.assign(new Error('missing active file'), { code: 'ENOENT' })
        );

      await runner.stop('test');
      await new Promise((resolve) => setTimeout(resolve, 50));
      renameSpy.mockRestore();

      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('waits for runner shutdown bookkeeping before stop resolves', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-stop-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn } = delayedCloseSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: 'file:foo',
        vaultPath: vault,
        spawner: spawn,
        idleTimeoutMs: 60_000
      });

      await runner.start();
      await runner.stop('test');

      expect(runner.summary.status).toBe('killed');

      const activePath = path.join(vault, '.orbit', 'logs', '_active.json');
      const activeRaw = await fs.readFile(activePath, 'utf8');
      const active = JSON.parse(activeRaw) as Record<string, unknown>;
      expect(active).not.toHaveProperty(runner.runId);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
