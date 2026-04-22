export type PaneKind =
  | 'terminal'
  | 'diff'
  | 'run-log'
  | 'vault-file'
  | 'review-inbox'
  | 'files'
  | 'backlinks'
  | 'agent'
  | 'worktrees';

export type SplitDirection = 'row' | 'column';

export interface PaneTab<TData = unknown> {
  id: string;
  kind: PaneKind;
  title: string;
  data: TData;
  lastActiveAt: string;
}

export interface PaneLeaf {
  type: 'leaf';
  id: string;
  tabs: PaneTab[];
  activeTabId: string | null;
}

export interface PaneSplit {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: PaneNode[];
  sizes: number[];
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface WorkspaceLayout {
  root: PaneNode;
  focusedLeafId: string | null;
}
