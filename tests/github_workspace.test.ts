import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';
import {
  authenticateGitHub,
  listGitHubRepositories
} from '../src/main/github/service';

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-github-workspace-'));
  await createVault(dir);
  return dir;
}

describe('github workspace repositories', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await tmpVault();
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('lists accessible repositories and marks imported Orbit projects', async () => {
    const imported = await createProject(vault, {
      slug: 'orbit-app',
      template: 'blank',
      name: 'Orbit App'
    });

    await fs.writeFile(
      path.join(imported.projectPath, '.orbit', 'config.json'),
      JSON.stringify(
          {
            uid: imported.uid,
            slug: imported.slug,
            name: 'Orbit App',
            template: 'blank',
            created_at: new Date().toISOString(),
            agent_exposure: { mode: 'isolated' },
          github: {
            provider: 'github',
            owner: 'acme',
            repo: 'orbit-app',
            fullName: 'acme/orbit-app',
            url: 'https://github.com/acme/orbit-app',
            cloneUrlHttps: 'https://github.com/acme/orbit-app.git',
            cloneUrlSsh: 'git@github.com:acme/orbit-app.git',
            defaultBranch: 'main',
            visibility: 'private',
            connectedAt: new Date().toISOString(),
            lastFetchedAt: null
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const repos = await listGitHubRepositories(vault, {}, {
      runGh: async (args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
        }
        if (args[0] === 'repo' && args[1] === 'list') {
          return {
            stdout: JSON.stringify([
              {
                name: 'orbit-app',
                nameWithOwner: 'acme/orbit-app',
                description: 'Main app',
                visibility: 'PRIVATE',
                url: 'https://github.com/acme/orbit-app',
                updatedAt: '2026-04-23T06:00:00.000Z',
                defaultBranchRef: { name: 'main' }
              },
              {
                name: 'design-system',
                nameWithOwner: 'acme/design-system',
                description: 'UI kit',
                visibility: 'PUBLIC',
                url: 'https://github.com/acme/design-system',
                updatedAt: '2026-04-22T06:00:00.000Z',
                defaultBranchRef: { name: 'main' }
              }
            ]),
            code: 0
          };
        }
        throw new Error(`unexpected gh command: ${args.join(' ')}`);
      }
    });

    expect(repos).toHaveLength(2);
    expect(repos[0]).toMatchObject({
      fullName: 'acme/orbit-app',
      importStatus: 'imported',
      linkedProjectUid: imported.uid,
      linkedProjectName: 'Orbit App'
    });
    expect(repos[1]).toMatchObject({
      fullName: 'acme/design-system',
      importStatus: 'not-imported'
    });
  });

  it('starts gh web authentication and returns the refreshed connection state', async () => {
    const steps: string[] = [];

    const connection = await authenticateGitHub({
      runGh: async (args) => {
        steps.push(args.join(' '));
        if (args[0] === 'auth' && args[1] === 'login') {
          return { stdout: 'Open this URL to continue login.', code: 0 };
        }
        if (args[0] === 'auth' && args[1] === 'status') {
          return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
        }
        throw new Error(`unexpected gh command: ${args.join(' ')}`);
      }
    });

    expect(steps).toEqual([
      'auth login --hostname github.com --web --git-protocol https',
      'auth status'
    ]);
    expect(connection).toMatchObject({
      available: true,
      authenticated: true,
      viewer: 'orbit-test'
    });
  });
});
