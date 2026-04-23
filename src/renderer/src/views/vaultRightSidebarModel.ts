export type VaultViewKind =
  | 'editor'
  | 'github'
  | 'inbox'
  | 'today'
  | 'dashboard'
  | 'journals'
  | 'project'
  | 'kanban'
  | 'area'
  | 'areaRoom';

export type ProjectRoomMode = 'kanban' | 'terminal' | 'sessions' | 'github';

export type SidebarSurfaceId =
  | 'editor'
  | 'github'
  | 'inbox'
  | 'today'
  | 'dashboard'
  | 'journals'
  | 'kanban'
  | 'area'
  | 'areaRoom'
  | 'project.kanban'
  | 'project.terminal'
  | 'project.sessions'
  | 'project.github';

export type SidebarIntentId = 'overview' | 'focus' | 'execution';

export type SidebarPanelId =
  | 'files'
  | 'area-config'
  | 'backlinks'
  | 'task-detail'
  | 'task-tree'
  | 'agent'
  | 'worktrees'
  | 'review'
  | 'runlog'
  | 'diff'
  | 'sessions';

export interface SidebarIntentTab {
  id: SidebarIntentId;
  title: string;
}

export interface SidebarPanelTab {
  id: SidebarPanelId;
  title: string;
}

interface SidebarIntentProfile extends SidebarIntentTab {
  panels: readonly SidebarPanelId[];
}

interface SidebarSurfaceProfile {
  intents: readonly SidebarIntentProfile[];
}

const PANEL_TITLES: Record<SidebarPanelId, string> = {
  files: 'Files',
  'area-config': 'Area',
  backlinks: 'Backlinks',
  'task-detail': 'Task Detail',
  'task-tree': 'Task Tree',
  agent: 'Agent',
  worktrees: 'Worktrees',
  review: 'Review',
  runlog: 'Run Log',
  diff: 'Diff',
  sessions: 'Sessions'
};

const SURFACE_PROFILES: Record<SidebarSurfaceId, SidebarSurfaceProfile> = {
  editor: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'backlinks'] }]
  },
  github: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['worktrees'] },
      { id: 'execution', title: 'Execution', panels: ['review'] }
    ]
  },
  inbox: {
    intents: [{ id: 'focus', title: 'Focus', panels: ['task-detail'] }]
  },
  today: {
    intents: [{ id: 'focus', title: 'Focus', panels: ['task-detail'] }]
  },
  dashboard: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['review', 'worktrees'] },
      { id: 'execution', title: 'Execution', panels: ['agent', 'runlog', 'diff'] }
    ]
  },
  journals: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files'] }]
  },
  kanban: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] }
    ]
  },
  area: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files'] }]
  },
  areaRoom: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['area-config', 'files', 'sessions'] }]
  },
  'project.kanban': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['agent', 'review', 'diff'] }
    ]
  },
  'project.terminal': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.sessions': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.github': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree', 'worktrees'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['review', 'diff'] }
    ]
  }
};

export function resolveSidebarSurface(
  view: { kind: VaultViewKind; projectUid?: string | null },
  projectMode: ProjectRoomMode = 'kanban'
): SidebarSurfaceId {
  if (view.kind === 'project') {
    if (projectMode === 'terminal') return 'project.terminal';
    if (projectMode === 'sessions') return 'project.sessions';
    if (projectMode === 'github') return 'project.github';
    return 'project.kanban';
  }

  return view.kind;
}

export function getSidebarIntentTabs(surface: SidebarSurfaceId): SidebarIntentTab[] {
  return SURFACE_PROFILES[surface].intents.map(({ id, title }) => ({ id, title }));
}

export function resolveSidebarIntentTab(
  surface: SidebarSurfaceId,
  activeIntentId: SidebarIntentId | null | undefined
): SidebarIntentId {
  const fallback = SURFACE_PROFILES[surface].intents[0]?.id ?? 'overview';
  if (!activeIntentId) return fallback;

  return SURFACE_PROFILES[surface].intents.some((intent) => intent.id === activeIntentId)
    ? activeIntentId
    : fallback;
}

export function getSidebarPanelTabs(
  surface: SidebarSurfaceId,
  intentId: SidebarIntentId
): SidebarPanelTab[] {
  const resolvedIntent = resolveSidebarIntentTab(surface, intentId);
  const intent = SURFACE_PROFILES[surface].intents.find((entry) => entry.id === resolvedIntent);
  return (intent?.panels ?? []).map((id) => ({ id, title: PANEL_TITLES[id] }));
}

export function findSidebarIntentForPanel(
  surface: SidebarSurfaceId,
  panelId: SidebarPanelId
): SidebarIntentId | null {
  const match = SURFACE_PROFILES[surface].intents.find((intent) =>
    intent.panels.includes(panelId)
  );
  return match?.id ?? null;
}

export function resolveSidebarPanelTab(
  surface: SidebarSurfaceId,
  intentId: SidebarIntentId,
  activePanelId: SidebarPanelId | null | undefined
): SidebarPanelId {
  const visiblePanels = getSidebarPanelTabs(surface, intentId);
  const fallback = visiblePanels[0]?.id ?? 'files';
  if (!activePanelId) return fallback;

  return visiblePanels.some((panel) => panel.id === activePanelId)
    ? activePanelId
    : fallback;
}
