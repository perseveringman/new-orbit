---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-009
---

# Activity Log Infrastructure

> 系统级用户行为留痕的基础设施。本期不做 Review 页面 UI，只搭好 schema + emitter + 存储 + 各模块接入。

---

## Scope

- Event schema + TypeScript types
- NDJSON 存储（按日分片）
- 统一 `emitActivity()` API
- 各业务模块接入
- 基础查询工具（供 CLI / 未来 Review UI 用）

---

## 模块结构

```
src/main/activity/
├── types.ts          # ActivityEvent schema
├── emitter.ts        # emitActivity() API
├── store.ts          # NDJSON 存储 + 追加写
├── query.ts          # 按日期/actor/action 查询
├── ipc.ts            # IPC 暴露给 renderer（只读）
└── index.ts
```

---

## Schema

```typescript
// src/main/activity/types.ts

export interface ActivityEvent {
  id: string                // uuid v4
  at: string                // ISO timestamp

  actor: 'user' | 'agent' | 'system'
  actor_id?: string         // agent 时是 run_id；user 时可选 "user"；system 是定时任务标识

  action: ActivityAction    // 见下

  context: ActivityContext
  payload?: unknown

  summary: string           // 人类可读摘要（用于 Review 页面）
}

export type ActivityAction =
  // Task
  | 'task.created'
  | 'task.updated'
  | 'task.status_changed'
  | 'task.deleted'
  | 'task.approved'
  | 'task.dependency_changed'
  | 'task.dependency_satisfied'

  // Project
  | 'project.created'
  | 'project.archived'
  | 'project.updated'

  // Area / Resource
  | 'area.created' | 'area.updated'
  | 'resource.created' | 'resource.updated'

  // Inbox
  | 'inbox.message_created'
  | 'inbox.message_resolved'
  | 'inbox.message_dismissed'
  | 'inbox.capture_saved'
  | 'inbox.capture_processed'
  | 'inbox.capture_dismissed'

  // Capture
  | 'feed.subscription_added'
  | 'feed.subscription_removed'
  | 'feed.item_saved'          // Save to Library
  | 'library.article_saved'
  | 'library.article_read'
  | 'library.article_promoted'
  | 'library.article_dismissed'
  | 'thought.created'
  | 'thought.promoted'
  | 'thought.dismissed'

  // Agent
  | 'agent.run_started'
  | 'agent.run_completed'
  | 'agent.run_failed'
  | 'agent.proposal_submitted'
  | 'agent.proposal_approved'
  | 'agent.proposal_rejected'
  | 'agent.merge_approved'

  // Planner
  | 'planner.proposal_published'
  | 'planner.proposal_revised'

  // Settings
  | 'settings.changed'

  // Migration
  | 'migration.v2_task_authorization'
  // ... 后续扩展

export interface ActivityContext {
  project_uid?: string
  task_uid?: string
  run_id?: string
  area_uid?: string
  resource_uid?: string
  inbox_item_id?: string
  proposal_id?: string
  subscription_id?: string
  library_id?: string
  thought_id?: string
  [k: string]: string | undefined  // 可扩展
}
```

---

## Emitter

```typescript
// src/main/activity/emitter.ts

import type { ActivityEvent, ActivityAction, ActivityContext } from './types'
import { store } from './store'
import { randomUUID } from 'crypto'

interface EmitInput {
  actor: 'user' | 'agent' | 'system'
  actor_id?: string
  action: ActivityAction
  context: ActivityContext
  payload?: unknown
  summary: string
}

export function emitActivity(input: EmitInput): void {
  const event: ActivityEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...input,
  }
  store.append(event)  // 异步但最好 fire-and-forget 错误只记 console
}
```

### 调用规范

- **"fire-and-forget"**：emitter 绝不能抛异常影响主业务流程；内部 try/catch 并 `console.error`
- **同步调用者**：所有业务模块在状态改变成功后 emit（失败了不 emit）
- **避免重复**：每个 action 在一个业务流程中只 emit 一次

---

## Store

```typescript
// src/main/activity/store.ts

import fs from 'fs/promises'
import path from 'path'
import { getVaultRoot } from '../paths'
import type { ActivityEvent } from './types'

function getDatePath(at: string): string {
  const day = at.slice(0, 10) // YYYY-MM-DD
  return path.join(getVaultRoot(), '.orbit', 'activity', `${day}.ndjson`)
}

const writeQueue: Map<string, Promise<void>> = new Map()

export const store = {
  async append(event: ActivityEvent): Promise<void> {
    const filePath = getDatePath(event.at)
    const line = JSON.stringify(event) + '\n'

    // 按文件串行化写入避免并发写冲突
    const prev = writeQueue.get(filePath) ?? Promise.resolve()
    const next = prev.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.appendFile(filePath, line, 'utf-8')
    })
    writeQueue.set(filePath, next.catch(() => {}))
    return next
  }
}
```

---

## Query

