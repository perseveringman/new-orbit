import type { ChangesFileEntry, DiffFile } from '@shared/git';

export type ChangeDisplayStatus = DiffFile['status'] | 'untracked';

export interface ChangeFile extends ChangesFileEntry {
  name: string;
  dir: string;
  displayStatus: ChangeDisplayStatus;
  additions: number;
  deletions: number;
  patch: string;
  binary?: boolean;
  isStaged: boolean;
  hasUnstagedChanges: boolean;
  isUntracked: boolean;
}

export interface ChangeGroupRow {
  type: 'group';
  key: string;
  dir: string;
  label: string;
  count: number;
}

export interface ChangeFileRow {
  type: 'file';
  key: string;
  dir: string;
  file: ChangeFile;
}

export type ChangeRow = ChangeGroupRow | ChangeFileRow;

function normalizePath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

function basenameOf(relPath: string): string {
  const normalized = normalizePath(relPath);
  if (!normalized) return '';
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function directoryOf(relPath: string): string {
  const normalized = normalizePath(relPath);
  if (!normalized) return '';
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : '';
}

function inferDisplayStatus(entry: ChangesFileEntry, diff?: DiffFile): ChangeDisplayStatus {
  if (diff) return diff.status;
  if (entry.indexStatus === '?' && entry.workTreeStatus === '?') return 'untracked';
  if (entry.indexStatus === 'D' || entry.workTreeStatus === 'D') return 'deleted';
  if (entry.indexStatus === 'R' || entry.workTreeStatus === 'R') return 'renamed';
  if (entry.indexStatus === 'A') return 'added';
  return 'modified';
}

export function buildChangeFiles(
  files: ChangesFileEntry[],
  diffFiles: DiffFile[],
  query: string
): ChangeFile[] {
  const q = query.trim().toLowerCase();
  const diffByPath = new Map(diffFiles.map((file) => [file.path, file]));

  return files
    .map((entry) => {
      const diff = diffByPath.get(entry.path);
      return {
        ...entry,
        name: basenameOf(entry.path),
        dir: directoryOf(entry.path),
        displayStatus: inferDisplayStatus(entry, diff),
        additions: diff?.additions ?? 0,
        deletions: diff?.deletions ?? 0,
        patch: diff?.patch ?? '',
        binary: diff?.binary,
        isStaged: entry.indexStatus !== ' ' && entry.indexStatus !== '?',
        hasUnstagedChanges: entry.workTreeStatus !== ' ' && entry.workTreeStatus !== '?',
        isUntracked: entry.indexStatus === '?' && entry.workTreeStatus === '?'
      } satisfies ChangeFile;
    })
    .filter((file) => {
      if (!q) return true;
      return [file.path, file.origPath ?? '', file.dir]
        .some((value) => value.toLowerCase().includes(q));
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function buildChangeRows(
  files: ChangeFile[],
  expanded: Record<string, boolean>
): ChangeRow[] {
  const grouped = new Map<string, ChangeFile[]>();
  for (const file of files) {
    const key = file.dir;
    const list = grouped.get(key) ?? [];
    list.push(file);
    grouped.set(key, list);
  }

  const rows: ChangeRow[] = [];
  for (const dir of Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))) {
    const groupKey = `group:${dir}`;
    const filesInGroup = grouped.get(dir) ?? [];
    rows.push({
      type: 'group',
      key: groupKey,
      dir,
      label: dir || 'Root',
      count: filesInGroup.length
    });

    if (expanded[groupKey] === false) continue;
    for (const file of filesInGroup) {
      rows.push({
        type: 'file',
        key: `file:${file.path}`,
        dir,
        file
      });
    }
  }

  return rows;
}
