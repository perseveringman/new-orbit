---
id: ADR-007
title: 任务依赖模型 — depends_on + 拓扑解锁
status: accepted
date: 2026-04-26
related: ADR-001, ADR-002
implementation: plans/2026-04-26-task-dependency-system.md
---

## Context

v1 Orbit 没有显式的任务依赖机制——任务之间是完全扁平的列表，除了通过 Markdown wikilink 互相引用之外，系统不知道"Task-B 要等 Task-A 完成"。

v2 的 Auto-runner（ADR-001）要自动拾取 ready 的任务执行，如果没有依赖机制：

- Dispatcher 可能在 Task-A 还没完成时就把 Task-B 拾起来跑，而 Task-B 需要 Task-A 的产出
- Agent 会在运行中才发现依赖未满足，浪费预算

v2 对话中用户明确选了"方案 A"：

> "依赖模型的方案，用方案 A。"
>
> "Task editor / planner publish 时做检测，拒绝循环依赖。"
>
> "依赖任务被删除或归档 → Task-A 进入 blocked + Inbox 警示。"

另外关于任务之间的关系，需要区分：

> "衍生关系没有问题，看板内的任务都是独立的，但能看出衍生关系就够了。"

**衍生关系**（derived_from）和**依赖关系**（depends_on）是两个不同的概念，不应合并。

## Decision

### 1. 方案 A：独立 depends_on 字段，不改状态机

任务状态机保持 v1 的 `inbox → today → doing → blocked → done`，**不增加 "waiting" 状态**。依赖关系通过独立字段表达：

```yaml
type: task
status: todo
depends_on: [<task_uid_A>, <task_uid_B>]    # v2 新增
derived_from: <task_uid_parent>              # v2 新增（衍生关系）
```

### 2. Dispatcher 按拓扑计算 ready 集合

```typescript
// 伪代码
function isReady(task: Task): boolean {
  if (task.status !== 'todo') return false
  if (task.approved_by == null && task.created_by.startsWith('agent_run:')) return false
  for (const dep_uid of task.depends_on ?? []) {
    const dep = getTask(dep_uid)
    if (dep == null) return false                    // 依赖被删 → 不 ready
    if (dep.status !== 'done') return false          // 依赖未完成
  }
  return true
}
```

### 3. 边界策略

| 场景 | 处理 |
|------|------|
| **循环依赖** | Task editor / Planner publish 时静态检测，拒绝保存 |
| **依赖任务被删除** | 当前任务自动 `blocked` + 生成 C 类 Inbox 警示 |
| **依赖任务被归档** | 同上处理 |
| **依赖任务长时间卡住** | 生成 C 类 Inbox 警示（C1）：Task-A 因依赖 Task-B 卡住，Task-B 已 blocked 24h |
| **跨项目依赖** | v1 不支持，只允许 task-to-task 同项目内依赖 |

### 4. 衍生关系（derived_from）

- 描述"任务怎么来的"，典型场景：agent 提议拆分出新任务时，`derived_from = <原任务 uid>`
- 不影响 Dispatcher 调度逻辑
- 用于 UI 的"衍生树"展示 + 事后回溯

### 5. Planner publish 时物化依赖

Planner 产出的 proposal canvas 里节点间的箭头 → publish 时物化到对应 task 的 `depends_on` 字段中。

## Rationale

**为什么不改状态机**（方案 A vs "加 waiting 状态"）：

- v1 状态机已经稳定使用，加新状态会影响 Kanban UI、所有涉及状态的 IPC、所有现有 task 的兼容性
- **依赖是调度层逻辑**，不是状态本身——让调度器计算"当前 ready 的集合"比让状态机表达所有组合要干净
- Kanban 仍然按 v1 的列展示，"ready but not taken" 依然是 todo 列，Dispatcher 从中挑选，UI 不用改

**为什么区分依赖 vs 衍生**：

- **依赖**是执行顺序约束（影响调度）
- **衍生**是来源血缘（影响审计和 UI 展示）
- 这两者语义完全不同，合并会让字段语义模糊

**为什么不支持跨项目依赖（v1）**：

- 跨项目意味着 UID 要全局唯一、Dispatcher 要观察所有项目——复杂度和收益不成比例
- 用户场景里跨项目依赖罕见（如果真有，可以通过文档链接表达，Dispatcher 不感知）
- 留 open-question 给未来

**循环依赖在 editor/publish 时拒绝而不是运行时**：

- 运行时拒绝会让用户看到 "保存成功但 agent 卡住" 的迷惑行为
- 静态检测直接拦在入口，用户立刻知道问题

## Consequences

**正面**：
- Auto-runner 可以安全地按拓扑顺序执行
- Planner 产出的依赖结构可以自动落地到调度逻辑
- 衍生关系的保留让 agent 提议链可回溯

**负面 / 待处理**：
- Task schema 加字段需要迁移（见 `plans/2026-04-26-task-dependency-system.md`）
- 需要循环检测算法（DFS / 拓扑排序）
- 依赖任务被删/归档的级联处理需要原子性
- UI 需要展示依赖关系（Kanban 的 task card 上加依赖状态提示；Task Editor 里管理 depends_on）

### 本期不做

- 跨项目依赖
- "soft dependency"（建议顺序但不强制）
- "partial dependency"（Task-B 只需要 Task-A 的一部分产出）

## Implementation

见 [`plans/2026-04-26-task-dependency-system.md`](../plans/2026-04-26-task-dependency-system.md)。
