import { describe, expect, it } from 'vitest';
import {
  getVisibleRightPaneTabs,
  resolveVisibleRightPaneTab
} from '../src/renderer/src/views/vaultRightSidebarModel';

describe('vault right sidebar model', () => {
  it('shows Session History only on project pages', () => {
    expect(getVisibleRightPaneTabs('project').map((tab) => tab.id)).toContain('sessions');
    expect(getVisibleRightPaneTabs('editor').map((tab) => tab.id)).not.toContain('sessions');
    expect(getVisibleRightPaneTabs('dashboard').map((tab) => tab.id)).not.toContain('sessions');
  });

  it('shows Backlinks only in editor view', () => {
    expect(getVisibleRightPaneTabs('editor').map((tab) => tab.id)).toContain('backlinks');
    expect(getVisibleRightPaneTabs('project').map((tab) => tab.id)).not.toContain('backlinks');
  });

  it('falls back to files when the active tab is hidden in the current view', () => {
    expect(resolveVisibleRightPaneTab('backlinks', 'dashboard')).toBe('files');
    expect(resolveVisibleRightPaneTab('sessions', 'editor')).toBe('files');
    expect(resolveVisibleRightPaneTab('sessions', 'project')).toBe('sessions');
  });
});
