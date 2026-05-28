import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AnnotationFilter,
  AnnotationRecord,
  AnnotationTargetRef,
  AnnotationViewState,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  UpdateAnnotationViewStateInput
} from '@shared/annotation';
import { createAnnotationStore } from './store';

export function registerAnnotationIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const current = getVaultPath();
    if (!current) throw new Error('No vault opened');
    return current;
  };

  ipcMain.handle(IPC.annotation.create, (_event, input: CreateAnnotationInput): Promise<AnnotationRecord> =>
    createAnnotationStore(vaultPath()).create(input)
  );

  ipcMain.handle(IPC.annotation.get, (_event, id: string): Promise<AnnotationRecord | null> =>
    createAnnotationStore(vaultPath()).get(id)
  );

  ipcMain.handle(IPC.annotation.list, (_event, filter?: AnnotationFilter): Promise<AnnotationRecord[]> =>
    createAnnotationStore(vaultPath()).list(filter)
  );

  ipcMain.handle(IPC.annotation.listForTarget, (_event, target: AnnotationTargetRef, includeArchived?: boolean): Promise<AnnotationRecord[]> =>
    createAnnotationStore(vaultPath()).listForTarget(target, includeArchived)
  );

  ipcMain.handle(IPC.annotation.update, (_event, id: string, patch: UpdateAnnotationInput): Promise<AnnotationRecord> =>
    createAnnotationStore(vaultPath()).update(id, patch)
  );

  ipcMain.handle(IPC.annotation.archive, (_event, id: string): Promise<AnnotationRecord> =>
    createAnnotationStore(vaultPath()).archive(id)
  );

  ipcMain.handle(IPC.annotation.listViewStates, (_event, spaceId: string): Promise<AnnotationViewState[]> =>
    createAnnotationStore(vaultPath()).listViewStates(spaceId)
  );

  ipcMain.handle(
    IPC.annotation.updateViewState,
    (_event, spaceId: string, annotationId: string, patch: UpdateAnnotationViewStateInput): Promise<AnnotationViewState> =>
      createAnnotationStore(vaultPath()).updateViewState(spaceId, annotationId, patch)
  );
}
