import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn as nodeSpawn } from 'node:child_process';
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
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
