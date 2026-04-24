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
    expect(getState().toasts[0].text).toBe('Failed to load project files');
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
});
