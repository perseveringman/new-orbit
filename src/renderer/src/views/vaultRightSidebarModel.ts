export type VaultViewKind =
  | 'editor'
  | 'agents'
  | 'tools'
  | 'developerConsole'
  | 'github'
  | 'inbox'
  | 'notes'
  | 'library'
  | 'search'
  | 'memory'
  | 'review'
  | 'feeds'
  | 'resources'
  | 'resource'
  | 'knowledgeBase'
  | 'scheduled'
  | 'timeline'
  | 'gateway'
  | 'askAnywhere'
  | 'conversations'
  | 'today'
  | 'dashboard'
  | 'vision'
  | 'journals'
  | 'project'
  | 'kanban'
  | 'runtimes'
  | 'area'
  | 'areaRoom';

export type ProjectRoomMode = 'kanban' | 'terminal' | 'sessions' | 'github';

export type SidebarSurfaceId =
  | 'editor'
  | 'agents'
  | 'tools'
  | 'developerConsole'
  | 'github'
  | 'inbox'
  | 'notes'
  | 'library'
  | 'search'
  | 'memory'
  | 'review'
  | 'feeds'
  | 'resources'
  | 'knowledgeBase'
  | 'scheduled'
  | 'timeline'
  | 'gateway'
  | 'askAnywhere'
  | 'conversations'
  | 'today'
  | 'dashboard'
  | 'vision'
  | 'journals'
  | 'kanban'
  | 'runtimes'
  | 'area'
  | 'areaRoom'
  | 'project.kanban'
  | 'project.terminal'
  | 'project.sessions'
  | 'project.github';

export type SidebarIntentId = 'overview' | 'focus' | 'execution';
export type SidebarPaneMode = 'hidden' | 'rail' | 'expanded';
export type SidebarPanelWidthPreset = 'narrow' | 'normal' | 'wide';
export type SidebarPanelIconId =
  | 'inspector'
  | 'dashboard-focus'
  | 'dashboard-rhythm'
  | 'files'
  | 'area'
  | 'backlinks'
  | 'task'
  | 'task-tree'
  | 'agent'
  | 'worktrees'
  | 'review'
  | 'runlog'
  | 'diff'
  | 'sessions'
  | 'ask';

export type SidebarPanelId =
  | 'inspector'
  | 'dashboard-focus'
  | 'dashboard-rhythm'
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
  | 'sessions'
  | 'ask';

export interface SidebarIntentTab {
  id: SidebarIntentId;
  title: string;
}

export interface SidebarPanelTab {
  id: SidebarPanelId;
  title: string;
  icon: SidebarPanelIconId;
  widthPreset: SidebarPanelWidthPreset;
  description: string;
}

interface SidebarIntentProfile extends SidebarIntentTab {
  panels: readonly SidebarPanelId[];
}

interface SidebarSurfaceProfile {
  intents: readonly SidebarIntentProfile[];
}

const PANEL_WIDTHS: Record<SidebarPanelWidthPreset, number> = {
  narrow: 320,
  normal: 400,
  wide: 560
};

const PANEL_META: Record<
  SidebarPanelId,
  Omit<SidebarPanelTab, 'id'>
> = {
  inspector: {
    title: 'Inspector',
    icon: 'inspector',
    widthPreset: 'normal',
    description: 'Inspect files, changes, and workspace context.'
  },
  'dashboard-focus': {
    title: 'Focus',
    icon: 'dashboard-focus',
    widthPreset: 'normal',
    description: 'Choose the next dashboard action from inbox, blockers, tasks, and active projects.'
  },
  'dashboard-rhythm': {
    title: 'Rhythm',
    icon: 'dashboard-rhythm',
    widthPreset: 'normal',
    description: 'Review vision cadence, knowledge movement, recent activity, and system pulse.'
  },
  files: {
    title: 'Files',
    icon: 'files',
    widthPreset: 'narrow',
    description: 'Browse vault files without leaving the main workspace.'
  },
  'area-config': {
    title: 'Area',
    icon: 'area',
    widthPreset: 'normal',
    description: 'Tune the active area and its working context.'
  },
  backlinks: {
    title: 'Backlinks',
    icon: 'backlinks',
    widthPreset: 'narrow',
    description: 'See connected notes and references for the focused item.'
  },
  'task-detail': {
    title: 'Task Detail',
    icon: 'task',
    widthPreset: 'normal',
    description: 'Edit the selected task beside the current workspace.'
  },
  'task-tree': {
    title: 'Task Tree',
    icon: 'task-tree',
    widthPreset: 'normal',
    description: 'Scan project tasks while another project surface stays open.'
  },
  agent: {
    title: 'Agent',
    icon: 'agent',
    widthPreset: 'normal',
    description: 'Launch or monitor the execution agent for the active project.'
  },
  worktrees: {
    title: 'Worktrees',
    icon: 'worktrees',
    widthPreset: 'normal',
    description: 'Review isolated execution contexts and linked code workdirs.'
  },
  review: {
    title: 'Review',
    icon: 'review',
    widthPreset: 'wide',
    description: 'Approve, reject, or inspect pending human-review items.'
  },
  runlog: {
    title: 'Run Log',
    icon: 'runlog',
    widthPreset: 'wide',
    description: 'Follow execution events and terminal activity.'
  },
  diff: {
    title: 'Diff',
    icon: 'diff',
    widthPreset: 'wide',
    description: 'Review file changes as a second workspace pane.'
  },
  sessions: {
    title: 'Sessions',
    icon: 'sessions',
    widthPreset: 'normal',
    description: 'Inspect project or area sessions without leaving the flow.'
  },
  ask: {
    title: 'Ask',
    icon: 'ask',
    widthPreset: 'wide',
    description: 'Open a scoped Ask companion next to the current work.'
  }
};

