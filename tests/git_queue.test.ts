import { describe, expect, it } from 'vitest';
import { GitQueue } from '../src/main/git/queue';

describe('GitQueue', () => {
  it('serializes overlapping ops under the same scope in FIFO order', async () => {
    const q = new GitQueue();
    const log: string[] = [];
    const gate = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>()
    ];

    const p1 = q.run('global', async () => {
      log.push('a:start');
      await gate[0]!.promise;
      log.push('a:end');
      return 'a';
    });
    const p2 = q.run('global', async () => {
      log.push('b:start');
      await gate[1]!.promise;
      log.push('b:end');
      return 'b';
    });
    const p3 = q.run('global', async () => {
      log.push('c:start');
      await gate[2]!.promise;
      log.push('c:end');
      return 'c';
    });

    // Give the first task a chance to attach.
    await flushMicrotasks();
    expect(log).toEqual(['a:start']);

    gate[0]!.resolve();
    await p1;
    await flushMicrotasks();
    expect(log).toEqual(['a:start', 'a:end', 'b:start']);

    gate[1]!.resolve();
    await p2;
    await flushMicrotasks();
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start']);

    gate[2]!.resolve();
    const [x, y, z] = await Promise.all([p1, p2, p3]);
    expect([x, y, z]).toEqual(['a', 'b', 'c']);
  });

  it('runs different scopes concurrently', async () => {
    const q = new GitQueue();
    const a = deferred<void>();
    const b = deferred<void>();
    const p1 = q.run('s1', async () => {
      await a.promise;
      return 1;
    });
    const p2 = q.run('s2', async () => {
      await b.promise;
      return 2;
    });
    // If these were serialized, p2 would block. Resolve in reverse order to prove independence.
    b.resolve();
    const r2 = await p2;
    expect(r2).toBe(2);
    a.resolve();
    const r1 = await p1;
    expect(r1).toBe(1);
  });

  it('continues after a rejected job', async () => {
    const q = new GitQueue();
    const p1 = q.run('x', async () => {
      throw new Error('boom');
    });
    await expect(p1).rejects.toThrow('boom');
    const p2 = q.run('x', async () => 42);
    expect(await p2).toBe(42);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  // A setImmediate + a few microtask turns is enough for queued `.then()`
  // chains to settle without depending on real timers.
  await new Promise((r) => setImmediate(r));
  await Promise.resolve();
  await Promise.resolve();
}
