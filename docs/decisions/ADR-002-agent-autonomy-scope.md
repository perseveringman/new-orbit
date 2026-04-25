---
id: ADR-002
title: Agent 自主边界 — 子任务折叠进主任务
status: accepted
date: 2026-04-26
related: ADR-001, ADR-006
implementation: plans/2026-04-26-auto-runner-dispatcher.md
---

## Context

v1 中 agent 通过 MCP `create_task` 工具随时可以创建新任务入看板。这导致两个问题：

1. **看板变成工作日志**：agent 每拆一个子步骤就创建一个 task，看板上出现大量"内部步骤"性质的 task，和用户真正想跟踪的"要做的事"混杂
2. **授权链路不清**：agent 创建的 task 和用户手动创建的 task 长得一样，事后无法判断哪些是 agent 擅自加的

v2 对话中用户明确了看板的**语义定位**：

> "看板 = 用户的认知地图，不是工作日志"
>
> "Agent 开子任务，这个我有新的想法，如果他要开很多子任务的话，实际上不如就在这个主 Agent 里面全部完成，子任务只作为这个主任务的 Markdown 文档里面的执行记录，不需要单独的开一个新的任务 markdown 文件。"

## Decision

**Agent 自主拆出来的子步骤，折叠进主任务的 Execution Log，不创建新的 task `.md` 文件入看板。**

具体边界：

1. **折叠进 Execution Log 的情况**（绝大多数）：
   - 纯粹为完成主任务的内部步骤（写代码、跑测试、调试、查文档）
   - 没有独立用户价值的子任务
   - 用户不需要在看板上跟踪的执行细节

2. **Agent 主动提议新 task 的情况**（少数）：
   - 发现的问题**有独立价值**（比如"这个代码里的一处 bug 应该单独修"）
   - 需要用户在看板上**独立跟踪**的事项
   - 超出主任务范围、需要用户决定是否做的方向
   - 此时走 `propose_new_task` 两阶段审批（见 ADR-006），而不是直接入库

3. **Agent 必须 escalate 的情况**（需要人介入）：
   - 需要超出当前任务 scope 才能完成主任务 → 发 A4 扩范围审批事件
   - 缺关键信息 → 发 B1 信息求助事件
   - 多个方案无法自行选择 → 发 B2 方案选择事件

## Rationale

**为什么折叠到 Execution Log 优于 "创建子 task"**：

- **看板保持清爽**：用户的注意力不被 agent 的内部步骤污染
- **Execution Log 天然适合流水式步骤记录**：Markdown 的 `## Execution Log` 章节可以按时间顺序追加，既可人读又可 AI 读
- **审计仍然完整**：所有 agent 动作都记录在 Execution Log + Activity Log（见 ADR-009），没有信息丢失
- **减少 UI 噪音**：每个子 task 都会产生文件事件、索引更新、任务列表刷新——累计下来非常嘈杂

**为什么保留 "propose_new_task" 少数场景**：

- 有些发现真的不应该塞进当前任务（比如"发现 auth 模块有个独立 bug"）
- 这些发现对用户的**项目节奏**有影响，应该进认知地图
- 但必须经人审（不是 agent 擅自入库），保证看板的可控性

## Consequences

**正面**：
- 看板语义清晰：只有"用户选择跟踪的事"才在看板上
- 授权链路简单：看板上所有 task 都是"用户授权过的"（手动 or 批准 propose）
- Execution Log 成为 agent 工作流的完整时间线，适合事后回顾

**负面 / 待处理**：
- Agent 需要**更精确的判断**"这是折叠还是独立提议"——需要通过系统提示词引导 + 少数情况下由用户反向修正（在 Inbox 审批中）
- Execution Log 可能变得很长——需要 UI 支持折叠/展开/搜索（属于 Task Editor 迭代）
- `create_task` 工具语义变化，所有调用点需要迁移到 `propose_new_task`

## Implementation

- 调整 agent 的 system prompt，明确两类边界
- `create_task` → 改为 `propose_new_task`（见 ADR-008 的 CLI 接口）
- Task frontmatter 加授权链路字段（见 ADR-006）
- Execution Log 的渲染/编辑在本 plan 中不动，沿用 v1

见 [`plans/2026-04-26-auto-runner-dispatcher.md`](../plans/2026-04-26-auto-runner-dispatcher.md)。
