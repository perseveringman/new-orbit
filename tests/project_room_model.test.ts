import { describe, expect, it } from 'vitest';
import {
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
});
