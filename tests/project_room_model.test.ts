import { describe, expect, it } from 'vitest';
import {
  deriveProjectRoomKanbanModel,
  resolveProjectRoomPaneHint
} from '../src/renderer/src/views/projectRoomModel';

describe('project room kanban model', () => {
  it('removes document side panes and keeps kanban full width', () => {
    const model = deriveProjectRoomKanbanModel({
      taskCount: 5,
      selectedTaskId: null
    });

    expect(model.headerActions).toEqual(['enable-orbit-tools', 'archive-project']);
    expect(model.documentTabs).toEqual([]);
    expect(model.detailSurface).toBe('modal');
    expect(model.kanbanPaneClassName).toBe('flex-1');
    expect(model.taskModal).toEqual({
      open: false,
      taskId: null,
      emptyStateMessage: 'Select a task from the Kanban to edit.'
    });
  });

  it('opens task details as a modal instead of an inline pane', () => {
    const model = deriveProjectRoomKanbanModel({
      taskCount: 3,
      selectedTaskId: 'task-42'
    });

    expect(model.taskModal.open).toBe(true);
    expect(model.taskModal.taskId).toBe('task-42');
  });

  it('ignores legacy readme and agent pane hints', () => {
    expect(resolveProjectRoomPaneHint('task')).toBe('task');
    expect(resolveProjectRoomPaneHint('readme')).toBeNull();
    expect(resolveProjectRoomPaneHint('agent')).toBeNull();
    expect(resolveProjectRoomPaneHint(undefined)).toBeNull();
  });
});
