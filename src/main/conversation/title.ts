import type { Conversation, ConversationScope } from '@shared/conversation';
import { summarizeConversationScope } from './context';
import type { RuntimeRouter } from '../runtime/router';

export function defaultConversationTitle(scope: ConversationScope): string {
  return summarizeConversationScope(scope).title;
}

export function deriveConversationTitle(conversation: Conversation): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  const firstUser = conversation.turns.find((turn) => turn.role === 'user' && turn.content.trim());
  if (firstUser) return firstUser.content.trim().slice(0, 60);
  return conversation.scope ? defaultConversationTitle(conversation.scope) : 'Untitled conversation';
}

export interface GeneratedConversationTitle {
  title: string;
  confidence: number;
  generatedFromTurnId: string;
  usedModel: boolean;
}

export async function generateConversationAutoTitle(input: {
  conversation: Conversation;
  assistantTurnId: string;
  router?: RuntimeRouter | null;
}): Promise<GeneratedConversationTitle | null> {
  if (!shouldAutoTitleConversation(input.conversation)) return null;

  if (input.router) {
    const modelTitle = await generateTitleWithModel(input.conversation, input.router).catch(() => null);
    if (modelTitle) {
      return {
        title: modelTitle,
        confidence: 0.82,
        generatedFromTurnId: input.assistantTurnId,
        usedModel: true
      };
    }
  }

  const fallback = fallbackConversationTitle(input.conversation);
  if (!fallback) return null;
  return {
    title: fallback,
    confidence: 0.45,
    generatedFromTurnId: input.assistantTurnId,
    usedModel: false
  };
}

export function shouldAutoTitleConversation(conversation: Conversation): boolean {
  if (conversation.titleSource === 'manual') return false;
  if (conversation.titleGeneratedFromTurnId) return false;
  const firstUser = conversation.turns.find((turn) => turn.role === 'user' && turn.content.trim());
  const firstAssistant = conversation.turns.find(
    (turn) => turn.role === 'assistant' && turn.content.trim()
  );
  if (!firstUser || !firstAssistant) return false;
  return isDefaultLikeTitle(conversation);
}

export function normalizeGeneratedTitle(raw: string): string | null {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const cleaned = firstLine
    .replace(/^标题[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[。.!！?？]+$/g, '')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, titleCharLimit(cleaned));
}

export function fallbackConversationTitle(conversation: Conversation): string | null {
  const firstUser = conversation.turns.find((turn) => turn.role === 'user' && turn.content.trim());
  if (!firstUser) return null;
  const content = firstUser.content
    .replace(/[`*_#>[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!content) return null;
  const compact = content
    .replace(/^(请|帮我|帮忙|麻烦|我想|能否|可以|please|can you)\s*/i, '')
    .replace(/[。.!！?？]+$/g, '')
    .trim();
  return normalizeGeneratedTitle(compact.slice(0, titleCharLimit(compact)));
}

function isDefaultLikeTitle(conversation: Conversation): boolean {
  const title = conversation.title?.trim();
  if (!title) return true;
  if (title === 'Untitled' || title === 'Untitled conversation') return true;
  if (title === 'Ask Anywhere') return true;
  if (title.startsWith('Ask ·')) return true;
  if (conversation.scope && title === defaultConversationTitle(conversation.scope)) return true;
  return conversation.titleSource === 'auto';
}

async function generateTitleWithModel(
  conversation: Conversation,
  router: RuntimeRouter
): Promise<string | null> {
  const prompt = buildTitlePrompt(conversation);
  const result = await router.stream(
    {
      messages: [{ role: 'user', content: prompt }],
      system: TITLE_SYSTEM_PROMPT,
      conversationId: conversation.id,
      traceId: `conversation-title-${conversation.id}-${Date.now()}`,
      mode: 'background',
      maxTokens: 48,
      temperature: 0
    },
    () => []
  );
  return normalizeGeneratedTitle(result.text);
}

export function buildTitlePrompt(conversation: Conversation): string {
  const firstUser = conversation.turns.find((turn) => turn.role === 'user' && turn.content.trim());
  const firstAssistant = conversation.turns.find(
    (turn) => turn.role === 'assistant' && turn.content.trim()
  );
  const toolTrace = firstAssistant?.toolTrace?.slice(0, 6).map((tool) => {
    const input = safeJson(tool.input);
    return `- ${tool.toolName}${input ? ` ${input}` : ''}`;
  });
  return [
    `Scope: ${conversation.scope?.kind ?? 'global'}`,
    '',
    'User request:',
    clip(firstUser?.content ?? '', 1200),
    '',
    'Assistant outcome:',
    clip(firstAssistant?.content ?? '', 1600),
    toolTrace && toolTrace.length > 0 ? ['', 'Tool signals:', toolTrace.join('\n')].join('\n') : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const TITLE_SYSTEM_PROMPT = [
  'You name Orbit Ask Anywhere conversations.',
  'Return exactly one concise title and nothing else.',
  'Use the same language as the user.',
  'Prefer an object + action/problem shape.',
  'Chinese titles should be 6-14 characters when possible.',
  'English titles should be 3-7 words.',
  'Avoid generic words like about, discussion, help, conversation, 关于, 讨论, 帮我.'
].join('\n');

function titleCharLimit(value: string): number {
  return /[\u3400-\u9fff]/.test(value) ? 18 : 80;
}

function clip(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function safeJson(value: unknown): string {
  try {
    const raw = JSON.stringify(value);
    return raw && raw.length > 180 ? `${raw.slice(0, 180)}...` : (raw ?? '');
  } catch {
    return '';
  }
}
