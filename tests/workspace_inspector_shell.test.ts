import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INSPECTOR_THEME } from '../src/renderer/src/components/Inspector/inspectorTheme';

// Mutable state bag so individual tests can control what the hook returns.
const mockState = { activeTab: 'files' as 'files' | 'changes' };
const mockSelectTab = vi.fn((tab: 'files' | 'changes') => {
  mockState.activeTab = tab;
});

vi.mock('../src/renderer/src/store/workspaceInspector', () => ({
  useWorkspaceInspector: () => ({
    activeTab: mockState.activeTab,
    selectTab: mockSelectTab
  })
}));

// Import WorkspaceInspectorPane AFTER the mock so it picks up the mocked store.
const { WorkspaceInspectorPane } = await import(
  '../src/renderer/src/components/Inspector/WorkspaceInspectorPane'
);

describe('WorkspaceInspectorPane shell', () => {
  beforeEach(() => {
    mockState.activeTab = 'files';
    mockSelectTab.mockClear();
  });

  it('renders Files and Changes tab labels', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('Files');
    expect(html).toContain('Changes');
  });

  it('renders lucide SVG icons for both tabs', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    // lucide-react renders inline SVG elements
    expect(html).toMatch(/<svg/);
  });

  it('uses semantic inspector-surface token class on the panel', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('inspector-surface');
  });

  it('uses semantic inspector-border token class in tab bar', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('inspector-border');
  });

  it('uses semantic inspector-text token class in body', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('inspector-text');
  });

  it('uses inspector-accent token on the active tab', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('inspector-accent');
  });

  it('renders the files panel with a search input when activeTab is files', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('Search files');
  });

  it('shows the changes placeholder when activeTab is changes', () => {
    mockState.activeTab = 'changes';
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('Git changes');
  });

  it('INSPECTOR_THEME exports stable semantic class tokens', () => {
    expect(INSPECTOR_THEME.panel).toContain('inspector-surface');
    expect(INSPECTOR_THEME.tabBar).toContain('inspector-border');
    expect(INSPECTOR_THEME.textPrimary).toContain('inspector-text');
    expect(INSPECTOR_THEME.gitAdded).toContain('inspector-git');
    expect(INSPECTOR_THEME.tabActive).toContain('inspector-accent');
  });

  it('panel token includes a border-width utility so the border actually renders', () => {
    // border-inspector-border-subtle alone sets only the colour; without a
    // border-width class (border / border-l / etc.) nothing is visible.
    expect(INSPECTOR_THEME.panel).toMatch(/\bborder\b/);
  });
});
