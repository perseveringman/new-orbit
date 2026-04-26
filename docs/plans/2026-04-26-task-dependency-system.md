---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-007
---

# Task Dependency System — depends_on + 拓扑解锁

> 轻量任务依赖机制。不改状态机，通过独立字段和 Dispatcher 的拓扑计算实现。

---

## Scope

- Task schema 加 `depends_on` / `derived_from` 字段
- 循环依赖检测（Task Editor + Planner publish）
- Dispatcher 的 ready 集合计算
- 依赖被删/归档的级联处理
- UI 展示依赖关系

---

## Feature 描述

### 用户视角

**看板上的任务卡片**：

```
┌──────────────────────┐
│ Task-C 实施付款流程    │
│ 🔒 等待 Task-B         │← 依赖未满足时显示锁图标
│ @dev • priority: high │
└──────────────────────┘
```

**Task Editor 新增 "Dependencies" 章节**：

```
## Dependencies
- [x] 01_Projects/orbit/tasks/task-A-auth-setup.md (done)
- [ ] 01_Projects/orbit/tasks/task-B-database-schema.md (doing)
```

（UI 是 multi-select 选择器，内部存 UID 数组到 frontmatter）

**衍生关系不在前台展示**（只在 Activity Log / 衍生树视图里看）。

### 依赖满足后的行为

Dispatcher 每 5s 重新计算 ready 集合。当 Task-B 变为 `done` 的瞬间：

1. 依赖 Task-B 的 Task-C 自动变成 ready
2. Auto-runner 的下一个 tick 会把 Task-C 纳入候选
3. 如果并发有余位，Task-C 被拾取执行
4. Activity Log: `task.dependency_satisfied`（可选事件）

---

## 数据模型

### Frontmatter 字段

```yaml
type: task
status: todo
title: ...

# v2 新增
depends_on: [<task_uid_A>, <task_uid_B>] | []
derived_from: <parent_task_uid> | null
```

### Zod schema

```typescript
// src/shared/schemas/task.ts
export const taskSchema = z.object({
  // ...v1 fields...
  depends_on: z.array(z.string()).default([]),
  derived_from: z.string().nullable().default(null),
})
```

### 迁移

v1 task 默认 `depends_on: []` / `derived_from: null`。迁移脚本可选（schema 有 default，读取时自动填充）。

---

## 循环依赖检测

### 算法

DFS + 三色标记法（WHITE/GRAY/BLACK）检测环。

```typescript
function hasCycle(
  targetTaskUid: string,
  proposedDeps: string[],
  allTasks: Map<string, Task>
): boolean {
  // Temporary add proposed deps to target
  const graph = buildGraph(allTasks)
  graph.set(targetTaskUid, proposedDeps)

  const color = new Map<string, 'W' | 'G' | 'B'>()
  function dfs(u: string): boolean {
    color.set(u, 'G')
    for (const v of graph.get(u) ?? []) {
      const c = color.get(v) ?? 'W'
      if (c === 'G') return true   // 发现 back edge → cycle
      if (c === 'W' && dfs(v)) return true
    }
    color.set(u, 'B')
    return false
  }

  return dfs(targetTaskUid)
}
```

### 检测时机

1. **Task Editor 保存时**：编辑 `depends_on` 字段 → 保存前检测 → 有环拒绝并提示
2. **Planner publish 时**：canvas 上的箭头物化到 depends_on 前做全图检测 → 有环拒绝 publish
3. **CLI `orbit task update` 时**：同 Editor 保存逻辑
4. **运行时不做循环检测**（数据已经在 editor/publish 层被拦截）

---

## Dispatcher 的 ready 计算

```typescript
// src/main/auto_runner/ready_set.ts

export function isReady(
  task: Task,
  taskIndex: Map<string, Task>
): { ready: boolean; reason?: string } {
  if (task.status !== 'todo') {
    return { ready: false, reason: 'status not todo' }
  }

  if (
    task.created_by?.startsWith('agent_run:') &&
    task.approved_by == null
  ) {
    return { ready: false, reason: 'awaiting approval' }
  }

  for (const depUid of task.depends_on ?? []) {
    const dep = taskIndex.get(depUid)
    if (dep == null) {
      return { ready: false, reason: `dependency missing: ${depUid}` }
    }
    if (dep.status !== 'done') {
      return { ready: false, reason: `dependency not done: ${depUid}` }
    }
  }

  return { ready: true }
}
```

Dispatcher 在每个 tick 上遍历所有 `status=todo` 任务，调用 `isReady`，组成本次可执行集合。

---

## 级联处理

### 依赖任务被删除

当用户删除 Task-B：

