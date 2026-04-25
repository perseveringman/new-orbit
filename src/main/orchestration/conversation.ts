import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { AgentEvent } from '@shared/agent';
import type { ConversationTurn, RunSegment, TaskConversation } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { startTask } from '../agent/ipc';
import { refreshTaskFileInSession } from './session';
import { readJsonFile, taskConversationFile, writeJsonFile } from './storage';
import { updateTaskFrontmatter } from '../task';

type NewTurn = Omit<ConversationTurn, 'id' | 'createdAt'>;
type NewSegment = Omit<RunSegment, 'id' | 'startedAt'>;

export const conversationEvents = new EventEmitter();

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

export async function completeSegment(
  vaultPath: string,
  taskUid: string,
  segmentId: string,
  result: { status: RunSegment['status']; summary?: string; vendorSessionId?: string }
): Promise<void> {
  const endedAt = new Date().toISOString();
  await updateConversation(vaultPath, taskUid, (conversation) => ({
    ...conversation,
    segments: conversation.segments.map((segment) =>
      segment.id === segmentId
        ? {
            ...segment,
            status: result.status,
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
  await getOrCreateConversation(vaultPath, task);
  const userTurn = await appendTurn(vaultPath, task.uid, {
    role: 'user',
    content: message
  });
  const segment = await startSegment(vaultPath, task.uid, {
    taskId: task.id,
    runId: '',
    trigger: 'manual',
    status: 'running'
  });
  await appendTurn(vaultPath, task.uid, {
    role: 'system',
    content: '⏳ 正在执行...',
    segmentId: segment.id
  });

  const result = await startTask({
    taskId: task.id,
    instructions: message
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
    result.status === 'completed'
      ? '✅ 执行完成'
      : result.status === 'cancelled'
        ? '⚫ 执行已停止'
        : '❌ 执行失败';
  await appendTurn(vaultPath, match.taskUid, {
    role: 'system',
    content: `${prefix}: ${result.summary}`,
    segmentId: match.segment.id
  });
  await completeSegment(vaultPath, match.taskUid, match.segment.id, {
    status: result.status,
    summary: result.summary
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
