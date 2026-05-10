import { describe, expect, it } from 'vitest';
import {
  deriveProjectRoomInstanceKey,
  resolveProjectRoomPaneHint,
  resolveProjectRoomSidebarPanel,
  resolveProjectRoomSidebarSurface,
  type ProjectRoomOuterTab
} from '../src/renderer/src/views/projectRoomModel';
import { getSidebarPanelTabs } from '../src/renderer/src/views/vaultRightSidebarModel';

describe('project room model', () => {
  it('adds a sessions outer tab with a dedicated sidebar surface', () => {
    const outerTab: ProjectRoomOuterTab = 'sessions';
    expect(resolveProjectRoomSidebarSurface(outerTab)).toBe('project.sessions');
    expect(resolveProjectRoomPaneHint('sessions')).toBe('sessions');
  });

  it('keeps the compact sessions panel available on the project sessions surface', () => {
    expect(getSidebarPanelTabs('project.sessions', 'execution').map((panel) => panel.id)).toContain(
      'sessions'
    );
  });

  it('routes the sessions outer tab to the sessions sidebar panel', () => {
    expect(resolveProjectRoomSidebarPanel('sessions')).toBe('sessions');
  });

  it('adds a github outer tab with a dedicated sidebar surface', () => {
    const outerTab: ProjectRoomOuterTab = 'github';
    expect(resolveProjectRoomSidebarSurface(outerTab)).toBe('project.github');
    expect(resolveProjectRoomPaneHint('github')).toBe('github');
  });

  it('resolves planner and roles deep links to the matching outer tabs', () => {
    expect(resolveProjectRoomPaneHint('materials')).toBe('materials');
    expect(resolveProjectRoomPaneHint('planner')).toBe('planner');
    expect(resolveProjectRoomPaneHint('roles')).toBe('roles');
  });

  it('derives a distinct room instance key for each active project', () => {
    expect(deriveProjectRoomInstanceKey(null)).toBe('project-room:none');
    expect(deriveProjectRoomInstanceKey('project-a')).toBe('project-room:project-a');
    expect(deriveProjectRoomInstanceKey('project-b')).toBe('project-room:project-b');
    expect(deriveProjectRoomInstanceKey('project-a')).not.toBe(
      deriveProjectRoomInstanceKey('project-b')
    );
  });
});
