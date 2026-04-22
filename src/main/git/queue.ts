/**
 * FIFO async mutex keyed by "scope" string.
 *
 * `run(scope, fn)` guarantees:
 *  - No two `fn` calls for the same scope execute concurrently.
 *  - Calls enqueued under the same scope run in insertion order.
 *  - Different scopes are fully independent.
 *
 * Used by the worktree manager + install lock to prevent simultaneous
 * `git worktree add/remove`, `git merge`, and package-manager installs
 * from corrupting one another's index / lockfiles.
 */
export class GitQueue {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly sizes = new Map<string, number>();

  run<T>(scope: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(scope) ?? Promise.resolve();
    this.sizes.set(scope, (this.sizes.get(scope) ?? 0) + 1);
    const next: Promise<T> = prev.then(fn, fn);
    const tracked: Promise<unknown> = next.then(
      () => undefined,
      () => undefined
    );
    const finalized = tracked.finally(() => {
      const n = (this.sizes.get(scope) ?? 1) - 1;
      if (n <= 0) {
        this.sizes.delete(scope);
        if (this.chains.get(scope) === finalized) this.chains.delete(scope);
      } else {
        this.sizes.set(scope, n);
      }
    });
    this.chains.set(scope, finalized);
    return next;
  }

  /** Number of queued + running tasks for a scope. */
  depth(scope: string): number {
    return this.sizes.get(scope) ?? 0;
  }
}

let singleton: GitQueue | null = null;
export function getGitQueue(): GitQueue {
  if (!singleton) singleton = new GitQueue();
  return singleton;
}

/** For tests only. */
export function resetGitQueueForTesting(): void {
  singleton = null;
}
