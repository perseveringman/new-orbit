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
import { ActionBar } from './ActionBar';
import { InputArea } from './InputArea';
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
    actionBarItems
  } = props;

  const actions = useChatActions({ conversationId, onAction });
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const items = useMemo(() => buildRenderItems(events, capabilities), [events, capabilities]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50/30 dark:bg-neutral-950/30">
      <ActionBar
        capabilities={capabilities}
        isLoading={isLoading}
        items={actionBarItems}
        onStop={() => actions.stop()}
        onRetry={() => actions.retry()}
        onCompact={() => actions.compact()}
      />
      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-auto px-3 py-3">
        {items.length === 0 && welcomeMessage ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
            {welcomeMessage}
          </div>
        ) : null}
        {items.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
      </div>
      <InputArea
        conversationId={conversationId}
        disabled={!capabilities.canSendMessage}
        placeholder={placeholder}
        onSubmit={(text) => actions.sendMessage(text)}
      />
    </div>
  );
}

function buildRenderItems(
  events: RuntimeEvent[],
  capabilities: { supportsThinking: boolean }
): RenderItem[] {
  // 把 tool_use 与对应 tool_result 配对，其余事件按序渲染
  const items: RenderItem[] = [];
  const toolUseBySpan = new Map<string, RuntimeEvent<'runtime.tool_use'>>();
  const consumed = new Set<string>();

  for (const ev of events) {
    if (ev.kind === 'runtime.tool_use') {
      const tu = ev as RuntimeEvent<'runtime.tool_use'>;
      toolUseBySpan.set(tu.spanId, tu);
    }
  }

  for (const ev of events) {
    if (consumed.has(ev.id)) continue;
    switch (ev.kind) {
      case 'runtime.message': {
        const m = ev as RuntimeEvent<'runtime.message'>;
        items.push({ key: ev.id, node: <MessageBubble event={m} /> });
        break;
      }
      case 'runtime.thinking': {
        if (!capabilities.supportsThinking) break;
        const t = ev as RuntimeEvent<'runtime.thinking'>;
        items.push({ key: ev.id, node: <ThinkingBlock event={t} /> });
        break;
      }
      case 'runtime.tool_use': {
        const tu = ev as RuntimeEvent<'runtime.tool_use'>;
        const result = events.find(
          (e) =>
            e.kind === 'runtime.tool_result' &&
            (e as RuntimeEvent<'runtime.tool_result'>).payload.parentSpanId === tu.spanId
        ) as RuntimeEvent<'runtime.tool_result'> | undefined;
        if (result) consumed.add(result.id);
        items.push({ key: tu.id, node: <ToolCard toolUse={tu} toolResult={result} /> });
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
      default:
        break;
    }
  }

  return items;
}
