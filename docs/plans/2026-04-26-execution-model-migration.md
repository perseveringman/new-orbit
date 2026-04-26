---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-001, ADR-002, ADR-003, ADR-006, ADR-007
---

# Orbit v2 执行模型迁移 — 总览

> 本文是 v2 执行层改造的**总纲**。它串联起各个独立 plan，定义实施顺序和依赖关系，帮助实施者理解"先做什么、然后做什么"。

---

## 目标

完成 Orbit 从 v1（Night Shift + Worktree-only + Direct create_task + 无依赖）到 v2（Auto-runner + ExecutionContext 抽象 + propose-approve + depends_on）的执行层改造。

---

## 涉及的 ADR

| ADR | 子主题 |
|-----|--------|
| ADR-001 | 废弃 Night Shift，转向 24×7 Auto-runner |
| ADR-002 | Agent 自主边界：子任务折叠进主任务 |
| ADR-003 | ExecutionContext 分化：Worktree + Sandbox 双轨 |
| ADR-006 | 任务授权模型：propose-approve 两阶段 |
| ADR-007 | 任务依赖模型：depends_on + 拓扑解锁 |

这些决策**互相耦合**（Auto-runner 需要依赖调度、依赖调度需要授权过的任务、新任务需要 propose-approve），所以必须放在同一期实施。

---

## 实施顺序

推荐的实施顺序（每一阶段都应保持可编译可运行）：

### 阶段 0：铺设基础（无破坏性）

