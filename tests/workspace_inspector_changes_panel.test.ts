import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangesFileEntry, DiffFile } from '@shared/git';
import {
  buildChangeFiles,
  buildChangeRows
} from '../src/renderer/src/components/Inspector/changes/buildChangeRows';
import { ChangesTree } from '../src/renderer/src/components/Inspector/changes/ChangesTree';

const mockState = { activeTab: 'changes' as 'files' | 'changes' };
const mockParaView = { kind: 'project' as const };
const mockWorkspaceState = {
  activeProjectUid: 'project-1',
  projects: [
    {
      uid: 'project-1',
      slug: 'orbit-app',
      name: 'Orbit App',
      path: '/projects/orbit-app',
      github: {
        provider: 'github' as const,
        owner: 'acme',
        repo: 'orbit-app',
        fullName: 'acme/orbit-app',
        url: 'https://github.com/acme/orbit-app',
        cloneUrlHttps: 'https://github.com/acme/orbit-app.git',
        cloneUrlSsh: 'git@github.com:acme/orbit-app.git',
        defaultBranch: 'main',
        visibility: 'private' as const,
        connectedAt: '2026-04-24T00:00:00.000Z'
      }
    }
  ]
};
const mockFilesState = {
  toast: vi.fn()
};

vi.mock('../src/renderer/src/store/workspaceInspector', () => ({
  useWorkspaceInspector: () => ({
    activeTab: mockState.activeTab,
    selectTab: vi.fn(),
    changeQuery: '',
    selectedPath: 'src/app.ts',
    commitMessage: '',
    expanded: {},
    setChangeQuery: vi.fn(),
    setSelectedPath: vi.fn(),
    setCommitMessage: vi.fn(),
    toggleExpanded: vi.fn(),
    collapseAll: vi.fn()
  })
}));

vi.mock('../src/renderer/src/store/para', () => ({
  usePara: (sel?: (s: { view: typeof mockParaView }) => unknown) => {
    const state = { view: mockParaView };
    return sel ? sel(state) : state;
  }
}));

vi.mock('../src/renderer/src/store/workspace', () => ({
  useWorkspace: (sel?: (s: typeof mockWorkspaceState) => unknown) =>
    sel ? sel(mockWorkspaceState) : mockWorkspaceState
}));

vi.mock('../src/renderer/src/store/files', () => ({
  useFiles: (sel?: (s: typeof mockFilesState) => unknown) =>
    sel ? sel(mockFilesState) : mockFilesState
}));

const { WorkspaceInspectorPane } = await import(
  '../src/renderer/src/components/Inspector/WorkspaceInspectorPane'
);

describe('WorkspaceInspectorPane changes tab', () => {
  beforeEach(() => {
    mockState.activeTab = 'changes';
  });

  it('renders grouped changes summary and commit controls instead of the placeholder', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInspectorPane));
    expect(html).toContain('Base main');
    expect(html).toContain('files changed');
    expect(html).toContain('Commit message');
    expect(html).toContain('Create pull request');
  });
});

describe('change row helpers', () => {
  it('groups files by directory and keeps per-file diff totals', () => {
    const files: ChangesFileEntry[] = [
      { indexStatus: 'M', workTreeStatus: ' ', path: 'src/app.ts' },
      { indexStatus: '?', workTreeStatus: '?', path: 'README.md' }
    ];
    const diffs: DiffFile[] = [
      {
        path: 'src/app.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        patch: '@@ -1 +1 @@\n-old\n+new'
      }
    ];

    const changeFiles = buildChangeFiles(files, diffs, '');
    const rows = buildChangeRows(changeFiles, {});

    expect(rows[0]).toMatchObject({ type: 'group', label: 'Root', count: 1 });
    expect(rows[2]).toMatchObject({ type: 'group', label: 'src', count: 1 });
    expect(rows[3]).toMatchObject({
      type: 'file',
      file: {
        path: 'src/app.ts',
        additions: 3,
        deletions: 1,
        displayStatus: 'modified'
      }
    });
  });

  it('renders selected file rows with status glyphs and diff totals', () => {
    const rows = buildChangeRows(
      buildChangeFiles(
        [{ indexStatus: 'M', workTreeStatus: ' ', path: 'src/app.ts' }],
        [
          {
            path: 'src/app.ts',
            status: 'modified',
            additions: 2,
            deletions: 1,
            patch: '@@ -1 +1 @@\n-old\n+new'
          }
        ],
        ''
      ),
      {}
    );

    const html = renderToStaticMarkup(
      createElement(ChangesTree, {
        rows,
        expandedGroups: {},
        selectedPath: 'src/app.ts',
        pendingDiscardPath: null,
        busyPath: null,
        onSelect: vi.fn(),
        onToggleGroup: vi.fn(),
        onStage: vi.fn(),
        onUnstage: vi.fn(),
        onDiscard: vi.fn(),
        onConfirmDiscard: vi.fn(),
        onCancelDiscard: vi.fn()
      })
    );

    expect(html).toContain('src');
    expect(html).toContain('M');
    expect(html).toContain('+2');
    expect(html).toContain('-1');
    expect(html).toContain('bg-inspector-surface-1');
  });
});
