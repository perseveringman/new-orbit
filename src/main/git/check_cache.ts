import type { CheckReport } from '@shared/git';

export interface CachedCheckEntry {
  report: CheckReport;
  at: number;
  headSha: string | null;
}

/**
 * TTL + sha-keyed cache for pre-merge check results. A stored report is
 * only valid for {@link ttlMs} milliseconds, *and* invalidates if the
 * worktree's HEAD sha has moved on since capture. The merge handler
 * consults this cache before allowing a merge — enforcing that the
 * caller has just run `preMergeCheck` and no new commits have landed.
 */
export class CheckCache {
  private readonly map = new Map<string, CachedCheckEntry>();

  constructor(
    private readonly ttlMs: number = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  set(worktreeId: string, report: CheckReport): void {
    this.map.set(worktreeId, {
      report,
      at: this.now(),
      headSha: report.headSha ?? null
    });
  }

  get(worktreeId: string): CachedCheckEntry | undefined {
    return this.map.get(worktreeId);
  }

  delete(worktreeId: string): void {
    this.map.delete(worktreeId);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * Returns an error `code` when the cache cannot authorize a merge:
   *  - `no_check`    never checked
   *  - `check_expired` TTL elapsed or HEAD moved
   *  - `check_failed`  build or secrets failed
   * Returns `null` when the cached report authorizes the merge.
   */
  gateMerge(worktreeId: string, currentHeadSha: string | null):
    | null
    | { code: 'no_check' | 'check_expired' | 'check_failed' } {
    const e = this.map.get(worktreeId);
    if (!e) return { code: 'no_check' };
    if (this.now() - e.at > this.ttlMs) return { code: 'check_expired' };
    if (e.headSha && currentHeadSha && e.headSha !== currentHeadSha) {
      return { code: 'check_expired' };
    }
    if (!e.report.build.ok || !e.report.secrets.ok) {
      return { code: 'check_failed' };
    }
    return null;
  }
}
