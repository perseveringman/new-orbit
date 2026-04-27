# 文档 5：Daily Timeline —— 人生日记

> **规模**：L（约 3~4 天 AI 实施）
> **依赖**：文档 1（需要 Note/Library/KB 事件定义）；TraceableEvent 基础
> **产物**：Timeline 一级入口 + 日/周/月/年四级视图 + AI 今日总结 + 特殊事件融入 Quick Capture + PDF 导出

---

## 1. 设计哲学

### 1.1 野心声明

> "这本日记就是我的一生"

Orbit Daily Timeline 不是普通的 activity log，而是**基于语义聚合的人生 event sourcing**。每一天、每一周、每一年都能被唤回、被回顾、被打印成书、被传承。

### 1.2 核心架构决策

**复用 TraceableEvent 作为底层事件源**，Timeline 是视图层而非存储层。

这意味着：
- 不新增"timeline 事件表"
- 所有业务事件（note/library/project/task/conversation/...）通过 `TraceableEvent` 天然流入
- Timeline 只负责**选择、聚合、渲染**
- 未来接入外部事件（GitHub/Calendar）只需让它们也产 TraceableEvent


---

## 2. 事件分层（P2-D8）

### 2.1 Layer 1 — User-Visible（默认显示）

用户会说"我今天做了..."的事件。这些**必定**出现在 Timeline：

| 事件 kind | 渲染形态 |
|----------|---------|
| `note.created (thought)` | 💭 `时间` 捕获想法："开头..." |
| `note.created (longform)` | ✍️ `时间` 开始写长文《标题》 |
| `note.updated (longform, +N words)` | ✍️ `时间` 长文《标题》新增 N 字 |
| `note.created (capture)` | 📌 `时间` 捕获（来源：xxx） |
| `note.created (voice_log)` | 🎤 `时间` 语音日志 N 分钟 |
| `note.archived` | 📦 `时间` 归档笔记 |
| `library.item.added` | 📚 `时间` 收藏《xxx》 |
| `library.item.read` | 📖 `时间` 读完《xxx》 |
| `library.item.annotated` | 🖍️ `时间` 标注了 N 处 |
| `library.item.distilled` | 💎 `时间` 提炼为 note |
| `feed.source.added` | 📡 `时间` 订阅 xxx |
| `feed.item.saved_to_library` | 📌 `时间` 从 feed 收藏 |
| `project.created` | 🎯 `时间` 立项《xxx》 |
| `project.completed` | 🏆 `时间` 完成项目《xxx》 |
| `task.completed` | ✅ `时间` 完成任务 "xxx" |
| `area.review.completed` | 🔄 `时间` 完成 Area 评审 |
| `resource.created` | 🗂️ `时间` 立题 Resource "xxx" |
| `resource.engagement` | 🔁 `时间` 触及 Resource "xxx" |
| `conversation.meaningful` | 💬 `时间` 和 AA 讨论 xxx |
| `scheduled_task.execution.completed` | ⏰ `时间` 定时任务执行 |
| `kb.imported` | 📥 `时间` 导入 KB |
| `vision.milestone.reached` | 🌟 `时间` 里程碑达成（Vision Phase 后启用）|
| `capture.special` | ⭐ 特殊事件（见 §4）|

### 2.2 Layer 2 — Developer-Visible（默认折叠）

- `agent.run.started / done`
- `tool_use / tool_result`
- IPC trace
- runtime event

Timeline 上**有**这些事件，但默认 collapse。设置里开"开发者模式"后展开。

### 2.3 Layer 3 — System-Noise（不上 Timeline）

按 P2-D8 **完全不上**：
- `heartbeat`
- `cost` 细粒度事件
- 文件系统 watcher 内部事件
- IPC 心跳
- 其他系统 trace

在 TraceableEventStore 里**保留**（用于调试和复盘），但 Timeline **不查询**。

### 2.4 实现：Event Kind 白名单

