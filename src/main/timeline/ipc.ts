import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { TimelineScope } from '@shared/timeline';
import { createTimelineStore } from './store';
import { eventReplayBus } from '../events/bus';

export function registerTimelineIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createTimelineStore(vaultPath());

  ipcMain.handle(IPC.timeline.getDay, (_event, date: string, options?: { developerMode?: boolean }) =>
    store().getDay(date, Boolean(options?.developerMode))
  );
  ipcMain.handle(IPC.timeline.getWeek, (_event, isoWeek: string) => store().getWeek(isoWeek));
  ipcMain.handle(IPC.timeline.getMonth, (_event, month: string) => store().getMonthlyIndex(month));
  ipcMain.handle(IPC.timeline.getYear, (_event, year: number) => store().getYearlyIndex(year));
  ipcMain.handle(IPC.timeline.getMonthlyIndex, (_event, month: string) => store().getMonthlyIndex(month));
  ipcMain.handle(IPC.timeline.getYearlyIndex, (_event, year: number) => store().getYearlyIndex(year));
  ipcMain.handle(IPC.timeline.generateDailySummary, (_event, date: string) => store().generateDailySummary(date));
  ipcMain.handle(IPC.timeline.updateDailySummary, (_event, date: string, patch: { narrative?: string; headline?: string }) =>
    store().updateDailySummary(date, patch)
  );
  ipcMain.handle(IPC.timeline.exportPDF, (_event, scope: TimelineScope) => store().exportPDF(scope));

  eventReplayBus.on('event', async (event) => {
    const vault = getVaultPath();
    if (!vault) return;
    const date = event.at.slice(0, 10);
    const timeline = await createTimelineStore(vault).getDay(date).catch(() => null);
    if (!timeline) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.timeline.event, timeline);
    }
  });
}
