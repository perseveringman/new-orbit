import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { RuntimeSessionDisplaySettings } from '@shared/runtime-sessions';
import {
  getRuntimeSession,
  getRuntimeSessionMarkdown,
  listRuntimeSessions,
  runtimeSessionBridgeStatus
} from './bridge';

export function registerRuntimeSessionIpc(): void {
  ipcMain.handle(IPC.runtimeSessions.status, () => runtimeSessionBridgeStatus());
  ipcMain.handle(IPC.runtimeSessions.list, (_event, refresh?: boolean) => listRuntimeSessions(Boolean(refresh)));
  ipcMain.handle(IPC.runtimeSessions.get, (_event, agent: string, id: string) =>
    getRuntimeSession(agent, id)
  );
  ipcMain.handle(
    IPC.runtimeSessions.markdown,
    (_event, agent: string, id: string, settings?: Partial<RuntimeSessionDisplaySettings>) =>
      getRuntimeSessionMarkdown(agent, id, settings)
  );
}
