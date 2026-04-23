import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { createVault } from '../src/main/vault';
import { createProject, createTask } from '../src/main/project';
import { readTaskFile } from '../src/main/task';
import {
  bindTaskToGitHubIssue,
  getGitHubProjectDetails,
  unbindTaskFromGitHubIssue
} from '../src/main/github/service';

async function tmpVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-github-project-'));
  await createVault(dir);
  return dir;
}

describe('github project details', () => {
  let vault: string;

  beforeEach(async () => {
    vault = await tmpVault();
  });

  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('returns overview, issues, pull requests, checks, reviews, worktrees, and task bindings', async () => {
    const project = await createProject(vault, {
      slug: 'collab',
      template: 'blank',
      name: 'Collab'
    });
    const task = await createTask(vault, {
      project_uid: project.uid,
      title: 'Ship issue binding'
    });
    const git = simpleGit(project.projectPath);
    await git.checkoutLocalBranch('feature/issue-binding');
    await git.addRemote('origin', 'git@github.com:acme/collab.git');

    await bindTaskToGitHubIssue(vault, task.taskPath, {
      issueNumber: 42,
      issueTitle: 'Issue binding',
      issueUrl: 'https://github.com/acme/collab/issues/42'
    });

    const details = await getGitHubProjectDetails(vault, project.uid, {
      runGh: async (args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { stdout: 'github.com\n  ✓ Logged in to github.com account orbit-test', code: 0 };
        }
        if (args[0] === 'repo' && args[1] === 'view') {
          return {
            stdout: JSON.stringify({
              nameWithOwner: 'acme/collab',
              url: 'https://github.com/acme/collab',
              sshUrl: 'git@github.com:acme/collab.git',
              visibility: 'PRIVATE',
              defaultBranchRef: { name: 'main' }
            }),
            code: 0
          };
        }
        if (args[0] === 'issue' && args[1] === 'list') {
          return {
            stdout: JSON.stringify([
              {
                number: 42,
                title: 'Issue binding',
                url: 'https://github.com/acme/collab/issues/42',
                state: 'OPEN',
                labels: [{ name: 'orbit' }],
                assignees: [{ login: 'ryan' }]
              }
            ]),
            code: 0
          };
        }
        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            stdout: JSON.stringify([
              {
                number: 8,
                url: 'https://github.com/acme/collab/pull/8',
                title: 'Ship issue binding',
                state: 'OPEN',
                isDraft: true,
                baseRefName: 'main',
                headRefName: 'feature/issue-binding'
              }
            ]),
            code: 0
          };
        }
        if (args[0] === 'pr' && args[1] === 'checks') {
          return {
            stdout: JSON.stringify([
              {
                name: 'build',
                state: 'COMPLETED',
                conclusion: 'SUCCESS',
                link: 'https://github.com/acme/collab/actions/runs/1'
              }
            ]),
            code: 0
          };
        }
        if (args[0] === 'pr' && args[1] === 'view') {
          return {
            stdout: JSON.stringify({
              number: 8,
              url: 'https://github.com/acme/collab/pull/8',
              title: 'Ship issue binding',
              state: 'OPEN',
              isDraft: true,
              baseRefName: 'main',
              headRefName: 'feature/issue-binding',
              reviews: [{ author: { login: 'maintainer' }, state: 'APPROVED', submittedAt: '2026-04-23T06:05:00.000Z' }]
            }),
            code: 0
          };
        }
        throw new Error(`unexpected gh command: ${args.join(' ')}`);
      },
      listWorktrees: async () => [
        {
          id: 'wt-1',
          branch: 'feature/issue-binding',
          path: path.join(vault, '.orbit', 'worktrees', 'wt-1'),
          status: 'active',
          createdAt: '2026-04-23T06:00:00.000Z',
          taskId: task.uid
        }
      ]
    });

    expect(details.overview.binding).toMatchObject({
      fullName: 'acme/collab'
    });
    expect(details.issues[0]).toMatchObject({
      number: 42,
      labels: ['orbit']
    });
    expect(details.pullRequests[0]).toMatchObject({
      number: 8,
      state: 'draft'
    });
    expect(details.checks[0]).toMatchObject({
      name: 'build',
      conclusion: 'success'
    });
    expect(details.reviews[0]).toMatchObject({
      reviewer: 'maintainer',
      state: 'approved'
    });
    expect(details.worktrees[0]).toMatchObject({
      branch: 'feature/issue-binding',
      taskId: task.uid
    });
    expect(details.taskBindings[0]).toMatchObject({
      taskId: task.uid,
      issueNumber: 42
    });
  });

  it('binds and unbinds a task issue in task frontmatter', async () => {
    const project = await createProject(vault, {
      slug: 'bindings',
      template: 'blank',
      name: 'Bindings'
    });
    const task = await createTask(vault, {
      project_uid: project.uid,
      title: 'Link issue'
    });

    await bindTaskToGitHubIssue(vault, task.taskPath, {
      issueNumber: 17,
      issueTitle: 'Track link',
      issueUrl: 'https://github.com/acme/bindings/issues/17'
    });

    let view = await readTaskFile(task.taskPath);
    expect(view.frontmatter['github_issue_number']).toBe(17);
    expect(view.frontmatter['github_issue_url']).toBe('https://github.com/acme/bindings/issues/17');

    await unbindTaskFromGitHubIssue(vault, task.taskPath);

    view = await readTaskFile(task.taskPath);
    expect(view.frontmatter['github_issue_number']).toBeUndefined();
    expect(view.frontmatter['github_issue_url']).toBeUndefined();
  });
});
