import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PlanProposal, PlanPublishResult } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { listProjectTaskPaths, createTask } from '../project';
import { readTaskFile, updateTaskFrontmatter } from '../task';
import { findProjectPathByUid, refreshTaskFileInSession } from './session';
import { arePreConditionsMet } from './task_graph';
import { listJsonFiles, readJsonFile, vaultPlansDir, writeJsonFile } from './storage';

function planProposalFile(vaultPath: string, projectUid: string, proposalId: string): string {
  return path.join(vaultPlansDir(vaultPath, projectUid), `${proposalId}.json`);
}

function buildInitialStatus(
  node: PlanProposal['nodes'][number],
  byUid: Map<string, TaskRecord>
): TaskRecord['status'] {
  if (node.status === 'doing' || node.status === 'blocked' || node.status === 'done') return node.status;
  if (node.status === 'backlog') return 'backlog';
  const current: TaskRecord = {
    id: `proposal:${node.taskUid}`,
    source: 'file',
    status: 'todo',
    title: node.title,
    filePath: '',
    relPath: '',
    uid: node.taskUid,
    pre_conditions: node.preConditions
  };
  return arePreConditionsMet(current, byUid) ? 'todo' : 'waiting';
}

export async function listPlanProposals(vaultPath: string, projectUid: string): Promise<PlanProposal[]> {
  const files = await listJsonFiles(vaultPlansDir(vaultPath, projectUid));
  const proposals = await Promise.all(files.map((filePath) => readJsonFile<PlanProposal | null>(filePath, null)));
  return proposals
    .filter((proposal): proposal is PlanProposal => proposal !== null)
    .sort((left, right) => left.version - right.version);
}

export async function getPlanProposal(
  vaultPath: string,
  projectUid: string,
  proposalId: string
): Promise<PlanProposal | null> {
  return readJsonFile<PlanProposal | null>(planProposalFile(vaultPath, projectUid, proposalId), null);
}

export async function savePlanProposal(vaultPath: string, proposal: PlanProposal): Promise<PlanProposal> {
  const now = new Date().toISOString();
  const next: PlanProposal = {
    ...proposal,
    createdAt: proposal.createdAt || now,
    updatedAt: now
  };
  await writeJsonFile(planProposalFile(vaultPath, proposal.projectUid, proposal.proposalId), next);
  return next;
}

async function existingProjectTasks(projectPath: string, vaultPath: string): Promise<Map<string, { path: string; task: TaskRecord }>> {
  const out = new Map<string, { path: string; task: TaskRecord }>();
  for (const absPath of await listProjectTaskPaths(projectPath)) {
    try {
      const taskFile = await readTaskFile(absPath);
      const uid = typeof taskFile.frontmatter['uid'] === 'string' ? (taskFile.frontmatter['uid'] as string) : '';
      const title =
        typeof taskFile.frontmatter['title'] === 'string'
          ? (taskFile.frontmatter['title'] as string)
          : path.basename(absPath, '.md');
      const status =
        typeof taskFile.frontmatter['status'] === 'string'
          ? ((taskFile.frontmatter['status'] as TaskRecord['status']) ?? 'backlog')
          : 'backlog';
      if (!uid) continue;
      out.set(uid, {
        path: absPath,
        task: {
          id: `file:${uid}`,
          source: 'file',
          status,
          title,
          filePath: absPath,
          relPath: path.relative(vaultPath, absPath),
          uid,
          pre_conditions: Array.isArray(taskFile.frontmatter['pre_conditions'])
            ? ((taskFile.frontmatter['pre_conditions'] as string[]) ?? [])
            : []
        }
      });
    } catch {
      // ignore malformed task files
    }
  }
  return out;
}

export async function publishPlanProposal(
  vaultPath: string,
  projectUid: string,
  proposalId: string
): Promise<PlanPublishResult> {
  const proposal = await getPlanProposal(vaultPath, projectUid, proposalId);
  if (!proposal) throw new Error(`proposal not found: ${proposalId}`);
  const projectPath = await findProjectPathByUid(vaultPath, projectUid);
  if (!projectPath) throw new Error(`project not found: ${projectUid}`);

  const existing = await existingProjectTasks(projectPath, vaultPath);
  const graph = new Map<string, TaskRecord>();
  for (const entry of existing.values()) graph.set(entry.task.uid!, entry.task);
  for (const node of proposal.nodes) {
    graph.set(node.taskUid, {
      id: `proposal:${node.taskUid}`,
      source: 'file',
      status: node.status ?? 'todo',
      title: node.title,
      filePath: '',
      relPath: '',
      uid: node.taskUid,
      pre_conditions: node.preConditions
    });
  }

  const createdTaskUids: string[] = [];
  const updatedTaskUids: string[] = [];
  const unchangedTaskUids: string[] = [];
  const waitingTaskUids: string[] = [];
  const todoTaskUids: string[] = [];

  for (const node of proposal.nodes) {
    const status = buildInitialStatus(node, graph);
    if (status === 'waiting') waitingTaskUids.push(node.taskUid);
    if (status === 'todo') todoTaskUids.push(node.taskUid);

    const patch = {
      uid: node.taskUid,
      status,
      execution_strategy: node.executionStrategy ?? 'manual',
      origin: proposal.source === 'planner' ? 'agent' : 'human',
      created_by: proposal.source === 'planner' ? 'agent:planner' : 'human:planner',
      parent_task_uid: node.parentTaskUid,
      generated_from_task_uid: node.generatedFromTaskUid,
      recommended_role: node.recommendedRole,
      candidate_role_slugs: node.candidateRoleSlugs,
      pre_conditions: node.preConditions && node.preConditions.length ? node.preConditions : undefined,
      priority: node.priority,
      due: node.due,
      effort: node.effort
    } satisfies Record<string, unknown>;

    const current = existing.get(node.taskUid);
    if (current) {
      const before = JSON.stringify(current.task.pre_conditions ?? []);
      const after = JSON.stringify(node.preConditions ?? []);
      const changed =
        current.task.title !== node.title ||
        current.task.status !== status ||
        current.task.execution_strategy !== (node.executionStrategy ?? 'manual') ||
        before !== after;
      if (changed) {
        await updateTaskFrontmatter(current.path, {
          ...patch,
          title: node.title
        });
        await refreshTaskFileInSession(current.path);
        updatedTaskUids.push(node.taskUid);
      } else {
        unchangedTaskUids.push(node.taskUid);
      }
      continue;
    }

    const created = await createTask(vaultPath, {
      project_uid: projectUid,
      title: node.title,
      uid: node.taskUid,
      description: node.description,
      frontmatter: patch
    });
    await refreshTaskFileInSession(created.taskPath);
    createdTaskUids.push(node.taskUid);
  }

  const now = new Date().toISOString();
  const nextProposal: PlanProposal = {
    ...proposal,
    status: 'published',
    acceptedAt: proposal.acceptedAt ?? now,
    publishedAt: now,
    updatedAt: now
  };
  await writeJsonFile(planProposalFile(vaultPath, projectUid, proposalId), nextProposal);

  return {
    proposalId,
    projectUid,
    createdTaskUids,
    updatedTaskUids,
    unchangedTaskUids,
    waitingTaskUids,
    todoTaskUids,
    publishedAt: now
  };
}
