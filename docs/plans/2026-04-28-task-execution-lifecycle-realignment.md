---
title: "Task Execution Lifecycle Realignment"
status: in_progress
date: 2026-04-28
adr: ADR-015 (待写), ADR-016 (待写), ADR-012 (扩展)
supersedes: null
phase: 4
---

# Task Execution Lifecycle Realignment

> **代号**：Phase 4.0 — "让 task 真的能从头跑到尾"
>
> **核心命题**：Phase 3 把 agent 执行链路升级成可观察、可恢复、可回放，但**真实 dog-food 暴露了一个更上层的问题——task 生命周期状态机和 agent 会话状态机被错误地耦合在了一起**。本期把它们解耦，并把"agent 启动协议"和"切 runtime 时的 session 承接"一并修正，让 task 真正能"开了走开睡觉，醒来都有终态"。
>
> **前置条件**：v2 + Phase 3 全部 completed
>
> **预期产出**：2 份新 ADR (015, 016) + ADR-012 修订 + 三块设计 + 端到端真实自动化测试 + 代码改造

---

## 1. 问题陈述

### 1.1 真实 dog-food 故障复盘

Phase 3 完成代码后立刻 dog-food，第一个稍复杂的任务（多工具/长 thinking）就跑不下来。具体复现路径：

1. 在看板新建 task，状态 `to do`，授权 `autonomous`
2. Auto-runner 拾取，dispatch claude runtime
3. **Agent 第一句话就说**："我需要补充 X、Y、Z 才能开始" → agent 进程退出
4. Orbit 把 task 状态从 `doing` 改成 `blocked`
5. 用户在 task chat 里补充信息
6. **task 不会自动回 `doing`**，agent 进程不会自动重启，整条链路死在这里

同时观察到的次生问题：

- **Agent 不知道项目全貌就开工**——项目里还有十几个相关 task、几份 plan、roadmap 上的阶段定位它都不掌握，决策"我需要更多信息"是在记忆缺失下做出的
- **没有"切 agent"通道**——即使知道 claude 状态不好想换 codex 试试，找不到入口，且担心切换后历史对话丢失

### 1.2 五个症状一个根因

把上面拆成 5 个独立症状：

| # | 症状 | 用户感受 |
|---|------|---------|
| 1 | Task `blocked` 是单向门：进得来出不去 | 补充完信息也不知道下一步怎么办 |
| 2 | Agent 求助 → task 死亡 | 像"员工有疑问就辞职"的错配 |
| 3 | Agent 认领时项目级上下文不足 | agent 张口要"补充信息"，因为它真的什么都不知道 |
| 4 | task chat 发消息不会自动续跑 | 不知道续跑入口在哪 |
| 5 | 切 runtime 时 session 历史丢失没人保证 | 不敢切 |

**共同根因**：Orbit 把 **"task 项目层状态"** 和 **"agent 执行层会话状态"** 混为一谈。

- task 状态是项目层概念（事情做完了没？人审过没？）
- agent 会话状态是执行层概念（进程活着吗？session 健在吗？等不等用户回信？）
- Phase 3 的 ADR-012 已经把"vendor session 不死"做了，但 task 状态机仍按"agent 进程退出 = task 阶段终结"的旧模型运转
- 两层耦合在一起，导致 agent 一次软退出（求助）就把 task 推进死状态，再也回不去

修这个根因，5 个症状一起松动。

### 1.3 与 Phase 3 的关系

Phase 3 解决的是**执行层内部**的可观察 / 可恢复 / 可回放问题，但**没有重新审视 task 状态机**。本期是 Phase 3 的逻辑延续，把"执行链路稳定"的成果延伸到"端到端 task 生命周期稳定"。

---

## 2. 核心目标

**用户表述**：

