import type { SidebarPanelId, SidebarSurfaceId } from './vaultRightSidebarModel';

export type ProjectRoomHeaderAction = 'archive-project';
export type ProjectRoomOuterTab =
  | 'context'
  | 'kanban'
  | 'terminal'
  | 'sessions'
  | 'github'
  | 'materials'
  | 'outputs'
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
    headerActions: ['archive-project'],
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
  if (outerTab === 'context') return 'project.kanban';
  if (outerTab === 'materials') return 'project.kanban';
  if (outerTab === 'outputs') return 'project.kanban';
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
  pane?: 'task' | 'context' | 'sessions' | 'github' | 'materials' | 'outputs' | 'planner' | 'roles' | 'readme' | 'agent'
): 'task' | 'context' | 'sessions' | 'github' | 'materials' | 'outputs' | 'planner' | 'roles' | null;
export function resolveProjectRoomPaneHint(
  pane?: 'task' | 'context' | 'sessions' | 'github' | 'materials' | 'outputs' | 'planner' | 'roles' | 'readme' | 'agent'
): 'task' | 'context' | 'sessions' | 'github' | 'materials' | 'outputs' | 'planner' | 'roles' | null {
  if (pane === 'task') return 'task';
  if (pane === 'context') return 'context';
  if (pane === 'sessions') return 'sessions';
  if (pane === 'github') return 'github';
  if (pane === 'materials') return 'materials';
  if (pane === 'outputs') return 'outputs';
  if (pane === 'planner') return 'planner';
  if (pane === 'roles') return 'roles';
  return null;
}
