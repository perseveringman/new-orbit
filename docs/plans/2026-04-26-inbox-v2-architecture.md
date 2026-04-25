---
status: draft
created: 2026-04-26
updated: 2026-04-26
adr: ADR-004, ADR-005
---

# Inbox v2 — 人机协作统一枢纽

> Inbox 是 Orbit 里"用户注意力在场时的统一入口"。本 plan 描述完整的 Inbox 架构、UI 实施、事件 schema 和与 chat / capture / auto-runner 的集成。

---

## Scope

- 一级分层：Capture / Messages / Archive / Feed History
- 事件 schema + 统一 emitter
- 左列表 + 右通用内容舞台 UI（Stage View 抽象）
- chat ↔ Inbox 双通道同步
- Feed History 独立归档

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  Inbox                                                        │
├──────────────────────────────────────────────────────────────┤
│  [一级 Tab]                                                    │
│  📥 Capture (3)  │  💬 Messages (5)  │  📦 Archive  │  🌊 Feed History (hidden by default) │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  (当前 tab 内的) 列表区     │  Stage View (右侧通用内容舞台)   │
│  - 未处理优先               │                                   │
│  - 时间倒序                 │  (依据选中条目渲染对应组件)         │
│  - 状态 badge              │                                   │
│                             │  chat / diff / reader / editor / │
│  ...                        │  proposal preview / insight card │
│                             │                                   │
└──────────────────────────────────────────────────────────────┘
```

### 一级 Tab 说明

| Tab | 展示什么 | 计数规则 |
|-----|---------|---------|
| 📥 Capture | Feed / Library / Thoughts 待处理条目（内部再分二级 tab） | 仅 Library 未读数 |
| 💬 Messages | A/B/C/D 四类事件待处理条目 | 未处理数 |
| 📦 Archive | Messages + Library 的已处理/已归档 | 不计数 |
| 🌊 Feed History | 默认隐藏，可通过搜索或命令进入 | 不计数 |

### 左侧栏红点规则

Orbit 左侧栏的 Inbox 图标红点 **只显示 Messages 未读数**，Capture 不参与。Feed 永远不参与。

---

## 存储结构

```
<vault>/.orbit/inbox/
├── messages/
│   ├── pending.ndjson              # 未处理消息
│   └── archive/YYYY-MM.ndjson     # 已处理/已归档
├── capture/
│   ├── library/
│   │   ├── pending.ndjson
│   │   ├── articles/              # 原始文章正文 html/md
│   │   │   └── <library_id>.md
│   │   └── archive/YYYY-MM.ndjson
│   ├── thoughts/
│   │   ├── pending.ndjson
│   │   └── archive/YYYY-MM.ndjson
│   └── feed/
│       ├── subscriptions.json
│       ├── pending.ndjson
│       └── history/YYYY-MM.ndjson  # 独立 Feed History
└── stage-renderers.json            # per-subtype 渲染器注册（可选）
```

---

## 事件 Schema

### 统一 Inbox 事件

```typescript
// src/main/inbox/types.ts

export type InboxCategory = 'capture' | 'message'

export type InboxMessageSubtype =
  | 'A1' | 'A2' | 'A3' | 'A4'       // 审批类
  | 'B1' | 'B2' | 'B3'                // 求助类
  | 'C1' | 'C2' | 'C3'                // 警示类
  | 'D1' | 'D2' | 'D3'                // 纪律类

export type InboxCaptureSubtype =
  | 'feed_item'
  | 'library_article'
  | 'thought'

export interface InboxItemBase {
  id: string
  category: InboxCategory
  subtype: InboxMessageSubtype | InboxCaptureSubtype

  title: string
  summary: string

  context: {
    project_uid?: string
    task_uid?: string
    run_id?: string
    area_uid?: string
    resource_uid?: string
    proposal_id?: string
    feed_subscription_id?: string
    // ...
  }

  payload: unknown                   // type-specific

  status: InboxStatus
  created_at: string
  updated_at: string
  resolved_at?: string
  resolved_by?: 'user' | 'agent'
  resolution_source?: 'chat' | 'inbox' | 'cli'
  resolution_note?: string
}

export type InboxStatus =
  | 'pending'     // 未处理
  | 'read'        // 仅 Library 有（中间态）
  | 'reading'     // 仅 Library 有
  | 'resolved'    // Messages 处理完
  | 'processed'   // Library / Thoughts 处理完
  | 'dismissed'   // 用户忽略
  | 'archived'    // 移入归档
