import type { ProjectSummaryDTO } from '@shared/ipc';
import type { WorkspaceView } from '../store/para';

export interface WorkspaceDestination {
  label: string;
  view: WorkspaceView;
  icon: string;
}

export const WORKSPACE_DESTINATIONS: WorkspaceDestination[] = [
  { label: 'Dashboard', view: { kind: 'dashboard' }, icon: '◎' },
  { label: 'Ask Anywhere', view: { kind: 'askAnywhere' }, icon: '✦' },
  { label: 'Vision', view: { kind: 'vision' }, icon: '✦' },
  { label: 'Runtimes', view: { kind: 'runtimes' }, icon: '◫' },
  { label: 'Tools', view: { kind: 'tools' }, icon: '⌘' },
  { label: 'Agents', view: { kind: 'agents' }, icon: '◌' },
  { label: 'Console', view: { kind: 'developerConsole' }, icon: '⌁' },
  { label: 'GitHub', view: { kind: 'github' }, icon: '⌘' },
  { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
  { label: 'Notes', view: { kind: 'notes' }, icon: '📝' },
  { label: 'Library', view: { kind: 'library' }, icon: '📚' },
  { label: 'Search', view: { kind: 'search' }, icon: '⌕' },
  { label: 'Memory', view: { kind: 'memory' }, icon: '🧠' },
  { label: 'Review', view: { kind: 'review' }, icon: '☑' },
  { label: 'Feeds', view: { kind: 'feeds' }, icon: '🛰️' },
  { label: 'Resources', view: { kind: 'resources' }, icon: '🧩' },
  { label: 'Knowledge', view: { kind: 'knowledgeBase' }, icon: '🧠' },
  { label: 'Timeline', view: { kind: 'timeline' }, icon: '☼' },
  { label: 'Scheduled', view: { kind: 'scheduled' }, icon: '⏰' },
  { label: 'Gateway', view: { kind: 'gateway' }, icon: '✈️' },
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
    | 'vision'
    | 'askAnywhere'
   | 'tools'
   | 'agents'
  | 'developerConsole'
   | 'github'
   | 'inbox'
   | 'notes'
    | 'library'
    | 'feeds'
    | 'search'
    | 'memory'
    | 'review'
    | 'resources'
    | 'resource'
    | 'knowledgeBase'
   | 'scheduled'
   | 'timeline'
   | 'gateway'
  | 'journals'
  | 'kanban'
  | 'runtimes',
  string
> = {
  dashboard: 'Vision, PARA health, and project activity.',
  askAnywhere: 'Persistent AI conversations across your vault context.',
  tools: 'Inspect registered Ask Anywhere tools, authority levels, and OpenClaw parity.',
  vision: 'Trace goals to Areas, Projects, Resources, and milestones.',
  agents: 'Inspect reusable role templates, versions, and cross-project execution coverage.',
  developerConsole: 'Replay traceable agent, inbox, activity, and IPC events.',
  github: 'Connect accounts, import repos, and monitor GitHub delivery state.',
  inbox: 'Capture and sort incoming work before it spreads.',
  notes: 'Create, search, and edit active Markdown notes.',
  library: 'Save and read source material before distillation.',
  search: 'Find Layer 1 truth and Layer 2 synthesis across the vault.',
  memory: 'Manage recalled preferences, lessons, interests, and patterns.',
  review: 'Generate weekly and monthly health findings with actions.',
  feeds: 'Manage subscriptions and triage incoming feed items.',
  resources: 'Cultivate topic workstations from repeated notes, links, people, and projects.',
  resource: 'Work inside one Resource Space with tasks, materials, outputs, chat, and timeline.',
  knowledgeBase: 'Import existing archives and activate excerpts into Notes.',
  scheduled: 'Manage recurring Orbit automations and execution history.',
  timeline: 'Review user-visible events as a daily life log.',
  gateway: 'Configure remote channels into Ask-Anywhere and Capture.',
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

  if (view.kind === 'resource') {
    return {
      eyebrow: 'Resource room',
      title: 'Resource',
      detail: `${vaultLabel} · Work inside one Resource Space with tasks, materials, outputs, chat, and timeline.`,
      stateLabel: 'Active resource'
    };
  }

  const title = WORKSPACE_DESTINATIONS.find((item) => item.view.kind === view.kind)?.label;
  const detail =
     view.kind === 'dashboard' ||
     view.kind === 'askAnywhere' ||
     view.kind === 'agents' ||
    view.kind === 'github' ||
    view.kind === 'developerConsole' ||
    view.kind === 'inbox' ||
    view.kind === 'notes' ||
    view.kind === 'library' ||
    view.kind === 'feeds' ||
    view.kind === 'resources' ||
    view.kind === 'knowledgeBase' ||
    view.kind === 'scheduled' ||
    view.kind === 'timeline' ||
    view.kind === 'gateway' ||
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
