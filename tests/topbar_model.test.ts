import { describe, expect, it } from 'vitest';
import { deriveTopBarContext, WORKSPACE_DESTINATIONS } from '../src/renderer/src/components/topbarModel';

describe('top bar model', () => {
  it('keeps workspace destinations in the sidebar navigation model', () => {
    expect(WORKSPACE_DESTINATIONS.map((item) => item.label)).toEqual([
      'Dashboard',
      'Inbox',
      'Today',
      'Journals',
      'Kanban',
      'Area Overview'
    ]);
  });

  it('describes the dashboard as workspace context', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'dashboard' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Workspace',
      title: 'Dashboard',
      detail: 'Orbit Vault · Vision, PARA health, and project activity.',
      stateLabel: null
    });
  });

  it('uses the active project for project-room context', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'project', projectUid: 'p-1' },
        projects: [
          {
            uid: 'p-1',
            name: 'Moonshot',
            description: 'Launch the next release train',
            relPath: '01_Projects/Moonshot'
          }
        ],
        activeProjectUid: 'p-1',
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Project room',
      title: 'Moonshot',
      detail: 'Launch the next release train',
      stateLabel: 'Active project'
    });
  });

  it('surfaces the open file and dirty state inside the editor', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'editor' },
        projects: [],
        activeProjectUid: null,
        activeFile: {
          relPath: '01_Projects/Moonshot/README.md',
          dirty: true
        },
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Editor',
      title: 'README.md',
      detail: '01_Projects/Moonshot/README.md',
      stateLabel: 'Unsaved changes'
    });
  });
});
