import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AreaConfigDTO,
  CreateAreaArgsDTO,
  ExternalNotesPathInfoDTO,
  ImportNotesResultDTO,
  UpdateAreaArgsDTO,
  VaultExtConfigDTO
} from '@shared/ipc';
import type {
  AreaAssignmentInput,
  AreaAssignmentSuggestion,
  AreaChangeEvent,
  AreaConfig,
  AreaEntityRef,
  AreaUnassignmentInput
} from '@shared/area';
import {
  archiveArea,
  assignArea,
  createArea,
  getArea,
  getAreaConfig,
  getAreaDashboard,
  listAreas,
  setAreaConfig,
  suggestAreaAssignments,
  unassignArea,
  updateArea
} from './area';
import { getVaultExtConfig, updateVaultExtConfig } from './vault_config';
import { importNotesDirectory, inspectExternalNotesPaths } from './vault_notes';
import { publishTraceableEvent } from './events/bus';

function configToDTO(config: AreaConfig): AreaConfigDTO {
  return {
    uid: config.uid,
    slug: config.slug,
    name: config.name,
    description: config.description,
    status: config.status,
    template: config.template,
    tags: config.tags,
    created_at: config.created_at,
    updated_at: config.updated_at,
    vision_refs: config.vision_refs
  };
}

export function registerAreaIpc(getVaultPath: () => string | null): void {
  ipcMain.handle(IPC.area.list, async () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) return [];
    return listAreas(vaultPath);
  });

  ipcMain.handle(IPC.area.get, async (_e, slugOrUid: string) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const config = await getArea(vaultPath, slugOrUid);
    return config ? configToDTO(config) : null;
  });

  ipcMain.handle(IPC.area.create, async (_e, args: CreateAreaArgsDTO) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const result = await createArea(vaultPath, args);
    const config = await getArea(vaultPath, result.slug);
    if (config) {
      publishAreaEvent('area.created', config, `Area created: ${config.name}`);
      broadcast({ type: 'created', area: config });
    }
    return result;
  });

  ipcMain.handle(IPC.area.update, async (_e, slugOrUid: string, patch: UpdateAreaArgsDTO) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const config = await updateArea(vaultPath, slugOrUid, patch);
    publishAreaEvent('area.updated', config, `Area updated: ${config.name}`);
    broadcast({ type: 'updated', area: config });
    return configToDTO(config);
  });

  ipcMain.handle(IPC.area.archive, async (_e, slugOrUid: string) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const config = await archiveArea(vaultPath, slugOrUid);
    publishAreaEvent('area.archived', config, `Area archived: ${config.name}`);
    broadcast({ type: 'archived', area: config });
    return configToDTO(config);
  });

  ipcMain.handle(IPC.area.getConfig, async (_e, areaPath: string) => {
    const config = await getAreaConfig(areaPath);
    return configToDTO(config);
  });

  ipcMain.handle(
    IPC.area.setConfig,
    async (_e, areaPath: string, patch: Partial<AreaConfigDTO>) => {
      const updated = await setAreaConfig(areaPath, patch);
      publishAreaEvent('area.updated', updated, `Area config updated: ${updated.name}`);
      broadcast({ type: 'updated', area: updated });
      return configToDTO(updated);
    }
  );

  ipcMain.handle(IPC.area.dashboard, async (_e, slugOrUid: string) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    return getAreaDashboard(vaultPath, slugOrUid);
  });

  ipcMain.handle(IPC.area.assign, async (_e, input: AreaAssignmentInput) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const area = await assignArea(vaultPath, input);
    if (area) {
      publishAreaEvent('area.assignment.added', area, `Assigned ${input.entity.kind} to ${area.name}`, input.entity);
      broadcast({ type: 'assignment_added', area, entity: input.entity });
    }
    return area ? configToDTO(area) : null;
  });

  ipcMain.handle(IPC.area.unassign, async (_e, input: AreaUnassignmentInput) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('No vault open');
    const area = await unassignArea(vaultPath, input);
    if (area) {
      publishAreaEvent('area.assignment.removed', area, `Unassigned ${input.entity.kind} from ${area.name}`, input.entity);
      broadcast({ type: 'assignment_removed', area, entity: input.entity });
    }
    return area ? configToDTO(area) : null;
  });

  ipcMain.handle(
    IPC.area.suggestAssignments,
    async (_e, entity: AreaEntityRef): Promise<AreaAssignmentSuggestion[]> => {
      const vaultPath = getVaultPath();
      if (!vaultPath) throw new Error('No vault open');
      return suggestAreaAssignments(vaultPath, entity);
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

function publishAreaEvent(
  kind: 'area.created' | 'area.updated' | 'area.assignment.added' | 'area.assignment.removed' | 'area.archived',
  area: AreaConfig,
  summary: string,
  entity?: AreaEntityRef
): void {
  publishTraceableEvent({
    source: 'activity',
    kind,
    summary,
    payload: {
      area_uid: area.uid,
      area_slug: area.slug,
      title: area.name,
      status: area.status,
      tags: area.tags,
      entity
    }
  });
}

function broadcast(event: AreaChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.area.event, event);
  }
}
