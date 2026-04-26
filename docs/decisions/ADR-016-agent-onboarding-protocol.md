---
id: ADR-016
title: Agent 启动协议 — 先了解项目全貌再开工
status: proposed
date: 2026-04-28
related: ADR-008, ADR-011, ADR-015
implementation: plans/2026-04-28-task-execution-lifecycle-realignment.md
---

# ADR-016: Agent 启动协议 — 先了解项目全貌再开工

## Context

Phase 3 dog-food 暴露了一个 Phase 3 没解决的问题：**Agent 在认领 task 时只知道这一个 task 的内容，不知道项目还有什么 task、项目走到哪个阶段、相关决策和文档在哪**。

直接后果：

- Agent 张口就说"我需要补充信息"——它真的什么都不知道
- Agent 的"补充信息"建议常常是**项目里已经写过的东西**（用户已经在某个 plan 或 ADR 里说清楚了）
- Agent 的开工方案没有项目级一致性（不知道有相关任务在并行、不知道有架构决策已经否决了某条路径）

用户对这件事的期待非常明确：

> agent 必须要了解全面的东西再开始开工，不应该直接开始开工，**千万不要直接开始开工**。

但是用户也不希望粗暴地"塞 context"——把所有项目文档一次性塞进 system prompt 既贵又不灵活。ADR-008 已经确立了 **AI-Native + CLI-first** 的方向：agent 应该用 CLI 按需取信息，而不是一次塞满。

问题变成：怎么**强制** agent 在动手前用 CLI 走完一遍项目级理解？

## Decision

引入一个明确的 **Agent Onboarding Protocol**（启动协议），由两部分组成：

### 1. 强约束启动 system prompt

dispatch 时所有 RuntimeAdapter 的 `buildSystemPrompt()` 在前置位置加入启动协议段：

```
# 启动协议（必须遵守）

你即将处理 task: <title> (uid: <task-uid>)。
这个 task 是项目 <project-name> 的一小部分，**不是孤立任务**。

## 第一阶段：理解（必须在第一轮完成）

在做任何修改文件 / 创建文件 / 调用工具修改状态的操作之前，
你必须先用以下命令至少完整运行一次了解项目全貌：

  orbit project overview <project-slug>
  orbit kanban list <project-slug>
  orbit task related <task-uid>
  orbit search "<keyword>" --project <slug>

读完后，你的第一条输出**必须**包含一个明确段落：

  > 我已了解：
  > - 项目目标：…
  > - 这个 task 在项目中的位置：…
  > - 相关 task / 决策 / 风险：…
  > - 我的开工计划是：…

只有在你输出过这段"开工声明"之后，你才被允许进入实施阶段。

## 第二阶段：实施

实施过程中信息不足时：直接询问用户，**不要静默退出，不要尝试把任务标记 blocked**。

## 第三阶段：交付

完成后输出 summary，让 ghost commit 流程接管。
如果 task 应拆分，使用 `orbit task propose-split` 提议（不要自行拆分）。
```

### 2. 配套 CLI 命令矩阵

| 命令 | 目的 | 状态 |
|---|---|---|
| `orbit project overview <slug>` | 项目愿景 + 阶段 + 关键 plan / ROADMAP 摘要 | 部分能力散落，本期合并 |
| `orbit kanban list <slug>` | 项目所有 task（状态 / 标题 / authorization / last update） | 已有，确认输出含上下文摘要 |
| `orbit task related <uid>` | 与当前 task 相关的其他 task（基于 depends_on / 同 plan / 同 keyword） | **新增** |
| `orbit search <kw> --project <slug>` | 项目内全 vault 搜索 | 已有，确认 `--project` 过滤 |
| `orbit task transcript <uid>` | 当前 task 的对话 transcript（来自所有 RunSegment） | **新增**（也用于 ADR-012 修订） |
| `orbit task propose-split <uid>` | Agent 主动提议拆分 task | 新增 propose 类型 |
| `orbit distill wake-up <slug>` | 触发项目 distillation 召回 | 已有，确认在启动时机调用 |

