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
import type { Artifact } from '@shared/stage';

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

// ---------- Runtime SDK ----------

export interface RuntimeSdkInvocationPayload {
  endpoint_id: string;
  endpoint_label?: string;
  model?: string;
  mode?: string;
  conversation_id?: string;
}

export interface RuntimeSdkCostPayload {
  endpoint_id: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  total_usd?: number;
}

/**
 * Agent 主循环里一次 tool_use 执行完成（成功或失败合并为一个事件，用 `ok` 区分）。
 *
 * Phase A：由 OrbitToolExecutor 在 CliHandlerRegistry 调用前后发布。
 */
export interface RuntimeSdkToolUseCompletedPayload {
  ok: boolean;
  tool_name: string;
  /** Anthropic tool_use.id（toolu_xxx），与 RuntimeEvent.spanId 同源便于 join。 */
  span_id: string;
  conversation_id?: string;
  run_id?: string;
  duration_ms: number;
  /** 失败时填错误码（如 'timeout' / 'invalid_params' / 'handler_error'）。 */
  error_code?: string;
  error_message?: string;
  /** 结果字符串化后的字节大小（截断前），便于排查 LLM 看到的 result 长度。 */
  result_size?: number;
  /** 该 tool 是否为 destructive，便于 Activity 投影统计。 */
  destructive?: boolean;
}

// ---------- Synthesis ----------

