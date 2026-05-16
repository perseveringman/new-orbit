import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
import type { ComposerDraft, RuntimeSelection } from '@shared/ai-composer';
import { ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react';
import { usePara } from '../../store/para';
import {
  AIComposer,
  patchFromSelection,
  selectionFromConversation,
  useRuntimeCatalog
} from '../ai-composer';
import { useAskAnywhereSession } from './AskAnywhereHost';

interface AskAnywherePopoverProps {
  open: boolean;
  onClose(): void;
}

type MiniMessageTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger';

interface MiniMessage {
  id: string;
  at: string;
  label: string;
  text: string;
  tone: MiniMessageTone;
}

interface InternalMiniMessage extends MiniMessage {
  mergeKey?: string;
}

export function AskAnywherePopover({ open, onClose }: AskAnywherePopoverProps): JSX.Element | null {
  const setView = usePara((s) => s.setView);
  const view = usePara((s) => s.view);
  const visible = open && view.kind !== 'askAnywhere';
  const [hasPrompted, setHasPrompted] = useState(false);
  const [eventOffset, setEventOffset] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selection, setSelection] = useState<RuntimeSelection>({});
  const runtimeCatalog = useRuntimeCatalog();
  const {
    activeId,
    activeConversation,
    events,
    isLoading,
    handleNew,
    handleAction
  } = useAskAnywhereSession({ enabled: visible });
  const collectingMessages = hasPrompted || isLoading;
  const miniMessages = useMemo(() => {
    if (!collectingMessages) return [];
    let sourceEvents = eventOffset === null ? events : events.slice(eventOffset);
    if (!hasPrompted && activeConversation?.currentRunId) {
      sourceEvents = sourceEvents.filter((event) => event.runId === activeConversation.currentRunId);
    }
    return buildMiniMessages(sourceEvents);
  }, [activeConversation?.currentRunId, collectingMessages, eventOffset, events, hasPrompted]);
  const busy = submitting || isLoading;
  const showMessages = collectingMessages && (miniMessages.length > 0 || busy);

  useEffect(() => {
    if (open && view.kind === 'askAnywhere') onClose();
  }, [onClose, open, view.kind]);

  useEffect(() => {
    if (!visible) return;
    setSelection(selectionFromConversation(activeConversation, runtimeCatalog.options.defaultSelection));
  }, [activeConversation, runtimeCatalog.options.defaultSelection, visible]);

  useEffect(() => {
    if (visible) return;
    setHasPrompted(false);
    setEventOffset(null);
    setSubmitting(false);
  }, [visible]);

  if (!visible) return null;

  function expandToFullPage(): void {
    setView(activeId ? { kind: 'askAnywhere', activeId } : { kind: 'askAnywhere' });
    onClose();
  }

  function handleSelectionChange(next: RuntimeSelection): void {
    setSelection(next);
    if (!activeId) return;
    void window.orbit.chat.updateConversation(
      activeId,
      patchFromSelection(next, runtimeCatalog.options)
    );
  }

  async function handleSubmit(draft: ComposerDraft): Promise<void> {
    const text = draft.text.trim();
    if (!text || submitting) return;

    setHasPrompted(true);
    if (!hasPrompted) setEventOffset(events.length);
    setSubmitting(true);

    try {
      let conversationId = activeId;
      if (!conversationId) {
        const conversation = await handleNew({ draft });
        conversationId = conversation.id;
      }
      const action: ChatAction<'chat.send_message'> = {
        kind: 'chat.send_message',
        conversationId,
        payload: { text, draft }
      };
      await handleAction(action);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="随处问"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="fixed bottom-6 left-1/2 z-50 w-[min(720px,calc(100vw-32px))] -translate-x-1/2"
    >
      {showMessages ? <MiniAgentWindow busy={busy} messages={miniMessages} /> : null}
      <AIComposer
        density="floating"
        autoFocus
        disabled={busy}
        submitting={submitting}
        placeholder="问 Orbit，或交给智能体执行..."
        sourceSurface="ask_floating"
        options={runtimeCatalog.options}
        selection={selection}
        onSelectionChange={handleSelectionChange}
        onSubmit={(draft) => void handleSubmit(draft)}
        rightActions={
          <>
            <button
              type="button"
              title="展开到完整页面"
              aria-label="展开到完整页面"
              onClick={expandToFullPage}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
            >
              <X size={16} />
            </button>
          </>
        }
      />
    </div>
  );
}

function MiniAgentWindow({
  busy,
  messages
}: {
  busy: boolean;
  messages: MiniMessage[];
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [expanded, setExpanded] = useState(false);
  const messageSignature = messages
    .map((message) => `${message.id}:${message.text.length}:${message.at}`)
    .join('|');

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [busy, expanded, messageSignature, messages.length]);

  function handleScroll(): void {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  }

  return (
    <div
      className={[
        'ask-anywhere-agent-window relative mb-2 overflow-hidden rounded-lg bg-white/95 shadow-2xl backdrop-blur-xl transition-[height] duration-200 dark:bg-neutral-950/95',
        expanded ? 'h-[28rem] max-h-[calc(100vh-7rem)]' : 'h-56'
      ].join(' ')}
    >
      <button
        type="button"
        title={expanded ? '收起消息窗口' : '展开消息窗口'}
        aria-label={expanded ? '收起消息窗口' : '展开消息窗口'}
        aria-pressed={expanded}
        onClick={() => {
          stickToBottomRef.current = true;
          setExpanded((value) => !value);
        }}
        className="absolute left-1/2 top-1 z-10 flex h-6 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-500 shadow-sm ring-1 ring-neutral-200/80 transition hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-950/85 dark:text-neutral-400 dark:ring-neutral-800 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      <div
        ref={scrollerRef}
        aria-live="polite"
        onScroll={handleScroll}
        className="ask-anywhere-scrollarea h-full overflow-y-auto px-3 pb-3 pt-8"
      >
        <div className="space-y-2">
          {messages.length === 0 && busy ? (
            <div className="ask-anywhere-mini-message-enter rounded-md bg-neutral-50/90 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900/80 dark:text-neutral-300">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
              正在启动智能体...
            </div>
          ) : null}
          {messages.map((message, index) => (
            <MiniAgentMessage
              key={message.id}
              message={message}
              faded={index < messages.length - 1}
            />
          ))}
          {busy && messages.length > 0 ? (
            <div className="px-1 text-[10px] text-neutral-400 dark:text-neutral-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
              智能体执行中
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MiniAgentMessage({
  faded,
  message
}: {
  faded: boolean;
  message: MiniMessage;
}): JSX.Element {
  return (
    <div
      className={[
        'rounded-md px-3 py-2 transition duration-200',
        'ask-anywhere-mini-message-enter',
        faded ? 'opacity-70' : 'opacity-100',
        toneRowClassName(message.tone)
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span
          className={[
            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
            toneDotClassName(message.tone)
          ].join(' ')}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
            {message.label}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-800 dark:text-neutral-100">
            {message.text}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildMiniMessages(events: RuntimeEvent[]): MiniMessage[] {
  const messages: InternalMiniMessage[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'runtime.message':
        appendRuntimeMessage(messages, event as RuntimeEvent<'runtime.message'>);
        break;
      case 'runtime.thinking':
        appendMergedMessage(messages, {
          id: `thinking-${event.runId}-${event.spanId}`,
          at: event.at,
          label: '正在思考',
          text: (event as RuntimeEvent<'runtime.thinking'>).payload.text,
          tone: 'active',
          mergeKey: `thinking-${event.runId}-${event.spanId}`
        });
        break;
      case 'runtime.tool_use': {
        const toolUse = event as RuntimeEvent<'runtime.tool_use'>;
        const input = summarizeUnknown(toolUse.payload.toolInput);
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: '调用工具',
          text: input ? `${toolUse.payload.toolName} · ${input}` : toolUse.payload.toolName,
          tone: 'active'
        });
        break;
      }
      case 'runtime.tool_result': {
        const toolResult = event as RuntimeEvent<'runtime.tool_result'>;
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: toolResult.payload.isError ? '工具出错' : '工具返回',
          text: `${toolResult.payload.toolName} · ${toolResult.payload.result}`,
          tone: toolResult.payload.isError ? 'danger' : 'neutral'
        });
        break;
      }
      case 'runtime.awaiting_user': {
        const awaiting = event as RuntimeEvent<'runtime.awaiting_user'>;
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: '等待确认',
          text: [awaiting.payload.title, awaiting.payload.hint].filter(Boolean).join(' · '),
          tone: 'warning'
        });
        break;
      }
      case 'runtime.file_change': {
        const fileChange = event as RuntimeEvent<'runtime.file_change'>;
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: '文件变更',
          text: `${fileOperationLabel(fileChange.payload.operation)} · ${fileChange.payload.path}`,
          tone: 'neutral'
        });
        break;
      }
      case 'runtime.plan_update':
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: '计划更新',
          text: summarizeUnknown((event as RuntimeEvent<'runtime.plan_update'>).payload.plan),
          tone: 'active'
        });
        break;
      case 'runtime.error': {
        const error = event as RuntimeEvent<'runtime.error'>;
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: '执行出错',
          text: `${error.payload.code} · ${error.payload.message}`,
          tone: 'danger'
        });
        break;
      }
      case 'runtime.done': {
        const done = event as RuntimeEvent<'runtime.done'>;
        const ok =
          done.payload.exitCode === undefined ||
          done.payload.exitCode === null ||
          done.payload.exitCode === 0;
        pushMiniMessage(messages, {
          id: event.id,
          at: event.at,
          label: ok ? '执行完成' : '执行结束',
          text: done.payload.reason ?? (ok ? '本轮智能体已完成。' : `退出码 ${done.payload.exitCode}`),
          tone: ok ? 'success' : 'danger'
        });
        break;
      }
      default:
        break;
    }
  }

  return messages.map(({ mergeKey: _mergeKey, ...message }) => message);
}

