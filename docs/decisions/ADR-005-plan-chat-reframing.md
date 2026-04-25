---
id: ADR-005
title: Plan Chat 定位修正 — 通用 chat + 产物舞台
status: accepted
date: 2026-04-26
related: ADR-004
implementation: (合入 inbox-v2-architecture)
---

## Context

v1 中 "Plan Chat" 是 Planner View 的一个组成部分：左边是和 Planner agent 的对话，右边是 React Flow 的 proposal canvas。v1 的实现把它当作 **Planner 专属的特殊组件**处理。

v2 对话中发现这个定位是错的——Plan Chat 的模式其实是**"对话面板 + 产物"这个通用模式的具体实例**。类似的地方在 Orbit 里还有：

- Inbox 右侧舞台（左事件列表 + 右对应组件，ADR-004）
- Task Conversation Tab（左 task chat + 右 diff view）
- 未来的长文档协作（左编辑对话 + 右文档）
- 未来的数据探索（左查询对话 + 右可视化）

把 Plan Chat 单独当作特殊物种，就会：

1. 每出现一个类似模式就重新实现一次，代码重复严重
2. UI 一致性差，不同场景下的"chat + 产物"交互不统一
3. 错过抽象升级的机会

## Decision

**Plan Chat 不是独立物种，而是 `通用 chat + 产物画布` 这个抽象模式的一个实例。**

Orbit 承认并抽出一套通用的 **"Stage View"** 模式：

```
┌────────────────┬─────────────────────────────────┐
│                │                                 │
│  Chat 面板     │  产物舞台 (Stage)               │
│  (对话历史)    │  (可渲染任意 React 组件)        │
│                │                                 │
│  用户/AI 对话  │  依据对话上下文渲染：            │
│                │    - Planner proposal canvas    │
│                │    - Diff view                  │
│                │    - Article reader             │
│                │    - Note editor                │
│                │    - Future: doc, viz, 3D...    │
└────────────────┴─────────────────────────────────┘
```

"Stage View" 是 Orbit 的一个**UI 级别的通用抽象**，而不是某个 feature 的专有实现。

### 具体应用

- **Planner View** = Stage View（产物 = proposal canvas）
- **Inbox 右侧** = Stage View（产物 = per-event renderer）
- **Task Conversation Tab** = Stage View（产物 = diff view / execution log）

### 不做

- 不在本期重构现有 Planner 代码去 "adopt Stage View 抽象"——重构成本不成比例
- **但**新增的 Inbox v2 / 未来新出现的"对话 + 产物"场景都按 Stage View 模式实现
- Stage View 的共用 hook / layout / 通信契约在 Inbox 实施时顺带抽出来

## Rationale

**为什么承认是通用模式**：

- 已经出现 3+ 个类似场景（Planner、Task Conversation、Inbox 设想）
- 用户在对话中明确指出 "chat 其实就可以直接放在内容区"——用户心智里就是通用模式
- 通用抽象后 UI 一致性和实施速度都显著提升

**为什么不彻底重构 v1 的 Planner**：

- v1 Planner 已经相对稳定，重构风险大于收益
- Stage View 作为新增抽象先在 Inbox / 新 feature 里实践，等验证成熟后再回头重构 Planner

## Consequences

**正面**：
- Inbox 的右侧实现直接受益于 "Stage View" 模式
- 新增"对话 + 产物"场景的成本大幅下降
- UI 一致性提升

**负面 / 待处理**：
- 现有 Planner 的 "Plan Chat" 暂时仍是独立实现，和 Stage View 不统一
- 抽象层的具体 API（如何注册 per-event renderer、如何从 chat 触发产物切换）需要在 Inbox 实施中探索
- 未来如果 Stage View 抽象方向偏了，需要回调

## Implementation

- 本 ADR 不产生独立的 plan 文档
- 相关实施在 [`plans/2026-04-26-inbox-v2-architecture.md`](../plans/2026-04-26-inbox-v2-architecture.md) 中一并落地
- 后续如果 Stage View 抽象稳定且要回头重构 Planner，会开新的 plan
