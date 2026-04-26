import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { InboxEvent } from './types';
import { publishTraceableEvent } from '../events/bus';

export function broadcastInboxEvent(event: InboxEvent): void {
  publishTraceableEvent({
    source: 'inbox',
    type: event.type,
    traceId: event.item.context.task_uid ?? event.item.id,
    taskUid: event.item.context.task_uid,
    summary: event.item.title,
    payload: event
  });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.inbox.event, event);
    }
  }
}