```typescript
// src/shared/timeline/event-filter.ts

export const TIMELINE_LAYER_1_KINDS = new Set([
  'note.created',
  'note.updated',              // 只有特定类型才要
  'note.archived',
  'library.item.added',
  'library.item.read',
  // ... 全部 Layer 1
]);

export const TIMELINE_LAYER_2_KINDS = new Set([
  'agent.run.started',
  'agent.run.completed',
  // ... Layer 2
]);

export function shouldShowOnTimeline(
  event: TraceableEvent,
  developerMode: boolean,
): boolean {
  if (TIMELINE_LAYER_1_KINDS.has(event.kind)) return true;
  if (developerMode && TIMELINE_LAYER_2_KINDS.has(event.kind)) return true;
  return false;
}
```

---

## 3. 数据模型

### 3.1 TimelineEntry（视图层的统一结构）

```typescript
// src/shared/timeline/types.ts

export interface TimelineEntry {
  // 来源
  event_id: string;                 // TraceableEvent.id
  event_kind: string;
  trace_id?: string;
  
  // 时间
  occurred_at: string;              // ISO
  
  // 分层
  layer: 1 | 2;                     // Layer 3 不进
  
  // 显示
  icon: string;                     // emoji 或 lucide icon 名
  title: string;                    // "捕获想法"
  summary?: string;                 // "开头第一段..."
  
  // 引用实体
  refs?: Array<{
    kind: 'note' | 'library' | 'project' | 'area' | 'resource' | 'task' | 'conversation' | 'kb';
    ref: string;                    // 路径或 id
    label?: string;
  }>;
  
  // 聚合 hint（同类事件短时间内可合并）
  aggregation_key?: string;         // e.g. "longform-update:<note-id>"
  
  // 关联事件（语义承接）
  derived_from?: string[];          // 其他 entry 的 event_id
}

export interface DailyTimeline {
  date: string;                     // YYYY-MM-DD
  entries: TimelineEntry[];
  stats: DailyStats;
  summary?: DailySummary;
}

export interface DailyStats {
  total_events: number;
  thoughts_count: number;
  longforms_wrote: number;          // 今天有写长文的数量
  longforms_words: number;          // 今天新增字数
  library_added: number;
  library_read: number;
  tasks_completed: number;
  projects_touched: string[];       // 今天触及的 project paths
  areas_touched: string[];
  resources_touched: string[];
  conversations_count: number;
}

export interface DailySummary {
  generated_at: string;
  note_path: string;                // notes/daily-summaries/YYYY-MM-DD.md
  headline: string;                 // "深度工作日"
  narrative: string;                // 150~300 字
  highlights?: string[];
}
```

### 3.2 TimelineIndex（缓存 + 性能）

为了年/月视图快速加载，做一个索引：

```typescript
// .orbit/timeline/index/
//   2026-04.json        # 月索引
//   2026.json           # 年索引

export interface MonthlyIndex {
  month: string;                    // "2026-04"
  days: Array<{
    date: string;
    entry_count: number;
    highlight_kinds: string[];      // 当天出现的主要事件类型
    summary_headline?: string;
  }>;
}

export interface YearlyIndex {
  year: number;                     // 2026
  months: Array<{
    month: string;
    total_events: number;
    days_active: number;            // 当月活跃天数
  }>;
}
```

增量更新：每次 Layer 1 事件产生时，异步 upsert 月/年索引。

### 3.3 SpecialCapture（特殊事件，P2-D10）

特殊事件融入 Quick Capture（不单独做新实体）。在 Note frontmatter 新增字段：

```yaml
---
id: note-xxx
type: capture
special_marker:
  kind: insight | breakthrough | setback | milestone | gratitude | reflection
  icon: 🌟 | 💡 | 💔 | 🏁 | 🙏 | 🪞
---
```

Timeline 渲染时对 `special_marker` 有的 note 做特殊高亮（大 icon + 更突出的卡片）。

Quick Capture UI 里新增"标记为特殊"选项：
```
┌─ Quick Capture ──────────────────┐
│ ┌────────────────────────────┐   │
│ │ 今天想通了一件事...         │   │
│ └────────────────────────────┘   │
│                                  │
│ 类型: [thought ▼]                │
│ 特殊? [ ] 无                     │
│        [x] 💡 灵感时刻           │
│        [ ] 🌟 突破               │
│        [ ] 💔 挫折               │
│        [ ] 🏁 里程碑             │
│        [ ] 🙏 感恩               │
│        [ ] 🪞 反思               │
│                                  │
│ [取消]            [捕获]         │
└──────────────────────────────────┘
```

