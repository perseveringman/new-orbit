import { describe, expect, it } from 'vitest';
import { hasGhCli, resetGhCacheForTesting } from '../src/main/env/gh';

function makeSpawner(behavior: 'ok' | 'fail' | 'missing' | 'timeout') {
  return (() => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const child = {
      on(event: string, fn: (...a: unknown[]) => void): void {
        (listeners[event] ??= []).push(fn);
      },
      kill(): void {
        /* ignore */
      }
    };
    if (behavior === 'missing') {
      setImmediate(() => listeners['error']?.forEach((f) => f(new Error('ENOENT'))));
    } else if (behavior === 'ok') {
      setImmediate(() => listeners['close']?.forEach((f) => f(0)));
    } else if (behavior === 'fail') {
      setImmediate(() => listeners['close']?.forEach((f) => f(1)));
    } // timeout: never fire
    return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
  }) as unknown as typeof import('node:child_process').spawn;
}

describe('env.hasGhCli', () => {
  it('returns true when `gh --version` exits 0', async () => {
    resetGhCacheForTesting();
    const ok = await hasGhCli({ spawner: makeSpawner('ok') });
    expect(ok).toBe(true);
  });

  it('returns false on ENOENT', async () => {
    resetGhCacheForTesting();
    const ok = await hasGhCli({ spawner: makeSpawner('missing') });
    expect(ok).toBe(false);
  });

  it('returns false on non-zero exit', async () => {
    resetGhCacheForTesting();
    const ok = await hasGhCli({ spawner: makeSpawner('fail') });
    expect(ok).toBe(false);
  });

  it('returns false on timeout', async () => {
    resetGhCacheForTesting();
    const ok = await hasGhCli({ spawner: makeSpawner('timeout'), timeoutMs: 30 });
    expect(ok).toBe(false);
  });

  it('caches the result across calls', async () => {
    resetGhCacheForTesting();
    let calls = 0;
    const counting: typeof import('node:child_process').spawn = ((..._args: unknown[]) => {
      calls++;
      return (makeSpawner('ok') as unknown as (...a: unknown[]) => unknown)(
        ..._args
      );
    }) as unknown as typeof import('node:child_process').spawn;
    await hasGhCli({ spawner: counting });
    await hasGhCli({ spawner: counting });
    expect(calls).toBe(1);
  });
});
