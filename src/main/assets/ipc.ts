import { ipcMain } from 'electron';
import path from 'node:path';
import { IPC } from '@shared/ipc';
import type { AddAssetPinInput, AddAssetScopeInput, AssetScanOptions, UpdateAssetScopeInput } from '@shared/assets';
import { listProjects } from '../project';
import { listAreas } from '../area';
import { createResourceStore } from '../resource/store';
import { createAssetStore } from './store';
import { buildSpaceContext, getSpace, listSpaces } from '../space/context';

export function registerAssetsIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = async (spaceId: string) => createAssetStore(await spaceRoot(vaultPath(), spaceId));

  ipcMain.handle(IPC.assets.manifestGet, async (_event, projectUid: string) =>
    (await store(projectUid)).manifest()
  );
  ipcMain.handle(IPC.assets.scopeAdd, async (_event, projectUid: string, input: AddAssetScopeInput) =>
    (await store(projectUid)).addScope(input)
  );
  ipcMain.handle(
    IPC.assets.scopeUpdate,
    async (_event, projectUid: string, scopeId: string, patch: UpdateAssetScopeInput) =>
      (await store(projectUid)).updateScope(scopeId, patch)
  );
  ipcMain.handle(IPC.assets.scopeRemove, async (_event, projectUid: string, scopeId: string) =>
    (await store(projectUid)).removeScope(scopeId)
  );
  ipcMain.handle(
    IPC.assets.scopeScan,
    async (_event, projectUid: string, scopeId: string, options?: AssetScanOptions) =>
      (await store(projectUid)).scan(scopeId, options)
  );
  ipcMain.handle(IPC.assets.scopeStat, async (_event, projectUid: string, scopeId: string) =>
    (await store(projectUid)).stat(scopeId)
  );
  ipcMain.handle(IPC.assets.pinAdd, async (_event, projectUid: string, input: AddAssetPinInput) =>
    (await store(projectUid)).addPin(input)
  );
  ipcMain.handle(IPC.assets.pinRemove, async (_event, projectUid: string, pinId: string) =>
    (await store(projectUid)).removePin(pinId)
  );
  ipcMain.handle(IPC.assets.read, async (_event, projectUid: string, targetPath: string) =>
    (await store(projectUid)).readAuthorizedFile(targetPath)
  );
  ipcMain.handle(IPC.assets.healthCheck, async (_event, projectUid: string) =>
    (await store(projectUid)).health()
  );
  ipcMain.handle(IPC.space.context, (_event, spaceId: string, options = {}) =>
    buildSpaceContext(vaultPath(), spaceId, options)
  );
  ipcMain.handle(IPC.space.list, (_event, filter = {}) => listSpaces(vaultPath(), filter));
  ipcMain.handle(IPC.space.get, (_event, spaceId: string) => getSpace(vaultPath(), spaceId));
}

async function spaceRoot(vaultPath: string, spaceId: string): Promise<string> {
  const project = (await listProjects(vaultPath)).find(
    (item) => item.uid === spaceId || item.slug === spaceId
  );
  if (project) {
    if (project.legacy) throw new Error('materials are only available for folder-backed spaces');
    return project.path;
  }
  const area = (await listAreas(vaultPath, { includeArchived: true })).find(
    (item) => item.uid === spaceId || item.slug === spaceId
  );
  if (area) return area.path;
  const resource = await createResourceStore(vaultPath).get(spaceId);
  if (resource) return path.dirname(path.join(vaultPath, resource.path));
  throw new Error(`space not found: ${spaceId}`);
}
