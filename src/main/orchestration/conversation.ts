import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { AgentEvent } from '@shared/agent';
import type { AgentSessionStatus, ConversationTurn, RunSegment, TaskConversation } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { sendAgentMessage, startTask } from '../agent/ipc';
import { refreshTaskFileInSession } from './session';
import { readJsonFile, taskConversationFile, writeJsonFile } from './storage';
import { readTaskFile, updateTaskFrontmatter } from '../task';
import type { TaskStatus } from '@shared/schemas';
import { extractVendorSessionIdFromAgentEvents } from '../agent/adapter/compat';

type NewTurn = Omit<ConversationTurn, 'id' | 'createdAt'>;
type NewSegment = Omit<RunSegment, 'id' | 'startedAt'>;

export const conversationEvents = new EventEmitter();

function normalizeTaskStatus(value: unknown): TaskStatus | null {
  return value === 'backlog' ||
    value === 'waiting' ||
    value === 'todo' ||
    value === 'doing' ||
    value === 'blocked' ||
    value === 'done'
    ? value
    : null;
}

function defaultIncompleteSummary(taskStatus: TaskStatus | null): string {
  if (taskStatus === 'waiting') return '任务仍在等待补充信息。';
  if (taskStatus === 'blocked') return '任务仍被阻塞，尚未标记完成。';
  return 'Run exited before the task was marked done.';
}

export function resolveConversationCompletion(args: {
  resultStatus: RunSegment['status'];
  taskStatus: TaskStatus | null;
  blockedReason?: string;
  summary: string;
}): { status: RunSegment['status']; sessionStatus: AgentSessionStatus; summary: string } {
  const summary = args.summary.trim();
  if (args.taskStatus === 'done') {
    return {
      status: args.resultStatus,
      sessionStatus: args.resultStatus === 'failed' ? 'failed_terminal' : 'completed',
      summary: summary || 'Task marked done.'
    };
  }
  if (args.resultStatus !== 'completed' && args.resultStatus !== 'needs_attention') {
    return {
      status: args.resultStatus,
      sessionStatus: args.resultStatus === 'cancelled' ? 'failed_retryable' : 'failed_terminal',
      summary: summary || defaultIncompleteSummary(args.taskStatus)
    };
  }
  return {
    status: 'needs_attention',
    sessionStatus: 'awaiting_user',
    summary:
      args.blockedReason ||
      (summary && summary !== 'exit 0' ? summary : defaultIncompleteSummary(args.taskStatus))
  };
}

export async function getConversation(
  vaultPath: string,
  taskUid: string
): Promise<TaskConversation | null> {
  return readJsonFile<TaskConversation | null>(taskConversationFile(vaultPath, taskUid), null);
}

export async function getOrCreateConversation(
  vaultPath: string,
  task: Pick<TaskRecord, 'id' | 'uid' | 'project_uid'>
): Promise<TaskConversation> {
  if (!task.uid) throw new Error('task uid required for conversation');
  const existing = await getConversation(vaultPath, task.uid);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created: TaskConversation = {
    taskId: task.id,
    taskUid: task.uid,
    projectUid: task.project_uid,
    segments: [],
    turns: [],
    createdAt: now,
    updatedAt: now
  };
  await writeJsonFile(taskConversationFile(vaultPath, task.uid), created);
  return created;
}

export async function appendTurn(
  vaultPath: string,
  taskUid: string,
  turn: NewTurn
): Promise<ConversationTurn> {
  const nextTurn: ConversationTurn = {
    ...turn,
    id: nanoid(12),
    createdAt: new Date().toISOString()
  };
  let taskId = '';
  await updateConversation(vaultPath, taskUid, (conversation) => {
    taskId = conversation.taskId;
    return {
      ...conversation,
      turns: [...conversation.turns, nextTurn],
      updatedAt: nextTurn.createdAt
    };
  });
  conversationEvents.emit('turn', { taskId, turn: nextTurn });
  return nextTurn;
}

export async function startSegment(
  vaultPath: string,
  taskUid: string,
  segment: NewSegment
): Promise<RunSegment> {
  const nextSegment: RunSegment = {
    ...segment,
    sessionStatus: segment.sessionStatus ?? (segment.status === 'running' ? 'running' : 'idle'),
    id: nanoid(12),
    startedAt: new Date().toISOString()
  };
  await updateConversation(vaultPath, taskUid, (conversation) => ({
    ...conversation,
    segments: [...conversation.segments, nextSegment],
    updatedAt: new Date().toISOString()
  }));
  return nextSegment;
}

