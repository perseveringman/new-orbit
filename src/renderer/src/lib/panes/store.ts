import { nanoid } from 'nanoid';
import { create } from 'zustand';
import type { PaneKind, PaneLeaf, PaneNode, PaneTab, SplitDirection, WorkspaceLayout } from './types';

export interface PanesState {
  layout: WorkspaceLayout;
  openTab: (args: { leafId?: string; tab: Omit<PaneTab, 'id' | 'lastActiveAt'> & { id?: string } }) => string;
  closeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  splitLeaf: (leafId: string, direction: SplitDirection, kind: PaneKind, title: string, data: unknown) => string;
  setSizes: (splitId: string, sizes: number[]) => void;
  focusLeaf: (leafId: string) => void;
  replaceLayout: (layout: WorkspaceLayout) => void;
  reset: () => void;
}

function makeId(): string {
  return nanoid(8);
}

function now(): string {
  return new Date().toISOString();
}

function createLeaf(id = makeId()): PaneLeaf {
  return {
    type: 'leaf',
    id,
    tabs: [],
    activeTabId: null
  };
}

function firstLeaf(root: PaneNode): PaneLeaf {
  if (root.type === 'leaf') {
    return root;
  }

  return firstLeaf(root.children[0] ?? createLeaf());
}

function findLeafContainingTab(root: PaneNode, tabId: string): PaneLeaf | null {
  if (root.type === 'leaf') {
    return root.tabs.some((tab) => tab.id === tabId) ? root : null;
  }

  for (const child of root.children) {
    const match = findLeafContainingTab(child, tabId);
    if (match) {
      return match;
    }
  }

  return null;
}

function setLeaf(root: PaneNode, leafId: string, update: (leaf: PaneLeaf) => PaneLeaf): PaneNode {
  if (root.type === 'leaf') {
    return root.id === leafId ? update(root) : root;
  }

  return {
    ...root,
    children: root.children.map((child) => setLeaf(child, leafId, update))
  };
}

function normalizeSizes(sizes: number[], count: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (sizes.length !== count) {
    return Array.from({ length: count }, () => 1 / count);
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) {
    return Array.from({ length: count }, () => 1 / count);
  }

  return sizes.map((size) => size / total);
}

