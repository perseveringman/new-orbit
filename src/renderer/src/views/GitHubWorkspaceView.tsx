import { useEffect, useMemo } from 'react';
import type { GitHubConnection, GitHubWorkspaceRepository } from '@shared/github';
import { useFiles } from '../store/files';
import { useGitHub, GITHUB_ALL_OWNERS } from '../store/github';
import { usePara } from '../store/para';
import { useWorkspace } from '../store/workspace';

export interface GitHubWorkspaceSurfaceProps {
  connection: GitHubConnection | null;
  repositories: GitHubWorkspaceRepository[];
  loading: boolean;
  selectedOwner: string;
  searchQuery: string;
  importingFullName: string | null;
  onRefresh(): void;
  onAuthenticate(): void;
  onSelectOwner(owner: string): void;
  onSearchQueryChange(query: string): void;
  onImportRepository(repo: GitHubWorkspaceRepository): void;
  onOpenProject(projectUid: string): void;
}

export function GitHubWorkspaceView(): JSX.Element {
  const connection = useGitHub((s) => s.connection);
  const repositories = useGitHub((s) => s.repositories);
  const loading = useGitHub((s) => s.loading);
  const selectedOwner = useGitHub((s) => s.selectedOwner);
  const searchQuery = useGitHub((s) => s.searchQuery);
  const importingFullName = useGitHub((s) => s.importingFullName);
  const refresh = useGitHub((s) => s.refresh);
  const setSelectedOwner = useGitHub((s) => s.setSelectedOwner);
  const setSearchQuery = useGitHub((s) => s.setSearchQuery);
  const importRepository = useGitHub((s) => s.importRepository);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAuthenticate = (): void => {
    void (async () => {
      try {
        await window.orbit.github.authenticate();
        await refresh();
        toast('GitHub 已认证');
      } catch (error) {
        toast(`GitHub 认证失败：${(error as Error).message}`);
      }
    })();
  };

  const onOpenProject = (projectUid: string): void => {
    setActiveProjectUid(projectUid);
    setView({ kind: 'project', projectUid, pane: 'github' });
  };

  const onImportRepository = (repo: GitHubWorkspaceRepository): void => {
    void (async () => {
      try {
        const result = await importRepository(repo);
        await refreshProjects();
        setActiveProjectUid(result.uid);
        setView({ kind: 'project', projectUid: result.uid, pane: 'github' });
        toast(`已导入 ${repo.fullName}`);
      } catch (error) {
        toast(`导入失败：${(error as Error).message}`);
      }
    })();
  };

  return (
    <GitHubWorkspaceSurface
      connection={connection}
      repositories={repositories}
      loading={loading}
      selectedOwner={selectedOwner}
      searchQuery={searchQuery}
      importingFullName={importingFullName}
      onRefresh={() => void refresh()}
      onAuthenticate={onAuthenticate}
      onSelectOwner={setSelectedOwner}
      onSearchQueryChange={setSearchQuery}
      onImportRepository={onImportRepository}
      onOpenProject={onOpenProject}
    />
  );
}

export function GitHubWorkspaceSurface({
  connection,
  repositories,
  loading,
  selectedOwner,
  searchQuery,
  importingFullName,
  onRefresh,
  onAuthenticate,
  onSelectOwner,
  onSearchQueryChange,
  onImportRepository,
  onOpenProject
}: GitHubWorkspaceSurfaceProps): JSX.Element {
  const owners = useMemo(
    () =>
      Array.from(new Set(repositories.map((repo) => repo.owner)))
        .filter((owner) => owner.length > 0)
        .sort(),
    [repositories]
  );
  const visibleRepositories = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return repositories.filter((repo) => {
      if (selectedOwner !== GITHUB_ALL_OWNERS && repo.owner !== selectedOwner) return false;
      if (!search) return true;
      return (
        repo.fullName.toLowerCase().includes(search) ||
        repo.description?.toLowerCase().includes(search)
      );
    });
  }, [repositories, searchQuery, selectedOwner]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto px-6 py-5">
      <header className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              GitHub 控制平面
            </p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              工作区 GitHub
            </h1>
            <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              连接你的 GitHub 身份，浏览可访问仓库，并将合适仓库作为项目导入 Orbit，同时保留既有 git 历史。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={onRefresh}
            >
              刷新
            </button>
            {connection?.authenticated !== true && (
              <button
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                onClick={onAuthenticate}
              >
                认证 gh
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <WorkspaceStat
            label="账户"
            value={connection?.authenticated ? connection.viewer ?? connection.host : '未连接'}
            hint={connection?.host ?? 'github.com'}
          />
          <WorkspaceStat
            label="仓库"
            value={String(repositories.length)}
            hint="当前 GitHub 身份可见"
          />
          <WorkspaceStat
            label="已导入"
            value={String(repositories.filter((repo) => repo.importStatus === 'imported').length)}
            hint="已关联 Orbit 项目"
          />
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            <span className="text-neutral-500">搜索</span>
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="筛选仓库"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            <span className="text-neutral-500">所有者</span>
            <select
              value={selectedOwner}
              onChange={(event) => onSelectOwner(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value={GITHUB_ALL_OWNERS}>全部 owner</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">正在加载仓库…</p>
        ) : visibleRepositories.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {connection?.authenticated === true
              ? '没有仓库匹配当前筛选。'
              : '请先认证 GitHub 以加载仓库。'}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleRepositories.map((repo) => {
              const ready = repo.readiness?.hasOrbitConfig && repo.readiness?.hasAgentContext;
              return (
                <article
                  key={repo.fullName}
                  className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {repo.fullName}
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500">
                        {repo.description?.trim() || '暂无描述'}
                      </p>
                    </div>
                    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                      {repo.visibility}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      {repo.importStatus}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      {ready ? 'Orbit 就绪' : '需要设置'}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      {repo.defaultBranch}
                    </span>
                  </div>
                  {repo.linkedProjectName && (
                    <p className="mt-3 text-xs text-neutral-500">
                      关联项目：<span className="font-medium">{repo.linkedProjectName}</span>
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    {repo.linkedProjectUid ? (
                      <button
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                        onClick={() => onOpenProject(repo.linkedProjectUid!)}
                      >
                        打开项目
                      </button>
                    ) : (
                      <button
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                        disabled={importingFullName === repo.fullName}
                        onClick={() => onImportRepository(repo)}
                      >
                        {importingFullName === repo.fullName ? '导入中…' : '导入'}
                      </button>
                    )}
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      打开 GitHub
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function WorkspaceStat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/50">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}
