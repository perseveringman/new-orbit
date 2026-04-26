---
id: ADR-011
title: Runtime 抽象贯通 — 通用 Agent Event 协议
status: accepted
date: 2026-04-27
related: ADR-008
implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
---

# ADR-011: Runtime 抽象贯通 — 通用 Agent Event 协议

## Context

v2 的 ADR-008 确立了 CLI-first 原则——Orbit 对外暴露给 agent 的接口是 `orbit` CLI。但 ADR-008 **没讲** Orbit **对内调用** agent 的接口。

v2 实施后，`LocalRuntimeManager` 已有 `RuntimeDescriptor` + `capabilities` 模型，支持 claude/codex/gemini/opencode 四种 runtime 的发现和注册。每个 runtime 声明了 `supportsResume`、`supportsHooks`、`supportsBackgroundRuns`、`maxConcurrent` 等能力。

但下游模块（runner / dispatch / conversation / UI）**没有基于这个抽象编程**，硬编码了 Claude 的行为：
- `runner.ts` 直接解析 Claude 的 stream-json 格式
- `dispatch.ts` 使用 Claude 特定的命令行参数
- `conversation.ts` 的 `summarizeEvents` 只提取文本，丢弃了 tool_use/tool_result/thinking 事件
- UI 渲染层只认识"对话消息"，不认识执行事件

这导致：
1. 接入 Codex / Copilot 需要在每个下游模块加分支判断
2. agent 执行对用户是黑盒——看不到工具调用、思考过程
3. 不同 runtime 的行为差异无法在统一接口上处理

## Decision

**把现有 `RuntimeDescriptor` + `capabilities` 贯通到执行链路每一层**，而非新建抽象层：

1. 定义**通用 Agent Event 协议**——统一事件类型（thinking / tool_use / tool_result / message / cost / done / error / heartbeat）
2. 每个 runtime 提供 **RuntimeAdapter**，负责把 vendor 原生事件翻译成通用协议
3. 前端（renderer + Activity tab）只认通用协议，不知道底下是哪个 vendor
4. Resume / Stream / Fallback 都在通用接口上定义
5. 每个 RuntimeAdapter 声明自己的可重试和不可重试错误列表

## Rationale

**为什么是"贯通现有抽象"而不是"新建一层"**：

- `LocalRuntimeManager` 已有完整的发现-注册-元数据模型，新建一层会产生两套平行的 runtime 概念
- 需要改的是"让下游模块读 capabilities 而不是硬编码"，这是贯通而非新增
- 代码量预计比新建少一半

**为什么 event 协议要在 Orbit 层定义而不是直接转发 vendor 原生格式**：

- 不同 vendor 的事件格式完全不同（Claude stream-json / Codex SSE / Copilot WebSocket）
- 前端如果要处理所有格式，复杂度爆炸
- 统一协议还能加 `trace_id` / `span_id`，为全链路事件回放打基础（见 ADR-013）

**通用事件类型的选择**：

| 事件类型 | 语义 | Claude 映射 | Codex 映射 |
|---------|------|------------|------------|
| thinking | 内部推理 | thinking block | N/A（Codex 不暴露 thinking） |
| tool_use | 调用工具 | tool_use event | function_call |
| tool_result | 工具返回 | tool_result event | function_result |
| message | 文本输出 | text delta | text delta |
| cost | 费用 | cost event | billing callback |
| done | 完成 | result event (exit 0) | stream end |
| error | 错误 | error event / exit ≠ 0 | error event |
| heartbeat | 心跳 | 周期性注入 | 周期性注入 |

heartbeat 由 Orbit adapter 层注入（vendor 不一定提供），用于卡死检测。

## Consequences

**正面**：
- 前端代码可以只写一遍，覆盖所有 runtime
- agent 执行从黑盒变成可观察的事件流
- 为 ADR-012（resume）、ADR-013（事件回放）、ADR-014（fallback）提供统一基础
- 新 runtime 接入只需写一个 adapter

**负面/trade-off**：
- 不同 vendor 的事件粒度不同——Codex 不暴露 thinking，通用协议中这个字段为空
- adapter 翻译层可能丢失 vendor 特有信息——raw 事件录像可以弥补
- 通用协议设计需要前瞻性，改动成本较高——但 v2 的实践表明 schema 扩展 + 兼容性处理是可行的

**回退计划**：
如果通用协议无法覆盖某个 vendor 的关键特性，允许在 AgentEvent 中加 `vendor_specific: Record<string, unknown>` 透传字段，前端在需要时降级到 vendor 特定渲染。

## Implementation

- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
- 子 plan：`plans/2026-04-27-runtime-adapter-layer.md`（待写）
