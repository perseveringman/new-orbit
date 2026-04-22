import path from 'node:path';

/**
 * Throw if `target` escapes `root`. Returns the resolved absolute path.
 * Both arguments may be relative or absolute.
 */
export function assertInsideVault(root: string, target: string): string {
  const absRoot = path.resolve(root);
  const absTarget = path.resolve(root, target);
  const rel = path.relative(absRoot, absTarget);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return absTarget;
  }
  throw new Error(`path escapes vault: ${target}`);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function vaultRel(root: string, absPath: string): string {
  return toPosix(path.relative(root, absPath));
}
