---
id: ADR-006
title: 任务授权模型 — propose-approve 两阶段 + 授权链路
status: accepted
date: 2026-04-26
related: ADR-001, ADR-002, ADR-004
implementation: plans/2026-04-26-auto-runner-dispatcher.md
---

## Context

v1 中 agent 通过 MCP `create_task` 可以直接创建任务入看板。配合 v2 的 Auto-runner（24×7 执行，ADR-001），这会导致危险的连锁：

- Agent A 提议创建 Task X → 直接入库 → Dispatcher 立即拾取 → Agent B 开始执行 Task X
- 用户完全不知情的情况下 agent 生态就自己扩张了

用户在 v2 对话中明确了边界：

> "Agent 调用 create_task 之前需要主动告诉用户他想创建新的任务，而不是随意的去创建，用户允许再开始创建。"
>
> "人主动拆分的任务才会出现在看板上，这个人主动拆分的概念，实际上不一定是人手动添加任务，也可以是人允许 AI 按照 AI 的方式去添加。"

也就是说：
- **所有入看板的 task 都必须有"人的授权"作为前提**
- 授权可以是"用户手动创建"，也可以是"用户审批 agent 的 proposal"
- 但不能是"agent 自行决定"

这个模式还需要推广到**其他破坏性或扩大范围的动作**（扩大当前任务 scope、合并大范围代码变更、归档项目等）。

同时，v2 对话中另一个关键共识：

> "原地审批能力是通用的 chat 基建，没有问题。依赖模型的方案用方案 A。Task editor / planner publish 时做检测，拒绝循环依赖。"

审批能力是**chat 基建**，不是特定组件的功能——用户在 chat 里正在和 agent 讨论时，原地审批应该立即可用。

## Decision

### 1. propose-approve 两阶段模式

Agent 所有需要"扩张系统状态"的动作必须走两阶段：

```
Agent: 发起 propose_xxx  →  创建 proposal_id，状态 pending
                                ↓
                        生成 A 类 Inbox 事件 + chat 原地审批卡片
                                ↓
                        用户在 chat 或 Inbox 任一处处理
                                ↓
                        状态变为 approved / rejected / dismissed
                                ↓
             (approved 时)  →  实际执行动作（创建 task / 合并 / 归档 etc）
```

### 2. 覆盖的动作类别

| Action | Proposal Type | Inbox 事件 |
|--------|--------------|------------|
| 创建新 task | `propose_new_task` | A2 |
| 发布 Planner proposal | `propose_planner_publish` | A3 |
| 扩大当前任务 scope | `propose_scope_expansion` | A4 |
| 合并 agent 产出 | `propose_merge` | A1 |
| 归档项目 | `propose_archive_project` | D2 |

### 3. 任务授权链路字段

所有 task 的 frontmatter 中记录授权链路：

```yaml
type: task
status: todo
title: ...

# 授权链路（v2 新增）
created_by: user | agent_run:<run_id>
approved_by: user | null                      # null 表示用户手动创建（自授权）
approved_at: 2026-04-26T10:12:00Z | null
proposed_by_agent_run: <run_id> | null        # 如果是 agent 提议
proposed_during_task: <task_uid> | null       # 在执行哪个任务时提议
proposal_id: <proposal_id> | null             # 关联到 Inbox 事件
approval_decision_note: "..."                 # 用户审批时可填简短理由
```

**约束**：
- `created_by = user` 时，`approved_by` 可以为 null（用户手动创建即自授权）
- `created_by = agent_run:*` 时，`approved_by` 必须非 null（强制走 propose-approve）

### 4. 审批能力是 chat 基建

审批卡片作为 **Chat 的通用组件**存在，任何 chat 上下文（Task Conversation、Planner Chat、未来的 Note Chat）都能原地触发和处理审批。不需要跳出 chat 就能完成审批。

### 5. 双通道同步

同一 `proposal_id` 在 chat 原地卡片和 Inbox 条目之间同步状态（具体机制见 ADR-004）。

## Rationale

**为什么所有破坏性/扩张动作都要走审批**：

- v2 的 Auto-runner（ADR-001）让 agent 随时可以接下一个 task——如果 agent 可以自己创造 task，系统会失控
- **看板是用户的认知地图**（ADR-002），用户必须掌控地图上出现什么
- 统一的 propose-approve 模式让用户心智简化："所有新东西都要我批准"

**为什么审批卡片做成 chat 基建**：

- 用户正在和 agent 对话时，触发审批的最自然位置就是对话里原地
- 强迫跳出到 Inbox 处理会打断用户正在做的事
- Inbox 只是副本兜底（用户不在 chat 时的入口）

**为什么授权链路这么多字段**：

- 事后审计需要完整的"这个 task 是怎么来的"追溯
- `proposed_during_task` 特别重要——能看出"执行 A 时提议了 B"的认知轨迹
- 这些字段也是未来 Orbit 自我进化的数据基础

**替代方案**：

- **只记 `created_by`，不记完整链路** — 拒绝。失去了"在哪个任务执行时被提议"这类关键信息。
- **只用 Inbox 审批，不要 chat 原地** — 拒绝。用户在 chat 里对话时被强制切到 Inbox 是糟糕体验。
- **允许 agent 对"明显无害"的动作跳过审批** — 拒绝。"明显无害"边界无法定义，留一个后门就会被滥用。

## Consequences

**正面**：
- 用户始终掌控看板和项目状态
- 任务的来源和审批轨迹可追溯
- chat 内原地审批让用户体验流畅

**负面 / 待处理**：
- Agent 每次要扩张状态都要走审批——需要通过 UI 设计让审批很快（DiffView 清晰、一键 approve、快捷键支持）
- 需要 proposal 的状态机 + 持久化 + 双通道同步实现
- Task schema 加字段需要迁移现有 task 数据

### 过渡期

- v1 已有的 task 默认填 `created_by: user, approved_by: user` (假设都是手动创建的)
- v1 中 agent 通过 `create_task` 创建的 task（如果有），回填 `created_by: agent_run:legacy, approved_by: user_legacy`

## Implementation

- Proposal 系统（状态机 + 存储）在 `src/main/approval/` 新模块
- Task schema 加授权链路字段
- Chat 组件加审批卡片（作为通用 chat 组件，不属于任何特定 view）
- `create_task` CLI 命令 → `orbit task propose`（见 ADR-008）

见 [`plans/2026-04-26-auto-runner-dispatcher.md`](../plans/2026-04-26-auto-runner-dispatcher.md)。
