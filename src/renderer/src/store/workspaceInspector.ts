import { create } from 'zustand';

export type InspectorTab = 'files' | 'changes';

interface WorkspaceInspectorState {
  activeTab: InspectorTab;
  fileQuery: string;
  changeQuery: string;
  selectedPath: string | null;
  commitMessage: string;
  expanded: Record<string, boolean>;

  reset(): void;
  selectTab(tab: InspectorTab): void;
  setFileQuery(query: string): void;
  setChangeQuery(query: string): void;
  setSelectedPath(path: string | null): void;
  setCommitMessage(msg: string): void;
  toggleExpanded(path: string): void;
}

function createDefaultState(): Omit<
  WorkspaceInspectorState,
  | 'reset'
  | 'selectTab'
  | 'setFileQuery'
  | 'setChangeQuery'
  | 'setSelectedPath'
  | 'setCommitMessage'
  | 'toggleExpanded'
> {
  return {
    activeTab: 'files',
    fileQuery: '',
    changeQuery: '',
    selectedPath: null,
    commitMessage: '',
    expanded: {}
  };
}

export const useWorkspaceInspector = create<WorkspaceInspectorState>((set, get) => ({
  ...createDefaultState(),

  reset() {
    set(createDefaultState());
  },

  selectTab(tab) {
    set({ activeTab: tab });
  },

  setFileQuery(query) {
    set({ fileQuery: query });
  },

  setChangeQuery(query) {
    set({ changeQuery: query });
  },

  setSelectedPath(path) {
    set({ selectedPath: path });
  },

  setCommitMessage(msg) {
    set({ commitMessage: msg });
  },

  toggleExpanded(path) {
    const prev = get().expanded;
    set({ expanded: { ...prev, [path]: !prev[path] } });
  }
}));
