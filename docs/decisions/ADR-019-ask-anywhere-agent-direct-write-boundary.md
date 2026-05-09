---
id: ADR-019
title: Ask-Anywhere agent 的直写边界（分级 destructive + Journal + 高风险 propose）
status: accepted
date: 2026-05-09
implementation: plans/swift-vortex-darwin.md
---

## Context

Phase A–D 把 Ask-Anywhere SDK 从文本 completer 升级为带 tool_use 循环的 agent（参考 openclaw / Claude Code），agent 可通过 15+ 个 Orbit tools 操作 vault。这触碰到 `docs/VISION.md` 明确写入的核心安全原则：

> **propose-approve 模式** —— agent 提议新任务、扩大范围、破坏性操作都要人审

Task 执行（Worktree + ghost commit + Inbox 审批）严格遵守这条。但 Ask-Anywhere 的交互预期不同——它是**与用户对话的快速通道**，所有 tool 调用都要走 Inbox 审批会让体验无法使用（用户说了 3 句话就要在 Inbox 点 3 次确认）。

与此同时，"全量直写、不走任何审批"也不可接受：agent 误解或 LLM 幻觉会直接损坏用户的 Notes / Projects / Vision 等 Layer 1 Ground Truth。

本 ADR 记录 Ask-Anywhere 偏离 propose-approve 默认原则的具体边界与兜底机制。

## Decision

**Ask-Anywhere agent 的工具分三级**：

| 级别 | 典型工具 | 行为 | 留痕 |
|---|---|---|---|
| **只读** | orbit_search / orbit_read / orbit_task_list / orbit_activity_query / ... | 直接执行 | RuntimeEvent + TraceableEvent |
| **低风险直写** | orbit_resource_create / orbit_task_update (仅 status+depends_on) / orbit_assets_scope_add | 直接执行 + Journal + Activity | + `.orbit/agent-journal/<runId>.ndjson` + `agent.tool_invoked` Activity |
| **高风险提议** | orbit_task_propose / orbit_task_propose_scope / orbit_task_propose_split | **调用 cli_server handler → 内部走 approvalService.submit**；提议入 Inbox 等用户审批 | Activity `agent.proposal_submitted`（而非 `agent.tool_invoked`） |

### 低风险分级判据

一个 destructive 工具被分到"低风险直写"必须同时满足：

1. **handler 内部已做字段白名单**。例：`task.update` handler 只允许改 `status` 和 `depends_on` 两个字段，其余 frontmatter 不接受。
2. **不覆盖现有用户内容**。例：`resource.create` 只新建文件，不修改已有 Resource；slug 冲突自动加后缀。
3. **失败可人工恢复**。Git 或 vault 文件历史能回滚；不涉及外部副作用（邮件、API 发送等）。
4. **不替用户做决策**。例：`inbox.resolve` / `inbox.dismiss` **不暴露**——那是用户对 agent 提议的最终决断，agent 不能自己绕开。

不满足任一条 → 必须走 propose 路径（通过调用本身就 submit 到 approvalService 的 handler 来实现）。

### 兜底机制（四层防御）

1. **RuntimeEvent 实时可见**：`runtime.tool_use` / `runtime.tool_result` 流式渲染在 ChatView 的 ToolCard 里，用户看到 agent 正在调什么、参数是什么、结果是什么。
2. **TraceableEvent 审计流**：`runtime.sdk.tool_use.completed` 进 `.orbit/events/`，Developer Console 可查。
3. **Activity Log 面向用户**：`agent.tool_invoked` / `agent.tool_failed` / `agent.proposal_submitted` 进 `.orbit/activity/`；Activity 视图可过滤 `actor=agent` 看到"agent 在过去一周做了什么"。
4. **Agent Journal 便于回滚**：`.orbit/agent-journal/<runId>.ndjson` 每行记一条 destructive before-state（runId / toolName / input / at），用户事故后可 grep；Phase D 仅记录不做自动回滚。

## Consequences

### 正面

- 对话顺滑度保留：只读 + 低风险直写可直接执行，不阻塞用户思路
- 高风险操作仍受 VISION propose-approve 原则保护
- 四层留痕让"agent 做了什么"对用户完全透明可追溯
- 不满足"低风险判据"的新工具必须走 propose，自然收敛到安全默认

### 负面 / 风险

- 低风险判据需要人持续把关：新增工具时必须复核 handler 是否真的做了白名单
- Journal 仅记录不回滚：真正 destructive 事故仍需用户手动恢复（依赖 Git 或文件历史）
- 用户期望"agent 记住上次查过什么"：Phase B 的 toolTrace 跨 send 回放承担这份连续性，但 rebuild 12 轮压缩规则可能让长会话里的早期 tool 上下文丢失

### 未来出口

- Phase D+：如果用户反馈"agent 误写过一次"，把对应 tool **从低风险降级到 propose**（单向迁移，不反向）
- 考虑给低风险写增加"本次会话级 consent"（每个 conversation 首次触发时弹一次询问），避免回退到逐条审批但保留主动把关
- Journal 升级为可一键撤销（记录 post-state diff + reverse patch）

## Non-goals

- 本 ADR **不**改变 Task 执行的 propose-approve 流程（Worktree / ghost commit / Inbox 审批 / Task Dependency 不受影响）
- 本 ADR **不**允许 Ask-Anywhere 执行 Skill 的 `install` 字段（见 plans/swift-vortex-darwin.md §B5，已明确禁用）
- 本 ADR **不**引入跨 vault 写权限——所有 tool 仍受 vault 边界约束

## References

- `docs/VISION.md` §人机对等 / §Agent 参与真实执行
- `plans/swift-vortex-darwin.md` §0 用户决策摘要 / §3 首批 Tool 清单 / §6 留痕策略
- `src/main/agent-tools/executor.ts` — destructive 留痕实现
- `src/main/agent-tools/journal.ts` — Journal 写入
- `src/main/agent-tools/definitions/write.ts` — 低风险写工具清单
- `src/main/agent-tools/definitions/propose.ts` — 高风险 propose 工具清单
- `ADR-008` — AI-Native 原则（Ask-Anywhere 的分级是对 AI-Native 的具体落地边界）
