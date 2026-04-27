/**
 * Ask-Anywhere main 端 orchestrator（M6 骨架）。
 *
 * 职责：
 *  - 创建 / 列出 ad-hoc Ask conversation
 *  - 复用 ConversationOrchestrator 的 NDJSON 持久化
 *
 * 暂未接入真实 runtime；后续接 RunGuardian + RuntimeAdapter。
 */

import { randomUUID } from 'node:crypto';
import type { ConversationOrchestrator } from '../conversation/orchestrator';
import type { Conversation, ConversationAnchor, ConversationMeta } from '@shared/conversation';

export class AskAnywhereOrchestrator {
  constructor(private readonly conversations: ConversationOrchestrator) {}

  async createSession(opts: { title?: string } = {}): Promise<Conversation> {
    const anchor: ConversationAnchor = {
      kind: 'ask_anywhere_session',
      refId: randomUUID(),
      addedAt: new Date().toISOString()
    };
    return this.conversations.createConversation({
      title: opts.title ?? 'Ask Anywhere',
      anchor
    });
  }

  async listSessions(): Promise<ConversationMeta[]> {
    const all = await this.conversations.listConversations();
    return all.filter((conv) =>
      conv.anchors.some((a) => a.kind === 'ask_anywhere_session')
    );
  }
}
