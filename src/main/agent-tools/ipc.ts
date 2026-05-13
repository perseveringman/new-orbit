import { ipcMain } from 'electron';
import type { AgentToolRegistrySnapshot } from '@shared/agent-tools';
import { IPC } from '@shared/ipc';
import { buildAgentToolRegistrySnapshot } from './catalog';

let wired = false;

export function registerAgentToolsIpc(): void {
  if (wired) return;
  wired = true;
  ipcMain.handle(IPC.tools.snapshot, async (): Promise<AgentToolRegistrySnapshot> => {
    return buildAgentToolRegistrySnapshot();
  });
}
