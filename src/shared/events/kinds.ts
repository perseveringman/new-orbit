/**
 * TraceableEvent 强类型 kind 枚举。
 *
 * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling/02-app-bus-design.md §3.2
 *
 * 迁移策略（§3.4）：
 *   Phase 1：`kind` 与 `type` 并存。新代码优先 `kind`，旧代码继续 `type`，bus 自动镜像。
 *   Phase 2：所有 publisher 迁移到 `kind`。
 *   Phase 3：删除 `type`。
 *
 * 当前处于 Phase 1。
 */

export const TRACEABLE_EVENT_KINDS = [
  // Agent
  'agent.run.started',
  'agent.run.event',
  'agent.run.completed',
  'agent.run.interrupted',
  // Inbox
  'inbox.item.created',
  'inbox.item.updated',
  'inbox.item.snoozed',
  'inbox.item.archived',
  'inbox.item.resolved',
  'inbox.item.dismissed',
  // Task
  'task.proposed',
  'task.approved',
  'task.started',
  'task.completed',
  'task.failed',
  // Conversation（D-5）
  'conversation.started',
  'conversation.turn.added',
  'conversation.anchor.added',
  'conversation.compacted',
  'conversation.ended',
  // Channel（D-3 / D-4，预留）
  'channel.inbound.message',
  'channel.outbound.message',
  'channel.connected',
  'channel.disconnected',
  // Knowledge stack（Phase 2）
  'note.created',
  'note.updated',
  'note.deleted',
  'note.archived',
  'library.item.added',
  'library.item.annotated',
  'library.item.status_changed',
  'library.item.read',
  'library.item.distilled',
  'feed.source.added',
  'feed.source.removed',
  'feed.items.fetched',
  'feed.item.saved_to_library',
  'feed.item.dismissed',
  'kb.imported',
  'kb.removed',
  'kb.scanned',
  'kb.activated',
  'kb.welcome_analysis_completed',
  'para.archived',
  'para.unarchived',
  'para.moved',
  'scheduled_task.created',
  'scheduled_task.updated',
  'scheduled_task.deleted',
  'scheduled_task.paused',
  'scheduled_task.resumed',
  'scheduled_task.execution.started',
  'scheduled_task.execution.completed',
  'scheduled_task.execution.failed',
  'stage.artifact.added',
  'stage.artifact.updated',
  'stage.artifact.removed',
  'stage.artifact.action_executed',
  'resource.created',
  'resource.engagement',
  // Activity
  'activity.user',
  'activity.system',
  // IPC（既有）
  'ipc.events.query'
] as const;

export type TraceableEventKind = (typeof TRACEABLE_EVENT_KINDS)[number];

/**
 * 判断给定字符串是否为已注册的 TraceableEventKind。
 */
export function isTraceableEventKind(value: string): value is TraceableEventKind {
  return (TRACEABLE_EVENT_KINDS as readonly string[]).includes(value);
}
