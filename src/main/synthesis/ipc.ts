import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ApplyUserEditInput, EnsureSynthesisInput, SynthesisFilter } from '@shared/synthesis';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { registerSynthesisInvalidator } from './invalidator';
import { SynthesisRunner } from './runner';
import { SynthesisScheduler } from './scheduler';
import { createSynthesisStore, type SynthesisStore } from './store';

let current:
  | {
      vaultPath: string;
      store: SynthesisStore;
      scheduler: SynthesisScheduler;
    }
  | null = null;

export function getSynthesisRuntime(vaultPath: string): { store: SynthesisStore; scheduler: SynthesisScheduler } {
  if (current?.vaultPath === vaultPath) return current;
  const store = createSynthesisStore(vaultPath);
  const sdk = getSDKRuntime(vaultPath);
  const runner = new SynthesisRunner(store, { router: sdk.router, maxBudgetUsd: 1 });
  const scheduler = new SynthesisScheduler(store, runner);
  current = { vaultPath, store, scheduler };
  return current;
}

export function registerSynthesisIpc(getVaultPath: () => string | null): void {
  const runtime = () => {
    const vaultPath = getVaultPath();
    if (!vaultPath) throw new Error('no vault open');
    return getSynthesisRuntime(vaultPath);
  };

  registerSynthesisInvalidator(getVaultPath);

  ipcMain.handle(IPC.synthesis.get, (_event, scopeKey: string) => runtime().store.latest(scopeKey));
  ipcMain.handle(IPC.synthesis.getArtifact, (_event, artifactId: string) => runtime().store.get(artifactId));
  ipcMain.handle(IPC.synthesis.getMany, (_event, scopeKeys: string[]) => runtime().store.getMany(scopeKeys));
  ipcMain.handle(IPC.synthesis.list, (_event, filter?: SynthesisFilter) => runtime().store.list(filter));
  ipcMain.handle(IPC.synthesis.ensure, (_event, input: EnsureSynthesisInput) => runtime().scheduler.ensure(input));
  ipcMain.handle(IPC.synthesis.recompute, (_event, scopeKey: string, options?: { force?: boolean }) =>
    runtime().scheduler.recompute(scopeKey, { force: options?.force ?? true })
  );
  ipcMain.handle(IPC.synthesis.markStale, (_event, scopeKey: string, reason?: string) =>
    runtime().store.markStale(scopeKey, reason)
  );
  ipcMain.handle(IPC.synthesis.applyUserEdit, (_event, input: ApplyUserEditInput) =>
    runtime().store.applyUserEdit(input.artifact_id, input.payload)
  );
}

