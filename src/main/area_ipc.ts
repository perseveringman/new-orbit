import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CreateAreaArgsDTO, AreaConfigDTO, VaultExtConfigDTO } from '@shared/ipc';
import type { AreaConfig } from '@shared/schemas';
import {
  listAreas,
  createArea,
  getAreaConfig,
  setAreaConfig
} from './area';
import { getVaultExtConfig, updateVaultExtConfig } from './vault_config';

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
}
