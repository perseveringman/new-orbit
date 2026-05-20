import type { ActivityEvent } from './activity';

export type DashboardWidgetId =
  | 'north-star'
  | 'decision-queue'
  | 'ready-work'
  | 'blocked-work'
  | 'agent-channel'
  | 'execution-queue'
  | 'knowledge-loop'
  | 'feed-radar'
  | 'library-digest'
  | 'resource-momentum'
  | 'area-balance'
  | 'system-pulse'
  | 'recent-activity';

export type DashboardWidgetSize = 'small' | 'wide' | 'large';

export type DashboardWidgetCategory =
  | 'vision'
  | 'execution'
  | 'knowledge'
  | 'signal'
  | 'system';

export type DashboardWidgetDataLayer = 'layer0' | 'layer1' | 'layer2' | 'system';

export type DashboardWidgetPermission =
  | 'read-only'
  | 'synthesis'
  | 'requires-approval-write';

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  description: string;
  category: DashboardWidgetCategory;
  defaultSize: DashboardWidgetSize;
  sizes: DashboardWidgetSize[];
  layers: DashboardWidgetDataLayer[];
  permissions: DashboardWidgetPermission[];
}

export interface DashboardWidgetInstance {
  instanceId: string;
  widgetId: DashboardWidgetId;
  size: DashboardWidgetSize;
  enabled: boolean;
  order: number;
}

export type DashboardLayoutPreset = 'strategic' | 'today' | 'custom';

export interface DashboardLayout {
  version: 1;
  preset: DashboardLayoutPreset;
  widgets: DashboardWidgetInstance[];
  updatedAt: string;
}

export interface DashboardWidgetRegistry {
  widgets: DashboardWidgetDefinition[];
  defaultLayout: DashboardLayout;
}

export interface DashboardPendingStats {
  inboxPending: number;
  blockedTasks: number;
  pendingTasks: number;
}

export interface DashboardAgentStats {
  doingTasks: number;
  activeRuns: number;
  todayCostUsd: number;
  autoRunnerEnabled: boolean;
  onlineRuntimes: number;
}

export interface DashboardKnowledgeStats {
  period: 'week';
  feedSaved: number;
  libraryAdded: number;
  thoughtsCreated: number;
  promotedToResource: number;
  promotedToProject: number;
  activeProjects: number;
  archivedProjects: number;
}

export interface DashboardThinkingStats {
  dailyReviewAvailable: boolean;
  dailyReviewDate: string | null;
  dailyReviewPath?: string;
  recentActivities: ActivityEvent[];
  visionLastReviewed: string | null;
  visionDaysSinceReview: number | null;
  recentThinkingTrails: string[];
}

export interface DashboardSystemHealth {
  disk: {
    vaultSizeBytes: number;
    worktreeSizeBytes: number;
    orbitDataSizeBytes: number;
  };
  git: {
    dirtyProjects: Array<{ projectName: string; uncommittedFiles: number }>;
  };
  runtimes: Array<{
    id: string;
    provider: string;
    status: 'online' | 'offline';
    activeRuns: number;
    maxConcurrent: number;
  }>;
  budget: {
    todayUsd: number;
    monthUsd: number;
    defaultLimitPerTask: number;
  };
}

export interface DashboardSummary {
  pending: DashboardPendingStats;
  agent: DashboardAgentStats;
  knowledge: DashboardKnowledgeStats;
  thinking: DashboardThinkingStats;
  health: DashboardSystemHealth;
}

