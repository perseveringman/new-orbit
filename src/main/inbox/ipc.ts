import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { InboxCaptureInput, InboxDismissInput, InboxListFilter, InboxMessageInput, InboxResolveInput } from './types';
import { createInboxServiceForVault } from './service';
import { dismissInboxItemWithProposalSync, resolveInboxItemWithProposalSync } from './proposal_sync';
import { broadcastInboxEvent } from './events';

export function registerInboxIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const service = (): ReturnType<typeof createInboxServiceForVault> =>
    createInboxServiceForVault(vaultPath(), { onEvent: broadcastInboxEvent });

  ipcMain.handle(IPC.inbox.emitMessage, async (_event, input: InboxMessageInput) =>
    service().emitMessage(input)
  );
  ipcMain.handle(IPC.inbox.emitCapture, async (_event, input: InboxCaptureInput) =>
    service().emitCapture(input)
  );
  ipcMain.handle(IPC.inbox.list, async (_event, filter?: InboxListFilter) =>
    service().list(filter)
  );
  ipcMain.handle(IPC.inbox.get, async (_event, id: string) => service().get(id));
  ipcMain.handle(IPC.inbox.resolve, async (_event, id: string, input?: InboxResolveInput) =>
    resolveInboxItemWithProposalSync(vaultPath(), id, input, {
      inbox: { onEvent: broadcastInboxEvent }
    })
  );
  ipcMain.handle(IPC.inbox.dismiss, async (_event, id: string, input?: InboxDismissInput) =>
    dismissInboxItemWithProposalSync(vaultPath(), id, input, {
      inbox: { onEvent: broadcastInboxEvent }
    })
  );
  ipcMain.handle(IPC.inbox.archive, async (_event, id: string) => service().archive(id));
}
