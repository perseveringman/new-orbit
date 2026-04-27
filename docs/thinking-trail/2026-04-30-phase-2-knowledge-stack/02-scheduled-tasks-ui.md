# 文档 2：定时任务一级入口

> **规模**：M（约 1~2 天 AI 实施）
> **依赖**：Phase 1 完成；底层 scheduled_task MCP 工具已有
> **产物**：左侧栏 Scheduled Tasks 入口 + 列表 + 详情 + 创建向导 + 执行历史 + Ask-Anywhere 语义创建

---

## 1. 设计哲学

### 1.1 定位

定时任务是 Orbit 里一类"**沉默的 agent**"——它们不等用户召唤，按时间自主唤醒、执行、产出、归档。

主要用途：
1. **系统自动**：每日总结 / 每周 Area 评审 / Feed 拉取 / Resource health 扫描
2. **用户定义**：定时 capture、定时提醒、定时复盘、定时检查某个 URL
3. **Ask-Anywhere 触发**：对话中用户说"以后每天 8 点帮我..."，AA 代建定时任务

### 1.2 和现有 MCP 工具的关系

系统已有 `scheduled_task` MCP server（`scheduled_task_create`/`list`/`get`/`update`/`delete`/`run`/`executions`），**不新建底层**，本文档只做：
- UI 层：展示 + 操作
- 语义层：Ask-Anywhere 如何通过自然语言创建 / 修改 / 查询
- 系统级默认任务：预置几个对 Orbit 本身有用的任务

---

## 2. 数据模型（与 MCP 工具对齐）

```typescript
// src/shared/scheduled-task/types.ts

export type ScheduleKind = 
  | 'cron'              // 标准 cron 表达式
  | 'interval'          // 固定间隔（如每 30 分钟）
  | 'daily'             // 每天 HH:MM
  | 'weekly'            // 每周几的 HH:MM
  | 'monthly'           // 每月 N 号 HH:MM
  | 'once';             // 只跑一次（调度到一个具体时间）

export interface ScheduleConfig {
  kind: ScheduleKind;
  cron?: string;                    // kind=cron
  interval_minutes?: number;        // kind=interval
  time?: string;                    // 'HH:MM'
  day_of_week?: number[];           // kind=weekly [0..6]
  day_of_month?: number;            // kind=monthly
  target_datetime?: string;         // kind=once
  timezone?: string;                // IANA timezone，默认系统时区
}

export type ScheduledTaskAction = 
  | { kind: 'ask_anywhere'; prompt: string; skills?: string[] }
  | { kind: 'agent_run'; agent: string; prompt: string; runtime?: string }
  | { kind: 'shell'; command: string; cwd?: string }
  | { kind: 'feed_refresh'; source_id?: string }  // 若无则刷全部
  | { kind: 'webhook'; url: string; method: 'GET' | 'POST'; body?: any };

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  
  schedule: ScheduleConfig;
  action: ScheduledTaskAction;
  
  // 生命周期
  status: 'active' | 'paused' | 'disabled' | 'error';
  created_at: string;
  updated_at: string;
  next_run_at?: string;
  last_run_at?: string;
  
  // 源
  source: 'system' | 'user' | 'ask_anywhere';   // 谁创建的
  system_key?: string;                          // 如果是系统任务（e.g. 'daily-summary'）
  
  // PARA 关联（可选）
  para_ref?: string;                            // 这个任务属于哪个 project/area/resource
  
  // 统计
  total_runs: number;
  success_runs: number;
  failure_runs: number;
  
  // 标签
  tags?: string[];
}

export interface ScheduledTaskExecution {
  id: string;
  task_id: string;
  triggered_at: string;
  started_at: string;
  completed_at?: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'timeout';
  
  // 结果
  output?: any;
  error?: string;
  
  // 产物链接（如果任务产生了 Note/Conversation 等）
  artifacts?: Array<{
    kind: 'note' | 'conversation' | 'library_item' | 'log';
    ref: string;
  }>;
  
  // trace
  trace_id?: string;                            // 关联 TraceableEvent
}
```

---

## 3. UI 设计

### 3.1 左侧栏入口

- 位置：在 Notes 下面，Projects 上面
- icon: `AlarmClock` (lucide-react)
- 文案: "Scheduled"
- 路由: `/scheduled`

### 3.2 列表页

