/**
 * Conversation 数据模型 — Chat 解耦 D-5（Conversation 一等公民）。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §6
 */

import type { ToolTraceBlock } from '@shared/agent-tools/tool-trace';
import type { SDKInvocationMessage } from '@shared/runtime';

export const CONVERSATION_ANCHOR_KINDS = [
  'task',
  'inbox_item',
  'ask_anywhere_session',
  'channel_thread',
  'external_session',
  'capture_item',
  'planner_session'
] as const;

export type ConversationAnchorKind = (typeof CONVERSATION_ANCHOR_KINDS)[number];

export interface ConversationAnchor {
  kind: ConversationAnchorKind;
  refId: string;
  addedAt: string;
}

export type ConversationTurnRole = 'user' | 'assistant' | 'system';

export type ConversationMessageRole = ConversationTurnRole | 'tool';

export interface ConversationTurn {
  id: string;
  at: string;
  role: ConversationTurnRole;
  content: string;
  runtimeEventIds?: string[];
  artifactRefs?: string[];
  /**
   * Phase B：assistant turn 持久化的 tool_use/tool_result 轨迹。
   * 跨 send() 重建 messages 时按此回放。
   * 仅在该轮触发了 agent tool_use 时存在。
   */
  toolTrace?: ToolTraceBlock[];
  /**
   * 精确回放给 SDK 的内部消息片段。
   * 用于保留 thinking/tool_use/tool_result 的原始顺序，避免多轮续写时丢失 provider 要求的块。
   */
  replayMessages?: SDKInvocationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: ConversationMessageRole;
  content: string;
  created_at: string;
  event_refs?: string[];
  artifact_refs?: string[];
}

export type ConversationStatus = 'active' | 'paused' | 'ended';
export type ConversationTitleSource = 'auto' | 'manual';

export type ConversationScope =
  | { kind: 'global' }
  | { kind: 'task'; task_id: string; project_id?: string }
  | { kind: 'project'; project_id: string }
  | { kind: 'area'; area_slug: string }
  | { kind: 'resource'; resource_slug: string }
  | { kind: 'note'; note_id: string }
  | { kind: 'library'; item_id: string }
  | { kind: 'external'; platform: string; user_id: string; session_id?: string };

export interface ConversationArtifactRef {
  artifact_id: string;
  kind: string;
  added_at: string;
  title?: string;
}

export interface ConversationMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ConversationStatus;
  anchors: ConversationAnchor[];
  scope?: ConversationScope;
  currentRunId?: string;
  runtimeHint?: string;
  runtimeEndpointHint?: string;
  runtimeModelHint?: string;
  vendorSessionId?: string;
  title?: string;
  titleSource?: ConversationTitleSource;
  titleGeneratedFromTurnId?: string;
  titleConfidence?: number;
  titleUpdatedAt?: string;
  summary?: string;
  tags?: string[];
  artifacts?: ConversationArtifactRef[];
  archived?: boolean;
}

export interface Conversation extends ConversationMeta {
  turns: ConversationTurn[];
}

export function isConversationAnchorKind(value: string): value is ConversationAnchorKind {
  return (CONVERSATION_ANCHOR_KINDS as readonly string[]).includes(value);
}

export function conversationScopeKey(scope: ConversationScope): string {
  switch (scope.kind) {
    case 'global':
      return 'global';
    case 'task':
      return `task:${scope.project_id ?? ''}:${scope.task_id}`;
    case 'project':
      return `project:${scope.project_id}`;
    case 'area':
      return `area:${scope.area_slug}`;
    case 'resource':
      return `resource:${scope.resource_slug}`;
    case 'note':
      return `note:${scope.note_id}`;
    case 'library':
      return `library:${scope.item_id}`;
    case 'external':
      return `external:${scope.platform}:${scope.user_id}:${scope.session_id ?? ''}`;
  }
}

export function anchorToConversationScope(anchor: ConversationAnchor): ConversationScope {
  if (anchor.kind === 'task') return { kind: 'task', task_id: anchor.refId };
  return { kind: 'global' };
}

export function turnToMessage(turn: ConversationTurn): ConversationMessage {
  return {
    id: turn.id,
    role: turn.role,
    content: turn.content,
    created_at: turn.at,
    ...(turn.runtimeEventIds ? { event_refs: turn.runtimeEventIds } : {}),
    ...(turn.artifactRefs ? { artifact_refs: turn.artifactRefs } : {})
  };
}
