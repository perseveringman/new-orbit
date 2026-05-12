import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cliServerError } from './cli_server/errors';
import { isInsideRoot } from './pathGuard';

export type ExternalPathAccessKind = 'file' | 'directory';

export interface ExternalPathAccessRequest {
  vaultPath: string;
  requestedTarget: string;
  targetPath: string;
  access: 'read';
  pathKind: ExternalPathAccessKind;
}

export interface ExternalPathAccessGrant {
  targetPath: string;
  pathKind: ExternalPathAccessKind;
  external: boolean;
  approvedVia: 'vault' | 'cached';
}

const approvedRootsByVault = new Map<string, Set<string>>();

export function resetExternalPathAccessForTests(): void {
  approvedRootsByVault.clear();
}

export async function ensureExternalReadAccess(input: {
  vaultPath: string;
  requestedTarget: string;
  targetPath: string;
}): Promise<ExternalPathAccessGrant> {
  const vaultPath = path.resolve(input.vaultPath);
  const targetPath = path.resolve(input.targetPath);

  if (isInsideRoot(vaultPath, targetPath)) {
    return { targetPath, pathKind: 'file', external: false, approvedVia: 'vault' };
  }

  if (isExternalPathApproved(vaultPath, targetPath)) {
    return {
      targetPath,
      pathKind: await resolveReadablePathKind(targetPath),
      external: true,
      approvedVia: 'cached'
    };
  }

  await resolveReadablePathKind(targetPath);
  throw cliServerError(
    'external_path_requires_approval',
    `external path requires user approval: ${targetPath}`
  );
}

export function rememberExternalPathApproval(vaultPath: string, approvedRoot: string): void {
  const key = path.resolve(vaultPath);
  const roots = approvedRootsByVault.get(key) ?? new Set<string>();
  roots.add(path.resolve(approvedRoot));
  approvedRootsByVault.set(key, roots);
}

export function isExternalPathApproved(vaultPath: string, targetPath: string): boolean {
  const roots = approvedRootsByVault.get(path.resolve(vaultPath));
  if (!roots) return false;
  const target = path.resolve(targetPath);
  for (const root of roots) {
    if (isInsideRoot(root, target)) return true;
  }
  return false;
}

export async function resolveReadablePathKind(targetPath: string): Promise<ExternalPathAccessKind> {
  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') {
      throw cliServerError('not_found', `path not found: ${targetPath}`);
    }
    throw cliServerError('path_unreadable', `path is not readable: ${targetPath}`);
  }
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  throw cliServerError('invalid_path', `only files and directories can be read: ${targetPath}`);
}
