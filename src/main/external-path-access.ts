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
  approvedVia: 'vault' | 'cached' | 'prompt';
}

export type ExternalPathAccessConfirmer = (
  request: ExternalPathAccessRequest
) => Promise<boolean> | boolean;

const approvedRootsByVault = new Map<string, Set<string>>();
let injectedConfirmer: ExternalPathAccessConfirmer | null = null;

export function setExternalPathAccessConfirmerForTests(
  confirmer: ExternalPathAccessConfirmer | null
): void {
  injectedConfirmer = confirmer;
}

export function resetExternalPathAccessForTests(): void {
  injectedConfirmer = null;
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

  const pathKind = await resolveReadablePathKind(targetPath);
  const request: ExternalPathAccessRequest = {
    vaultPath,
    requestedTarget: input.requestedTarget,
    targetPath,
    access: 'read',
    pathKind
  };
  const allowed = await (injectedConfirmer ?? confirmWithElectronDialog)(request);
  if (!allowed) {
    throw cliServerError('external_path_denied', `external path access denied: ${targetPath}`);
  }

  rememberExternalPathApproval(vaultPath, targetPath);
  return { targetPath, pathKind, external: true, approvedVia: 'prompt' };
}

function rememberExternalPathApproval(vaultPath: string, approvedRoot: string): void {
  const key = path.resolve(vaultPath);
  const roots = approvedRootsByVault.get(key) ?? new Set<string>();
  roots.add(path.resolve(approvedRoot));
  approvedRootsByVault.set(key, roots);
}

function isExternalPathApproved(vaultPath: string, targetPath: string): boolean {
  const roots = approvedRootsByVault.get(path.resolve(vaultPath));
  if (!roots) return false;
  const target = path.resolve(targetPath);
  for (const root of roots) {
    if (isInsideRoot(root, target)) return true;
  }
  return false;
}

async function resolveReadablePathKind(targetPath: string): Promise<ExternalPathAccessKind> {
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

async function confirmWithElectronDialog(request: ExternalPathAccessRequest): Promise<boolean> {
  const electron = await import('electron');
  const dialog = electron.dialog;
  const browserWindow = electron.BrowserWindow;
  if (!dialog?.showMessageBox) {
    throw cliServerError(
      'external_path_approval_unavailable',
      `external path requires interactive approval: ${request.targetPath}`
    );
  }

  const scopeText =
    request.pathKind === 'directory'
      ? 'this folder and files inside it'
      : 'this file';
  const detail = [
    request.targetPath,
    '',
    'This path is outside the current Orbit vault.',
    `If you allow it, Orbit will remember access to ${scopeText} for this app session.`
  ].join('\n');
  const window =
    browserWindow?.getFocusedWindow?.() ?? browserWindow?.getAllWindows?.()[0] ?? null;
  const options = {
    type: 'warning' as const,
    buttons: ['Allow Read', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: 'Allow Ask Anywhere to read an external path?',
    detail
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return result.response === 0;
}
