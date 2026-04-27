/**
 * ChatHost — 业务 host 必须实现的接口
 *
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §4
 *
 * 每个业务场景（Task / Inbox / AskAnywhere / Channel）实现一个 ChatHost，
 * Chat 组件不感知具体 host，仅通过 capabilities 调整 UI 与 onAction 回传动作。
 */

import type { ChatAction } from './actions';

export interface ChatHostCapabilities {
  canSendMessage: boolean;
  canStop: boolean;
  canRetry: boolean;
  canCompact: boolean;
  canApproveTool: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsFileChanges: boolean;
}

export interface ActionBarItem {
  id: string;
  label: string;
  icon?: string;
  /** 该项被点击时由 host 处理；不走 ChatAction，因为本质是 host-specific。 */
  onClick: () => void;
  disabled?: boolean;
}

export interface ChatHost {
  readonly conversationId: string;
  readonly capabilities: ChatHostCapabilities;

  handleAction(action: ChatAction): void;

  getPlaceholderText?(): string;
  getWelcomeMessage?(): string;
  getActionBarItems?(): ActionBarItem[];
}

/** 默认 capabilities，host 可按需覆盖。 */
export const DEFAULT_CHAT_HOST_CAPABILITIES: ChatHostCapabilities = {
  canSendMessage: true,
  canStop: true,
  canRetry: false,
  canCompact: false,
  canApproveTool: false,
  supportsStreaming: true,
  supportsThinking: true,
  supportsFileChanges: false
};
