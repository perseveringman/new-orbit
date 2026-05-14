import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { simpleGit } from 'simple-git';
import type {
  GitHubCheckSummary,
  GitHubConnection,
  GitHubIssueSummary,
  GitHubProjectDetails,
  GitHubProjectState,
  GitHubPullRequestSummary,
  GitHubRepoBinding,
  GitHubRepoVisibility,
  GitHubSyncStatus,
  GitHubTaskBinding,
  GitHubWorkspaceRepository,
  GitHubWorktreeSummary,
  GitHubReviewSummary
} from '@shared/github';
import {
  defaultExecutionContextConfig,
  linkExistingProject,
  listProjectTaskPaths,
  listProjects,
  projectDir
} from '../project';
import { probeProjectWorkdir, resolveProjectWorkdir } from '../project_workdir';
import { ensureProjectAgentContext } from '../project_agent_context';
import {
  defaultAgentExposureSettings,
  readProjectConfig,
  writeProjectConfig,
  type AgentExposureSettings
} from '../project_config';
import { PROJECT_README } from '@shared/constants';
import { newUid } from '../uid';
import { readTaskFile, updateTaskFrontmatter } from '../task';
import { WorktreeManager } from '../git/worktree';
import type { WorktreeRecord } from '@shared/git';
import { createExecutionContextForProject } from '../execution/factory';

interface GhResult {
  stdout: string;
  code: number;
}

interface PublishArgs {
  projectUid: string;
  owner: string;
  repo: string;
  visibility: GitHubRepoVisibility;
  defaultBranch?: string;
}

interface ImportArgs {
  owner: string;
  repo: string;
  slug?: string;
  name?: string;
  targetDir?: string;
  agent_exposure?: Partial<AgentExposureSettings>;
}

interface CreatePullRequestArgs {
  projectUid: string;
  title?: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
}

interface Deps {
  runGh?: (args: string[], cwd?: string) => Promise<GhResult>;
  cloneRepo?: (fullName: string, targetDir: string) => Promise<void>;
  now?: () => Date;
  listWorktrees?: (vault: string) => Promise<WorktreeRecord[]>;
}

interface ResolvedProjectPaths {
  coordinationPath: string;
  workdirPath: string;
}

interface RepoViewJson {
  nameWithOwner: string;
  url: string;
  sshUrl?: string | null;
  visibility?: string;
  defaultBranchRef?: { name?: string | null } | null;
}

interface PullRequestJson {
  number: number;
  url: string;
  title: string;
  state: string;
  isDraft?: boolean;
  baseRefName?: string;
  headRefName?: string;
  reviews?: Array<{
    author?: { login?: string | null } | null;
    state?: string | null;
    submittedAt?: string | null;
  }>;
}

interface RepoListJson {
  name: string;
  nameWithOwner: string;
  description?: string | null;
  visibility?: string;
  url: string;
  updatedAt?: string | null;
  defaultBranchRef?: { name?: string | null } | null;
}

interface IssueListJson {
  number: number;
  title: string;
  url: string;
  state: string;
  labels?: Array<{ name?: string | null }>;
  assignees?: Array<{ login?: string | null }>;
}

interface CheckRunJson {
  name: string;
  state?: string;
  status?: string;
  conclusion?: string | null;
  link?: string;
}

function nowIso(deps: Deps): string {
  return (deps.now ?? (() => new Date()))().toISOString();
}

async function defaultRunGh(args: string[], cwd?: string): Promise<GhResult> {
  return new Promise((resolve) => {
    let stdout = '';
    const child = nodeSpawn('gh', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => resolve({ stdout, code: 1 }));
    child.on('close', (code) => resolve({ stdout, code: code ?? 1 }));
  });
}

async function runGh(deps: Deps, args: string[], cwd?: string): Promise<GhResult> {
  return (deps.runGh ?? defaultRunGh)(args, cwd);
}

