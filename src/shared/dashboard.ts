import type { ActivityEvent } from './activity';

export interface DashboardPendingStats {
  inboxPending: number;
  blockedTasks: number;
  pendingTasks: number;
}

export interface DashboardAgentStats {
  doingTasks: number;
  activeRuns: number;
  todayCostUsd: number;
  autoRunnerEnabled: boolean;
  onlineRuntimes: number;
}

export interface DashboardKnowledgeStats {
  period: 'week';
  feedSaved: number;
  libraryAdded: number;
  thoughtsCreated: number;
  promotedToResource: number;
  promotedToProject: number;
  activeProjects: number;
  archivedProjects: number;
}

export interface DashboardThinkingStats {
  dailyReviewAvailable: boolean;
  dailyReviewDate: string | null;
  dailyReviewPath?: string;
  recentActivities: ActivityEvent[];
  visionLastReviewed: string | null;
  visionDaysSinceReview: number | null;
  recentThinkingTrails: string[];
}

export interface DashboardSystemHealth {
  disk: {
    vaultSizeBytes: number;
    worktreeSizeBytes: number;
    orbitDataSizeBytes: number;
  };
  git: {
    dirtyProjects: Array<{ projectName: string; uncommittedFiles: number }>;
  };
  runtimes: Array<{
    id: string;
    provider: string;
    status: 'online' | 'offline';
    activeRuns: number;
    maxConcurrent: number;
  }>;
  budget: {
    todayUsd: number;
    monthUsd: number;
    defaultLimitPerTask: number;
  };
}

export interface DashboardSummary {
  pending: DashboardPendingStats;
  agent: DashboardAgentStats;
  knowledge: DashboardKnowledgeStats;
  thinking: DashboardThinkingStats;
  health: DashboardSystemHealth;
}
