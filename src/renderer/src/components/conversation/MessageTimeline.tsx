import { ChatView } from '../chat/ChatView';
import type { ChatProps } from '../chat/types';

export function MessageTimeline(props: ChatProps): JSX.Element {
  return <ChatView {...props} />;
}