function appendRuntimeMessage(
  messages: InternalMiniMessage[],
  event: RuntimeEvent<'runtime.message'>
): void {
  const role = event.payload.role ?? 'assistant';
  if (role === 'user') return;
  const mergeKey = `message-${event.runId}`;
  appendMergedMessage(messages, {
    id: mergeKey,
    at: event.at,
    label: event.payload.isStreaming ? '智能体回复中' : '智能体回复',
    text: event.payload.text,
    tone: event.payload.isStreaming || !event.payload.isFinal ? 'active' : 'neutral',
    mergeKey
  });
}

function appendMergedMessage(
  messages: InternalMiniMessage[],
  message: InternalMiniMessage
): void {
  const text = message.mergeKey ? cleanupAgentText(message.text) : compactText(message.text);
  if (!text.trim()) return;
  const last = messages[messages.length - 1];
  if (message.mergeKey && last?.mergeKey === message.mergeKey) {
    last.text = `${last.text}${text}`;
    last.at = message.at;
    last.label = message.label;
    last.tone = message.tone;
    return;
  }
  messages.push({ ...message, text: message.mergeKey ? text.trimStart() : text });
}

function pushMiniMessage(messages: InternalMiniMessage[], message: MiniMessage): void {
  const text = compactText(message.text);
  if (!text) return;
  messages.push({ ...message, text });
}

