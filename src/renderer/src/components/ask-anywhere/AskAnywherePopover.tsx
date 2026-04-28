import { useEffect } from 'react';
import { Maximize2, Plus, X } from 'lucide-react';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import { ChatView } from '../chat/ChatView';
import { usePara } from '../../store/para';
import { useAskAnywhereSession } from './AskAnywhereHost';

interface AskAnywherePopoverProps {
  open: boolean;
  onClose(): void;
}

export function AskAnywherePopover({ open, onClose }: AskAnywherePopoverProps): JSX.Element | null {
  const setView = usePara((s) => s.setView);
  const view = usePara((s) => s.view);
  const visible = open && view.kind !== 'askAnywhere';
  const {
    sessions,
    activeId,
    events,
    isLoading,
    selectActiveId,
    handleNew,
    handleAction
  } = useAskAnywhereSession({ enabled: visible });

  useEffect(() => {
    if (open && view.kind === 'askAnywhere') onClose();
  }, [onClose, open, view.kind]);

  if (!visible) return null;

  function expandToFullPage(): void {
    setView(activeId ? { kind: 'askAnywhere', activeId } : { kind: 'askAnywhere' });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label="Ask Anywhere"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="fixed bottom-24 right-6 z-50 flex h-[560px] max-h-[calc(100vh-80px)] w-[380px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-neutral-200 px-2 dark:border-neutral-800">
        <select
          aria-label="Ask Anywhere session"
          value={activeId ?? ''}
          onChange={(event) => selectActiveId(event.target.value || null)}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 outline-none focus:border-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          {sessions.length === 0 ? (
            <option value="">No sessions</option>
          ) : (
            sessions.map((conv) => (
              <option key={conv.id} value={conv.id}>
                {conv.title ?? 'Untitled'} · {new Date(conv.updatedAt).toLocaleString()}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          title="New Ask Anywhere session"
          aria-label="New Ask Anywhere session"
          onClick={() => void handleNew()}
          className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          title="Expand to full page"
          aria-label="Expand Ask Anywhere"
          onClick={expandToFullPage}
          className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close Ask Anywhere"
          onClick={onClose}
          className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {activeId ? (
          <ChatView
            conversationId={activeId}
            capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
            events={events}
            isLoading={isLoading}
            onAction={(action) => void handleAction(action)}
            welcomeMessage="Ask anything. This mini session is shared with the full page."
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-neutral-500">
            <p>No Ask Anywhere sessions yet.</p>
            <button
              type="button"
              onClick={() => void handleNew()}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
            >
              + New session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
