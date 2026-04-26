import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type {
  DispatchSnapshot,
  ImplementationReport,
  ProjectRoleBinding,
  RoleTemplate,
  RuntimeDescriptor,
  TaskLease
} from '@shared/orchestration';
import type {
  AgentEvent,
  StartError,
  StartTaskResult
} from '@shared/agent';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { listProjects } from '../project';
import { readTaskFile, updateTaskFrontmatter } from '../task';
import { getPool, type PoolEvent } from '../agent/pool';
import { startTask } from '../agent/ipc';
import {
  appendReleaseTurn,
  appendTurn,
  getOrCreateConversation,
  recordRunCompletion,
  startSegment
} from './conversation';
import {
  createProjectRoleBinding,
  listBindingReports,
  listProjectRoleBindings,
  listRoleTemplates,
  listRoleTemplateVersions,
  updateProjectRoleBinding
} from './roles';
import { refreshTaskFileInSession } from './session';
import { arePreConditionsMet, buildTaskGraph, materializeTaskGraph } from './task_graph';
import { getLocalRuntimeManager } from './runtime';
import { readJsonFile, vaultLeasesFile, vaultReportsFile, writeJsonFile } from './storage';
import { classifyDispatchCompletion } from './dispatch_completion';
import { OrchestrationEventBridge } from './event_bridge';

