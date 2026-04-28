import { useEffect, useRef, useState } from 'react';
import { ChatView } from '../components/chat/ChatView';
import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
import { useAskAnywhereSession } from '../components/ask-anywhere/AskAnywhereHost';
import { ContextBar } from './ask-anywhere/ContextBar';
import { StageDrawer } from './ask-anywhere/StageDrawer';

interface AskAnywhereViewProps {
  initialActiveId?: string | null;
}

export function AskAnywhereView({ initialActiveId = null }: AskAnywhereViewProps): JSX.Element {
  const {
    sessions,
    activeId,
    activeConversation,
    events,
    stage,
    isLoading,
    selectActiveId,
    handleNew,
    handleAction,
    handleArtifactAction
  } = useAskAnywhereSession({ initialActiveId });
  const [stageOpen, setStageOpen] = useState(false);
  const [stagePulse, setStagePulse] = useState(false);
  const artifactCount = stage?.artifacts.length ?? 0;
  const previousArtifactCount = useRef(artifactCount);

  useEffect(() => {
    if (artifactCount > previousArtifactCount.current) {
      setStagePulse(true);
      const timer = window.setTimeout(() => setStagePulse(false), 1600);
      previousArtifactCount.current = artifactCount;
      return () => window.clearTimeout(timer);
    }
    previousArtifactCount.current = artifactCount;
    if (artifactCount === 0) setStageOpen(false);
    return undefined;
  }, [artifactCount]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
          <span>Ask Anywhere</span>
          <button
            onClick={() => void handleNew()}
            className="rounded bg-sky-600 px-2 py-1 text-[10px] text-white hover:bg-sky-500"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-3 py-6 text-xs text-neutral-500">
              No Ask sessions yet. Click “+ New”.
            </p>
          ) : (
            sessions.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectActiveId(conv.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  activeId === conv.id
                    ? 'bg-violet-50 text-violet-900 dark:bg-violet-900/30 dark:text-violet-100'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <div className="truncate font-medium">{conv.title ?? 'Untitled'}</div>
                <div className="truncate text-[11px] text-neutral-500">
                  {new Date(conv.updatedAt).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <ContextBar conversation={activeConversation} />
        {activeId ? (
          <div className={`relative min-h-0 flex-1 ${stageOpen ? 'md:pr-80' : ''}`}>
            {artifactCount > 0 ? (
              <button
                type="button"
                onClick={() => setStageOpen((v) => !v)}
                className={
                  'absolute right-3 top-12 z-20 rounded-full border border-violet-200 bg-white/95 px-3 py-1 text-xs font-medium text-violet-700 shadow-sm hover:bg-violet-50 dark:border-violet-800 dark:bg-neutral-950/95 dark:text-violet-200 dark:hover:bg-violet-950/40 ' +
                  (stagePulse ? 'animate-pulse' : '')
                }
              >
                Stage · {artifactCount} {artifactCount === 1 ? 'artifact' : 'artifacts'} ↗
              </button>
            ) : null}
            <ChatView
              conversationId={activeId}
              capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
              events={events}
              isLoading={isLoading}
              onAction={(action) => void handleAction(action)}
              welcomeMessage="Ask anything. Each session persists as a conversation."
            />
            <StageDrawer
              stage={stage}
              open={stageOpen}
              onClose={() => setStageOpen(false)}
              onAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            Select or create a session to start.
          </div>
        )}
      </section>
    </div>
  );
}
