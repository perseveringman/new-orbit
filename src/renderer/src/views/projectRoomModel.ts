export type ProjectRoomHeaderAction = 'enable-orbit-tools' | 'archive-project';

export interface ProjectRoomKanbanModel {
  headerActions: ProjectRoomHeaderAction[];
  documentTabs: [];
  detailSurface: 'modal';
  kanbanPaneClassName: 'flex-1';
  taskModal: {
    open: boolean;
    taskId: string | null;
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
    detailSurface: 'modal',
    kanbanPaneClassName: 'flex-1',
    taskModal: {
      open: args.selectedTaskId !== null,
      taskId: args.selectedTaskId,
      emptyStateMessage:
        args.taskCount === 0
          ? 'Create a task to begin.'
          : 'Select a task from the Kanban to edit.'
    }
  };
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
