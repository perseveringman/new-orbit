import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  DashboardAgentStats,
  DashboardKnowledgeStats,
  DashboardPendingStats,
  DashboardSummary,
  DashboardSystemHealth,
  DashboardThinkingStats
} from '@shared/dashboard';
import {
  getAgentStats,
  getDashboardSummary,
  getKnowledgeStats,
  getPendingStats,
  getSystemHealth,
  getThinkingStats
} from './service';

export function registerDashboardIpc(getVaultPath: () => string | null): void {
  const vaultPath = (): string => {
    const value = getVaultPath();
    if (!value) throw new Error('no vault open');
    return value;
  };
  ipcMain.handle(IPC.dashboard.summary, async (): Promise<DashboardSummary> =>
    getDashboardSummary(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.pendingStats, async (): Promise<DashboardPendingStats> =>
    getPendingStats(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.agentStats, async (): Promise<DashboardAgentStats> =>
    getAgentStats(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.knowledgeStats, async (): Promise<DashboardKnowledgeStats> =>
    getKnowledgeStats(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.thinkingStats, async (): Promise<DashboardThinkingStats> =>
    getThinkingStats(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.systemHealth, async (): Promise<DashboardSystemHealth> =>
    getSystemHealth(vaultPath())
  );
}