1. **ExecutionContext 接口抽象** — 见 [execution-model-migration 子项 A](#阶段-a-executioncontext-抽象)
   - 抽出 `ExecutionContext` interface
   - `WorktreeExecutionContext` 作为第一个实现，适配现有 worktree 代码
   - 在 `AGENT.md` 支持 `execution_context: worktree` 字段（默认）
   - 这一步不改变现有行为，只是把代码组织好

2. **Activity Log 基础设施** — 见 [`activity-log-infrastructure.md`](./2026-04-26-activity-log-infrastructure.md)
   - Schema / emitter / 存储
   - 必须先于其他改造完成，因为后续改造都会 emit 事件

3. **CLI 脚手架** — 见 [`cli-migration.md`](./2026-04-26-cli-migration.md)
   - `orbit` CLI 入口 + IPC bridge
   - 实现最基础的几个命令（`search` / `cat` / `task list`）
   - 一样不改变现有行为（MCP 先保留）

### 阶段 1：授权链路

4. **Task schema 扩展** — 见 [auto-runner-dispatcher 子项 A](./2026-04-26-auto-runner-dispatcher.md#阶段-a-task-schema-扩展)
   - `created_by` / `approved_by` / `proposed_by_agent_run` 等字段
   - 迁移脚本回填现有 task 数据
   - Task Editor UI 可选展示（非核心）

5. **Proposal 系统** — 见 [auto-runner-dispatcher 子项 B](./2026-04-26-auto-runner-dispatcher.md#阶段-b-proposal-系统)
   - `src/main/approval/` 模块：proposal store / state machine / sync
   - Chat 审批卡片组件（通用 chat 基建）
   - Inbox 事件生成（依赖 Inbox v2）

### 阶段 2：Inbox v2

6. **Inbox v2 架构** — 见 [`inbox-v2-architecture.md`](./2026-04-26-inbox-v2-architecture.md)
   - 事件 store + 事件流
   - Capture / Messages / Archive / Feed History 目录结构
   - 左列表 + 右通用内容舞台 UI
   - chat ↔ Inbox 双通道同步

（**至此** approve/reject 通道建立起来，后续可以真正开始改 agent 行为）

### 阶段 3：任务依赖

7. **依赖系统** — 见 [`task-dependency-system.md`](./2026-04-26-task-dependency-system.md)
   - `depends_on` / `derived_from` 字段 + 迁移
   - 循环检测（editor / planner publish）
   - Dispatcher 的 ready 集合计算
   - 级联处理（依赖被删/归档 → blocked + Inbox）

### 阶段 4：Auto-runner Dispatcher

8. **Auto-runner 替代 Night Shift** — 见 [auto-runner-dispatcher 子项 C](./2026-04-26-auto-runner-dispatcher.md#阶段-c-auto-runner-dispatcher)
   - `src/main/auto_runner/` 模块
   - Dispatcher 主循环：观察看板 → 计算 ready → 分配 agent → 启动 run
   - 废弃 `src/main/night_shift/`
   - UI 中 "🌙 Night Shift" 入口替换

### 阶段 5：Capture + CLI 全量

9. **Capture 基础** — 见 [`capture-foundation.md`](./2026-04-26-capture-foundation.md)
   - Feed (RSS) / Library / Thoughts 三个子系统
   - Feed History 归档

10. **Quick Capture MVP** — 见 [`quick-capture-mvp.md`](./2026-04-26-quick-capture-mvp.md)
    - 全局快捷键 + 浮层 + Thought 入库

11. **CLI 全量命令覆盖** — 见 [cli-migration.md](./2026-04-26-cli-migration.md) 阶段 B/C/D
    - Inbox / Capture / Activity 相关命令
    - MCP 废弃（`src/mcp/` 标记 deprecated）

### 阶段 6：清理与观察

12. **v1 遗留代码清理**
    - 删除 `src/main/night_shift/`（保留在 git history）
    - 停用 `src/mcp/` 启动流程
    - 项目 `.mcp.json` 不再自动写入

13. **观察期启动**
    - 监控 agent CLI 调用成功率
    - 监控 Inbox 审批处理时长
    - 监控 Auto-runner 并发情况

---

## 兼容性策略

### 向后兼容

- 既有 vault 打开 → 迁移脚本自动补全 task schema
- 既有 worktree → 无损迁移到 `WorktreeExecutionContext`（语义不变）
- 既有 Inbox Archive 数据（v1 有没有 inbox？若无则从空开始）

### 向前兼容

- `execution_context: sandbox` 的项目在本期不支持运行 agent（因为 Sandbox 实现延后），UI 显示提示"Sandbox 运行暂未实现"
- 明确在 `open-questions.md` 中登记 Sandbox 实施时机

---

## 风险与回滚

### 风险

1. **Auto-runner 和 Dispatcher 的调度正确性** — 可能因为依赖计算错误导致 task 永不执行或错误并发
   - 缓解：大量单测 + 灰度开启（可在 Settings 关掉 Auto-runner，回到手动触发模式）

2. **Proposal 系统在 chat 和 Inbox 之间的状态同步复杂**
   - 缓解：proposal 是单一 store，chat 和 Inbox 都订阅同一事件流；状态以 store 为准

3. **CLI 的 agent 使用准确度**
   - 缓解：上线后观察，有数据支撑决定是否回补 MCP（见 ADR-008）

### 回滚策略

本次改造是**大范围**的，完整回滚不现实。按模块分级：

- **Auto-runner 可关**：Settings 里给 "Auto-runner enabled" 开关，关掉后任务仍是 manual 触发
- **Proposal 系统可降级**：出问题时紧急 PR 让 agent 的 propose 直接等价于 create（临时恢复 v1 行为）
- **ExecutionContext 抽象不可回滚**（代码重构，不影响行为）
- **CLI 不可回滚**，但 MCP 代码在 git history 中，最坏情况下可以 cherry-pick 回来

---

## 验收标准（本期完成的定义）

- [x] `orbit` CLI 覆盖所有 v1 MCP 工具的能力（mapping 见 ADR-008）
- [x] `src/main/night_shift/` 已删除，Auto-runner 运行路径已接入观察期
- [x] 新建一个 agent 提议任务的场景能走完 propose → Inbox/chat → approve → 入库的闭环
- [x] 创建一个依赖链 A → B → C，B 依赖 A，C 依赖 B，Dispatcher 严格按顺序执行
- [x] Inbox 左列表 + 右舞台能正常工作（至少覆盖 A1/A2/B1 三种事件）
- [x] Quick Capture (`⌘⇧I`) 能创建 Thought 入 Inbox
- [x] Activity Log 记录：task 创建/修改、proposal 提议/审批、feed 订阅变更、library 保存
- [x] 现有 v1 vault 迁移后功能正常

---

## 后续迭代

本期完成后，下一期建议的优先级：

1. **Sandbox ExecutionContext 详细实现**（ADR-003 的下半部分）
2. **Inbox Capture 扩展**：Library Quick Capture、手机 share、浏览器插件
3. **Review 页面 UI**（基于已有 Activity Log）
4. **Feed 多来源**：GitHub Trending / HN / Substack
5. **MCP 观察结果评估**：是否回补、以什么形式回补
