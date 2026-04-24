import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangesSummary, DiffFile, GitStatusSummary } from '@shared/git';
import type { GitHubProjectState } from '@shared/github';
import { RefreshCw } from 'lucide-react';
import { useFiles } from '../../../store/files';
import { usePara } from '../../../store/para';
import { useWorkspace } from '../../../store/workspace';
import { useWorkspaceInspector } from '../../../store/workspaceInspector';
import { INSPECTOR_THEME } from '../inspectorTheme';
import { buildChangeFiles, buildChangeRows } from './buildChangeRows';
import { ChangesTree } from './ChangesTree';
import { CommitBar, GitHubPublishActions } from './CommitBar';
import { DiffViewer } from './DiffViewer';

export function ChangesPanel(): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const view = usePara((s) => s.view);
  const activeProjectUid = useWorkspace((s) => s.activeProjectUid);
  const projects = useWorkspace((s) => s.projects);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);

  const inspector = useWorkspaceInspector();

  const project = useMemo(
    () => (view.kind === 'project' ? projects.find((item) => item.uid === activeProjectUid) ?? null : null),
    [activeProjectUid, projects, view.kind]
  );

  const [summary, setSummary] = useState<ChangesSummary | null>(null);
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [githubState, setGitHubState] = useState<GitHubProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [pendingDiscardPath, setPendingDiscardPath] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'commit' | 'publish' | 'pr' | null>(null);
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    if (!project?.path) {
      if (token !== loadTokenRef.current) return;
      setSummary({ dirty: false, stagedCount: 0, unstagedCount: 0, untrackedCount: 0, files: [] });
      setDiffFiles([]);
      setGitStatus(null);
      setGitHubState(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextDiffFiles, nextGitStatus, nextGitHubState] = await Promise.all([
        window.orbit.git.getChanges({ cwd: project.path }),
        window.orbit.git.getWorkingTreeDiff({ cwd: project.path }),
        window.orbit.git.status({ cwd: project.path }),
        window.orbit.github.getProjectState(project.uid).catch(() => null)
      ]);

      if (token !== loadTokenRef.current) return;
      setSummary(nextSummary);
      setDiffFiles(nextDiffFiles);
      setGitStatus(nextGitStatus);
      setGitHubState(nextGitHubState);
      if (!inspector.selectedPath || !nextSummary.files.some((file) => file.path === inspector.selectedPath)) {
        inspector.setSelectedPath?.(nextSummary.files[0]?.path ?? null);
      }
    } catch (loadError) {
      if (token !== loadTokenRef.current) return;
      setSummary({ dirty: false, stagedCount: 0, unstagedCount: 0, untrackedCount: 0, files: [] });
      setDiffFiles([]);
      setError((loadError as Error).message || 'Failed to load changes');
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
      }
    }
  }, [inspector, project?.path, project?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeFiles = useMemo(
    () => buildChangeFiles(summary?.files ?? [], diffFiles, inspector.changeQuery ?? ''),
    [diffFiles, inspector.changeQuery, summary?.files]
  );
  const rows = useMemo(
    () => buildChangeRows(changeFiles, inspector.expanded ?? {}),
    [changeFiles, inspector.expanded]
  );
  const selectedFile = useMemo(
    () => changeFiles.find((file) => file.path === inspector.selectedPath) ?? changeFiles[0] ?? null,
    [changeFiles, inspector.selectedPath]
  );

  const runFileAction = useCallback(
    async (path: string, fn: () => Promise<void>) => {
      setBusyPath(path);
      try {
        await fn();
        setPendingDiscardPath(null);
        await load();
      } catch (actionError) {
        toast(`Git action failed: ${(actionError as Error).message}`);
      } finally {
        setBusyPath(null);
      }
    },
    [load, toast]
  );

  const handleStage = (path: string): void => {
    if (!project?.path) return;
    void runFileAction(path, () => window.orbit.git.stagePaths({ cwd: project.path, paths: [path] }));
  };

  const handleUnstage = (path: string): void => {
    if (!project?.path) return;
    void runFileAction(path, () => window.orbit.git.unstagePaths({ cwd: project.path, paths: [path] }));
  };

  const handleDiscard = (path: string): void => {
    const file = changeFiles.find((entry) => entry.path === path);
    if (file?.isUntracked) {
      setPendingDiscardPath(path);
      return;
    }
    if (!project?.path) return;
    void runFileAction(path, () => window.orbit.git.discardPaths({ cwd: project.path, paths: [path] }));
  };

  const handleConfirmDiscard = (path: string): void => {
    if (!project?.path) return;
    void runFileAction(path, () => window.orbit.git.discardPaths({ cwd: project.path, paths: [path] }));
  };

  const handleCommit = (): void => {
    if (!project?.path) return;
    const message = inspector.commitMessage?.trim() ?? '';
    if (!message) {
      toast('Commit message is required');
      return;
    }

    setBusyAction('commit');
    void (async () => {
      try {
        const result = await window.orbit.git.commitSelection({ cwd: project.path, message });
        inspector.setCommitMessage?.('');
        toast(`Committed ${result.sha.slice(0, 7)}`);
        await load();
      } catch (commitError) {
        toast(`Commit failed: ${(commitError as Error).message}`);
      } finally {
        setBusyAction(null);
      }
    })();
  };

  const handlePublish = useCallback(
    (args: { projectUid: string; owner: string; repo: string; visibility: 'public' | 'private' | 'internal' }) => {
      setBusyAction('publish');
      void (async () => {
        try {
          const next = await window.orbit.github.publishProject(args);
          setGitHubState(next);
          await refreshProjects?.();
          toast(`Published ${args.owner}/${args.repo}`);
        } catch (publishError) {
          toast(`Publish failed: ${(publishError as Error).message}`);
        } finally {
          setBusyAction(null);
        }
      })();
    },
    [refreshProjects, toast]
  );

  const handleCreatePullRequest = useCallback(
    (args: { projectUid: string; title?: string; body?: string; baseBranch?: string; draft?: boolean }) => {
      setBusyAction('pr');
      void (async () => {
        try {
          const pullRequest = await window.orbit.github.createPullRequest(args);
          setGitHubState((current) =>
            current ? { ...current, pullRequest } : current
          );
          toast(`Created PR #${pullRequest.number}`);
        } catch (pullRequestError) {
          toast(`Create PR failed: ${(pullRequestError as Error).message}`);
        } finally {
          setBusyAction(null);
        }
      })();
    },
    [toast]
  );

  const binding = githubState?.binding ?? project?.github ?? null;
  const fileCount = changeFiles.length;
  const baseLabel = binding?.defaultBranch ?? 'HEAD';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center justify-between gap-3 border-b border-inspector-border-subtle px-3 py-2 ${INSPECTOR_THEME.textSecondary}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={INSPECTOR_THEME.textPrimary}>{gitStatus?.branch ?? 'Changes'}</span>
            <span>Base {baseLabel}</span>
            <span>{fileCount} files changed</span>
            <span>Staged {summary?.stagedCount ?? 0}</span>
            <span>Unstaged {summary?.unstagedCount ?? 0}</span>
            <span>Untracked {summary?.untrackedCount ?? 0}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 rounded border border-inspector-border-subtle px-2 py-1 text-xs disabled:opacity-50"
        >
          <RefreshCw size={12} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="border-b border-inspector-border-subtle px-3 py-2">
        <input
          type="search"
          value={inspector.changeQuery ?? ''}
          onChange={(event) => inspector.setChangeQuery?.(event.target.value)}
          placeholder="Search changes..."
          className="w-full rounded border border-inspector-border-subtle bg-inspector-surface-1 px-3 py-2 text-sm text-inspector-text-primary outline-none"
        />
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="flex min-h-0 flex-col border-r border-inspector-border-subtle">
          <ChangesTree
            rows={rows}
            expandedGroups={inspector.expanded ?? {}}
            selectedPath={selectedFile?.path ?? null}
            pendingDiscardPath={pendingDiscardPath}
            busyPath={busyPath}
            onSelect={(path) => inspector.setSelectedPath?.(path)}
            onToggleGroup={(key) => inspector.toggleExpanded?.(key)}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={handleDiscard}
            onConfirmDiscard={handleConfirmDiscard}
            onCancelDiscard={() => setPendingDiscardPath(null)}
          />
          <CommitBar
            message={inspector.commitMessage ?? ''}
            stagedCount={summary?.stagedCount ?? 0}
            busy={busyAction === 'commit'}
            onMessageChange={(message) => inspector.setCommitMessage?.(message)}
            onCommit={handleCommit}
          />
        </div>
        <div className="flex min-h-0 flex-col">
          <DiffViewer file={selectedFile} />
          <div className="border-t border-inspector-border-subtle p-3">
            <GitHubPublishActions
              projectUid={project?.uid ?? ''}
              projectName={project?.name ?? 'Project'}
              defaultRepo={project?.slug ?? 'project'}
              binding={binding}
              pullRequest={githubState?.pullRequest ?? null}
              busy={busyAction === 'publish' || busyAction === 'pr'}
              onPublish={handlePublish}
              onCreatePullRequest={handleCreatePullRequest}
              onOpenPullRequest={(url) => window.open(url, '_blank', 'noopener')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
