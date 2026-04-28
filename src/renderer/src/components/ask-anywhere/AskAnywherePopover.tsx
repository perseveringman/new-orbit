import { useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';
import { usePara } from '../../store/para';
import { useAskAnywhereSession } from './AskAnywhereHost';
import { ConversationShell } from '../conversation';

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
    activeConversation,
    events,
    stage,
    isLoading,
    selectActiveId,
    handleNew,
    handleArchive,
    handleArtifactAction,
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
      <ConversationShell
        variant="compact"
        conversations={sessions}
        activeId={activeId}
        activeConversation={activeConversation}
        events={events}
        stage={stage}
        isLoading={isLoading}
        onSelect={selectActiveId}
        onNew={() => void handleNew()}
        onArchive={(id) => void handleArchive(id)}
        onAction={(action) => void handleAction(action)}
        onArtifactAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)}
        welcomeMessage="Ask anything. This mini session is shared with the full page."
        actions={
          <>
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
          </>
        }
      />
    </div>
  );
}
