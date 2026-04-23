import path from 'node:path';
import { dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateAreaArgsDTO,
  AreaConfigDTO,
  ExternalNotesPathInfoDTO,
  ImportNotesResultDTO,
  VaultExtConfigDTO
} from '@shared/ipc';
import type { AreaConfig } from '@shared/schemas';
import {
  listAreas,
  createArea,
  getAreaConfig,
  setAreaConfig
} from './area';
import { getVaultExtConfig, updateVaultExtConfig } from './vault_config';
import { importNotesDirectory, inspectExternalNotesPaths } from './vault_notes';

function configToDTO(config: AreaConfig): AreaConfigDTO {
  return {
    uid: config.uid,
    slug: config.slug,
    name: config.name,
    template: config.template,
    tags: config.tags,
    created_at: config.created_at
  };
}

export function registerAreaIpc(getVaultPath: () => string | null): void {
  ipcMain.handle(IPC.area.list, async () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return [];
    return listAreas(vaultPath);
  });

  ipcMain.handle(IPC.area.create, async (_e, args: CreateAreaArgsDTO) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    return createArea(vaultPath, args);
  });

  ipcMain.handle(IPC.area.getConfig, async (_e, areaPath: string) => {
    const config = await getAreaConfig(areaPath);
    return configToDTO(config);
  });

  ipcMain.handle(
    IPC.area.setConfig,
    async (_e, areaPath: string, patch: Partial<AreaConfigDTO>) => {
      const updated = await setAreaConfig(areaPath, patch);
      return configToDTO(updated);
    }
  );

  ipcMain.handle(IPC.vaultConfig.get, async (): Promise<VaultExtConfigDTO> => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return { external_notes_paths: [] };
    return getVaultExtConfig(vaultPath);
  });

  ipcMain.handle(
    IPC.vaultConfig.update,
    async (_e, patch: Partial<VaultExtConfigDTO>): Promise<VaultExtConfigDTO> => {
      const vaultPath = getVaultPath();
      if (!vaultPath) throw new Error('No vault open');
      return updateVaultExtConfig(vaultPath, patch);
    }
  );

  ipcMain.handle(IPC.vaultConfig.inspect, async (): Promise<ExternalNotesPathInfoDTO[]> => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return [];
    const config = await getVaultExtConfig(vaultPath);
    return inspectExternalNotesPaths(config.external_notes_paths);
  });

  ipcMain.handle(IPC.vaultConfig.linkDirectory, async (): Promise<VaultExtConfigDTO | null> => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const result = await dialog.showOpenDialog({
      title: 'Link external notes directory',
      properties: ['openDirectory']
    });
    const dirPath = result.canceled ? null : result.filePaths[0] ?? null;
    if (!dirPath) return null;
    const current = await getVaultExtConfig(vaultPath);
    const normalized = Array.from(new Set([...current.external_notes_paths, path.resolve(dirPath)]));
    return updateVaultExtConfig(vaultPath, { external_notes_paths: normalized });
  });

  ipcMain.handle(
    IPC.vaultConfig.unlinkDirectory,
    async (_e, dirPath: string): Promise<VaultExtConfigDTO> => {
      const vaultPath = getVaultPath();
      if (!vaultPath) throw new Error('No vault open');
      const current = await getVaultExtConfig(vaultPath);
      const target = path.resolve(dirPath);
      return updateVaultExtConfig(vaultPath, {
        external_notes_paths: current.external_notes_paths.filter((item) => path.resolve(item) !== target)
      });
    }
  );

  ipcMain.handle(IPC.vaultConfig.importDirectory, async (): Promise<ImportNotesResultDTO | null> => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const result = await dialog.showOpenDialog({
      title: 'Import notes into Orbit vault',
      properties: ['openDirectory']
    });
    const sourcePath = result.canceled ? null : result.filePaths[0] ?? null;
    if (!sourcePath) return null;
    const imported = await importNotesDirectory(vaultPath, sourcePath);
    return {
      sourcePath,
      ...imported
    };
  });
}
