/**
 * ChatView — 业务无关的纯渲染器（Chat 解耦 D-1 / D-3）。
 *
 * 输入：RuntimeEvent[] + ChatHostCapabilities
 * 输出：ChatAction（通过 onAction 回传给 host）
 *
 * 该目录下任何文件不得引用业务概念（详见 03-chat-runtime-protocol.md §5.2），
 * 由 grep 自动化验证。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §5
 */

import { useEffect, useMemo, useRef } from 'react';
import type { RuntimeEvent } from '@shared/chat-protocol';
import { AIComposer } from '../ai-composer';
import { ActionBar } from './ActionBar';
import { MessageBubble } from './MessageBubble';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { useChatActions } from './hooks/useChatActions';
import type { ChatProps } from './types';

interface RenderItem {
  key: string;
  node: JSX.Element;
}

export function ChatView(props: ChatProps): JSX.Element {
  const {
    conversationId,
    capabilities,
    events,
    isLoading,
    onAction,
    placeholder,
    welcomeMessage,
    actionBarItems,
    composerOptions,
    composerSelection,
    composerSourceSurface,
    composerCapabilities,
    onComposerSelectionChange,
    headerSlot,
    beforeEventsSlot
  } = props;

  const actions = useChatActions({ conversationId, onAction });
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const items = useMemo(
    () => buildRenderItems(events, capabilities, actions.approveTool, actions.rejectTool),
    [events, capabilities, actions.approveTool, actions.rejectTool]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50/30 dark:bg-neutral-950/30">
      {headerSlot ? <div className="shrink-0">{headerSlot}</div> : null}
      <ActionBar
        capabilities={capabilities}
        isLoading={isLoading}
        items={actionBarItems}
        onStop={() => actions.stop()}
        onRetry={() => actions.retry()}
        onCompact={() => actions.compact()}
      />
      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-auto px-3 py-3">
        {beforeEventsSlot}
        {items.length === 0 && welcomeMessage ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
            {welcomeMessage}
          </div>
        ) : null}
        {items.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
      </div>
      <AIComposer
        disabled={!capabilities.canSendMessage}
        submitting={isLoading}
        density="compact"
        placeholder={placeholder}
        sourceSurface={composerSourceSurface}
        options={composerOptions}
        selection={composerSelection}
        capabilities={{
          canSend: capabilities.canSendMessage,
          canAttachFiles: capabilities.canSendMessage,
          canRecordVoice: capabilities.canSendMessage,
          canSwitchModel: capabilities.canSendMessage,
          canSwitchRuntime: capabilities.canSendMessage,
          canSwitchProfile: capabilities.canSendMessage,
          ...composerCapabilities
        }}
        onSelectionChange={onComposerSelectionChange}
        onSubmit={(draft) => actions.sendMessage(draft.text, draft)}
      />
    </div>
  );
}

