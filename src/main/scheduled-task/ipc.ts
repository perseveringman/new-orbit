import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CreateScheduledTaskInput, ScheduledTask, ScheduledTaskExecution, ScheduledTaskFilter } from '@shared/scheduled-task';
import { createScheduledTaskStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export function registerScheduledTaskIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  const store = () => createScheduledTaskStore(vaultPath());

  ipcMain.handle(IPC.scheduledTasks.list, (_event, filter?: ScheduledTaskFilter) => store().list(filter));
  ipcMain.handle(IPC.scheduledTasks.get, (_event, taskId: string) => store().get(taskId));
  ipcMain.handle(IPC.scheduledTasks.create, async (_event, input: CreateScheduledTaskInput) => {
    const task = await store().create(input);
    publishTaskEvent('scheduled_task.created', task);
    broadcast({ type: 'created', task });
    return task;
  });
  ipcMain.handle(IPC.scheduledTasks.update, async (_event, taskId: string, patch: Partial<ScheduledTask>) => {
    const task = await store().update(taskId, patch);
    publishTaskEvent('scheduled_task.updated', task);
    broadcast({ type: 'updated', task });
    return task;
  });
  ipcMain.handle(IPC.scheduledTasks.delete, async (_event, taskId: string) => {
    await store().delete(taskId);
    publishTraceableEvent({ source: 'activity', kind: 'scheduled_task.deleted', payload: { task_id: taskId } });
    broadcast({ type: 'deleted' });
  });
  ipcMain.handle(IPC.scheduledTasks.pause, async (_event, taskId: string) => {
    const task = await store().pause(taskId);
    publishTaskEvent('scheduled_task.paused', task);
    broadcast({ type: 'paused', task });
    return task;
  });
  ipcMain.handle(IPC.scheduledTasks.resume, async (_event, taskId: string) => {
    const task = await store().resume(taskId);
    publishTaskEvent('scheduled_task.resumed', task);
    broadcast({ type: 'resumed', task });
    return task;
  });
  ipcMain.handle(IPC.scheduledTasks.triggerNow, async (_event, taskId: string) => {
    const execution = await store().triggerNow(taskId);
    publishTraceableEvent({
      source: 'activity',
      kind: 'scheduled_task.execution.completed',
      summary: `Scheduled task executed: ${taskId}`,
      payload: { task_id: taskId, execution_id: execution.id, status: execution.status }
    });
    broadcast({ type: 'execution', execution });
    return execution;
  });
  ipcMain.handle(IPC.scheduledTasks.executions, (_event, taskId: string, limit?: number, offset?: number) =>
    store().executions(taskId, limit, offset)
  );
  ipcMain.handle(IPC.scheduledTasks.parseNaturalLanguage, (_event, text: string) =>
    store().parseNaturalLanguage(text)
  );
}

export async function ensureScheduledSystemTasks(vaultPath: string): Promise<void> {
  await createScheduledTaskStore(vaultPath).ensureSystemTasks();
}

function publishTaskEvent(kind: 'scheduled_task.created' | 'scheduled_task.updated' | 'scheduled_task.paused' | 'scheduled_task.resumed', task: ScheduledTask): void {
  publishTraceableEvent({
    source: 'activity',
    kind,
    summary: `Scheduled task: ${task.name}`,
    payload: { task_id: task.id, name: task.name, status: task.status }
  });
}

function broadcast(event: { type: string; task?: ScheduledTask; execution?: ScheduledTaskExecution }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.scheduledTasks.event, event);
  }
}

