import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { PlanProposal, PlannerChatMessage, ProjectRoleBinding } from '@shared/orchestration';
import { isPlannerAgentId } from './planner_agent';
import { currentSession } from '../fs';
import { conversationEvents, getConversation, getOrCreateConversation, sendAndRun } from './conversation';
import { getDispatchService, listBindingReportsForProject } from './dispatch';
import { plannerChat, plannerGenerateProposal } from './planner_agent';
import { getPlanProposal, listPlanProposals, publishPlanProposal, savePlanProposal } from './planner';
import {
  createProjectRoleBinding,
  listBindingTasks,
  listProjectRoleBindings,
  listRoleTemplates,
  listRoleTemplateVersions,
  updateProjectRoleBinding
} from './roles';
import { getLocalRuntimeManager } from './runtime';

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

let wired = false;

export function registerOrchestrationIpc(): void {
  if (wired) return;
  wired = true;

  const runtimeManager = getLocalRuntimeManager();
  runtimeManager.on('event', (event) => broadcast(IPC.runtime.event, event));
  getDispatchService().on('event', (event) => broadcast(IPC.dispatch.event, event));
  conversationEvents.on('turn', (event) => broadcast(IPC.conversation.event, event));

  ipcMain.handle(IPC.runtime.list, () => getLocalRuntimeManager().list());
  ipcMain.handle(IPC.runtime.refresh, () => getLocalRuntimeManager().refresh());
  ipcMain.handle(IPC.runtime.get, (_e, runtimeId: string) => getLocalRuntimeManager().get(runtimeId));

  ipcMain.handle(IPC.planner.listProposals, async (_e, projectUid: string) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) return [];
    return listPlanProposals(vaultPath, projectUid);
  });
  ipcMain.handle(IPC.planner.getProposal, async (_e, projectUid: string, proposalId: string) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) return null;
    return getPlanProposal(vaultPath, projectUid, proposalId);
  });
  ipcMain.handle(IPC.planner.saveProposal, async (_e, proposal: PlanProposal) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) throw new Error('no vault');
    return savePlanProposal(vaultPath, proposal);
  });
  ipcMain.handle(IPC.planner.publishProposal, async (_e, projectUid: string, proposalId: string) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) throw new Error('no vault');
    return publishPlanProposal(vaultPath, projectUid, proposalId);
  });
  ipcMain.handle(
    IPC.planner.chat,
    async (_e, projectUid: string, agentId: string, messages: PlannerChatMessage[]) => {
      if (!isPlannerAgentId(agentId)) throw new Error(`unknown planner agent: ${agentId}`);
      return plannerChat(projectUid, agentId, messages);
    }
  );
  ipcMain.handle(
    IPC.planner.generateProposal,
    async (_e, projectUid: string, agentId: string, messages: PlannerChatMessage[]) => {
      if (!isPlannerAgentId(agentId)) throw new Error(`unknown planner agent: ${agentId}`);
      return plannerGenerateProposal(projectUid, agentId, messages);
    }
  );

  ipcMain.handle(IPC.conversation.get, async (_e, taskId: string) => {
    const sess = currentSession();
    if (!sess) return null;
    const task = sess.tasks.allTasks().find((entry) => entry.id === taskId);
    if (!task?.uid) return null;
    const conversation = await getConversation(sess.vault, task.uid);
    return conversation ?? getOrCreateConversation(sess.vault, task);
  });
  ipcMain.handle(IPC.conversation.send, async (_e, taskId: string, message: string) => {
    const sess = currentSession();
    if (!sess) throw new Error('no vault');
    const task = sess.tasks.allTasks().find((entry) => entry.id === taskId);
    if (!task || task.source !== 'file') throw new Error(`task not found: ${taskId}`);
    return sendAndRun(sess.vault, task, message);
  });

  ipcMain.handle(IPC.dispatch.status, async (_e, projectUid?: string) => {
    return getDispatchService().status(projectUid);
  });
  ipcMain.handle(IPC.dispatch.releaseTask, async (_e, taskId: string, reason?: string) => {
    return getDispatchService().releaseTask(taskId, reason);
  });
  ipcMain.handle(IPC.dispatch.retryTask, async (_e, taskId: string) => {
    return getDispatchService().retryTask(taskId);
  });

  ipcMain.handle(IPC.role.listTemplates, () => listRoleTemplates());
  ipcMain.handle(IPC.role.listTemplateVersions, (_e, templateId: string) =>
    listRoleTemplateVersions(templateId)
  );
  ipcMain.handle(IPC.role.listBindings, async (_e, projectUid: string) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) return [];
    return listProjectRoleBindings(vaultPath, projectUid);
  });
  ipcMain.handle(
    IPC.role.createBinding,
    async (_e, projectUid: string, binding: ProjectRoleBinding) => {
      const vaultPath = currentSession()?.vault;
      if (!vaultPath) throw new Error('no vault');
      return createProjectRoleBinding(vaultPath, projectUid, binding);
    }
  );
  ipcMain.handle(
    IPC.role.updateBinding,
    async (_e, projectUid: string, bindingId: string, patch: Partial<ProjectRoleBinding>) => {
      const vaultPath = currentSession()?.vault;
      if (!vaultPath) throw new Error('no vault');
      return updateProjectRoleBinding(vaultPath, projectUid, bindingId, patch);
    }
  );
  ipcMain.handle(IPC.role.getBindingTasks, async (_e, projectUid: string, bindingId: string) => {
    return listBindingTasks(projectUid, bindingId);
  });
  ipcMain.handle(IPC.role.getBindingReports, async (_e, projectUid: string, bindingId: string) => {
    const vaultPath = currentSession()?.vault;
    if (!vaultPath) return [];
    return listBindingReportsForProject(vaultPath, projectUid, bindingId);
  });
}

export async function ensureOrchestrationForVault(vaultPath: string): Promise<void> {
  await getLocalRuntimeManager().attach(vaultPath);
  await getLocalRuntimeManager().refresh();
  await getDispatchService().attach(vaultPath);
  await getDispatchService().tick();
}

export function shutdownOrchestration(): void {
  getLocalRuntimeManager().detach();
  getDispatchService().detach();
}
