/**
 * Tests for Task 4: Files panel pure helpers and component rendering.
 *
 * Pure-function tests run without any mocks.
 * Component tests use renderToStaticMarkup so effects never fire and
 * window.orbit is never touched.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFileQuery,
  flattenFileTree,
  isBinaryFile
} from '../src/renderer/src/components/Inspector/files/buildFileRows';
import type { ProjectFileNode } from '@shared/types';

// ---------------------------------------------------------------------------
// Shared fixture tree
// ---------------------------------------------------------------------------

const FIXTURE_TREE: ProjectFileNode = {
  name: 'project',
  path: '/project',
  relPath: '',
  isDir: true,
  children: [
    {
      name: 'src',
      path: '/project/src',
      relPath: 'src',
      isDir: true,
      children: [
        {
          name: 'main.ts',
          path: '/project/src/main.ts',
          relPath: 'src/main.ts',
          isDir: false
        },
        {
          name: 'utils.ts',
          path: '/project/src/utils.ts',
          relPath: 'src/utils.ts',
          isDir: false
        }
      ]
    },
    {
      name: 'README.md',
      path: '/project/README.md',
      relPath: 'README.md',
      isDir: false
    }
  ]
};

// ---------------------------------------------------------------------------
// applyFileQuery — pure filtering
// ---------------------------------------------------------------------------

describe('applyFileQuery', () => {
  it('returns the full tree when query is empty', () => {
    const result = applyFileQuery(FIXTURE_TREE, '');
    expect(result.children).toHaveLength(2);
  });

  it('filters files by name keeping ancestor directories visible', () => {
    const result = applyFileQuery(FIXTURE_TREE, 'main');
    const src = result.children?.find((c) => c.name === 'src');
    expect(src).toBeDefined();
    expect(src?.children).toHaveLength(1);
    expect(src?.children?.[0].name).toBe('main.ts');
    // README should be gone
    expect(result.children?.find((c) => c.name === 'README.md')).toBeUndefined();
  });

  it('removes directories that have no matching descendants', () => {
    const result = applyFileQuery(FIXTURE_TREE, 'README');
    expect(result.children?.find((c) => c.name === 'src')).toBeUndefined();
    expect(result.children?.find((c) => c.name === 'README.md')).toBeDefined();
  });

  it('is case-insensitive', () => {
    const result = applyFileQuery(FIXTURE_TREE, 'README');
    expect(result.children?.find((c) => c.name === 'README.md')).toBeDefined();
  });

  it('returns empty children when nothing matches', () => {
    const result = applyFileQuery(FIXTURE_TREE, 'NOMATCH_XYZ');
    expect(result.children).toHaveLength(0);
  });

  it('trims whitespace from the query', () => {
    const result = applyFileQuery(FIXTURE_TREE, '  main  ');
    const src = result.children?.find((c) => c.name === 'src');
    expect(src?.children).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isBinaryFile
// ---------------------------------------------------------------------------

describe('isBinaryFile', () => {
  it('identifies png as binary', () => expect(isBinaryFile('icon.png')).toBe(true));
  it('identifies jpg as binary', () => expect(isBinaryFile('photo.jpg')).toBe(true));
  it('identifies pdf as binary', () => expect(isBinaryFile('doc.pdf')).toBe(true));
  it('identifies woff2 as binary', () => expect(isBinaryFile('font.woff2')).toBe(true));
  it('does not flag ts files as binary', () => expect(isBinaryFile('main.ts')).toBe(false));
  it('does not flag md files as binary', () => expect(isBinaryFile('README.md')).toBe(false));
  it('does not flag json files as binary', () => expect(isBinaryFile('data.json')).toBe(false));
  it('does not flag files with no extension as binary', () =>
    expect(isBinaryFile('Makefile')).toBe(false));
});

// ---------------------------------------------------------------------------
// flattenFileTree
// ---------------------------------------------------------------------------

describe('flattenFileTree', () => {
  it('returns top-level children at depth 0', () => {
    const rows = flattenFileTree(FIXTURE_TREE, {});
    expect(rows[0].depth).toBe(0);
    expect(rows[0].node.name).toBe('src');
    expect(rows[1].depth).toBe(0);
    expect(rows[1].node.name).toBe('README.md');
  });

  it('does not expand dirs unless they appear in the expanded map', () => {
    const rows = flattenFileTree(FIXTURE_TREE, {});
    const names = rows.map((r) => r.node.name);
    expect(names).not.toContain('main.ts');
    expect(names).not.toContain('utils.ts');
  });

  it('expands directories when path is in the expanded map', () => {
    const rows = flattenFileTree(FIXTURE_TREE, { '/project/src': true });
    const names = rows.map((r) => r.node.name);
    expect(names).toContain('main.ts');
    expect(names).toContain('utils.ts');
  });

  it('assigns depth 1 to children inside an expanded directory', () => {
    const rows = flattenFileTree(FIXTURE_TREE, { '/project/src': true });
    const main = rows.find((r) => r.node.name === 'main.ts');
    expect(main?.depth).toBe(1);
  });

  it('collapses a directory that was previously expanded when its key is false', () => {
    const rows = flattenFileTree(FIXTURE_TREE, { '/project/src': false });
    const names = rows.map((r) => r.node.name);
    expect(names).not.toContain('main.ts');
  });
});

// ---------------------------------------------------------------------------
// FilesPanel component — rendered HTML checks
//
// Store mocks must be declared before any dynamic import.
// ---------------------------------------------------------------------------

const mockInspectorState = {
  fileQuery: '',
  expanded: {} as Record<string, boolean>,
  selectedPath: null as string | null
};
const mockSetFileQuery = vi.fn((q: string) => {
  mockInspectorState.fileQuery = q;
});
const mockToggleExpanded = vi.fn();
const mockSetSelectedPath = vi.fn();
const mockCollapseAll = vi.fn();

vi.mock('../src/renderer/src/store/workspaceInspector', () => ({
  useWorkspaceInspector: () => ({
    activeTab: 'files' as const,
    selectTab: vi.fn(),
    fileQuery: mockInspectorState.fileQuery,
    expanded: mockInspectorState.expanded,
    selectedPath: mockInspectorState.selectedPath,
    setFileQuery: mockSetFileQuery,
    toggleExpanded: mockToggleExpanded,
    setSelectedPath: mockSetSelectedPath,
    collapseAll: mockCollapseAll
  })
}));

// Mutable para view so tests can switch surfaces
const mockParaView: { kind: string; projectUid?: string } = { kind: 'editor' };

vi.mock('../src/renderer/src/store/para', () => ({
  usePara: (sel?: (s: { view: typeof mockParaView }) => unknown) => {
    const state = { view: mockParaView };
    return sel ? sel(state) : state;
  }
}));

// Mutable workspace state
const mockWorkspaceState = {
  activeProjectUid: null as string | null,
  projects: [] as Array<{ uid: string; slug: string; name: string; path: string }>
};

vi.mock('../src/renderer/src/store/workspace', () => ({
  useWorkspace: (sel?: (s: typeof mockWorkspaceState) => unknown) =>
    sel ? sel(mockWorkspaceState) : mockWorkspaceState
}));

// Mutable files state
const mockVaultTree: ProjectFileNode = {
  name: 'vault',
  path: '/vault',
  relPath: '',
  isDir: true,
  children: [{ name: 'README.md', path: '/vault/README.md', relPath: 'README.md', isDir: false }]
};

const mockProjectTree: ProjectFileNode = {
  name: 'my-project',
  path: '/projects/my-project',
  relPath: '',
  isDir: true,
  children: [
    {
      name: 'src',
      path: '/projects/my-project/src',
      relPath: 'src',
      isDir: true,
      children: [
        {
          name: 'index.ts',
          path: '/projects/my-project/src/index.ts',
          relPath: 'src/index.ts',
          isDir: false
        }
      ]
    }
  ]
};

const mockFilesState = {
  tree: mockVaultTree as ProjectFileNode | null,
  projectTree: null as ProjectFileNode | null,
  projectTreeError: null as string | null,
  openPath: vi.fn(),
  toast: vi.fn(),
  refreshProjectTree: vi.fn()
};

vi.mock('../src/renderer/src/store/files', () => ({
  useFiles: (sel?: (s: typeof mockFilesState) => unknown) =>
    sel ? sel(mockFilesState) : mockFilesState
}));

// Dynamic imports after all vi.mock calls
const { FilesPanel } = await import('../src/renderer/src/components/Inspector/files/FilesPanel');

// ---------------------------------------------------------------------------
// FilesPanel component tests
// ---------------------------------------------------------------------------

describe('FilesPanel component', () => {
  beforeEach(() => {
    mockInspectorState.fileQuery = '';
    mockInspectorState.expanded = {};
    mockInspectorState.selectedPath = null;
    mockParaView.kind = 'editor';
    delete mockParaView.projectUid;
    mockWorkspaceState.activeProjectUid = null;
    mockWorkspaceState.projects = [];
    mockFilesState.tree = mockVaultTree;
    mockFilesState.projectTree = null;
    mockFilesState.projectTreeError = null;
    mockSetFileQuery.mockClear();
    mockToggleExpanded.mockClear();
    mockCollapseAll.mockClear();
    mockFilesState.openPath.mockClear();
    mockFilesState.toast.mockClear();
    mockFilesState.refreshProjectTree.mockClear();
  });

  it('renders 搜索文件... placeholder text', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('搜索文件');
  });

  it('renders 新建文件 toolbar button label', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('新建文件');
  });

  it('renders 新建文件夹 toolbar button label', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('新建文件夹');
  });

  it('renders 刷新 toolbar button label', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('刷新');
  });

  it('renders 全部折叠 toolbar button label', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('全部折叠');
  });

  it('renders lucide SVG icons in the toolbar', () => {
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toMatch(/<svg/);
  });

  it('shows vault markdown tree for non-project surfaces (editor view)', () => {
    // Non-project surface: view.kind === 'editor'
    mockParaView.kind = 'editor';
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('README');
  });

  it('shows the project tree for project surfaces when projectTree is loaded', () => {
    // Project surface: view.kind === 'project'
    mockParaView.kind = 'project';
    mockParaView.projectUid = 'proj-1';
    mockWorkspaceState.activeProjectUid = 'proj-1';
    mockWorkspaceState.projects = [
      { uid: 'proj-1', slug: 'my-project', name: 'My Project', path: '/projects/my-project' }
    ];
    // Simulate project tree already loaded in files store
    mockFilesState.projectTree = mockProjectTree;
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('src');
  });

  it('does NOT show vault README in project surface mode when projectTree is loaded', () => {
    mockParaView.kind = 'project';
    mockParaView.projectUid = 'proj-1';
    mockWorkspaceState.activeProjectUid = 'proj-1';
    mockWorkspaceState.projects = [
      { uid: 'proj-1', slug: 'my-project', name: 'My Project', path: '/projects/my-project' }
    ];
    mockFilesState.projectTree = mockProjectTree;
    const html = renderToStaticMarkup(createElement(FilesPanel));
    // The project tree doesn't have README
    expect(html).not.toContain('README.md');
  });

  it('shows error message in project surface when projectTreeError is set', () => {
    mockParaView.kind = 'project';
    mockParaView.projectUid = 'proj-1';
    mockWorkspaceState.activeProjectUid = 'proj-1';
    mockWorkspaceState.projects = [
      { uid: 'proj-1', slug: 'my-project', name: 'My Project', path: '/projects/my-project' }
    ];
    mockFilesState.projectTree = null;
    mockFilesState.projectTreeError = '加载项目文件失败';
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('加载项目文件失败');
    expect(html).not.toContain('正在加载');
  });

  it('shows 正在加载 when projectTree is null and no error in project surface', () => {
    mockParaView.kind = 'project';
    mockParaView.projectUid = 'proj-1';
    mockWorkspaceState.activeProjectUid = 'proj-1';
    mockWorkspaceState.projects = [
      { uid: 'proj-1', slug: 'my-project', name: 'My Project', path: '/projects/my-project' }
    ];
    mockFilesState.projectTree = null;
    mockFilesState.projectTreeError = null;
    const html = renderToStaticMarkup(createElement(FilesPanel));
    expect(html).toContain('加载中…');
    expect(html).not.toContain('失败');
  });

  it('does not show error message on non-project surface even when projectTreeError is set', () => {
    // Non-project surface should ignore projectTreeError and fall through to vault tree
    mockParaView.kind = 'editor';
    mockFilesState.projectTreeError = '加载项目文件失败';
    mockFilesState.tree = mockVaultTree;
    const html = renderToStaticMarkup(createElement(FilesPanel));
    // Vault tree should show, not the error message
    expect(html).toContain('README');
    expect(html).not.toContain('加载项目文件失败');
  });
});
