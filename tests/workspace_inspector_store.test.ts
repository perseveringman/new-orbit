import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceInspector } from '../src/renderer/src/store/workspaceInspector';

describe('workspaceInspector store', () => {
  beforeEach(() => {
    useWorkspaceInspector.getState().reset();
  });

  it('defaults activeTab to files', () => {
    expect(useWorkspaceInspector.getState().activeTab).toBe('files');
  });

  it('selectTab changes activeTab to changes', () => {
    useWorkspaceInspector.getState().selectTab('changes');
    expect(useWorkspaceInspector.getState().activeTab).toBe('changes');
  });

  it('selectTab changes activeTab back to files', () => {
    useWorkspaceInspector.getState().selectTab('changes');
    useWorkspaceInspector.getState().selectTab('files');
    expect(useWorkspaceInspector.getState().activeTab).toBe('files');
  });

  it('initializes with empty queries, null selectedPath, and empty expanded map', () => {
    const state = useWorkspaceInspector.getState();
    expect(state.fileQuery).toBe('');
    expect(state.changeQuery).toBe('');
    expect(state.selectedPath).toBeNull();
    expect(state.commitMessage).toBe('');
    expect(state.expanded).toEqual({});
  });

  it('setFileQuery updates fileQuery', () => {
    useWorkspaceInspector.getState().setFileQuery('README');
    expect(useWorkspaceInspector.getState().fileQuery).toBe('README');
  });

  it('setChangeQuery updates changeQuery', () => {
    useWorkspaceInspector.getState().setChangeQuery('src/');
    expect(useWorkspaceInspector.getState().changeQuery).toBe('src/');
  });

  it('setSelectedPath updates selectedPath', () => {
    useWorkspaceInspector.getState().setSelectedPath('src/main.ts');
    expect(useWorkspaceInspector.getState().selectedPath).toBe('src/main.ts');
  });

  it('setCommitMessage updates commitMessage', () => {
    useWorkspaceInspector.getState().setCommitMessage('feat: add inspector');
    expect(useWorkspaceInspector.getState().commitMessage).toBe('feat: add inspector');
  });

  it('toggleExpanded collapses default-open groups on the first click and re-expands on the second', () => {
    useWorkspaceInspector.getState().toggleExpanded('src/');
    expect(useWorkspaceInspector.getState().expanded['src/']).toBe(false);
    useWorkspaceInspector.getState().toggleExpanded('src/');
    expect(useWorkspaceInspector.getState().expanded['src/']).toBe(true);
  });

  it('reset restores all fields to their defaults', () => {
    useWorkspaceInspector.getState().selectTab('changes');
    useWorkspaceInspector.getState().setFileQuery('foo');
    useWorkspaceInspector.getState().setSelectedPath('src/a.ts');
    useWorkspaceInspector.getState().toggleExpanded('src/');
    useWorkspaceInspector.getState().reset();

    const state = useWorkspaceInspector.getState();
    expect(state.activeTab).toBe('files');
    expect(state.fileQuery).toBe('');
    expect(state.selectedPath).toBeNull();
    expect(state.expanded).toEqual({});
  });
});
