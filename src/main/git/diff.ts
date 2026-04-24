import { simpleGit } from 'simple-git';

export interface DiffOptions {
  /** Worktree absolute path. */
  worktreePath: string;
  /** Base ref, defaults to 'main'. If not found, falls back to 'master'. */
  base?: string;
  /** Optional path filter (repo-relative). */
  pathspec?: string[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  /** Unified hunks in plain text (`git diff` format). */
  patch: string;
  /** Binary files omit `patch` and set this true. */
  binary?: boolean;
}

export interface DiffResult {
  base: string;
  head: string;
  mergeBase: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface NumstatEntry {
  path: string;
  oldPath?: string;
  additions: number | null;
  deletions: number | null;
}

/**
 * Parse `git diff --numstat` output. Returns `null` for binary files
 * (indicated by `-\t-\t...`). Handles rename markers of the form
 * `path/{old => new}/file.ts` and `old => new`.
 */
export function parseNumstat(raw: string): NumstatEntry[] {
  const out: NumstatEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const [addRaw, delRaw, ...rest] = parts;
    const pathField = rest.join('\t');
    const binary = addRaw === '-' && delRaw === '-';
    const additions = binary ? null : Number(addRaw);
    const deletions = binary ? null : Number(delRaw);

    let path = pathField;
    let oldPath: string | undefined;

    // Brace-form rename: "src/{old => new}/file.ts"
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(pathField);
    if (brace) {
      const [, prefix, oldMid, newMid, suffix] = brace;
      const stripDup = (s: string): string => s.replace(/\/\//g, '/');
      oldPath = stripDup(`${prefix}${oldMid}${suffix}`).replace(/^\//, '');
      path = stripDup(`${prefix}${newMid}${suffix}`).replace(/^\//, '');
    } else {
      // Plain-form rename "old => new"
      const plain = /^(.*) => (.*)$/.exec(pathField);
      if (plain) {
        oldPath = plain[1];
        path = plain[2];
      }
    }

    out.push({ path, oldPath, additions, deletions });
  }
  return out;
}

interface NameStatusEntry {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
}

function parseNameStatus(raw: string): NameStatusEntry[] {
  const out: NameStatusEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    const code = parts[0] ?? '';
    if (code.startsWith('R')) {
      // R100\told\tnew
      out.push({ status: 'renamed', oldPath: parts[1], path: parts[2] ?? parts[1] });
    } else if (code.startsWith('A')) {
      out.push({ status: 'added', path: parts[1] });
    } else if (code.startsWith('D')) {
      out.push({ status: 'deleted', path: parts[1] });
    } else if (code.startsWith('M') || code.startsWith('T') || code.startsWith('C')) {
      out.push({ status: code.startsWith('C') ? 'added' : 'modified', path: parts[1] });
    }
  }
  return out;
}

export async function computeMergeBaseDiff(opts: DiffOptions): Promise<DiffResult> {
  const git = simpleGit(opts.worktreePath);
  const requested = opts.base ?? 'main';
  const candidates = requested === 'main' ? ['main', 'master'] : [requested, 'master'];
  let base: string | null = null;
  for (const c of candidates) {
    try {
      await git.revparse([c]);
      base = c;
      break;
    } catch {
      // try next
    }
  }
  if (!base) {
    const err = new Error('no_base_ref');
    (err as Error & { code?: string }).code = 'no_base_ref';
    throw err;
  }

  const mergeBase = (await git.raw(['merge-base', base, 'HEAD'])).trim();
  const head = (await git.revparse(['HEAD'])).trim();
  const range = `${mergeBase}..HEAD`;
  const pathspec = opts.pathspec && opts.pathspec.length > 0 ? ['--', ...opts.pathspec] : [];

  const numstatRaw = await git.raw(['diff', '--numstat', range, ...pathspec]);
  const nameStatusRaw = await git.raw(['diff', '--name-status', '-M', range, ...pathspec]);

  const numstat = parseNumstat(numstatRaw);
  const nameStatus = parseNameStatus(nameStatusRaw);
  const byPath = new Map<string, NameStatusEntry>();
  for (const ns of nameStatus) byPath.set(ns.path, ns);

  const files: DiffFile[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const entry of numstat) {
    const ns = byPath.get(entry.path);
    const status: DiffFile['status'] = ns?.status ?? 'modified';
    const binary = entry.additions === null && entry.deletions === null;
    const additions = entry.additions ?? 0;
    const deletions = entry.deletions ?? 0;
    totalAdditions += additions;
    totalDeletions += deletions;

    let patch = '';
    if (!binary) {
      try {
        patch = await git.raw(['diff', range, '--', entry.path]);
      } catch {
        patch = '';
      }
    }

    files.push({
      path: entry.path,
      oldPath: ns?.oldPath ?? entry.oldPath,
      status,
      additions,
      deletions,
      patch,
      binary: binary || undefined
    });
  }

  return {
    base,
    head,
    mergeBase,
    files,
    totalAdditions,
    totalDeletions
  };
}

/**
 * Return a numstat summary of currently staged changes.
 * Wraps `git diff --cached --numstat`, making the existing `parseNumstat`
 * helper available to the staged-aware Changes panel pipeline.
 */
export async function getStagedFileSummary(
  cwd: string,
  pathspec?: string[]
): Promise<NumstatEntry[]> {
  const git = simpleGit(cwd);
  const ps = pathspec && pathspec.length > 0 ? ['--', ...pathspec] : [];
  const raw = await git.raw(['diff', '--cached', '--numstat', ...ps]);
  return parseNumstat(raw);
}