export async function bindSegmentRunId(
  vaultPath: string,
  taskUid: string,
  segmentId: string,
  runId: string
): Promise<void> {
  await updateConversation(vaultPath, taskUid, (conversation) => ({
    ...conversation,
    segments: conversation.segments.map((segment) =>
      segment.id === segmentId ? { ...segment, runId } : segment
    ),
    updatedAt: new Date().toISOString()
  }));
}

export function getLatestVendorSessionId(
  conversation: Pick<TaskConversation, 'segments'>
): string | undefined {
  for (let i = conversation.segments.length - 1; i >= 0; i -= 1) {
    const segment = conversation.segments[i];
    if (!segment || segment.status === 'cancelled') continue;
    if (segment.vendorSessionId?.trim()) return segment.vendorSessionId.trim();
  }
  return undefined;
}

export function getLatestResumableSegment(
  conversation: Pick<TaskConversation, 'segments'>
): RunSegment | undefined {
  for (let i = conversation.segments.length - 1; i >= 0; i -= 1) {
    const segment = conversation.segments[i];
    if (!segment || segment.status === 'cancelled') continue;
    return segment;
  }
  return undefined;
}

export function resolveFollowupSegment(
  task: Pick<TaskRecord, 'id' | 'owner_type' | 'owner_id' | 'role_binding_id'>,
  conversation: Pick<TaskConversation, 'segments'>
): Pick<
  RunSegment,
  'taskId' | 'trigger' | 'status' | 'sessionStatus' | 'bindingId' | 'vendorSessionId' | 'runId'
> {
  const latestSegment = getLatestResumableSegment(conversation);
  const roleBindingId = task.role_binding_id?.trim() || undefined;
  const ownerBindingId =
    task.owner_type === 'binding' ? task.owner_id?.trim() || undefined : undefined;
  const bindingId =
    roleBindingId ??
    ownerBindingId ??
    (task.owner_type === 'binding' ? latestSegment?.bindingId : undefined);
  const vendorSessionId = latestSegment?.vendorSessionId?.trim() || undefined;

  return {
    taskId: task.id,
    runId: '',
    trigger: bindingId ? 'dispatch' : 'manual',
    status: 'running',
    sessionStatus: 'running',
    ...(bindingId ? { bindingId } : {}),
    ...(vendorSessionId ? { vendorSessionId } : {})
  };
}

export async function completeSegment(
  vaultPath: string,
  taskUid: string,
  segmentId: string,
  result: {
    status: RunSegment['status'];
    sessionStatus?: AgentSessionStatus;
    summary?: string;
    vendorSessionId?: string;
  }
): Promise<void> {
  const endedAt = new Date().toISOString();
  await updateConversation(vaultPath, taskUid, (conversation) => ({
    ...conversation,
    segments: conversation.segments.map((segment) =>
      segment.id === segmentId
        ? {
            ...segment,
            status: result.status,
            sessionStatus: result.sessionStatus ?? segment.sessionStatus,
            summary: result.summary,
            ...(result.vendorSessionId ? { vendorSessionId: result.vendorSessionId } : {}),
            endedAt
          }
        : segment
    ),
    updatedAt: endedAt
  }));
}

export async function sendAndRun(
  vaultPath: string,
  task: TaskRecord,
  message: string
): Promise<{ turnId: string; runId: string; segmentId: string }> {
  if (!task.uid || task.source !== 'file') throw new Error('task conversation requires a file-backed task');
  const conversation = await getOrCreateConversation(vaultPath, task);
  const userTurn = await appendTurn(vaultPath, task.uid, {
    role: 'user',
    content: message
  });
  const runningSegment = conversation.segments.find(
    (segment) => segment.status === 'running' && segment.runId === task.active_run_id
  );
  if (task.active_run_id && runningSegment) {
    const sent = sendAgentMessage(task.active_run_id, message);
    if (sent.accepted) {
      return { turnId: userTurn.id, runId: task.active_run_id, segmentId: runningSegment.id };
    }
  }
  const followupSegment = resolveFollowupSegment(task, conversation);
  const segment = await startSegment(vaultPath, task.uid, followupSegment);
  await appendTurn(vaultPath, task.uid, {
    role: 'system',
    content: '⏳ 正在执行...',
    segmentId: segment.id
  });

  const result = await startTask({
    taskId: task.id,
    instructions: message,
    vendorSessionId: followupSegment.vendorSessionId
  });

  if (result.kind !== 'ok') {
    await completeSegment(vaultPath, task.uid, segment.id, {
      status: 'failed',
      summary: result.message
    });
    await appendTurn(vaultPath, task.uid, {
      role: 'system',
      content: `❌ 执行失败: ${result.message}`,
      segmentId: segment.id
    });
    return { turnId: userTurn.id, runId: '', segmentId: segment.id };
  }

  await bindSegmentRunId(vaultPath, task.uid, segment.id, result.runId);
  await updateTaskFrontmatter(task.filePath, { active_run_id: result.runId });
  await refreshTaskFileInSession(task.filePath);
  return { turnId: userTurn.id, runId: result.runId, segmentId: segment.id };
}

