import { describe, expect, it } from 'vitest';
import { resolveFileTreeActivation } from '../src/renderer/src/components/Sidebar/fileTreeNavigation';

describe('file tree project navigation', () => {
  const projects = [
    { uid: 'proj-1', slug: 'twitter', legacy: false },
    { uid: 'legacy-1', slug: 'old-app', legacy: true }
  ];

  it('opens a project root folder in the project room', () => {
    expect(
      resolveFileTreeActivation(
        { isDir: true, relPath: '01_Projects/twitter' },
        projects
      )
    ).toEqual({
      kind: 'project-room',
      projectUid: 'proj-1'
    });
  });

  it('opens project files in the editor instead of forcing the kanban room', () => {
    expect(
      resolveFileTreeActivation(
        { isDir: false, relPath: '01_Projects/twitter/README.md' },
        projects
      )
    ).toEqual({
      kind: 'editor',
      projectUid: 'proj-1'
    });
  });
});
