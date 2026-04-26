# Architecture Decision Records (ADR)

本目录记录 Orbit 的**方向性架构决策**。每份 ADR 描述一个单一决策：它是什么、为什么需要、权衡了什么、最终选了什么。

---

## 是什么

ADR 借鉴自 Michael Nygard 的 [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html) 格式。Orbit 里的 ADR 遵守以下原则：

- **单一决策** — 一份 ADR 对应一个决策；相关但独立的决策要分开成多份
- **不可变** — ADR 写完 accepted 后不再修改正文；如果决策被推翻，写一份新的 ADR 并把旧的标记为 `superseded`
- **浓缩** — 每份 ADR 2–5 KB，只讲"是什么/为什么/取舍"，不讲实施细节（实施细节在对应的 `plans/` 文档里）

---

## 和 plans/ 的关系

| 维度 | ADR | plans/ |
|------|-----|--------|
| 讲什么 | WHAT + WHY | HOW |
| 大小 | 2-5 KB | 10-20 KB |
| 生命周期 | 不可变（改方向要写新的） | 随实施演进（draft → active → completed → archived） |
| 依赖 | 独立，互相引用 | 通常对应一份 ADR（或多份 ADR 的组合） |

**典型关系**：一份 ADR 对应一份 plan。plan 开头 frontmatter 里 `adr` 字段引用 ADR 编号；ADR 末尾 `Implementation` 章节指向 plan。

---

## 命名规范

`ADR-NNN-<kebab-title>.md`，编号递增不重用。即便某个 ADR 被 superseded，编号也不被新 ADR 复用。

---

## Status 字段

每份 ADR 在 frontmatter 中有 `status`：

| Status | 含义 |
|--------|------|
| `proposed` | 提议阶段，尚未 accepted |
| `accepted` | 已接受，作为当前方向 |
| `superseded` | 被后续 ADR 取代；必须填 `superseded_by` 指向新 ADR |
| `deprecated` | 主动废弃，但未被其他 ADR 取代（少见） |

---

## 索引（按编号）

| # | 标题 | Status | 关联 plan |
|---|------|--------|-----------|
| 001 | [废弃 Night Shift，转向 24×7 Auto-runner](ADR-001-deprecate-night-shift.md) | accepted | `auto-runner-dispatcher` |
| 002 | [Agent 自主边界 — 子任务折叠进主任务](ADR-002-agent-autonomy-scope.md) | accepted | `auto-runner-dispatcher` |
| 003 | [ExecutionContext 分化 — Worktree + Sandbox 双轨](ADR-003-execution-context-split.md) | accepted | `execution-model-migration` |
| 004 | [Inbox 作为人机协作统一枢纽](ADR-004-inbox-as-hub.md) | accepted | `inbox-v2-architecture` |
| 005 | [Plan Chat 定位修正 — 通用 chat + 产物舞台](ADR-005-plan-chat-reframing.md) | accepted | （合入 inbox-v2） |
| 006 | [任务授权模型 — propose-approve 两阶段](ADR-006-task-authorization-model.md) | accepted | `auto-runner-dispatcher` |
| 007 | [任务依赖模型 — depends_on + 拓扑解锁](ADR-007-task-dependency-model.md) | accepted | `task-dependency-system` |
| 008 | [AI-Native 原则与 CLI-first 迁移](ADR-008-ai-native-cli-first.md) | accepted | `cli-migration` |
| 009 | [Activity Log — 系统级用户行为留痕](ADR-009-activity-log-infrastructure.md) | accepted | `activity-log-infrastructure` |
| 010 | [Capture 三分 — Feed / Library / Thoughts](ADR-010-capture-tri-partition.md) | accepted | `capture-foundation` |
| 011 | [Runtime 抽象贯通 — 通用 Agent Event 协议](ADR-011-runtime-abstraction-through-capabilities.md) | accepted | `phase-3-agent-observability-resilience` |
| 012 | [Task-Session 绑定模型](ADR-012-task-session-binding-model.md) | accepted | `phase-3-agent-observability-resilience` |
| 013 | [统一事件回放基础设施](ADR-013-unified-event-replay-infrastructure.md) | accepted | `phase-3-agent-observability-resilience` |
| 014 | [Runtime Fallback 决策规则](ADR-014-runtime-fallback-decision-rules.md) | accepted | `phase-3-agent-observability-resilience` |
| 015 | [Task 状态机与 Agent 会话状态机解耦](ADR-015-task-session-state-decoupling.md) | accepted | `task-execution-lifecycle-realignment` |
| 016 | [Agent 启动协议 — 先了解项目全貌再开工](ADR-016-agent-onboarding-protocol.md) | accepted | `task-execution-lifecycle-realignment` |

---

## 新 ADR 的起步模板

```markdown
---
id: ADR-NNN
title: <Short decision statement>
status: proposed
date: YYYY-MM-DD
supersedes: (optional, ADR-XXX)
superseded_by: (optional, ADR-YYY)
related: (optional, ADR-AAA, ADR-BBB)
implementation: plans/YYYY-MM-DD-xxx.md
---

## Context

描述决策发生的背景：什么推动了这次决策？有哪些需要解决的问题？

## Decision

明确说出决策本身（1-3 句话）。

## Rationale

为什么是这个决策？关键权衡是什么？考虑过哪些替代方案？

## Consequences

这个决策带来什么后果？（正面 + 负面 + 待观察项）

## Implementation

链接到实施方案 / 相关代码位置 / 迁移策略（可选）。
```
