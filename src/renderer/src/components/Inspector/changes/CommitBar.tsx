import { useEffect, useState } from 'react';
import type {
  CreateGitHubPullRequestArgsDTO,
  PublishProjectToGitHubArgsDTO
} from '@shared/ipc';
import type {
  GitHubPullRequestSummary,
  GitHubRepoBinding,
  GitHubRepoVisibility
} from '@shared/github';
import { INSPECTOR_THEME } from '../inspectorTheme';

interface CommitBarProps {
  message: string;
  stagedCount: number;
  busy?: boolean;
  onMessageChange(message: string): void;
  onCommit(): void;
}

export function CommitBar({
  message,
  stagedCount,
  busy = false,
  onMessageChange,
  onCommit
}: CommitBarProps): JSX.Element {
  const canCommit = stagedCount > 0 && message.trim().length > 0 && !busy;

  return (
    <div className="space-y-2 border-t border-inspector-border-subtle p-3">
      <label className="block text-xs font-medium text-inspector-text-secondary">
        Commit 信息
      </label>
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        placeholder="描述已暂存的变更集…"
        rows={2}
        className="w-full rounded border border-inspector-border-subtle bg-inspector-surface-1 px-3 py-2 text-sm text-inspector-text-primary outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[11px] ${INSPECTOR_THEME.textDim}`}>
          {stagedCount > 0 ? `${stagedCount} 个已暂存文件可提交` : '暂存文件后即可提交'}
        </span>
        <button
          type="button"
          onClick={onCommit}
          disabled={!canCommit}
          className="rounded bg-inspector-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? '提交中…' : '提交已暂存'}
        </button>
      </div>
    </div>
  );
}

interface GitHubPublishActionsProps {
  projectUid: string;
  projectName: string;
  defaultRepo: string;
  binding?: GitHubRepoBinding | null;
  pullRequest?: GitHubPullRequestSummary | null;
  busy?: boolean;
  onPublish(args: PublishProjectToGitHubArgsDTO): void;
  onCreatePullRequest(args: CreateGitHubPullRequestArgsDTO): void;
  onOpenPullRequest?(url: string): void;
}

export function GitHubPublishActions({
  projectUid,
  projectName,
  defaultRepo,
  binding,
  pullRequest,
  busy = false,
  onPublish,
  onCreatePullRequest,
  onOpenPullRequest
}: GitHubPublishActionsProps): JSX.Element {
  const [owner, setOwner] = useState(binding?.owner ?? '');
  const [repo, setRepo] = useState(binding?.repo ?? defaultRepo);
  const [visibility, setVisibility] = useState<GitHubRepoVisibility>(binding?.visibility ?? 'private');
  const [title, setTitle] = useState(`Orbit: ${projectName}`);
  const [draft, setDraft] = useState(true);

  useEffect(() => {
    setOwner(binding?.owner ?? '');
    setRepo(binding?.repo ?? defaultRepo);
    setVisibility(binding?.visibility ?? 'private');
  }, [binding?.owner, binding?.repo, binding?.visibility, defaultRepo]);

  useEffect(() => {
    setTitle(`Orbit: ${projectName}`);
  }, [projectName]);

  if (pullRequest) {
    return (
      <div className="space-y-2 rounded border border-inspector-border-subtle bg-inspector-surface-1 p-3">
        <p className="text-xs font-medium text-inspector-text-secondary">PR</p>
        <p className="text-sm text-inspector-text-primary">
          #{pullRequest.number} · {pullRequest.title}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpenPullRequest?.(pullRequest.url)}
            className="rounded border border-inspector-border-subtle px-3 py-1.5 text-xs"
          >
            打开 PR
          </button>
        </div>
      </div>
    );
  }

  if (!binding) {
    return (
      <div className="space-y-3 rounded border border-inspector-border-subtle bg-inspector-surface-1 p-3">
        <p className="text-xs font-medium text-inspector-text-secondary">发布</p>
        <label className="block text-xs text-inspector-text-secondary">
          Owner / 组织
          <input
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="mt-1 w-full rounded border border-inspector-border-subtle bg-inspector-surface-0 px-3 py-2 text-sm text-inspector-text-primary outline-none"
          />
        </label>
        <label className="block text-xs text-inspector-text-secondary">
          仓库名称
          <input
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            className="mt-1 w-full rounded border border-inspector-border-subtle bg-inspector-surface-0 px-3 py-2 text-sm text-inspector-text-primary outline-none"
          />
        </label>
        <label className="block text-xs text-inspector-text-secondary">
          可见性
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as GitHubRepoVisibility)}
            className="mt-1 w-full rounded border border-inspector-border-subtle bg-inspector-surface-0 px-3 py-2 text-sm text-inspector-text-primary outline-none"
          >
            <option value="private">私有</option>
            <option value="public">公开</option>
            <option value="internal">内部</option>
          </select>
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!owner.trim() || !repo.trim() || busy}
            onClick={() =>
              onPublish({
                projectUid,
                owner: owner.trim(),
                repo: repo.trim(),
                visibility
              })
            }
            className="rounded bg-inspector-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? '发布中…' : '发布'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-inspector-border-subtle bg-inspector-surface-1 p-3">
      <p className="text-xs font-medium text-inspector-text-secondary">创建 PR</p>
      <label className="block text-xs text-inspector-text-secondary">
        PR 标题
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded border border-inspector-border-subtle bg-inspector-surface-0 px-3 py-2 text-sm text-inspector-text-primary outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-inspector-text-secondary">
        <input
          type="checkbox"
          checked={draft}
          onChange={(event) => setDraft(event.target.checked)}
        />
        草稿 pull request
      </label>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!title.trim() || busy}
          onClick={() =>
            onCreatePullRequest({
              projectUid,
              title: title.trim(),
              draft
            })
          }
          className="rounded bg-inspector-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? '创建中…' : '创建 pull request'}
        </button>
      </div>
    </div>
  );
}