function parseGitHubRemote(remote: string): { owner: string; repo: string; cloneUrlHttps: string } | null {
  const ssh = remote.match(/^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/);
  if (ssh) {
    const owner = ssh[1]!;
    const repo = ssh[2]!;
    return {
      owner,
      repo,
      cloneUrlHttps: `https://github.com/${owner}/${repo}.git`
    };
  }
  const https = remote.match(/^https:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?$/);
  if (https) {
    const owner = https[1]!;
    const repo = https[2]!;
    return {
      owner,
      repo,
      cloneUrlHttps: `https://github.com/${owner}/${repo}.git`
    };
  }
  return null;
}

function parseAuthStatus(raw: string, available: boolean): GitHubConnection {
  if (!available) {
    return { available: false, authenticated: false, host: 'github.com' };
  }
  const viewer = raw.match(/account\s+([A-Za-z0-9-]+)/)?.[1];
  return {
    available: true,
    authenticated: /Logged in to github\.com/i.test(raw),
    host: 'github.com',
    ...(viewer ? { viewer } : {})
  };
}

function normalizeVisibility(value: string | undefined): GitHubRepoVisibility {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'private' || normalized === 'internal') return normalized;
  return 'public';
}

function normalizePrState(pr: PullRequestJson): GitHubPullRequestSummary['state'] {
  if (pr.isDraft) return 'draft';
  const state = pr.state.toLowerCase();
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

function normalizeIssueState(state?: string): GitHubIssueSummary['state'] {
  return (state ?? '').toLowerCase() === 'closed' ? 'closed' : 'open';
}

function normalizeCheckStatus(run: CheckRunJson): GitHubCheckSummary['status'] {
  const raw = (run.status ?? run.state ?? '').toLowerCase();
  if (raw === 'completed') return 'completed';
  if (raw === 'in_progress') return 'in_progress';
  return 'queued';
}

function normalizeCheckConclusion(value?: string | null): GitHubCheckSummary['conclusion'] {
  const raw = (value ?? '').toLowerCase();
  if (
    raw === 'success' ||
    raw === 'failure' ||
    raw === 'neutral' ||
    raw === 'cancelled' ||
    raw === 'skipped' ||
    raw === 'timed_out' ||
    raw === 'action_required'
  ) {
    return raw;
  }
  return null;
}

function normalizeReviewState(value?: string | null): GitHubReviewSummary['state'] {
  const raw = (value ?? '').toLowerCase();
  if (raw === 'approved') return 'approved';
  if (raw === 'changes_requested') return 'changes_requested';
  if (raw === 'commented') return 'commented';
  if (raw === 'dismissed') return 'dismissed';
  return 'pending';
}

async function resolveBindingFromRepository(
  owner: string,
  repo: string,
  deps: Deps,
  connectedAt: string,
  projectPath: string,
  remoteUrl?: string,
  existing?: GitHubRepoBinding
): Promise<GitHubRepoBinding> {
  const view = await runGh(
    deps,
    [
      'repo',
      'view',
      `${owner}/${repo}`,
      '--json',
      'nameWithOwner,url,sshUrl,visibility,defaultBranchRef'
    ],
    projectPath
  );
  if (view.code !== 0) {
    return existing ?? {
      provider: 'github',
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      cloneUrlHttps: `https://github.com/${owner}/${repo}.git`,
      cloneUrlSsh: remoteUrl ?? `git@github.com:${owner}/${repo}.git`,
      defaultBranch: 'main',
      visibility: 'public',
      connectedAt,
      lastFetchedAt: null
    };
  }
  const repoJson = JSON.parse(view.stdout) as RepoViewJson;
  return {
    provider: 'github',
    owner,
    repo,
    fullName: repoJson.nameWithOwner,
    url: repoJson.url,
    cloneUrlHttps: `https://github.com/${owner}/${repo}.git`,
    cloneUrlSsh: repoJson.sshUrl ?? remoteUrl ?? null,
    defaultBranch: repoJson.defaultBranchRef?.name ?? existing?.defaultBranch ?? 'main',
    visibility: normalizeVisibility(repoJson.visibility),
    connectedAt,
    lastFetchedAt: nowIso(deps)
  };
}

async function resolveRepoBinding(
  projectPath: string,
  deps: Deps,
  connectedAt: string,
  existing?: GitHubRepoBinding
): Promise<GitHubRepoBinding | null> {
  const git = simpleGit(projectPath);
  let remoteUrl = '';
  try {
    const remote = await git.remote(['get-url', 'origin']);
    remoteUrl = (typeof remote === 'string' ? remote : String(remote ?? '')).trim();
  } catch {
    remoteUrl = '';
  }
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed && !existing) return null;
  const owner = existing?.owner ?? parsed!.owner;
  const repo = existing?.repo ?? parsed!.repo;
  return resolveBindingFromRepository(owner, repo, deps, connectedAt, projectPath, remoteUrl, existing);
}

