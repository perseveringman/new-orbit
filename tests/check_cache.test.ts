import { describe, expect, it } from 'vitest';
import { CheckCache } from '../src/main/git/check_cache';
import type { CheckReport } from '@shared/git';

function okReport(headSha: string): CheckReport {
  return {
    build: { ok: true, exitCode: 0, logTail: '' },
    secrets: { ok: true, findings: [] },
    at: new Date().toISOString(),
    headSha
  };
}

function badBuild(headSha: string): CheckReport {
  return {
    build: { ok: false, exitCode: 1, logTail: 'oh no' },
    secrets: { ok: true, findings: [] },
    at: new Date().toISOString(),
    headSha
  };
}

describe('CheckCache.gateMerge', () => {
  it('returns no_check when nothing is cached', () => {
    const c = new CheckCache();
    expect(c.gateMerge('w1', 'sha')).toEqual({ code: 'no_check' });
  });

  it('authorizes within TTL + matching sha', () => {
    const t = 1000;
    const c = new CheckCache(60_000, () => t);
    c.set('w1', okReport('aaa'));
    expect(c.gateMerge('w1', 'aaa')).toBeNull();
  });

  it('rejects with check_expired after TTL', () => {
    let t = 1000;
    const c = new CheckCache(60_000, () => t);
    c.set('w1', okReport('aaa'));
    t += 61_000;
    expect(c.gateMerge('w1', 'aaa')).toEqual({ code: 'check_expired' });
  });

  it('rejects with check_expired when HEAD sha has moved', () => {
    let t = 1000;
    const c = new CheckCache(60_000, () => t);
    c.set('w1', okReport('aaa'));
    t += 1000;
    expect(c.gateMerge('w1', 'bbb')).toEqual({ code: 'check_expired' });
  });

  it('rejects with check_failed when build or secrets failed', () => {
    const c = new CheckCache();
    c.set('w1', badBuild('aaa'));
    expect(c.gateMerge('w1', 'aaa')).toEqual({ code: 'check_failed' });
  });
});
