import { useAskAnywhereSession } from '../components/ask-anywhere/AskAnywhereHost';
import { ConversationShell } from '../components/conversation';

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
    handleArchive,
    handleAction,
    handleArtifactAction
  } = useAskAnywhereSession({ initialActiveId });

  return (
    <ConversationShell
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
      welcomeMessage="Ask anything. Each session persists as a conversation."
    />
  );
}
