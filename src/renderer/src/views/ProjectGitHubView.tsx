import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskRecord } from '@shared/schemas';
import type { ProjectSummaryDTO } from '@shared/ipc';
import type { GitHubProjectDetails } from '@shared/github';
import { useFiles } from '../store/files';
import { GitHubPublishActions } from '../components/Inspector/changes/CommitBar';

export type ProjectGitHubTab = 'overview' | 'issues' | 'prs' | 'worktrees';

export interface ProjectGitHubSurfaceProps {
  projectName: string;
  projectUid: string;
  projectSlug: string;
  tasks: TaskRecord[];
  details: GitHubProjectDetails | null;
  activeTab: ProjectGitHubTab;
  onSelectTab(tab: ProjectGitHubTab): void;
  onRefresh(): void;
  onPublish(args: {
    projectUid: string;
    owner: string;
    repo: string;
    visibility: 'public' | 'private' | 'internal';
  }): void;
  onCreatePullRequest(args: {
    projectUid: string;
    title?: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
  }): void;
  onOpenTerminal(): void;
  onStartNightShift(): void;
  onOpenPullRequest(url: string): void;
  onOpenIssue(url: string): void;
  onBindIssue(issueNumber: number): void;
  onUnbindTask(taskPath: string): void;
}

interface ProjectGitHubViewProps {
  project: ProjectSummaryDTO;
  tasks: TaskRecord[];
  onProjectsChanged(): Promise<unknown>;
  onTasksChanged(): Promise<void>;
  onOpenTerminal(): void;
  onStartNightShift(): void;
}

export function ProjectGitHubView({
  project,
  tasks,
  onProjectsChanged,
  onTasksChanged,
  onOpenTerminal,
  onStartNightShift
}: ProjectGitHubViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [details, setDetails] = useState<GitHubProjectDetails | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectGitHubTab>('overview');

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setDetails(await window.orbit.github.getProjectDetails(project.uid));
    } catch (error) {
      setDetails(null);
      toast(`Load GitHub details failed: ${(error as Error).message}`);
    }
  }, [project.uid, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publish = (args: {
    projectUid: string;
    owner: string;
    repo: string;
    visibility: 'public' | 'private' | 'internal';
  }): void => {
    void (async () => {
      try {
        await window.orbit.github.publishProject(args);
        await onProjectsChanged();
        await refresh();
        toast(`Published ${args.owner}/${args.repo}`);
      } catch (error) {
        toast(`Publish failed: ${(error as Error).message}`);
      }
    })();
  };

  const createPullRequest = (args: {
    projectUid: string;
    title?: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
  }): void => {
    void (async () => {
      try {
        const pullRequest = await window.orbit.github.createPullRequest(args);
        await refresh();
        toast(`Created PR #${pullRequest.number}`);
      } catch (error) {
        toast(`Create PR failed: ${(error as Error).message}`);
      }
    })();
  };

  const bindIssue = (issueNumber: number): void => {
    if (tasks.length === 0) {
      toast('Create a project task first so Orbit can bind the GitHub issue.');
      return;
    }
    const choices = tasks
      .filter((task) => task.filePath)
      .map((task) => `${task.uid ?? task.id} — ${task.title}`)
      .join('\n');
    const input = window.prompt(`Bind issue #${issueNumber} to which task?\n${choices}`);
    if (!input) return;
    const normalized = input.trim();
    const task = tasks.find(
      (entry) => entry.uid === normalized || entry.id === normalized || entry.title === normalized
    );
    if (!task) {
      toast('Task not found. Paste the task UID, id, or exact title.');
      return;
    }
    const issue = details?.issues.find((entry) => entry.number === issueNumber);
    if (!issue) {
      toast(`Issue #${issueNumber} is no longer available.`);
      return;
    }
    void (async () => {
      try {
        await window.orbit.github.bindTaskIssue({
          taskPath: task.filePath,
          issueNumber,
          issueTitle: issue.title,
          issueUrl: issue.url
        });
        await onTasksChanged();
        await refresh();
        toast(`Bound issue #${issueNumber} to ${task.title}`);
      } catch (error) {
        toast(`Bind failed: ${(error as Error).message}`);
      }
    })();
  };

  const unbindTask = (taskPath: string): void => {
    void (async () => {
      try {
        await window.orbit.github.unbindTaskIssue(taskPath);
        await onTasksChanged();
        await refresh();
        toast('Removed GitHub issue binding');
      } catch (error) {
        toast(`Unbind failed: ${(error as Error).message}`);
      }
    })();
  };

  return (
      <ProjectGitHubSurface
        projectName={project.name}
        projectUid={project.uid}
        projectSlug={project.slug}
        tasks={tasks}
        details={details}
        activeTab={activeTab}
      onSelectTab={setActiveTab}
      onRefresh={() => void refresh()}
      onPublish={publish}
      onCreatePullRequest={createPullRequest}
      onOpenTerminal={onOpenTerminal}
      onStartNightShift={onStartNightShift}
      onOpenPullRequest={(url) => window.open(url, '_blank', 'noopener')}
      onOpenIssue={(url) => window.open(url, '_blank', 'noopener')}
      onBindIssue={bindIssue}
      onUnbindTask={unbindTask}
    />
  );
}

