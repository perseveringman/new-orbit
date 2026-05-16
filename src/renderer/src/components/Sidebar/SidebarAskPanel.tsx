import type { ConversationScope } from '@shared/conversation';
import type { AreaSummaryDTO, ProjectSummaryDTO } from '@shared/ipc';
import { useMemo } from 'react';
import { useAskAnywhereSession } from '../ask-anywhere/AskAnywhereHost';
import { ConversationShell } from '../conversation';
import { useFiles } from '../../store/files';
import { usePara, type WorkspaceView } from '../../store/para';
import { useWorkspace } from '../../store/workspace';

export interface SidebarAskContext {
  scope: ConversationScope;
  label: string;
  detail: string;
  title: string;
}

interface ActiveFileLike {
  relPath: string;
}

export function deriveSidebarAskContext(input: {
  view: WorkspaceView;
  activeFile: ActiveFileLike | null;
  activeProjectUid: string | null;
  projects: Array<Pick<ProjectSummaryDTO, 'uid' | 'slug' | 'name'>>;
  areas: Array<Pick<AreaSummaryDTO, 'uid' | 'slug' | 'name'>>;
}): SidebarAskContext {
  const { view, activeFile, activeProjectUid, projects, areas } = input;

  if (view.kind === 'project' || view.kind === 'kanban') {
    const uid = view.kind === 'project' ? view.projectUid : (view.projectUid ?? activeProjectUid);
    if (!uid) {
      return {
        scope: { kind: 'global' },
        label: 'Kanban',
        detail: 'Global task flow across the vault.',
        title: 'Ask · Kanban'
      };
    }
    const project = projects.find((item) => item.uid === uid || item.slug === uid);
    return {
      scope: { kind: 'project', project_id: uid },
      label: project?.name ?? 'Project',
      detail: 'Project tasks, materials, outputs, and recent context.',
      title: `Ask · ${project?.name ?? 'Project'}`
    };
  }

  if (view.kind === 'areaRoom' || (view.kind === 'area' && view.areaUid)) {
    const areaUid = view.kind === 'areaRoom' ? view.areaUid : view.areaUid;
    if (!areaUid) {
      return {
        scope: { kind: 'global' },
        label: 'Areas',
        detail: 'Global Area context across responsibilities and resources.',
        title: 'Ask · Areas'
      };
    }
    const area = areas.find((item) => item.uid === areaUid || item.slug === areaUid);
    const slug = area?.slug ?? areaUid;
    return {
      scope: { kind: 'area', area_slug: slug },
      label: area?.name ?? slug,
      detail: 'Area dashboard, active responsibilities, resources, and notes.',
      title: `Ask · ${area?.name ?? slug}`
    };
  }

  if (view.kind === 'resource') {
    return {
      scope: { kind: 'resource', resource_slug: view.resourceSlug },
      label: view.resourceSlug,
      detail: 'Resource overview, refs, tasks, materials, outputs, and timeline.',
      title: `Ask · ${view.resourceSlug}`
    };
  }

  if (view.kind === 'editor' && activeFile) {
    return {
      scope: { kind: 'note', note_id: activeFile.relPath },
      label: activeFile.relPath.split('/').at(-1) ?? activeFile.relPath,
      detail: activeFile.relPath,
      title: `Ask · ${activeFile.relPath.split('/').at(-1) ?? 'Note'}`
    };
  }

  const label = workspaceLabel(view.kind);
  return {
    scope: { kind: 'global' },
    label,
    detail: 'Global vault context, Vision, active Projects, Areas, Resources, and Timeline.',
    title: `Ask · ${label}`
  };
}

export function SidebarAskPanel(): JSX.Element {
  const view = usePara((state) => state.view);
  const activeFile = useFiles((state) => state.active);
  const activeProjectUid = useWorkspace((state) => state.activeProjectUid);
  const projects = useWorkspace((state) => state.projects);
  const areas = useWorkspace((state) => state.areas);
  const askContext = useMemo(
    () => deriveSidebarAskContext({ view, activeFile, activeProjectUid, projects, areas }),
    [activeFile, activeProjectUid, areas, projects, view]
  );
  const {
    sessions,
    activeId,
    activeConversation,
    events,
    stage,
    isLoading,
    selectActiveId,
    handleNew,
    handleArchive,
    handleAction,
    handleArtifactAction
  } = useAskAnywhereSession({
    scope: askContext.scope,
    title: askContext.title
  });

  return (
    <div className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="shrink-0 border-b border-neutral-200 bg-violet-50/70 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-violet-950/20">
        <div className="font-semibold text-violet-800 dark:text-violet-200">Ask in context</div>
        <div className="mt-1 truncate text-neutral-600 dark:text-neutral-300">{askContext.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{askContext.detail}</div>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationShell
          variant="compact"
          conversations={sessions}
          activeId={activeId}
          activeConversation={activeConversation}
          events={events}
          stage={stage}
          isLoading={isLoading}
          onSelect={selectActiveId}
          onNew={() => void handleNew()}
          onArchive={(id) => void handleArchive(id)}
          onAction={(action) => void handleAction(action)}
          onArtifactAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)}
          composerSourceSurface="sidebar_ask"
          welcomeMessage={`围绕 ${askContext.label} 提问，Orbit 会自动带上当前上下文。`}
        />
      </div>
    </div>
  );
}

function workspaceLabel(kind: WorkspaceView['kind']): string {
  switch (kind) {
    case 'dashboard':
      return 'Dashboard';
    case 'resources':
      return 'Resources';
    case 'inbox':
      return 'Inbox';
    case 'timeline':
      return 'Timeline';
    case 'review':
      return 'Review';
    case 'library':
      return 'Library';
    case 'notes':
      return 'Notes';
    case 'search':
      return 'Search';
    default:
      return 'Workspace';
  }
}
