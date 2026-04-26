import type { ProjectSummaryDTO } from '@shared/ipc';
import type { WorkspaceView } from '../store/para';

export interface WorkspaceDestination {
  label: string;
  view: WorkspaceView;
  icon: string;
}

export const WORKSPACE_DESTINATIONS: WorkspaceDestination[] = [
  { label: 'Dashboard', view: { kind: 'dashboard' }, icon: '◎' },
  { label: 'Runtimes', view: { kind: 'runtimes' }, icon: '◫' },
  { label: 'Agents', view: { kind: 'agents' }, icon: '◌' },
  { label: 'Console', view: { kind: 'developerConsole' }, icon: '⌁' },
  { label: 'GitHub', view: { kind: 'github' }, icon: '⌘' },
  { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
  { label: 'Today', view: { kind: 'today' }, icon: '☼' },
  { label: 'Journals', view: { kind: 'journals' }, icon: '📓' },
  { label: 'Kanban', view: { kind: 'kanban', projectUid: null }, icon: '▦' }
];

export interface TopBarContext {
  eyebrow: string;
  title: string;
  detail: string;
  stateLabel: string | null;
}

interface TopBarContextInput {
  view: WorkspaceView;
  projects: Array<Pick<ProjectSummaryDTO, 'uid' | 'name' | 'description' | 'relPath'>>;
  activeProjectUid: string | null;
  activeFile: { relPath: string; dirty: boolean } | null;
  vaultPath: string | null;
}

const WORKSPACE_DETAILS: Record<
  | 'dashboard'
  | 'agents'
  | 'developerConsole'
  | 'github'
  | 'inbox'
  | 'today'
  | 'journals'
  | 'kanban'
  | 'runtimes',
  string
> = {
  dashboard: 'Vision, PARA health, and project activity.',
  agents: 'Inspect reusable role templates, versions, and cross-project execution coverage.',
  developerConsole: 'Replay traceable agent, inbox, activity, and IPC events.',
  github: 'Connect accounts, import repos, and monitor GitHub delivery state.',
  inbox: 'Capture and sort incoming work before it spreads.',
  today: 'Focus on the tasks scheduled for today.',
  journals: 'Review past daily notes and decisions.',
  kanban: 'Track task flow across active projects.',
  runtimes: 'Observe local providers, runtime capabilities, and orchestration load.'
};

export function deriveTopBarContext({
  view,
  projects,
  activeProjectUid,
  activeFile,
  vaultPath
}: TopBarContextInput): TopBarContext {
  const vaultLabel = getPathLeaf(vaultPath) ?? 'Workspace';

  if (view.kind === 'project') {
    const project = findProject(projects, view.projectUid ?? activeProjectUid);
    return {
      eyebrow: 'Project room',
      title: project?.name ?? 'Project',
      detail:
        cleanText(project?.description) ??
        project?.relPath ??
        `${vaultLabel} · Tasks, notes, and agent context for the active project.`,
      stateLabel: 'Active project'
    };
  }

  if (view.kind === 'editor') {
    if (activeFile) {
      return {
        eyebrow: 'Editor',
        title: getPathLeaf(activeFile.relPath) ?? activeFile.relPath,
        detail: activeFile.relPath,
        stateLabel: activeFile.dirty ? 'Unsaved changes' : null
      };
    }
    return {
      eyebrow: 'Editor',
      title: 'Workspace files',
      detail: `${vaultLabel} · Open a note or project file from the side panels.`,
      stateLabel: null
    };
  }

  if (view.kind === 'kanban' && view.projectUid) {
    const project = findProject(projects, view.projectUid ?? activeProjectUid);
    return {
      eyebrow: 'Project board',
      title: project ? `${project.name} Kanban` : 'Project Kanban',
      detail: cleanText(project?.description) ?? 'Track task flow for the selected project.',
      stateLabel: 'Focused board'
    };
  }

  if (view.kind === 'area' && view.areaUid) {
    return {
      eyebrow: 'Areas',
      title: 'Area overview',
      detail: 'Review projects and notes grouped under the selected area.',
      stateLabel: 'Filtered area'
    };
  }

  if (view.kind === 'area') {
    return {
      eyebrow: 'Areas',
      title: 'Areas',
      detail: `${vaultLabel} · Browse and manage long-lived responsibilities by area.`,
      stateLabel: null
    };
  }

  const title = WORKSPACE_DESTINATIONS.find((item) => item.view.kind === view.kind)?.label;
  const detail =
    view.kind === 'dashboard' ||
    view.kind === 'agents' ||
    view.kind === 'github' ||
    view.kind === 'developerConsole' ||
    view.kind === 'inbox' ||
    view.kind === 'today' ||
    view.kind === 'journals' ||
    view.kind === 'kanban' ||
    view.kind === 'runtimes'
      ? WORKSPACE_DETAILS[view.kind]
      : 'Move through your workbench from the sidebar.';

  return {
    eyebrow: 'Workspace',
    title: title ?? 'Orbit',
    detail: `${vaultLabel} · ${detail}`,
    stateLabel: null
  };
}

function findProject(
  projects: Array<Pick<ProjectSummaryDTO, 'uid' | 'name' | 'description' | 'relPath'>>,
  uid: string | null
): Pick<ProjectSummaryDTO, 'uid' | 'name' | 'description' | 'relPath'> | null {
  if (!uid) return null;
  return projects.find((project) => project.uid === uid) ?? null;
}

function getPathLeaf(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return null;
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
