import type { ProjectSummaryDTO } from '@shared/ipc';
import type { WorkspaceView } from '../store/para';

export interface WorkspaceDestination {
  label: string;
  view: WorkspaceView;
  icon: string;
}

export const WORKSPACE_DESTINATIONS: WorkspaceDestination[] = [
  { label: '仪表盘', view: { kind: 'dashboard' }, icon: '◎' },
  { label: '随处问', view: { kind: 'askAnywhere' }, icon: '✦' },
  { label: '愿景', view: { kind: 'vision' }, icon: '✦' },
  { label: 'AI 控制台', view: { kind: 'runtimes' }, icon: '◫' },
  { label: '工具', view: { kind: 'tools' }, icon: '⌘' },
  { label: '角色模板', view: { kind: 'agents' }, icon: '◌' },
  { label: '开发者控制台', view: { kind: 'developerConsole' }, icon: '⌁' },
  { label: 'GitHub', view: { kind: 'github' }, icon: '⌘' },
  { label: '收件箱', view: { kind: 'inbox' }, icon: '📥' },
  { label: '笔记', view: { kind: 'notes' }, icon: '📝' },
  { label: '资料库', view: { kind: 'library' }, icon: '📚' },
  { label: '搜索', view: { kind: 'search' }, icon: '⌕' },
  { label: '记忆', view: { kind: 'memory' }, icon: '🧠' },
  { label: '复盘', view: { kind: 'review' }, icon: '☑' },
  { label: '信息流', view: { kind: 'feeds' }, icon: '🛰️' },
  { label: '资源', view: { kind: 'resources' }, icon: '🧩' },
  { label: '知识库', view: { kind: 'knowledgeBase' }, icon: '🧠' },
  { label: '时间线', view: { kind: 'timeline' }, icon: '☼' },
  { label: '计划任务', view: { kind: 'scheduled' }, icon: '⏰' },
  { label: '网关', view: { kind: 'gateway' }, icon: '✈️' },
  { label: '日志', view: { kind: 'journals' }, icon: '📓' },
  { label: '看板', view: { kind: 'kanban', projectUid: null }, icon: '▦' }
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
  dashboard: '查看愿景、PARA 健康度和项目动态。',
  askAnywhere: '围绕 vault 上下文持续进行 AI 对话。',
  tools: '检查已注册的随处问工具、权限级别和 OpenClaw 对齐进度。',
  vision: '追踪目标与领域、项目、资源、里程碑之间的关系。',
  agents: '查看可复用角色模板、版本和跨项目执行覆盖。',
  developerConsole: '回放可追踪的 agent、收件箱、活动和 IPC 事件。',
  github: '连接账号、导入仓库并监控 GitHub 交付状态。',
  inbox: '在工作扩散前捕获并整理输入。',
  notes: '创建、搜索并编辑活跃 Markdown 笔记。',
  library: '在提炼前保存并阅读源材料。',
  search: '在 vault 中查找 Layer 1 事实和 Layer 2 综合结果。',
  memory: '管理被唤回的偏好、经验、兴趣和模式。',
  review: '生成每周和每月健康检查，并转化为行动。',
  feeds: '管理订阅并处理进入的信息流条目。',
  resources: '从重复出现的笔记、链接、人物和项目中培育主题资源工作站。',
  resource: '在单个资源空间中处理任务、材料、产出、聊天和时间线。',
  knowledgeBase: '导入已有档案，并将片段激活为笔记。',
  scheduled: '管理 Orbit 周期自动化和执行历史。',
  timeline: '以每日生活日志形式复盘用户可见事件。',
  gateway: '配置进入随处问和捕获流程的远程通道。',
  journals: '回顾过往每日笔记和决策。',
  kanban: '追踪活跃项目的任务流转。',
  runtimes: '管理 CLI runtime、SDK 端点、角色路由和编排健康度。'
};

export function deriveTopBarContext({
  view,
  projects,
  activeProjectUid,
  activeFile,
  vaultPath
}: TopBarContextInput): TopBarContext {
  const vaultLabel = getPathLeaf(vaultPath) ?? '工作区';

  if (view.kind === 'project') {
    const project = findProject(projects, view.projectUid ?? activeProjectUid);
    return {
      eyebrow: '项目空间',
      title: project?.name ?? '项目',
      detail:
        cleanText(project?.description) ??
        project?.relPath ??
        `${vaultLabel} · 当前项目的任务、笔记和 agent 上下文。`,
      stateLabel: '活跃项目'
    };
  }

  if (view.kind === 'editor') {
    if (activeFile) {
      return {
        eyebrow: '编辑器',
        title: getPathLeaf(activeFile.relPath) ?? activeFile.relPath,
        detail: activeFile.relPath,
        stateLabel: activeFile.dirty ? '有未保存更改' : null
      };
    }
    return {
      eyebrow: '编辑器',
      title: '工作区文件',
      detail: `${vaultLabel} · 从侧边栏打开笔记或项目文件。`,
      stateLabel: null
    };
  }

  if (view.kind === 'kanban' && view.projectUid) {
    const project = findProject(projects, view.projectUid ?? activeProjectUid);
    return {
      eyebrow: '项目看板',
      title: project ? `${project.name} 看板` : '项目看板',
      detail: cleanText(project?.description) ?? '追踪所选项目的任务流转。',
      stateLabel: '聚焦看板'
    };
  }

  if (view.kind === 'area' && view.areaUid) {
    return {
      eyebrow: '领域',
      title: '领域概览',
      detail: '复盘所选领域下的项目和笔记。',
      stateLabel: '已筛选领域'
    };
  }

  if (view.kind === 'area') {
    return {
      eyebrow: '领域',
      title: '领域',
      detail: `${vaultLabel} · 按领域浏览和管理长期职责。`,
      stateLabel: null
    };
  }

  if (view.kind === 'resource') {
    return {
      eyebrow: '资源空间',
      title: '资源',
      detail: `${vaultLabel} · 在单个资源空间中处理任务、材料、产出、聊天和时间线。`,
      stateLabel: '活跃资源'
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
      : '通过侧边栏在工作台中切换。';

  return {
    eyebrow: '工作台',
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
