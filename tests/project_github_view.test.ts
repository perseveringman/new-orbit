import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../src/shared/schemas';
import type { GitHubProjectDetails } from '../src/shared/github';
import { ProjectGitHubSurface } from '../src/renderer/src/views/ProjectGitHubView';

const noop = vi.fn();

const tasks: TaskRecord[] = [
  {
    id: 'file:01_Projects/orbit-app/.agent/tasks/task-1.md',
    source: 'file',
    status: 'todo',
    title: 'Setup auth',
    filePath: '/vault/01_Projects/orbit-app/.agent/tasks/task-1.md',
    relPath: '01_Projects/orbit-app/.agent/tasks/task-1.md',
    uid: 'task-1',
    project_uid: 'project-1'
  },
  {
    id: 'file:01_Projects/orbit-app/.agent/tasks/task-2.md',
    source: 'file',
    status: 'backlog',
    title: 'Polish GitHub UI',
    filePath: '/vault/01_Projects/orbit-app/.agent/tasks/task-2.md',
    relPath: '01_Projects/orbit-app/.agent/tasks/task-2.md',
    uid: 'task-2',
    project_uid: 'project-1'
  }
];

const details: GitHubProjectDetails = {
  overview: {
    connection: {
      available: true,
      authenticated: true,
      host: 'github.com',
      viewer: 'orbit-test'
    },
    binding: {
      provider: 'github',
      owner: 'acme',
      repo: 'orbit-app',
      fullName: 'acme/orbit-app',
      url: 'https://github.com/acme/orbit-app',
      cloneUrlHttps: 'https://github.com/acme/orbit-app.git',
      cloneUrlSsh: 'git@github.com:acme/orbit-app.git',
      defaultBranch: 'main',
      visibility: 'private',
      connectedAt: '2026-04-23T06:00:00.000Z'
    },
    sync: {
      branch: 'feature/github-redesign',
      upstream: 'origin/feature/github-redesign',
      ahead: 2,
      behind: 0,
      hasUnpushedCommits: true,
      hasRemoteUpdates: false
    },
    pullRequest: {
      number: 42,
      url: 'https://github.com/acme/orbit-app/pull/42',
      title: 'Add GitHub workspace and project views',
      state: 'draft',
      baseBranch: 'main',
      headBranch: 'feature/github-redesign'
    },
    canPublish: false
  },
  issues: [
    {
      number: 12,
      title: 'Setup auth',
      url: 'https://github.com/acme/orbit-app/issues/12',
      state: 'open',
      labels: ['backend'],
      assignees: ['ryan']
    },
    {
      number: 18,
      title: 'Polish GitHub UI',
      url: 'https://github.com/acme/orbit-app/issues/18',
      state: 'open',
      labels: ['frontend'],
      assignees: []
    }
  ],
  pullRequests: [
    {
      number: 42,
      url: 'https://github.com/acme/orbit-app/pull/42',
      title: 'Add GitHub workspace and project views',
      state: 'draft',
      baseBranch: 'main',
      headBranch: 'feature/github-redesign'
    }
  ],
  checks: [
    {
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/acme/orbit-app/actions/runs/1'
    }
  ],
  reviews: [
    {
      reviewer: 'teammate',
      state: 'approved',
      submittedAt: '2026-04-23T07:00:00.000Z'
    }
  ],
  worktrees: [
    {
      id: 'wt-1',
      path: '/vault/.orbit/worktrees/feature-github-redesign',
      branch: 'feature/github-redesign',
      taskId: 'file:01_Projects/orbit-app/.agent/tasks/task-1.md',
      prNumber: 42,
      prUrl: 'https://github.com/acme/orbit-app/pull/42',
      status: 'ready'
    }
  ],
  taskBindings: [
    {
      taskId: 'file:01_Projects/orbit-app/.agent/tasks/task-1.md',
      taskTitle: 'Setup auth',
      issueNumber: 12,
      issueTitle: 'Setup auth',
      issueUrl: 'https://github.com/acme/orbit-app/issues/12'
    }
  ],
  lastSyncedAt: '2026-04-23T07:30:00.000Z'
};

describe('ProjectGitHubSurface', () => {
  it('renders the overview with repository state and delivery journeys', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details,
        activeTab: 'overview',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );

    expect(html).toContain('acme/orbit-app');
    expect(html).toContain('feature/github-redesign');
    expect(html).toContain('终端流程');
    expect(html).toContain('Auto-runner 流程');
    expect(html).toContain('PRs 1');
  });

  it('renders inline publish form fields instead of relying on prompts when the project is not linked', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details: {
          ...details,
          overview: {
            ...details.overview,
            binding: null,
            sync: null,
            pullRequest: null,
            canPublish: true
          }
        },
        activeTab: 'overview',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );

    expect(html).toContain('Owner / 组织');
    expect(html).toContain('仓库名称');
    expect(html).toContain('发布');
  });

  it('renders inline pull request form fields when the repository is already linked', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details: {
          ...details,
          overview: {
            ...details.overview,
            pullRequest: null
          }
        },
        activeTab: 'overview',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );

    expect(html).toContain('PR 标题');
    expect(html).toContain('创建 pull request');
  });

  it('renders issue binding controls and existing task links', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details,
        activeTab: 'issues',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );

    expect(html).toContain('Setup auth');
    expect(html).toContain('已关联任务');
    expect(html).toContain('绑定到任务');
    expect(html).toContain('Polish GitHub UI');
  });

  it('renders pull request, checks, reviews, and worktrees on their tabs', () => {
    const prsHtml = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details,
        activeTab: 'prs',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );
    const worktreesHtml = renderToStaticMarkup(
      createElement(ProjectGitHubSurface, {
        projectName: 'Orbit App',
        projectUid: 'project-1',
        projectSlug: 'orbit-app',
        tasks,
        details,
        activeTab: 'worktrees',
        onSelectTab: noop,
        onRefresh: noop,
        onPublish: noop,
        onCreatePullRequest: noop,
        onOpenTerminal: noop,
        onOpenPullRequest: noop,
        onOpenIssue: noop,
        onBindIssue: noop,
        onUnbindTask: noop
      })
    );

    expect(prsHtml).toContain('PR #42');
    expect(prsHtml).toContain('CI');
    expect(prsHtml).toContain('approved');
    expect(worktreesHtml).toContain('feature/github-redesign');
    expect(worktreesHtml).toContain('打开 PR');
  });
});