export interface SynthesisArtifactEventPayload {
  artifact_id: string;
  kind: string;
  scope_key: string;
  status: string;
  superseded_by?: string;
  error?: string;
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

export type ConversationMessageAddedPayload = ConversationTurnAddedPayload;

export interface ConversationMeaningfulPayload {
  conversationId: string;
  message_count: number;
  scope?: string;
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

export interface ExternalGatewayMessagePayload {
  platform: string;
  userId: string;
  capability?: string;
  requestId?: string;
  outcome?: string;
}

// ---------- Knowledge stack ----------

export interface NoteEventPayload {
  note_id: string;
  path?: string;
  type?: string;
  title?: string;
  body?: string;
  word_delta?: number;
  special_marker?: unknown;
  areas?: unknown;
  resource_refs?: string[];
  synthesis_ref?: string;
}

export interface LibraryEventPayload {
  item_id: string;
  title?: string;
  url?: string;
  status?: string;
  path?: string;
  artifact_id?: string;
  resource_ref?: string;
}

export interface DailySummaryEventPayload {
  date: string;
  note_path?: string;
  artifact_id?: string;
  headline?: string;
}

export interface FeedEventPayload {
  source_id?: string;
  item_id?: string;
  library_item_id?: string;
  title?: string;
  fetched?: number;
  created?: number;
  url?: string;
}

export interface KnowledgeBaseEventPayload {
  kb_id: string;
  name?: string;
  path?: string;
  item_count?: number;
  note_id?: string;
  source_file?: string;
  source_ref?: string;
}

export interface ParaEventPayload {
  entity_ref: string;
  target_ref?: string;
  kind?: string;
}

export interface ResourceEventPayload {
  resource_id: string;
  slug: string;
  title?: string;
  path?: string;
  status?: string;
  depth?: string;
  engagement_count?: number;
  areas?: unknown;
  ref_id?: string;
  ref_kind?: string;
  ref?: string;
  section?: string;
  engagement_id?: string;
  source?: string;
  note_count?: number;
  tag?: string;
}

export interface AreaEventPayload {
  area_uid: string;
  area_slug: string;
  title?: string;
  status?: string;
  tags?: string[];
  entity?: unknown;
}

export interface ScheduledTaskEventPayload {
  task_id: string;
  execution_id?: string;
  name?: string;
  status?: string;
  error?: string;
}

export interface StageArtifactPayload {
  conversation_id: string;
  artifact_id: string;
  artifact?: Artifact;
  action_id?: string;
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
  'runtime.sdk.invocation.started': RuntimeSdkInvocationPayload;
  'runtime.sdk.cost': RuntimeSdkCostPayload;
  'runtime.sdk.invocation.completed': RuntimeSdkInvocationPayload & { output_tokens?: number };
  'runtime.sdk.tool_use.completed': RuntimeSdkToolUseCompletedPayload;
  'synthesis.artifact.created': SynthesisArtifactEventPayload;
  'synthesis.artifact.stale': SynthesisArtifactEventPayload;
  'synthesis.artifact.superseded': SynthesisArtifactEventPayload;
  'synthesis.artifact.failed': SynthesisArtifactEventPayload;
  'synthesis.artifact.user_edited': SynthesisArtifactEventPayload;
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
  'conversation.message.added': ConversationMessageAddedPayload;
  'conversation.meaningful': ConversationMeaningfulPayload;
  'conversation.anchor.added': ConversationAnchorAddedPayload;
  'conversation.compacted': ConversationCompactedPayload;
  'conversation.ended': ConversationEndedPayload;
  'channel.inbound.message': ChannelInboundMessagePayload;
  'channel.outbound.message': ChannelOutboundMessagePayload;
  'channel.connected': ChannelStatePayload;
  'channel.disconnected': ChannelStatePayload;
  'external.gateway.message': ExternalGatewayMessagePayload;
  'external.gateway.connected': ChannelStatePayload;
  'external.gateway.disconnected': ChannelStatePayload;
  'note.created': NoteEventPayload;
  'note.updated': NoteEventPayload;
  'note.deleted': NoteEventPayload;
  'note.archived': NoteEventPayload;
  'library.item.added': LibraryEventPayload;
  'library.item.annotated': LibraryEventPayload;
  'library.item.status_changed': LibraryEventPayload;
  'library.item.read': LibraryEventPayload;
  'library.item.distilled': LibraryEventPayload;
  'library.item.linked_to_resource': LibraryEventPayload;
  'daily_summary.generated': DailySummaryEventPayload;
  'feed.source.added': FeedEventPayload;
  'feed.source.removed': FeedEventPayload;
  'feed.item.fetched': FeedEventPayload;
  'feed.item.seen': FeedEventPayload;
  'feed.item.ignored': FeedEventPayload;
  'feed.items.fetched': FeedEventPayload;
  'feed.item.saved_to_library': FeedEventPayload;
  'promote.feed_to_library': FeedEventPayload;
  'feed.item.dismissed': FeedEventPayload;
  'kb.imported': KnowledgeBaseEventPayload;
  'kb.removed': KnowledgeBaseEventPayload;
  'kb.scanned': KnowledgeBaseEventPayload;
  'kb.doc.activated': KnowledgeBaseEventPayload;
  'kb.activated': KnowledgeBaseEventPayload;
  'kb.welcome_analysis_completed': KnowledgeBaseEventPayload;
  'para.archived': ParaEventPayload;
  'para.unarchived': ParaEventPayload;
  'para.moved': ParaEventPayload;
  'scheduled_task.created': ScheduledTaskEventPayload;
  'scheduled_task.updated': ScheduledTaskEventPayload;
  'scheduled_task.deleted': ScheduledTaskEventPayload;
  'scheduled_task.paused': ScheduledTaskEventPayload;
  'scheduled_task.resumed': ScheduledTaskEventPayload;
  'scheduled_task.execution.started': ScheduledTaskEventPayload;
  'scheduled_task.execution.completed': ScheduledTaskEventPayload;
  'scheduled_task.execution.failed': ScheduledTaskEventPayload;
  'stage.artifact.added': StageArtifactPayload;
  'stage.artifact.updated': StageArtifactPayload;
  'stage.artifact.removed': StageArtifactPayload;
  'stage.artifact.action_executed': StageArtifactPayload;
  'resource.created': ResourceEventPayload;
  'resource.updated': ResourceEventPayload;
  'resource.ref.linked': ResourceEventPayload;
  'resource.ref.promoted': ResourceEventPayload;
  'resource.engagement': ResourceEventPayload;
  'resource.archived': ResourceEventPayload;
  'area.created': AreaEventPayload;
  'area.updated': AreaEventPayload;
  'area.assignment.added': AreaEventPayload;
  'area.assignment.removed': AreaEventPayload;
  'area.review.completed': AreaEventPayload;
  'area.archived': AreaEventPayload;
  'activity.user': ActivityPayload;
  'activity.system': ActivityPayload;
  'ipc.events.query': IpcEventsQueryPayload;
}
