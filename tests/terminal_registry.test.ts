import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSessionRegistryForTests,
  getOrCreateSession
} from '../src/renderer/src/components/Terminal/sessionRegistry';

describe('session registry', () => {
  afterEach(() => {
    __resetSessionRegistryForTests();
  });

  it('deduplicates concurrent opens for the same session key', async () => {
    const info = {
      id: 'sess-1',
      pid: 123,
      cwd: '/tmp/project',
      shell: '/bin/zsh',
      createdAt: '2026-04-22T00:00:00.000Z'
    };
    const open = vi.fn(async () => info);

    const [a, b] = await Promise.all([
      getOrCreateSession('project::leaf-1', open),
      getOrCreateSession('project::leaf-1', open)
    ]);

    expect(open).toHaveBeenCalledTimes(1);
    expect(a).toBe(info);
    expect(b).toBe(info);
  });
});