```
┌──────────────────────────────────────────────────────────────────┐
│  Scheduled Tasks                              [+ 新建]  [⚙️]      │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─ 筛选 ──────────────────────────────────────────────────┐     │
│  │ 状态: [全部] [active] [paused] [error]                  │     │
│  │ 来源: [全部] [system] [user] [ask_anywhere]             │     │
│  │ 关联: [全部] [project] [area] [resource]                │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ● 每日总结                                    系统         │     │
│  │   每天 22:00 · 下次 今天 22:00 · 最近成功                │     │
│  │   Ask-Anywhere: "生成今日总结"                           │     │
│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ ● Feed 拉取                                  系统         │     │
│  │   每 30 分钟 · 下次 14:30 · 上次 1 分钟前                │     │
│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ ● 每周技术周报提醒                          用户          │     │
│  │   每周五 17:00 · Area: engineering-lead                 │     │
│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ ⏸ 每月月度回顾（已暂停）                     用户          │     │
│  │   每月 1 号 09:00                                        │     │
│  │                                   [▶️ 启用] [⋯]          │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ ⚠ Feed RSS 抓取（错误）                     系统          │     │
│  │   错误: Source http://... 连续失败 3 次                   │     │
│  │                                   [查看] [禁用] [⋯]      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 详情页

```
┌──────────────────────────────────────────────────────────────────┐
│  ← 返回   每日总结                     [保存] [删除] [⋯]           │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌── 基本信息 ──────────────────────────────────────────────┐    │
│  │ 名称: 每日总结                                            │    │
│  │ 描述: 每晚自动生成当日 Timeline 总结卡片                   │    │
│  │ 状态: [active ▼]  来源: system                           │    │
│  │ 标签: [daily, summary, system]                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 调度 ──────────────────────────────────────────────────┐    │
│  │ 类型: [每天 ▼]                                            │    │
│  │ 时间: [22:00]    时区: [Asia/Shanghai ▼]                 │    │
│  │                                                          │    │
│  │ 下次执行: 今天 22:00 (约 7 小时后)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 动作 ──────────────────────────────────────────────────┐    │
│  │ 类型: [Ask-Anywhere ▼]                                   │    │
│  │                                                          │    │
│  │ Prompt:                                                  │    │
│  │ ┌──────────────────────────────────────────────────────┐ │    │
│  │ │ 基于今天的 Timeline 事件，生成 150-300 字总结...       │ │    │
│  │ └──────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │ 使用 Skills: [orbit-retrieve, orbit-express]             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 执行历史（最近 10 次）───────────────────────────────────┐   │
│  │ ✓ 2026-04-29 22:00  成功  耗时 12s  产出 note            │    │
│  │ ✓ 2026-04-28 22:00  成功  耗时 15s  产出 note            │    │
│  │ ✗ 2026-04-27 22:00  失败  timeout                        │    │
│  │ ✓ 2026-04-26 22:00  成功  耗时 11s  产出 note            │    │
│  │ ...                                         [查看全部]    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌── 高级 ──────────────────────────────────────────────────┐    │
│  │ 超时: [60 秒]                                             │    │
│  │ 失败后: [重试 3 次] [禁用]                                │    │
│  │ 关联 PARA: [无 ▼]                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.4 创建向导（简化流程）

点击 `+ 新建` 弹出模态框：

```
┌──────────────────────────────────────────────────────────┐
│  新建定时任务                                  [x]       │
│  ────────────────────────────────────────────────────── │
│                                                         │
│  你想让我做什么？                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 例如: 每天早上 8 点提醒我写日报                     │  │
│  │       每周五下午 5 点总结本周 Area 健康状况         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  [用 Ask-Anywhere 自然语言创建 →]                        │
│                                                         │
│  或手动填写：                                            │
│  名称: [________________]                                │
│  调度: ○ cron  ⦿ 每天  ○ 每周  ○ 每月  ○ 自定义间隔   │
│  时间: [08:00]                                           │
│  动作类型: [Ask-Anywhere ▼]                              │
│  Prompt: [________________]                              │
│                                                         │
│  [取消]                          [创建]                  │
└──────────────────────────────────────────────────────────┘
```

### 3.5 Ask-Anywhere 语义创建（关键体验）

点击"用 Ask-Anywhere 自然语言创建"后：
1. 跳转到 Ask-Anywhere Chat
2. 自动激活 `orbit-scheduling` skill
3. AA 主动问："好，你想让我做什么？什么时候？"
4. 用户对话式输入
5. AA 解析出 schedule + action，show preview card
6. 用户确认 → 调用 `scheduled_task_create`

