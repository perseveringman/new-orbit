import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { Artifact, ConversationStage } from '@shared/stage';
import { createStageStore } from './stage-store';
import { publishTraceableEvent } from '../events/bus';

export function registerStageIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.stage.get, (_event, conversationId: string) => createStageStore(vaultPath()).get(conversationId));
  ipcMain.handle(
    IPC.stage.addArtifact,
    async (
      _event,
      conversationId: string,
      artifact: Omit<Artifact, 'id' | 'conversation_id' | 'created_at'> & Partial<Pick<Artifact, 'id' | 'created_at'>>
    ) => {
      const stored = await createStageStore(vaultPath()).add(conversationId, artifact);
      publishTraceableEvent({
        source: 'conversation',
        kind: 'stage.artifact.added',
        conversationId,
        summary: stored.title,
        payload: { conversation_id: conversationId, artifact_id: stored.id, artifact: stored }
      });
      await broadcast(vaultPath(), conversationId);
      return stored;
    }
  );
  ipcMain.handle(IPC.stage.removeArtifact, async (_event, conversationId: string, artifactId: string) => {
    await createStageStore(vaultPath()).remove(conversationId, artifactId);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'stage.artifact.removed',
      conversationId,
      payload: { conversation_id: conversationId, artifact_id: artifactId }
    });
    await broadcast(vaultPath(), conversationId);
  });
  ipcMain.handle(IPC.stage.execAction, async (_event, conversationId: string, artifactId: string, actionId: string) => {
    await createStageStore(vaultPath()).markAction(conversationId, artifactId, actionId);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'stage.artifact.action_executed',
      conversationId,
      payload: { conversation_id: conversationId, artifact_id: artifactId, action_id: actionId }
    });
    await broadcast(vaultPath(), conversationId);
  });
}

async function broadcast(vaultPath: string, conversationId: string): Promise<void> {
  const stage: ConversationStage = await createStageStore(vaultPath).get(conversationId);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.stage.event, stage);
  }
}

