---
id: ADR-013
title: 统一事件回放基础设施
status: accepted
date: 2026-04-27
related: ADR-009, ADR-011
implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
---

# ADR-013: 统一事件回放基础设施

## Context

Orbit 当前有三套独立的事件系统：

1. **Activity Log**（`.orbit/activity/*.ndjson`，ADR-009）—— 业务事件（task lifecycle / project lifecycle / inbox / capture / agent run）
2. **Agent Events**（runner ring buffer）—— agent 执行事件（stream-json 解析产物）
3. **Inbox Events** —— Inbox 消息事件

三者格式各异、存储独立、无法跨层关联。当一个问题发生时（比如用户点了审批按钮但 agent 没收到通知）：
- Activity Log 只记录"用户批准了 proposal X"
- Agent Events 只记录"agent 开始了 run Y"
- Inbox Events 只记录"消息 Z 从 pending 变成 resolved"
- **没有办法看到 X → Y → Z 这条因果链**

这对于一个功能越来越多、链路越来越长的应用来说是致命的调试障碍。尤其是 Phase 3 要加入 Runtime adapter、fallback、双向 stream 等新链路，不建立统一的事件追踪，调试成本会指数增长。

## Decision

**建立全链路统一事件回放基础设施**：

1. **统一事件 Schema**：所有事件源写入同一 NDJSON 格式，每条事件包含 `trace_id` / `span_id` / `parent_span_id` 用于跨层关联
2. **三层事件录像**：agent 执行链路记录三份平行 NDJSON（raw-vendor / abstract / ui-render），精确定位问题层
3. **统一事件总线**：Activity Log / Agent Events / Inbox Events / IPC Events 全部接入同一条总线
4. **Developer Console**：新增全局页面，展示完整事件流时间轴，支持按 trace_id / 事件类型 / 来源过滤，支持 Playback mode 回放历史
5. **Golden Files 回归基线**：常见场景的"好状态"事件快照，每次代码变更前自动比对

Phase 3 做完整版，不做最小版。理由：AI 实施可以处理这个量级的工作，且统一基础设施越早建立，后续所有功能（Phase 4 的 Sandbox / Thinking Trail / 对话沉淀等）都能受益。

## Rationale

**为什么不只做 agent 子链路、要做全链路**：

- 很多 bug 跨越多个子系统（用户操作 → IPC → main 处理 → agent 启动 → 文件变更 → Activity Log → Inbox）
- 子链路事件回放只能排查 agent 内部问题，**跨子系统的因果链是更常见的排查场景**
- 统一 schema + trace_id 是一次性工程，后续接新事件源的边际成本很低

**为什么三层录像**：

出问题时的排查路径：
- raw 缺 tool_use → vendor 根本没发（不是 Orbit 的 bug）
- raw 有但 abstract 没有 → adapter 翻译丢了
- abstract 有但 ui 没有 → 渲染链路问题

三层录像把"问题在哪一层"的定位从"猜"变成"看"。

**为什么 Developer Console 而不是命令行工具**：

- 时间轴可视化对人类更直观
- 事件流量大时命令行不可读
- Playback mode 需要 UI 交互
- 但**同时提供 CLI 入口**（`orbit dev:events` 命令），让 agent 也能查

## Consequences

**正面**：
- 任何链路的 bug 都可以通过 trace_id 一路追到底
- 新功能接入只需 emit 事件到统一总线，自动获得回放和调试能力
- Golden Files 让回归测试从"跑测试看 pass/fail"变成"比对事件序列看行为差异"
- Developer Console 成为 Orbit 的"X-Ray"——开发者（包括 AI 开发者）的第一排查入口

**负面/trade-off**：
- 全链路事件量很大，需要考虑存储和性能（建议 NDJSON 按天轮转 + 可配置保留天数）
- trace_id 注入需要改动多处代码（IPC 层、event emitter、store 层）
- Developer Console 是新页面，有 UI 开发工作量

**回退计划**：
如果事件量影响性能，可以加采样率控制（production mode 只录 10%，debug mode 全录）。Developer Console 可以先不做 Playback mode，只做实时流 + 过滤。

## Implementation

- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
- 子 plan：`plans/2026-04-27-event-replay-infrastructure.md`（待写）
