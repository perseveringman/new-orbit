import { spawn as nodeSpawn } from 'node:child_process';

export interface HasGhDeps {
  spawner?: typeof nodeSpawn;
  timeoutMs?: number;
}

let cached: { at: number; ok: boolean } | null = null;
const TTL_MS = 30_000;

/**
 * Detect whether the `gh` CLI is available on PATH.
 *
 * Spawns `gh --version` with a short timeout (default 500ms). Result is
 * memoized for `TTL_MS` so the Night Shift modal doesn't spawn repeatedly.
 */
export async function hasGhCli(deps: HasGhDeps = {}): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.ok;
  const spawner = deps.spawner ?? nodeSpawn;
  const timeoutMs = deps.timeoutMs ?? 500;
  const ok = await new Promise<boolean>((resolve) => {
    let done = false;
    let child: ReturnType<typeof nodeSpawn> | null = null;
    const finish = (v: boolean): void => {
      if (done) return;
      done = true;
      try {
        child?.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    try {
      child = spawner('gh', ['--version'], { stdio: 'ignore' });
    } catch {
      finish(false);
      return;
    }
    const t = setTimeout(() => finish(false), timeoutMs);
    t.unref?.();
    child.on('error', () => {
      clearTimeout(t);
      finish(false);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      finish(code === 0);
    });
  });
  cached = { at: now, ok };
  return ok;
}

export function resetGhCacheForTesting(): void {
  cached = null;
}
