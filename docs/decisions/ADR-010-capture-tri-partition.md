---
id: ADR-010
title: Capture 三分 — Feed / Library / Thoughts
status: accepted
date: 2026-04-26
supersedes: plans/2026-04-24-capture-knowledge-funnel.md
related: ADR-004
implementation: plans/2026-04-26-capture-foundation.md, plans/2026-04-26-quick-capture-mvp.md
---

## Context

BASB 的 **Capture** 阶段是第二大脑的入口——把外部信息和内部灵感低摩擦地落到本地。v1 Orbit 把它作为一个统一的 "Capture & Knowledge Funnel" plan 处理（`plans/2026-04-24-capture-knowledge-funnel.md`），用 "Task / Note / Link" 三分法，实施上较为混杂。

v2 对话中用户提出了两个不同维度的区分，促使重新设计：

### 1. 阅读内容的信号维度（Feed vs Library）

> "这里我想设计成 feed 和 library 两种，feed 是一种低信号的信息流，用户是被动在消费，他不一定喜欢 feed 流里面的每一篇文档，因为这个流里面有可能是订阅的 RSS，有可能是 GitHub 的 trending 等等。而 library 是一种高信号的用户主动加入的单篇文档。"

这是**信号浓度**的区分——Feed 是低信号被动消费，Library 是高信号主动阅读。两者的 UX 范式完全不同：
- Feed：高密度列表、扫过即忘、唯一有意义动作是 Save
- Library：低密度列表、深度阅读、支持做笔记、Promote to Resource

### 2. 内容产生者的维度（外部内容 vs 自产灵感）

> "灵感笔记确实应该单独一类。"

用户自产的灵感笔记（voice log / quick thought / scratch）不是 "订阅" 也不是 "主动阅读"，它是**自己产生**的内容，需要独立成一类。

## Decision

### 1. Capture 分三类，平级

```
📥 Capture
├── 🌊 Feed        # 低信号扫描（订阅流）
├── 📚 Library     # 高信号主动阅读（单篇收藏）
└── ✨ Thoughts    # 自产灵感笔记
```

### 2. 各子类的核心 UX 特性

#### 🌊 Feed
- 数据源：RSS（v1 only，Twitter/GitHub/HN 等后续）
- 高密度列表 UI（Feedly / Reeder 风格）
- 唯一有意义动作：**Save to Library**
- 扫过即自动标已读（scroll past / 进入视口 2s）
- **不显示未读数**（Feed 的设计哲学就是"没存就忘了"）
- 淡出后进 **Feed History**（永久保留，agent 检索池，见下）

#### 📚 Library
- 数据源：Feed 升级 / 手动保存（URL 粘贴 / 未来的手机 share / 浏览器插件）
- 低密度列表 UI（每条展示标题/来源/预计时长/保存备注）
- 完整状态机：`unread → reading → read → processed | dismissed → archived`
  - `reading` 是有效中间态（读了一半继续读）
- 沉浸阅读器 + scroll position（200ms 节流记录）+ 阅读时长
- **Promote to Resource**（一键让 agent 基于文章 + 用户划线/笔记生成 `03_Resources/<title>.md`）

#### ✨ Thoughts
- 数据源：Quick Capture 全局快捷键 / 未来的 voice log
- 极简 UX：写下即保存，可选 tags
- 处理方式：归到 Resources / Areas / 触发新 Project

### 3. Feed History 独立归档

Feed 扫过的内容不进主 Archive 视图（Archive 服务 Messages + Library），而是进**独立的 Feed History**：

```
.orbit/inbox/capture/feed/
├── subscriptions.json
├── pending.json              # 未读
└── history/YYYY-MM.ndjson    # 淡出归档
```

**特性**：
- UI 默认隐藏（平时用户不看）
- 永久保留（纯文本数据，硬盘成本低）
- Agent 主动检索的"用户兴趣历史池"（比如"用户前几天刷到过相关内容吗？"）
- 清理交给 AI 用文件系统能力做（"清理半年前的 feed history"）

