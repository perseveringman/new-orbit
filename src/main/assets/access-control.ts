import path from 'node:path';
import type { AssetManifest, AssetScope } from '@shared/assets';

export class AssetAuthorizationError extends Error {
  constructor(targetPath: string) {
    super(`asset path is outside authorized scopes: ${targetPath}`);
    this.name = 'AssetAuthorizationError';
  }
}

export function assertPathAuthorized(
  spaceRoot: string,
  manifest: AssetManifest,
  targetAbsPath: string
): AssetScope {
  const resolved = path.resolve(targetAbsPath);
  for (const scope of manifest.scopes) {
    if (scope.kind === 'url') continue;
    if (scopeContainsPath(spaceRoot, scope, resolved)) return scope;
  }
  throw new AssetAuthorizationError(targetAbsPath);
}

export function scopeContainsPath(spaceRoot: string, scope: AssetScope, targetAbsPath: string): boolean {
  const target = path.resolve(targetAbsPath);
  if (scope.kind === 'file') return samePath(resolveScopeSource(spaceRoot, scope.source), target);
  if (scope.kind === 'folder') {
    const root = resolveScopeSource(spaceRoot, scope.source);
    return samePath(root, target) || target.startsWith(`${root}${path.sep}`);
  }
  if (scope.kind === 'glob') {
    const root = globRoot(scope.source);
    if (!root) return false;
    const absRoot = resolveScopeSource(spaceRoot, root);
    return samePath(absRoot, target) || target.startsWith(`${absRoot}${path.sep}`);
  }
  return false;
}

export function resolveScopeSource(spaceRoot: string, source: string): string {
  return path.resolve(path.isAbsolute(source) ? source : path.join(spaceRoot, source));
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function globRoot(pattern: string): string | null {
  const normalized = pattern.replace(/\\/g, '/');
  const wildcard = normalized.search(/[*?{[]/);
  const root = wildcard === -1 ? normalized : normalized.slice(0, wildcard);
  const trimmed = root.replace(/\/[^/]*$/, '');
  return trimmed || (path.isAbsolute(pattern) ? path.parse(pattern).root : '.');
}

