import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ActivityEvent, ActivityQueryFilter } from './types';
import { queryActivities } from './query';

export function registerActivityIpc(getVaultPath: () => string | null): void {
  ipcMain.handle(
    IPC.activity.query,
    async (_event, filter?: ActivityQueryFilter): Promise<ActivityEvent[]> => {
      const vaultPath = getVaultPath();
      if (!vaultPath) return [];
      return queryActivities(vaultPath, filter ?? {});
    }
  );
}