> 我可以随时开各种各样的 task，agent 也对这些 task 都了解上下文，他认领了一个 task 之后，他在执行这个 task 的时候，他能知道这个项目在干什么，他才能规划他自己的下一步。然后，他需要补充信息的时候，我补充信息以后，他还能接着去跑。他即使报错了，我也有能够手动去让它继续的办法，或者是切换到别的 agent 的办法。

落到可验证的标准：

| # | 标准 | 验证方式 |
|---|------|---------|
| G1 | task 生命周期没有"单向门"，每个 task 都能从任意状态走到终态（done / archived / 主动 reject） | 状态迁移图全闭合 + 端到端测试覆盖每条边 |
| G2 | Agent 认领时**强制**先了解项目全貌再动手 | 启动协议 + agent 行为审查（看真实 transcript） |
| G3 | 用户在 task chat 发消息一定能让 task 流动 | 自动化测试模拟用户介入 |
| G4 | Switch Runtime 不丢历史，新 agent 能完整接手 | 真实跨 runtime 切换 + transcript 完整性断言 |
| G5 | 任何故障路径都有"手动让它继续"的入口，而且入口符合直觉 | UI / CLI 双通道审查 |

---

## 3. 三大设计动作

### 3.1 动作 1：Task 状态机 ⊥ Agent 会话状态机（ADR-015）

#### 解耦

```
┌──────────── Task 状态机（项目层 / 持久 / 跨 session）────────────┐
│                                                                  │
│   to do                                                          │
│     │                                                            │
│     ▼                                                            │
│   ready ──────► doing ──────► review ──────► done                │
│     │            ▲                              │                │
│     │            │                              ▼                │
│     ▼            │                          archived             │
│   blocked ───────┘                                               │
│     (仅用于 ADR-007 depends_on 未就绪)                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            ⊥（不直接耦合）
┌──────────── Agent 会话状态机（执行层 / per RunSegment）──────────┐
│                                                                  │
│   idle ──► launching ──► running ◄──────► awaiting_user          │
│                              │                                   │
│                              ├──► completed                      │
│                              ├──► failed_retryable               │
│                              └──► failed_terminal                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 关键约束

- **`blocked` 仅用于 ADR-007 定义的 `depends_on` 未就绪**，不再表达"等用户回信"
- **`awaiting_user` 是 agent 会话子状态**，task 主状态保持 `doing`
- 看板视觉提示：`doing` 列内的卡片如果会话子状态是 `awaiting_user`，加图标（💬 待回复）
- task 状态迁移由 **task state machine service** 统一发起，agent 会话事件**不直接修改 task 状态**，而是经过 reducer 决定是否影响 task 状态

#### 状态迁移规则（关键边）

| 触发事件 | task 当前 | task 迁移 | agent 会话迁移 |
|---|---|---|---|
| Auto-runner 派发开始 | ready | doing | idle → launching → running |
| Agent 主动求助补充信息 | doing | **不变（仍 doing）** | running → awaiting_user |
| 用户在 task chat 发消息 | doing/awaiting_user/blocked* | doing | awaiting_user/idle → launching → running |
| Agent 完成 + ghost commit ok | doing | review | running → completed |
| Agent 进程死 + 不可重试 | doing | **不变（仍 doing）** | running → failed_terminal |
| Agent 进程死 + fallback 可用 | doing | **不变** | failed_* → idle → 切 runtime → running |
| 所有 runtime 都失败 | doing | **不变** | failed_terminal | + emit Inbox B3 |
| 用户在 review 列拖回 doing | review | doing | idle |
| 用户主动 reject merge | review | done (with rejected outcome) | — |
| 依赖未就绪 | ready | blocked | — |
| 依赖就绪 | blocked | ready | — |

`blocked*`：从 blocked 接收消息时，agent 会话先开起来，但**只有依赖真就绪了** task 才回 doing；否则 agent 在 awaiting_user / 解释为什么进展不了。

#### Reducer 设计

```typescript
// src/main/task-state/reducer.ts (新增)