---

## 4. UI 设计（P2-D7 全套采纳）

### 4.1 一级入口

- 位置：左侧栏顶部区域（Daily 是核心体验），放在 Ask-Anywhere 之上或并列
- icon: `Calendar` (lucide)
- 文案: "Timeline"（或 "Daily"）
- 路由: `/timeline`（默认 `/timeline/today`）

### 4.2 日视图

```
┌──────────────────────────────────────────────────────────────────┐
│ [← 2026-04-29]  2026-04-30 周三  [2026-05-01 →]  [日|周|月|年]   │
│                                            [📄 导出PDF] [⚙️]      │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  ╭─── 今日一瞥 ───────────────────────────────────────────╮   │
│  │  📊 18 个事件    📝 7 个 thoughts    ✍️ 新增 1240 字       │   │
│  │  ✅ 4 个任务     💬 2 次 AA 对话      📚 2 篇文章已读      │   │
│  │  🎯 2 个项目有进展                                         │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                 │
│  ── 早晨 (06:00 - 12:00) ──                                    │
│                                                                 │
│   09:10  📡  订阅了 Tiago Forte 的 newsletter                   │
│                                                                 │
│   09:30  📌  从 feed 收藏《Building a Second Brain 2025》      │
│             ↳ 稍后阅读                                          │
│                                                                 │
│   10:15  📚  打开阅读 《Building a Second Brain 2025》          │
│                                                                 │
│   10:42  💡  灵感时刻: "渐进式总结对定时任务设计很有启发"        │
│             ↳ 来自阅读《Building a Second Brain 2025》          │
│             → 归入 resources/second-brain                       │
│                                                                 │
│  ── 上午 (12:00 - 14:00) ──                                    │
│                                                                 │
│   11:23  🎯  立项《orbit-resource-system》                      │
│                                                                 │
│   11:47  💬  和 Ask-Anywhere 讨论 Resource 设计 (45 min)       │
│             ↳ 产出：ADR-016 草稿                                │
│                                                                 │
│  ── 下午 (14:00 - 18:00) ──                                    │
│                                                                 │
│   14:00  ✍️  开始写长文《第二大脑在工具里的实现》                │
│                                                                 │
│   15:40  ✍️  长文新增 1240 字  (聚合: 4 次保存)                  │
│                                                                 │
│   16:30  ✅  完成任务 "Stage View 原型"                         │
│                                                                 │
│  ── 夜晚 (18:00 - 24:00) ──                                    │
│                                                                 │
│   19:30  🎤  语音日志 (8 min)                                   │
│             "今天想明白了 Resource 不是静态素材..."              │
│                                                                 │
│   20:15  📖  读完《Building a Second Brain 2025》               │
│                                                                 │
│   21:00  🔄  完成 Area "工程 team lead" 的周评审                │
│                                                                 │
│  ╭─── 🌙 今日总结 (AA 自动生成, 21:45) ─────────────────────╮   │
│  │                                                          │   │
│  │  主线: "Resource 系统设计" 贯穿全天。从 feed 收藏到立项    │   │
│  │  到长文创作，形成完整的 Distill→Express 闭环。            │   │
│  │  灵感时刻: 10:42 的渐进式总结联想让整个下午的写作顺流而下。 │   │
│  │  这是典型的深度工作日。                                    │   │
│  │                                                          │   │
│  │  明日延续: 长文还差结尾；ADR-016 要和阶段 3 连接。        │   │
│  │                                                          │   │
│  │  [展开完整] [编辑] [发到邮箱] [加入 longform]               │   │
│  ╰──────────────────────────────────────────────────────────╯   │
│                                                                 │
│ ──────────────────────────────────────────────────────────── │
│  [⬇ 展开 3 条开发者事件（Layer 2）]                              │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 时段分组算法

```typescript
function groupByTimeOfDay(entries: TimelineEntry[]): TimeSegmentGroup[] {
  const segments = [
    { id: 'dawn',    label: '清晨',  range: [5, 8] },
    { id: 'morning', label: '早晨',  range: [8, 12] },
    { id: 'noon',    label: '上午',  range: [12, 14] },
    { id: 'afternoon', label: '下午', range: [14, 18] },
    { id: 'evening', label: '夜晚',  range: [18, 24] },
    { id: 'night',   label: '深夜',  range: [0, 5] },
  ];
  // 按 entry.occurred_at 的小时归到对应 segment
}
```

### 4.4 事件聚合

同类型事件短时间内合并成一行。规则：

```typescript
function aggregate(entries: TimelineEntry[]): TimelineEntry[] {
  // 1. 长文多次保存 → 合并为一条 "新增 N 字"
  //    aggregation_key: "longform-update:<note-id>"
  //    合并窗口: 10 分钟
  
  // 2. 多次标注同一 library → "标注了 N 处"
  
  // 3. 多次 task 完成（同一 project）在 10 分钟内 → "完成 3 个任务 on <project>"
  
  // 4. 其他事件不聚合
}
```

### 4.5 周视图

```
┌──────────────────────────────────────────────────────────────────┐
│ [← 上周]  2026-04-27 ~ 2026-05-03  [下周 →]  [日|周|月|年]       │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┬──────┐ │
│  │   周一  │  周二  │  周三  │  周四  │  周五  │  周六  │ 周日 │ │
│  │  04-27 │  04-28 │  04-29 │  04-30 │  05-01 │  05-02 │05-03│ │
│  ├────────┼────────┼────────┼────────┼────────┼────────┼──────┤ │
│  │  💭 3  │  💭 5  │  💭 7  │  ⛅️    │        │        │      │ │
│  │  ✅ 2  │  ✅ 4  │  ✅ 4  │  Today │        │        │      │ │
│  │  ✍️ 0  │  ✍️ 1  │  ✍️ 2  │        │        │        │      │ │
│  │   ...  │   ...  │   ...  │        │        │        │      │ │
│  │  [点开]│  [点开]│  [点开]│        │        │        │      │ │
│  ├────────┴────────┴────────┴────────┴────────┴────────┴──────┤ │
│  │  📅 本周一句话总结（AA 周总结，周日 22:00 生成）               │ │
│  │  "围绕 Orbit Phase 2 的深度设计周。完成 6 份设计文档..."     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  本周重点事件                                                    │
│  · 立项 orbit-resource-system                                   │
│  · 长文《第二大脑在工具里的实现》 完成初稿                        │
│  · 💡 3 个灵感时刻                                              │
└──────────────────────────────────────────────────────────────────┘
```

### 4.6 月视图

```
┌──────────────────────────────────────────────────────────────────┐
│ [← 03]  2026 年 4 月  [05 →]              [日|周|月|年]         │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  ┌───┬───┬───┬───┬───┬───┬───┐                                  │
│  │周一│周二│周三│周四│周五│周六│周日│                                  │
│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
│  │ 30│ 31│ 1 │ 2 │ 3 │ 4 │ 5 │  (颜色深浅代表活跃度)             │
│  │ ░ │ ░ │▒▒│▒▒▒│▓▓│▓▓▓│ ░ │                                  │
│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
│  │ 6 │ 7 │ 8 │ 9 │10 │11 │12 │                                  │
│  │▒▒│▓▓▓│▒▒│▒▒▒│▓▓│ ░ │ ░ │                                  │
│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
│  │13 │14 │15 │16 │17 │18 │19 │                                  │
│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
│  │20 │21 │22 │23 │24 │25 │26 │                                  │
│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
│  │27 │28 │29 │30 │   │   │   │                                  │
│  │▓▓│▓▓▓│▓▓▓│█ │                                                │
│  └───┴───┴───┴───┴───┴───┴───┘                                  │
│                                                                 │
│  月度亮点                                                        │
│  · 立项 2 个，完成 1 个                                         │
│  · 28 个 thoughts                                               │
│  · 最活跃日: 4 月 29 日（32 事件）                               │
│  · 💡 5 个灵感时刻                                              │
│                                                                 │
│  [月度 AA 总结（由 AA 生成）]                                    │
│  "四月是 Orbit Phase 2 设计爆发期，围绕知识栈..."               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.7 年视图（热力图）

