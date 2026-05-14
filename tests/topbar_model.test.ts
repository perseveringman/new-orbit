import { describe, expect, it } from 'vitest';
import {
  deriveTopBarContext,
  WORKSPACE_DESTINATIONS
} from '../src/renderer/src/components/topbarModel';

describe('top bar model', () => {
  it('keeps workspace destinations in the sidebar navigation model', () => {
    expect(WORKSPACE_DESTINATIONS.map((item) => item.label)).toEqual([
      'Dashboard',
      'Ask Anywhere',
      'Vision',
      'Runtimes',
      'Tools',
      'Agents',
      'Console',
      'GitHub',
      'Inbox',
      'Notes',
      'Library',
      'Search',
      'Memory',
      'Review',
      'Feeds',
      'Resources',
      'Knowledge',
      'Timeline',
      'Scheduled',
      'Gateway',
      'Journals',
      'Kanban'
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

  it('describes Ask Anywhere as a first-class workspace surface', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'askAnywhere' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Workspace',
      title: 'Ask Anywhere',
      detail: 'Orbit Vault · Persistent AI conversations across your vault context.',
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

  it('describes the workspace github control plane', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'github' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Workspace',
      title: 'GitHub',
      detail: 'Orbit Vault · Connect accounts, import repos, and monitor GitHub delivery state.',
      stateLabel: null
    });
  });

  it('describes the workspace runtime control plane', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'runtimes' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: 'Workspace',
      title: 'Runtimes',
      detail:
        'Orbit Vault · Observe local providers, runtime capabilities, and orchestration load.',
      stateLabel: null
    });
  });
});
