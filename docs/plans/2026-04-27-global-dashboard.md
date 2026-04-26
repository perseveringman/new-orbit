---
title: "Global Dashboard 重做"
status: draft
date: 2026-04-27
phase: "3.5"
depends_on: "2026-04-27-event-replay-infrastructure.md (Phase 3.4)"
---

# Global Dashboard 重做

> **定位**：Orbit 作为完整 AI 工作台的"运营总览"——一眼看到知识增长、思考轨迹、系统健康。
>
> **前置**：Activity Log + 事件总线已就绪
>
> **产出**：重做 DashboardView，5 个象限，重点做象限 3/4/5

---

## 1. 设计理念

Dashboard 不再是 v1 的简单信息页。它是**Orbit 作为 AI 工作台的指挥台**。

用户打开 Orbit 第一眼应该能回答：
- "**我的第二大脑在增长吗？**"（象限 3）
- "**我最近的思考轨迹是什么？**"（象限 4）
- "**系统还健康吗？**"（象限 5）
- "**有什么等我处理？**"（象限 1，辅助）
- "**agent 现在在做什么？**"（象限 2，辅助）

---

## 2. 布局

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                     {日期/时间}   │
├─────────────────────┬───────────────────────────────────────┤
│                     │                                       │
│  象限 1：待我处理    │  象限 3：知识增长                       │
│  (compact)          │  ┌─────────────────────────────────┐  │
│  • Inbox 未处理 3    │  │  本周入库                         │  │
│  • Pending 2         │  │  Feed saved: 12  Library: 5      │  │
│  • Blocked 1         │  │  Thoughts: 8   → Resource: 2     │  │
│                     │  │                                   │  │
│  [→ 去 Inbox]       │  │  活跃项目: 4  归档: 12             │  │
│                     │  └─────────────────────────────────┘  │
├─────────────────────┤                                       │
│                     ├───────────────────────────────────────┤
│  象限 2：Agent 进行中│                                       │
│  (compact)          │  象限 4：思考轨迹                       │
│  • doing: 3 tasks    │  ┌─────────────────────────────────┐  │
│  • today cost: $1.2  │  │  📖 Daily Review                  │  │
│  • runtime: claude ✓ │  │  [今天] [昨天] [本周]             │  │
│                     │  │                                   │  │
│  [→ 去看板]         │  │  📝 最近 Activity                   │  │
│                     │  │  10:31 Task "重构 runner" started  │  │
│                     │  │  10:28 Library: saved "AI Agent"   │  │
│                     │  │  10:15 Thought: "考虑 fallback"    │  │
│                     │  │                                   │  │
│                     │  │  🔭 Vision 上次 review: 3 天前      │  │
│                     │  └─────────────────────────────────┘  │
├─────────────────────┴───────────────────────────────────────┤
│                                                             │
│  象限 5：系统健康                                             │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │  磁盘    │ │  Git     │ │ Runtime  │ │  Budget        │  │
│  │ 2.1 GB   │ │ 2 dirty  │ │ claude ✓ │ │ 今日 $3.40     │  │
│  │ vault    │ │ projects │ │ codex ✓  │ │ 本月 $42.10    │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据源 API

### 3.1 象限 3：知识增长

```typescript
// src/main/dashboard/knowledge-stats.ts（新文件）

interface KnowledgeStats {
  period: 'today' | 'week' | 'month';
  feedSaved: number;         // Feed → Library 的 save 次数
  libraryAdded: number;      // Library 新增项
  thoughtsCreated: number;   // Thoughts 新增
  promotedToResource: number;// Library → Resource 的 promote 次数
  promotedToProject: number; // Thoughts → Project 的 promote 次数
  activeProjects: number;    // PARA 01_Projects 下未归档的项目数
  archivedProjects: number;  // PARA 04_Archives 下的项目数
}

async function getKnowledgeStats(vaultPath: string, period: string): Promise<KnowledgeStats> {
  // 从 Activity Log 聚合：
  // - action=capture.feed_saved
  // - action=capture.library_added
  // - action=capture.thought_created
  // - action=capture.promoted_to_resource
  // - action=capture.promoted_to_project
  // 从 PARA 目录计数
}
```

