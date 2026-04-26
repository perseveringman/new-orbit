import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { TraceableEvent, TraceableEventFilter, TraceableEventQueryResult } from '@shared/events';
import { currentEventReplayStore, eventReplayBus, publishTraceableEvent } from './bus';

export function registerEventReplayIpc(): void {
  ipcMain.handle(
    IPC.events.query,
    async (_event, filter?: TraceableEventFilter): Promise<TraceableEventQueryResult> => {
      publishTraceableEvent({
        source: 'ipc',
        type: 'events.query',
        summary: 'Developer Console queried traceable events',
        payload: filter ?? {}
      });
      const store = currentEventReplayStore();
      if (!store) return { events: [], count: 0 };
      return store.query(filter);
    }
  );
  ipcMain.handle(IPC.events.gc, async (_event, maxFiles?: number): Promise<number> => {
    const store = currentEventReplayStore();
    return store ? store.gc(maxFiles) : 0;
  });
  eventReplayBus.on('event', (event: TraceableEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.events.event, event);
    }
  });
}
