/**
 * Chat 组件类型定义 — 业务无关。
 *
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §5
 *
 * 严禁在该目录引入业务概念（grep 验证）。
 */

import type {
  ChatAction,
  ChatHostCapabilities,
  RuntimeEvent,
  ActionBarItem
} from '@shared/chat-protocol';

export interface ChatProps {
  conversationId: string;
  capabilities: ChatHostCapabilities;

  events: RuntimeEvent[];
  isLoading: boolean;

  onAction: (action: ChatAction) => void;

  placeholder?: string;
  welcomeMessage?: string;
  actionBarItems?: ActionBarItem[];

  theme?: 'light' | 'dark' | 'system';
}

export type { ChatAction, ChatHostCapabilities, RuntimeEvent, ActionBarItem };
