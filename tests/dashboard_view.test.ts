import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntitySummary } from '../src/shared/schemas';

const mockWorkspaceState = {
  vault: { path: '/vault' },
  visionExcerpt: 'North star',
  refreshVision: vi.fn(),
  projects: [],
  refreshProjects: vi.fn(),
  setActiveProjectUid: vi.fn(),
  areas: [
    {
      uid: 'area-1',
      slug: 'vision',
      name: 'Vision',
      status: 'active',
      template: 'vision',
      tags: [],
      created_at: '2026-04-24T00:00:00.000Z',
      updated_at: '2026-04-24T00:00:00.000Z',
      path: '/vault/02_Areas/vision',
      relPath: '02_Areas/vision',
      hasVision: true
    }
  ]
};

const mockEntities: EntitySummary[] = Array.from({ length: 6 }, (_, i) => ({
  type: 'area',
  uid: `entity-${i + 1}`,
  title: `Area doc ${i + 1}`,
  relPath: `02_Areas/vision/doc-${i + 1}.md`,
  path: `/vault/02_Areas/vision/doc-${i + 1}.md`
}));

const mockParaState = {
  entities: mockEntities,
  tasks: [],
  setView: vi.fn()
};

const mockFilesState = {
  toast: vi.fn(),
  openPath: vi.fn()
};

vi.mock('../src/renderer/src/store/workspace', () => ({
  useWorkspace: (sel?: (s: typeof mockWorkspaceState) => unknown) =>
    sel ? sel(mockWorkspaceState) : mockWorkspaceState
}));

vi.mock('../src/renderer/src/store/para', () => ({
  usePara: (sel?: (s: typeof mockParaState) => unknown) =>
    sel ? sel(mockParaState) : mockParaState
}));

vi.mock('../src/renderer/src/store/files', () => ({
  useFiles: (sel?: (s: typeof mockFilesState) => unknown) =>
    sel ? sel(mockFilesState) : mockFilesState
}));

vi.mock('../src/renderer/src/components/Modals/VisionEditorModal', () => ({
  VisionEditorModal: () => null
}));

const { DashboardView } = await import('../src/renderer/src/views/DashboardView');

describe('DashboardView area count', () => {
  beforeEach(() => {
    mockWorkspaceState.refreshVision.mockClear();
    mockWorkspaceState.refreshProjects.mockClear();
    mockWorkspaceState.setActiveProjectUid.mockClear();
    mockParaState.setView.mockClear();
    mockFilesState.toast.mockClear();
    mockFilesState.openPath.mockClear();
  });

  it('shows the number of real area directories instead of area-typed entity files', () => {
    const html = renderToStaticMarkup(createElement(DashboardView));
    expect(html).toContain('Areas');
    expect(html).toContain('>Areas</span><span class="ml-2 font-semibold tabular-nums">1</span>');
    expect(html).not.toContain('>Areas</span><span class="ml-2 font-semibold tabular-nums">6</span>');
  });
});
