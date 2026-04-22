import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyLayout, usePanesStore } from '../src/renderer/src/lib/panes/store';
import type { PaneLeaf, PaneNode, PaneSplit, WorkspaceLayout } from '../src/renderer/src/lib/panes/types';

function expectLeaf(node: PaneNode): PaneLeaf {
  if (node.type !== 'leaf') {
    throw new Error(`Expected leaf node, received ${node.type}`);
  }

  return node;
}

function expectSplit(node: PaneNode): PaneSplit {
  if (node.type !== 'split') {
    throw new Error(`Expected split node, received ${node.type}`);
  }

  return node;
}

function countLeaves(node: PaneNode): number {
  if (node.type === 'leaf') {
    return 1;
  }

  return node.children.reduce((total, child) => total + countLeaves(child), 0);
}

describe('panes store', () => {
  beforeEach(() => {
    usePanesStore.getState().reset();
  });

  test('createEmptyLayout returns a focused empty leaf', () => {
    const layout = createEmptyLayout();
    const root = expectLeaf(layout.root);

    expect(root.tabs).toEqual([]);
    expect(root.activeTabId).toBeNull();
    expect(layout.focusedLeafId).toBe(root.id);
  });

  test('openTab appends to the focused leaf and activates it', () => {
    const firstId = usePanesStore.getState().openTab({
      tab: { kind: 'terminal', title: 'Terminal 1', data: { cwd: '/one' } }
    });
    const secondId = usePanesStore.getState().openTab({
      tab: { kind: 'diff', title: 'Diff 1', data: { file: 'notes.md' } }
    });

    const { layout } = usePanesStore.getState();
    const root = expectLeaf(layout.root);
    expect(root.tabs.map((tab) => tab.id)).toEqual([firstId, secondId]);
    expect(root.activeTabId).toBe(secondId);
    expect(layout.focusedLeafId).toBe(root.id);
  });

  test('splitLeaf row creates a root split and focuses the new leaf', () => {
    const rootLeafId = usePanesStore.getState().layout.root.id;
    const newLeafId = usePanesStore
      .getState()
      .splitLeaf(rootLeafId, 'row', 'terminal', 'Terminal 2', { cwd: '/two' });

    const { layout } = usePanesStore.getState();
    const root = expectSplit(layout.root);
    expect(root.direction).toBe('row');
    expect(root.sizes).toEqual([0.5, 0.5]);
    expect(root.children).toHaveLength(2);
    expect(root.children[0]?.type).toBe('leaf');
    expect(root.children[1]?.type).toBe('leaf');
    expect(layout.focusedLeafId).toBe(newLeafId);
  });

  test('splitLeaf can create a nested layout with three leaves', () => {
    const rootLeafId = usePanesStore.getState().layout.root.id;
    const firstNewLeafId = usePanesStore
      .getState()
      .splitLeaf(rootLeafId, 'row', 'terminal', 'Terminal 2', { cwd: '/two' });

    usePanesStore.getState().splitLeaf(firstNewLeafId, 'column', 'diff', 'Diff 1', { file: 'notes.md' });

    expect(countLeaves(usePanesStore.getState().layout.root)).toBe(3);
  });

  test('closeTab on the only tab leaves an empty leaf', () => {
    const tabId = usePanesStore.getState().openTab({
      tab: { kind: 'terminal', title: 'Terminal 1', data: { cwd: '/one' } }
    });

    usePanesStore.getState().closeTab(tabId);

    const { layout } = usePanesStore.getState();
    const root = expectLeaf(layout.root);
    expect(root.tabs).toEqual([]);
    expect(root.activeTabId).toBeNull();
  });

  test('closeTab collapses a split when one leaf becomes empty', () => {
    const originalTabId = usePanesStore.getState().openTab({
      tab: { kind: 'terminal', title: 'Terminal 1', data: { cwd: '/one' } }
    });
    const originalLeafId = usePanesStore.getState().layout.root.id;
    const newLeafId = usePanesStore
      .getState()
      .splitLeaf(originalLeafId, 'row', 'diff', 'Diff 1', { file: 'notes.md' });

    const { layout: splitLayout } = usePanesStore.getState();
    const splitRoot = expectSplit(splitLayout.root);
    const newLeaf = splitRoot.children.find(
      (child): child is PaneLeaf => child.type === 'leaf' && child.id === newLeafId
    );
    expect(newLeaf).toBeDefined();

    usePanesStore.getState().closeTab(newLeaf!.activeTabId!);

    const { layout } = usePanesStore.getState();
    const root = expectLeaf(layout.root);
    expect(root.id).toBe(originalLeafId);
    expect(root.tabs.map((tab) => tab.id)).toEqual([originalTabId]);
    expect(layout.focusedLeafId).toBe(originalLeafId);
  });

  test('setSizes updates only the targeted split', () => {
    const rootLeafId = usePanesStore.getState().layout.root.id;
    const nestedLeafId = usePanesStore
      .getState()
      .splitLeaf(rootLeafId, 'row', 'terminal', 'Terminal 2', { cwd: '/two' });
    usePanesStore.getState().splitLeaf(nestedLeafId, 'column', 'diff', 'Diff 1', { file: 'notes.md' });

    const before = usePanesStore.getState().layout.root;
    const rootBefore = expectSplit(before);
    const rootSplitId = rootBefore.id;
    const nestedSplit = rootBefore.children.find((child): child is PaneSplit => child.type === 'split');
    expect(nestedSplit).toBeDefined();

    usePanesStore.getState().setSizes(nestedSplit!.id, [0.2, 0.8]);

    const after = usePanesStore.getState().layout.root;
    const rootAfter = expectSplit(after);
    expect(rootAfter.id).toBe(rootSplitId);
    expect(rootAfter.sizes).toEqual([0.5, 0.5]);
    const updatedNestedSplit = rootAfter.children.find((child): child is PaneSplit => child.type === 'split');
    expect(updatedNestedSplit?.sizes).toEqual([0.2, 0.8]);
  });

  test('replaceLayout stores the provided layout verbatim', () => {
    const layout: WorkspaceLayout = {
      root: {
        type: 'split',
        id: 'split-root',
        direction: 'row',
        sizes: [0.25, 0.75],
        children: [
          {
            type: 'leaf',
            id: 'leaf-a',
            tabs: [],
            activeTabId: null
          },
          {
            type: 'leaf',
            id: 'leaf-b',
            tabs: [
              {
                id: 'tab-1',
                kind: 'review-inbox',
                title: 'Inbox',
                data: { unread: 3 },
                lastActiveAt: '2024-01-01T00:00:00.000Z'
              }
            ],
            activeTabId: 'tab-1'
          }
        ]
      },
      focusedLeafId: 'leaf-b'
    };

    usePanesStore.getState().replaceLayout(layout);

    expect(usePanesStore.getState().layout).toBe(layout);
  });
});
