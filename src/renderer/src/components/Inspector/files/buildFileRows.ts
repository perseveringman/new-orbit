import type { ProjectFileNode } from '@shared/types';

export interface FileRow {
  node: ProjectFileNode;
  depth: number;
}

/** File extensions that should not be opened in the markdown editor. */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'ico', 'avif',
  'pdf',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'mp3', 'mp4', 'wav', 'ogg', 'flac', 'aac', 'avi', 'mov', 'mkv', 'webm', 'flv',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'exe', 'bin', 'dll', 'so', 'dylib', 'app', 'dmg',
  'db', 'sqlite', 'sqlite3', 'pkl', 'pyc', 'pyo',
]);

/** Returns true when a file should not be loaded into the text editor. */
export function isBinaryFile(name: string): boolean {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Filters the tree so only nodes whose name matches the query (case-insensitive)
 * are kept, along with all ancestor directories required to reach them.
 */
export function applyFileQuery(root: ProjectFileNode, query: string): ProjectFileNode {
  const q = query.trim().toLowerCase();
  if (!q) return root;
  const filtered = filterNode(root, q);
  return filtered ?? { ...root, children: [] };
}

function filterNode(node: ProjectFileNode, q: string): ProjectFileNode | null {
  if (!node.isDir) {
    return node.name.toLowerCase().includes(q) ? node : null;
  }
  const kept: ProjectFileNode[] = [];
  for (const child of node.children ?? []) {
    const result = filterNode(child, q);
    if (result) kept.push(result);
  }
  if (kept.length > 0 || node.name.toLowerCase().includes(q)) {
    return { ...node, children: kept };
  }
  return null;
}

/**
 * Flattens the tree into a flat list of rows for virtual rendering.
 * Only descends into directories that appear in the `expanded` map with a
 * truthy value.
 */
export function flattenFileTree(
  root: ProjectFileNode,
  expanded: Record<string, boolean>
): FileRow[] {
  const rows: FileRow[] = [];

  function walk(node: ProjectFileNode, depth: number): void {
    rows.push({ node, depth });
    if (node.isDir && expanded[node.path]) {
      for (const child of node.children ?? []) {
        walk(child, depth + 1);
      }
    }
  }

  for (const child of root.children ?? []) {
    walk(child, 0);
  }
  return rows;
}
