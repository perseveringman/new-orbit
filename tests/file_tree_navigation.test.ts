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

  it('opens non-markdown project files (e.g. TypeScript) in the editor', () => {
    expect(
      resolveFileTreeActivation(
        { isDir: false, relPath: '01_Projects/twitter/src/index.ts' },
        projects
      )
    ).toEqual({
      kind: 'editor',
      projectUid: 'proj-1'
    });
  });

  it('treats files outside 01_Projects as editor items with no project uid', () => {
    expect(
      resolveFileTreeActivation(
        { isDir: false, relPath: 'Notes/idea.md' },
        projects
      )
    ).toEqual({
      kind: 'editor',
      projectUid: null
    });
  });

  it('toggles a plain directory outside project scope', () => {
    expect(
      resolveFileTreeActivation(
        { isDir: true, relPath: 'Notes' },
        projects
      )
    ).toEqual({ kind: 'toggle-dir' });
  });

  it('does not treat legacy projects as project-room destinations', () => {
    // legacy projects should not get the project-room treatment
    expect(
      resolveFileTreeActivation(
        { isDir: true, relPath: '01_Projects/old-app' },
        projects
      )
    ).toEqual({ kind: 'toggle-dir' });
  });
});