对话示例：
```
用户：以后每天早上 8 点提醒我写日报
AA:   好，让我理解一下：
      · 什么时候：每天早上 8:00（时区：Asia/Shanghai）
      · 做什么：发送一个提醒（需要通知中心）
      
      [确认创建]  [调整参数]  [取消]
```

---

## 4. 系统预置定时任务

Orbit 启动时确保以下"系统任务"存在（`source: 'system'`）。用户可以 pause/disable，但无法 delete（只能禁用）：

### 4.1 每日总结
```typescript
{
  name: '每日总结',
  system_key: 'daily-summary',
  description: '每晚自动生成当日 Timeline 的 AI 总结',
  schedule: { kind: 'daily', time: '22:00' },
  action: {
    kind: 'ask_anywhere',
    prompt: DAILY_SUMMARY_PROMPT,    // 见文档 5
    skills: ['orbit-retrieve', 'orbit-express'],
  },
}
```

### 4.2 Feed 定时拉取
```typescript
{
  name: 'Feed 拉取',
  system_key: 'feed-refresh',
  description: '每 30 分钟拉取所有订阅源',
  schedule: { kind: 'interval', interval_minutes: 30 },
  action: { kind: 'feed_refresh' },
}
```

### 4.3 Resource 健康扫描（周）
```typescript
{
  name: 'Resource 健康扫描',
  system_key: 'resource-health-scan',
  description: '每周扫描所有 Resource 的活跃度，把 dormant 的 flag 出来',
  schedule: { kind: 'weekly', day_of_week: [0], time: '09:00' },  // 周日 9 点
  action: {
    kind: 'ask_anywhere',
    prompt: '扫描所有 active resource，如果某个 resource 超过 4 周没有新 engagement，把它 flag 为 dormant 并在 Inbox 提醒我。',
  },
}
```

### 4.4 Area 周评审提醒（周）
```typescript
{
  name: 'Area 周评审提醒',
  system_key: 'area-weekly-review',
  description: '每周五下午提醒评审 Area',
  schedule: { kind: 'weekly', day_of_week: [5], time: '17:00' },
  action: {
    kind: 'ask_anywhere',
    prompt: '帮我检查所有 review_cadence=weekly 的 Area，列出本周是否完成评审；未完成的写到 Inbox。',
  },
}
```

### 4.5 KB 增量扫描（日）
```typescript
{
  name: 'KB 增量扫描',
  system_key: 'kb-incremental-scan',
  description: '每天凌晨扫描 KB 变化',
  schedule: { kind: 'daily', time: '03:00' },
  action: {
    kind: 'ask_anywhere',
    prompt: '扫描所有 KB 在过去 24 小时内的新增/修改笔记，更新索引。',
  },
}
```

---

## 5. IPC / API

```typescript
// src/main/scheduled-task/ipc.ts

IPC.scheduledTasks = {
  // 列表
  list: (filter?: ScheduledTaskFilter) => Promise<ScheduledTask[]> => {},
  
  // 单个
  get: (taskId: string) => Promise<ScheduledTask | null> => {},
  
  // 创建/更新/删除
  create: (input: CreateScheduledTaskInput) => Promise<ScheduledTask> => {},
  update: (taskId: string, patch: Partial<ScheduledTask>) => Promise<ScheduledTask> => {},
  delete: (taskId: string) => Promise<void> => {},   // 系统任务报错
  
  // 生命周期
  pause: (taskId: string) => {},
  resume: (taskId: string) => {},
  triggerNow: (taskId: string) => Promise<ScheduledTaskExecution> => {},
  
  // 历史
  executions: (taskId: string, limit?: number, offset?: number) => Promise<ScheduledTaskExecution[]> => {},
  
  // 订阅事件
  subscribe: (cb: (event: ScheduledTaskEvent) => void) => () => void => {},
  
  // 自然语言解析（Ask-Anywhere 用）
  parseNaturalLanguage: (text: string) => Promise<{
    schedule: ScheduleConfig;
    action: ScheduledTaskAction;
    confidence: number;
  }> => {},
};

// 事件
export const SCHEDULED_TASK_EVENT_KINDS = [
  'scheduled_task.created',
  'scheduled_task.updated',
  'scheduled_task.deleted',
  'scheduled_task.paused',
  'scheduled_task.resumed',
  'scheduled_task.execution.started',
  'scheduled_task.execution.completed',
  'scheduled_task.execution.failed',
] as const;
```