export const DASHBOARD_WIDGET_DEFINITIONS: DashboardWidgetDefinition[] = [
  {
    id: 'north-star',
    title: '北极星',
    description: '展示 Vision 摘要和复盘入口，让仪表盘先回答方向问题。',
    category: 'vision',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2'],
    permissions: ['read-only', 'synthesis']
  },
  {
    id: 'decision-queue',
    title: '决策队列',
    description: '等待人工确认的 Inbox 项，保持人审链路可见。',
    category: 'execution',
    defaultSize: 'small',
    sizes: ['small', 'wide'],
    layers: ['layer1'],
    permissions: ['read-only']
  },
  {
    id: 'ready-work',
    title: '可开始工作',
    description: '已就绪任务和待处理决策的合并压力。',
    category: 'execution',
    defaultSize: 'small',
    sizes: ['small', 'wide'],
    layers: ['layer1'],
    permissions: ['read-only']
  },
  {
    id: 'blocked-work',
    title: '阻塞',
    description: '需要用户介入或重排的任务。',
    category: 'execution',
    defaultSize: 'small',
    sizes: ['small', 'wide'],
    layers: ['layer1'],
    permissions: ['read-only']
  },
  {
    id: 'agent-channel',
    title: 'Agent 通道',
    description: '当前执行、运行时和今日成本的紧凑状态。',
    category: 'execution',
    defaultSize: 'small',
    sizes: ['small', 'wide'],
    layers: ['layer1', 'system'],
    permissions: ['read-only']
  },
  {
    id: 'execution-queue',
    title: '执行队列',
    description: '按项目压力和下一批任务组织当前开放工作。',
    category: 'execution',
    defaultSize: 'large',
    sizes: ['wide', 'large'],
    layers: ['layer1'],
    permissions: ['read-only']
  },
  {
    id: 'knowledge-loop',
    title: '知识闭环',
    description: '显示 Capture 到 Library、Resource、Project 的闭环进度。',
    category: 'knowledge',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2'],
    permissions: ['read-only']
  },
  {
    id: 'feed-radar',
    title: '信息流雷达',
    description: '只展示 Layer 0 外部信号状态，并保留 Save to Library 边界。',
    category: 'signal',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer0', 'layer2'],
    permissions: ['read-only', 'requires-approval-write']
  },
  {
    id: 'library-digest',
    title: '资料消化',
    description: '关注待读、阅读中、已读未蒸馏的 Library 材料。',
    category: 'knowledge',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2'],
    permissions: ['read-only', 'synthesis']
  },
  {
    id: 'resource-momentum',
    title: '资源动量',
    description: '观察长期主题的增长、休眠和复用状态。',
    category: 'knowledge',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2'],
    permissions: ['read-only']
  },
  {
    id: 'area-balance',
    title: '领域平衡',
    description: '用 Area 分布检查个人系统是否朝 Vision 均衡推进。',
    category: 'vision',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2'],
    permissions: ['read-only']
  },
  {
    id: 'system-pulse',
    title: '系统脉搏',
    description: 'Runtime、预算、Git 和 Worktree 的系统健康检查。',
    category: 'system',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['system'],
    permissions: ['read-only']
  },
  {
    id: 'recent-activity',
    title: '近期活动',
    description: 'Activity Log 中最新可追踪变更。',
    category: 'system',
    defaultSize: 'wide',
    sizes: ['wide', 'large'],
    layers: ['layer1', 'layer2', 'system'],
    permissions: ['read-only']
  }
];

const STRATEGIC_WIDGET_IDS: DashboardWidgetId[] = [
  'north-star',
  'area-balance',
  'resource-momentum',
  'library-digest',
  'feed-radar',
  'knowledge-loop',
  'execution-queue',
  'system-pulse',
  'recent-activity',
  'decision-queue',
  'ready-work',
  'blocked-work',
  'agent-channel'
];

export function createDefaultDashboardLayout(now = '1970-01-01T00:00:00.000Z'): DashboardLayout {
  const byId = new Map(DASHBOARD_WIDGET_DEFINITIONS.map((definition) => [definition.id, definition]));
  return {
    version: 1,
    preset: 'strategic',
    widgets: STRATEGIC_WIDGET_IDS.map((widgetId, order) => {
      const definition = byId.get(widgetId);
      return {
        instanceId: `${widgetId}:default`,
        widgetId,
        size: definition?.defaultSize ?? 'wide',
        enabled: true,
        order
      };
    }),
    updatedAt: now
  };
}

export const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetRegistry = {
  widgets: DASHBOARD_WIDGET_DEFINITIONS,
  defaultLayout: createDefaultDashboardLayout()
};
