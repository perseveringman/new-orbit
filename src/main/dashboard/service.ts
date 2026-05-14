import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { ORBIT_DIR, ORBIT_WORKTREES_DIR } from '@shared/constants';
import type {
  DashboardAgentStats,
  DashboardKnowledgeStats,
  DashboardPendingStats,
  DashboardSummary,
  DashboardSystemHealth,
  DashboardThinkingStats
} from '@shared/dashboard';
import { queryActivities } from '../activity';
import { getPool } from '../agent/pool';
import { costToday, readCostRecords } from '../agent/tokens';
import { createInboxServiceForVault } from '../inbox/service';
import { listProjects } from '../project';
import { getSettings } from '../settings';
import { currentSession } from '../fs';
import { getAutoRunnerDispatcher } from '../auto_runner';
import { getLocalRuntimeManager } from '../orchestration/runtime';
import { VISION_FILENAME } from '../vision';

export async function getDashboardSummary(vaultPath: string): Promise<DashboardSummary> {
  const [pending, agent, knowledge, thinking, health] = await Promise.all([
    getPendingStats(vaultPath),
    getAgentStats(vaultPath),
    getKnowledgeStats(vaultPath),
    getThinkingStats(vaultPath),
    getSystemHealth(vaultPath)
  ]);
  return { pending, agent, knowledge, thinking, health };
}

export async function getPendingStats(vaultPath: string): Promise<DashboardPendingStats> {
  const sess = currentSession();
  const tasks = sess?.tasks.allTasks() ?? [];
  const inbox = await createInboxServiceForVault(vaultPath).list({ includeArchived: false });
  return {
    inboxPending: inbox.counts.sidebarMessagesPending,
    blockedTasks: tasks.filter((task) => task.status === 'blocked').length,
    pendingTasks: tasks.filter((task) => task.status === 'waiting' || task.status === 'todo').length
  };
}

export async function getAgentStats(vaultPath: string): Promise<DashboardAgentStats> {
  const sess = currentSession();
  const tasks = sess?.tasks.allTasks() ?? [];
  const [cost, status] = await Promise.all([costToday(vaultPath), getAutoRunnerDispatcher().status()]);
  const activeRuns = getPool().list().filter((run) => run.status === 'running').length;
  const onlineRuntimes = getLocalRuntimeManager().list().filter((runtime) => runtime.status === 'online').length;
  return {
    doingTasks: tasks.filter((task) => task.status === 'doing').length,
    activeRuns,
    todayCostUsd: cost.estUSD,
    autoRunnerEnabled: status.enabled,
    onlineRuntimes
  };
}

export async function getKnowledgeStats(vaultPath: string): Promise<DashboardKnowledgeStats> {
  const [activities, projects] = await Promise.all([
    queryActivities(vaultPath, { from: weekStartIso(), limit: 1000 }),
    listProjects(vaultPath)
  ]);
  return {
    period: 'week',
    feedSaved: countActions(activities, 'feed.item_saved'),
    libraryAdded: countActions(activities, 'library.article_saved'),
    thoughtsCreated: countActions(activities, 'thought.created'),
    promotedToResource: countActions(activities, 'library.article_promoted'),
    promotedToProject: countActions(activities, 'thought.promoted'),
    activeProjects: projects.filter((project) => project.status !== 'archived').length,
    archivedProjects: projects.filter((project) => project.status === 'archived').length
  };
}

export async function getThinkingStats(vaultPath: string): Promise<DashboardThinkingStats> {
  const today = dateKey(new Date());
  const dailyReviewPath = path.join(vaultPath, '02_Areas', 'Journal', `${today}.md`);
  const [recentActivities, dailyReviewAvailable, visionStat, recentThinkingTrails] = await Promise.all([
    queryActivities(vaultPath, { limit: 100 }),
    exists(dailyReviewPath),
    statOrNull(path.join(vaultPath, VISION_FILENAME)),
    listThinkingTrails(vaultPath)
  ]);
  return {
    dailyReviewAvailable,
    dailyReviewDate: today,
    ...(dailyReviewAvailable ? { dailyReviewPath } : {}),
    recentActivities: recentActivities.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
    visionLastReviewed: visionStat?.mtime.toISOString() ?? null,
    visionDaysSinceReview: visionStat ? daysSince(visionStat.mtime) : null,
    recentThinkingTrails
  };
}

export async function getSystemHealth(vaultPath: string): Promise<DashboardSystemHealth> {
  const [projects, settings, today, monthRecords, vaultSizeBytes, worktreeSizeBytes, orbitDataSizeBytes] =
    await Promise.all([
      listProjects(vaultPath),
      getSettings(),
      costToday(vaultPath),
      readCostRecords(vaultPath),
      directorySize(vaultPath, new Set(['.git', 'node_modules', 'out', 'build'])),
      directorySize(path.join(vaultPath, ORBIT_DIR, ORBIT_WORKTREES_DIR), new Set(['.git', 'node_modules'])),
      directorySize(path.join(vaultPath, ORBIT_DIR), new Set(['worktrees']))
    ]);
  const dirtyProjects = await dirtyProjectSummaries(projects);
  const activeRuns = getPool().list().filter((run) => run.status === 'running').length;
  return {
    disk: { vaultSizeBytes, worktreeSizeBytes, orbitDataSizeBytes },
    git: { dirtyProjects },
    runtimes: getLocalRuntimeManager().list().map((runtime) => ({
      id: runtime.runtimeId,
      provider: runtime.provider,
      status: runtime.status === 'online' ? 'online' : 'offline',
      activeRuns: runtime.provider === 'claude' ? activeRuns : 0,
      maxConcurrent: runtime.limits.maxConcurrentRuns
    })),
    budget: {
      todayUsd: today.estUSD,
      monthUsd: roundUsd(monthRecords.reduce((sum, record) => sum + record.estUSD, 0)),
      defaultLimitPerTask: settings.autoRunner.defaultBudgetPerTask
    }
  };
}

type ProjectForHealth = Awaited<ReturnType<typeof listProjects>>[number];

async function dirtyProjectSummaries(
  projects: ProjectForHealth[]
): Promise<Array<{ projectName: string; uncommittedFiles: number }>> {
  const rows = await Promise.all(
    projects
      .filter((project) => project.status !== 'archived')
      .map(async (project) => {
        try {
          const status = await simpleGit(project.workdirPath ?? project.path).status();
          const count = status.files.length;
          return count > 0 ? { projectName: project.name, uncommittedFiles: count } : null;
        } catch (error) {
          console.warn('[dashboard] failed to read project git status', {
            error,
            projectUid: project.uid
          });
          return null;
        }
      })
  );
  return rows.filter((row): row is { projectName: string; uncommittedFiles: number } => row !== null);
}

async function directorySize(root: string, ignored: Set<string>): Promise<number> {
  let entries: Array<import('node:fs').Dirent> = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath, ignored);
    else if (entry.isFile()) total += (await fs.stat(fullPath)).size;
  }
  return total;
}

async function listThinkingTrails(vaultPath: string): Promise<string[]> {
  const root = path.join(vaultPath, 'docs', 'thinking-trail');
  let entries: Array<import('node:fs').Dirent> = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, 3);
}

function countActions(events: Awaited<ReturnType<typeof queryActivities>>, action: string): number {
  return events.filter((event) => event.action === action).length;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

async function statOrNull(filePath: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function weekStartIso(): string {
  const date = new Date();
  const day = date.getDay() === 0 ? 6 : date.getDay() - 1;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
