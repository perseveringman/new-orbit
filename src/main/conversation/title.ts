import type { Conversation, ConversationScope } from '@shared/conversation';
import { summarizeConversationScope } from './context';

export function defaultConversationTitle(scope: ConversationScope): string {
  return summarizeConversationScope(scope).title;
}

export function deriveConversationTitle(conversation: Conversation): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  const firstUser = conversation.turns.find((turn) => turn.role === 'user' && turn.content.trim());
  if (firstUser) return firstUser.content.trim().slice(0, 60);
  return conversation.scope ? defaultConversationTitle(conversation.scope) : 'Untitled conversation';
}

