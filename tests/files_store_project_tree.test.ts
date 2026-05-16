/**
 * Unit tests for useFiles.refreshProjectTree — covers:
 *  1. Stale tree cleared synchronously before await (Issue 1)
 *  2. IPC errors surface a toast and don't leave the panel stuck (Issue 2)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock window.orbit before importing the store
// ---------------------------------------------------------------------------

const mockListProjectTree = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = {
  orbit: {
    fs: {
      listProjectTree: mockListProjectTree,
      listTree: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn(() => () => {}),
      readFile: vi.fn(),
      backlinksOf: vi.fn().mockResolvedValue([]),
      writeFile: vi.fn(),
      createFile: vi.fn(),
      rename: vi.fn(),
      deleteFile: vi.fn(),
      search: vi.fn(),
      exists: vi.fn(),
      resolveUid: vi.fn(),
      uidOf: vi.fn(),
      findByContentHash: vi.fn(),
      createDirectory: vi.fn()
    }
  }
};

const { useFiles } = await import('../src/renderer/src/store/files');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useFiles.getState();
}

const TREE_A = {
  name: 'project-a',
  path: '/a',
  relPath: '',
  isDir: true as const,
  children: []
};

const TREE_B = {
  name: 'project-b',
  path: '/b',
  relPath: '',
  isDir: true as const,
  children: []
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFiles.refreshProjectTree', () => {
  beforeEach(() => {
    // Reset store to a known state between tests
    useFiles.setState({ projectTree: null, toasts: [] });
    mockListProjectTree.mockReset();
  });

  it('clears projectTree synchronously before the IPC resolves (Issue 1)', async () => {
    // Pre-load a stale tree for project A
    useFiles.setState({ projectTree: TREE_A });

    let resolveB!: (v: typeof TREE_B) => void;
    mockListProjectTree.mockReturnValue(
      new Promise<typeof TREE_B>((res) => {
        resolveB = res;
      })
    );

    // Start refresh for project B — do NOT await yet
    const refreshPromise = getState().refreshProjectTree('/b');

    // At this point, the IPC is still in-flight.
    // projectTree should already be null (cleared synchronously).
    expect(getState().projectTree).toBeNull();

    // Now let the IPC finish
    resolveB(TREE_B);
    await refreshPromise;

    expect(getState().projectTree).toEqual(TREE_B);
  });

  it('shows a toast and keeps projectTree null when listProjectTree rejects (Issue 2)', async () => {
    useFiles.setState({ projectTree: TREE_A });

    mockListProjectTree.mockRejectedValue(new Error('ENOENT: no such directory'));

    await getState().refreshProjectTree('/bad-path');

    // Tree should remain null (cleared at start, not restored on error)
    expect(getState().projectTree).toBeNull();

    // A toast should have been added
    expect(getState().toasts.length).toBeGreaterThan(0);
    expect(getState().toasts[0].text).toBe('加载项目文件失败');
  });

  it('replaces stale project-A tree with project-B tree after switching (Issue 1 end-to-end)', async () => {
    useFiles.setState({ projectTree: TREE_A });

    mockListProjectTree.mockResolvedValue(TREE_B);

    await getState().refreshProjectTree('/b');

    expect(getState().projectTree).toEqual(TREE_B);
  });

  it('does not affect vault tree (tree) when refreshing project tree', async () => {
    const vaultTree = { name: 'vault', path: '/vault', relPath: '', isDir: true as const };
    useFiles.setState({ tree: vaultTree as never, projectTree: TREE_A });

    mockListProjectTree.mockResolvedValue(TREE_B);

    await getState().refreshProjectTree('/b');

    // Vault tree untouched
    expect(getState().tree).toEqual(vaultTree);
    expect(getState().projectTree).toEqual(TREE_B);
  });

  it('sets projectTreeError when listProjectTree rejects', async () => {
    useFiles.setState({ projectTree: TREE_A, projectTreeError: null });

    mockListProjectTree.mockRejectedValue(new Error('ENOENT'));

    await getState().refreshProjectTree('/bad-path');

    expect(getState().projectTreeError).toBe('加载项目文件失败');
    expect(getState().projectTree).toBeNull();
  });

  it('clears projectTreeError on successful refresh', async () => {
    useFiles.setState({ projectTree: null, projectTreeError: 'previous error' });

    mockListProjectTree.mockResolvedValue(TREE_B);

    await getState().refreshProjectTree('/b');

    expect(getState().projectTreeError).toBeNull();
    expect(getState().projectTree).toEqual(TREE_B);
  });

  it('clears projectTreeError at the start of a new refresh', async () => {
    useFiles.setState({ projectTree: null, projectTreeError: 'old error' });

    let resolve!: (v: typeof TREE_B) => void;
    mockListProjectTree.mockReturnValue(
      new Promise<typeof TREE_B>((res) => {
        resolve = res;
      })
    );

    const promise = getState().refreshProjectTree('/b');
    // Error cleared immediately, before IPC resolves
    expect(getState().projectTreeError).toBeNull();

    resolve(TREE_B);
    await promise;
  });

  // ---------------------------------------------------------------------------
  // Out-of-order (race condition) tests
  // ---------------------------------------------------------------------------

  it('ignores stale success response when a newer request resolves first', async () => {
    useFiles.setState({ projectTree: null, projectTreeError: null });

    let resolveA!: (v: typeof TREE_A) => void;
    let resolveB!: (v: typeof TREE_B) => void;

    mockListProjectTree
      .mockReturnValueOnce(
        new Promise<typeof TREE_A>((res) => {
          resolveA = res;
        })
      )
      .mockReturnValueOnce(
        new Promise<typeof TREE_B>((res) => {
          resolveB = res;
        })
      );

    // Start request A, then immediately start request B (supersedes A)
    const promiseA = getState().refreshProjectTree('/a');
    const promiseB = getState().refreshProjectTree('/b');

    // B resolves first with the correct tree
    resolveB(TREE_B);
    await promiseB;
    expect(getState().projectTree).toEqual(TREE_B);

    // A resolves later — stale, must NOT overwrite B
    resolveA(TREE_A);
    await promiseA;
    expect(getState().projectTree).toEqual(TREE_B);
  });

  it('ignores stale error response when a newer request already resolved', async () => {
    useFiles.setState({ projectTree: null, projectTreeError: null, toasts: [] });

    let rejectA!: (err: Error) => void;
    let resolveB!: (v: typeof TREE_B) => void;

    mockListProjectTree
      .mockReturnValueOnce(
        new Promise<typeof TREE_A>((_res, rej) => {
          rejectA = rej;
        })
      )
      .mockReturnValueOnce(
        new Promise<typeof TREE_B>((res) => {
          resolveB = res;
        })
      );

    const promiseA = getState().refreshProjectTree('/a');
    const promiseB = getState().refreshProjectTree('/b');

    // B resolves successfully first
    resolveB(TREE_B);
    await promiseB;
    expect(getState().projectTree).toEqual(TREE_B);

    // A rejects late — must NOT overwrite state or add a toast
    rejectA(new Error('ENOENT'));
    await promiseA;
    expect(getState().projectTree).toEqual(TREE_B);
    expect(getState().projectTreeError).toBeNull();
    expect(getState().toasts.length).toBe(0);
  });
});
