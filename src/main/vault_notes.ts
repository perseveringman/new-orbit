import { promises as fs } from 'node:fs';
import path from 'node:path';
import { toPosix } from './pathGuard';

export interface ExternalNotesPathInfo {
  path: string;
  label: string;
  noteCount: number;
  exists: boolean;
}

const NOTE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt']);

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function countNoteFiles(absPath: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const next = path.join(absPath, entry.name);
    if (entry.isDirectory()) {
      total += await countNoteFiles(next);
      continue;
    }
    if (NOTE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) total += 1;
  }
  return total;
}

export async function inspectExternalNotesPaths(
  paths: string[]
): Promise<ExternalNotesPathInfo[]> {
  return Promise.all(
    paths.map(async (dirPath) => {
      const exists = await pathExists(dirPath);
      return {
        path: dirPath,
        label: path.basename(dirPath) || dirPath,
        noteCount: exists ? await countNoteFiles(dirPath) : 0,
        exists
      };
    })
  );
}

async function nextAvailableImportDir(baseDir: string, label: string): Promise<string> {
  const safeBase = label.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'notes';
  let candidate = path.join(baseDir, safeBase);
  let counter = 1;
  while (await pathExists(candidate)) {
    counter += 1;
    candidate = path.join(baseDir, `${safeBase}-${counter}`);
  }
  return candidate;
}

export async function importNotesDirectory(
  vaultPath: string,
  sourcePath: string
): Promise<{ targetPath: string; relPath: string; importedFiles: number }> {
  const targetBaseDir = path.join(vaultPath, RESOURCES_DIR, 'notes');
  await fs.mkdir(targetBaseDir, { recursive: true });
  const targetPath = await nextAvailableImportDir(targetBaseDir, path.basename(sourcePath));
  await fs.cp(sourcePath, targetPath, { recursive: true });
  return {
    targetPath,
    relPath: toPosix(path.relative(vaultPath, targetPath)),
    importedFiles: await countNoteFiles(targetPath)
  };
}
const RESOURCES_DIR = '03_Resources';
