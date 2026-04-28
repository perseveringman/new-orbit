import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AcceptLibraryDistillationInput,
  AddLibraryAnnotationInput,
  LibraryFilter,
  LibraryReadingUpdateInputV2,
  SaveLibraryItemInput,
  UpdateLibraryItemInput
} from '@shared/library';
import { publishTraceableEvent } from '../events/bus';
import { createLibraryStore } from './store';

export function registerLibraryIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.library.save, async (_event, input: SaveLibraryItemInput) => {
    const item = await createLibraryStore(vaultPath()).save(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.added',
      summary: `Saved Library item: ${item.frontmatter.title}`,
      payload: {
        item_id: item.frontmatter.id,
        title: item.frontmatter.title,
        url: item.frontmatter.url,
        path: item.path,
        status: item.frontmatter.status
      }
    });
    return item;
  });
  ipcMain.handle(IPC.library.list, (_event, filter?: LibraryFilter) => createLibraryStore(vaultPath()).list(filter));
  ipcMain.handle(IPC.library.get, (_event, id: string) => createLibraryStore(vaultPath()).get(id));
  ipcMain.handle(IPC.library.update, async (_event, id: string, patch: UpdateLibraryItemInput) => {
    const item = await createLibraryStore(vaultPath()).update(id, patch);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.status_changed',
      summary: `Updated Library item: ${item.frontmatter.title}`,
      payload: { item_id: item.frontmatter.id, title: item.frontmatter.title, status: item.frontmatter.status, path: item.path }
    });
    return item;
  });
  ipcMain.handle(IPC.library.annotate, async (_event, id: string, input: AddLibraryAnnotationInput) => {
    const item = await createLibraryStore(vaultPath()).annotate(id, input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.annotated',
      summary: `Annotated Library item: ${item.frontmatter.title}`,
      payload: { item_id: item.frontmatter.id, title: item.frontmatter.title, path: item.path }
    });
    return item;
  });
  ipcMain.handle(IPC.library.markRead, async (_event, id: string, input?: LibraryReadingUpdateInputV2) => {
    const item = await createLibraryStore(vaultPath()).markRead(id, input);
    publishTraceableEvent({
      source: 'activity',
      kind: item.frontmatter.status === 'read' ? 'library.item.read' : 'library.item.status_changed',
      summary: `Read Library item: ${item.frontmatter.title}`,
      payload: { item_id: item.frontmatter.id, title: item.frontmatter.title, status: item.frontmatter.status, path: item.path }
    });
    return item;
  });
  ipcMain.handle(IPC.library.archive, async (_event, id: string) => {
    const item = await createLibraryStore(vaultPath()).archive(id);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.status_changed',
      summary: `Archived Library item: ${item.frontmatter.title}`,
      payload: { item_id: item.frontmatter.id, title: item.frontmatter.title, status: item.frontmatter.status, path: item.path }
    });
    return item;
  });
  ipcMain.handle(IPC.library.distill, async (_event, id: string) => {
    const result = await createLibraryStore(vaultPath()).distill(id);
    publishTraceableEvent({
      source: 'activity',
      kind: 'library.item.distilled',
      summary: `Distilled Library item: ${result.item.frontmatter.title}`,
      payload: {
        item_id: result.item.frontmatter.id,
        title: result.item.frontmatter.title,
        path: result.item.path,
        artifact_id: result.artifact.id
      }
    });
    return result;
  });
  ipcMain.handle(IPC.library.acceptDistillation, async (_event, input: AcceptLibraryDistillationInput) => {
    const result = await createLibraryStore(vaultPath()).acceptDistillation(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'note.created',
      summary: `Accepted Library distillation into Note: ${result.note_path}`,
      payload: {
        note_id: result.note_id,
        path: result.note_path,
        type: input.target_type,
        synthesis_ref: input.artifact_id
      }
    });
    return result;
  });
}