async function resolvePullRequest(projectPath: string, deps: Deps): Promise<GitHubPullRequestSummary | null> {
  const pr = await runGh(
    deps,
    ['pr', 'view', '--json', 'number,url,title,state,isDraft,baseRefName,headRefName'],
    projectPath
  );
  if (pr.code !== 0) return null;
  const json = JSON.parse(pr.stdout) as PullRequestJson;
  return {
    number: json.number,
    url: json.url,
    title: json.title,
    state: normalizePrState(json),
    baseBranch: json.baseRefName ?? 'main',
    headBranch: json.headRefName ?? ''
  };
}

async function resolveConnection(deps: Deps, cwd?: string): Promise<GitHubConnection> {
  const result = await runGh(deps, ['auth', 'status'], cwd);
  return parseAuthStatus(result.stdout, result.code === 0 || result.stdout.length > 0);
}

export async function getGitHubConnection(deps: Deps = {}, cwd?: string): Promise<GitHubConnection> {
  return resolveConnection(deps, cwd);
}

export async function authenticateGitHub(deps: Deps = {}): Promise<GitHubConnection> {
  const login = await runGh(deps, [
    'auth',
    'login',
    '--hostname',
    'github.com',
    '--web',
    '--git-protocol',
    'https'
  ]);
  if (login.code !== 0) {
    throw new Error(login.stdout.trim() || 'GitHub authentication failed');
  }
  return resolveConnection(deps);
}

export async function listGitHubRepositories(
  vault: string,
  args: { owner?: string; query?: string } = {},
  deps: Deps = {}
): Promise<GitHubWorkspaceRepository[]> {
  const connection = await resolveConnection(deps);
  if (!connection.authenticated) return [];

  const owner = args.owner ?? connection.viewer;
  const commandArgs = ['repo', 'list'];
  if (owner) commandArgs.push(owner);
  commandArgs.push('--json', 'name,nameWithOwner,description,visibility,url,updatedAt,defaultBranchRef', '--limit', '100');
  const result = await runGh(deps, commandArgs, vault);
  if (result.code !== 0) {
    throw new Error(`gh repo list failed: ${result.stdout.trim()}`);
  }

  const projects = await listProjects(vault);
  const byFullName = new Map(
    projects
      .filter((project) => project.github?.fullName)
      .map((project) => [project.github!.fullName.toLowerCase(), project] as const)
  );

  const query = args.query?.trim().toLowerCase();
  const repos = (JSON.parse(result.stdout) as RepoListJson[])
    .filter((repo) => !query || repo.nameWithOwner.toLowerCase().includes(query))
    .map((repo) => {
      const linked = byFullName.get(repo.nameWithOwner.toLowerCase());
      return {
        owner: repo.nameWithOwner.split('/')[0] ?? '',
        repo: repo.name,
        fullName: repo.nameWithOwner,
        description: repo.description ?? null,
        visibility: normalizeVisibility(repo.visibility),
        defaultBranch: repo.defaultBranchRef?.name ?? 'main',
        url: repo.url,
        updatedAt: repo.updatedAt ?? null,
        importStatus: linked ? 'imported' : 'not-imported',
        linkedProjectUid: linked?.uid ?? null,
        linkedProjectName: linked?.name ?? null,
        readiness: linked
          ? {
              hasOrbitConfig: true,
              hasAgentContext: true,
              hasGitBinding: !!linked.github
            }
          : undefined
      } satisfies GitHubWorkspaceRepository;
    });

  repos.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return repos;
}