### 3. 行为审查（轻量，不强制）

在 RuntimeAdapter / Runner 层增加一项观测：

- 扫描 agent 第一条 message 事件，判断是否包含"我已了解：" 关键词
- 不包含 → emit warning 事件到 Activity Log，**不阻断执行**
- dog-food 数据决定是否升级为强制门（hard gate）

## Rationale

**为什么靠协议而不是 context 注入**：

- ADR-008 已经把方向定为 AI-Native + CLI-first。延伸到此处：agent 应当**主动使用工具获取信息**，而不是等 Orbit 喂
- Context 注入的 context window 永远有上限；CLI 按需取理论上无上限
- CLI 路径让 agent 的"已读"行为留痕在 Activity Log，事后可审计
- 同时 CLI 是 ADR-008 的人机对等基础——人能用 CLI 看到的东西，agent 也能看到

**为什么强约束 prompt + 输出"我已了解"声明**：

- 单纯告诉 agent "可以用 CLI" 它会偷懒，dog-food 已经验证
- 让 agent 输出明确声明段落，把"先理解"这件事变成**对话流可见的产物**
- 用户在 task chat 里能直接看到 agent 的理解程度，第一时间纠偏
- 同时给行为审查提供识别锚点（关键字）

**为什么行为审查只 warning 不强制**：

- agent 可能用各种花样绕过（输出"我已了解 X" 但其实没读）——硬约束反而引入误判风险
- 先观察真实数据（dog-food 中的 warning 比例 / agent 输出质量），再决定要不要升级
- 与 Orbit 的"可观察先行"原则一致（先有数据再决策）

**替代方案**：

- **每次 dispatch 时把项目所有 plan / ADR 全部注入 prompt**：拒绝。Token 成本爆炸；与 ADR-008 方向冲突
- **不做协议，靠 agent 自己悟**：拒绝。dog-food 已经验证了 agent 不会自觉，"千万不要直接开始开工"是用户原话
- **用代码硬约束（agent 第一条不含"我已了解"就 kill 进程）**：拒绝。误杀风险高，且对未来支持更多 runtime 的扩展性差

## Consequences

**正面**：

- Agent 决策建立在项目级一致性上，"求助"次数应显著减少
- Agent 的开工方案与项目当前阶段对齐
- ADR-008 的 AI-Native + CLI-first 在 agent 入口处真正落地
- 启动协议本身可以演进——靠 dog-food 数据迭代约束强度

**负面 / 待处理**：

- 每个 task 启动多了 1-2 轮"探索性对话"，token 和延迟成本上升（估算每 task ~500-2000 token）
- 复杂项目里 `orbit project overview` 输出本身可能很大——需要在 CLI 实现时控制摘要长度
- Agent 假装"我已了解"的可能性永远存在——靠真实输出质量审查兜底
- 跨 runtime 时不同 vendor 对 system prompt 风格响应差异——通过 RuntimeAdapter 各自微调

**待观察项**：

- 启动协议遵守率（是否需要从 warning 升级为硬门）
- 探索成本是否值得（对比 agent 求助率下降幅度）
- 是否需要 task 复杂度分级，简单 task 跳过启动协议

## Implementation

详见 [`plans/2026-04-28-task-execution-lifecycle-realignment.md`](../plans/2026-04-28-task-execution-lifecycle-realignment.md) 的 §3.2 和 §5 实施顺序。

关键实施点：

- `RuntimeAdapter.buildSystemPrompt()` 前置启动协议段
- 新 CLI 命令：`orbit project overview` / `orbit task related` / `orbit task transcript` / `orbit task propose-split`
- Runner 层加入"我已了解" 关键词扫描，emit warning 事件到 Activity Log
- Agent Playground 的 lifecycle scenario L04 (compliance) / L05 (violation) 自动化验证