export async function recordRunCompletion(
  vaultPath: string,
  runId: string,
  result: {
    status: RunSegment['status'];
    summary: string;
    events: AgentEvent[];
  }
): Promise<void> {
  const match = await findSegmentByRunId(vaultPath, runId);
  if (!match) return;
  const task = currentSession()?.tasks.allTasks().find((entry) => entry.id === match.taskId);
  const taskFile =
    task && task.source === 'file' ? await readTaskFile(task.filePath).catch(() => null) : null;
  const completion = resolveConversationCompletion({
    resultStatus: result.status,
    taskStatus: normalizeTaskStatus(taskFile?.frontmatter['status']),
    blockedReason:
      typeof taskFile?.frontmatter['blocked_reason'] === 'string'
        ? taskFile.frontmatter['blocked_reason']
        : undefined,
    summary: result.summary
  });
  const assistantContent = result.events
    .filter((event) => event.kind === 'message' || event.kind === 'text')
    .map((event) => event.text?.trim())
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
  if (assistantContent) {
    await appendTurn(vaultPath, match.taskUid, {
      role: 'assistant',
      content: assistantContent,
      segmentId: match.segment.id
    });
  }
  const prefix =
    completion.status === 'completed'
      ? '✅ 执行完成'
      : completion.status === 'cancelled'
        ? '⚫ 执行已停止'
        : completion.status === 'needs_attention'
          ? '🟡 等待补充信息'
          : '❌ 执行失败';
  await appendTurn(vaultPath, match.taskUid, {
    role: 'system',
    content: `${prefix}: ${completion.summary}`,
    segmentId: match.segment.id
  });
  await completeSegment(vaultPath, match.taskUid, match.segment.id, {
      status: completion.status,
      sessionStatus: completion.sessionStatus,
      summary: completion.summary,
    vendorSessionId: extractVendorSessionIdFromAgentEvents(result.events)
  });
  await clearActiveRunId(match.taskId, runId);
}

export async function appendReleaseTurn(
  vaultPath: string,
  task: TaskRecord,
  reason?: string
): Promise<void> {
  if (!task.uid) return;
  const conversation = await getConversation(vaultPath, task.uid);
  if (!conversation) return;
  await appendTurn(vaultPath, task.uid, {
    role: 'system',
    content: reason ? `🔄 任务已释放: ${reason}` : '🔄 任务已释放'
  });
}

async function updateConversation(
  vaultPath: string,
  taskUid: string,
  mutator: (conversation: TaskConversation) => TaskConversation
): Promise<TaskConversation> {
  const filePath = taskConversationFile(vaultPath, taskUid);
  const current =
    (await readJsonFile<TaskConversation | null>(filePath, null)) ??
    ((): TaskConversation => {
      throw new Error(`conversation not found for task uid ${taskUid}`);
    })();
  const next = mutator(current);
  await writeJsonFile(filePath, next);
  return next;
}

async function findSegmentByRunId(
  vaultPath: string,
  runId: string
): Promise<{ taskUid: string; taskId: string; segment: RunSegment } | null> {
  const sess = currentSession();
  if (!sess) return null;
  for (const task of sess.tasks.allTasks()) {
    if (!task.uid) continue;
    const conversation = await getConversation(vaultPath, task.uid);
    const segment = conversation?.segments.find(
      (entry) => entry.runId === runId && entry.status === 'running'
    );
    if (segment && conversation) {
      return { taskUid: conversation.taskUid, taskId: conversation.taskId, segment };
    }
  }
  return null;
}

async function clearActiveRunId(taskId: string, runId: string): Promise<void> {
  const sess = currentSession();
  const task = sess?.tasks.allTasks().find((entry) => entry.id === taskId);
  if (!task || task.source !== 'file' || task.active_run_id !== runId) return;
  await updateTaskFrontmatter(task.filePath, { active_run_id: undefined });
  await refreshTaskFileInSession(task.filePath);
}