function summarizeUnknown(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return compactText(value, 140);
  try {
    return compactText(JSON.stringify(value), 140);
  } catch {
    return compactText(String(value), 140);
  }
}

function compactText(text: string, maxLength = 220): string {
  const normalized = text
    .replace(/```artifact\s*[\s\S]*?```/g, '已生成阶段产物')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function cleanupAgentText(text: string): string {
  return text.replace(/```artifact\s*[\s\S]*?```/g, '已生成阶段产物');
}

function fileOperationLabel(
  operation: RuntimeEvent<'runtime.file_change'>['payload']['operation']
): string {
  if (operation === 'create') return '创建';
  if (operation === 'modify') return '修改';
  if (operation === 'delete') return '删除';
  return '重命名';
}

function toneRowClassName(tone: MiniMessageTone): string {
  if (tone === 'active') return 'bg-sky-50/90 dark:bg-sky-950/30';
  if (tone === 'success') return 'bg-emerald-50/90 dark:bg-emerald-950/30';
  if (tone === 'warning') return 'bg-amber-50/90 dark:bg-amber-950/30';
  if (tone === 'danger') return 'bg-rose-50/90 dark:bg-rose-950/30';
  return 'bg-neutral-50/90 dark:bg-neutral-900/80';
}

function toneDotClassName(tone: MiniMessageTone): string {
  if (tone === 'active') return 'bg-sky-500';
  if (tone === 'success') return 'bg-emerald-500';
  if (tone === 'warning') return 'bg-amber-500';
  if (tone === 'danger') return 'bg-rose-500';
  return 'bg-neutral-400 dark:bg-neutral-500';
}