function buildRenderItems(
  events: RuntimeEvent[],
  capabilities: { supportsThinking: boolean; canApproveTool: boolean },
  onApproveTool?: (spanId: string) => void,
  onRejectTool?: (spanId: string) => void
): RenderItem[] {
  // 把 tool_use 与对应 tool_result 配对，其余事件按序渲染
  const items: RenderItem[] = [];
  const normalizedEvents = normalizeRuntimeEvents(events);
  const consumed = new Set<string>();

  for (const ev of normalizedEvents) {
    if (consumed.has(ev.id)) continue;
    switch (ev.kind) {
      case 'runtime.message': {
        const m = ev as RuntimeEvent<'runtime.message'>;
        if (!m.payload.text.trim()) break;
        items.push({ key: ev.id, node: <MessageBubble event={m} /> });
        break;
      }
      case 'runtime.thinking': {
        if (!capabilities.supportsThinking) break;
        const t = ev as RuntimeEvent<'runtime.thinking'>;
        if (!t.payload.text.trim()) break;
        items.push({ key: ev.id, node: <ThinkingBlock event={t} /> });
        break;
      }
      case 'runtime.tool_use': {
        const tu = ev as RuntimeEvent<'runtime.tool_use'>;
        const spanId = resolveToolUseSpanId(tu);
        const result = normalizedEvents.find(
          (e) =>
            e.kind === 'runtime.tool_result' &&
            resolveToolResultParentSpanId(e as RuntimeEvent<'runtime.tool_result'>) === spanId
        ) as RuntimeEvent<'runtime.tool_result'> | undefined;
        if (result) consumed.add(result.id);
        items.push({
          key: tu.id,
          node: (
            <ToolCard
              toolUse={tu}
              toolResult={result}
              onApprove={capabilities.canApproveTool ? onApproveTool : undefined}
              onReject={capabilities.canApproveTool ? onRejectTool : undefined}
            />
          )
        });
        break;
      }
      case 'runtime.tool_result': {
        // 没有匹配 tool_use 的结果，孤立显示
        const r = ev as RuntimeEvent<'runtime.tool_result'>;
        items.push({
          key: r.id,
          node: (
            <div className="rounded-xl border border-neutral-200 bg-white/70 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-200">
              <div className="font-mono font-semibold">{r.payload.toolName}</div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px]">
                {r.payload.result}
              </pre>
            </div>
          )
        });
        break;
      }
      case 'runtime.error': {
        const e = ev as RuntimeEvent<'runtime.error'>;
        items.push({
          key: e.id,
          node: (
            <div className="rounded-xl border border-rose-300 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              <div className="font-semibold">{e.payload.code}</div>
              <div className="mt-1 whitespace-pre-wrap break-words">{e.payload.message}</div>
            </div>
          )
        });
        break;
      }
      case 'runtime.awaiting_user': {
        const a = ev as RuntimeEvent<'runtime.awaiting_user'>;
        items.push({
          key: a.id,
          node: (
            <AwaitingUserCard
              event={a}
              canApprove={capabilities.canApproveTool}
              onApprove={onApproveTool}
              onReject={onRejectTool}
            />
          )
        });
        break;
      }
      case 'runtime.interrupt': {
        const i = ev as RuntimeEvent<'runtime.interrupt'>;
        items.push({
          key: i.id,
          node: (
            <div className="rounded-xl border border-orange-300 bg-orange-50/80 px-3 py-2 text-xs text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200">
              <span className="font-semibold">⛔ Interrupted</span>
              <span className="ml-2 opacity-80">{i.payload.reason}</span>
            </div>
          )
        });
        break;
      }
      case 'runtime.cost': {
        const c = ev as RuntimeEvent<'runtime.cost'>;
        const { inputTokens, outputTokens, totalUsd } = c.payload;
        const parts: string[] = [];
        if (typeof inputTokens === 'number') parts.push(`in ${inputTokens}`);
        if (typeof outputTokens === 'number') parts.push(`out ${outputTokens}`);
        if (typeof totalUsd === 'number') parts.push(`$${totalUsd.toFixed(4)}`);
        if (parts.length === 0) break;
        items.push({
          key: c.id,
          node: (
            <div className="rounded-md bg-neutral-100/70 px-2 py-1 text-[10px] text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
              ⓘ cost · {parts.join(' · ')}
            </div>
          )
        });
        break;
      }
      case 'runtime.done': {
        const d = ev as RuntimeEvent<'runtime.done'>;
        const code = d.payload.exitCode;
        const ok = code === 0 || code === undefined || code === null;
        items.push({
          key: d.id,
          node: (
            <div
              className={`rounded-md px-2 py-1 text-[10px] ${
                ok
                  ? 'bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-rose-100/60 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
              }`}
            >
              {ok ? '✓ done' : `✗ exited (${code})`}
              {d.payload.reason ? ` · ${d.payload.reason}` : ''}
            </div>
          )
        });
        break;
      }
      default:
        break;
    }
  }

  return items;
}

function normalizeRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[] {
  return mergeAwaitingUserEvents(mergeStreamingThinking(mergeStreamingMessages(events)));
}

