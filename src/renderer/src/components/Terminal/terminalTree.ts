export type PaneNode =
  | { kind: 'leaf'; id: string }
  | { kind: 'split'; dir: 'row' | 'col'; ratio: number; a: PaneNode; b: PaneNode };

export type PathEntry = {
  split: Extract<PaneNode, { kind: 'split' }>;
  branch: 'a' | 'b';
};

export function findPath(node: PaneNode, targetId: string): PathEntry[] | null {
  if (node.kind === 'leaf') {
    return node.id === targetId ? [] : null;
  }
  const inA = findPath(node.a, targetId);
  if (inA !== null) return [{ split: node, branch: 'a' }, ...inA];
  const inB = findPath(node.b, targetId);
  if (inB !== null) return [{ split: node, branch: 'b' }, ...inB];
  return null;
}

export function firstLeaf(node: PaneNode): string {
  if (node.kind === 'leaf') return node.id;
  return firstLeaf(node.a);
}

export function lastLeaf(node: PaneNode): string {
  if (node.kind === 'leaf') return node.id;
  return lastLeaf(node.b);
}

export function getAllLeafIds(node: PaneNode): string[] {
  if (node.kind === 'leaf') return [node.id];
  return [...getAllLeafIds(node.a), ...getAllLeafIds(node.b)];
}

export function insertSplit(
  root: PaneNode,
  targetId: string,
  dir: 'row' | 'col',
  newLeafId: string
): PaneNode {
  if (root.kind === 'leaf') {
    if (root.id === targetId) {
      return { kind: 'split', dir, ratio: 0.5, a: root, b: { kind: 'leaf', id: newLeafId } };
    }
    return root;
  }
  return {
    ...root,
    a: insertSplit(root.a, targetId, dir, newLeafId),
    b: insertSplit(root.b, targetId, dir, newLeafId)
  };
}

export function removeLeaf(root: PaneNode, leafId: string): PaneNode | null {
  if (root.kind === 'leaf') {
    return root.id === leafId ? null : root;
  }
  const newA = removeLeaf(root.a, leafId);
  const newB = removeLeaf(root.b, leafId);
  if (newA === null) return newB;
  if (newB === null) return newA;
  return { ...root, a: newA, b: newB };
}

export function findAdjacentLeaf(root: PaneNode, leafId: string): string | null {
  const path = findPath(root, leafId);
  if (!path || path.length === 0) return null;
  const immediate = path[path.length - 1];
  return immediate.branch === 'a' ? firstLeaf(immediate.split.b) : lastLeaf(immediate.split.a);
}

export function deriveClosePaneResult(
  root: PaneNode,
  leafId: string,
  zoomedLeafId: string | null
): {
  root: PaneNode | null;
  focusedLeafId: string | null;
  zoomedLeafId: string | null;
} {
  const adjacent = findAdjacentLeaf(root, leafId);
  const nextRoot = removeLeaf(root, leafId);
  if (nextRoot === null) {
    return {
      root: null,
      focusedLeafId: null,
      zoomedLeafId: null
    };
  }

  return {
    root: nextRoot,
    focusedLeafId: adjacent ?? firstLeaf(nextRoot),
    zoomedLeafId: zoomedLeafId === leafId ? null : zoomedLeafId
  };
}