const SURFACE_PROFILES: Record<SidebarSurfaceId, SidebarSurfaceProfile> = {
  editor: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'backlinks', 'inspector'] }]
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
  notes: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'backlinks', 'inspector'] }]
  },
  library: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'inspector'] }]
  },
  search: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['inspector'] }]
  },
  memory: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['inspector'] }]
  },
  review: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['review', 'inspector'] }]
  },
  feeds: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['inspector'] }]
  },
  resources: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'backlinks', 'inspector'] }]
  },
  knowledgeBase: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'inspector'] }]
  },
  scheduled: {
    intents: [{ id: 'execution', title: 'Execution', panels: ['runlog', 'inspector'] }]
  },
  timeline: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['inspector'] }]
  },
  gateway: {
    intents: [{ id: 'execution', title: 'Execution', panels: ['inspector', 'runlog'] }]
  },
  askAnywhere: {
    intents: [{ id: 'focus', title: 'Focus', panels: ['inspector'] }]
  },
  conversations: {
    intents: [{ id: 'focus', title: 'Focus', panels: ['inspector'] }]
  },
  today: {
    intents: [{ id: 'focus', title: 'Focus', panels: ['task-detail'] }]
  },
  dashboard: {
    intents: [
      { id: 'overview', title: 'Command', panels: ['dashboard-focus', 'dashboard-rhythm'] },
      { id: 'execution', title: 'Ops', panels: ['review', 'agent', 'runlog'] }
    ]
  },
  vision: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files', 'inspector'] }]
  },
  agents: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['inspector', 'review'] },
      { id: 'execution', title: 'Execution', panels: ['runlog', 'diff'] }
    ]
  },
  tools: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['inspector'] },
      { id: 'execution', title: 'Execution', panels: ['runlog', 'review'] }
    ]
  },
  developerConsole: {
    intents: [{ id: 'execution', title: 'Execution', panels: ['runlog', 'inspector'] }]
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
  runtimes: {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['inspector', 'worktrees'] },
      { id: 'execution', title: 'Execution', panels: ['runlog', 'review'] }
    ]
  },
  area: {
    intents: [{ id: 'overview', title: 'Overview', panels: ['files'] }]
  },
  areaRoom: {
    intents: [
      {
        id: 'overview',
        title: 'Overview',
        panels: ['area-config', 'files', 'sessions', 'inspector']
      }
    ]
  },
  'project.kanban': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['agent', 'review', 'diff'] }
    ]
  },
  'project.terminal': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.sessions': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: 'Focus', panels: ['task-detail'] },
      { id: 'execution', title: 'Execution', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.github': {
    intents: [
      { id: 'overview', title: 'Overview', panels: ['task-tree', 'worktrees', 'inspector'] },
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

  if (view.kind === 'resource') return 'resources';

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
  const panels = [...(intent?.panels ?? [])];
  if (!panels.includes('ask')) panels.push('ask');
  return panels.map((id) => ({ id, ...PANEL_META[id] }));
}

export function findSidebarIntentForPanel(
  surface: SidebarSurfaceId,
  panelId: SidebarPanelId
): SidebarIntentId | null {
  if (panelId === 'ask') return SURFACE_PROFILES[surface].intents[0]?.id ?? null;
  const match = SURFACE_PROFILES[surface].intents.find((intent) => intent.panels.includes(panelId));
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

  return visiblePanels.some((panel) => panel.id === activePanelId) ? activePanelId : fallback;
}

export function getSidebarDefaultWidth(panelId: SidebarPanelId): number {
  return PANEL_WIDTHS[PANEL_META[panelId].widthPreset];
}
