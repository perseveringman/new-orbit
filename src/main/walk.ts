import { promises as fs, Dirent } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';

export const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  ORBIT_DIR,
  '.DS_Store'
]);

function isIgnoredDirName(name: string): boolean {
  return IGNORE_DIRS.has(name);
}

export async function* walkMarkdown(root: string): AsyncGenerator<string> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ORBIT_DIR && dir === root) continue;
        if (!isIgnoredDirName(e.name) || e.name === ORBIT_DIR) stack.push(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        yield p;
      }
    }
  }
}

export async function* walkAll(root: string): AsyncGenerator<string> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ORBIT_DIR && dir === root) continue;
        if (!isIgnoredDirName(e.name) || e.name === ORBIT_DIR) stack.push(p);
      } else if (e.isFile()) {
        yield p;
      }
    }
  }
}