### 3.2 象限 4：思考轨迹

```typescript
// src/main/dashboard/thinking-stats.ts（新文件）

interface ThinkingStats {
  dailyReviewAvailable: boolean;
  dailyReviewDate: string | null;
  recentActivities: ActivityEvent[];  // 最近 10 条
  visionLastReviewed: string | null;  // Vision.md 最后修改时间
  visionDaysSinceReview: number;
  recentThinkingTrails: ThinkingTrailEntry[];  // 最近 3 条
}
```

### 3.3 象限 5：系统健康

```typescript
// src/main/dashboard/system-health.ts（新文件）

interface SystemHealth {
  disk: {
    vaultSizeBytes: number;
    worktreeSizeBytes: number;
    orbitDataSizeBytes: number;
  };
  git: {
    dirtyProjects: { projectName: string; uncommittedFiles: number }[];
  };
  runtimes: {
    id: string;
    provider: string;
    status: 'online' | 'offline';
    activeRuns: number;
    maxConcurrent: number;
  }[];
  budget: {
    todayUsd: number;
    monthUsd: number;
    defaultLimitPerTask: number;
  };
}
```

### 3.4 IPC 新增

```typescript
IPC.dashboard = {
  knowledgeStats: 'dashboard:knowledgeStats',
  thinkingStats: 'dashboard:thinkingStats',
  systemHealth: 'dashboard:systemHealth',
  pendingStats: 'dashboard:pendingStats',     // 象限 1
  agentStats: 'dashboard:agentStats',         // 象限 2
};
```

---

## 4. 前端组件

| 组件 | 说明 |
|------|------|
| `DashboardView.tsx` | 重写，5 象限布局 |
| `KnowledgeGrowthCard.tsx` | 象限 3 |
| `ThinkingTrailCard.tsx` | 象限 4 |
| `SystemHealthCard.tsx` | 象限 5 |
| `PendingActionsCard.tsx` | 象限 1（compact） |
| `AgentStatusCard.tsx` | 象限 2（compact） |

---

## 5. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/dashboard/knowledge-stats.ts` | 新建 | 知识增长数据聚合 |
| `src/main/dashboard/thinking-stats.ts` | 新建 | 思考轨迹数据 |
| `src/main/dashboard/system-health.ts` | 新建 | 系统健康数据 |
| `src/main/dashboard/ipc.ts` | 新建 | Dashboard IPC handlers |
| `src/shared/ipc.ts` | 修改 | 新增 dashboard namespace |
| `src/renderer/src/views/DashboardView.tsx` | 重写 | 5 象限布局 |
| `src/renderer/src/components/Dashboard/KnowledgeGrowthCard.tsx` | 新建 | |
| `src/renderer/src/components/Dashboard/ThinkingTrailCard.tsx` | 新建 | |
| `src/renderer/src/components/Dashboard/SystemHealthCard.tsx` | 新建 | |
| `src/renderer/src/components/Dashboard/PendingActionsCard.tsx` | 新建 | |
| `src/renderer/src/components/Dashboard/AgentStatusCard.tsx` | 新建 | |
| `src/renderer/src/stores/dashboardStore.ts` | 新建 | Dashboard 数据 store |

---

## 6. 验收标准

- [ ] Dashboard 5 象限布局完整渲染
- [ ] 象限 3：正确显示本周 Capture 入库量、promote 数、项目数
- [ ] 象限 4：Daily Review 入口可点击跳转
- [ ] 象限 4：最近 Activity 列表正确显示
- [ ] 象限 4：Vision review 天数正确计算
- [ ] 象限 5：磁盘使用正确统计
- [ ] 象限 5：Git dirty projects 正确检测
- [ ] 象限 5：Runtime 状态实时反映
- [ ] 象限 5：Budget 今日/本月累计正确
- [ ] 象限 1/2：compact 展示 + 点击跳转
- [ ] 数据实时更新（不需要手动刷新）
- [ ] 响应式布局（窗口缩小时不破版）