1. Task store 广播 `task.deleted` 事件
2. 监听器扫描所有 `depends_on` 中含 B 的 task
3. 每个受影响的 task：
   - 如果当前 `status == doing`：不中断（已在执行中），记录 Activity Log 警告
   - 如果 `status in (todo, inbox, today, blocked)`：
     - 保留 `depends_on` 中的 B（作为"历史记录依赖关系"）
     - 生成 C 类 Inbox 事件：`C1: "Task-X 依赖的 Task-B 被删除，是否移除该依赖？"`
     - 用户在 Inbox 里可以"Remove dependency"或"Keep and accept blocked"

### 依赖任务被归档

同上，但事件文案改为"被归档"而不是"被删除"。归档的 task 通常还可访问（只是换目录），所以 ready 检查中 `dep == null` 的判断要按 **"没法在活跃项目中找到"** 而非"文件不存在"。

### 依赖任务长时间卡住

Dispatcher 额外监控：如果一个 task 是 `blocked` 状态超过 24h，且有其他 task 依赖它：

- 生成 C 类 Inbox 事件：`C1: "Task-A 依赖的 Task-B 已 blocked 24h+"`
- 每个依赖链只报一次（通过事件去重）

---

## UI

### Kanban 任务卡

```tsx
<TaskCard task={task}>
  {hasUnmetDeps(task) && (
    <Tooltip content={unmetDepsText(task)}>
      <LockIcon />
    </Tooltip>
  )}
  {hasUnmetDeps(task) && <WaitingBadge />}
</TaskCard>
```

### Task Editor

新增 "Dependencies" 可折叠区：

```tsx
<Section title="Dependencies">
  <TaskMultiSelect
    value={task.depends_on}
    onChange={newDeps => {
      const cycle = detectCycle(task.uid, newDeps, allTasks)
      if (cycle) {
        toast.error(`Cyclic dependency: ${cycle.join(' → ')}`)
        return
      }
      updateTask(task.uid, { depends_on: newDeps })
    }}
    excludeUids={[task.uid]}  // 不能依赖自己
  />
</Section>
```

### Planner publish

Planner canvas 上的箭头 → publish 时：

```typescript
function publishProposal(canvas: ProposalCanvas): Result {
  const nodes = canvas.nodes
  const edges = canvas.edges

  // 构建临时依赖图做循环检测
  const graph = new Map<string, string[]>()
  for (const node of nodes) {
    graph.set(
      node.taskUid,
      edges.filter(e => e.target === node.id).map(e => nodeToUid(e.source))
    )
  }
  if (hasAnyCycle(graph)) {
    return { ok: false, error: 'Cyclic dependencies' }
  }

  // 物化 depends_on
  for (const node of nodes) {
    const depUids = edges
      .filter(e => e.target === node.id)
      .map(e => nodeToUid(e.source))
    updateTask(node.taskUid, { depends_on: depUids })
  }

  return { ok: true }
}
```

---

## CLI

```bash
# 查看 task 的依赖状态
orbit task get <uid> --json
# → returns { depends_on: [...], ready: bool, unmet_deps: [...] }

# 更新依赖
orbit task update <uid> --depends-on uid1,uid2

# 列出所有 blocked（含依赖未满足）的 task
orbit task list --filter blocked

# 查看依赖图（文本）
orbit task deps <uid>
# → tree view showing A ← B ← C
```

---

## 测试

- `tests/task_dependency_cycle.test.ts` — 循环检测
- `tests/ready_set.test.ts` — ready 计算（各种边界）
- `tests/dependency_cascade.test.ts` — 删除/归档级联
- `tests/planner_publish_dependency.test.ts` — canvas 物化到 depends_on

---

## 风险与权衡

### 性能

大 vault（>500 task）的 ready 计算每 5s 全量扫描可能慢。

**缓解**：
- 增量：task.updated 事件触发局部重算
- 建立"反向索引"：`reverseDeps: Map<dep_uid, Set<task_uid>>`
- 当 dep 变 done 时，只重算反向索引中的 task

### 数据一致性

`depends_on` 中的 uid 指向被删的 task → 悬挂引用。

**缓解**：
- 删除 task 时主动扫描 `depends_on` 反向引用，触发级联处理
- ready 计算时处理 dep missing 的 case（已在 isReady 里）

### 用户心智

"为什么我的 Task-C 不跑"——用户可能看不到依赖关系。

**缓解**：
- Kanban 卡上显示锁图标 + tooltip
- Task Editor 顶部显示"本任务被 N 个依赖阻塞"
- CLI `orbit task deps <uid>` 可查看完整依赖链

---

## 验收

- [ ] 创建 A → B → C 依赖链，Auto-runner 严格按顺序执行
- [ ] 尝试设置 A depends on C（已经 C depends on A）被拒绝，错误提示清晰
- [ ] 删除依赖任务后，受影响 task 自动变 blocked + Inbox 出现 C 类警示
- [ ] Planner canvas 画一个环被 publish 拒绝
- [ ] Task Editor 中的 Dependencies 区能正常编辑
- [ ] Kanban 卡上依赖状态展示清晰
