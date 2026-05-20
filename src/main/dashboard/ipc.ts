import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  DashboardAgentStats,
  DashboardKnowledgeStats,
  DashboardLayout,
  DashboardPendingStats,
  DashboardSummary,
  DashboardSystemHealth,
  DashboardThinkingStats,
  DashboardWidgetRegistry
} from '@shared/dashboard';
import {
  getDashboardLayout,
  getDashboardWidgetRegistry,
  resetDashboardLayout,
  saveDashboardLayout
} from './layout';
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
  ipcMain.handle(IPC.dashboard.registry, async (): Promise<DashboardWidgetRegistry> =>
    getDashboardWidgetRegistry()
  );
  ipcMain.handle(IPC.dashboard.layout, async (): Promise<DashboardLayout> =>
    getDashboardLayout(vaultPath())
  );
  ipcMain.handle(IPC.dashboard.saveLayout, async (_event, layout: DashboardLayout): Promise<DashboardLayout> =>
    saveDashboardLayout(vaultPath(), layout)
  );
  ipcMain.handle(IPC.dashboard.resetLayout, async (): Promise<DashboardLayout> =>
    resetDashboardLayout(vaultPath())
  );
}
