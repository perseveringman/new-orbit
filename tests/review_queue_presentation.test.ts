import { describe, expect, it } from 'vitest';
import type { ProjectSummaryDTO } from '../src/shared/ipc';
import type { ReviewQueueItem } from '../src/renderer/src/store/reviewQueue';
import { getReviewQueueContextSummary } from '../src/renderer/src/views/reviewQueuePresentation';

const projects: ProjectSummaryDTO[] = [
  {
    uid: 'project-1',
    slug: 'orbit',
    name: 'Orbit',
    status: 'active',
    path: '/tmp/orbit',
    coordinationPath: '/tmp/orbit',
    workdirPath: '/tmp/orbit',
    readmePath: '/tmp/orbit/README.md',
    relPath: '01_Projects/orbit',
    legacy: false
  }
];

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'term-perm:sess-1',
    source: 'permission',
    title: 'Terminal permission request',
    detail: 'mcp__orbit__get_project_state',
    projectUid: 'project-1',
    paneId: 'pane-1',
    terminalTitle: 'Planning Terminal',
    createdAt: '2026-04-23T05:00:00Z',
    status: 'pending',
    ...overrides
  };
}

describe('review queue presentation', () => {
  it('formats project and terminal context for approval cards', () => {
    expect(getReviewQueueContextSummary(makeItem(), projects)).toBe('Orbit · Planning Terminal');
  });

  it('falls back to pane identity when no terminal title is available', () => {
    expect(
      getReviewQueueContextSummary(
        makeItem({ terminalTitle: undefined, paneId: 'pane-9' }),
        projects
      )
    ).toBe('Orbit · 面板 pane-9');
  });
});
