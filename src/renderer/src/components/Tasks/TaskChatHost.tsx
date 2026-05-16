/**
 * TaskChatHost
 *
 * 业务 host：把 Task 维度的 TaskConversation + 实时 AgentEvent 流
 * 适配为 RuntimeEvent[]，再交给业务无关的 ChatView 渲染。
 *
 * 该 host 仅负责：
 *   - 拉取 / 订阅 conversation
 *   - 维护 input 状态
 *   - 把 ChatAction 转译为现有 IPC 调用（send / switchRuntime）
 *
 * Chat 视觉与 ChatAction 协议保持业务无关。
 */

import { useEffect, useMemo } from 'react';
import type { TaskRecord } from '@shared/schemas';
import type { RuntimeDescriptor } from '@shared/orchestration';
import { useState } from 'react';
import { ChatView } from '../chat/ChatView';
import type { ChatAction, ChatHostCapabilities } from '@shared/chat-protocol';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import { useTaskConversation } from '../../store/taskConversation';
import { useAgent } from '../../store/agent';
import {
  buildRuntimeEventsFromConversation,
  pickRunningSegments
} from './agentEventToRuntime';

interface TaskChatHostProps {
  task: TaskRecord;
}

export function TaskChatHost({ task }: TaskChatHostProps): JSX.Element {
  const init = useTaskConversation((s) => s.init);
  const load = useTaskConversation((s) => s.load);
  const send = useTaskConversation((s) => s.send);
  const conversation = useTaskConversation((s) => s.conversations[task.id]);
  const loading = useTaskConversation((s) => s.loading[task.id] ?? false);
  const sending = useTaskConversation((s) => s.sending[task.id] ?? false);
  const runs = useAgent((s) => s.runs);

  const [runtimes, setRuntimes] = useState<RuntimeDescriptor[]>([]);
  const [runtimeId, setRuntimeId] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    init();
    void load(task.id);
  }, [init, load, task.id]);

  useEffect(() => {
    void window.orbit.runtime.list().then((items) => {
      setRuntimes(items);
      setRuntimeId((cur) => cur || items[0]?.runtimeId || '');
    });
  }, []);

  const runningSegments = useMemo(
    () => pickRunningSegments(conversation ?? null),
    [conversation]
  );

  const events = useMemo(() => {
    if (!conversation) return [];
    const live = runningSegments
      .filter((segment): segment is typeof segment & { runId: string } => Boolean(segment.runId))
      .map((segment) => ({
        runId: segment.runId,
        events: runs[segment.runId]?.events ?? []
      }));
    return buildRuntimeEventsFromConversation(conversation, live);
  }, [conversation, runningSegments, runs]);

  const capabilities: ChatHostCapabilities = {
    ...DEFAULT_CHAT_HOST_CAPABILITIES,
    canSendMessage: !sending,
    canStop: runningSegments.length > 0
  };

  if (task.source !== 'file') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-500">
        行内任务没有持久任务对话。
      </div>
    );
  }

  async function onAction(action: ChatAction): Promise<void> {
    if (action.kind === 'chat.send_message') {
      const payload = action.payload as { text: string };
      await send(task.id, payload.text);
    } else if (action.kind === 'chat.stop') {
      const seg = runningSegments[0];
      if (seg?.runId) await window.orbit.agent.stop(seg.runId).catch(() => undefined);
    }
  }

  async function handleSwitchRuntime(): Promise<void> {
    if (!task.uid || !runtimeId || switching) return;
    setSwitching(true);
    try {
      await window.orbit.conversation.switchRuntime(task.uid, runtimeId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800">
        <span className="font-medium text-neutral-600 dark:text-neutral-300">Runtime</span>
        <div className="flex items-center gap-2">
          <select
            value={runtimeId}
            onChange={(event) => setRuntimeId(event.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {runtimes.map((runtime) => (
              <option key={runtime.runtimeId} value={runtime.runtimeId}>
                {runtime.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleSwitchRuntime()}
            disabled={!task.uid || !runtimeId || switching}
            className="rounded bg-neutral-900 px-2 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
             {switching ? '切换中…' : '切换 Runtime'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ChatView
          conversationId={task.id}
          capabilities={capabilities}
          events={events}
          isLoading={loading && !conversation}
          onAction={(action) => void onAction(action)}
          welcomeMessage={`暂无任务对话。发送消息即可启动「${task.title}」。`}
        />
      </div>
    </div>
  );
}
