import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateMemoryInput,
  MemoryBackendId,
  MemoryFilter,
  MemorySourceSyncOptions,
  RecallOptions,
  UpdateMemoryBackendConfigInput,
  UpdateMemoryInput
} from '@shared/memory';
import type { TraceableEvent } from '@shared/events';
import { eventReplayBus } from '../events/bus';
import { ConversationStore } from '../conversation/store';
import { extractFromConversation, extractMemoryCandidates } from './extractor';
import { generateMemoryDigestWithBackend } from './digest-synthesis';
import { createMemoryStore, type MemoryStore } from './store';
import {
  createActiveMemory,
  getActiveMemoryBackend,
  getMemoryBackendStatus,
  testMemoryBackend,
  updateActiveMemoryBackendConfig
} from './backend-registry';
import { syncMemoryFromTruthLayer } from './source-sync';

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

  ipcMain.handle(IPC.memory.backendStatus, () => getMemoryBackendStatus(runtime().vaultPath));
  ipcMain.handle(IPC.memory.updateBackendConfig, (_event, input: UpdateMemoryBackendConfigInput) => updateActiveMemoryBackendConfig(runtime().vaultPath, input));
  ipcMain.handle(IPC.memory.testBackend, (_event, id?: MemoryBackendId) => testMemoryBackend(runtime().vaultPath, id));
  ipcMain.handle(IPC.memory.list, async (_event, filter?: MemoryFilter) => (await getActiveMemoryBackend(runtime().vaultPath)).list(filter));
  ipcMain.handle(IPC.memory.get, async (_event, id: string) => (await getActiveMemoryBackend(runtime().vaultPath)).get(id));
  ipcMain.handle(IPC.memory.create, async (_event, input: CreateMemoryInput) => (await getActiveMemoryBackend(runtime().vaultPath)).create(input));
  ipcMain.handle(IPC.memory.update, async (_event, id: string, patch: UpdateMemoryInput) => (await getActiveMemoryBackend(runtime().vaultPath)).update(id, patch));
  ipcMain.handle(IPC.memory.archive, async (_event, id: string) => (await getActiveMemoryBackend(runtime().vaultPath)).archive(id));
  ipcMain.handle(IPC.memory.merge, async (_event, fromId: string, toId: string) => (await getActiveMemoryBackend(runtime().vaultPath)).merge(fromId, toId));
  ipcMain.handle(IPC.memory.promoteToResource, async (_event, id: string) => (await getActiveMemoryBackend(runtime().vaultPath)).promoteToResource(id));
  ipcMain.handle(IPC.memory.promoteToProject, async (_event, id: string) => (await getActiveMemoryBackend(runtime().vaultPath)).promoteToProject(id));
  ipcMain.handle(IPC.memory.recall, async (_event, query: string, options?: RecallOptions) => (await getActiveMemoryBackend(runtime().vaultPath)).recall(query, options));
  ipcMain.handle(IPC.memory.recallStats, async (_event, id: string) => (await getActiveMemoryBackend(runtime().vaultPath)).recallStats(id));
  ipcMain.handle(IPC.memory.clusters, async () => (await getActiveMemoryBackend(runtime().vaultPath)).clusters());
  ipcMain.handle(IPC.memory.graph, async (_event, filter?: MemoryFilter) => (await getActiveMemoryBackend(runtime().vaultPath)).graph(filter));
  ipcMain.handle(IPC.memory.feedback, async (_event, id: string, helpful: boolean) => (await getActiveMemoryBackend(runtime().vaultPath)).feedback(id, helpful));
  ipcMain.handle(IPC.memory.syncTruthLayer, async (_event, options?: MemorySourceSyncOptions) => {
    const result = await syncMemoryFromTruthLayer(runtime().vaultPath, options);
    broadcastMemory({ type: 'memory.truth_layer_synced', count: result.created_count + result.updated_count });
    return result;
  });
  ipcMain.handle(IPC.memory.generateDigest, async () => {
    const { vaultPath } = runtime();
    return generateMemoryDigestWithBackend(vaultPath, await getActiveMemoryBackend(vaultPath));
  });
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
  const candidates = extractMemoryCandidates(extractFromConversation(conversation));
  for (const candidate of candidates) await createActiveMemory(vaultPath, candidate);
  if (candidates.length) broadcastMemory({ type: 'memory.extracted', count: candidates.length });
}

function broadcastMemory(event: { type: string; count?: number }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.memory.event, event);
  }
}
