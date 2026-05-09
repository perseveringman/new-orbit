export const ACTIVITY_SCHEMA_VERSION = 1;

export const ACTIVITY_ACTIONS = [
  'task.created',
  'task.updated',
  'task.status_changed',
  'task.deleted',
  'task.approved',
  'task.dependency_changed',
  'task.dependency_satisfied',
  'project.created',
  'project.archived',
  'project.updated',
  'area.created',
  'area.updated',
  'resource.created',
  'resource.updated',
  'inbox.message_created',
  'inbox.message_resolved',
  'inbox.message_dismissed',
  'inbox.capture_saved',
  'inbox.capture_processed',
  'inbox.capture_dismissed',
  'feed.subscription_added',
  'feed.subscription_removed',
  'feed.item_saved',
  'library.article_saved',
  'library.article_read',
  'library.article_promoted',
  'library.article_dismissed',
  'thought.created',
  'thought.promoted',
  'thought.dismissed',
  'mobile_capture.ingested',
  'mobile_capture.failed',
  'agent.run_started',
  'agent.run_completed',
  'agent.run_failed',
  'agent.tool_invoked',
  'agent.tool_failed',
  'agent.onboarding_checked',
  'agent.proposal_submitted',
  'agent.proposal_approved',
  'agent.proposal_rejected',
  'agent.merge_approved',
  'planner.proposal_published',
  'planner.proposal_revised',
  'settings.changed',
  'migration.v2_task_authorization'
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityActor = 'user' | 'agent' | 'system';

export interface ActivityContext {
  project_uid?: string;
  task_uid?: string;
  run_id?: string;
  area_uid?: string;
  resource_uid?: string;
  inbox_item_id?: string;
  proposal_id?: string;
  subscription_id?: string;
  library_id?: string;
  thought_id?: string;
  [key: string]: string | undefined;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actor: ActivityActor;
  actor_id?: string;
  action: ActivityAction;
  context: ActivityContext;
  payload?: unknown;
  summary: string;
}

export interface ActivityEventInput {
  actor: ActivityActor;
  actor_id?: string;
  action: ActivityAction;
  context?: ActivityContext;
  payload?: unknown;
  summary: string;
}

export interface ActivityQueryFilter {
  from?: string;
  to?: string;
  actor?: ActivityActor;
  action?: ActivityAction | ActivityAction[];
  actions?: ActivityAction[];
  project_uid?: string;
  task_uid?: string;
  limit?: number;
}

export interface ActivitySchemaFile {
  version: number;
  storage: 'daily-ndjson';
  event_schema: 'ActivityEvent';
  actions: readonly ActivityAction[];
}