```
┌──────────────────────────────────────────────────────────────────┐
│ [← 2025]  2026 年  [2027 →]              [日|周|月|年]          │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  1月 ░░░▒▒▓▓▓▓▒▒░░░░▒▒▒▒▓▒▒░░░░░░░                              │
│  2月 ▒▒▒▒▓▓▓▓▓▒▒▒░░░▒▒▓▓▒▒▒▒▒░                                  │
│  3月 ▓▓▓▓▓▓▒▒▒▒▒▓▓▓▓▓▓▒▒▒░░▒▒▓▓▓▓▒▒░                           │
│  4月 ▓▓▓▒▒▒▓▓▓▓▓▒▒▒▓▓▓█▓▒▒░░▓▓██▓▒                             │
│  5月 ░░░░                                                        │
│  ...                                                             │
│                                                                 │
│  ┌── 年度亮点 ──────────────────────────────────────────────┐   │
│  │ · 最活跃月: 4 月 (487 事件)                                │   │
│  │ · 连续活跃: 28 天                                          │   │
│  │ · 新增长文: 12 篇                                          │   │
│  │ · 立项: 7 个，完成: 4 个                                   │   │
│  │ · 💡 灵感时刻: 23 次                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [年度 AA 总结 · 本年主题演化 · 导出年鉴 PDF]                     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.8 PDF 导出

- 单日 PDF：完整的日视图 + 今日总结 + 所有关联产物的摘要
- 周 / 月 PDF：概览 + 每天简述
- 年鉴 PDF：热力图 + 重点事件列表 + 年度总结

技术选型：
- `puppeteer` 或 `electron`'s `webContents.printToPDF()`
- 模板用 React + 打印样式 `@media print`
- 文件输出到 `vault/exports/timeline/`


---

## 5. AI 今日总结

### 5.1 触发机制

通过**系统预置定时任务**（见文档 2 第 4.1 节）：

```typescript
// 每晚 22:00 运行
{
  system_key: 'daily-summary',
  schedule: { kind: 'daily', time: '22:00' },
  action: {
    kind: 'ask_anywhere',
    prompt: DAILY_SUMMARY_PROMPT,
  },
}
```

### 5.2 Prompt 模板

```
你是 Orbit 的每日总结助手。请基于用户 {today} 的 Timeline 事件，生成一段总结。

