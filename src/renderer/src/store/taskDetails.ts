import { create } from 'zustand';
import type { TaskRecord } from '@shared/schemas';

export type TaskDetailsTab = 'detail' | 'chat';

interface TaskDetailsState {
  open: boolean;
  task: TaskRecord | null;
  projectUid: string | null;
  tab: TaskDetailsTab;
  openTask(task: TaskRecord, projectUid?: string | null, tab?: TaskDetailsTab): void;
  close(): void;
  setTab(tab: TaskDetailsTab): void;
}

export const useTaskDetails = create<TaskDetailsState>((set) => ({
  open: false,
  task: null,
  projectUid: null,
  tab: 'detail',
  openTask(task, projectUid, tab) {
    set({
      open: true,
      task,
      projectUid: projectUid ?? task.project_uid ?? null,
      tab: tab ?? (task.active_run_id ? 'chat' : 'detail')
    });
  },
  close() {
    set({
      open: false,
      task: null,
      projectUid: null,
      tab: 'detail'
    });
  },
  setTab(tab) {
    set({ tab });
  }
}));
