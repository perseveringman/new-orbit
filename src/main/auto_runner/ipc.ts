import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { AutoRunnerStatusDTO } from '@shared/auto_runner';
import { getAutoRunnerDispatcher } from './dispatcher';

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

export function registerAutoRunnerIpc(): void {
  const dispatcher = getAutoRunnerDispatcher();
  ipcMain.handle(IPC.autoRunner.status, async (): Promise<AutoRunnerStatusDTO> =>
    dispatcher.status()
  );
  ipcMain.handle(IPC.autoRunner.start, async (): Promise<AutoRunnerStatusDTO> =>
    dispatcher.start()
  );
  ipcMain.handle(IPC.autoRunner.stop, async (): Promise<AutoRunnerStatusDTO> =>
    dispatcher.stop()
  );
  dispatcher.on('run_started', (event) => broadcast(IPC.autoRunner.event, { type: 'run_started', event }));
  dispatcher.on('run_completed', (event) =>
    broadcast(IPC.autoRunner.event, { type: 'run_completed', event })
  );
  dispatcher.on('run_failed', (event) => broadcast(IPC.autoRunner.event, { type: 'run_failed', event }));
}

