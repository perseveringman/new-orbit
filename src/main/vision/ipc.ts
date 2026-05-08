import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CreateGoalInput, UpdateGoalInput, VisionHorizon } from '@shared/vision';
import { createGoalStore, type GoalStore } from './goal-store';
import { runVisionReview } from './review';

let current: { vaultPath: string; store: GoalStore } | null = null;

export function getVisionGoalRuntime(vaultPath: string): { store: GoalStore } {
  if (current?.vaultPath === vaultPath) return current;
  current = { vaultPath, store: createGoalStore(vaultPath) };
  return current;
}

export function registerVisionSystemIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return { vaultPath, ...getVisionGoalRuntime(vaultPath) };
  };
  ipcMain.handle(IPC.vision.listGoals, (_event, horizon?: VisionHorizon) => runtime().store.list(horizon));
  ipcMain.handle(IPC.vision.getGoal, (_event, id: string) => runtime().store.get(id));
  ipcMain.handle(IPC.vision.createGoal, (_event, input: CreateGoalInput) => runtime().store.create(input));
  ipcMain.handle(IPC.vision.updateGoal, (_event, id: string, patch: UpdateGoalInput) => runtime().store.update(id, patch));
  ipcMain.handle(IPC.vision.completeMilestone, (_event, id: string) => runtime().store.completeMilestone(id));
  ipcMain.handle(IPC.vision.getAlignment, () => runtime().store.getAlignment());
  ipcMain.handle(IPC.vision.detectDrift, () => runtime().store.detectDrift());
  ipcMain.handle(IPC.vision.triggerReview, () => runVisionReview(runtime().vaultPath));
}