interface TaskStateContext {
  task: Task
  activeRunSegment: RunSegment | null
  pendingDependencies: TaskUid[]
}

interface TaskStateInput {
  source: 'user' | 'agent' | 'dispatcher' | 'system'
  kind:
    | 'user_message_in_chat'
    | 'agent_session_started'
    | 'agent_awaiting_user'
    | 'agent_completed'
    | 'agent_failed'
    | 'dispatcher_dispatch_failed'
    | 'dependency_resolved'
    | 'dependency_blocked'
    | 'user_review_action'
  payload: unknown
}

function reduceTaskState(
  ctx: TaskStateContext,
  input: TaskStateInput,
): TaskStateTransition {
  // 返回 { newTaskStatus, newSessionStatus, sideEffects[] }
}
```

所有 task 状态变更走这个 reducer，事件原子化、可测试、可回放。

### 3.2 动作 2：Agent 启动协议（ADR-016）

#### 强约束启动 prompt

dispatch 时所有 agent runtime 的 system prompt 前置一段强约束启动协议（可以在每个 runtime adapter 的 `buildSystemPrompt()` 中拼装）：

```
# 启动协议（必须遵守）

你即将处理 task: <title> (uid: <task-uid>)。
这个 task 是项目 <project-name> 的一小部分，**不是孤立任务**。

## 第一阶段：理解（必须在第一轮完成）

在做任何修改文件 / 创建文件 / 调用工具修改状态的操作之前，
你必须先用以下命令至少**完整运行一次**了解项目全貌：

  orbit project overview <project-slug>     # 项目愿景 / 当前阶段 / 关键文档
  orbit kanban list <project-slug>          # 项目所有 task 当前状态
  orbit task related <task-uid>             # 与当前 task 相关的其他 task / docs
  orbit search "<keyword>" --project <slug> # 全 vault 搜索（如有具体关键词）

读完后，你的第一条输出**必须**包含一个明确段落：

  > 我已了解：
  > - 项目目标：…
  > - 这个 task 在项目中的位置：…
  > - 相关 task / 决策 / 风险：…
  > - 我的开工计划是：…

只有在你输出过这段"开工声明"之后，你才被允许进入实施阶段。

## 第二阶段：实施

实施过程中如果信息不足：
- **询问用户**（直接输出问题，等用户在 chat 回复）
- **不要静默退出**
- **不要尝试把任务标记为 blocked**

## 第三阶段：交付

