import { promises as fs } from 'node:fs';
import type { ActivityEventInput } from '../activity';
import { emitActivity } from '../activity';
import { createInboxServiceForVault, type InboxService } from '../inbox';
import { updateTaskFrontmatter } from '../task';
import type { TaskRecord } from '@shared/schemas';
import { dependentTasksOf } from './graph';
import * as frontmatter from '../frontmatter';

export type DependencyUnavailableReason = 'deleted' | 'archived';

export interface DependencyUnavailableInput {
  vaultPath: string;
  dependencyUid: string;
  dependencyTitle?: string;
  reason: DependencyUnavailableReason;
  tasks: readonly TaskRecord[];
  inbox?: InboxService;
  emitActivity?: (input: ActivityEventInput) => unknown;
  refreshTask?: (absPath: string, next: string) => void | Promise<void>;
}

export interface DependencyCascadeResult {
  dependencyUid: string;
  reason: DependencyUnavailableReason;
  blockedTaskUids: string[];
  runningTaskUids: string[];
  inboxItemIds: string[];
}

function isNonRunningAffected(task: TaskRecord): boolean {
  return task.status !== 'doing' && task.status !== 'done';
}

function blockedReason(dependencyUid: string, reason: DependencyUnavailableReason): string {
  return `Dependency ${dependencyUid} was ${reason}; review this task's depends_on list.`;
}

export async function cascadeDependencyUnavailable(
  input: DependencyUnavailableInput
): Promise<DependencyCascadeResult> {
  const inbox = input.inbox ?? createInboxServiceForVault(input.vaultPath);
  const activity = input.emitActivity ?? emitActivity;
  const dependencyTitle = input.dependencyTitle ?? input.dependencyUid;
  const affected = dependentTasksOf(input.dependencyUid, input.tasks);
  const blockedTaskUids: string[] = [];
  const runningTaskUids: string[] = [];
  const inboxItemIds: string[] = [];

  for (const task of affected) {
    if (!task.uid) continue;
    if (isNonRunningAffected(task)) {
      await updateTaskFrontmatter(
        task.filePath,
        {
          status: 'blocked',
          blocked_reason: blockedReason(input.dependencyUid, input.reason)
        },
        input.refreshTask
          ? (next) => input.refreshTask?.(task.filePath, next)
          : undefined
      );
      blockedTaskUids.push(task.uid);
      activity({
        actor: 'system',
        action: 'task.dependency_changed',
        context: {
          task_uid: task.uid,
          ...(task.project_uid ? { project_uid: task.project_uid } : {})
        },
        payload: {
          dependency_uid: input.dependencyUid,
          dependency_title: dependencyTitle,
          reason: input.reason,
          status: 'blocked'
        },
        summary: `Task blocked because dependency ${dependencyTitle} was ${input.reason}`
      });
    } else if (task.status === 'doing') {
      runningTaskUids.push(task.uid);
      activity({
        actor: 'system',
        action: 'task.dependency_changed',
        context: {
          task_uid: task.uid,
          ...(task.project_uid ? { project_uid: task.project_uid } : {})
        },
        payload: {
          dependency_uid: input.dependencyUid,
          dependency_title: dependencyTitle,
          reason: input.reason,
          status: 'running_not_interrupted'
        },
        summary: `Running task still depends on ${dependencyTitle}, which was ${input.reason}`
      });
    }

    const item = await inbox.emitMessage({
      subtype: 'C1',
      title: `Dependency ${input.reason}: ${dependencyTitle}`,
      summary: `${task.title} depends on ${dependencyTitle}, which was ${input.reason}.`,
      context: {
        task_uid: task.uid,
        ...(task.project_uid ? { project_uid: task.project_uid } : {})
      },
      payload: {
        warning: 'dependency_unavailable',
        dependency_uid: input.dependencyUid,
        dependency_title: dependencyTitle,
        reason: input.reason,
        affected_task_uid: task.uid,
        affected_task_title: task.title
      },
      actor: 'system'
    });
    inboxItemIds.push(item.id);
  }

  return {
    dependencyUid: input.dependencyUid,
    reason: input.reason,
    blockedTaskUids,
    runningTaskUids,
    inboxItemIds
  };
}

export async function readTaskIdentity(
  absPath: string
): Promise<{ uid: string; title: string } | null> {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    const parsed = frontmatter.read(raw).data;
    const uid = typeof parsed['uid'] === 'string' ? parsed['uid'] : '';
    if (!uid) return null;
    return {
      uid,
      title: typeof parsed['title'] === 'string' ? parsed['title'] : uid
    };
  } catch {
    return null;
  }
}
