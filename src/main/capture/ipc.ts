import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AddFeedSubscriptionInput,
  CaptureAttachmentInput,
  CreateCaptureLinkInput,
  CreateCaptureNoteInput,
  CreateCaptureTaskInput,
  CreateThoughtInput,
  LibraryReadingUpdateInput,
  LinkThoughtInput,
  PromoteLibraryArticleInput,
  PromoteThoughtInput,
  QuickCaptureSuggestDraftInput,
  SaveFeedItemInput,
  SaveLibraryArticleInput,
  UpdateThoughtInput
} from '@shared/capture';
import type { InboxStatus } from '@shared/inbox';
import { createFeedService } from './feed/service';
import { createLibraryService } from './library/service';
import { createQuickCaptureService } from './quick/service';
import { createThoughtService } from './thoughts/service';
import { publishTraceableEvent } from '../events/bus';
import { broadcastInboxEvent } from '../inbox/events';

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
    for (const item of result) {
      publishTraceableEvent({
        source: 'activity',
        kind: 'feed.items.fetched',
        summary: `Fetched feed items: ${item.created}`,
        payload: { source_id: item.subscriptionId, fetched: item.fetched, created: item.created }
      });
    }
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
    publishTraceableEvent({
      source: 'activity',
      kind: 'feed.item.saved_to_library',
      summary: `Saved feed item to Library: ${item.title}`,
      payload: { item_id: id, title: item.title }
    });
    broadcastInboxEvent({ type: 'created', item });
    return item;
  });
  ipcMain.handle(IPC.capture.feed.history, () => createFeedService(vaultPath()).history());

  ipcMain.handle(IPC.capture.library.save, async (_event, input: SaveLibraryArticleInput) => {
    const item = await createLibraryService(vaultPath()).saveArticle(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.added',
      summary: `Saved Library item: ${item.title}`,
      payload: { item_id: item.id, title: item.title, url: input.url }
    });
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
    if (input.markRead || item.status === 'read') {
      publishTraceableEvent({
        source: 'activity',
        kind: 'library.item.read',
        summary: `Read Library item: ${item.title}`,
        payload: { item_id: item.id, title: item.title, status: item.status }
      });
    }
    broadcastInboxEvent({ type: 'updated', item });
    return item;
  });
  ipcMain.handle(IPC.capture.library.promote, async (_event, id: string, input?: PromoteLibraryArticleInput) => {
    const result = await createLibraryService(vaultPath()).promote(id, input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.distilled',
      summary: `Distilled Library item: ${result.item.title}`,
      payload: { item_id: result.item.id, title: result.item.title, path: result.resourcePath }
    });
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

  ipcMain.handle(IPC.capture.quick.saveAttachment, (_event, input: CaptureAttachmentInput) =>
    createQuickCaptureService(vaultPath()).saveAttachment(input)
  );
  ipcMain.handle(IPC.capture.quick.suggestDraft, (_event, input: QuickCaptureSuggestDraftInput) =>
    createQuickCaptureService(vaultPath()).suggestDraft(input)
  );
  ipcMain.handle(IPC.capture.quick.createNote, async (_event, input: CreateCaptureNoteInput) => {
    const result = await createQuickCaptureService(vaultPath()).createNote(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'note.created',
      summary: `Captured Note: ${result.note.frontmatter.title ?? result.note.path}`,
      payload: {
        note_id: result.note.frontmatter.id,
        path: result.note.path,
        type: result.note.frontmatter.type,
        title: result.note.frontmatter.title,
        source: result.note.frontmatter.source,
        special_marker: result.note.frontmatter.special_marker,
        accepted_suggestion_actions: input.acceptedSuggestionActions ?? [],
        attachment_count: result.attachments.length
      }
    });
    return result;
  });
  ipcMain.handle(IPC.capture.quick.createLink, async (_event, input: CreateCaptureLinkInput) => {
    const result = await createQuickCaptureService(vaultPath()).createLink(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.added',
      summary: `Captured Link: ${result.item.frontmatter.title}`,
      payload: {
        item_id: result.item.frontmatter.id,
        path: result.item.path,
        kind: result.item.frontmatter.kind,
        url: result.item.frontmatter.url
      }
    });
    return result;
  });
  ipcMain.handle(IPC.capture.quick.createTask, async (_event, input: CreateCaptureTaskInput) => {
    const result = await createQuickCaptureService(vaultPath()).createTask(input);
    broadcastInboxEvent({ type: 'created', item: result.item });
    return result;
  });
}

export function broadcastQuickCaptureOpen(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.quickCapture.open);
  }
}
