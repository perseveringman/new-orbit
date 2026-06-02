import type { Conversation } from '@shared/conversation';
import type { RuntimeEvent } from '@shared/chat-protocol';
import { askContextLaneLabel, askIntentRouteLabel } from '@shared/ask-runtime';

export function RuntimeStatusBar({
  conversation,
  events,
  isLoading
}: {
  conversation: Conversation | null;
  events: RuntimeEvent[];
  isLoading: boolean;
}): JSX.Element {
  const status = deriveRuntimeStatus(events, isLoading);
  return (
    <div className="flex min-h-[30px] items-center gap-2 border-b border-neutral-200 bg-white/70 px-3 py-1 text-[11px] text-neutral-500 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/50">
      <span className={statusDotClassName(status.tone)} />
      <span className="font-medium text-neutral-700 dark:text-neutral-200">{status.label}</span>
      {status.detail ? (
        <>
          <span>·</span>
          <span className="truncate">{status.detail}</span>
        </>
      ) : null}
      <span>·</span>
      <span>{conversation?.runtimeHint ?? '自动 Runtime'}</span>
      {conversation?.scope ? (
        <>
          <span>·</span>
          <span>{conversation.scope.kind}</span>
        </>
      ) : null}
    </div>
  );
}

type RuntimeStatusTone = 'idle' | 'active' | 'success' | 'warning' | 'danger';

function isPrimaryStatusEvent(event: RuntimeEvent, isLoading: boolean): boolean {
  if (
    ![
      'runtime.error',
      'runtime.interrupt',
      'runtime.done',
      'runtime.message',
      'runtime.tool_use',
      'runtime.context',
      'runtime.route_escalation',
      'runtime.route',
      'runtime.phase'
    ].includes(event.kind)
  ) {
    return false;
  }
  if (isLoading && event.kind === 'runtime.context') {
    return (event as RuntimeEvent<'runtime.context'>).payload.lane !== 'slow';
  }
  return true;
}

function deriveRuntimeStatus(
  events: RuntimeEvent[],
  isLoading: boolean
): { label: string; detail?: string; tone: RuntimeStatusTone } {
  const latest = [...events].reverse().find((event) => isPrimaryStatusEvent(event, isLoading));
  if (!latest)
    return isLoading ? { label: '准备中', tone: 'active' } : { label: '空闲', tone: 'idle' };
  switch (latest.kind) {
    case 'runtime.error':
      return {
        label: '运行出错',
        detail: (latest as RuntimeEvent<'runtime.error'>).payload.message,
        tone: 'danger'
      };
    case 'runtime.interrupt':
      return {
        label: '已停止',
        detail: (latest as RuntimeEvent<'runtime.interrupt'>).payload.reason,
        tone: 'warning'
      };
    case 'runtime.done': {
      const payload = (latest as RuntimeEvent<'runtime.done'>).payload;
      if (payload.reason === 'sdk_turn_pending_tools') {
        return { label: '工具结果处理中', detail: '模型已要求调用工具', tone: 'active' };
      }
      return { label: '已完成', tone: 'success' };
    }
    case 'runtime.message': {
      const payload = (latest as RuntimeEvent<'runtime.message'>).payload;
      if ((payload.role ?? 'assistant') === 'assistant' && payload.isStreaming) {
        return { label: '正在回复', detail: '模型文本流已开始', tone: 'active' };
      }
      return isLoading
        ? { label: '等待下一步事件', tone: 'active' }
        : { label: '空闲', tone: 'idle' };
    }
    case 'runtime.tool_use':
      return {
        label: '正在调用工具',
        detail: (latest as RuntimeEvent<'runtime.tool_use'>).payload.toolName,
        tone: 'active'
      };
    case 'runtime.context': {
      const payload = (latest as RuntimeEvent<'runtime.context'>).payload;
      return {
        label:
          payload.status === 'started' ? `${askContextLaneLabel(payload.lane)}中` : payload.label,
        detail: payload.detail,
        tone:
          payload.status === 'failed' ? 'warning' : payload.status === 'skipped' ? 'idle' : 'active'
      };
    }
    case 'runtime.route_escalation': {
      const payload = (latest as RuntimeEvent<'runtime.route_escalation'>).payload;
      return {
        label: '路由已升级',
        detail: `${askIntentRouteLabel(payload.from)} → ${askIntentRouteLabel(payload.to)}`,
        tone: 'warning'
      };
    }
    case 'runtime.route': {
      const payload = (latest as RuntimeEvent<'runtime.route'>).payload;
      return {
        label: `意图：${payload.label || askIntentRouteLabel(payload.route)}`,
        detail: payload.reason,
        tone: 'active'
      };
    }
    case 'runtime.phase': {
      const payload = (latest as RuntimeEvent<'runtime.phase'>).payload;
      return {
        label: payload.label,
        detail: payload.detail,
        tone:
          payload.status === 'failed'
            ? 'danger'
            : payload.status === 'completed'
              ? 'success'
              : 'active'
      };
    }
    default:
      return isLoading ? { label: '运行中', tone: 'active' } : { label: '空闲', tone: 'idle' };
  }
}

function statusDotClassName(tone: RuntimeStatusTone): string {
  if (tone === 'active') return 'h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-500';
  if (tone === 'success') return 'h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500';
  if (tone === 'warning') return 'h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500';
  if (tone === 'danger') return 'h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500';
  return 'h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400';
}
