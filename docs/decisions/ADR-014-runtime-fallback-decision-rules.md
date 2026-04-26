---
id: ADR-014
title: Runtime Fallback 决策规则
status: accepted
date: 2026-04-27
related: ADR-011, ADR-001
implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
---

# ADR-014: Runtime Fallback 决策规则

## Context

v2 的 Auto-runner（ADR-001）让 agent 24×7 拾取任务执行。但当默认 runtime（Claude）出现问题时（API 限流、配额耗尽、服务不可用），整个执行管线就卡死了。

Orbit 已有多 runtime 支持（claude / codex / gemini / opencode），但没有**自动 fallback** 机制——runtime 失败时需要用户手动切换。这在"同时跑 20-30 个任务"的场景下是不可接受的。

同时，agent 执行还有两类风险需要防护：
1. **卡死**：进程还活着但不产生事件（网络断开、死锁、无限等待）
2. **费用失控**：无限循环的任务持续消耗 API 费用

## Decision

### Fallback 决策规则

**核心原则**：只要 agent 自己还在运行、没有停下来，Orbit 就不干预。Orbit 只在"agent 停下来了"或"卡死"的时刻做决策。

```
Agent 进程状态监听：
  ├── alive + emitting events         → 不切，让它继续
  ├── alive + 沉默 > staleTimeout     → kill + 切到下一个 runtime
  ├── exited (code 0)                 → 正常完成，不切
  ├── exited + retryable error        → 由 runtime 内部已处理，
  │                                     如果 runtime 自己放弃了 → 切
  └── exited + non-retryable error    → 切到下一个 runtime
```

### 不可重试错误列表

每个 RuntimeAdapter 通过 `getNonRetryableErrors()` 声明自己的不可重试错误。通用的不可重试错误包括：

- `rate_limit_exceeded` — API 限流（切换 vendor 有效）
- `quota_exceeded` — 配额用完（切换 vendor 有效）
- `authentication_failure` — API key 无效
- `model_not_available` — 模型不可用
- `billing_error` — 计费问题
- `invalid_api_key` — API key 格式错误

可重试错误（由 runtime 内部处理）：
- `network_timeout` — 网络超时
- `server_error` — 服务端 5xx
- `context_overflow` — 上下文溢出（runtime 自动压缩续跑）

### Fallback 优先级

默认优先级：Claude → Codex → Copilot → 全失败

全失败时：
- 停止该 task 执行
- emit Inbox B3 类事件（执行失败需要人判断）
- 记录详细错误到 Activity Log

### 卡死检测

- 默认 **15 分钟**无新事件视为卡死
- 可在 Settings 中配置：`autoRunner.staleTimeoutMinutes: 15`
- 卡死时 kill 进程 → 切到下一个 runtime
- 如果所有 runtime 都卡死 → 停止 + Inbox 告警

### Budget 限制

- 每个 task 默认限 **$20**
- 可在 Settings 中配置默认值：`autoRunner.defaultBudgetPerTask: 20`
- 可在 task frontmatter 中 override：`budget_limit: 50`
- Budget 检查在通用事件流中进行（AgentEvent kind=cost）
- 接近限额（80%）→ emit warning event（C2 类 Inbox 预算告警）
- 超限 → 停止 session + emit Inbox 告警

## Rationale

**为什么不做请求级别的重试**：

各 runtime（Claude / Codex / Copilot）内部都有完善的重试和错误恢复机制。Orbit 如果在外层重复重试，会导致：
- 重试风暴（两层重试叠加）
- 语义冲突（Orbit 不了解 runtime 内部的重试状态）
- 不必要的复杂度

Orbit 只做 **vendor 级别**的 fallback，不做请求级别的重试。

**为什么卡死超时设 15 分钟而不是 5 分钟**：

- Agent 执行大型任务时可能长时间在 thinking 阶段不产生外部事件
- Claude 的 thinking 可能持续 2-5 分钟
- 5 分钟太激进，可能误杀正在深度思考的 agent
- 15 分钟是保守值，基本不存在"正常执行但 15 分钟无事件"的场景
- 可配置，用户可根据经验调整

**为什么 budget 是 per-task 而不是 per-day**：

- Per-day 的粒度太粗——一个失控的 task 会吃掉整天的额度，影响其他 task
- Per-task 可以精确控制单个任务的风险
- 用户的核心担心是"无限循环"，per-task 直接解决这个问题
- $20 默认值足够覆盖绝大多数单个任务（包括大型重构任务）

## Consequences

**正面**：
- 自动 fallback 让多 runtime 从"可选"变成"有价值"
- 卡死检测消除了"agent 是不是挂了"的焦虑
- Budget 限制消除了费用失控的恐惧
- 规则简洁明确，AI 实施时不容易犯错

**负面/trade-off**：
- Fallback 后开新 session，之前的 session 上下文丢失——接受，因为失败场景下旧 session 已经不可用
- 多 runtime fallback 可能导致同一个 task 在不同 vendor 上有不同的执行质量——通过 Activity Log 记录 runtime 切换历史，便于事后分析
- Budget 限制可能误杀正当的大任务——允许 task frontmatter override 解决

**回退计划**：
- 如果 fallback 导致频繁切换（"抖动"），加 cooldown 机制（切换后 N 分钟内不再切回）
- 如果 budget 限制被频繁触发，提示用户调高默认值

## Implementation

- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
- 子 plan：`plans/2026-04-27-runtime-fallback-rules.md`（待写）
