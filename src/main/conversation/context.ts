import type { ConversationScope } from '@shared/conversation';

export interface ConversationContextSummary {
  scope: ConversationScope;
  title: string;
  hints: string[];
}

export function summarizeConversationScope(scope: ConversationScope): ConversationContextSummary {
  switch (scope.kind) {
    case 'global':
      return { scope, title: 'Global Ask-Anywhere', hints: ['Vision', 'recent timeline', 'active projects'] };
    case 'task':
      return { scope, title: `Task ${scope.task_id}`, hints: ['task definition', 'project context', 'active run'] };
    case 'project':
      return { scope, title: `Project ${scope.project_id}`, hints: ['README', 'tasks', 'recent events'] };
    case 'area':
      return { scope, title: `Area ${scope.area_slug}`, hints: ['area dashboard', 'resources', 'recent notes'] };
    case 'resource':
      return { scope, title: `Resource ${scope.resource_slug}`, hints: ['resource index', 'refs', 'timeline'] };
    case 'note':
      return { scope, title: `Note ${scope.note_id}`, hints: ['note body', 'backlinks'] };
    case 'library':
      return { scope, title: `Library ${scope.item_id}`, hints: ['library item', 'annotations', 'related resources'] };
    case 'external':
      return { scope, title: `${scope.platform} ${scope.user_id}`, hints: ['external session', 'conversation history', 'vault context'] };
  }
}
