import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubConnection, GitHubWorkspaceRepository } from '../src/shared/github';
import { WORKSPACE_DESTINATIONS } from '../src/renderer/src/components/topbarModel';
import { GitHubWorkspaceSurface } from '../src/renderer/src/views/GitHubWorkspaceView';

const noop = vi.fn();

describe('GitHubWorkspaceSurface', () => {
  it('adds GitHub to the workspace destinations', () => {
    expect(WORKSPACE_DESTINATIONS.map((item) => item.label)).toContain('GitHub');
  });

  it('renders the account header, repository explorer, and import actions', () => {
    const connection: GitHubConnection = {
      available: true,
      authenticated: true,
      host: 'github.com',
      viewer: 'orbit-test'
    };
    const repositories: GitHubWorkspaceRepository[] = [
      {
        owner: 'acme',
        repo: 'orbit-app',
        fullName: 'acme/orbit-app',
        description: 'Main app',
        visibility: 'private',
        defaultBranch: 'main',
        url: 'https://github.com/acme/orbit-app',
        updatedAt: '2026-04-23T06:00:00.000Z',
        importStatus: 'imported',
        linkedProjectUid: 'project-1',
        linkedProjectName: 'Orbit App',
        readiness: {
          hasOrbitConfig: true,
          hasAgentContext: true,
          hasGitBinding: true
        }
      },
      {
        owner: 'acme',
        repo: 'design-system',
        fullName: 'acme/design-system',
        description: 'UI kit',
        visibility: 'public',
        defaultBranch: 'main',
        url: 'https://github.com/acme/design-system',
        updatedAt: '2026-04-22T06:00:00.000Z',
        importStatus: 'not-imported',
        readiness: {
          hasOrbitConfig: false,
          hasAgentContext: false,
          hasGitBinding: false
        }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(GitHubWorkspaceSurface, {
        connection,
        repositories,
        loading: false,
        selectedOwner: 'acme',
        searchQuery: '',
        importingFullName: null,
        onRefresh: noop,
        onAuthenticate: noop,
        onSelectOwner: noop,
        onSearchQueryChange: noop,
        onImportRepository: noop,
        onOpenProject: noop
      })
    );

    expect(html).toContain('GitHub control plane');
    expect(html).toContain('orbit-test');
    expect(html).toContain('acme/orbit-app');
    expect(html).toContain('Orbit-ready');
    expect(html).toContain('Open Project');
    expect(html).toContain('Import');
    expect(html).toContain('acme/design-system');
  });
});