```typescript
// src/main/activity/query.ts

export interface QueryFilter {
  from?: string                // ISO date
  to?: string
  actor?: 'user' | 'agent' | 'system'
  action?: ActivityAction | ActivityAction[]
  project_uid?: string
  task_uid?: string
  limit?: number
}

export async function queryActivities(
  filter: QueryFilter
): Promise<ActivityEvent[]> {
  // 确定要读的文件（按日期范围）
  const files = listActivityFilesInRange(filter.from, filter.to)
  const results: ActivityEvent[] = []

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8').catch(() => '')
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as ActivityEvent
        if (matches(event, filter)) {
          results.push(event)
          if (filter.limit && results.length >= filter.limit) return results
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return results
}
```

### Index（未来优化点）

本期不建索引；全部按时间顺序扫 NDJSON。未来若查询变慢，可以建 SQLite 二级索引（按 actor / action / project_uid）。

---

## CLI 命令

```bash
# 查询今天的活动
orbit activity list --from today

# 过去 7 天我做了什么（按 action 分组）
orbit activity summary --from -7d --group-by action

# 查某个任务的所有历史
orbit activity list --task-uid task_XXX

# Agent 运行历史
orbit activity list --actor agent --from -24h

# 按 JSON 输出，供 agent 消费
orbit activity list --project-uid proj_XXX --json
```

---

## 各模块接入

### Task Store (`src/main/task/`)

```typescript
// 创建 task 后
emitActivity({
  actor: 'user',
  action: 'task.created',
  context: { task_uid: task.uid, project_uid: task.project_uid },
  payload: { title: task.title, created_by: task.created_by },
  summary: `Created task "${task.title}"`,
})

// Status change
emitActivity({
  actor: user_or_agent,
  action: 'task.status_changed',
  context: { task_uid, project_uid },
  payload: { from: prevStatus, to: newStatus },
  summary: `Task "${task.title}": ${prevStatus} → ${newStatus}`,
})
```

### Inbox Store (`src/main/inbox/`)

每个 `inbox.resolve()` / `inbox.dismiss()` / `inbox.emit()` 都关联一个 Activity：

```typescript
// inbox.resolve
emitActivity({
  actor: 'user',
  action: item.category === 'message'
    ? 'inbox.message_resolved'
    : 'inbox.capture_processed',
  context: { inbox_item_id: item.id, project_uid, task_uid, proposal_id },
  payload: { decision, resolution_source },
  summary: `Resolved "${item.title}"`,
})
```

### Agent Runner (`src/main/agent/runner.ts`)

```typescript
// run 启动
emitActivity({
  actor: 'system',
  action: 'agent.run_started',
  context: { run_id, task_uid, project_uid },
  payload: { runtime_kind, execution_context },
  summary: `Agent run started: ${task.title}`,
})

// run 完成
emitActivity({
  actor: 'system',
  action: 'agent.run_completed',
  context: { run_id, task_uid, project_uid },
  payload: { duration_ms, cost_usd, token_usage },
  summary: `Agent run completed: ${task.title} (${formatDuration(duration_ms)})`,
})
```

### Capture / Planner / Settings

各自模块在状态改变时调用 emitter，参考上面模式。

---

## 性能与存储

### 预估

- 重度用户每天产生 200-500 条事件
- 每条 ~500 bytes → 每天 ~250KB → 每年 ~90MB
- 可接受（本地磁盘）

### GC

本期不做。未来如果需要：
- 超过 2 年的旧日志可以压缩成月度 summary（agent 生成）
- 原始 NDJSON 归档到 `activity/archive/`

---

## 测试

- `tests/activity_emitter.test.ts` — 基础 emit + 存储
- `tests/activity_query.test.ts` — 各种 filter 组合
- `tests/activity_concurrency.test.ts` — 并发写入无丢失
- `tests/activity_integration_task.test.ts` — Task store 变更触发对应 activity

---

## 风险

### I/O 开销

每次状态变更都写磁盘。

**缓解**：
- `appendFile` 本身是 OS 级 buffered 写，性能足够
- 每文件串行化 write queue 避免竞态，不阻塞业务
- 未来可批量 flush（但本期不需要）

### Schema 演化

Action 类型后续会增加。

**缓解**：
- Action 是 string literal，新增无破坏性
- 老数据的未知 action 查询时跳过即可
- `schema.json` 文件记录当前 schema 版本（未来 migration 参考）

### 隐私

Activity Log 包含行为轨迹。

**缓解**：
- 本地存储，从不外传
- Payload 不记录敏感正文（只记引用 uid、类型、状态），确保泄露风险低

---

## 验收

- [ ] `.orbit/activity/YYYY-MM-DD.ndjson` 按日生成
- [ ] Task / Inbox / Capture / Agent 的主要动作都有对应事件
- [ ] CLI `orbit activity list` 能查询和过滤
- [ ] 并发写入（10 个 emit 同时发生）无事件丢失
- [ ] 主流程不因 Activity Log 故障中断
