import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { IGNORE_DIRS } from './walk';
import { toPosix } from './pathGuard';
import type { ProjectFileNode } from '@shared/types';

/**
 * Build a full project-local file tree under `root`.
 * Unlike the vault `buildTree`, this includes all file types (not just Markdown)
 * and is scoped to an arbitrary project directory.
 *
 * Directories in IGNORE_DIRS (.git, node_modules, .orbit, .DS_Store) are skipped.
 */
export async function listProjectTree(root: string): Promise<ProjectFileNode> {
  const rootAbs = path.resolve(root);

  async function buildNode(abs: string, rel: string): Promise<ProjectFileNode> {
    const name = path.basename(abs);
    const stat = await fsp.stat(abs);

    if (!stat.isDirectory()) {
      return { name, path: abs, relPath: toPosix(rel), isDir: false };
    }

    let entries: { name: string; isDir: boolean }[] = [];
    try {
      const dirents = await fsp.readdir(abs, { withFileTypes: true });
      entries = dirents
        .filter((d) => !IGNORE_DIRS.has(d.name))
        .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
        .sort((a, b) => {
          // directories first, then alphabetical
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      // Unreadable directory — return empty dir node
    }

    const children = await Promise.all(
      entries.map((e) => {
        const childAbs = path.join(abs, e.name);
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        return buildNode(childAbs, childRel);
      })
    );

    return { name, path: abs, relPath: toPosix(rel) || '.', isDir: true, children };
  }

  return buildNode(rootAbs, '');
}

/**
 * Create a single directory `name` inside `parent`.
 * Rejects names that attempt path traversal or contain path separators.
 */
export async function createDirectory(parent: string, name: string): Promise<void> {
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`invalid directory name: "${name}"`);
  }
  const target = path.join(parent, name);
  await fsp.mkdir(target, { recursive: true });
}