### 5.1 底层对接现有 MCP

本层 IPC 的实现**包装现有 `scheduled_task` MCP tool**，不重写调度器：

```typescript
async function create(input) {
  const result = await mcpCall('scheduled_task', 'scheduled_task_create', input);
  emitTraceableEvent('scheduled_task.created', { taskId: result.id, ... });
  return result;
}
```

---

## 6. `orbit-scheduling` Skill

```typescript
// src/main/ask-anywhere/skills/scheduling.ts

export const schedulingSkill: Skill = {
  id: 'orbit-scheduling',
  name: '定时任务',
  triggers: ['每天', '定时', '提醒', '每周', '每月', 'schedule', 'remind'],
  
  async describe() {
    // 系统 prompt 片段，告诉 LLM 能做什么
    return `你可以帮用户创建/管理定时任务。支持 cron、每天 HH:MM、每周几、每月 N 号、固定间隔、一次性。
            创建前务必让用户确认 schedule 和 action。`;
  },
  
  tools: [
    {
      name: 'create_scheduled_task',
      description: '创建一个定时任务',
      parameters: { /* 对应 CreateScheduledTaskInput */ },
      execute: (params) => IPC.scheduledTasks.create(params),
    },
    {
      name: 'list_scheduled_tasks',
      description: '列出用户的定时任务',
      parameters: { /* filter */ },
      execute: IPC.scheduledTasks.list,
    },
    // update / delete / pause / trigger_now ...
  ],
};
```

---

## 7. 实施步骤

### Step 1: 数据模型 + IPC 包装（半天）
1. `src/shared/scheduled-task/types.ts`
2. `src/main/scheduled-task/ipc.ts`（包装现有 MCP 工具）
3. `src/main/scheduled-task/event-bridge.ts`（MCP 返回 → TraceableEvent）
4. preload 暴露

### Step 2: 左侧栏入口 + 列表页（半天）
1. `src/renderer/views/ScheduledTasksView.tsx`
2. `src/renderer/components/ScheduledTaskList.tsx`
3. `src/renderer/components/ScheduledTaskListItem.tsx`
4. 左侧栏入口

### Step 3: 详情页 + 编辑（半天）
1. `src/renderer/views/ScheduledTaskDetailView.tsx`
2. `src/renderer/components/ScheduleConfigEditor.tsx`（cron/daily/weekly/monthly/interval/once 切换）
3. `src/renderer/components/ActionConfigEditor.tsx`（action 类型切换 + 参数表单）
4. 执行历史面板

### Step 4: 创建向导（半天）
1. 模态框 UI
2. 手动填写流程
3. "用 AA 自然语言创建"的入口（跳 Ask-Anywhere 并带上意图）

### Step 5: `orbit-scheduling` skill（半天）
1. 实现 skill
2. 注册到 Ask-Anywhere
3. 对话式创建流程（AA 解析 + preview card + 确认）

### Step 6: 系统预置任务（半天）
1. Orbit 启动时 `ensureSystemTasks()`
2. 5 个系统任务定义
3. 系统任务的"不可删除"保护

### Step 7: 测试 + 收尾（半天）
1. 创建/暂停/立即执行/历史查询链路
2. Ask-Anywhere 语义创建
3. 系统任务首次注册

**总计：约 3~4 天 AI 实施**

---

## 8. 验收标准

- [ ] 左侧栏 Scheduled 入口可见
- [ ] 列表页能看到所有任务，含系统任务和用户任务
- [ ] 能创建、编辑、暂停、恢复、立即执行、删除
- [ ] 系统任务有 🔒 标记不可删除但可 pause
- [ ] 执行历史能看到最近 N 次
- [ ] Ask-Anywhere 能通过自然语言创建任务
- [ ] 5 个系统任务在首次启动自动创建
- [ ] 事件正确发到 TraceableEvent（能在 DeveloperConsole 看到）
- [ ] 定时任务执行产生的产物（如 note）能 link 回来

---

## 9. Future-Proof

- **条件触发**（非时间）：如 "当 Inbox > 20 条时" —— 数据模型 Schedule 可扩展 `trigger_kind: 'time' | 'condition'`
- **任务链**：A 完成后触发 B —— 预留 `on_success_run: taskId`
- **外部 webhook 触发**：action 里已有 webhook 类型
