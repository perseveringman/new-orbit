/**
 * Conversation 数据模型 — Chat 解耦 D-5（Conversation 一等公民）。
 *
 * 参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md §6
 */

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
  vendorSessionId?: string;
  title?: string;
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