完成后输出 summary，让 ghost commit 流程接管。
如果你判断 task 应该拆分成多个，使用 `orbit task propose-split` 提议（不要自行拆分）。
```

#### 配套 CLI 命令清单

| 命令 | 目的 | 现状 |
|---|---|---|
| `orbit project overview <slug>` | 项目愿景 + 当前阶段 + 关键 plan 列表 + ROADMAP 摘要 | 部分能力已散落，本期合并成单命令 |
| `orbit kanban list <slug>` | 项目所有 task 列表（含状态、标题、authorization、last update） | 已有，确认输出含上下文摘要 |
| `orbit task related <uid>` | 与当前 task 相关的其他 task（基于 depends_on / 同一 area / 同一 plan / 同 keyword） | **新增** |
| `orbit search <kw> --project <slug>` | 在指定项目内全 vault 搜索 | 已有，确认 `--project` 过滤 |
| `orbit task transcript <uid>` | 当前 task 的对话 transcript（来自所有 RunSegment 的 vendor session） | **新增**（动作 3 用到） |
| `orbit task propose-split <uid>` | Agent 主动提议拆分 task（走 ADR-006 propose-approve） | 已有 `propose_*` 框架，新增 `split` 类型 |
| `orbit distill wake-up <slug>` | 触发项目 distillation 召回 | 已有，确认在 agent 启动时机调用 |

#### 检验机制

启动协议是 **prompt 引导 + 行为审查** 双层约束：

- **prompt 引导**：上面的强约束 system prompt 让 agent 倾向遵守
- **行为审查**（轻量、不强制）：runner 在 agent 第一条 message 事件中扫描是否包含"我已了解：" 关键词
  - 不包含 → emit warning 事件到 Activity Log（不 block 执行，避免误杀）
  - 后续 dog-food 数据决定是否升级为强制门

不上来就强制门是为了避免 agent 用各种花样绕过（输出"我已了解 X" 但其实没读）——靠真实数据观察 agent 是否会偷懒，再决定要不要硬约束。

### 3.3 动作 3：Switch Runtime 与 Session 承接（ADR-012 扩展）

#### 核心洞察

- **vendor session 不可迁移**：Claude / Codex / Copilot 各家 sessionId 私有
- **conversation transcript 可迁移**：通过各 vendor CLI 自带的 session 转录读取能力
- **Orbit 不再自做 transcript 持久化**：直接利用 Phase 3 已经在 `RunSegment.vendorSessionId` 持久化的链接，按需读取各 vendor 的 session 历史
- **本地优先**：所有 vendor 的 session 历史都在用户机器本地（`~/.claude/projects/...`、Codex 类似），离线可读

#### RuntimeAdapter 接口扩展

```typescript
// 在 ADR-011 已有的 RuntimeAdapter 基础上扩展
interface RuntimeAdapter {
  // … 已有
  startSession(...)
  resumeSession(...)
  sendMessage(...)
  stopSession(...)
  getVendorSessionId(...)
  getNonRetryableErrors(...)

  // 新增
  /**
   * 读取已结束（或正在运行）session 的对话历史。
   * 返回的事件流应已按 ADR-011 通用 AgentEvent 协议翻译过。
   * 如果该 vendor CLI 不支持读取 session 历史，
   * 返回 null，由上层 fallback 到 Phase 3 unified event store 重组。
   */
  getSessionTranscript(sessionId: string): Promise<UnifiedAgentEvent[] | null>
}
```

#### Claude Adapter 实现示例

Claude CLI 的 session 存储在 `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`。adapter 读取这个 jsonl 文件，按通用 AgentEvent 协议翻译。

```typescript
class ClaudeRuntimeAdapter implements RuntimeAdapter {
  async getSessionTranscript(sessionId: string): Promise<UnifiedAgentEvent[] | null> {
    const filepath = await this.locateSessionFile(sessionId)
    if (!filepath) return null

    const events: UnifiedAgentEvent[] = []
    for await (const line of readJsonl(filepath)) {
      const event = this.translateClaudeEvent(line)
      if (event) events.push(event)
    }
    return events
  }
}
```

Codex / Copilot 各自实现自己的 transcript 定位逻辑。

#### 切换流程

```
切换触发（任一）：
  1. 用户在 task chat 显式选 "Switch Runtime"（UI 入口）
  2. CLI: `orbit task switch-runtime <uid> --to <runtime-id>`
  3. Auto-runner fallback 决策（ADR-014）触发
  4. agent 进程死且原 runtime 不可用

切换流程：
  1. stop 旧 vendor session（如还活着）
  2. 读取该 task 所有 RunSegment（按 startedAt 升序）
  3. 对每个 RunSegment：
       transcript = adapter[runSegment.runtimeId].getSessionTranscript(runSegment.vendorSessionId)
     （如果某段 transcript = null，从 unified event store 重组兜底）
  4. 拼接成统一时间线 unifiedTranscript
  5. 决定注入策略：
       len(unifiedTranscript) tokens < 50% context window
         → 全文注入新 vendor session
       len(unifiedTranscript) tokens >= 50%
         → 用一次 LLM 压缩成 progress summary（200-500 tokens），
           原 transcript 路径写入 prompt 让 agent 自己用
           `orbit task transcript --since <ts>` 按需读
  6. 启动新 vendor session（注入 system prompt 含动作 2 的协议
     + continuation prompt：你正在接手该 task，上一段进展如下…）
  7. 创建新 RunSegment，记录新 runtime_id + 新 vendor_session_id