```

### 统一 emitter

```typescript
// src/main/inbox/emitter.ts

export const inbox = {
  emit: {
    message(input: MessageInput): Promise<string>,
    capture(input: CaptureInput): Promise<string>,
  },
  resolve(id: string, decision: ResolveDecision, source: 'chat' | 'inbox' | 'cli'): Promise<void>,
  dismiss(id: string, source: 'chat' | 'inbox' | 'cli'): Promise<void>,
  archive(id: string): Promise<void>,
}
```

所有产生 Inbox 事件的模块（approval store、planner、dispatcher、budget watch、capture ingestion）都调用 `inbox.emit.*`。

---

## 双通道同步（chat ↔ Inbox）

### 机制

核心洞察：**单一 store，多 view 订阅**。

```
┌─────────────────┐
│ InboxStore      │
│ (+ Approval     │
│   Store linked) │
└────────┬────────┘
         │
    ┌────┼────┐
    │    │    │
    ↓    ↓    ↓
  Chat  Inbox CLI
  Card  List  Output
```

### IPC 事件

```typescript
// renderer 订阅
ipcRenderer.on('inbox:item_created', (_, item) => {...})
ipcRenderer.on('inbox:item_updated', (_, item) => {...})
ipcRenderer.on('inbox:item_resolved', (_, item) => {...})
```

### Chat 审批卡片

见 `auto-runner-dispatcher.md` 阶段 B 的 ApprovalCard 组件。

同一 proposal 的 chat 卡片和 Inbox 条目：
- 通过 `proposal_id` 关联
- 任一端操作调用 `inbox.resolve(id, decision, source)`
- Store 更新后广播事件 → 两端 UI 同步

---

## UI 实施

### 主容器

```
src/renderer/src/components/inbox/
├── InboxShell.tsx             # 主容器（顶栏 tab + 左列 + 右舞台）
├── tabs/
│   ├── CaptureTab.tsx         # Capture 二级（Feed/Library/Thoughts）
│   ├── MessagesTab.tsx
│   ├── ArchiveTab.tsx
│   └── FeedHistoryTab.tsx
├── list/
│   ├── InboxList.tsx          # 通用列表组件
│   └── ListItem.tsx
├── stage/
│   ├── StageView.tsx          # 通用内容舞台
│   └── renderers/             # per-subtype 渲染器
│       ├── ApprovalDiffRenderer.tsx       # A1
│       ├── ProposalPreviewRenderer.tsx    # A2/A3/A4
│       ├── HelpRequestRenderer.tsx        # B1/B2/B3
│       ├── AgentInsightRenderer.tsx       # C3
│       ├── JournalRenderer.tsx            # D1
│       ├── FeedItemRenderer.tsx
│       ├── LibraryArticleRenderer.tsx
│       └── ThoughtRenderer.tsx
└── search/
    └── FeedHistorySearch.tsx  # Feed History 的搜索入口
```

### Stage View 抽象（承接 ADR-005）

```tsx
// StageView.tsx
interface StageViewProps {
  item: InboxItem | null
}

export function StageView({ item }: StageViewProps) {
  if (item == null) return <EmptyState />
  const Renderer = rendererRegistry.get(item.subtype) ?? DefaultRenderer
  return <Renderer item={item} />
}
```

Stage View 是 Orbit 里通用的 "chat + 产物"模式的具体实例，后续 Planner Chat / Task Conversation 如果重构，都可以复用此抽象。

---

## Per-subtype 渲染器示例

### A1 合并审批

```tsx
<ApprovalDiffRenderer item={item}>
  <DiffView ghostBranch={item.payload.ghost_branch} base={item.payload.base} />
  <SummarySection summary={item.payload.agent_summary} />
  <ActionBar>
    <Button onClick={approve}>Approve Merge</Button>
    <Button onClick={reject}>Reject</Button>
    <Button onClick={requestChanges}>Request Changes</Button>
  </ActionBar>
</ApprovalDiffRenderer>
```

### B1 Agent 求助（信息不足）

```tsx
<HelpRequestRenderer item={item}>
  <TaskConversationTab   // 直接嵌入 chat
    projectUid={item.context.project_uid}
    taskUid={item.context.task_uid}
    runId={item.context.run_id}
    focusOnLatestMessage
  />
