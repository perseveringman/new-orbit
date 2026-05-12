import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ProposalListFilter, ProposalResolveInput, ProposalSubmitInput } from './types';
import { createApprovalServiceForVault } from './service';
import type { ProposalSyncEvent } from './sync';

export function registerApprovalIpc(getVaultPath: () => string | null): void {
  const service = (): ReturnType<typeof createApprovalServiceForVault> => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return createApprovalServiceForVault(vaultPath, { onSync: broadcastApprovalSyncEvent });
  };

  ipcMain.handle(IPC.approval.submit, async (_event, input: ProposalSubmitInput) =>
    service().submit(input)
  );
  ipcMain.handle(IPC.approval.resolve, async (_event, id: string, input: ProposalResolveInput) =>
    service().resolve(id, input)
  );
  ipcMain.handle(IPC.approval.list, async (_event, filter?: ProposalListFilter) =>
    service().list(filter)
  );
  ipcMain.handle(IPC.approval.get, async (_event, id: string) => service().get(id));
}

export function broadcastApprovalSyncEvent(event: ProposalSyncEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.approval.event, event);
    }
  }
}
