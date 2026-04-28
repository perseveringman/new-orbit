import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CreateNoteInput, Note, NoteChangeEvent, NoteFilter, SearchOptions, UpdateNoteInput } from '@shared/note';
import { createNoteStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export function registerNoteIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.notes.list, (_event, filter?: NoteFilter) => createNoteStore(vaultPath()).list(filter));
  ipcMain.handle(IPC.notes.get, (_event, noteId: string) => createNoteStore(vaultPath()).get(noteId));
  ipcMain.handle(IPC.notes.getByPath, (_event, notePath: string) => createNoteStore(vaultPath()).getByPath(notePath));
  ipcMain.handle(IPC.notes.search, (_event, query: string, options?: SearchOptions) =>
    createNoteStore(vaultPath()).search(query, options)
  );
  ipcMain.handle(IPC.notes.create, async (_event, input: CreateNoteInput) => {
    const note = await createNoteStore(vaultPath()).create(input);
    publishNoteEvent('note.created', note, { body: note.body });
    broadcast({ type: 'created', noteId: note.frontmatter.id, note });
    return note;
  });
  ipcMain.handle(IPC.notes.update, async (_event, noteId: string, patch: UpdateNoteInput) => {
    const before = await createNoteStore(vaultPath()).get(noteId);
    const note = await createNoteStore(vaultPath()).update(noteId, patch);
    const wordDelta = (note.frontmatter.word_count ?? 0) - (before?.frontmatter.word_count ?? 0);
    publishNoteEvent('note.updated', note, { word_delta: wordDelta });
    broadcast({ type: 'updated', noteId, note });
    return note;
  });
  ipcMain.handle(IPC.notes.delete, async (_event, noteId: string) => {
    const note = await createNoteStore(vaultPath()).get(noteId);
    await createNoteStore(vaultPath()).delete(noteId);
    publishTraceableEvent({
      source: 'activity',
      kind: 'note.deleted',
      summary: `Deleted note ${note?.frontmatter.title ?? noteId}`,
      payload: { note_id: noteId, path: note?.path, title: note?.frontmatter.title }
    });
    broadcast({ type: 'deleted', noteId });
  });
  ipcMain.handle(IPC.notes.archive, async (_event, noteId: string) => {
    const note = await createNoteStore(vaultPath()).archive(noteId);
    publishNoteEvent('note.archived', note);
    broadcast({ type: 'archived', noteId, note });
  });
}

function publishNoteEvent(
  kind: 'note.created' | 'note.updated' | 'note.archived',
  note: Note,
  extra: Record<string, unknown> = {}
): void {
  publishTraceableEvent({
    source: 'activity',
    kind,
    summary: `${note.frontmatter.type}: ${note.frontmatter.title ?? note.frontmatter.id}`,
    payload: {
      note_id: note.frontmatter.id,
      path: note.path,
      type: note.frontmatter.type,
      title: note.frontmatter.title,
      special_marker: note.frontmatter.special_marker,
      areas: note.frontmatter.areas,
      resource_refs: note.frontmatter.resource_refs,
      synthesis_ref: note.frontmatter.synthesis_ref,
      ...extra
    }
  });
}

function broadcast(event: NoteChangeEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.notes.event, event);
  }
}