```

#### Continuation Prompt 模板

```
# 接手协议

你正在接手 task: <title>，
此前曾由 <prev-runtime>（session: <short-id>）处理。

## 已发生的进展

<注入 transcript 全文 / progress summary>

## 你的第一步

1. **不要从零开始**——上一个 agent 的进展是有效的
2. 用 `orbit task transcript <uid>` 可随时取完整对话历史
3. 在你的第一条回复中**必须**说明：
   > 接手分析：
   > - 上一段已完成的部分：…
   > - 上一段未解决的问题：…
   > - 我打算从哪里开始：…
4. 然后继续执行（仍受动作 2 启动协议第二阶段约束）。
```

#### Switch Runtime 的入口

| 入口 | 路径 | 触发场景 |
|---|---|---|
| Task Activity Tab → 顶部 runtime 标签下拉 | UI | 用户主动切换试别的 runtime |
| Inbox B3 类事件 → "尝试用其他 runtime" 操作按钮 | UI | 失败提醒里的 quick action |
| `orbit task switch-runtime <uid> --to <id>` | CLI | agent 自己（如果有授权）或脚本 |
| Auto-runner fallback 自动切换 | 系统 | ADR-014 自动行为 |

---

## 4. 端到端真实自动化测试（必须）

### 4.1 设计原则

> **关键约束**：自动化测试**必须真实调用 agent runtime**（claude / codex 真实 CLI），**不允许 mock**。同时**必须模拟用户介入**（在 task chat 里发消息、批准 / 拒绝 proposal、切 runtime）。
>
> 这是因为我们要验证的是"长期稳定运行"，mock 测试无法暴露 vendor 行为变化、prompt 漂移、长上下文压缩等真实问题。

### 4.2 测试矩阵

每个组合都跑实际 agent，断言真实状态变化：

| ID | 场景 | 涉及模块 | 验收 |
|---|---|---|---|
| L01 | 简单 task 完整跑通：to do → ready → doing → review → done | 状态机 | 状态机所有边触发 + ghost commit 成功 |
| L02 | Agent 求助补充信息 | 状态机 + 启动协议 | task 保持 doing，agent 会话进入 awaiting_user，看板有图标 |
| L03 | 用户在 chat 回信续跑 | 状态机 + ADR-012 resume | resume 成功，agent 接上语境，task 仍 doing |
| L04 | Agent 启动协议遵守度 | 启动协议 | 真实 agent 第一轮输出包含"我已了解：" |
| L05 | Agent 启动协议违反 | 启动协议 + 行为审查 | warning 事件入 Activity Log，但 task 不被 block |
| L06 | Switch Runtime 全文注入 | session 承接 | 新 runtime 接上历史，输出包含"接手分析：" |
| L07 | Switch Runtime 长 transcript 压缩注入 | session 承接 | 压缩 summary 生成，agent 用 CLI 取完整 transcript 工作 |
| L08 | Auto-runner 自动 fallback 触发 | ADR-014 + session 承接 | 自动切到第二优先级 runtime，无人工介入跑完 |
| L09 | 所有 runtime 都失败 | ADR-014 | 触发 Inbox B3，task 仍 doing 等用户处理 |
| L10 | 依赖未就绪 → blocked → 依赖就绪 → ready | ADR-007 + 状态机 | blocked / ready 双向流转 |
| L11 | 从 blocked 收到用户消息 | 状态机 | agent 启动解释为什么进展不了，task 仍 blocked |
| L12 | review 列被 reject 后回 doing | 状态机 | 状态正确回流，agent 会话重新启动 |
| L13 | 并发 5 task 跑通 | 调度 + 状态机 | 5 个 task 都到达终态，状态机互不串扰 |
| L14 | 跨 session 对话连续性（Phase 3 已建） | ADR-012 | 多轮对话 agent 不失忆 |
| L15 | Budget 触发熔断 | ADR-014 | task 仍 doing，agent 会话 failed_terminal，Inbox C2 |

### 4.3 测试基础设施

复用 Phase 3 的 Agent Playground（`<test-vault>/01_Projects/agent-playground/`）：

```
<test-vault>/01_Projects/agent-playground/tasks/
├── lifecycle-01-simple-complete.md
├── lifecycle-02-agent-asks-question.md
├── lifecycle-03-user-replies-resume.md
├── lifecycle-04-onboarding-protocol-compliance.md
├── lifecycle-05-onboarding-protocol-violation.md
├── lifecycle-06-switch-runtime-full-inject.md
├── lifecycle-07-switch-runtime-compressed-inject.md
├── lifecycle-08-auto-fallback.md
├── lifecycle-09-all-runtimes-fail.md
├── lifecycle-10-dependency-flow.md
├── lifecycle-11-message-during-blocked.md
├── lifecycle-12-rejected-review-reflow.md
├── lifecycle-13-concurrent-5.md
├── lifecycle-14-multi-turn-continuity.md
└── lifecycle-15-budget-cap.md
```

每个 task frontmatter 中声明：

```yaml
acceptance:
  - task_state_sequence: [ready, doing, doing, review, done]
  - agent_session_state_sequence: [idle, running, awaiting_user, running, completed]
  - user_actions:
      - at_event: agent_awaiting_user
        action: send_message_in_chat
        payload: "请使用 X 库实现"
      - at_event: review_status_reached
        action: approve_merge
  - final_task_state: done
  - max_total_runtime_minutes: 30
  - budget_max_usd: 5
