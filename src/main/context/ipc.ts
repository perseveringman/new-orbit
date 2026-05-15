import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { BuildContextPacketInput, BuildWorkContextInput } from '@shared/context';
import { buildContextPacket } from './packet-builder';
import { generateWorkContextReport } from './work-context';

const CONTEXT_BUILD_TIMEOUT_MS = 15000;

export function registerContextIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };

  ipcMain.handle(IPC.context.buildPacket, (_event, input: BuildContextPacketInput) =>
    withContextTimeout(
      buildContextPacket(vaultPath(), input),
      'ContextPacket 构建超时，请先刷新 evidence index 后重试。'
    )
  );

  ipcMain.handle(IPC.context.workContext, (_event, input: BuildWorkContextInput = {}) => {
    const period = input.period ?? defaultWorkContextPeriod();
    return withContextTimeout(
      generateWorkContextReport(vaultPath(), {
        ...input,
        period
      }),
      '项目上下文构建超时，请先刷新 evidence index 后重试。'
    );
  });
}

function defaultWorkContextPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 1000 * 60 * 60 * 24 * 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function withContextTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), CONTEXT_BUILD_TIMEOUT_MS);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