</HelpRequestRenderer>
```

用户在 chat 里回复 → agent 继续 → 问题解决后 Inbox 条目自动 resolved。

### Library Article

```tsx
<LibraryArticleRenderer item={item}>
  <ArticleReader
    articleId={item.payload.article_id}
    initialScrollPosition={item.payload.scroll_position}
    onScroll={throttle(200, pos => updateScrollPosition(item.id, pos))}
    onDone={() => markProcessed(item.id)}
  />
  <ActionBar>
    <Button onClick={promoteToResource}>🔥 Promote to Resource</Button>
    <Button onClick={dismiss}>Dismiss</Button>
  </ActionBar>
</LibraryArticleRenderer>
```

---

## Feed History

### 独立归档

当 Feed 条目被"扫过" (enters viewport for ≥ 2s, or user scrolls past):

- 从 `feed/pending.ndjson` 移除
- 追加到 `feed/history/YYYY-MM.ndjson`
- **不进 Archive 视图**

### 搜索入口

UI 中不做显式 Feed History tab（避免占据主界面），但提供：

1. 命令面板：`⌘K` → "Search Feed History"
2. Agent 检索：CLI `orbit feed history search <query>`（见 `cli-migration.md`）
3. 未来：Inbox 搜索统一入口

---

## CLI 命令（引用 cli-migration.md）

```bash
# Messages
orbit inbox list --category message --status pending
orbit inbox get <id>
orbit inbox resolve <id> --decision approve --note "..."
orbit inbox dismiss <id>

# Capture
orbit inbox list --category capture --subtype library --status unread
orbit capture thought create --content "..."

# Feed
orbit feed add <rss-url>
orbit feed list-subscriptions
orbit feed history search <query>
orbit feed history purge --before 2025-10-01   # 手动清理

# Library
orbit library save <url> [--note "..."]
orbit library read <id>
orbit library promote <id>

# Emit（供 agent 内部调用）
orbit inbox emit-message --type B1 --task-uid ... --summary "..."
```

---

## 迁移策略

### 旧 Inbox 数据

v1 的 ReviewQueue（`.orbit/review_queue.ndjson`）如果存在：
- 迁移为 Message 类 A1（合并审批）
- `status`: `pending_review` → `pending`，已处理的 → `archived`
- 追加到 `messages/archive/<month>.ndjson`

### Capture 数据

v1 没有 Capture 落地，从空开始。

### Worktree GC 事件

v1 Worktree GC 报告在 cron 任务中产出，现在改为 emit D3 Inbox 事件。

---

## 测试

- `tests/inbox_store.test.ts` — CRUD + 状态机
- `tests/inbox_emitter.test.ts` — emit/resolve/dismiss
- `tests/inbox_chat_sync.test.ts` — 双通道同步
- `tests/feed_history.test.ts` — 淡出归档
- `e2e/inbox_workflow.spec.ts` — 完整 A1 审批 + B1 求助
- `e2e/library_read.spec.ts` — scroll position 持久化

---

## 风险

### UI 复杂度

Inbox 涉及多种事件类型 × 多种渲染器，初期 UI 工作量大。

**缓解**：
- 分阶段上线：先 Messages (A1 / A2 / B1) + Library，其他渲染器延后
- DefaultRenderer 提供降级 UI

### Feed History 爆大

每日 RSS 可能 100 条+，一年可累积数万条目。

**缓解**：
- 按月分片 NDJSON
- 读取按需（搜索时只扫描 recent N 个月）
- 未来可加向量索引做语义检索

### 状态同步 bug

chat 和 Inbox 状态不一致会让用户迷惑。

**缓解**：
- 单 store 驱动（见上）
- 出问题时提供"刷新 Inbox"按钮强制重拉
- Activity Log 记录所有 resolve/dismiss，便于排查

---

## 验收

- [ ] Inbox 一级 Tab (Capture / Messages / Archive) 切换正常
- [ ] Capture 内的 Feed / Library / Thoughts 三个二级 tab 正常
- [ ] 点击 Messages 条目，右侧正确渲染对应组件
- [ ] 至少覆盖这些渲染器：A1 (diff) / A2 (proposal preview) / B1 (chat) / Library (reader) / Thought (editor)
- [ ] chat 审批卡片和 Inbox 条目同步消失（双通道）
- [ ] Feed 条目自动淡出到 Feed History（2s 视口 + scroll past）
- [ ] Library 阅读进度持久化，关闭重开后从原位置继续
- [ ] 未读数计数符合规则（左栏仅 Messages、Capture tab 仅 Library、Feed 永不计）
- [ ] 所有 Inbox 动作产生对应 Activity Log 事件
