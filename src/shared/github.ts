export type GitHubRepoVisibility = 'public' | 'private' | 'internal';

export interface GitHubConnection {
  available: boolean;
  authenticated: boolean;
  host: string;
  viewer?: string;
}

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

export interface GitHubProjectState {
  connection: GitHubConnection;
  binding: GitHubRepoBinding | null;
  sync: GitHubSyncStatus | null;
  pullRequest: GitHubPullRequestSummary | null;
  canPublish: boolean;
}
