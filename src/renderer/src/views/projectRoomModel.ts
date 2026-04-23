import type { SidebarSurfaceId } from './vaultRightSidebarModel';

export type ProjectRoomHeaderAction = 'enable-orbit-tools' | 'archive-project';
export type ProjectRoomOuterTab = 'kanban' | 'terminal';

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
        args.taskCount === 0
          ? 'Create a task to begin.'
          : 'Select a task from the Kanban to edit.'
    }
  };
}

export function resolveProjectRoomSidebarSurface(
  outerTab: ProjectRoomOuterTab
): SidebarSurfaceId {
  return outerTab === 'terminal' ? 'project.terminal' : 'project.kanban';
}

export function resolveProjectRoomPaneHint(pane?: 'task'): 'task' | null;
export function resolveProjectRoomPaneHint(
  pane?: 'task' | 'readme' | 'agent'
): 'task' | null;
export function resolveProjectRoomPaneHint(
  pane?: 'task' | 'readme' | 'agent'
): 'task' | null {
  return pane === 'task' ? 'task' : null;
}
