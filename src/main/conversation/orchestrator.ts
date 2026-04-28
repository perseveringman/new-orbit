/**
 * ConversationOrchestrator — Conversation 生命周期管理（D-5）。
 *
 * 当前职责（M3）：
 *   - 创建 Conversation（带 anchor）
 *   - 写入 user / assistant turn
 *   - 通过 RuntimeEvent 边界绑定 currentRunId / vendorSessionId
 *
 * 后续（M5+）：与 ChatHost / TaskOrchestrator / AskAnywhereOrchestrator 集成。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §6
 */

import { randomUUID } from 'node:crypto';
import type {
  Conversation,
  ConversationAnchor,
  ConversationMeta,
  ConversationScope,
  ConversationTurn,
  ConversationTurnRole
} from '@shared/conversation';
import { conversationScopeKey } from '@shared/conversation';
import { ConversationStore } from './store';
import { publishTraceableEvent } from '../events/bus';

export interface AppendTurnInput {
  conversationId: string;
  role: ConversationTurnRole;
  content: string;
  runtimeEventIds?: string[];
  artifactRefs?: string[];
}

export interface CreateConversationInput {
  anchor: ConversationAnchor;
  scope?: ConversationScope;
  runtimeHint?: string;
  title?: string;
}

export class ConversationOrchestrator {
  private readonly store: ConversationStore;

  constructor(vaultPath: string) {
    this.store = new ConversationStore(vaultPath);
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const id = randomUUID();
    const conv = await this.store.create({
      id,
      anchors: [input.anchor],
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.runtimeHint ? { runtimeHint: input.runtimeHint } : {}),
      ...(input.title ? { title: input.title } : {})
    });
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.started',
      conversationId: id,
      payload: { anchors: conv.anchors, title: conv.title, runtimeHint: conv.runtimeHint }
    });
    return conv;
  }

  async appendTurn(input: AppendTurnInput): Promise<ConversationTurn> {
    const turn: ConversationTurn = {
      id: randomUUID(),
      at: new Date().toISOString(),
      role: input.role,
      content: input.content,
      ...(input.runtimeEventIds ? { runtimeEventIds: input.runtimeEventIds } : {}),
      ...(input.artifactRefs ? { artifactRefs: input.artifactRefs } : {})
    };
    await this.store.appendTurn(input.conversationId, turn);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.turn.added',
      conversationId: input.conversationId,
      payload: { turn }
    });
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.message.added',
      conversationId: input.conversationId,
      payload: { conversationId: input.conversationId, turn }
    });
    const conv = await this.store.get(input.conversationId);
    if (conv && conv.turns.length === 4) {
      publishTraceableEvent({
        source: 'conversation',
        kind: 'conversation.meaningful',
        conversationId: input.conversationId,
        payload: {
          conversationId: input.conversationId,
          message_count: conv.turns.length,
          ...(conv.scope ? { scope: conversationScopeKey(conv.scope) } : {})
        }
      });
    }
    return turn;
  }

  async addAnchor(conversationId: string, anchor: ConversationAnchor): Promise<void> {
    await this.store.addAnchor(conversationId, anchor);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.anchor.added',
      conversationId,
      payload: { anchor }
    });
  }

  async bindRuntime(
    conversationId: string,
    patch: {
      currentRunId?: string | null;
      runtimeHint?: string | null;
      vendorSessionId?: string | null;
    }
  ): Promise<void> {
    await this.store.updateRuntime(conversationId, patch);
  }

  async endConversation(conversationId: string): Promise<void> {
    await this.store.updateStatus(conversationId, 'ended');
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.ended',
      conversationId
    });
  }

  async updateConversation(
    conversationId: string,
    patch: { title?: string; summary?: string; tags?: string[]; archived?: boolean; scope?: ConversationScope }
  ): Promise<Conversation | null> {
    return this.store.updateMeta(conversationId, patch);
  }

  async archiveConversation(conversationId: string): Promise<Conversation | null> {
    const conv = await this.store.archive(conversationId);
    publishTraceableEvent({
      source: 'conversation',
      kind: 'conversation.ended',
      conversationId
    });
    return conv;
  }

  async getLastActive(scope: ConversationScope): Promise<Conversation | null> {
    return this.store.lastActive(scope);
  }

  async setLastActive(scope: ConversationScope, conversationId: string): Promise<void> {
    await this.store.setLastActive(scope, conversationId);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.store.get(conversationId);
  }

  async listConversations(): Promise<ConversationMeta[]> {
    return this.store.list();
  }

  async findByAnchor(kind: string, refId: string): Promise<ConversationMeta[]> {
    return this.store.findByAnchor(kind, refId);
  }
}