【今日事件列表】
{events}

【今日数据】
- 事件总数: {stats.total_events}
- 笔记产出: {stats.thoughts_count} 条 thought, {stats.longforms_words} 字长文
- 完成任务: {stats.tasks_completed}
- 触及的 Projects: {stats.projects_touched}
- 触及的 Areas: {stats.areas_touched}
- 触及的 Resources: {stats.resources_touched}
- 对话次数: {stats.conversations_count}

【要求】
1. 150-300 字
2. 第二人称"你"
3. 温暖、精确、不鸡汤
4. 包括 4 部分:
   - headline: 10 字内概括（如"深度工作日"、"探索日"、"修复日"）
   - 主线叙事: 今天最重要的 1-2 件事，以及它们之间的承接
   - 隐藏关联: 看似无关但其实连贯的事件（如上午的 feed 收藏→下午的长文）
   - 明日延续: 今天未完成/挖坑

【输出格式】
以 JSON 输出:
{
  "headline": "...",
  "narrative": "...",
  "highlights": ["...", "..."]
}
```

### 5.3 产物

- 生成一个 note：`notes/daily-summaries/YYYY-MM-DD.md`
- frontmatter `type: daily_summary`
- Timeline 底部卡片展示 summary
- 同时 emit 事件 `daily_summary.generated`

### 5.4 手动触发

用户在 Timeline 日视图里，当天还没总结（比如 22:00 前）：

```
┌─ 今日尚未总结 ─────────────────────┐
│  [立即生成总结]                     │
│  将总结设为今晚 22:00 自动生成      │
└────────────────────────────────────┘
```

---

## 6. IPC / API

```typescript
IPC.timeline = {
  // 获取指定日期的 timeline
  getDay: (date: string, options?: { developerMode?: boolean }) => Promise<DailyTimeline> => {},
  
  // 周/月/年
  getWeek: (isoWeek: string) => {},          // "2026-W17"
  getMonth: (month: string) => {},           // "2026-04"
  getYear: (year: number) => {},
  
  // 索引（用于日历热力图）
  getMonthlyIndex: (month: string) => Promise<MonthlyIndex> => {},
  getYearlyIndex: (year: number) => Promise<YearlyIndex> => {},
  
  // 手动触发今日总结
  generateDailySummary: (date: string) => Promise<DailySummary> => {},
  
  // 编辑总结（用户可改）
  updateDailySummary: (date: string, patch: { narrative?: string; headline?: string }) => {},
  
  // 导出 PDF
  exportPDF: (scope: { kind: 'day' | 'week' | 'month' | 'year'; value: string }) => Promise<{ path: string }> => {},
  
  // 订阅变化（有新事件时）
  subscribeDay: (date: string, cb: (timeline: DailyTimeline) => void) => () => void => {},
};
```

---

## 7. 事件投影机制

### 7.1 TraceableEvent → TimelineEntry 映射

每个 event kind 需要一个 projector：

```typescript
// src/main/timeline/projectors.ts

