import { describe, expect, it } from 'vitest';
import {
  getSidebarDefaultWidth,
  getSidebarIntentTabs,
  getSidebarPanelTabs,
  resolveSidebarIntentTab,
  resolveSidebarPanelTab,
  resolveSidebarSurface
} from '../src/renderer/src/views/vaultRightSidebarModel';

describe('vault right sidebar model', () => {
  it('maps project room modes to distinct sidebar surfaces', () => {
    expect(resolveSidebarSurface({ kind: 'editor' })).toBe('editor');
    expect(resolveSidebarSurface({ kind: 'project', projectUid: 'project-1' }, 'kanban')).toBe(
      'project.kanban'
    );
    expect(resolveSidebarSurface({ kind: 'project', projectUid: 'project-1' }, 'terminal')).toBe(
      'project.terminal'
    );
    expect(resolveSidebarSurface({ kind: 'github' })).toBe('github');
    expect(resolveSidebarSurface({ kind: 'project', projectUid: 'project-1' }, 'github')).toBe(
      'project.github'
    );
  });

  it('exposes top-level intents and shared panels per surface', () => {
    expect(getSidebarIntentTabs('editor').map((tab) => tab.id)).toEqual(['overview']);
    expect(getSidebarPanelTabs('editor', 'overview').map((tab) => tab.id)).toEqual([
      'files',
      'backlinks',
      'inspector',
      'ask'
    ]);

    expect(getSidebarIntentTabs('project.kanban').map((tab) => tab.id)).toEqual([
      'overview',
      'focus',
      'execution'
    ]);
    expect(getSidebarPanelTabs('project.kanban', 'focus').map((tab) => tab.id)).toEqual([
      'task-detail',
      'ask'
    ]);

    expect(getSidebarPanelTabs('project.terminal', 'overview').map((tab) => tab.id)).toEqual([
      'task-tree',
      'inspector',
      'ask'
    ]);
    expect(getSidebarPanelTabs('project.terminal', 'execution').map((tab) => tab.id)).toEqual([
      'sessions',
      'runlog',
      'diff',
      'ask'
    ]);
    expect(getSidebarPanelTabs('project.github', 'overview').map((tab) => tab.id)).toEqual([
      'task-tree',
      'worktrees',
      'inspector',
      'ask'
    ]);
    expect(getSidebarIntentTabs('dashboard').map((tab) => tab.id)).toEqual([
      'overview',
      'execution'
    ]);
    expect(getSidebarPanelTabs('dashboard', 'overview').map((tab) => tab.id)).toEqual([
      'dashboard-focus',
      'dashboard-rhythm',
      'ask'
    ]);
  });

  it('describes companion pane candidates with icons and width presets', () => {
    const terminal差异 = getSidebarPanelTabs('project.terminal', 'execution').find(
      (tab) => tab.id === 'diff'
    );
    expect(terminal差异).toMatchObject({
      title: '差异',
      icon: 'diff',
      widthPreset: 'wide'
    });

    const taskDetail = getSidebarPanelTabs('project.kanban', 'focus').find(
      (tab) => tab.id === 'task-detail'
    );
    expect(taskDetail).toMatchObject({
      icon: 'task',
      widthPreset: 'normal'
    });

    expect(getSidebarDefaultWidth('files')).toBeLessThan(getSidebarDefaultWidth('diff'));
    expect(getSidebarDefaultWidth('diff')).toBe(560);
  });

  it('exposes Ask as a right sidebar panel on every intent', () => {
    expect(getSidebarPanelTabs('editor', 'overview').map((tab) => tab.id)).toContain('ask');
    expect(getSidebarPanelTabs('areaRoom', 'overview').map((tab) => tab.id)).toContain('ask');
    expect(getSidebarPanelTabs('resources', 'overview').map((tab) => tab.id)).toContain('ask');
    expect(getSidebarPanelTabs('project.kanban', 'execution').map((tab) => tab.id)).toContain(
      'ask'
    );
  });

  it('exposes inspector panel on editor, areaRoom, and every project surface', () => {
    expect(getSidebarPanelTabs('editor', 'overview').map((tab) => tab.id)).toContain('inspector');
    expect(getSidebarPanelTabs('areaRoom', 'overview').map((tab) => tab.id)).toContain('inspector');
    expect(getSidebarPanelTabs('project.kanban', 'overview').map((tab) => tab.id)).toContain(
      'inspector'
    );
    expect(getSidebarPanelTabs('project.terminal', 'overview').map((tab) => tab.id)).toContain(
      'inspector'
    );
    expect(getSidebarPanelTabs('project.sessions', 'overview').map((tab) => tab.id)).toContain(
      'inspector'
    );
    expect(getSidebarPanelTabs('project.github', 'overview').map((tab) => tab.id)).toContain(
      'inspector'
    );
  });

  it('falls back to a valid intent and panel when previous selection is unavailable', () => {
    expect(resolveSidebarIntentTab('editor', 'execution')).toBe('overview');
    expect(resolveSidebarPanelTab('editor', 'overview', 'sessions')).toBe('files');
    expect(resolveSidebarPanelTab('project.terminal', 'focus', 'runlog')).toBe('task-detail');
    expect(resolveSidebarPanelTab('dashboard', 'execution', 'sessions')).toBe('review');
    expect(resolveSidebarPanelTab('dashboard', 'execution', 'ask')).toBe('ask');
  });
});
