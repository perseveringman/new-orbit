/**
 * TraceableEvent payload 类型映射。
 *
 * 每个 TraceableEventKind 对应一个 payload 接口。
 * 当 publisher 提供 `kind` 时，`payload` 应符合此处的契约。
 *
 * 注意：当前处于迁移 Phase 1，旧 publisher 仍以 string `type` + unknown payload 写入；
 * 此映射只对走 `kind` 路径的新 publisher 强制约束。
 */

import type { UnifiedAgentEvent, UnifiedAgentRuntimeRef } from '@shared/agent-event';

// ---------- Agent ----------

export interface AgentRunStartedPayload {
  runId: string;
  taskId?: string;
  prompt?: string;
  cwd?: string;
  runtime: UnifiedAgentRuntimeRef;
}

export type AgentRunEventPayload = UnifiedAgentEvent;

export interface AgentRunCompletedPayload {
  runId: string;
  exitCode?: number | null;
  reason?: string;
  cost?: UnifiedAgentEvent['cost'];
}

export interface AgentRunInterruptedPayload {
  runId: string;
  reason: string;
}

// ---------- Inbox ----------

export interface InboxItemPayload {
  itemId: string;
  itemType?: string;
  title?: string;
  source?: string;
  /** 兼容旧 InboxEvent，允许携带原始 event 对象。 */
  raw?: unknown;
}

// ---------- Task ----------

export interface TaskBasicPayload {
  taskId: string;
  taskUid?: string;
  title?: string;
}

export interface TaskProposedPayload extends TaskBasicPayload {
  projectId?: string;
  source?: string;
}

export interface TaskStartedPayload extends TaskBasicPayload {
  runId: string;
}

export interface TaskCompletedPayload extends TaskBasicPayload {
  outcome?: string;
}

export interface TaskFailedPayload extends TaskBasicPayload {
  error: string;
}

// ---------- Conversation（D-5） ----------

export interface ConversationStartedPayload {
  conversationId: string;
  anchors: Array<{ kind: string; refId: string }>;
  runtimeHint?: string;
}

export interface ConversationTurnAddedPayload {
  conversationId: string;
  turn: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    at: string;
  };
}

export interface ConversationAnchorAddedPayload {
  conversationId: string;
  anchor: { kind: string; refId: string };
}

export interface ConversationCompactedPayload {
  conversationId: string;
  removedTurnCount: number;
  newContextTokens?: number;
}

export interface ConversationEndedPayload {
  conversationId: string;
  reason: string;
}

// ---------- Channel ----------

export interface ChannelInboundMessagePayload {
  channel: string;
  threadId: string;
  userId?: string;
  text: string;
  raw?: unknown;
}

export interface ChannelOutboundMessagePayload {
  channel: string;
  threadId: string;
  text: string;
}

export interface ChannelStatePayload {
  channel: string;
  reason?: string;
}

// ---------- Activity ----------

export interface ActivityPayload {
  action: string;
  context?: Record<string, unknown>;
  actor?: string;
  summary?: string;
  payload?: unknown;
}

// ---------- IPC ----------

export interface IpcEventsQueryPayload {
  filter?: unknown;
}

// ---------- 映射 ----------

export interface TraceableEventPayloadMap {
  'agent.run.started': AgentRunStartedPayload;
  'agent.run.event': AgentRunEventPayload;
  'agent.run.completed': AgentRunCompletedPayload;
  'agent.run.interrupted': AgentRunInterruptedPayload;
  'inbox.item.created': InboxItemPayload;
  'inbox.item.updated': InboxItemPayload;
  'inbox.item.snoozed': InboxItemPayload;
  'inbox.item.archived': InboxItemPayload;
  'inbox.item.resolved': InboxItemPayload;
  'inbox.item.dismissed': InboxItemPayload;
  'task.proposed': TaskProposedPayload;
  'task.approved': TaskBasicPayload;
  'task.started': TaskStartedPayload;
  'task.completed': TaskCompletedPayload;
  'task.failed': TaskFailedPayload;
  'conversation.started': ConversationStartedPayload;
  'conversation.turn.added': ConversationTurnAddedPayload;
  'conversation.anchor.added': ConversationAnchorAddedPayload;
  'conversation.compacted': ConversationCompactedPayload;
  'conversation.ended': ConversationEndedPayload;
  'channel.inbound.message': ChannelInboundMessagePayload;
  'channel.outbound.message': ChannelOutboundMessagePayload;
  'channel.connected': ChannelStatePayload;
  'channel.disconnected': ChannelStatePayload;
  'activity.user': ActivityPayload;
  'activity.system': ActivityPayload;
  'ipc.events.query': IpcEventsQueryPayload;
}
