---
id: ADR-009
title: Activity Log — 系统级用户行为留痕
status: accepted
date: 2026-04-26
related: ADR-004, ADR-006, ADR-010
implementation: plans/2026-04-26-activity-log-infrastructure.md
---

## Context

v1 Orbit 里已有一些"留痕"机制，但是**碎片化**的：

- `<vault>/.orbit/logs/git.log` —— 只记 git 操作
- `<vault>/.orbit/cost/YYYY-MM.json` —— 只记 agent cost
- `02_Areas/Journal/YYYY-MM-DD.md` —— LLM 生成的每日总结
- Task frontmatter 有 `created` / `updated` —— 只是字段，不是事件流

**缺失的是"统一的用户行为事件流"**——用户/agent 做的每一件有意义的事都应该有一条独立事件记录。

v2 对话中用户明确了这个需求：

> "现在有设计一个操作记录的功能，这个操作记录实际上我是希望能够作为用户每天的留痕，也就是我其实希望有一个 review 页面，能看到每天用户做的那些事儿。"
>
> "后面做阅读和笔记的时候，也需要做操作记录，比如用户新增了什么订阅源，用户增加了一个 library 的新文档，用户新增了一条笔记，都需要记录。"

这不只是"review 页面的数据源"，更深层的是**BASB 的 Progressive Summarization 依赖可追溯的行为流**——没有留痕，"这一周做了什么"就只能靠记忆；有留痕，可以 AI 辅助回顾 + 跨时间搜索 + 提炼模式。

## Decision

### 1. 引入 Activity Log 基础设施

**所有"有意义的状态改变"都产生一条 Activity Event，统一写入文件流。**

### 2. 存储

```
<vault>/.orbit/activity/
├── 2026-04-26.ndjson       # 按日分片
├── 2026-04-27.ndjson
├── ...
└── schema.json             # 事件 schema 版本
```

NDJSON（每行一个 JSON 事件）便于追加写 + 流式读取。

### 3. 事件 schema

```typescript
interface ActivityEvent {
  id: string                    // uuid
  at: string                    // ISO timestamp
  actor: 'user' | 'agent'
  actor_id?: string             // agent 时填 run_id

  action: string                // 动作类型（见下）

  context: {
    project_uid?: string
    task_uid?: string
    run_id?: string
    area_uid?: string
    resource_uid?: string
    inbox_item_id?: string
    proposal_id?: string
    // ...
  }

  payload?: unknown             // 动作相关附加数据

  summary: string               // 人类可读摘要（Review 页面展示）
}
```

### 4. 动作类别（v2 首期）

| 类别 | Actions |
|------|---------|
| **Task lifecycle** | `task.created` / `task.status_changed` / `task.deleted` / `task.approved` / `task.dependency_changed` |
| **Project lifecycle** | `project.created` / `project.archived` |
| **Inbox** | `inbox.message_resolved` / `inbox.message_dismissed` / `inbox.capture_saved` / `inbox.capture_processed` |
| **Capture** | `feed.subscription_added` / `feed.subscription_removed` / `library.article_saved` / `library.article_read` / `library.article_promoted` / `thought.created` |
| **Agent execution** | `agent.run_started` / `agent.run_completed` / `agent.run_failed` / `agent.proposal_submitted` / `agent.proposal_approved` / `agent.merge_approved` |
| **Planner** | `planner.proposal_published` / `planner.proposal_revised` |
| **Settings** | `settings.changed` |

### 5. 统一 emitter 接口

```typescript
// src/main/activity/emitter.ts
export function emitActivity(event: ActivityEventInput): void
```

所有产生状态改变的模块（task store、inbox store、capture store、agent runner、planner 等）统一调用此接口。

### 6. 本期先做基础设施，UI 下期

- 本期落地：schema / emitter / 存储 / 各模块接入
- 本期**不**做 Review 页面 UI
- 但本期所有事件已经记录——等 UI 上线时有完整数据可回放

### 7. Daily Review 未来以 Activity Log 为输入源

v1 Daily Review (Journal) 主要基于 task 状态和 git 活动。v2 后续迭代时改为以 Activity Log 为主要输入，生成质量会显著提升。

## Rationale

**为什么要统一事件流而不是依赖各模块自己的日志**：

- 现有碎片化日志（git.log / cost/ / journal/）**没法做跨维度查询**（"今天做了什么" 要看多个文件）
- 未来 Review 页面、Orbit 自我进化、Thinking Trail 都需要统一事件源
- 早期建立基础设施，后续新能力接入零成本

**为什么用 NDJSON 按日分片**：

- 追加写友好（现代存储核心模式）
- 按日分片便于 GC 和检索（不需要整个文件加载）
- 纯文本，和 Orbit 的 "plain format" 哲学一致
- 手动可读，方便调试

**为什么区分 actor=user / agent**：

- 事后需要分析"哪些事是人做的、哪些是 agent 做的"
- 配合 `actor_id`（agent run_id）可以追溯到具体的执行实例

**为什么 context 是 flat object 而不是嵌套**：

- 便于查询和索引（未来可能引入 sqlite 索引）
- 避免 schema 演化中嵌套结构的破坏性变更
- 需要哪个 context 字段填哪个，字段名固定

**替代方案**：

- **只做 SQLite 数据库**：查询性能好但违背"plain format"，增加依赖
- **只在 Daily Review 时才统计**：会丢失细粒度事件，且无法回放
- **沿用现有碎片日志**：跨维度查询不可行

## Consequences

**正面**：
- 所有系统级行为有完整留痕
- Review 页面（下期）实现时数据已就绪
- 未来 Thinking Trail / 自我进化的数据基础就位
- Daily Review 质量可显著提升

**负面 / 待处理**：
- 所有产生状态改变的模块都要改造成调用 `emitActivity()`（改动面大）
- 对磁盘写入增加（但 NDJSON 很轻，每条事件 < 1KB）
- 本期不做 UI——意味着用户暂时看不到价值，但数据在积累

### 隐私与安全

- Activity Log 存在用户 vault 内（本地），不外传
- 不记录敏感 payload（比如 agent 的完整产出、用户输入的长文本）——只记摘要 + 引用（`task_uid`、`proposal_id`）

## Implementation

见 [`plans/2026-04-26-activity-log-infrastructure.md`](../plans/2026-04-26-activity-log-infrastructure.md)。
