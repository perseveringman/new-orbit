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
  | 'dashboard'
  | 'vision'
  | 'journals'
  | 'project'
  | 'kanban'
  | 'runtimes'
  | 'runtimeSessions'
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
  | 'dashboard'
  | 'vision'
  | 'journals'
  | 'kanban'
  | 'runtimes'
  | 'runtimeSessions'
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
    title: '检查器',
    icon: 'inspector',
    widthPreset: 'normal',
    description: '检查文件、变更和工作区上下文。'
  },
  'dashboard-focus': {
    title: '聚焦',
    icon: 'dashboard-focus',
    widthPreset: 'normal',
    description: '从收件箱、阻塞项、任务和活跃项目中选择下一步行动。'
  },
  'dashboard-rhythm': {
    title: '节奏',
    icon: 'dashboard-rhythm',
    widthPreset: 'normal',
    description: '复盘愿景节奏、知识流动、近期活动和系统脉搏。'
  },
  files: {
    title: '文件',
    icon: 'files',
    widthPreset: 'narrow',
    description: '不离开主工作区即可浏览 vault 文件。'
  },
  'area-config': {
    title: '领域',
    icon: 'area',
    widthPreset: 'normal',
    description: '调整活跃领域及其工作上下文。'
  },
  backlinks: {
    title: '反向链接',
    icon: 'backlinks',
    widthPreset: 'narrow',
    description: '查看聚焦条目的相关笔记和引用。'
  },
  'task-detail': {
    title: '任务详情',
    icon: 'task',
    widthPreset: 'normal',
    description: '在当前工作区旁编辑所选任务。'
  },
  'task-tree': {
    title: '任务树',
    icon: 'task-tree',
    widthPreset: 'normal',
    description: '在保持其他项目界面打开时浏览项目任务。'
  },
  agent: {
    title: 'Agent',
    icon: 'agent',
    widthPreset: 'normal',
    description: '启动或监控活跃项目的执行 agent。'
  },
  worktrees: {
    title: 'Worktrees',
    icon: 'worktrees',
    widthPreset: 'normal',
    description: '查看隔离执行上下文和已链接代码工作目录。'
  },
  review: {
    title: '审核',
    icon: 'review',
    widthPreset: 'wide',
    description: '批准、拒绝或检查待人工审核条目。'
  },
  runlog: {
    title: '运行日志',
    icon: 'runlog',
    widthPreset: 'wide',
    description: '跟踪执行事件和终端活动。'
  },
  diff: {
    title: '差异',
    icon: 'diff',
    widthPreset: 'wide',
    description: '在第二工作区面板中审阅文件变更。'
  },
  sessions: {
    title: '会话',
    icon: 'sessions',
    widthPreset: 'normal',
    description: '不离开当前流程即可检查项目或领域会话。'
  },
  ask: {
    title: '提问',
    icon: 'ask',
    widthPreset: 'wide',
    description: '在当前工作旁打开带范围的提问助手。'
  }
};

const SURFACE_PROFILES: Record<SidebarSurfaceId, SidebarSurfaceProfile> = {
  editor: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'backlinks', 'inspector'] }]
  },
  github: {
    intents: [
      { id: 'overview', title: '概览', panels: ['worktrees'] },
      { id: 'execution', title: '执行', panels: ['review'] }
    ]
  },
  inbox: {
    intents: [{ id: 'focus', title: '聚焦', panels: ['task-detail'] }]
  },
  notes: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'backlinks', 'inspector'] }]
  },
  library: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'inspector'] }]
  },
  search: {
    intents: [{ id: 'overview', title: '概览', panels: ['inspector'] }]
  },
  memory: {
    intents: [{ id: 'overview', title: '概览', panels: ['inspector'] }]
  },
  review: {
    intents: [{ id: 'overview', title: '概览', panels: ['review', 'inspector'] }]
  },
  feeds: {
    intents: [{ id: 'overview', title: '概览', panels: ['inspector'] }]
  },
  resources: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'backlinks', 'inspector'] }]
  },
  knowledgeBase: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'inspector'] }]
  },
  scheduled: {
    intents: [{ id: 'execution', title: '执行', panels: ['runlog', 'inspector'] }]
  },
  timeline: {
    intents: [{ id: 'overview', title: '概览', panels: ['inspector'] }]
  },
  gateway: {
    intents: [{ id: 'execution', title: '执行', panels: ['inspector', 'runlog'] }]
  },
  askAnywhere: {
    intents: [{ id: 'focus', title: '聚焦', panels: ['inspector'] }]
  },
  conversations: {
    intents: [{ id: 'focus', title: '聚焦', panels: ['inspector'] }]
  },
  dashboard: {
    intents: [
      { id: 'overview', title: '指挥', panels: ['dashboard-focus', 'dashboard-rhythm'] },
      { id: 'execution', title: '运维', panels: ['review', 'agent', 'runlog'] }
    ]
  },
  vision: {
    intents: [{ id: 'overview', title: '概览', panels: ['files', 'inspector'] }]
  },
  agents: {
    intents: [
      { id: 'overview', title: '概览', panels: ['inspector', 'review'] },
      { id: 'execution', title: '执行', panels: ['runlog', 'diff'] }
    ]
  },
  tools: {
    intents: [
      { id: 'overview', title: '概览', panels: ['inspector'] },
      { id: 'execution', title: '执行', panels: ['runlog', 'review'] }
    ]
  },
  developerConsole: {
    intents: [{ id: 'execution', title: '执行', panels: ['runlog', 'inspector'] }]
  },
  journals: {
    intents: [{ id: 'overview', title: '概览', panels: ['files'] }]
  },
  kanban: {
    intents: [
      { id: 'overview', title: '概览', panels: ['task-tree'] },
      { id: 'focus', title: '聚焦', panels: ['task-detail'] }
    ]
  },
  runtimes: {
    intents: [
      { id: 'overview', title: '概览', panels: ['inspector', 'worktrees'] },
      { id: 'execution', title: '执行', panels: ['runlog', 'review'] }
    ]
  },
  runtimeSessions: {
    intents: [{ id: 'overview', title: '概览', panels: ['inspector'] }]
  },
  area: {
    intents: [{ id: 'overview', title: '概览', panels: ['files'] }]
  },
  areaRoom: {
    intents: [
      {
        id: 'overview',
        title: '概览',
        panels: ['area-config', 'files', 'sessions', 'inspector']
      }
    ]
  },
  'project.kanban': {
    intents: [
      { id: 'overview', title: '概览', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: '聚焦', panels: ['task-detail'] },
      { id: 'execution', title: '执行', panels: ['agent', 'review', 'diff'] }
    ]
  },
  'project.terminal': {
    intents: [
      { id: 'overview', title: '概览', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: '聚焦', panels: ['task-detail'] },
      { id: 'execution', title: '执行', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.sessions': {
    intents: [
      { id: 'overview', title: '概览', panels: ['task-tree', 'inspector'] },
      { id: 'focus', title: '聚焦', panels: ['task-detail'] },
      { id: 'execution', title: '执行', panels: ['sessions', 'runlog', 'diff'] }
    ]
  },
  'project.github': {
    intents: [
      { id: 'overview', title: '概览', panels: ['task-tree', 'worktrees', 'inspector'] },
      { id: 'focus', title: '聚焦', panels: ['task-detail'] },
      { id: 'execution', title: '执行', panels: ['review', 'diff'] }
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