function summarizeEvents(events: AgentEvent[]): { summary: string; details: string[] } {
  const lines = events
    .map((event) => event.text?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(-8);
  const summary = lines.at(-1) ?? 'Execution completed without a textual summary.';
  return { summary, details: lines };
}

function normalizeTaskStatus(value: unknown): TaskRecord['status'] | null {
  return value === 'backlog' ||
    value === 'waiting' ||
    value === 'todo' ||
    value === 'doing' ||
    value === 'blocked' ||
    value === 'done'
    ? value
    : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function persistLeases(vaultPath: string, leases: TaskLease[]): Promise<void> {
  await writeJsonFile(vaultLeasesFile(vaultPath), leases);
}

async function persistReports(vaultPath: string, reports: ImplementationReport[]): Promise<void> {
  await writeJsonFile(vaultReportsFile(vaultPath), reports);
}

export class DispatchService extends EventEmitter {
  private vaultPath: string | null = null;
  private leases: TaskLease[] = [];
  private reports: ImplementationReport[] = [];
  private interval: NodeJS.Timeout | null = null;
  private poolListenerAttached = false;
  private readonly eventBridge = new OrchestrationEventBridge();

  async attach(vaultPath: string): Promise<void> {
    this.vaultPath = vaultPath;
    this.leases = await readJsonFile<TaskLease[]>(vaultLeasesFile(vaultPath), []);
    this.reports = await readJsonFile<ImplementationReport[]>(vaultReportsFile(vaultPath), []);
    if (!this.poolListenerAttached) {
      getPool().on('event', (event: PoolEvent) => {
        void this.handlePoolEvent(event);
      });
      this.poolListenerAttached = true;
    }
    await getLocalRuntimeManager().attach(vaultPath);
    await getLocalRuntimeManager().refresh();
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      void this.tick();
    }, 15_000);
  }

  detach(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.vaultPath = null;
    this.leases = [];
    this.reports = [];
  }

  async status(projectUid?: string): Promise<DispatchSnapshot> {
    const vaultPath = this.requireVault();
    const templates = await listRoleTemplates();
    const templateVersions = (
      await Promise.all(templates.map((template) => listRoleTemplateVersions(template.id)))
    ).flat();
    const projects = await listProjects(vaultPath);
    const bindings = (
      await Promise.all(projects.map((project) => listProjectRoleBindings(vaultPath, project.uid)))
    ).flat();
    return {
      refreshedAt: new Date().toISOString(),
      runtimes: getLocalRuntimeManager().list(),
      templates,
      templateVersions,
      bindings: projectUid ? bindings.filter((binding) => binding.projectUid === projectUid) : bindings,
      leases: projectUid
        ? this.leases.filter((lease) => {
            const task = currentSession()
              ?.tasks.allTasks()
              .find((entry) => entry.id === lease.taskId);
            return task?.project_uid === projectUid;
          })
        : this.leases,
      reports: projectUid
        ? this.reports.filter((report) => report.projectUid === projectUid)
        : this.reports
    };
  }

  async releaseTask(taskId: string, reason = 'released by user'): Promise<TaskLease | null> {
    const vaultPath = this.requireVault();
    const lease = this.leases.find(
      (entry) => entry.taskId === taskId && entry.status !== 'completed' && entry.status !== 'released'
    );
    if (!lease) return null;
    const task = currentSession()?.tasks.allTasks().find((entry) => entry.id === taskId);
    if (!task || task.source !== 'file') return null;
    const nextLease: TaskLease = {
      ...lease,
      status: 'released',
      releaseReason: reason
    };
    this.leases = this.leases.map((entry) => (entry.leaseId === lease.leaseId ? nextLease : entry));
    await updateTaskFrontmatter(task.filePath, {
      status: arePreConditionsMet(task, buildTaskGraph(currentSession()?.tasks.allTasks() ?? []).byUid)
        ? 'todo'
        : 'waiting',
      owner_type: undefined,
      owner_id: undefined,
      active_run_id: undefined,
      claimed_at: undefined,
      role_binding_id: undefined,
      blocked_reason: undefined
    });
    await refreshTaskFileInSession(task.filePath);
    await persistLeases(vaultPath, this.leases);
    await appendReleaseTurn(vaultPath, task, reason);
    this.emit('event', { at: new Date().toISOString(), type: 'dispatch:released', lease: nextLease });
    return nextLease;
  }

  async retryTask(taskId: string): Promise<TaskLease | null> {
    await this.releaseTask(taskId, 'retry requested');
    await this.tick(taskId);
    return this.leases.find(
      (entry) =>
        entry.taskId === taskId &&
        (entry.status === 'claimed' || entry.status === 'running' || entry.status === 'needs_attention')
    ) ?? null;
  }

  async ensureProjectBinding(
    projectUid: string,
    templateId: string,
    dispatchMode: ProjectRoleBinding['dispatchMode'] = 'autonomous'
  ): Promise<ProjectRoleBinding> {
    const vaultPath = this.requireVault();
    const bindings = await listProjectRoleBindings(vaultPath, projectUid);
    const existing = bindings.find((binding) => binding.templateId === templateId);
    if (existing) return existing;
    const versions = await listRoleTemplateVersions(templateId);
    const latest = versions.at(-1);
    if (!latest) throw new Error(`template version missing: ${templateId}`);
    return createProjectRoleBinding(vaultPath, projectUid, {
      id: '',
      projectUid,
      templateId,
      templateVersionId: latest.id,
      dispatchMode,
      health: 'healthy',
      createdAt: '',
      updatedAt: ''
    });
  }

  async tick(preferredTaskId?: string): Promise<void> {
    const vaultPath = this.requireVault();
    const sess = currentSession();
    if (!sess) return;
    const allTasks = materializeTaskGraph(sess.tasks.allTasks());
    const readyTasks = allTasks.filter((task) => {
      if (task.source !== 'file') return false;
      if (task.status !== 'todo') return false;
      if (task.execution_strategy !== 'autonomous') return false;
      if (task.owner_id) return false;
      if (preferredTaskId && task.id !== preferredTaskId) return false;
      return true;
    });
    for (const task of readyTasks) {
      await this.tryDispatchTask(vaultPath, task, allTasks);
    }
  }

  private requireVault(): string {
    if (!this.vaultPath) throw new Error('dispatch service not attached');
    return this.vaultPath;
  }

  private async availableBindings(task: TaskRecord): Promise<ProjectRoleBinding[]> {
    if (!task.project_uid || !this.vaultPath) return [];
    const [templates, bindings] = await Promise.all([
      listRoleTemplates(),
      listProjectRoleBindings(this.vaultPath, task.project_uid)
    ]);
    const byTemplateId = new Map<string, RoleTemplate>(templates.map((template) => [template.id, template]));
    return bindings.filter((binding) => {
      if (binding.dispatchMode !== 'autonomous') return false;
      if (binding.health === 'paused' || binding.health === 'blocked') return false;
      if (task.role_binding_id) return binding.id === task.role_binding_id;
      const template = byTemplateId.get(binding.templateId);
      if (task.recommended_role && template?.slug === task.recommended_role) return true;
      if (task.candidate_role_slugs?.length) {
        return task.candidate_role_slugs.includes(template?.slug ?? '');
      }
      return true;
    });
  }

  private chooseRuntime(binding: ProjectRoleBinding): RuntimeDescriptor | null {
    const runtimes = getLocalRuntimeManager()
      .list()
      .filter((runtime) => runtime.status === 'online' && runtime.capabilities.supportsBackgroundRuns);
    if (binding.runtimePreference) {
      return (
        runtimes.find(
          (runtime) =>
            runtime.runtimeId === binding.runtimePreference ||
            runtime.provider === binding.runtimePreference
        ) ?? null
      );
    }
    return runtimes[0] ?? null;
  }

  private async tryDispatchTask(
    vaultPath: string,
    task: TaskRecord,
    allTasks: TaskRecord[]
  ): Promise<void> {
    const currentLease = this.leases.find(
      (lease) => lease.taskId === task.id && lease.status !== 'completed' && lease.status !== 'released'
    );
    if (currentLease) return;
    const bindings = await this.availableBindings(task);
    const binding = bindings[0];
    if (!binding) return;
    const runtime = this.chooseRuntime(binding);
    if (!runtime) {
      await updateProjectRoleBinding(vaultPath, binding.projectUid, binding.id, { health: 'blocked' });
      return;
    }
    if (!task.filePath) return;
    const current = await readTaskFile(task.filePath);
    if (current.frontmatter['owner_id']) return;
    if ((current.frontmatter['status'] as string) !== 'todo') return;
    if (!arePreConditionsMet(task, buildTaskGraph(allTasks).byUid)) return;

    const leaseId = `lease-${nanoid(10)}`;
    await updateTaskFrontmatter(task.filePath, {
      status: 'doing',
      owner_type: 'binding',
      owner_id: binding.id,
      claimed_at: new Date().toISOString(),
      role_binding_id: binding.id
    });
    await refreshTaskFileInSession(task.filePath);

    const versions = await listRoleTemplateVersions(binding.templateId);
    const version = versions.find((entry) => entry.id === binding.templateVersionId);
    const instructions = [version?.instructions, binding.overlayInstructions].filter(Boolean).join('\n\n');
    const startResult = await startTask({
      taskId: task.id,
      instructions: instructions || undefined,
      runtimeId: runtime.runtimeId
    });
    if (startResult.kind !== 'ok') {
      await this.markDispatchFailure(task, binding, runtime, leaseId, startResult);
      return;
    }

    const report: ImplementationReport = {
      reportId: `report-${nanoid(10)}`,
      projectUid: task.project_uid,
      taskId: task.id,
      taskUid: task.uid,
      title: task.title,
      bindingId: binding.id,
      runtimeId: runtime.runtimeId,
      runId: startResult.runId,
      status: 'running',
      summary: `${binding.id} claimed ${task.title}`,
      direction: 'running',
      details: [`Runtime ${runtime.name} started run ${startResult.runId}.`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const lease: TaskLease = {
      leaseId,
      taskId: task.id,
      taskUid: task.uid,
      runtimeId: runtime.runtimeId,
      bindingId: binding.id,
      ownerType: 'binding',
      ownerId: binding.id,
      status: 'running',
      claimedAt: new Date().toISOString(),
      runId: startResult.runId,
      reportId: report.reportId
    };
    this.leases = [...this.leases, lease];
    this.reports = [...this.reports, report];
    await updateTaskFrontmatter(task.filePath, { active_run_id: startResult.runId });
    await refreshTaskFileInSession(task.filePath);
    if (task.uid) {
      await getOrCreateConversation(vaultPath, task);
      const segment = await startSegment(vaultPath, task.uid, {
        taskId: task.id,
        runId: startResult.runId,
        leaseId,
        bindingId: binding.id,
        trigger: 'dispatch',
        status: 'running'
      });
      await appendTurn(vaultPath, task.uid, {
        role: 'system',
        content: `🤖 ${binding.id} 认领了任务，开始执行...`,
        segmentId: segment.id
      });
    }
    await persistLeases(vaultPath, this.leases);
    await persistReports(vaultPath, this.reports);
    this.emit('event', {
      at: new Date().toISOString(),
      type: 'dispatch:running',
      lease,
      report
    });
  }

  private async markDispatchFailure(
    task: TaskRecord,
    binding: ProjectRoleBinding,
    runtime: RuntimeDescriptor,
    leaseId: string,
    result: StartError
  ): Promise<void> {
    const vaultPath = this.requireVault();
    const report: ImplementationReport = {
      reportId: `report-${nanoid(10)}`,
      projectUid: task.project_uid,
      taskId: task.id,
      taskUid: task.uid,
      title: task.title,
      bindingId: binding.id,
      runtimeId: runtime.runtimeId,
      status: 'failed',
      summary: result.message,
      direction: 'needs attention',
      details: [result.message],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    const lease: TaskLease = {
      leaseId,
      taskId: task.id,
      taskUid: task.uid,
      runtimeId: runtime.runtimeId,
      bindingId: binding.id,
      ownerType: 'binding',
      ownerId: binding.id,
      status: 'failed',
      claimedAt: new Date().toISOString(),
      failureReason: result.message,
      reportId: report.reportId
    };
    this.leases = [...this.leases, lease];
    this.reports = [...this.reports, report];
    if (task.uid) {
      await getOrCreateConversation(vaultPath, task);
      const segment = await startSegment(vaultPath, task.uid, {
        taskId: task.id,
        runId: '',
        leaseId,
        bindingId: binding.id,
        trigger: 'dispatch',
        status: 'failed'
      });
      await appendTurn(vaultPath, task.uid, {
        role: 'system',
        content: `❌ ${binding.id} 执行启动失败: ${result.message}`,
        segmentId: segment.id
      });
    }
    await updateProjectRoleBinding(vaultPath, binding.projectUid, binding.id, {
      health: 'degraded'
    });
    await persistLeases(vaultPath, this.leases);
    await persistReports(vaultPath, this.reports);
    this.emit('event', {
      at: new Date().toISOString(),
      type: 'dispatch:failed',
      lease,
      report
    });
  }

  private async handlePoolEvent(event: PoolEvent): Promise<void> {
    if (!this.vaultPath) return;
    if (event.event.kind !== 'done' && event.event.kind !== 'error') return;
    const snapshot = getPool().get(event.runId)?.snapshot();
    // Ignore intermediate stderr warnings — only act when the process has
    // actually reached a terminal status (done/error/killed).
    if (snapshot && snapshot.summary.status === 'running') return;
    const timeline = summarizeEvents(snapshot?.events ?? [event.event]);
    const wasKilled = snapshot?.summary.status === 'killed';
    const lease = this.leases.find(
      (entry) => entry.runId === event.runId && entry.status === 'running'
    );
    if (!lease) return;
    const task = currentSession()?.tasks.allTasks().find((entry) => entry.id === lease.taskId);
    if (!task || task.source !== 'file') return;
    const taskFile = await readTaskFile(task.filePath);
    const completion = classifyDispatchCompletion({
      processOutcome: wasKilled ? 'cancelled' : event.event.kind,
      taskStatus: normalizeTaskStatus(taskFile.frontmatter['status']),
      blockedReason: asOptionalString(taskFile.frontmatter['blocked_reason']),
      summary: timeline.summary
    });
    await recordRunCompletion(this.vaultPath, event.runId, {
      status: completion.segmentStatus,
      summary: timeline.summary,
      events: snapshot?.events ?? [event.event]
    });
    const completedAt = new Date().toISOString();
    const nextLease: TaskLease = {
      ...lease,
      status: completion.leaseStatus,
      failureReason:
        completion.leaseStatus === 'completed' ? undefined : event.event.text ?? timeline.summary
    };
    const report = this.reports.find((entry) => entry.reportId === lease.reportId);
    const nextReport: ImplementationReport = {
      reportId: report?.reportId ?? `report-${nanoid(10)}`,
      projectUid: task.project_uid,
      taskId: task.id,
      taskUid: task.uid,
      title: task.title,
      bindingId: lease.bindingId,
      runtimeId: lease.runtimeId,
      runId: event.runId,
      status: completion.reportStatus,
      summary: timeline.summary,
      direction: completion.direction,
      details: timeline.details,
      createdAt: report?.createdAt ?? completedAt,
      updatedAt: completedAt,
      completedAt
    };
    this.leases = this.leases.map((entry) => (entry.leaseId === lease.leaseId ? nextLease : entry));
    this.reports = [...this.reports.filter((entry) => entry.reportId !== nextReport.reportId), nextReport];
    await updateTaskFrontmatter(task.filePath, {
      status: completion.taskStatus,
      active_run_id: undefined,
      blocked_reason: completion.blockedReason
    });
    await refreshTaskFileInSession(task.filePath);
    if (completion.leaseStatus === 'needs_attention') {
      await this.eventBridge.dispatchNeedsAttention({
        vaultPath: this.vaultPath,
        task,
        runId: event.runId,
        summary: completion.blockedReason ?? timeline.summary,
        failed: completion.segmentStatus === 'failed'
      });
    }
    if (lease.bindingId && task.project_uid) {
      await updateProjectRoleBinding(this.vaultPath, task.project_uid, lease.bindingId, {
        health: completion.bindingHealth
      });
    }
    await persistLeases(this.vaultPath, this.leases);
    await persistReports(this.vaultPath, this.reports);
    this.emit('event', {
      at: completedAt,
      type: completion.eventType,
      lease: nextLease,
      report: nextReport
    });
  }
}

let singleton: DispatchService | null = null;

export function getDispatchService(): DispatchService {
  if (!singleton) singleton = new DispatchService();
  return singleton;
}

export async function listBindingReportsForProject(
  vaultPath: string,
  projectUid: string,
  bindingId: string
): Promise<ImplementationReport[]> {
  return listBindingReports(vaultPath, projectUid, bindingId);
}
