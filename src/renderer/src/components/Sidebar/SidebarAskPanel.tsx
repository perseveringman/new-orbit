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
        label: '看板',
        detail: '整个 vault 的全局任务流。',
        title: '提问 · 看板'
      };
    }
    const project = projects.find((item) => item.uid === uid || item.slug === uid);
    return {
      scope: { kind: 'project', project_id: uid },
      label: project?.name ?? '项目',
      detail: '项目任务、素材、产出与最近上下文。',
      title: `提问 · ${project?.name ?? '项目'}`
    };
  }

  if (view.kind === 'areaRoom' || (view.kind === 'area' && view.areaUid)) {
    const areaUid = view.kind === 'areaRoom' ? view.areaUid : view.areaUid;
    if (!areaUid) {
      return {
        scope: { kind: 'global' },
        label: '领域',
        detail: '横跨职责与资源的全局 Area 上下文。',
        title: '提问 · 领域'
      };
    }
    const area = areas.find((item) => item.uid === areaUid || item.slug === areaUid);
    const slug = area?.slug ?? areaUid;
    return {
      scope: { kind: 'area', area_slug: slug },
      label: area?.name ?? slug,
      detail: 'Area 仪表盘、活跃职责、资源与笔记。',
      title: `提问 · ${area?.name ?? slug}`
    };
  }

  if (view.kind === 'resource') {
    return {
      scope: { kind: 'resource', resource_slug: view.resourceSlug },
      label: view.resourceSlug,
      detail: '资源概览、引用、任务、素材、产出与时间线。',
      title: `提问 · ${view.resourceSlug}`
    };
  }

  if (view.kind === 'editor' && activeFile) {
    return {
      scope: { kind: 'note', note_id: activeFile.relPath },
      label: activeFile.relPath.split('/').at(-1) ?? activeFile.relPath,
      detail: activeFile.relPath,
      title: `提问 · ${activeFile.relPath.split('/').at(-1) ?? '笔记'}`
    };
  }

  const label = workspaceLabel(view.kind);
  return {
    scope: { kind: 'global' },
    label,
    detail: '全局 vault 上下文、愿景、活跃项目、Area、资源与时间线。',
    title: `提问 · ${label}`
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
        <div className="font-semibold text-violet-800 dark:text-violet-200">基于上下文提问</div>
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
      return '仪表盘';
    case 'resources':
      return '资源';
    case 'inbox':
      return '收件箱';
    case 'timeline':
      return '时间线';
    case 'review':
      return '复盘';
    case 'library':
      return '资料库';
    case 'notes':
      return '笔记';
    case 'search':
      return '搜索';
    default:
      return '工作区';
  }
}
