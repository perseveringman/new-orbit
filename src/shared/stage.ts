export type ArtifactKind =
  | 'note.created'
  | 'library.item.added'
  | 'feed.source.added'
  | 'project.created'
  | 'area.created'
  | 'resource.created'
  | 'scheduled_task.created'
  | 'conversation.anchor_changed'
  | 'notes.retrieved'
  | 'library.items.retrieved'
  | 'kb.items.retrieved'
  | 'proposal.create_note'
  | 'proposal.create_project'
  | 'proposal.update_para'
  | 'proposal.run_task'
  | 'pmil.context_packet'
  | 'analysis.result'
  | 'welcome_analysis.result';

export interface ArtifactRef {
  kind: 'note' | 'library_item' | 'project' | 'area' | 'resource' | 'scheduled_task' | 'kb_item';
  ref: string;
  label?: string;
}

export interface ArtifactAction {
  id: string;
  label: string;
  kind: 'navigate' | 'execute' | 'dismiss' | 'edit_inline';
  target?: unknown;
  execute_fn?: string;
}

export interface Artifact {
  id: string;
  conversation_id: string;
  message_id?: string;
  kind: ArtifactKind;
  created_at: string;
  title: string;
  summary?: string;
  refs?: ArtifactRef[];
  payload: unknown;
  status: 'proposed' | 'confirmed' | 'rejected' | 'stale';
  actions?: ArtifactAction[];
}

export interface ConversationStage {
  conversation_id: string;
  artifacts: Artifact[];
  last_updated: string;
}
