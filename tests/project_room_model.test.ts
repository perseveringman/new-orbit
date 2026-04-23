import { describe, expect, it } from 'vitest';
import {
  deriveProjectRoomKanbanModel,
  resolveProjectRoomPaneHint,
  resolveProjectRoomSidebarSurface
} from '../src/renderer/src/views/projectRoomModel';

describe('project room kanban model', () => {
  it('uses the sidebar for task detail while keeping kanban full width', () => {
    const model = deriveProjectRoomKanbanModel({
      taskCount: 5,
      selectedTaskId: null
    });

    expect(model.headerActions).toEqual(['enable-orbit-tools', 'archive-project']);
    expect(model.documentTabs).toEqual([]);
    expect(model.detailSurface).toBe('sidebar');
    expect(model.kanbanPaneClassName).toBe('flex-1');
    expect(model.taskPanel).toEqual({
      panelId: 'task-detail',
      selectedTaskId: null,
      emptyStateMessage: 'Select a task from the Kanban to edit.'
    });
  });

  it('tracks the selected task for the sidebar focus panel', () => {
    const model = deriveProjectRoomKanbanModel({
      taskCount: 3,
      selectedTaskId: 'task-42'
    });

    expect(model.taskPanel.panelId).toBe('task-detail');
    expect(model.taskPanel.selectedTaskId).toBe('task-42');
  });

  it('maps project room modes to their sidebar surfaces', () => {
    expect(resolveProjectRoomSidebarSurface('kanban')).toBe('project.kanban');
    expect(resolveProjectRoomSidebarSurface('terminal')).toBe('project.terminal');
  });

  it('ignores legacy readme and agent pane hints', () => {
    expect(resolveProjectRoomPaneHint('task')).toBe('task');
    expect(resolveProjectRoomPaneHint('readme')).toBeNull();
    expect(resolveProjectRoomPaneHint('agent')).toBeNull();
    expect(resolveProjectRoomPaneHint(undefined)).toBeNull();
  });
});