async function fetchProjectIssues(projectPath: string, deps: Deps): Promise<GitHubIssueSummary[]> {
  const result = await runGh(
    deps,
    ['issue', 'list', '--json', 'number,title,url,state,labels,assignees', '--limit', '100'],
    projectPath
  );
  if (result.code !== 0) return [];
  return (JSON.parse(result.stdout) as IssueListJson[]).map((issue) => ({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: normalizeIssueState(issue.state),
    labels: (issue.labels ?? [])
      .map((label) => label.name ?? '')
      .filter((label): label is string => label.length > 0),
    assignees: (issue.assignees ?? [])
      .map((assignee) => assignee.login ?? '')
      .filter((login): login is string => login.length > 0)
  }));
}

async function fetchProjectPullRequests(projectPath: string, deps: Deps): Promise<GitHubPullRequestSummary[]> {
  const result = await runGh(
    deps,
    ['pr', 'list', '--json', 'number,url,title,state,isDraft,baseRefName,headRefName', '--limit', '100'],
    projectPath
  );
  if (result.code !== 0) return [];
  return (JSON.parse(result.stdout) as PullRequestJson[]).map((pr) => ({
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: normalizePrState(pr),
    baseBranch: pr.baseRefName ?? 'main',
    headBranch: pr.headRefName ?? ''
  }));
}

async function fetchProjectChecks(projectPath: string, deps: Deps): Promise<GitHubCheckSummary[]> {
  const result = await runGh(deps, ['pr', 'checks', '--json', 'name,state,status,conclusion,link'], projectPath);
  if (result.code !== 0) return [];
  return (JSON.parse(result.stdout) as CheckRunJson[]).map((run) => ({
    name: run.name,
    status: normalizeCheckStatus(run),
    conclusion: normalizeCheckConclusion(run.conclusion),
    url: run.link
  }));
}

async function fetchProjectReviews(projectPath: string, deps: Deps): Promise<GitHubReviewSummary[]> {
  const result = await runGh(
    deps,
    ['pr', 'view', '--json', 'number,url,title,state,isDraft,baseRefName,headRefName,reviews'],
    projectPath
  );
  if (result.code !== 0) return [];
  const pr = JSON.parse(result.stdout) as PullRequestJson;
  return (pr.reviews ?? []).map((review) => ({
    reviewer: review.author?.login ?? 'unknown',
    state: normalizeReviewState(review.state),
    submittedAt: review.submittedAt ?? null
  }));
}

