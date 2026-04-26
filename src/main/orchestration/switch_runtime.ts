import { createUnifiedAgentEvent, type UnifiedAgentEvent } from '@shared/agent-event';
import type { RuntimeDescriptor, RunSegment } from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { getPool } from '../agent/pool';
import { startTask } from '../agent/ipc';
import { createRuntimeAdapter } from '../agent/adapter/registry';
import { currentSession } from '../fs';
import { updateTaskFrontmatter } from '../task';
import { getConversation, startSegment } from './conversation';
import { getLocalRuntimeManager } from './runtime';
import { refreshTaskFileInSession } from './session';

export interface TranscriptInjectionPlan {
  strategy: 'full' | 'summary';
  tokenEstimate: number;
  contextWindow: number;
  injectedText: string;
}

export interface SwitchRuntimeResult {
  taskUid: string;
  runtimeId: string;
  runId: string;
  segmentId?: string;
  injection: TranscriptInjectionPlan;
}

export function estimateTranscriptTokens(events: readonly UnifiedAgentEvent[]): number {
  const chars = events.reduce((sum, event) => sum + (event.text?.length ?? 0), 0);
  return Math.ceil(chars * 0.3);
}

function contextWindowFor(runtime: RuntimeDescriptor): number {
  return runtime.capabilities.supportsLongContext ? 200_000 : 32_000;
}

function formatTranscript(events: readonly UnifiedAgentEvent[]): string {
  return events
    .map((event) => `[${event.at}] ${event.runtime.provider}/${event.kind}: ${event.text ?? ''}`.trim())
    .filter(Boolean)
    .join('\n');
}

export function summarizeUnifiedTranscript(events: readonly UnifiedAgentEvent[]): string {
  const textEvents = events.filter((event) => event.text?.trim());
  const head = textEvents.slice(0, 8).map((event) => event.text?.trim());
  const tail = textEvents.slice(-12).map((event) => event.text?.trim());
  return [...head, '...', ...tail].filter(Boolean).join('\n');
}

export function buildContinuationPrompt(args: {
  task: Pick<TaskRecord, 'uid' | 'title'>;
  previousRuntime: string;
  previousSessionId?: string;
  injectedText: string;
  strategy: TranscriptInjectionPlan['strategy'];
}): string {
  return `# 接手协议

你正在接手 task: ${args.task.title}${args.task.uid ? ` (uid: ${args.task.uid})` : ''}，
此前曾由 ${args.previousRuntime}${args.previousSessionId ? `（session: ${args.previousSessionId.slice(0, 12)}）` : ''} 处理。

## 已发生的进展

${args.injectedText}

## 你的第一步

1. **不要从零开始**——上一个 agent 的进展是有效的
2. 用 \`orbit task transcript ${args.task.uid ?? '<uid>'}\` 可随时取完整对话历史
3. 在你的第一条回复中**必须**说明：
   > 接手分析：
   > - 上一段已完成的部分：…
   > - 上一段未解决的问题：…
   > - 我打算从哪里开始：…
4. 然后继续执行（仍受启动协议第二阶段约束）。

注入策略：${args.strategy}`;
}

async function transcriptFromSegment(
  segment: RunSegment,
  runtime: RuntimeDescriptor | null
): Promise<UnifiedAgentEvent[] | null> {
  if (!runtime || !segment.vendorSessionId) return null;
  const adapter = createRuntimeAdapter(runtime);
  if (!adapter) return null;
  return adapter.getSessionTranscript(segment.vendorSessionId);
}

function transcriptFromConversationTurns(task: TaskRecord, segment: RunSegment): UnifiedAgentEvent[] {
  return [
    createUnifiedAgentEvent(
      'message',
      {
        runId: segment.runId || segment.id,
        taskId: task.id,
        runtime: { provider: 'claude', runtimeId: segment.bindingId }
      },
      {
        id: `${segment.id}:fallback`,
        spanId: `${segment.id}:fallback`,
        at: segment.startedAt,
        text: segment.summary ?? ''
      }
    )
  ];
}

export async function collectTaskTranscript(vaultPath: string, task: TaskRecord): Promise<UnifiedAgentEvent[]> {
  if (!task.uid) return [];
  const conversation = await getConversation(vaultPath, task.uid);
  if (!conversation) return [];
  const runtimes = getLocalRuntimeManager().list();
  const events: UnifiedAgentEvent[] = [];
  for (const segment of [...conversation.segments].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const runtime = runtimes.find((entry) => entry.runtimeId === segment.runtimeId) ?? null;
    const transcript = await transcriptFromSegment(segment, runtime);
    events.push(...(transcript ?? transcriptFromConversationTurns(task, segment)));
  }
  return events;
}

export async function switchTaskRuntime(taskUid: string, runtimeId: string): Promise<SwitchRuntimeResult> {
  const sess = currentSession();
  if (!sess) throw new Error('No Orbit vault is open.');
  const task = sess.tasks.allTasks().find((entry) => entry.uid === taskUid || entry.id === taskUid);
  if (!task || task.source !== 'file') throw new Error(`task not found: ${taskUid}`);
  const runtime = getLocalRuntimeManager().get(runtimeId);
  if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`);

  if (task.active_run_id) {
    await getPool().kill(task.active_run_id, 'switch_runtime');
  }

  const transcript = await collectTaskTranscript(sess.vault, task);
  const contextWindow = contextWindowFor(runtime);
  const tokenEstimate = estimateTranscriptTokens(transcript);
  const strategy = tokenEstimate < contextWindow * 0.5 ? 'full' : 'summary';
  const injectedText =
    strategy === 'full'
      ? formatTranscript(transcript)
      : `Progress summary:\n${summarizeUnifiedTranscript(transcript)}\n\nFull transcript is available through \`orbit task transcript ${task.uid ?? taskUid}\`.`;
  const previous = transcript.at(-1);
  const prompt = buildContinuationPrompt({
    task,
    previousRuntime: previous?.runtime.name ?? previous?.runtime.provider ?? 'unknown runtime',
    previousSessionId: previous?.vendorSessionId,
    injectedText,
    strategy
  });
  const result = await startTask({ taskId: task.id, runtimeId, instructions: prompt });
  if (result.kind !== 'ok') throw new Error(result.message);
  await updateTaskFrontmatter(task.filePath, { active_run_id: result.runId }, () =>
    refreshTaskFileInSession(task.filePath)
  );
  let segmentId: string | undefined;
  if (task.uid) {
    const segment = await startSegment(sess.vault, task.uid, {
      taskId: task.id,
      runId: result.runId,
      trigger: 'manual',
      runtimeId,
      status: 'running',
      sessionStatus: 'running'
    });
    segmentId = segment.id;
  }
  return {
    taskUid: task.uid ?? taskUid,
    runtimeId,
    runId: result.runId,
    segmentId,
    injection: { strategy, tokenEstimate, contextWindow, injectedText }
  };
}
