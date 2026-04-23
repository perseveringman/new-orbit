export type GitHubRepoVisibility = 'public' | 'private' | 'internal';

export interface GitHubConnection {
  available: boolean;
  authenticated: boolean;
  host: string;
  viewer?: string;
}

export type GitHubImportStatus =
  | 'not-imported'
  | 'importing'
  | 'imported'
  | 'needs-attention'
  | 'failed';

export interface GitHubRepoBinding {
  provider: 'github';
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  cloneUrlHttps: string;
  cloneUrlSsh?: string | null;
  defaultBranch: string;
  visibility: GitHubRepoVisibility;
  connectedAt: string;
  lastFetchedAt?: string | null;
}

export interface GitHubSyncStatus {
  branch: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  hasUnpushedCommits: boolean;
  hasRemoteUpdates: boolean;
}

export type GitHubPullRequestState = 'draft' | 'open' | 'merged' | 'closed';

export interface GitHubPullRequestSummary {
  number: number;
  url: string;
  title: string;
  state: GitHubPullRequestState;
  baseBranch: string;
  headBranch: string;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
}

export interface GitHubCheckSummary {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | null;
  url?: string;
}

export interface GitHubReviewSummary {
  reviewer: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending';
  submittedAt?: string | null;
}

export interface GitHubTaskBinding {
  taskId: string;
  taskTitle: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
}

export interface GitHubWorktreeSummary {
  id: string;
  path: string;
  branch: string;
  taskId?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  status?: 'ready' | 'dirty' | 'blocked' | 'merged';
}

export interface GitHubWorkspaceRepository {
  owner: string;
  repo: string;
  fullName: string;
  description?: string | null;
  visibility: GitHubRepoVisibility;
  defaultBranch: string;
  url: string;
  updatedAt?: string | null;
  importStatus: GitHubImportStatus;
  linkedProjectUid?: string | null;
  linkedProjectName?: string | null;
  readiness?: {
    hasOrbitConfig: boolean;
    hasAgentContext: boolean;
    hasGitBinding: boolean;
  };
}

export interface GitHubProjectState {
  connection: GitHubConnection;
  binding: GitHubRepoBinding | null;
  sync: GitHubSyncStatus | null;
  pullRequest: GitHubPullRequestSummary | null;
  canPublish: boolean;
}

export interface GitHubProjectDetails {
  overview: GitHubProjectState;
  issues: GitHubIssueSummary[];
  pullRequests: GitHubPullRequestSummary[];
  checks: GitHubCheckSummary[];
  reviews: GitHubReviewSummary[];
  worktrees: GitHubWorktreeSummary[];
  taskBindings: GitHubTaskBinding[];
  lastSyncedAt: string | null;
}

export interface NightShiftGitHubOptions {
  pushBranch?: boolean;
  createDraftPr?: boolean;
  baseBranch?: string;
  reviewers?: string[];
  labels?: string[];
  waitForChecks?: boolean;
}
