import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { simpleGit } from 'simple-git';
import type {
  GitHubConnection,
  GitHubProjectState,
  GitHubPullRequestSummary,
  GitHubRepoBinding,
  GitHubRepoVisibility,
  GitHubSyncStatus
} from '@shared/github';
import { projectDir } from '../project';
import { ensureProjectAgentContext } from '../project_agent_context';
import {
  defaultAgentExposureSettings,
  readProjectConfig,
  writeProjectConfig,
  type AgentExposureSettings
} from '../project_config';
import { PROJECT_README } from '@shared/constants';
import { newUid } from '../uid';

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
  const projectPath =
    (await resolveProjectPath(vault, projectUid)) ?? (() => {
      throw new Error(`project not found: ${projectUid}`);
    })();
  const config = await readProjectConfig(projectPath);
  if (!config) throw new Error(`project config not found: ${projectUid}`);
  const connection = await resolveConnection(deps, projectPath);
  const binding = await resolveRepoBinding(
    projectPath,
    deps,
    config.github?.connectedAt ?? nowIso(deps),
    config.github
  );
  const git = simpleGit(projectPath);
  const status = await git.status();
  const sync: GitHubSyncStatus | null = binding
    ? {
        branch: status.current ?? '',
        upstream: status.tracking ?? null,
        ahead: status.ahead ?? 0,
        behind: status.behind ?? 0,
        hasUnpushedCommits: (status.ahead ?? 0) > 0,
        hasRemoteUpdates: (status.behind ?? 0) > 0
      }
    : null;
  const pullRequest = binding ? await resolvePullRequest(projectPath, deps) : null;
  if (binding && JSON.stringify(binding) !== JSON.stringify(config.github)) {
    await writeProjectConfig(projectPath, {
      ...config,
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

async function resolveProjectPath(vault: string, projectUid: string): Promise<string | null> {
  const projectsRoot = path.join(vault, '01_Projects');
  try {
    const dirents = await fs.readdir(projectsRoot, { withFileTypes: true });
    for (const entry of dirents) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsRoot, entry.name);
      const config = await readProjectConfig(projectPath);
      if (config?.uid === projectUid) return projectPath;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function publishProjectToGitHub(
  vault: string,
  args: PublishArgs,
  deps: Deps = {}
): Promise<GitHubProjectState> {
  const projectPath = await resolveProjectPath(vault, args.projectUid);
  if (!projectPath) throw new Error(`project not found: ${args.projectUid}`);
  const config = await readProjectConfig(projectPath);
  if (!config) throw new Error(`project config not found: ${args.projectUid}`);
  const git = simpleGit(projectPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
    await git.add('.');
    await git.commit(`orbit: init project ${path.basename(projectPath)}`).catch(() => undefined);
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
    projectPath
  );
  if (create.code !== 0) {
    throw new Error(`gh repo create failed: ${create.stdout.trim()}`);
  }
  await writeProjectConfig(projectPath, {
    ...config,
    github: await resolveBindingFromRepository(
      args.owner,
      args.repo,
      deps,
      config.github?.connectedAt ?? nowIso(deps),
      projectPath
    )
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
): Promise<{ projectPath: string; uid: string; slug: string; binding: GitHubRepoBinding | null }> {
  const slug = args.slug ?? args.repo.toLowerCase();
  const projectPath = projectDir(vault, slug);
  await fs.access(projectPath).then(
    () => Promise.reject(new Error(`project already exists: ${slug}`)),
    () => Promise.resolve()
  );
  await (deps.cloneRepo ?? cloneRepoDefault)(`${args.owner}/${args.repo}`, projectPath);
  const createdAt = nowIso(deps);
  const uid = newUid();
  const config = {
    uid,
    slug,
    name: args.name ?? args.repo,
    template: 'imported-github',
    created_at: createdAt,
    vision_linked: true,
    setup: [],
    teardown: [],
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
  });
  const state = await getGitHubProjectState(vault, uid, deps);
  return {
    projectPath,
    uid,
    slug,
    binding: state.binding
  };
}
