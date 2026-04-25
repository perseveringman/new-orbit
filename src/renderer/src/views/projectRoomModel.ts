import type { SidebarPanelId, SidebarSurfaceId } from './vaultRightSidebarModel';

export type ProjectRoomHeaderAction = 'enable-orbit-tools' | 'archive-project';
export type ProjectRoomOuterTab =
  | 'kanban'
  | 'terminal'
  | 'sessions'
  | 'github'
  | 'planner'
  | 'roles';

export function deriveProjectRoomInstanceKey(projectUid: string | null): string {
  return `project-room:${projectUid ?? 'none'}`;
}

export interface ProjectRoomKanbanModel {
  headerActions: ProjectRoomHeaderAction[];
  documentTabs: [];
  detailSurface: 'sidebar';
  kanbanPaneClassName: 'flex-1';
  taskPanel: {
    panelId: 'task-detail';
    selectedTaskId: string | null;
    emptyStateMessage: string;
  };
}

export function deriveProjectRoomKanbanModel(args: {
  taskCount: number;
  selectedTaskId: string | null;
}): ProjectRoomKanbanModel {
  return {
    headerActions: ['enable-orbit-tools', 'archive-project'],
    documentTabs: [],
    detailSurface: 'sidebar',
    kanbanPaneClassName: 'flex-1',
    taskPanel: {
      panelId: 'task-detail',
      selectedTaskId: args.selectedTaskId,
      emptyStateMessage:
        args.taskCount === 0 ? 'Create a task to begin.' : 'Select a task from the Kanban to edit.'
    }
  };
}

export function resolveProjectRoomSidebarSurface(outerTab: ProjectRoomOuterTab): SidebarSurfaceId {
  if (outerTab === 'terminal') return 'project.terminal';
  if (outerTab === 'sessions') return 'project.sessions';
  if (outerTab === 'github') return 'project.github';
  if (outerTab === 'planner') return 'project.kanban';
  if (outerTab === 'roles') return 'project.kanban';
  return 'project.kanban';
}

export function resolveProjectRoomSidebarPanel(
  outerTab: ProjectRoomOuterTab
): SidebarPanelId | null {
  if (outerTab === 'sessions') return 'sessions';
  return null;
}

export function resolveProjectRoomPaneHint(pane?: 'task'): 'task' | null;
export function resolveProjectRoomPaneHint(
  pane?: 'task' | 'sessions' | 'github' | 'planner' | 'roles' | 'readme' | 'agent'
): 'task' | 'sessions' | 'github' | 'planner' | 'roles' | null;
export function resolveProjectRoomPaneHint(
  pane?: 'task' | 'sessions' | 'github' | 'planner' | 'roles' | 'readme' | 'agent'
): 'task' | 'sessions' | 'github' | 'planner' | 'roles' | null {
  if (pane === 'task') return 'task';
  if (pane === 'sessions') return 'sessions';
  if (pane === 'github') return 'github';
  if (pane === 'planner') return 'planner';
  if (pane === 'roles') return 'roles';
  return null;
}
