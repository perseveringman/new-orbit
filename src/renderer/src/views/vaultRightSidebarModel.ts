import type { PaneKind } from '../lib/panes/types';

export type VaultViewKind =
  | 'editor'
  | 'inbox'
  | 'today'
  | 'dashboard'
  | 'journals'
  | 'project'
  | 'kanban'
  | 'area';

export type RightPaneTabId =
  | 'files'
  | 'backlinks'
  | 'agent'
  | 'worktrees'
  | 'review'
  | 'runlog'
  | 'diff'
  | 'sessions';

export interface RightPaneTabDef {
  id: RightPaneTabId;
  kind: PaneKind;
  title: string;
  visibleIn: 'always' | 'editor' | 'project';
}

export const RIGHT_PANE_TABS: readonly RightPaneTabDef[] = [
  { id: 'files', kind: 'files', title: 'Files', visibleIn: 'always' },
  { id: 'backlinks', kind: 'backlinks', title: 'Backlinks', visibleIn: 'editor' },
  { id: 'agent', kind: 'agent', title: 'Agent', visibleIn: 'always' },
  { id: 'worktrees', kind: 'worktrees', title: 'Worktrees', visibleIn: 'always' },
  { id: 'review', kind: 'review-inbox', title: 'Review', visibleIn: 'always' },
  { id: 'runlog', kind: 'run-log', title: 'Run Log', visibleIn: 'always' },
  { id: 'diff', kind: 'diff', title: 'Diff', visibleIn: 'always' },
  { id: 'sessions', kind: 'terminal-history', title: 'Sessions', visibleIn: 'project' }
] as const;

export function getVisibleRightPaneTabs(viewKind: VaultViewKind): RightPaneTabDef[] {
  return RIGHT_PANE_TABS.filter((tab) => {
    if (tab.visibleIn === 'always') return true;
    if (tab.visibleIn === 'editor') return viewKind === 'editor';
    return viewKind === 'project';
  });
}

export function resolveVisibleRightPaneTab(
  activeTabId: string | null | undefined,
  viewKind: VaultViewKind
): RightPaneTabId {
  const visibleTabs = getVisibleRightPaneTabs(viewKind);
  const fallback = visibleTabs[0]?.id ?? 'files';
  if (!activeTabId) return fallback;
  return visibleTabs.some((tab) => tab.id === activeTabId)
    ? (activeTabId as RightPaneTabId)
    : fallback;
}
