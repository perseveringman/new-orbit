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
import type {
  ComposerCapabilities,
  ComposerOptions,
  ComposerSourceSurface,
  RuntimeSelection
} from '@shared/ai-composer';

export interface ChatProps {
  conversationId: string;
  capabilities: ChatHostCapabilities;

  events: RuntimeEvent[];
  isLoading: boolean;

  onAction: (action: ChatAction) => void;

  placeholder?: string;
  welcomeMessage?: string;
  actionBarItems?: ActionBarItem[];
  composerOptions?: ComposerOptions;
  composerSelection?: RuntimeSelection;
  composerSourceSurface?: ComposerSourceSurface;
  composerCapabilities?: Partial<ComposerCapabilities>;
  onComposerSelectionChange?: (selection: RuntimeSelection) => void;

  /** Host 自定义顶栏（M5/P2.3 visual parity）：渲染在 ActionBar 之上。 */
  headerSlot?: import('react').ReactNode;
  /** Host 自定义事件流上方的内容（M5/P2.3 visual parity）。 */
  beforeEventsSlot?: import('react').ReactNode;

  theme?: 'light' | 'dark' | 'system';
}

export type { ChatAction, ChatHostCapabilities, RuntimeEvent, ActionBarItem };
