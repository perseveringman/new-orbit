/**
 * Ask-Anywhere IPC 层（Chat 解耦 P0）。
 *
 * 接管 IPC.chat.action 通道：
 *   - chat.send_message → AskAnywhereOrchestrator.send
 *   - chat.stop         → AskAnywhereOrchestrator.stop
 *   - 其它 kind         → 暂时忽略（M5 起 TaskChatHost 也会路由到这里）
 *
 * 设计要点：
 *  - 仅当 conversation 的 anchor 包含 ask_anywhere_session 时才在此处理。
 *  - 其它 anchor（task / inbox_item）暂直接忽略（不抛错，避免破坏 ChatView）。
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChatAction } from '@shared/chat-protocol';
import { currentSession } from '../fs';
import { detectClaude } from '../agent/cli';
import { getPool } from '../agent/pool';
import { ConversationOrchestrator } from '../conversation/orchestrator';
import { getSettings } from '../settings';
import { getHookRuntimeConfig } from '../agent/ipc';
import { getSDKRuntime } from '../runtime/sdk/ipc';
import { AskAnywhereOrchestrator } from './orchestrator';

let orchestrator: AskAnywhereOrchestrator | null = null;
let conversations: ConversationOrchestrator | null = null;
let cachedVault: string | null = null;

function getConversations(): ConversationOrchestrator {
  const sess = currentSession();
  if (!sess) throw new Error('no_vault');
  if (!conversations || cachedVault !== sess.vault) {
    conversations = new ConversationOrchestrator(sess.vault);
    cachedVault = sess.vault;
  }
  return conversations;
}

export function getAskAnywhereOrchestrator(): AskAnywhereOrchestrator {
  if (!orchestrator) {
    orchestrator = new AskAnywhereOrchestrator({
      conversations: getConversations(),
      pool: getPool(),
      resolveClaudePath: async () => {
        const detect = await detectClaude();
        return detect.available && detect.path ? detect.path : null;
      },
      getVaultPath: () => currentSession()?.vault ?? null,
      getHookConfig: async () => {
        try {
          return await getHookRuntimeConfig();
        } catch {
          return undefined;
        }
      },
      getApiKey: async () => {
        try {
          const settings = await getSettings();
          const key = (settings as unknown as { anthropicApiKey?: string }).anthropicApiKey;
          return key ?? process.env['ANTHROPIC_API_KEY'];
        } catch {
          return process.env['ANTHROPIC_API_KEY'];
        }
      },
      getRuntimeRouter: () => {
        const vault = currentSession()?.vault;
        return vault ? getSDKRuntime(vault).router : null;
      }
    });
  }
  return orchestrator;
}

export function resetAskAnywhereOrchestrator(): void {
  orchestrator = null;
  conversations = null;
  cachedVault = null;
}

let wired = false;

export function registerAskAnywhereChatIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(IPC.chat.action, async (_e, action: ChatAction): Promise<void> => {
    if (!action || typeof action !== 'object' || !action.kind || !action.conversationId) return;
    try {
      const orch = getAskAnywhereOrchestrator();
      // 仅处理 Ask-Anywhere anchor 的会话；其它 anchor 暂时忽略
      const conv = await getConversations().getConversation(action.conversationId);
      if (!conv) return;
      const isAskAnywhere = conv.anchors.some((a) => a.kind === 'ask_anywhere_session');
      if (!isAskAnywhere) return;

      switch (action.kind) {
        case 'chat.send_message': {
          const payload = action.payload as { text: string };
          await orch.send(action.conversationId, payload.text);
          break;
        }
        case 'chat.stop':
          await orch.stop(action.conversationId);
          break;
        default:
          // chat.retry / approve_tool / reject_tool 等：M5+ 实现
          break;
      }
    } catch (err) {
      // 错误已通过 emitSyntheticError 推到 ChatView，这里仅日志
      console.warn('[ask-anywhere] action failed', { kind: action.kind, error: (err as Error).message });
    }
  });
}