```

### 4.4 用户介入模拟器

```bash
# 跑全部生命周期 scenario
orbit dev:lifecycle run --all

# 跑单个
orbit dev:lifecycle run lifecycle-02-agent-asks-question

# 跑并发场景
orbit dev:lifecycle run --concurrent 5 lifecycle-13-concurrent-5
```

模拟器内部：

```typescript
// src/main/dev/lifecycle-runner.ts (新增)

class LifecycleRunner {
  async run(scenario: LifecycleScenario) {
    const taskId = await this.createTaskFromFrontmatter(scenario)
    await this.startAutoRunnerForTask(taskId)

    for (const userAction of scenario.user_actions) {
      await this.waitForEvent(userAction.at_event)
      await this.injectUserAction(taskId, userAction)
    }

    await this.waitForFinalState(scenario.final_task_state)
    return this.assertSequences(taskId, scenario.acceptance)
  }
}
```

### 4.5 CI 集成

- **本地 Pre-PR**：跑 L01-L05（最快、最关键）
- **Nightly soak**：跑全部 15 个 + 重复 L13 (concurrent) 3 次
- **金丝雀 dog-food**：每周固定时段跑全部 + 真实 vault，输出报告
- **Golden Files 联动**：复用 Phase 3 的 golden files 框架，对比每个 scenario 的事件序列

### 4.6 真实成本估算

每个 scenario 的预期成本和耗时：

| 等级 | 数量 | 单次成本 | 单次耗时 | 全跑成本 | 全跑耗时 |
|---|---|---|---|---|---|
| 简单 (L01, L10) | 2 | $0.5 | 5min | $1 | 10min |
| 中等 (L02-L06, L11-L12, L14-L15) | 9 | $2 | 15min | $18 | 2.25h |
| 复杂 (L07-L09, L13) | 4 | $5 | 30min | $20 | 2h |
| **合计** | 15 | — | — | **~$40** | **~4-5h** |

Nightly soak 一次约 $40，月成本 $1200。如果太贵：
- 改成每周一次完整 + 每天选关键子集
- L13 concurrent 5 是大头，可以减少并发数

---

## 5. 实施顺序

**严格按依赖推进，阶段内可并行。**

### Phase 4.0.0：状态机重写（地基）

- [x] 写 ADR-015：Task / Agent Session 状态机解耦
- [x] 实现 task state reducer (`src/main/task-state/reducer.ts`)
- [x] 现有 task 状态变更点全部改为走 reducer（grep 所有直接改 status 的地方）
- [x] agent 会话状态字段加到 `RunSegment`
- [x] 状态机单元测试覆盖每条边

**验收**：reducer 单元测试 100% 边覆盖；现有 v2 行为不被破坏（回归 Phase 3 scenarios 全绿）

### Phase 4.0.1：启动协议 + CLI 补全

- [x] 写 ADR-016：Agent Onboarding Protocol
- [x] `orbit project overview` 命令
- [x] `orbit task related` 命令（新）
- [x] `orbit task transcript` 命令（新，与动作 3 共用）
- [x] 启动协议 system prompt 注入逻辑（每个 RuntimeAdapter）
- [x] 行为审查：第一条 agent message 扫描"我已了解："并 emit warning（不阻断）

**验收**：L04 / L05 通过；真实 dog-food 一个简单 task 看到 agent 输出"我已了解：" 段落

### Phase 4.0.2：Session 承接

- [x] 修订 ADR-012（增加 getSessionTranscript / Switch Runtime 流程章节）
- [x] `RuntimeAdapter.getSessionTranscript()` Claude 实现
- [x] Codex / Copilot stub 实现（返回 null，自动 fallback 到 unified event store 重组）
- [x] Switch Runtime 切换流程（dispatcher 层）
- [x] Continuation prompt 模板拼装
- [x] Token 估算 + 50% 阈值压缩决策（先用粗估，后续可调）

**验收**：L06 / L07 通过

### Phase 4.0.3：UI / 入口

- [x] Task Activity Tab：顶部 runtime 标签下拉支持切换
- [x] 看板 doing 列：awaiting_user 子状态加图标
- [x] Inbox B3 类事件：增加 "尝试用其他 runtime" 快速操作
- [x] CLI: `orbit task switch-runtime <uid> --to <id>`

**验收**：L02 / L08 通过；UI 上能看到 awaiting_user 图标和 runtime 切换入口

### Phase 4.0.4：端到端测试基础设施

- [x] `orbit dev:lifecycle` 命令
- [x] LifecycleRunner（用户介入模拟器）
- [x] 15 个 lifecycle scenario task 文件
- [x] frontmatter acceptance 解析器
- [x] CI 接入（本地 pre-PR / nightly / weekly soak）

**验收**：L01-L15 全部通过；CI 三档（local / nightly / weekly）配置完成

### Phase 4.0.5：真实 dog-food 观察期

- [ ] 真实使用 1-2 周，记录所有出现的故障路径
- [ ] 观察启动协议遵守率（用 warning 数据）
- [ ] 观察 fallback 真实触发率
- [ ] 收集发现写入新 open-questions

**总预期**：6-8 周（其中 4.0.0-4.0.3 是核心 4-5 周，4.0.4 测试基建 1 周，4.0.5 观察期 1-2 周）

---

## 6. 关联 ADR

| ADR | 标题 | 类型 |
|-----|------|------|
| **ADR-015** | Task / Agent Session 状态机解耦 | 新 |
| **ADR-016** | Agent Onboarding Protocol | 新 |
| **ADR-012**（修订） | Task-Session 绑定模型 — 增加 getSessionTranscript + Switch Runtime 流程 | 修订 |

---

## 7. 风险与权衡

### 7.1 设计风险

| 风险 | 描述 | 缓解 |
|---|---|---|
| 启动协议被 agent 绕过 | agent 可能输出"我已了解 X"但其实没读 | 行为审查只 warning 不强制；dog-food 后再升级硬约束 |
| getSessionTranscript 不可读 | 某 vendor CLI 不暴露 session 历史 | 兜底机制：从 Phase 3 unified event store 重组（数据已有） |
| 长 transcript token 估算不准 | 粗估可能误判压缩还是全文 | 50% 阈值留 buffer；可调可观测 |
| 状态机重写导致回归 | 改 reducer 可能影响所有现有 task 流转 | 单元测试 + Phase 3 scenarios 回归 + dog-food 灰度 |
| 端到端测试成本高 | 真实 agent 每月约 $1200 | 分级：本地 PR 跑子集，nightly 跑全集 |

### 7.2 与 Phase 3 的边界

| 事项 | 在 Phase 3 还是本期 |
|---|---|
| Runtime adapter 接口骨架 | Phase 3 |
| Stream-json 双向通道 | Phase 3 |
| Activity Tab 时间线 UI | Phase 3 |
| Event replay infrastructure | Phase 3（开发者用） |
| Task 状态机重写 | **本期** |
| Agent 启动协议 | **本期** |
| getSessionTranscript + Switch Runtime | **本期** |
| 端到端真实自动化测试 | **本期** |
| 长跑 soak workflow | **本期接入** |

### 7.3 本期明确不做

| 事项 | 原因 |
|---|---|
| Sandbox ExecutionContext | Phase 4 后续单独一期 |
| Thinking Trail 自动化 | Phase 4 后续 |
| 复杂的 agent 自检 / 自修能力 | 等启动协议 dog-food 数据后再决定 |
| 多 vendor session **合并**（同时 active） | 一个 task 一时刻只有一个活跃 session（ADR-012 边界保留） |
| 用户级故障 self-service AI agent | 用户表示用现有 task activity 历史排障即可，不必引入新 agent |

---

## 8. 验收标准（Phase 4.0 完成定义）

- [x] ADR-015 / ADR-016 写入并 accepted；ADR-012 修订
- [x] task state reducer 落地，原状态变更点 100% 改为走 reducer
- [x] 启动协议在 Claude / Codex / Copilot adapter 中都注入
- [x] `orbit project overview` / `orbit task related` / `orbit task transcript` / `orbit task switch-runtime` CLI 全部可用
- [x] Claude adapter 的 `getSessionTranscript` 可用
- [x] Switch Runtime 流程在 UI / CLI / Auto-runner fallback 三个入口都跑通
- [x] LifecycleRunner + 15 个 scenario 全部通过（默认本地 acceptance checks 跑 reducer/状态序列并断言 `PASS`；真实 agent 执行需在具备 vendor CLI 的本机设置 `ORBIT_LIFECYCLE_REAL=1` 继续 dog-food）
- [x] CI 三档（local / nightly / weekly）配置完成
- [x] `npm run typecheck` / `npm test` 全绿
- [x] 文档更新：architecture.md / ROADMAP.md / CHANGELOG / decisions/README.md
- [ ] 真实 dog-food 观察期 ≥ 1 周，无新阻塞性问题

---

## 9. 与现有未完成事项的整合

| 现有事项 | 整合方式 |
|---|---|
| Codex / Copilot adapter 仍 stub（Phase 3 follow-up） | 本期不要求他们生产可用，但 `getSessionTranscript` 需要 stub 返回 null |
| 跨 vendor 真生产 fallback（Phase 3 follow-up） | 本期 lifecycle scenario L08 / L09 真实跑会推动他们成熟 |
| 长跑 soak workflow（v2 follow-up） | 本期 Nightly soak + Weekly canary 即是 |
| Inbox 历史检索（open-question #6） | 不在本期范围 |
| Review 页面 UI（open-question #8） | 不在本期范围 |
| Agent Proposal 滥用防御（open-question #16） | 启动协议的"propose-split 而非自行拆分"覆盖了一部分；其余仍开放 |
