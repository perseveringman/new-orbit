import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn as nodeSpawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRunner } from '../src/main/agent/runner';

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

describe('AgentRunner tool-invocation fallback (R6)', () => {
  it('routes `@orbit:tool:<name> <json>` stdout lines to onToolInvocation and writes reply to stdin when stream-json input is enabled', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-tool-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last } = fakeSpawner();

      let invokedName: string | null = null;
      let invokedArgs: Record<string, unknown> | null = null;

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn,
        inputMode: 'stream-json',
        onToolInvocation: async (name, args) => {
          invokedName = name;
          invokedArgs = args;
          return '{"ok":true,"uid":"taskabc"}';
        }
      });

      await runner.start();
      const child = last();
      const stdinChunks: string[] = [];
      child.stdin.on('data', (c: Buffer) => stdinChunks.push(c.toString('utf8')));

      child.stdout.write('@orbit:tool:create_task {"title":"Hello"}\n');
      // Let microtasks/promise chains settle.
      await new Promise((r) => setTimeout(r, 20));

      expect(invokedName).toBe('create_task');
      expect(invokedArgs).toEqual({ title: 'Hello' });
      const stdinMessages = stdinChunks
        .join('')
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              type: string;
              message: { role: string; content: Array<{ type: string; text: string }> };
            }
        );
      expect(stdinMessages[0]).toMatchObject({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'p' }] }
      });
      expect(stdinMessages[1]).toMatchObject({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '{"ok":true,"uid":"taskabc"}' }]
        }
      });

      const snap = runner.snapshot();
      expect(snap.events.some((e) => e.kind === 'text' && e.text?.includes('[tool] create_task')))
        .toBe(true);

      await runner.stop('test');
    } finally {
      await new Promise((r) => setTimeout(r, 20));
      await fs.rm(vault, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('when onToolInvocation is not supplied, invocation lines fall through unchanged', async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-runner-noop-'));
    try {
      await fs.mkdir(path.join(vault, '.orbit', 'logs'), { recursive: true });
      const { spawn, last } = fakeSpawner();

      const runner = new AgentRunner({
        claudePath: '/bin/true',
        prompt: 'p',
        cwd: vault,
        taskId: null,
        vaultPath: vault,
        spawner: spawn
      });
      await runner.start();
      const child = last();
      child.stdout.write('@orbit:tool:create_task {"title":"x"}\n');
      await new Promise((r) => setTimeout(r, 20));
      const snap = runner.snapshot();
      // Line got classified as plain text (fallbackPlain path), not as a tool event.
      expect(snap.events.some((e) => e.kind === 'text' && e.text?.includes('@orbit:tool')))
        .toBe(true);
      await runner.stop('test');
    } finally {
      await new Promise((r) => setTimeout(r, 20));
      await fs.rm(vault, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
