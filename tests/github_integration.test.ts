import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { createVault } from '../src/main/vault';
import { createProject, listProjects, readProjectConfig } from '../src/main/project';
import {
  createGitHubPullRequest,
  getGitHubProjectState,
  importGitHubRepository,
  publishProjectToGitHub
} from '../src/main/github/service';

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-github-integration-'));
  await createVault(dir);
  return dir;
}

describe('github integration core', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await tmpVault();
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('publishes an existing project to GitHub and persists the repo binding', async () => {
    const created = await createProject(vault, {
      slug: 'publish-me',
      template: 'blank',
      name: 'Publish Me'
    });
    const ghCalls: string[][] = [];

    const result = await publishProjectToGitHub(
      vault,
      {
        projectUid: created.uid,
        owner: 'acme',
        repo: 'publish-me',
        visibility: 'private'
      },
      {
        runGh: async (args) => {
          ghCalls.push(args);
          if (args[0] === 'repo' && args[1] === 'create') {
            return { stdout: '', code: 0 };
          }
          if (args[0] === 'repo' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                nameWithOwner: 'acme/publish-me',
                url: 'https://github.com/acme/publish-me',
                sshUrl: 'git@github.com:acme/publish-me.git',
                visibility: 'PRIVATE',
                defaultBranchRef: { name: 'main' }
              }),
              code: 0
            };
          }
          if (args[0] === 'pr' && args[1] === 'view') {
            return { stdout: 'no pull requests found for branch "main"', code: 1 };
          }
          if (args[0] === 'auth' && args[1] === 'status') {
            return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
          }
          throw new Error(`unexpected gh command: ${args.join(' ')}`);
        }
      }
    );

    expect(ghCalls.some((args) => args[0] === 'repo' && args[1] === 'create')).toBe(true);
    expect(result.binding).toMatchObject({
      fullName: 'acme/publish-me',
      visibility: 'private',
      defaultBranch: 'main'
    });
    const config = await readProjectConfig(created.projectPath);
    expect(config?.github).toMatchObject({
      fullName: 'acme/publish-me',
      visibility: 'private'
    });
  });

  it('imports a GitHub repository into 01_Projects and seeds Orbit metadata without overwriting the repo', async () => {
    const imported = await importGitHubRepository(
      vault,
      {
        owner: 'acme',
        repo: 'space-kit'
      },
      {
        cloneRepo: async (_fullName, targetDir) => {
          await fs.mkdir(path.join(targetDir, '.git'), { recursive: true });
          await fs.writeFile(path.join(targetDir, 'README.md'), '# Space Kit\n\nImported repo.\n', 'utf8');
          await fs.writeFile(path.join(targetDir, 'package.json'), '{"name":"space-kit"}\n', 'utf8');
          const git = simpleGit(targetDir);
          await git.init();
          await git.add('.');
          await git.commit('init');
          await git.addRemote('origin', 'git@github.com:acme/space-kit.git');
        },
        runGh: async (args) => {
          if (args[0] === 'repo' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                nameWithOwner: 'acme/space-kit',
                url: 'https://github.com/acme/space-kit',
                sshUrl: 'git@github.com:acme/space-kit.git',
                visibility: 'PUBLIC',
                defaultBranchRef: { name: 'main' }
              }),
              code: 0
            };
          }
          if (args[0] === 'pr' && args[1] === 'view') {
            return { stdout: 'no pull requests found for branch "main"', code: 1 };
          }
          if (args[0] === 'auth' && args[1] === 'status') {
            return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
          }
          throw new Error(`unexpected gh command: ${args.join(' ')}`);
        }
      }
    );

    expect(imported.projectPath).toContain(path.join('01_Projects', 'space-kit'));
    const config = await readProjectConfig(imported.projectPath);
    expect(config).toMatchObject({
      slug: 'space-kit',
      template: 'imported-github',
      github: {
        fullName: 'acme/space-kit'
      }
    });
    const readme = await fs.readFile(path.join(imported.projectPath, 'README.md'), 'utf8');
    expect(readme).toContain('# Space Kit');
    await expect(
      fs.readFile(path.join(imported.projectPath, '.orbit', 'config.json'), 'utf8')
    ).resolves.toContain('"template": "imported-github"');
  });

  it('imports a GitHub repository into an external workdir with vault coordination metadata', async () => {
    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-github-external-'));
    try {
      const targetDir = path.join(externalRoot, 'external-kit');
      const ghCwds: Array<string | undefined> = [];
      const imported = await importGitHubRepository(
        vault,
        {
          owner: 'acme',
          repo: 'external-kit',
          targetDir
        },
        {
          cloneRepo: async (_fullName, cloneTargetDir) => {
            await fs.mkdir(cloneTargetDir, { recursive: true });
            await fs.writeFile(
              path.join(cloneTargetDir, 'README.md'),
              '# External Kit\n\nImported repo.\n',
              'utf8'
            );
            await fs.writeFile(
              path.join(cloneTargetDir, 'package.json'),
              '{"name":"external-kit"}\n',
              'utf8'
            );
            const git = simpleGit(cloneTargetDir);
            await git.init();
            await git.addConfig('user.name', 'Orbit', false, 'local').catch(() => undefined);
            await git
              .addConfig('user.email', 'orbit@localhost', false, 'local')
              .catch(() => undefined);
            await git.add('.');
            await git.commit('init');
            await git.addRemote('origin', 'git@github.com:acme/external-kit.git');
          },
          runGh: async (args, cwd) => {
            ghCwds.push(cwd);
            if (args[0] === 'repo' && args[1] === 'view') {
              return {
                stdout: JSON.stringify({
                  nameWithOwner: 'acme/external-kit',
                  url: 'https://github.com/acme/external-kit',
                  sshUrl: 'git@github.com:acme/external-kit.git',
                  visibility: 'PUBLIC',
                  defaultBranchRef: { name: 'main' }
                }),
                code: 0
              };
            }
            throw new Error(`unexpected gh command: ${args.join(' ')}`);
          }
        }
      );

      expect(imported.projectPath).toBe(path.join(vault, '01_Projects', 'external-kit'));
      expect(imported.workdirPath).toBe(targetDir);
      expect(ghCwds.filter(Boolean)).toEqual([targetDir]);

      const config = await readProjectConfig(imported.projectPath);
      expect(config?.workdir).toMatchObject({
        path: targetDir,
        linked_via: 'link-existing'
      });
      expect(config?.github).toMatchObject({
        fullName: 'acme/external-kit'
      });
      const coordinationReadme = await fs.readFile(
        path.join(imported.projectPath, 'README.md'),
        'utf8'
      );
      expect(coordinationReadme).toContain(`- Path: \`${targetDir}\``);
      await expect(fs.readFile(path.join(targetDir, 'README.md'), 'utf8')).resolves.toContain(
        '# External Kit'
      );
    } finally {
      await fs.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it('keeps the Orbit uid authoritative when an imported repo already has README frontmatter', async () => {
    const ghDeps = {
      cloneRepo: async (_fullName: string, targetDir: string) => {
        await fs.mkdir(path.join(targetDir, '.git'), { recursive: true });
        await fs.writeFile(
          path.join(targetDir, 'README.md'),
          [
            '---',
            'uid: legacy-readme-uid',
            'title: Foreign README',
            'status: active',
            '---',
            '',
            '# Space Kit',
            '',
            'Imported repo.'
          ].join('\n'),
          'utf8'
        );
        const git = simpleGit(targetDir);
        await git.init();
        await git.add('.');
        await git.commit('init');
        await git.addRemote('origin', 'git@github.com:acme/space-kit.git');
      },
      runGh: async (args: string[]) => {
        if (args[0] === 'repo' && args[1] === 'view') {
          return {
            stdout: JSON.stringify({
              nameWithOwner: 'acme/space-kit',
              url: 'https://github.com/acme/space-kit',
              sshUrl: 'git@github.com:acme/space-kit.git',
              visibility: 'PUBLIC',
              defaultBranchRef: { name: 'main' }
            }),
            code: 0
          };
        }
        if (args[0] === 'pr' && args[1] === 'view') {
          return { stdout: 'no pull requests found for branch "main"', code: 1 };
        }
        if (args[0] === 'auth' && args[1] === 'status') {
          return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
        }
        throw new Error(`unexpected gh command: ${args.join(' ')}`);
      }
    };

    const imported = await importGitHubRepository(
      vault,
      {
        owner: 'acme',
        repo: 'space-kit'
      },
      ghDeps
    );

    const [project] = await listProjects(vault);
    expect(project?.uid).toBe(imported.uid);

    await expect(getGitHubProjectState(vault, project!.uid, ghDeps)).resolves.toMatchObject({
      binding: {
        fullName: 'acme/space-kit'
      }
    });
  });

  it('summarizes binding, sync state and current branch PR for a linked project', async () => {
    const created = await createProject(vault, {
      slug: 'status-demo',
      template: 'blank',
      name: 'Status Demo'
    });
    const git = simpleGit(created.projectPath);
    await git.checkoutLocalBranch('feature/github-strip');
    await git.addRemote('origin', 'git@github.com:acme/status-demo.git');

    const state = await getGitHubProjectState(vault, created.uid, {
      runGh: async (args, cwd) => {
        expect(cwd).toBe(created.projectPath);
        if (args[0] === 'repo' && args[1] === 'view') {
          return {
            stdout: JSON.stringify({
              nameWithOwner: 'acme/status-demo',
              url: 'https://github.com/acme/status-demo',
              sshUrl: 'git@github.com:acme/status-demo.git',
              visibility: 'PUBLIC',
              defaultBranchRef: { name: 'main' }
            }),
            code: 0
          };
        }
        if (args[0] === 'pr' && args[1] === 'view') {
          return {
            stdout: JSON.stringify({
              number: 42,
              url: 'https://github.com/acme/status-demo/pull/42',
              title: 'Add GitHub strip',
              state: 'OPEN',
              isDraft: true,
              baseRefName: 'main',
              headRefName: 'feature/github-strip'
            }),
            code: 0
          };
        }
        if (args[0] === 'auth' && args[1] === 'status') {
          return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
        }
        throw new Error(`unexpected gh command: ${args.join(' ')}`);
      }
    });

    expect(state.binding).toMatchObject({
      fullName: 'acme/status-demo'
    });
    expect(state.sync).toMatchObject({
      branch: 'feature/github-strip'
    });
    expect(state.pullRequest).toMatchObject({
      number: 42,
      state: 'draft'
    });
  });

  it('creates a pull request for the active branch and returns the linked PR summary', async () => {
    const created = await createProject(vault, {
      slug: 'pr-demo',
      template: 'blank',
      name: 'PR Demo'
    });
    const git = simpleGit(created.projectPath);
    await git.checkoutLocalBranch('feature/pr-demo');
    await git.addRemote('origin', 'git@github.com:acme/pr-demo.git');

    const pr = await createGitHubPullRequest(
      vault,
      {
        projectUid: created.uid,
        title: 'Add PR action',
        body: 'Wire GitHub PR creation into Orbit.',
        draft: true
      },
      {
        runGh: async (args) => {
          if (args[0] === 'pr' && args[1] === 'create') {
            return { stdout: 'created', code: 0 };
          }
          if (args[0] === 'pr' && args[1] === 'view') {
            return {
              stdout: JSON.stringify({
                number: 88,
                url: 'https://github.com/acme/pr-demo/pull/88',
                title: 'Add PR action',
                state: 'OPEN',
                isDraft: true,
                baseRefName: 'main',
                headRefName: 'feature/pr-demo'
              }),
              code: 0
            };
          }
          throw new Error(`unexpected gh command: ${args.join(' ')}`);
        }
      }
    );

    expect(pr).toMatchObject({
      number: 88,
      state: 'draft',
      headBranch: 'feature/pr-demo'
    });
  });
});
