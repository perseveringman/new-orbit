---
id: ADR-001
title: 废弃 Night Shift，转向 24×7 Auto-runner
status: accepted
date: 2026-04-26
related: ADR-002, ADR-003, ADR-006
implementation: plans/2026-04-26-auto-runner-dispatcher.md
---

## Context

Orbit v1 的 Night Shift 是一个批量调度器：用户晚上选一批任务、设置并发和自动 PR，然后睡觉，每个任务在独立 worktree 执行，早上看结果。

在 v2 方向回顾对话中（2026-04-26），用户指出：

> "我认为一开始我的设想是一个个人的工作台，但后面实施的时候有一点偏差的是我对 Agent 没有那么的了解，导致我做了一个 night shift 的功能，实际上不需要这么一个功能，需要的是自动执行的 Agent。"

Night Shift 背后的隐含假设是"**agent 只在夜间批量跑**"——这是对 agent 角色的误解。真实的 agent 应该是：

- 随时可以执行（碎片时间 / 上班时间 / 夜间都一样）
- 主动拾取看板中 ready 的任务（而不是用户手动一批一批丢给它）
- 有问题随时反馈（而不是等一整夜后早上发现都失败了）
- 产出随时审批（通过 Inbox 累积）

Night Shift 的"批量 + 夜间"这两个标签都是不必要的约束。

## Decision

**完全废弃 Night Shift**，以 **24×7 Auto-runner Dispatcher** 替代：

1. Dispatcher 持续运行，观察看板状态
2. 当任务满足执行条件（status=todo + 依赖满足 + 人已授权），自动选择一个 agent 拾取执行
3. 不再有"夜间批量"概念，任务执行不受时间约束
4. 用户可以在 Inbox 里随时处理 agent 的中间求助与最终合并审批

## Rationale

**为什么 Auto-runner 优于 Night Shift**：

- **心智负担更轻**：用户不用"攒一批任务等夜里跑"，想到什么提议/批准就可以马上进入执行队列
- **反馈更及时**：agent 遇到问题几分钟内就能通过 Inbox 找到用户，而不是攒一夜到早上
- **更符合 agent 的能力本质**：agent 不累不困，没必要限定时段
- **避免 "早上一堆失败" 的体验**：v1 用户经常早上打开看到 N 个 failed 任务却不知道哪一步出了问题

**替代方案**：

- **保留 Night Shift 作为可选模式**——拒绝。同时维护两套执行模型会造成 UI 和心智分裂；且 Auto-runner 能覆盖 Night Shift 的所有使用场景。
- **用"队列 + 定时触发"替代"批量选择"**——这本质上就是 Auto-runner，不需要保留 Night Shift 的命名与概念。

## Consequences

**正面**：
- Agent 执行心智简化为"看板有 ready 的任务就去做"
- 用户可以在任何时刻开启/关闭 agent 工作（而不是绑定夜间）
- 任务失败反馈实时化，降低返工成本

**负面 / 待处理**：
- 需要更仔细的**预算和并发控制**，避免 agent 持续烧钱（复用现有 BudgetGate / BudgetWatch）
- 需要更可靠的**人审审批通道**（Inbox 是本次一起设计的基础，见 ADR-004）
- 需要处理"用户不想现在跑任何 agent"的暂停开关（Dispatcher 全局 pause）

**v1 代码处置**：
- `src/main/night_shift/` 废弃（保留在 git history）
- `tests/night_shift_dispatcher.test.ts` 标记 skipped，实现替换成 Auto-runner 后删除
- UI 中的 "🌙 Night Shift" 入口替换为 "Auto-runner 状态"指示

## Implementation

见 [`plans/2026-04-26-auto-runner-dispatcher.md`](../plans/2026-04-26-auto-runner-dispatcher.md)。