function removeLeafNode(root: PaneNode, leafId: string, isRoot = true): PaneNode | null {
  if (root.type === 'leaf') {
    if (root.id !== leafId) {
      return root;
    }

    return isRoot ? root : null;
  }

  const nextChildren = root.children
    .map((child) => removeLeafNode(child, leafId, false))
    .filter((child): child is PaneNode => child !== null);

  if (nextChildren.length === 0) {
    return isRoot ? createLeaf() : null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  return {
    ...root,
    children: nextChildren,
    sizes: normalizeSizes(root.sizes, nextChildren.length)
  };
}

function insertSplit(root: PaneNode, leafId: string, direction: SplitDirection, newLeaf: PaneLeaf): PaneNode {
  if (root.type === 'leaf') {
    if (root.id !== leafId) {
      return root;
    }

    return {
      type: 'split',
      id: makeId(),
      direction,
      children: [root, newLeaf],
      sizes: [0.5, 0.5]
    };
  }

  return {
    ...root,
    children: root.children.map((child) => insertSplit(child, leafId, direction, newLeaf))
  };
}

function createTab(
  tab: Omit<PaneTab, 'id' | 'lastActiveAt'> & { id?: string }
): PaneTab {
  return {
    ...tab,
    id: tab.id ?? makeId(),
    lastActiveAt: now()
  };
}

export function createEmptyLayout(): WorkspaceLayout {
  const root = createLeaf();
  return {
    root,
    focusedLeafId: root.id
  };
}

export function findLeaf(root: PaneNode, leafId: string): PaneLeaf | null {
  if (root.type === 'leaf') {
    return root.id === leafId ? root : null;
  }

  for (const child of root.children) {
    const match = findLeaf(child, leafId);
    if (match) {
      return match;
    }
  }

  return null;
}

export function mapLayout(root: PaneNode, fn: (n: PaneNode) => PaneNode): PaneNode {
  const mapped =
    root.type === 'split'
      ? {
          ...root,
          children: root.children.map((child) => mapLayout(child, fn))
        }
      : root;

  return fn(mapped);
}

export function removeTab(root: PaneNode, tabId: string): PaneNode {
  return mapLayout(root, (node) => {
    if (node.type !== 'leaf') {
      return node;
    }

    const tabs = node.tabs.filter((tab) => tab.id !== tabId);
    if (tabs.length === node.tabs.length) {
      return node;
    }

    const activeTabId =
      node.activeTabId === tabId ? tabs[tabs.length - 1]?.id ?? null : node.activeTabId;

    return {
      ...node,
      tabs,
      activeTabId
    };
  });
}

export const usePanesStore = create<PanesState>((set, get) => ({
  layout: createEmptyLayout(),
  openTab: ({ leafId, tab }) => {
    const { layout } = get();
    const targetLeaf =
      (leafId ? findLeaf(layout.root, leafId) : null) ??
      (layout.focusedLeafId ? findLeaf(layout.root, layout.focusedLeafId) : null) ??
      firstLeaf(layout.root);
    const nextTab = createTab(tab);

    set({
      layout: {
        root: setLeaf(layout.root, targetLeaf.id, (leaf) => ({
          ...leaf,
          tabs: [...leaf.tabs, nextTab],
          activeTabId: nextTab.id
        })),
        focusedLeafId: targetLeaf.id
      }
    });

    return nextTab.id;
  },
  closeTab: (tabId) => {
    const { layout } = get();
    const targetLeaf = findLeafContainingTab(layout.root, tabId);
    if (!targetLeaf) {
      return;
    }

    const rootWithoutTab = removeTab(layout.root, tabId);
    const emptiedLeaf = findLeaf(rootWithoutTab, targetLeaf.id);
    const nextRoot =
      emptiedLeaf && emptiedLeaf.tabs.length === 0 && !(rootWithoutTab.type === 'leaf' && rootWithoutTab.id === targetLeaf.id)
        ? removeLeafNode(rootWithoutTab, targetLeaf.id) ?? createEmptyLayout().root
        : rootWithoutTab;
    const nextFocusedLeaf =
      (layout.focusedLeafId ? findLeaf(nextRoot, layout.focusedLeafId) : null) ??
      findLeaf(nextRoot, targetLeaf.id) ??
      firstLeaf(nextRoot);

    set({
      layout: {
        root: nextRoot,
        focusedLeafId: nextFocusedLeaf.id
      }
    });
  },
  activateTab: (tabId) => {
    const { layout } = get();
    const targetLeaf = findLeafContainingTab(layout.root, tabId);
    if (!targetLeaf) {
      return;
    }

    const activatedAt = now();
    set({
      layout: {
        root: setLeaf(layout.root, targetLeaf.id, (leaf) => ({
          ...leaf,
          activeTabId: tabId,
          tabs: leaf.tabs.map((tab) => (tab.id === tabId ? { ...tab, lastActiveAt: activatedAt } : tab))
        })),
        focusedLeafId: targetLeaf.id
      }
    });
  },
  splitLeaf: (leafId, direction, kind, title, data) => {
    const { layout } = get();
    const targetLeaf = findLeaf(layout.root, leafId);
    if (!targetLeaf) {
      return leafId;
    }

    const tab = createTab({ kind, title, data });
    const newLeaf = createLeaf();
    newLeaf.tabs = [tab];
    newLeaf.activeTabId = tab.id;

    set({
      layout: {
        root: insertSplit(layout.root, leafId, direction, newLeaf),
        focusedLeafId: newLeaf.id
      }
    });

    return newLeaf.id;
  },
  setSizes: (splitId, sizes) => {
    const { layout } = get();
    set({
      layout: {
        ...layout,
        root: mapLayout(layout.root, (node) => {
          if (node.type !== 'split' || node.id !== splitId) {
            return node;
          }

          return {
            ...node,
            sizes
          };
        })
      }
    });
  },
  focusLeaf: (leafId) => {
    const { layout } = get();
    if (!findLeaf(layout.root, leafId)) {
      return;
    }

    set({
      layout: {
        ...layout,
        focusedLeafId: leafId
      }
    });
  },
  replaceLayout: (layout) => {
    set({ layout });
  },
  reset: () => {
    set({ layout: createEmptyLayout() });
  }
}));