### 4. 红点未读计数分层（承接 ADR-004）

- 左侧栏 Inbox 图标红点 = Messages 未读数（不包含 Capture）
- Capture tab 计数 = Library 未读数
- Feed / Thoughts 不参与计数

### 5. Quick Capture 本期最小版

全局快捷键 `⌘⇧I` 打开轻量浮层，三选一（Thought / Library / Feed），**本期只做 Thought 跑通流程**，Library / Feed 的 Quick Capture 入口后续迭代。

### 6. Library → Resources 的 "Promote" 连接 BASB D 阶段

读完一篇 Library 文章后可触发"Promote to Resource"：
- Agent 基于文章内容 + 用户的笔记/划线生成 `03_Resources/<kebab-title>.md`
- 原 Library 条目标记为 `processed`
- Activity Log 记录 `library.article_promoted`

这让 BASB 的 **Distill** 阶段有了明确的入口。

## Rationale

**为什么 BASB 原著没有 Feed 但 Orbit 要有**：

- BASB 假设用户在外部工具（Twitter / RSS reader）刷信息流，只把觉得有价值的 "capture" 进第二大脑
- Orbit 把"刷 feed"也纳入工作台，是为了避免工具切换、保持 capture 动作的连续性
- 同时 Feed History 作为 agent 兴趣历史池是原著没有的增强能力

**为什么 Feed 不计未读数**：

- 计数 = 催促；Feed 的数字会无限增长，制造"必须清空"的焦虑
- 违背 Orbit 的"不打扰"哲学
- Feedly / Twitter / 小红书等都没有这个计数，是成熟的 UX 选择

**为什么 Library 有 `reading` 中间态，Messages 没有**：

- Library 的条目可能"读了一半"，需要保留进度
- Messages 都要求快速决定（读了就 resolve / dismiss），没有"读了但没决定"这种有效中间态

**为什么本期只做 Thought 的 Quick Capture**：

- 要跑通 Inbox → Capture → 后续处理的流程，Thought 是最简单的路径
- Library 的 Quick Capture 需要 URL 抓取 + 内容提取 + 封面图，复杂度高
- Feed 的 Quick Capture 其实是"加订阅源"，是另一种动作，不适合合在同一浮层
- 一步一步验证，避免一次做多容易错

**为什么 Feed 清理不做 UI**：

- 低频运维动作
- 完全可以由 AI 做（"清理半年前的 feed"）
- 这就是 AI-Native 原则（ADR-008）的典型体现

## Consequences

**正面**：
- Capture 语义清晰分层，各类 UX 可专注优化
- Feed History 作为 agent 长期记忆池打开了"思考伙伴"能力的下一步（见 ADR-004 的 C3 "agent 主动汇报有趣发现"）
- Library → Resources 的 Promote 补完了 BASB 的 D 阶段入口

**负面 / 待处理**：
- RSS 解析、Feed 定时刷新、Reader 组件等是本期的工程量
- Library 的阅读器需要较完整的 UX（字号/行宽/暗色/高亮/笔记），不是轻量组件
- Feed 升级到 Library 的数据流需要设计（包括保留"为什么觉得值得存"的可选备注）

### 本期不做

- Voice Log（Thoughts 的语音输入）
- 手机 share endpoint
- 浏览器插件
- Feed 多来源（Twitter / GitHub / HN / Substack ...）
- Inbox 历史检索（Feed History 里的全文搜索）
- 阅读器的高级交互（高亮/划线/inline note）——本期先有基础阅读进度即可

### 被本 ADR 废弃的 plans

- `plans/2026-04-24-capture-knowledge-funnel.md`：原 "Task/Note/Link" 三分法被 "Feed/Library/Thoughts" 替代；原计划标记 superseded 并保留原文

## Implementation

见：
- [`plans/2026-04-26-capture-foundation.md`](../plans/2026-04-26-capture-foundation.md)
- [`plans/2026-04-26-quick-capture-mvp.md`](../plans/2026-04-26-quick-capture-mvp.md)
