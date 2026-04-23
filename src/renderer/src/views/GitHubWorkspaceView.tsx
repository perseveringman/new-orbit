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
        toast('GitHub authenticated');
      } catch (error) {
        toast(`GitHub authentication failed: ${(error as Error).message}`);
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
        toast(`Imported ${repo.fullName}`);
      } catch (error) {
        toast(`Import failed: ${(error as Error).message}`);
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
              GitHub control plane
            </p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Workspace GitHub
            </h1>
            <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
              Connect your GitHub identity, browse accessible repositories, and import the right
              repo into Orbit as a project without losing its existing git history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={onRefresh}
            >
              Refresh
            </button>
            {connection?.authenticated !== true && (
              <button
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                onClick={onAuthenticate}
              >
                Authenticate gh
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <WorkspaceStat
            label="Account"
            value={connection?.authenticated ? connection.viewer ?? connection.host : 'Not connected'}
            hint={connection?.host ?? 'github.com'}
          />
          <WorkspaceStat
            label="Repositories"
            value={String(repositories.length)}
            hint="Visible from the active GitHub identity"
          />
          <WorkspaceStat
            label="Imported"
            value={String(repositories.filter((repo) => repo.importStatus === 'imported').length)}
            hint="Already linked to Orbit projects"
          />
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            <span className="text-neutral-500">Search</span>
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Filter repositories"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            <span className="text-neutral-500">Owner</span>
            <select
              value={selectedOwner}
              onChange={(event) => onSelectOwner(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value={GITHUB_ALL_OWNERS}>All owners</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading repositories…</p>
        ) : visibleRepositories.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {connection?.authenticated === true
              ? 'No repositories matched the current filters.'
              : 'Authenticate with GitHub to load repositories.'}
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
                        {repo.description?.trim() || 'No description'}
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
                      {ready ? 'Orbit-ready' : 'Needs setup'}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      {repo.defaultBranch}
                    </span>
                  </div>
                  {repo.linkedProjectName && (
                    <p className="mt-3 text-xs text-neutral-500">
                      Linked project: <span className="font-medium">{repo.linkedProjectName}</span>
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    {repo.linkedProjectUid ? (
                      <button
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                        onClick={() => onOpenProject(repo.linkedProjectUid!)}
                      >
                        Open Project
                      </button>
                    ) : (
                      <button
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                        disabled={importingFullName === repo.fullName}
                        onClick={() => onImportRepository(repo)}
                      >
                        {importingFullName === repo.fullName ? 'Importing…' : 'Import'}
                      </button>
                    )}
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      Open GitHub
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
