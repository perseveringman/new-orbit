import { create } from 'zustand';
import type { EntitySummary, TaskFilter, TaskRecord, TaskStatus } from '@shared/schemas';

export type WorkspaceView =
  | { kind: 'editor' }
  | { kind: 'dashboard' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'journals' }
  | { kind: 'kanban'; projectUid: string | null }
  | { kind: 'area'; areaUid: string | null }
  | { kind: 'project'; projectUid: string; pane?: 'task' };

interface ParaState {
  view: WorkspaceView;
  tasks: TaskRecord[];
  entities: EntitySummary[];
  loading: boolean;

  setView(v: WorkspaceView): void;
  refresh(): Promise<void>;
  refreshFiltered(filter?: TaskFilter): Promise<TaskRecord[]>;
  updateStatus(id: string, status: TaskStatus): Promise<void>;
}

export const usePara = create<ParaState>((set, get) => ({
  view: { kind: 'editor' },
  tasks: [],
  entities: [],
  loading: false,

  setView(v) {
    set({ view: v });
    void get().refresh();
  },

  async refresh() {
    set({ loading: true });
    try {
      const [tasks, entities] = await Promise.all([
        window.orbit.para.listTasks(),
        window.orbit.para.listEntities()
      ]);
      set({ tasks, entities, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async refreshFiltered(filter) {
    return window.orbit.para.listTasks(filter);
  },

  async updateStatus(id, status) {
    await window.orbit.para.updateTaskStatus(id, status);
    await get().refresh();
  }
}));
