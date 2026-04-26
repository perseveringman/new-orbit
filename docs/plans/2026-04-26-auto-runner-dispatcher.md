---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-001, ADR-002, ADR-006
---

# Auto-runner Dispatcher — 24×7 任务执行器

> 替代 v1 Night Shift。实现 Agent 自主边界（子任务折叠）和 propose-approve 两阶段授权。

---

## Scope

- 废弃 `src/main/night_shift/`
- 新增 `src/main/auto_runner/` Dispatcher
- Task schema 扩展（授权链路）
- Proposal 系统（agent 提议 + 人审批）
- Chat 原地审批卡片组件

---

## Feature 描述

### 背景

v1 Night Shift 是"用户选一批任务 + 设并发 + 自动 PR"的批量执行器。v2 的需求：

- Agent 24×7 持续可用，不限时段
- Agent 自主拆步骤时**不污染看板**
- Agent 要创建新 task 时必须人审
- 所有 agent 产出合并都要人审

### 用户可见行为

- **Dashboard 新增"Auto-runner"面板**：显示当前正在执行的 run、预算消耗、最近完成的任务
- **Kanban 不改**：依然 inbox/today/doing/blocked/done 五列，但 `todo` 列中 ready 的任务会自动被 agent 拾取
- **Task Card 右上角**：
  - 如果被 agent 拾取，显示 agent icon
  - 如果依赖未满足，显示 waiting icon + hover 看依赖列表
- **Settings 新增"Auto-runner"章节**：开关 / 全局并发上限 / 每小时任务数上限 / 预算限制联动

### 内部流程

```
Dispatcher main loop (每 5s tick):
  1. 查询所有 status=todo 的任务
  2. 过滤出 ready：approved_by != null + depends_on 全部 done
  3. 按优先级排序（today 标记 > 默认顺序）
  4. 检查全局并发（<= settings.maxConcurrent）
  5. 给下一个 ready task 分配 agent：
     a. 选择 ExecutionContext（按 project AGENT.md 的 execution_context）
     b. 启动 run（复用现有 RunnerPool / AgentRunner）
     c. Activity Log: agent.run_started
  6. 监听 run 事件 → 事件推送到 Inbox（A/B/C 类）
  7. 循环
```

---

## 阶段 A：Task schema 扩展

### Frontmatter 新字段

```yaml
type: task
status: todo
title: ...

# v2 新增
created_by: user | agent_run:<run_id>
approved_by: user | null
approved_at: 2026-04-26T10:12:00Z | null
proposed_by_agent_run: <run_id> | null
proposed_during_task: <task_uid> | null
proposal_id: <proposal_id> | null
approval_decision_note: "..." | null

depends_on: [<task_uid>, ...] | []
derived_from: <task_uid> | null
```

### Zod schema 更新

`src/shared/schemas/task.ts` 中扩展 taskSchema，新字段全部 optional（兼容老数据）。

### 迁移脚本

`src/main/migrations/v2_task_authorization.ts`：

- 扫描所有 v1 task
- 填入默认：`created_by: user, approved_by: user, approved_at: <file mtime>`
- 不主动填 `depends_on` / `derived_from`（保持 null）
- 迁移时写入 Activity Log `migration.v2_task_authorization`

---

## 阶段 B：Proposal 系统

### 模块结构

```
src/main/approval/
├── store.ts           # proposal 存储（NDJSON + 内存索引）
├── state.ts           # 状态机定义
├── sync.ts            # chat/Inbox 双通道同步
├── ipc.ts             # IPC 暴露给 renderer
└── types.ts           # Proposal schemas
```

### 存储

```
<vault>/.orbit/approvals/
├── pending.ndjson
└── archive/YYYY-MM.ndjson
```

### Proposal schema

```typescript
interface Proposal {
  id: string                    // proposal_id (uuid)
  type: 'new_task' | 'planner_publish' | 'scope_expansion' | 'merge' | 'archive_project'
  status: 'pending' | 'approved' | 'rejected' | 'dismissed'

  submitted_by: 'agent' | 'user'
  submitted_at: string
  submitted_by_agent_run?: string
  submitted_during_task?: string

  subject: string                // 人类可读的一句话
  payload: unknown               // type-specific data

  resolved_at?: string
  resolved_by?: 'user'
  resolution_note?: string
  resolution_source?: 'chat' | 'inbox'

  inbox_item_id?: string
  chat_card_id?: string
}
```

### 状态机

```
         submit
pending ─────────> (approved | rejected | dismissed)
                         │
                         ↓
                      archive（仅保留在 Archive 视图/Archive NDJSON）
```

### Chat 审批卡片

在 `src/renderer/src/components/chat/` 新增 `ApprovalCard.tsx`，作为 chat 消息类型之一（而不是某个 view 的特殊组件）：

```tsx
<ChatMessage type="approval" proposal={proposal}>
  <ApprovalCard proposal={proposal} onApprove={...} onReject={...} />
</ChatMessage>
```