function AwaitingUserCard({
  event,
  canApprove,
  onApprove,
  onReject
}: {
  event: RuntimeEvent<'runtime.awaiting_user'>;
  canApprove: boolean;
  onApprove?: (spanId: string) => void;
  onReject?: (spanId: string) => void;
}): JSX.Element {
  const status = event.payload.status ?? 'pending';
  const proposalId = event.payload.proposalId ?? event.spanId;
  const title = event.payload.title ?? 'Awaiting user approval';
  const isExternalPathApproval = event.payload.kind === 'external_path_access';
  const showActions =
    status === 'pending' &&
    canApprove &&
    (onApprove || onReject);
  const approveLabel = isExternalPathApproval ? 'Allow read' : 'Approve';
  const rejectLabel = isExternalPathApproval ? 'Deny' : 'Reject';
  return (
    <div className="rounded-xl border border-violet-300 bg-violet-50/80 px-3 py-2 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className={awaitingStatusClassName(status)}>{awaitingStatusLabel(status)}</span>
      </div>
      {event.payload.targetPath ? (
        <div className="mt-2 break-all rounded-md bg-white/70 px-2 py-1 font-mono text-[11px] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">
          {event.payload.targetPath}
        </div>
      ) : null}
      {event.payload.hint ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-[11px] opacity-80">
          {event.payload.hint}
        </p>
      ) : null}
      {showActions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onApprove ? (
            <button
              type="button"
              onClick={() => onApprove(proposalId)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              {approveLabel}
            </button>
          ) : null}
          {onReject ? (
            <button
              type="button"
              onClick={() => onReject(proposalId)}
              className="rounded-md border border-rose-300 bg-white/50 px-3 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-950/30"
            >
              {rejectLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function awaitingStatusLabel(
  status: NonNullable<RuntimeEvent<'runtime.awaiting_user'>['payload']['status']>
): string {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'dismissed') return 'dismissed';
  return 'pending';
}

function awaitingStatusClassName(
  status: NonNullable<RuntimeEvent<'runtime.awaiting_user'>['payload']['status']>
): string {
  if (status === 'approved') {
    return 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200';
  }
  if (status === 'rejected' || status === 'dismissed') {
    return 'rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/50 dark:text-rose-200';
  }
  return 'rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-100';
}

function mergeAwaitingUserEvents(events: RuntimeEvent[]): RuntimeEvent[] {
  const merged: RuntimeEvent[] = [];
  const indexByKey = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'runtime.awaiting_user') {
      merged.push(event);
      continue;
    }
    const awaiting = event as RuntimeEvent<'runtime.awaiting_user'>;
    const key = awaiting.payload.proposalId ?? awaiting.spanId;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(awaiting);
      continue;
    }
    const existing = merged[existingIndex] as RuntimeEvent<'runtime.awaiting_user'>;
    merged[existingIndex] = {
      ...existing,
      ...awaiting,
      id: existing.id,
      payload: {
        ...existing.payload,
        ...awaiting.payload
      }
    };
  }
  return merged;
}

function mergeStreamingMessages(events: RuntimeEvent[]): RuntimeEvent[] {
  const merged: RuntimeEvent[] = [];
  let index = 0;
  while (index < events.length) {
    const event = events[index];
    if (event?.kind !== 'runtime.message') {
      if (event) merged.push(event);
      index += 1;
      continue;
    }

    const message = event as RuntimeEvent<'runtime.message'>;
    if (!message.payload.isStreaming) {
      merged.push(message);
      index += 1;
      continue;
    }

    const role = message.payload.role ?? 'assistant';
    const chunks: RuntimeEvent<'runtime.message'>[] = [message];
    let nextIndex = index + 1;
    while (nextIndex < events.length) {
      const next = events[nextIndex];
      if (next?.kind !== 'runtime.message') break;
      const nextMessage = next as RuntimeEvent<'runtime.message'>;
      if (
        nextMessage.runId !== message.runId ||
        (nextMessage.payload.role ?? 'assistant') !== role ||
        !nextMessage.payload.isStreaming
      ) {
        break;
      }
      chunks.push(nextMessage);
      nextIndex += 1;
    }

    const runFinished = events
      .slice(nextIndex)
      .some(
        (candidate) =>
          candidate.runId === message.runId &&
          (candidate.kind === 'runtime.done' || candidate.kind === 'runtime.error')
      );
    merged.push({
      ...message,
      id: message.id,
      spanId: message.spanId,
      payload: {
        ...message.payload,
        text: chunks.map((chunk) => chunk.payload.text).join(''),
        role,
        isStreaming: !runFinished,
        isFinal: runFinished || message.payload.isFinal
      }
    });
    index = nextIndex;
  }
  return merged;
}

function mergeStreamingThinking(events: RuntimeEvent[]): RuntimeEvent[] {
  const merged: RuntimeEvent[] = [];
  let index = 0;
  while (index < events.length) {
    const event = events[index];
    if (event?.kind !== 'runtime.thinking') {
      if (event) merged.push(event);
      index += 1;
      continue;
    }

    const thinking = event as RuntimeEvent<'runtime.thinking'>;
    const chunks: RuntimeEvent<'runtime.thinking'>[] = [thinking];
    let nextIndex = index + 1;
    while (nextIndex < events.length) {
      const next = events[nextIndex];
      if (next?.kind !== 'runtime.thinking') break;
      const nextThinking = next as RuntimeEvent<'runtime.thinking'>;
      if (nextThinking.runId !== thinking.runId || nextThinking.spanId !== thinking.spanId) break;
      chunks.push(nextThinking);
      nextIndex += 1;
    }

    merged.push({
      ...thinking,
      payload: {
        text: chunks.map((chunk) => chunk.payload.text).join('')
      }
    });
    index = nextIndex;
  }
  return merged;
}

function resolveToolUseSpanId(event: RuntimeEvent<'runtime.tool_use'>): string {
  return typeof event.payload.spanId === 'string' && event.payload.spanId.trim()
    ? event.payload.spanId
    : event.spanId;
}

function resolveToolResultParentSpanId(event: RuntimeEvent<'runtime.tool_result'>): string {
  return event.parentSpanId ?? event.payload.parentSpanId;
}
