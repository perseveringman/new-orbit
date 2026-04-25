import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AddFeedSubscriptionInput,
  CreateThoughtInput,
  LibraryReadingUpdateInput,
  LinkThoughtInput,
  PromoteLibraryArticleInput,
  PromoteThoughtInput,
  SaveFeedItemInput,
  SaveLibraryArticleInput,
  UpdateThoughtInput
} from '@shared/capture';
import type { InboxEvent, InboxStatus } from '@shared/inbox';
import { createFeedService } from './feed/service';
import { createLibraryService } from './library/service';
import { createThoughtService } from './thoughts/service';

export function registerCaptureIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.capture.feed.listSubscriptions, () => createFeedService(vaultPath()).listSubscriptions());
  ipcMain.handle(IPC.capture.feed.addSubscription, (_event, input: AddFeedSubscriptionInput) =>
    createFeedService(vaultPath()).addSubscription(input)
  );
  ipcMain.handle(IPC.capture.feed.removeSubscription, (_event, id: string) =>
    createFeedService(vaultPath()).removeSubscription(id)
  );
  ipcMain.handle(IPC.capture.feed.refresh, async (_event, id?: string) => {
    const service = createFeedService(vaultPath());
    const before = new Set((await service.listPending()).map((item) => item.id));
    const result = await service.refresh(id);
    const after = await service.listPending();
    for (const item of after) {
      if (!before.has(item.id)) broadcastInboxEvent({ type: 'created', item });
    }
    return result;
  });
  ipcMain.handle(IPC.capture.feed.listPending, () => createFeedService(vaultPath()).listPending());
  ipcMain.handle(IPC.capture.feed.fadeOut, async (_event, id: string) => {
    const item = await createFeedService(vaultPath()).fadeOut(id);
    broadcastInboxEvent({ type: 'archived', item });
    return item;
  });
  ipcMain.handle(IPC.capture.feed.saveToLibrary, async (_event, id: string, input?: SaveFeedItemInput) => {
    const item = await createFeedService(vaultPath()).saveToLibrary(id, input);
    broadcastInboxEvent({ type: 'created', item });
    return item;
  });
  ipcMain.handle(IPC.capture.feed.history, () => createFeedService(vaultPath()).history());

  ipcMain.handle(IPC.capture.library.save, async (_event, input: SaveLibraryArticleInput) => {
    const item = await createLibraryService(vaultPath()).saveArticle(input);
    broadcastInboxEvent({ type: 'created', item });
    return item;
  });
  ipcMain.handle(IPC.capture.library.list, (_event, status?: InboxStatus) =>
    createLibraryService(vaultPath()).list(status)
  );
  ipcMain.handle(IPC.capture.library.get, (_event, id: string) => createLibraryService(vaultPath()).get(id));
  ipcMain.handle(IPC.capture.library.readContent, (_event, id: string) =>
    createLibraryService(vaultPath()).readContent(id)
  );
  ipcMain.handle(IPC.capture.library.updateReading, async (_event, id: string, input: LibraryReadingUpdateInput) => {
    const item = await createLibraryService(vaultPath()).updateReading(id, input);
    broadcastInboxEvent({ type: 'updated', item });
    return item;
  });
  ipcMain.handle(IPC.capture.library.promote, async (_event, id: string, input?: PromoteLibraryArticleInput) => {
    const result = await createLibraryService(vaultPath()).promote(id, input);
    broadcastInboxEvent({ type: 'resolved', item: result.item });
    return result;
  });
  ipcMain.handle(IPC.capture.library.dismiss, async (_event, id: string, actor?: 'user' | 'agent') => {
    const item = await createLibraryService(vaultPath()).dismiss(id, actor);
    broadcastInboxEvent({ type: 'dismissed', item });
    return item;
  });

  ipcMain.handle(IPC.capture.thought.create, async (_event, input: CreateThoughtInput) => {
    const item = await createThoughtService(vaultPath()).create(input);
    broadcastInboxEvent({ type: 'created', item });
    return item;
  });
  ipcMain.handle(IPC.capture.thought.list, () => createThoughtService(vaultPath()).list());
  ipcMain.handle(IPC.capture.thought.get, (_event, id: string) => createThoughtService(vaultPath()).get(id));
  ipcMain.handle(IPC.capture.thought.update, async (_event, id: string, input: UpdateThoughtInput) => {
    const item = await createThoughtService(vaultPath()).update(id, input);
    broadcastInboxEvent({ type: 'updated', item });
    return item;
  });
  ipcMain.handle(IPC.capture.thought.promote, async (_event, id: string, input?: PromoteThoughtInput) => {
    const result = await createThoughtService(vaultPath()).promote(id, input);
    broadcastInboxEvent({ type: 'resolved', item: result.item });
    return result;
  });
  ipcMain.handle(IPC.capture.thought.link, (_event, id: string, input: LinkThoughtInput) =>
    createThoughtService(vaultPath()).link(id, input)
  );
  ipcMain.handle(IPC.capture.thought.dismiss, async (_event, id: string, actor?: 'user' | 'agent') => {
    const item = await createThoughtService(vaultPath()).dismiss(id, actor);
    broadcastInboxEvent({ type: 'dismissed', item });
    return item;
  });
}

export function broadcastQuickCaptureOpen(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.quickCapture.open);
  }
}

function broadcastInboxEvent(event: InboxEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.inbox.event, event);
  }
}
