/**
 * Conversation IPC — Chat 解耦 M3。
 *
 * 提供 renderer 端读取/创建 Conversation 的能力。M5 起 ChatHost 会成为
 * 主要消费者，但 M3 已先把 IPC 通道架好以便提前测试。
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  ChatAppendTurnInput,
  ChatCreateConversationInput,
  ChatUpdateConversationInput
} from '@shared/ipc';
import type {
  Conversation,
  ConversationMeta,
  ConversationScope,
  ConversationTurn
} from '@shared/conversation';
import { currentSession } from '../fs';
import { ConversationOrchestrator } from './orchestrator';

let orchestrator: ConversationOrchestrator | null = null;
let cachedVault: string | null = null;

function getOrchestrator(): ConversationOrchestrator {
  const sess = currentSession();
  if (!sess) throw new Error('no vault open');
  if (!orchestrator || cachedVault !== sess.vault) {
    orchestrator = new ConversationOrchestrator(sess.vault);
    cachedVault = sess.vault;
  }
  return orchestrator;
}

export function resetConversationOrchestrator(): void {
  orchestrator = null;
  cachedVault = null;
}

let wired = false;

export function registerConversationIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(
    IPC.chat.conversationGet,
    async (_e, id: string): Promise<Conversation | null> => getOrchestrator().getConversation(id)
  );

  ipcMain.handle(
    IPC.chat.conversationList,
    async (): Promise<ConversationMeta[]> => getOrchestrator().listConversations()
  );

  ipcMain.handle(
    IPC.chat.conversationCreate,
    async (_e, input: ChatCreateConversationInput): Promise<Conversation> =>
      getOrchestrator().createConversation(input)
  );

  ipcMain.handle(
    IPC.chat.conversationUpdate,
    async (_e, id: string, patch: ChatUpdateConversationInput): Promise<Conversation | null> =>
      getOrchestrator().updateConversation(id, patch)
  );

  ipcMain.handle(
    IPC.chat.conversationArchive,
    async (_e, id: string): Promise<Conversation | null> =>
      getOrchestrator().archiveConversation(id)
  );

  ipcMain.handle(
    IPC.chat.conversationAppendTurn,
    async (_e, input: ChatAppendTurnInput): Promise<ConversationTurn> =>
      getOrchestrator().appendTurn(input)
  );

  ipcMain.handle(
    IPC.chat.conversationFindByAnchor,
    async (_e, kind: string, refId: string): Promise<ConversationMeta[]> =>
      getOrchestrator().findByAnchor(kind, refId)
  );

  ipcMain.handle(
    IPC.chat.conversationLastActive,
    async (_e, scope: ConversationScope): Promise<Conversation | null> =>
      getOrchestrator().getLastActive(scope)
  );

  ipcMain.handle(
    IPC.chat.conversationSetLastActive,
    async (_e, scope: ConversationScope, id: string): Promise<void> =>
      getOrchestrator().setLastActive(scope, id)
  );
}