任何 chat 上下文（Task Conversation / Planner Chat / 未来 Note Chat）都可以渲染此组件。

### Inbox 事件映射

Proposal → Inbox Message：

| Proposal type | Inbox event subtype |
|--------------|---------------------|
| new_task | A2 |
| planner_publish | A3 |
| scope_expansion | A4 |
| merge | A1 |
| archive_project | D2 |

Proposal 创建 → 自动生成 Inbox 条目（`inbox.emit()`）。解决 → 双向同步状态。

---

## 阶段 C：Auto-runner Dispatcher

### 模块结构

```
src/main/auto_runner/
├── dispatcher.ts        # 主循环
├── ready_set.ts         # ready 集合计算（含依赖）
├── scheduler.ts         # 并发 / 预算 / 优先级
├── event_bridge.ts      # agent run 事件 → Inbox/Activity
└── settings.ts          # 全局设置 store
```

### 集成点

- 复用 `src/main/agent/runner.ts` 的 `AgentRunner` / `RunnerPool`
- 通过 ExecutionContext 接口启动 run（不直接调 worktree）
- 事件通过 Inbox emitter（新增 B/C 类生成逻辑）

### Settings

`appSettings.ts` 新增：

```typescript
{
  autoRunner: {
    enabled: boolean
    maxConcurrent: number          // 默认 2
    hourlyTaskLimit: number         // 默认 10
    tickIntervalMs: number          // 默认 5000
  }
}
```

### 废弃 Night Shift

- 删除 `src/main/night_shift/` 目录
- 删除 `tests/night_shift_dispatcher.test.ts`
- UI 中的 "🌙 Night Shift" 导航入口替换为 "Auto-runner"
- 相关 IPC (`nightShift:*`) 删除或重命名

---

## 阶段 D：Agent 行为规范

### System prompt 修改

在 agent 的 system prompt 中加入新的边界说明（`src/main/agent/prompts/` 或类似位置）：

```
You are an agent working on a task in Orbit. Follow these rules:

1. Your subtasks (thinking, writing code, running tests, debugging)
   should be recorded in the current task's Execution Log, not created
   as new tasks on the Kanban.

2. If you discover work that has independent user value and should be
   tracked on the Kanban, use `orbit task propose` to submit it for
   user approval. Do NOT create tasks directly.

3. If you need to extend the scope of the current task to complete it,
   use `orbit task propose-scope` to request user approval.

4. If you are blocked by missing information, use `orbit inbox help` to
   request user input.

5. Your final output will be reviewed before merging. Use
   `orbit run request-merge` when ready.
```

### Runner 侧限制

- 如果 agent 尝试通过老的 `create_task` CLI 路径（临时兼容层）→ 自动转为 propose + 警告
- Activity Log 记录所有 agent 动作

---

## 测试策略

### 单元测试

- `tests/auto_runner_dispatcher.test.ts` — 替代 `night_shift_dispatcher.test.ts`
- `tests/ready_set.test.ts` — 依赖计算
- `tests/proposal_state.test.ts` — 状态机
- `tests/proposal_sync.test.ts` — chat ↔ Inbox 同步

### 集成测试

- `e2e/auto-runner.spec.ts`：创建任务 → 等待拾取 → 产出 → 审批合并
- `e2e/propose-approve.spec.ts`：agent 提议 → Inbox 审批 → 入库
- `e2e/scope-expansion.spec.ts`：扩范围审批

### 手动验收

- 开启 Auto-runner，看板放 3 个 task，观察并发 ≤ 2 且依赖顺序正确
- Agent 在 chat 里 propose 新任务，在 chat 原地 approve，看 Inbox 条目同步消失

---

## 风险与权衡

### 并发失控

Auto-runner 循环自启动 run，如果预算/并发控制出 bug 可能烧光 token。

**缓解**：
- 硬上限：`maxConcurrent` 和 `hourlyTaskLimit` 在 Settings 中设置
- 紧急 kill switch：`orbit auto-runner stop` CLI / Settings 开关
- BudgetGate 保护（v1 已有）

### Proposal 状态丢失

Chat 原地卡片和 Inbox 条目如果状态不同步会让用户迷惑。

**缓解**：
- 单一 store 驱动，两端 UI 都订阅
- 状态变更通过 IPC 事件广播
- 出现不一致时以 store 为准 + 自动刷新 UI

### Agent 提议滥用

Agent 可能频繁 propose 琐碎任务骚扰用户。

**缓解**：
- System prompt 明确边界
- 未来可引入"提议频率限制"（比如每个 run 最多 3 次 propose）
- Activity Log 可分析 agent 提议接受率，优化提示

---

## 验收

- [ ] Auto-runner 24 小时连续运行无崩溃
- [ ] 手动创建 3 个 task，A → B → C 依赖链，观察执行顺序正确
- [ ] Agent 在执行时 propose 新 task，在 chat 和 Inbox 都能看到，批准后入库
- [ ] Night Shift 相关代码删除，相关 UI 入口替换
- [ ] 所有 task 迁移后有完整授权链路字段