async function listGitHubWorktrees(vault: string, deps: Deps): Promise<WorktreeRecord[]> {
  if (deps.listWorktrees) return deps.listWorktrees(vault);
  const records = await new WorktreeManager({ vault }).list();
  for (const project of await listProjects(vault)) {
    if (project.legacy) continue;
    const context = await createExecutionContextForProject(project.coordinationPath, {
      vaultPath: vault
    });
    records.push(...(await context.list()));
  }
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

async function readTaskBindings(projectPath: string): Promise<GitHubTaskBinding[]> {
  const taskPaths = await listProjectTaskPaths(projectPath);
  const bindings: GitHubTaskBinding[] = [];
  for (const taskPath of taskPaths) {
    const task = await readTaskFile(taskPath);
    const issueNumber = task.frontmatter['github_issue_number'];
    const issueTitle = task.frontmatter['github_issue_title'];
    const issueUrl = task.frontmatter['github_issue_url'];
    if (
      typeof issueNumber === 'number' &&
      typeof issueTitle === 'string' &&
      typeof issueUrl === 'string'
    ) {
      bindings.push({
        taskId: typeof task.frontmatter['uid'] === 'string' ? task.frontmatter['uid'] : path.basename(taskPath),
        taskTitle:
          typeof task.frontmatter['title'] === 'string'
            ? task.frontmatter['title']
            : path.basename(taskPath),
        issueNumber,
        issueTitle,
        issueUrl
      });
    }
  }
  return bindings;
}

export async function bindTaskToGitHubIssue(
  _vault: string,
  taskPath: string,
  args: { issueNumber: number; issueTitle?: string; issueUrl?: string }
): Promise<GitHubTaskBinding> {
  await updateTaskFrontmatter(taskPath, {
    github_issue_number: args.issueNumber,
    github_issue_title: args.issueTitle,
    github_issue_url: args.issueUrl
  });
  const task = await readTaskFile(taskPath);
  return {
    taskId: typeof task.frontmatter['uid'] === 'string' ? task.frontmatter['uid'] : path.basename(taskPath),
    taskTitle: typeof task.frontmatter['title'] === 'string' ? task.frontmatter['title'] : path.basename(taskPath),
    issueNumber: args.issueNumber,
    issueTitle: args.issueTitle ?? '',
    issueUrl: args.issueUrl ?? ''
  };
}

export async function unbindTaskFromGitHubIssue(_vault: string, taskPath: string): Promise<void> {
  await updateTaskFrontmatter(taskPath, {
    github_issue_number: undefined,
    github_issue_title: undefined,
    github_issue_url: undefined
  });
}

export async function getGitHubProjectDetails(
  vault: string,
  projectUid: string,
  deps: Deps = {}
): Promise<GitHubProjectDetails> {
  const paths =
    (await resolveProjectPaths(vault, projectUid)) ?? (() => {
      throw new Error(`project not found: ${projectUid}`);
    })();
  const overview = await getGitHubProjectState(vault, projectUid, deps);
  const [issues, pullRequests, checks, reviews, worktreeRecords, taskBindings] = await Promise.all([
    fetchProjectIssues(paths.workdirPath, deps),
    fetchProjectPullRequests(paths.workdirPath, deps),
    fetchProjectChecks(paths.workdirPath, deps),
    fetchProjectReviews(paths.workdirPath, deps),
    listGitHubWorktrees(vault, deps),
    readTaskBindings(paths.coordinationPath)
  ]);

  const worktrees: GitHubWorktreeSummary[] = worktreeRecords.map((worktree) => {
    const pr = pullRequests.find((candidate) => candidate.headBranch === worktree.branch);
    return {
      id: worktree.id,
      path: worktree.path,
      branch: worktree.branch,
      taskId: worktree.taskId ?? null,
      prNumber: pr?.number ?? null,
      prUrl: pr?.url ?? null,
      status:
        worktree.status === 'merged'
          ? 'merged'
          : worktree.status === 'aborted'
            ? 'blocked'
            : 'ready'
    };
  });

  return {
    overview,
    issues,
    pullRequests,
    checks,
    reviews,
    worktrees,
    taskBindings,
    lastSyncedAt: nowIso(deps)
  };
}

async function ensureProjectReadme(projectPath: string, name: string, template: string): Promise<void> {
  const readmePath = path.join(projectPath, PROJECT_README);
  try {
    await fs.access(readmePath);
  } catch {
    await fs.writeFile(
      readmePath,
      `---\nuid: ${newUid()}\ntype: project\ntitle: ${name}\nstatus: active\ntemplate: ${template}\n---\n\n# ${name}\n`,
      'utf8'
    );
  }
}

async function cloneRepoDefault(fullName: string, targetDir: string): Promise<void> {
  const parent = path.dirname(targetDir);
  await fs.mkdir(parent, { recursive: true });
  const result = await defaultRunGh(['repo', 'clone', fullName, targetDir], parent);
  if (result.code !== 0) {
    throw new Error(`gh repo clone failed: ${result.stdout.trim()}`);
  }
}

export async function getGitHubProjectState(
  vault: string,
  projectUid: string,
  deps: Deps = {}
): Promise<GitHubProjectState> {
  const paths =
    (await resolveProjectPaths(vault, projectUid)) ?? (() => {
      throw new Error(`project not found: ${projectUid}`);
    })();
  const config = await readProjectConfig(paths.coordinationPath);
  if (!config) throw new Error(`project config not found: ${projectUid}`);
  const connection = await resolveConnection(deps, paths.workdirPath);
  const binding = await resolveRepoBinding(
    paths.workdirPath,
    deps,
    config.github?.connectedAt ?? nowIso(deps),
    config.github
  );
  const git = simpleGit(paths.workdirPath);
  const status = binding ? await git.status().catch(() => null) : null;
  const sync: GitHubSyncStatus | null = binding
    ? {
        branch: status?.current ?? '',
        upstream: status?.tracking ?? null,
        ahead: status?.ahead ?? 0,
        behind: status?.behind ?? 0,
        hasUnpushedCommits: (status?.ahead ?? 0) > 0,
        hasRemoteUpdates: (status?.behind ?? 0) > 0
      }
    : null;
  const pullRequest = binding ? await resolvePullRequest(paths.workdirPath, deps) : null;
  if (binding && JSON.stringify(binding) !== JSON.stringify(config.github)) {
    await writeProjectConfig(paths.coordinationPath, {
      ...config,
      git: {
        ...(config.git ?? { is_repo: true }),
        is_repo: true,
        root_path: config.git?.root_path ?? paths.workdirPath,
        default_branch: binding.defaultBranch,
        remote_origin:
          config.git?.remote_origin ??
          binding.cloneUrlSsh ??
          binding.cloneUrlHttps,
        github_binding: binding
      },
      github: binding
    });
  }
  return {
    connection,
    binding,
    sync,
    pullRequest,
    canPublish: binding === null
  };
}

async function resolveProjectPaths(vault: string, projectUid: string): Promise<ResolvedProjectPaths | null> {
  const project = (await listProjects(vault)).find((item) => item.uid === projectUid);
  if (!project || project.legacy) return null;
  const config = await readProjectConfig(project.coordinationPath);
  return {
    coordinationPath: project.coordinationPath,
    workdirPath: resolveProjectWorkdir(project.coordinationPath, config)
  };
}

async function resolveProjectPath(vault: string, projectUid: string): Promise<string | null> {
  return (await resolveProjectPaths(vault, projectUid))?.workdirPath ?? null;
}

export async function publishProjectToGitHub(
  vault: string,
  args: PublishArgs,
  deps: Deps = {}
): Promise<GitHubProjectState> {
  const paths = await resolveProjectPaths(vault, args.projectUid);
  if (!paths) throw new Error(`project not found: ${args.projectUid}`);
  const config = await readProjectConfig(paths.coordinationPath);
  if (!config) throw new Error(`project config not found: ${args.projectUid}`);
  const git = simpleGit(paths.workdirPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
    await git.add('.');
    await git.commit(`orbit: init project ${path.basename(paths.workdirPath)}`).catch(() => undefined);
  }
  const create = await runGh(
    deps,
    [
      'repo',
      'create',
      `${args.owner}/${args.repo}`,
      '--source',
      '.',
      '--remote',
      'origin',
      '--push',
      `--${args.visibility}`
    ],
    paths.workdirPath
  );
  if (create.code !== 0) {
    throw new Error(`gh repo create failed: ${create.stdout.trim()}`);
  }
  const binding = await resolveBindingFromRepository(
    args.owner,
    args.repo,
    deps,
    config.github?.connectedAt ?? nowIso(deps),
    paths.workdirPath
  );
  await writeProjectConfig(paths.coordinationPath, {
    ...config,
    git: {
      ...(config.git ?? { is_repo: true }),
      is_repo: true,
      root_path: config.git?.root_path ?? paths.workdirPath,
      default_branch: binding.defaultBranch,
      remote_origin:
        config.git?.remote_origin ??
        binding.cloneUrlSsh ??
        binding.cloneUrlHttps,
      github_binding: binding
    },
    github: binding
  });
  return getGitHubProjectState(vault, args.projectUid, deps);
}

export async function createGitHubPullRequest(
  vault: string,
  args: CreatePullRequestArgs,
  deps: Deps = {}
): Promise<GitHubPullRequestSummary> {
  const projectPath = await resolveProjectPath(vault, args.projectUid);
  if (!projectPath) throw new Error(`project not found: ${args.projectUid}`);
  const commandArgs = ['pr', 'create'];
  if (args.title) {
    commandArgs.push('--title', args.title);
  } else {
    commandArgs.push('--fill');
  }
  if (args.body) commandArgs.push('--body', args.body);
  if (args.baseBranch) commandArgs.push('--base', args.baseBranch);
  if (args.draft) commandArgs.push('--draft');
  const create = await runGh(deps, commandArgs, projectPath);
  if (create.code !== 0) {
    throw new Error(`gh pr create failed: ${create.stdout.trim()}`);
  }
  const pr = await resolvePullRequest(projectPath, deps);
  if (!pr) throw new Error('pull request created but could not be resolved');
  return pr;
}

export async function importGitHubRepository(
  vault: string,
  args: ImportArgs,
  deps: Deps = {}
): Promise<{ projectPath: string; workdirPath: string; uid: string; slug: string; binding: GitHubRepoBinding | null }> {
  const slug = args.slug ?? args.repo.toLowerCase();
  const targetDir = args.targetDir ? path.resolve(args.targetDir) : projectDir(vault, slug);
  await fs.access(targetDir).then(
    () => Promise.reject(new Error(`project already exists: ${slug}`)),
    () => Promise.resolve()
  );
  await (deps.cloneRepo ?? cloneRepoDefault)(`${args.owner}/${args.repo}`, targetDir);
  const createdAt = nowIso(deps);
  const uid = newUid();
  if (args.targetDir) {
    const created = await linkExistingProject(vault, {
      slug,
      uid,
      name: args.name ?? args.repo,
      workdirPath: targetDir,
      execution_context: 'worktree',
      vendor_bridge_files: args.agent_exposure?.mode !== 'isolated'
    });
    const config = await readProjectConfig(created.projectPath);
    const probe = await probeProjectWorkdir(targetDir);
    const binding = await resolveRepoBinding(targetDir, deps, createdAt);
    if (config) {
      await writeProjectConfig(created.projectPath, {
        ...config,
        git: {
          ...(probe.git ?? config.git ?? { is_repo: true }),
          is_repo: true,
          root_path: probe.git?.root_path ?? targetDir,
          ...(binding
            ? {
                default_branch: binding.defaultBranch,
                remote_origin:
                  probe.git?.remote_origin ??
                  binding.cloneUrlSsh ??
                  binding.cloneUrlHttps,
                github_binding: binding
              }
            : {})
        },
        github: binding ?? undefined
      });
    }
    return {
      projectPath: created.projectPath,
      workdirPath: targetDir,
      uid,
      slug,
      binding
    };
  }
  const projectPath = targetDir;
  const config = {
    uid,
    slug,
    name: args.name ?? args.repo,
    type: 'project' as const,
    template: 'imported-github',
    workdir: {
      path: projectPath,
      kind: 'local' as const,
      linked_at: createdAt,
      linked_via: 'legacy-in-vault' as const,
      permissions: {
        agent_write: true,
        auto_runner: true
      }
    },
    execution_context: defaultExecutionContextConfig('worktree'),
    created_at: createdAt,
    vision_linked: true,
    setup: [],
    teardown: [],
    vendor_bridge_files: args.agent_exposure?.mode !== 'isolated',
    watcher: {
      enabled: true,
      extra_ignores: []
    },
    agent_exposure: {
      ...defaultAgentExposureSettings(args.agent_exposure?.mode),
      ...(args.agent_exposure ?? {})
    }
  };
  await ensureProjectReadme(projectPath, args.name ?? args.repo, 'imported-github');
  await writeProjectConfig(projectPath, config);
  await ensureProjectAgentContext(projectPath, {
    uid,
    slug,
    name: args.name ?? args.repo,
    template: 'imported-github'
  }, { workdirPath: projectPath });
  const state = await getGitHubProjectState(vault, uid, deps);
  return {
    projectPath,
    workdirPath: projectPath,
    uid,
    slug,
    binding: state.binding
  };
}
