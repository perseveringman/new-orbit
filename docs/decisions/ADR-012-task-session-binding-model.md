---
id: ADR-012
title: Task-Session 绑定模型
status: accepted
date: 2026-04-27
related: ADR-011, ADR-001
implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
---

# ADR-012: Task-Session 绑定模型

## Context

v2 的 Auto-runner 把 Night Shift 的"按时间分段的批量执行"替换成了"24×7 随时拾取"。但 agent 的实际执行仍然沿用 v1 的 **one-shot 模式**：

- `runner.ts` 的 `inputMode` 默认 `'one-shot'`
- agent 进程启动 → 吃一个 prompt → 跑完退出
- 新消息 = 杀老进程、启新进程
- `dispatch.ts` 没有调用任何 `--resume` 相关逻辑

这意味着：
1. agent 每次交互都失忆——上一轮对话的上下文全部丢失
2. 只能靠 Orbit 把历史 prompt 拼接起来重新喂进去，token 浪费严重
3. `conversation.ts` 已记录 `vendorSessionId` 但从未使用

同时，v2 代码中已有 `vendorSessionId` 字段和 stream-json 双向通道的前置条件，只是未贯通。

## Decision

**一个 task 对应一个长期 vendor session**：

1. Task 首次启动 agent 时，创建新 session，记录 `vendorSessionId`
2. 后续对话使用各 runtime 的**原生 resume 能力**：
   - Claude: `claude --resume <sessionId>`
   - Codex: 对应的 session resume 命令
   - Copilot: 对应的 session resume 命令
3. Resume 语义**抽象到 RuntimeAdapter 接口**中（见 ADR-011）：
   - 前端调用 `resume(taskId)`
   - adapter 翻译成各家的 resume 命令
4. 一个 task 只绑一个 session，除非用户显式 "reset"
5. 启用 **stream-json 双向通道**：
   - `output-format: stream-json`（agent → Orbit，流式事件）
   - `input-format: stream-json`（Orbit → agent，运行中追加消息）
   - 分阶段开：先做输出方向，调试稳定后再开输入方向

## Rationale

**为什么选原生 resume 而不是 Orbit 自管 context**：

| 维度 | 原生 resume | Orbit 自管 |
|------|-----------|------------|
| Token 消耗 | 低（vendor 内部管） | 高（每次重新拼 history） |
| 连续性 | 最好（vendor 完整保留） | 依赖压缩质量 |
| 跨 vendor | 不行（每家自己的 session） | 可以 |
| 实施复杂度 | 低（改 dispatch 加一个参数） | 高（要做 context 压缩） |

当前 Orbit 不需要跨 vendor 切 session（fallback 时开新 session 即可），所以原生 resume 是最优选择。

**为什么一个 task 一个 session 而不是每次消息一个 session**：

- 省 token：不用每次重新理解任务
- 连续性好：agent 记得上一轮讨论的决策
- 长任务上下文爆的问题由 vendor 内部处理（Claude 有自动压缩续跑能力）

**为什么要双向 stream**：

- 单向 stream 意味着用户追加消息需要杀进程重启——浪费已执行的上下文
- 双向 stream 允许"agent 跑的时候用户发补充消息"，体验从批处理变成协作
- 复杂度通过事件回放基础设施（ADR-013）来缓解调试难度

## Consequences

**正面**：
- agent 不再失忆，对话有真正的连续性
- Token 消耗大幅降低（不用每次重新拼 history）
- 用户可以在 agent 运行中追加信息
- `vendorSessionId` 字段终于被使用

**负面/trade-off**：
- Session 生命周期需要管理（task 删除时清理 session、session 文件存储位置）
- 不同 vendor 的 resume 行为可能不一致——通过 RuntimeAdapter 接口约束语义一致性
- 双向 stream 的调试确实更复杂——通过三层事件录像（ADR-013）缓解

**回退计划**：
如果某个 vendor 的 resume 实现不稳定，可以在该 vendor 的 adapter 中 fallback 到"one-shot + prompt 拼接"模式，不影响通用接口。

## Implementation

- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
- 子 plan：`plans/2026-04-27-task-session-binding.md`（待写）

## 2026-04-28 修订

Phase 4.0 在保留"一个 task 对应一个长期 vendor session"的基础上，补充跨 runtime 承接语义：

1. `RuntimeAdapter` 增加 `getSessionTranscript(sessionId): Promise<UnifiedAgentEvent[] | null>`，用于按需读取 vendor 本地 session 历史并翻译为统一事件。
2. Claude adapter 读取 `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`（通过本地 session 索引兜底定位），Codex / Copilot adapter 在当前阶段返回 `null`，由上层 fallback 到 Phase 3 unified event store / conversation segment 重组。
3. Switch Runtime 流程不迁移 vendor sessionId，而是：
   - 停止旧 run（若仍在运行）
   - 按 RunSegment 时间线读取所有 transcript
   - 用粗略 token 估算决定全文注入或 progress summary 注入
   - 用 continuation prompt 启动新 runtime，并创建新的 RunSegment 记录 `runtimeId`
4. 因此 ADR-012 的"一个 task 一个 vendor session"修订为"一个 task 在同一 runtime 内复用 vendor session；跨 runtime 时通过 transcript + continuation prompt 承接"。