type Projector = (event: TraceableEvent, context: ProjectorContext) => TimelineEntry | null;

const projectors: Record<string, Projector> = {
  'note.created': (event, ctx) => {
    const { note_id, type, title, body } = event.payload;
    const iconMap = {
      thought: '💭',
      longform: '✍️',
      capture: '📌',
      voice_log: '🎤',
      daily_summary: '🌙',
    };
    return {
      event_id: event.id,
      event_kind: event.kind,
      occurred_at: event.occurred_at,
      layer: 1,
      icon: iconMap[type],
      title: type === 'thought' ? '捕获想法' : ...,
      summary: truncate(body, 80),
      refs: [{ kind: 'note', ref: event.payload.path, label: title }],
    };
  },
  
  'note.updated': (event, ctx) => {
    // 只对 longform 且字数变化大 > 100 时投影
    if (event.payload.type !== 'longform') return null;
    if (Math.abs(event.payload.word_delta) < 100) return null;
    return {
      ...,
      aggregation_key: `longform-update:${event.payload.note_id}`,
    };
  },
  
  'library.item.added': (event) => ({ /* ... */ }),
  
  // ... 所有 Layer 1 event kinds
};
```

### 7.2 特殊事件投影

```typescript
'note.created': (event, ctx) => {
  const entry = baseProjector(event, ctx);
  if (event.payload.special_marker) {
    entry.icon = event.payload.special_marker.icon;
    entry.title = SPECIAL_TITLES[event.payload.special_marker.kind] + ": " + entry.summary;
    entry.layer = 1;  // 特殊事件强制 Layer 1
  }
  return entry;
},
```

### 7.3 关联推断（derived_from）

两个事件之间的承接关系由 projector 推断：

- `library.item.read` 之后 10 分钟内的 `note.created(capture)` → capture.derived_from = library.read
- `feed.item.saved_to_library` → `library.item.added` 自动关联
- `conversation.message_sent` 里提到某 library 名字 → 关联

这些关联用**渲染时的`↳`**来展示。

---

## 8. 实施步骤

### Step 1: 数据模型 + 事件白名单（半天）
1. `src/shared/timeline/types.ts`
2. `src/shared/timeline/event-filter.ts`
3. 补齐所有 Phase 2 新增事件（note/library/feed/kb/para 等）的定义
4. `src/main/timeline/projectors.ts`（每个 event kind 的 projector）

### Step 2: Timeline Store（1 天）
1. `src/main/timeline/store.ts`
2. 从 TraceableEventStore 按日期范围读取 events → 投影成 TimelineEntry
3. 聚合规则（长文、任务等）
4. 索引生成（月/年）
5. IPC 暴露

### Step 3: 日视图 UI（1 天）
1. `src/renderer/views/TimelineView.tsx`
2. `src/renderer/components/timeline/DailyTimeline.tsx`
3. `src/renderer/components/timeline/TimelineEntryCard.tsx`
4. `src/renderer/components/timeline/TodaysGlanceCard.tsx`
5. `src/renderer/components/timeline/DailySummaryCard.tsx`
6. 时段分组渲染

### Step 4: 周/月/年视图（1 天）
1. `src/renderer/components/timeline/WeeklyView.tsx`
2. `src/renderer/components/timeline/MonthlyCalendar.tsx`（热力色块）
3. `src/renderer/components/timeline/YearlyHeatmap.tsx`
4. 视图切换器

### Step 5: 今日总结（半天）
1. 系统定时任务 `daily-summary` 注册
2. Prompt 模板实装
3. 手动触发 API
4. 总结编辑 UI

### Step 6: 特殊事件 + Quick Capture（半天）
1. Quick Capture UI 增加 "特殊标记" 选择
2. Note frontmatter 新增 `special_marker`
3. Projector 渲染特殊样式

### Step 7: PDF 导出（半天）
1. PDF 模板（React + print CSS）
2. 日/周/月/年四种模板
3. 导出 IPC

### Step 8: 测试 + 打磨（半天）
1. 跑过完整的 Phase 1+2 事件 → timeline 正确渲染
2. 开发者模式切换（Layer 2 展开）
3. 空日（没事件）的优雅降级
4. 大日（几百个事件）的性能

**总计：约 4~5 天 AI 实施**

---

## 9. 验收标准

- [ ] Timeline 一级入口可见
- [ ] 日视图：时段分组、今日一瞥、AI 总结卡片
- [ ] 日视图 entry 渲染正确（所有 Layer 1 event kinds）
- [ ] 事件聚合工作（长文、多次任务）
- [ ] 承接关系 ↳ 渲染正确
- [ ] 周视图：7 天卡片 + 本周总结
- [ ] 月视图：日历 + 热力色块 + 月度亮点
- [ ] 年视图：热力图 + 年度亮点
- [ ] 视图切换流畅
- [ ] AI 今日总结：定时任务自动生成 + 手动触发
- [ ] 特殊事件融入 Quick Capture
- [ ] PDF 导出（日/周/月/年）
- [ ] Layer 2 折叠/展开（开发者模式）
- [ ] Layer 3 绝对不出现在 Timeline

---

## 10. Future-Proof

### 架构预留（现在不实现）

1. **外部事件流入**
   - GitHub commits (`external.github.commit`)
   - Calendar events (`external.calendar.event`)
   - Health data (`external.health.activity`)
   - Email 重要事件 (`external.email.flagged`)
   - 架构上：TraceableEvent 的 kind 前缀 `external.*`，projector 继续扩展

2. **隐私层级**
   - `TimelineEntry.visibility: 'normal' | 'private' | 'encrypted'`
   - 某些事件可标记"**隐身**"：不进 AI 总结、不进年鉴 PDF
   - 加密存储（未来加 SQLCipher 或 EncFS 包装）

3. **Memory 可视化**
   - 某个 entry 未来被引用/关联的次数
   - "这段回忆被唤回 N 次"

4. **年鉴成书**
   - 未来可以把一年的 timeline 打印成一本书
   - 精装封面、章节目录、索引

### 数据字段预留

```typescript
interface TimelineEntry {
  // ... 已有字段
  
  // Future-Proof 预留
  visibility?: 'normal' | 'private' | 'encrypted';   // 隐私
  external_source?: string;                           // 外部来源
  engagement_count?: number;                          // 被回忆次数
  emotional_tone?: 'positive' | 'neutral' | 'negative';  // AI 情感分析
  location?: { lat: number; lng: number };             // 地理（如有）
}
```

---

## 11. 和其他文档的连接

| 文档 | 本文档如何依赖 |
|------|---------------|
| 文档 1（笔记系统） | Note 事件是 Timeline 的主要来源 |
| 文档 2（定时任务） | daily-summary 作为系统定时任务 |
| 文档 4（Stage View） | Timeline 的 entry 可以有 artifact 链接（跳转到当时的 stage） |
| 文档 6（Resource） | Resource engagement 事件进 Timeline；Resource 页面的 timeline 视图是本文档的子集 |
