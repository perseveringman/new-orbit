---
id: ADR-004
title: Inbox 作为人机协作的统一枢纽
status: accepted
date: 2026-04-26
related: ADR-005, ADR-006, ADR-010
implementation: plans/2026-04-26-inbox-v2-architecture.md
---

## Context

v1 的 Orbit 里，"待用户处理的事件"散落在多处：

- Agent 合并审批在 Project Room 的某个抽屉
- Daily Review 要去 Journal 页面看
- Budget 超支提示是顶部 banner
- Agent 遇到问题直接中断 agent run
- Capture 还只是 plan，没有落地入口

这导致用户必须在**多个页面间切换**才能理清"我现在需要处理什么"。更深层的问题是：

- 没有统一的审批枢纽 → v2 的 Auto-runner + propose-approve 模式（见 ADR-001, ADR-006）没法落地
- 没有 Capture 入口 → BASB 的 C 阶段（见 ADR-010）无处承载

同时，v2 对话中用户对 Inbox 架构有了清晰构想：**左列表 + 右通用内容舞台**。右侧可以渲染 chat / diff / 阅读器 / 编辑器等任何组件，本质是"Inbox = 通用事件列表 + 通用详情舞台"。

## Decision

**Inbox 成为 Orbit 里"用户注意力在场时的统一入口"**，承载所有需要用户看/处理的事件。

### 一级分层（按处理模式）

```
Inbox
├── 📥 Capture     # 原材料（沉浸式处理）
│   ├── 🌊 Feed     # 低信号扫描（RSS）
│   ├── 📚 Library  # 高信号深度阅读
│   └── ✨ Thoughts  # 自产灵感
├── 💬 Messages    # 操作决策（扫描式处理）
│   ├── A 审批类   # 合并 / 新任务 / proposal / 扩范围
│   ├── B 求助类   # 信息不足 / 方案选择 / 执行失败
│   ├── C 警示类   # 依赖连锁 / 预算告警 / agent 主动发现
│   └── D 纪律类   # Daily Review / 项目待归档 / GC 报告
└── 📦 Archive    # 统一归档视图（Messages + Library）
```

外加 **Feed History**：Feed 淡出的内容独立归档区，不进 Archive 视图，永久保留作为 agent 检索池。

### 右侧通用内容舞台

- 点击左侧条目，右侧渲染对应组件
- A1（合并审批）→ DiffView + action bar
- A2/A3（proposal）→ Proposal 预览 + 授权链路
- B 类（求助）→ TaskConversationTab（chat 原地）
- C3（agent 主动汇报）→ AgentInsightCard
- D1（Daily Review）→ JournalView
- Library → ArticleReader + 笔记工具
- Thoughts → NoteEditor

### 双通道同步

审批类事件同一 `proposal_id` 在 chat 原地卡片和 Inbox 条目之间同步。任一处处理 → 两处一起 resolved。

### 未读计数分级

- **左侧栏红点** 仅显示 Messages 未读数（Capture 不参与，避免催促）
- **Capture tab** 仅显示 Library 未读数（Feed / Thoughts 不参与）
- **Feed** 完全不计数（扫过即忘的哲学）

### 状态模型

- **Messages**: `pending → resolved | dismissed → archived`
- **Library**: `unread → reading → read → processed | dismissed → archived`
  - `reading` 是中间态，支持"读了一半"
- **Feed**: 扫过即淡出到 Feed History，无状态机

## Rationale

**为什么不做"通知中心"**：

- 通知中心的心智是"系统推给人看的"——违背 Orbit 的克制哲学
- Inbox 的定位是**用户主动来看**，不是**系统强行推送**
- 因此：红点克制显示、不做桌面通知、不做声音/闪灯

**为什么分 Capture 和 Messages**：

- 两类事件的处理节奏不同（沉浸 vs 扫描），混在一起会注意力污染
- Capture 本身是 BASB 的一阶段，需要独立尊严，不是"Inbox 的附属"

**为什么右侧做成"通用舞台"**：

- Orbit 的多处都有"列表 + 详情"模式（Inbox、Planner、未来长文协作）
- 把右侧做成可渲染任意组件的容器，让 Plan Chat、阅读器、diff view 都变成同一抽象的实例（见 ADR-005）
- chat 直接放进右侧 → 用户点左侧消息，右侧就是审批所在的 chat 上下文，无需页面跳转

**双通道同步而不是"只在 Inbox 处理"**：

- Agent 和用户在 chat 里对话时，审批请求**原地出现**是最自然的（不需要切到 Inbox）
- Inbox 作为**副本**存在，保证用户不在 chat 时不丢事件
- 通过 `proposal_id` 的共享状态让两处一致，避免"在 chat 批了 Inbox 还显示未处理"

## Consequences

**正面**：
- 用户有了单一的"待处理事件"入口
- 审批、Capture、系统事件有了统一承载
- 右侧舞台架构为未来扩展（更多事件类型、更多阅读/编辑组件）留足空间

**负面 / 待处理**：
- 需要设计一套 Inbox 事件的 schema、emitter、双通道同步机制
- UI 工作量不小（left list + right stage + per-type renderer）
- 现有分散在各处的审批/提醒入口需要统一迁移

### 本期不做

- 推送通知（桌面弹窗、声音）
- 批量处理（多选批准 / 一键清空）
- Inbox 历史检索

## Implementation

见 [`plans/2026-04-26-inbox-v2-architecture.md`](../plans/2026-04-26-inbox-v2-architecture.md)。

Capture 子系统的详细落地见 ADR-010 和 [`plans/2026-04-26-capture-foundation.md`](../plans/2026-04-26-capture-foundation.md)。
