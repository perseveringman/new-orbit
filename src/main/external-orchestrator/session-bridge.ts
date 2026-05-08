import { ConversationOrchestrator } from '../conversation/orchestrator';
import type { ExternalGatewayStore } from './store';
import type { ExternalGatewayUser } from '@shared/external-gateway-protocol';
import type { ExternalGatewaySessionMapping } from '@shared/external-gateway';

export class ExternalGatewaySessionBridge {
  private readonly conversations: ConversationOrchestrator;

  constructor(
    private readonly vaultPath: string,
    private readonly store: ExternalGatewayStore
  ) {
    this.conversations = new ConversationOrchestrator(vaultPath);
  }

  async resolveSession(input: {
    sessionId: string;
    user: ExternalGatewayUser;
  }): Promise<ExternalGatewaySessionMapping> {
    const existing = await this.store.getSession(input.sessionId);
    if (existing && !existing.archived) {
      return this.store.upsertSession({
        sessionId: input.sessionId,
        conversationId: existing.conversationId,
        platform: input.user.platform,
        userId: input.user.id,
        ...(input.user.name ? { userName: input.user.name } : {})
      });
    }

    const now = new Date().toISOString();
    const created = await this.conversations.createConversation({
      title: `${input.user.platform} · ${input.user.name ?? input.user.id}`,
      anchor: {
        kind: 'ask_anywhere_session',
        refId: `external:${input.sessionId}`,
        addedAt: now
      },
      scope: {
        kind: 'external',
        platform: input.user.platform,
        user_id: input.user.id,
        session_id: input.sessionId
      },
      runtimeHint: 'claude'
    });
    await this.conversations.addAnchor(created.id, {
      kind: 'channel_thread',
      refId: `${input.user.platform}:${input.sessionId}`,
      addedAt: now
    });
    await this.conversations.addAnchor(created.id, {
      kind: 'external_session',
      refId: input.sessionId,
      addedAt: now
    });
    return this.store.upsertSession({
      sessionId: input.sessionId,
      conversationId: created.id,
      platform: input.user.platform,
      userId: input.user.id,
      ...(input.user.name ? { userName: input.user.name } : {})
    });
  }

  async closeSession(sessionId: string): Promise<ExternalGatewaySessionMapping | null> {
    const mapping = await this.store.archiveSession(sessionId);
    if (mapping) await this.conversations.archiveConversation(mapping.conversationId);
    return mapping;
  }

  conversationOrchestrator(): ConversationOrchestrator {
    return this.conversations;
  }

  vault(): string {
    return this.vaultPath;
  }
}

