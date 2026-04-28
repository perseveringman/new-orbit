import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ActivateKnowledgeBaseInput, ImportKnowledgeBaseInput, WelcomeAnalysisResult } from '@shared/knowledge-base';
import { createKnowledgeBaseStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export function registerKnowledgeBaseIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.knowledgeBase.list, () => createKnowledgeBaseStore(vaultPath()).list());
  ipcMain.handle(IPC.knowledgeBase.import, async (_event, input: ImportKnowledgeBaseInput) => {
    const kb = await createKnowledgeBaseStore(vaultPath()).import(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'kb.imported',
      summary: `Imported knowledge base: ${kb.name}`,
      payload: { kb_id: kb.id, name: kb.name, path: kb.path, item_count: kb.item_count }
    });
    return kb;
  });
  ipcMain.handle(IPC.knowledgeBase.remove, async (_event, kbId: string, deleteFiles?: boolean) => {
    await createKnowledgeBaseStore(vaultPath()).remove(kbId, deleteFiles);
    publishTraceableEvent({ source: 'activity', kind: 'kb.removed', payload: { kb_id: kbId } });
  });
  ipcMain.handle(IPC.knowledgeBase.rescan, async (_event, kbId: string) => {
    const kb = await createKnowledgeBaseStore(vaultPath()).rescan(kbId);
    publishTraceableEvent({
      source: 'activity',
      kind: 'kb.scanned',
      summary: `Scanned knowledge base: ${kb.name}`,
      payload: { kb_id: kb.id, name: kb.name, item_count: kb.item_count }
    });
    return kb;
  });
  ipcMain.handle(IPC.knowledgeBase.search, (_event, kbId: string | 'all', query: string) =>
    createKnowledgeBaseStore(vaultPath()).search(kbId, query)
  );
  ipcMain.handle(IPC.knowledgeBase.activate, async (_event, input: ActivateKnowledgeBaseInput) => {
    const note = await createKnowledgeBaseStore(vaultPath()).activate(input);
    publishTraceableEvent({
      source: 'activity',
      kind: 'note.created',
      summary: `Activated note: ${note.frontmatter.title ?? note.frontmatter.id}`,
      payload: {
        note_id: note.frontmatter.id,
        path: note.path,
        type: note.frontmatter.type,
        title: note.frontmatter.title,
        body: note.body,
        areas: note.frontmatter.areas,
        resource_refs: note.frontmatter.resource_refs,
        synthesis_ref: note.frontmatter.synthesis_ref
      }
    });
    publishTraceableEvent({
      source: 'activity',
      kind: 'kb.doc.activated',
      summary: `Activated KB excerpt into note: ${note.frontmatter.title ?? note.frontmatter.id}`,
      payload: {
        kb_id: input.kbId,
        note_id: note.frontmatter.id,
        path: note.path,
        source_file: input.sourceFile,
        source_ref: note.frontmatter.source?.ref
      }
    });
    return note;
  });

  ipcMain.handle(IPC.onboarding.status, () => createKnowledgeBaseStore(vaultPath()).status());
  ipcMain.handle(IPC.onboarding.skip, () => createKnowledgeBaseStore(vaultPath()).skipOnboarding());
  ipcMain.handle(IPC.onboarding.runWelcomeAnalysis, async (_event, kbIds: string[]) => {
    const result = await createKnowledgeBaseStore(vaultPath()).runWelcomeAnalysis(kbIds);
    publishTraceableEvent({
      source: 'activity',
      kind: 'kb.welcome_analysis_completed',
      summary: result.headline,
      payload: { kb_id: kbIds.join(','), name: result.headline, item_count: result.suggested_resources.length }
    });
    return result;
  });
  ipcMain.handle(IPC.onboarding.applySuggestions, (_event, result: WelcomeAnalysisResult) =>
    createKnowledgeBaseStore(vaultPath()).applySuggestions(result)
  );
}
