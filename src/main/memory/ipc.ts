import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CreateMemoryInput, MemoryFilter, RecallOptions, UpdateMemoryInput } from '@shared/memory';
import type { TraceableEvent } from '@shared/events';
import { eventReplayBus } from '../events/bus';
import { ConversationStore } from '../conversation/store';
import { extractFromConversation, extractMemoryCandidates } from './extractor';
import { generateMemoryDigest } from './digest-synthesis';
import { recallContext } from './recall-service';
import { createMemoryStore, type MemoryStore } from './store';

let current: { vaultPath: string; store: MemoryStore } | null = null;
let autoExtractorRegistered = false;
const extractedConversations = new Set<string>();

export function getMemoryRuntime(vaultPath: string): { store: MemoryStore } {
  if (current?.vaultPath === vaultPath) return current;
  current = { vaultPath, store: createMemoryStore(vaultPath) };
  return current;
}

export function registerMemoryIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, ...getMemoryRuntime(vaultPath) };
  };

  registerAutomaticMemoryExtraction(getVaultPath);

  ipcMain.handle(IPC.memory.list, (_event, filter?: MemoryFilter) => runtime().store.list(filter));
  ipcMain.handle(IPC.memory.get, (_event, id: string) => runtime().store.get(id));
  ipcMain.handle(IPC.memory.create, (_event, input: CreateMemoryInput) => runtime().store.create(input));
  ipcMain.handle(IPC.memory.update, (_event, id: string, patch: UpdateMemoryInput) => runtime().store.update(id, patch));
  ipcMain.handle(IPC.memory.archive, (_event, id: string) => runtime().store.archive(id));
  ipcMain.handle(IPC.memory.merge, (_event, fromId: string, toId: string) => runtime().store.merge(fromId, toId));
  ipcMain.handle(IPC.memory.promoteToResource, (_event, id: string) => runtime().store.promoteToResource(id));
  ipcMain.handle(IPC.memory.promoteToProject, (_event, id: string) => runtime().store.promoteToProject(id));
  ipcMain.handle(IPC.memory.recall, (_event, query: string, options?: RecallOptions) => recallContext(runtime().vaultPath, query, options));
  ipcMain.handle(IPC.memory.recallStats, (_event, id: string) => runtime().store.getRecallStats(id));
  ipcMain.handle(IPC.memory.clusters, () => runtime().store.listClusters());
  ipcMain.handle(IPC.memory.generateDigest, () => generateMemoryDigest(runtime().vaultPath));
}

function registerAutomaticMemoryExtraction(getVaultPath: () => string | null): void {
  if (autoExtractorRegistered) return;
  autoExtractorRegistered = true;
  eventReplayBus.on('event', (event: TraceableEvent) => {
    if (event.type !== 'conversation.turn.added' && event.kind !== 'conversation.turn.added') return;
    const vaultPath = getVaultPath();
    const conversationId = event.conversationId;
    if (!vaultPath || !conversationId || extractedConversations.has(conversationId)) return;
    extractedConversations.add(conversationId);
    setTimeout(() => {
      void extractConversation(vaultPath, conversationId).catch((error: unknown) => {
        console.error('[memory] automatic extraction failed', error);
        extractedConversations.delete(conversationId);
      });
    }, 500);
  });
}

async function extractConversation(vaultPath: string, conversationId: string): Promise<void> {
  const conversation = await new ConversationStore(vaultPath).get(conversationId);
  if (!conversation || conversation.turns.length < 2) return;
  const store = getMemoryRuntime(vaultPath).store;
  const candidates = extractMemoryCandidates(extractFromConversation(conversation));
  for (const candidate of candidates) await store.create(candidate);
  if (candidates.length) broadcastMemory({ type: 'memory.extracted', count: candidates.length });
}

function broadcastMemory(event: { type: string; count?: number }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.memory.event, event);
  }
}
