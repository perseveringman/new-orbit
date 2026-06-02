import { useEffect, useState } from 'react';
import { useAskAnywhereSession } from '../components/ask-anywhere/AskAnywhereHost';
import { ConversationShell } from '../components/conversation';
import { ContextBar } from './ask-anywhere/ContextBar';
import { StageDrawer } from './ask-anywhere/StageDrawer';

interface AskAnywhereViewProps {
  initialActiveId?: string | null;
}

export function AskAnywhereView({ initialActiveId = null }: AskAnywhereViewProps): JSX.Element {
  const [stageOpen, setStageOpen] = useState(false);
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
    handleAction,
    handleArtifactAction
  } = useAskAnywhereSession({ initialActiveId });
  const artifactCount = stage?.artifacts.length ?? 0;

  useEffect(() => {
    setStageOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (artifactCount === 0) setStageOpen(false);
  }, [artifactCount]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
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
        composerSourceSurface="ask_full"
        welcomeMessage="可以直接提问，也可以交给智能体执行。每个会话都会保留。"
        messageMaxWidthClass="max-w-[70%]"
        eventMaxWidthClass="max-w-[70%]"
        contextSlot={<ContextBar conversation={activeConversation} events={events} />}
        actions={
          artifactCount > 0 ? (
            <button
              type="button"
              onClick={() => setStageOpen(true)}
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              产物（{artifactCount}）
            </button>
          ) : null
        }
      />
      <StageDrawer
        stage={stage}
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        onAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)}
      />
    </div>
  );
}