export function ProjectGitHubSurface({
  projectName,
  projectUid,
  projectSlug,
  tasks,
  details,
  activeTab,
  onSelectTab,
  onRefresh,
  onPublish,
  onCreatePullRequest,
  onOpenTerminal,
  onStartNightShift,
  onOpenPullRequest,
  onOpenIssue,
  onBindIssue,
  onUnbindTask
}: ProjectGitHubSurfaceProps): JSX.Element {
  const bindingsByIssue = useMemo(
    () => new Map(details?.taskBindings.map((binding) => [binding.issueNumber, binding]) ?? []),
    [details?.taskBindings]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto px-4 py-4">
      <header className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Project GitHub
            </p>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {details?.overview.binding?.fullName ?? `${projectName} · not linked`}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Keep tasks, issues, branches, worktrees, PRs, and Night Shift delivery status in one
              place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={onRefresh}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-500">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
            Issues {details?.issues.length ?? 0}
          </span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
            PRs {details?.pullRequests.length ?? 0}
          </span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
            Worktrees {details?.worktrees.length ?? 0}
          </span>
          {details?.overview.sync && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
              {details.overview.sync.branch} · ↑{details.overview.sync.ahead} ↓{details.overview.sync.behind}
            </span>
          )}
        </div>
      </header>

      <div className="flex border-b border-neutral-200 px-1 text-sm dark:border-neutral-800">
        {(['overview', 'issues', 'prs', 'worktrees'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSelectTab(tab)}
            className={`border-b-2 px-4 py-2 transition-colors ${
              activeTab === tab
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {tab === 'prs' ? 'PRs' : tab[0]!.toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Repository state
            </h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <SummaryItem label="Repository" value={details?.overview.binding?.fullName ?? 'Not linked'} />
              <SummaryItem label="Viewer" value={details?.overview.connection.viewer ?? 'Not connected'} />
              <SummaryItem label="Branch" value={details?.overview.sync?.branch ?? 'No active branch'} />
              <SummaryItem
                label="Pull request"
                value={
                  details?.overview.pullRequest
                    ? `#${details.overview.pullRequest.number} · ${details.overview.pullRequest.title}`
                    : 'No active PR'
                }
              />
            </dl>
            {details?.overview.pullRequest && (
              <button
                className="mt-4 rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                onClick={() => onOpenPullRequest(details.overview.pullRequest!.url)}
              >
                Open PR
              </button>
            )}
            <div className="mt-4">
              <GitHubPublishActions
                projectUid={projectUid}
                projectName={projectName}
                defaultRepo={projectSlug}
                binding={details?.overview.binding ?? null}
                pullRequest={details?.overview.pullRequest ?? null}
                onPublish={onPublish}
                onCreatePullRequest={onCreatePullRequest}
                onOpenPullRequest={onOpenPullRequest}
              />
            </div>
          </section>

          <section className="space-y-4">
            <JourneyCard
              title="Terminal flow"
              description="Pick a task, bind it to an issue, work in the project terminal, then turn the branch into a PR."
              actionLabel="Open Terminal"
              onAction={onOpenTerminal}
              steps={['Task → issue binding', 'Branch + worktree', 'Terminal work', 'Push + PR + review']}
            />
            <JourneyCard
              title="Night Shift flow"
              description="Let Night Shift pick issue-linked tasks, open a ghost worktree, and report PR/check state back into Orbit."
              actionLabel="Start Night Shift"
              onAction={onStartNightShift}
              steps={['Issue-linked task queue', 'Ghost worktree', 'Autonomous execution', 'PR + checks + follow-up']}
            />
          </section>
        </div>
      )}

      {activeTab === 'issues' && (
        <section className="grid gap-3">
          {(details?.issues ?? []).map((issue) => {
            const binding = bindingsByIssue.get(issue.number);
            return (
              <article
                key={issue.number}
                className="rounded-xl border border-neutral-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <button
                      className="text-left text-sm font-semibold text-neutral-900 hover:text-sky-600 dark:text-neutral-100 dark:hover:text-sky-400"
                      onClick={() => onOpenIssue(issue.url)}
                    >
                      #{issue.number} · {issue.title}
                    </button>
                    <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                        {issue.state}
                      </span>
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {binding ? (
                    <div className="text-right">
                      <p className="text-xs text-neutral-500">Linked to task</p>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {binding.taskTitle}
                      </p>
                      <button
                        className="mt-2 rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                        onClick={() => {
                          const task = tasks.find((entry) => entry.id === binding.taskId);
                          onUnbindTask(task?.filePath ?? binding.taskId.replace(/^file:/, ''));
                        }}
                      >
                        Unbind
                      </button>
                    </div>
                  ) : (
                    <button
                      className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                      onClick={() => onBindIssue(issue.number)}
                    >
                      Bind to task
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {(details?.issues.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-500">No issues available for this repository.</p>
          )}
        </section>
      )}

      {activeTab === 'prs' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Pull requests</h3>
            <div className="mt-4 space-y-3">
              {(details?.pullRequests ?? []).map((pullRequest) => (
                <article key={pullRequest.number} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                  <button
                    className="text-left text-sm font-semibold text-neutral-900 hover:text-sky-600 dark:text-neutral-100 dark:hover:text-sky-400"
                    onClick={() => onOpenPullRequest(pullRequest.url)}
                  >
                    PR #{pullRequest.number} · {pullRequest.title}
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    {pullRequest.state} · {pullRequest.headBranch} → {pullRequest.baseBranch}
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-4">
            <StatusPanel
              title="Checks"
              items={(details?.checks ?? []).map((check) => `${check.name} · ${check.conclusion ?? check.status}`)}
            />
            <StatusPanel
              title="Reviews"
              items={(details?.reviews ?? []).map((review) => `${review.reviewer} · ${review.state}`)}
            />
          </section>
        </div>
      )}

      {activeTab === 'worktrees' && (
        <section className="grid gap-3">
          {(details?.worktrees ?? []).map((worktree) => (
            <article
              key={worktree.id}
              className="rounded-xl border border-neutral-200 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {worktree.branch}
                  </h3>
                  <p className="text-xs text-neutral-500">{worktree.path}</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
                  {worktree.status ?? 'ready'}
                </span>
              </div>
              {worktree.prUrl && (
                <button
                  className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  onClick={() => onOpenPullRequest(worktree.prUrl!)}
                >
                  Open PR
                </button>
              )}
            </article>
          ))}
          {(details?.worktrees.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-500">No Orbit worktrees are currently linked to this repo.</p>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</dd>
    </div>
  );
}

function JourneyCard({
  title,
  description,
  actionLabel,
  onAction,
  steps
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction(): void;
  steps: string[];
}): JSX.Element {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{description}</p>
        </div>
        <button
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      </div>
      <ol className="mt-4 space-y-2 text-xs text-neutral-500">
        {steps.map((step, index) => (
          <li key={step}>
            {index + 1}. {step}
          </li>
        ))}
      </ol>
    </article>
  );
}

function StatusPanel({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      <ul className="mt-4 space-y-2 text-xs text-neutral-500">
        {items.length === 0 ? <li>No {title.toLowerCase()} yet.</li> : items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}
