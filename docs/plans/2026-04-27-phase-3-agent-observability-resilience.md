---
title: "Phase 3 — Agent Observability & Resilience"
status: completed
date: 2026-04-27
adr: ADR-011, ADR-012, ADR-013, ADR-014
supersedes: null
phase: 3
---

# Phase 3 — Agent Observability & Resilience

> **代号**：v2.1 — "让 agent 真正跑得起来"
>
> **核心命题**：把 v2 搭好的骨架，升级成真正能支撑"同时跑 20-30 个任务且都跑下来"的生产级体验。
>
> **前置条件**：v2 全部 completed（10 ADR + 8 plan 已落地）
>
> **预期产出**：4 份新 ADR（011-014）+ 6-8 份子 plan + 代码改动 + Dashboard 重做

---

## 1. 问题陈述

### 1.1 v2 的成就与不足

v2 完成了 Orbit 的骨架重建：Night Shift → Auto-runner、无授权 → propose-approve、无依赖 → 拓扑调度、MCP → CLI-first、无事件 → Activity Log、无 Capture → Feed/Library/Thoughts。

**但 v2 的骨架是"能跑"而不是"跑得好"**。实际 dog-food 暴露了三个核心症状：

### 1.2 三大症状

| 症状 | 表现 | 用户感受 |
|------|------|---------|
| **突然渲染** | Task chat 的 agent 回复是一次性整块出现，没有打字机效果，没有 markdown 实时渲染 | 不知道 agent 是在运行还是挂了 |
| **黑盒执行** | 只能看到 agent 的文本回复，看不到 tool_use/tool_result/thinking 过程 | 不信任 agent 在做什么 |
| **Resume 断裂** | 继续对话没有用 `--resume`，每次都是新进程、新上下文 | agent 失忆，重复理解任务 |

### 1.3 根因分析

三个症状的**共同根因**：v1 时代把 agent 执行当成"有输入有输出的黑盒批处理作业"（Night Shift 的遗产），v2 换了执行模型但**数据流没跟着换**。

具体来说：

- **One-shot 执行模式**：`runner.ts` 的 `inputMode` 默认 `'one-shot'`，agent 进程启动 → 吃一个 prompt → 跑完退出。新消息 = 杀老进程启新的
- **未贯通的 Runtime 抽象**：`LocalRuntimeManager` 已有 `RuntimeDescriptor` + `capabilities`，但 runner/dispatch/conversation/UI 层**没基于这个抽象编程**，硬编码了 Claude 的行为
- **Stream-json 事件未流到 UI**：runner 能识别 tool_use/tool_result/thinking 事件，但 `conversation.ts` 的 `summarizeEvents` 只取文本，渲染层只收到文字

---

## 2. 核心目标

**系统不限任务数，用户注意力是唯一瓶颈。** 具体来说：

1. 用户随时能看到 agent 在想什么、在做什么、卡在哪（**可观察性**）
2. 对话能真正接上，agent 不失忆、会话不重启（**延续性**）
3. 20-30 个并发 task 能稳定跑完，失败能自愈，预算能控住（**弹性**）
4. 全链路事件可追踪、可回放、可排查（**可调试性**）
5. Dashboard 一眼看到知识增长、思考轨迹、系统健康（**全局感知**）

---

## 3. 五大支柱

### 3.0 Runtime 抽象贯通（P0 地基）

> 详见 ADR-011

**现状**：`LocalRuntimeManager` 已有 RuntimeDescriptor + capabilities 模型，支持 claude/codex/gemini/opencode 四种 runtime 的发现和注册。每个 runtime 声明了 `supportsResume`、`supportsHooks`、`supportsBackgroundRuns`、`maxConcurrent` 等能力。

**问题**：下游（runner / dispatch / conversation / UI）没有基于这个抽象编程，硬编码了 Claude 的 stream-json 格式、命令行参数、退出码含义。

**目标**：
- 定义**通用 Agent Event 协议**——统一事件类型（thinking/tool_use/tool_result/message/cost/done/error）
- 每个 runtime 提供 **adapter**，负责把 vendor 原生事件翻译成通用协议
- 前端只认通用协议，不知道底下是哪个 vendor
- Resume / Stream / Fallback 都在通用接口上定义

### 3.1 可观察性（Observability）

> UI 改造参照 BoxAI 的事件时间线交互

**Task 详情页改造**：
- 保留 **Detail tab**（task.md 的阅读/编辑视图）
- Chat tab 改名为 **Activity tab**，重做为**事件时间线**
- 时间线中用户消息、agent 思考、工具调用、工具结果、agent 回复按时间顺序流式渲染

**事件渲染范式**：

| 事件类型 | 展示方式 |
|---------|---------|
| **user message** | 正常的用户气泡 |
| **thinking** | 可折叠，默认显示第一行摘要 + 耗时（如 "> 分析 stream-json 事件映射 4.9s"），可点开看全文 |
| **tool_use** | 图标 + 一句话描述 + 耗时（如 "✓ 读取 runner.ts 前 100 行 3.6s"） |
| **tool_result** | 只显示 ✓/✗ 状态，内容可点开看 |
| **assistant message** | **打字机效果 + 实时 markdown 渲染**（不是先出纯文本再渲染） |
| **cost** | 小字实时累积显示 |
| **error** | 红色标注 + 错误摘要 |
| **done** | 执行完成标记 + 总耗时 + 总 cost |

**关键约束**：markdown 在打字机流动时就应该实时渲染成格式化后的样子，不允许先出带 markdown 语法的纯文本再切换。

### 3.2 延续性（Continuity）

> 详见 ADR-012

**Task-Session 绑定模型**：
- 一个 task 对应一个长期 vendor session
- 后续对话使用各 runtime 的原生 resume 能力（Claude 的 `--resume <sessionId>`，Codex 的等价命令）
- Resume 语义抽象到通用协议中：前端调用 `resume(taskId)`，runtime adapter 翻译成各家的 resume 命令
- 一个 task 只绑一个 session，除非用户显式 "reset"

**Stream-json 双向通道**：
- 启用 `input-format: stream-json` + `output-format: stream-json`
- 允许"agent 跑的时候用户发补充消息"，不用杀进程重启
- 分阶段开：先做输出方向（只读），调试稳定后再开输入方向（双向）

### 3.3 弹性（Resilience）

> 详见 ADR-014

**Runtime Fallback 策略**：

```
Agent 进程事件监听：
  ├── process alive + emitting events          → 不切，让它继续
  ├── process alive + 沉默 > 15 分钟（卡死）     → kill + fallback
  ├── process exited with code = 0              → 正常完成
  ├── process exited + 可重试错误               → 由 runtime 内部处理
  │   （runtime 自己会重试和压缩续跑）
  └── process exited + 不可重试错误             → 切到下一个 runtime
        └── 不可重试错类型（由 runtime adapter 声明）：
             - rate limit / quota exceeded
             - authentication failure
             - invalid API key
             - model not available
             - billing error
```

**关键洞察**：只要 agent 自己还在运行、没有停下来，Orbit 就不干预。Orbit 只在"agent 停下来了"的时刻做 fallback 决策。每个 runtime adapter 声明自己的可重试和不可重试错误列表。

**Fallback 优先级**：Claude → Codex → Copilot → 全失败 → Inbox 告警

**卡死检测**：
- 默认 15 分钟无新事件视为卡死
- 可在 Settings 中配置（`autoRunner.staleTimeoutMinutes`）
- 卡死时 kill 进程 → 尝试下一个 runtime

**Budget 限制**：
- 每个 task 默认限 $20
- 可在 Settings 中配置默认值（`autoRunner.defaultBudgetPerTask`）
- 可在 task frontmatter 中 override（`budget_limit: 50`）
- 超预算自动停止该 task + emit Inbox 告警事件

### 3.4 全链路事件回放（Event Replay）

> 详见 ADR-013

**Orbit 需要一个全链路事件回放系统。** Phase 3 做完整版。

**现状**：Orbit 有三套独立的事件系统：
1. Activity Log（`.orbit/activity/*.ndjson`）—— 业务事件
2. Agent Events（runner ring buffer）—— agent 执行事件
3. Inbox Events —— 消息事件

各自独立、格式各异、无法跨层关联。

**目标架构**：

```
统一事件总线
├── trace_id / span_id 关联 —— 跨层可追踪
├── 统一 NDJSON schema —— 所有事件源写入同一格式
├── 三层事件录像
│   ├── raw-vendor-events.ndjson      # runtime 原生事件
│   ├── abstract-events.ndjson        # adapter 翻译后的通用事件
│   └── ui-render-events.ndjson       # 渲染到 UI 的最终事件
├── Developer Console 页面
│   ├── 完整事件流时间轴
│   ├── 按 trace_id 过滤
│   ├── 按事件类型/来源过滤
│   └── Playback mode（回放一段历史）
└── Golden Files 回归基线
    └── 常见场景的"好状态"快照，回归测试用
```

**问题发生时的排查路径**：
- raw 缺 tool_use → vendor 根本没发（不是 Orbit 的 bug）
- raw 有但 abstract 没有 → adapter 翻译丢了
- abstract 有但 ui 没有 → 渲染链路问题

### 3.5 全局 Dashboard 重做

**Dashboard 不再只是 v1 的简单信息展示，而是 Orbit 作为完整 AI 工作台的"运营总览"。**

Phase 3 重点做象限 3/4/5（象限 1 在 Inbox 已有，象限 2 可在项目看板看）：

#### 象限 3：我的知识在增长（Capture 资产）
- 本周 Capture 入库量（Feed saved / Library 新增 / Thoughts 新增）
- Library → Resource promote 数
- Thoughts → Project promote 数
- 活跃项目数 / 归档项目数

#### 象限 4：我的思考轨迹（回顾）
- Daily Review 入口（今天、昨天、本周）
- 最近 Thinking Trail 片段
- Activity Log 时间轴预览
- Vision 更新提醒（距上次 review X 天）

#### 象限 5：系统健康（底层）
- Disk 使用（vault 大小 / worktree 占用）
- Git status overview（有多少项目有未 commit 变更）
- Runtime discovery 状态（各 runtime 在线/离线/limit）
- Budget 使用情况（今日累计 / 本月累计）

#### 象限 1（辅助展示）：待我处理
- Inbox 未处理 messages 汇总（跳转到 Inbox）
- Pending proposals 数
- Blocked tasks 数

#### 象限 2（辅助展示）：Agent 进行中
- 当前 doing tasks 跨项目汇总
- 每个 doing task 的 agent 实时状态摘要
- 今日累计 agent cost

**设计约束**：
- 固定布局（不做可配置 widget），避免过度复杂
- 每个卡片可点击跳转到对应详情页
- 密度适中，不做 Jira 风格的满屏数据

---

## 4. Phase 0 — 调试基础设施（先于代码改动）

**Phase 0 是整个 Phase 3 的前置条件。** 不建立调试基础设施就改代码，等于盲人摸象。

### 4.1 Agent Playground 专属测试项目

```
<test-vault>/01_Projects/agent-playground/
├── README.md                        # 说明这是调试用项目
├── AGENT.md                         # agent 上下文
└── tasks/
    ├── scenario-01-simple-chat.md          # 纯文本对话
    ├── scenario-02-single-tool.md          # 一个工具调用
    ├── scenario-03-multi-tool.md           # 多工具串联
    ├── scenario-04-long-thinking.md        # 触发长 thinking
    ├── scenario-05-resume.md               # 跑到一半停掉再续跑
    ├── scenario-06-error-recovery.md       # 触发 API 错走 fallback
    ├── scenario-07-concurrent-3.md         # 并发 3 个 task
    ├── scenario-08-budget-limit.md         # 无限循环触发预算熔断
    └── scenario-09-long-context.md         # 长上下文触发压缩
```

### 4.2 自动化 Scenario Harness

```bash
# 一键跑全部 scenario
orbit dev:agent-scenarios run --all

# 跑单个
orbit dev:agent-scenarios run scenario-03-multi-tool

# 并发跑 3 个
orbit dev:agent-scenarios run --concurrent 3 scenario-01 scenario-02 scenario-03
```

每个 scenario 的验收标准写在 task frontmatter 里：

```yaml
acceptance:
  - event_sequence_matches: [user_msg, thinking, tool_use, tool_result, assistant_msg, done]
  - markdown_render_live: true
  - final_status: done
  - budget_max_usd: 5
```

### 4.3 三层事件录像

每次 scenario 跑的时候，录三份 NDJSON：

```
.orbit/playground/<scenario-id>/
├── raw-vendor-events.ndjson       # runtime 原生事件
├── abstract-events.ndjson         # adapter 翻译后的通用事件
└── ui-render-events.ndjson        # 渲染到 UI 的最终事件
```

### 4.4 Golden Files 回归基线

第一次跑通的"好状态" snapshot 存起来。后续每次改代码前跑一遍，如果和基线差异太大（事件数差 20%、或某类事件消失）立刻报警。

---

## 5. Runtime 抽象层接口草案

### 5.1 现状盘点

已有：
- `RuntimeDescriptor`：id / name / version / binary path
- `RuntimeCapabilities`：supportsResume / supportsHooks / supportsBackgroundRuns / maxConcurrent
- `LocalRuntimeManager`：发现、探测、注册、UI 展示

缺失：
- **通用 Agent Event 协议**（事件类型统一定义）
- **通用 Resume 接口**（各 runtime 的 resume 命令翻译）
- **通用双向 Stream 接口**（stdin/stdout 通道抽象）
- **Runtime Adapter 接口**（vendor → 通用事件的翻译器）
- **Fallback 决策引擎**（基于进程状态的自动切换）
- **Budget 介入点**（在通用事件流中检测 cost 并熔断）

### 5.2 通用 Agent Event 协议

```typescript
type AgentEventKind =
  | 'thinking'      // agent 内部思考
  | 'tool_use'      // 工具调用（名称 + 参数摘要）
  | 'tool_result'   // 工具结果（成功/失败 + 摘要）
  | 'message'       // agent 文本输出（流式）
  | 'cost'          // 费用更新
  | 'error'         // 错误
  | 'done'          // 执行完成
  | 'heartbeat'     // 心跳（用于卡死检测）

interface AgentEvent {
  kind: AgentEventKind
  timestamp: number
  trace_id: string          // 跨层关联 ID
  span_id: string           // 当前事件 span
  parent_span_id?: string   // 父事件（如 tool_use 的 parent 是某个 thinking）
  runtime_id: string        // 哪个 runtime 产生的
  task_id: string           // 关联 task
  run_id: string            // 关联 run

  // 按 kind 不同填充
  text?: string             // message / thinking 的文本内容
  tool_name?: string        // tool_use 的工具名
  tool_input_summary?: string  // tool_use 的参数摘要
  tool_success?: boolean    // tool_result 的成功/失败
  tool_output_summary?: string // tool_result 的摘要
  cost_usd?: number         // cost 事件的费用
  error_code?: string       // error 事件的错误码
  error_message?: string    // error 事件的消息
  is_retryable?: boolean    // error 是否可重试
  duration_ms?: number      // 耗时
}
```

### 5.3 通用 Resume 接口

```typescript
interface RuntimeAdapter {
  /** 启动新 session */
  startSession(taskId: string, prompt: string, options: RunOptions): AsyncIterable<AgentEvent>

  /** 恢复已有 session */
  resumeSession(taskId: string, sessionId: string, message: string): AsyncIterable<AgentEvent>

  /** 向正在运行的 session 发送消息（双向 stream） */
  sendMessage(sessionId: string, message: string): Promise<void>

  /** 停止 session */
  stopSession(sessionId: string): Promise<void>

  /** 获取 vendor session ID 用于持久化 */
  getVendorSessionId(sessionId: string): string

  /** 声明不可重试错误类型 */
  getNonRetryableErrors(): string[]
}
```

### 5.4 Fallback 决策引擎

```typescript
interface FallbackEngine {
  /** 注册 runtime 优先级列表 */
  setRuntimePriority(runtimes: string[]): void

  /** 当 runtime 失败时决定下一步 */
  onRuntimeFailure(runtimeId: string, error: AgentEvent): FallbackDecision

  /** 当 runtime 心跳超时时决定下一步 */
  onStaleTimeout(runtimeId: string, lastEventAge: number): FallbackDecision
}

type FallbackDecision =
  | { action: 'retry_same' }
  | { action: 'switch_runtime'; nextRuntime: string }
  | { action: 'give_up'; reason: string }  // 所有 runtime 都失败
```

### 5.5 Budget 介入点

Budget 检查在通用事件流中进行：

```
AgentEvent(kind: 'cost') → BudgetGate 检查
  ├── 未超限 → 继续
  ├── 接近限额（80%）→ emit warning event
  └── 超限 → stopSession + emit Inbox 告警
```

---

## 6. UI 改造详细设计

### 6.1 Task 详情页结构

```
┌──────────────────────────────────────────────────┐
│  Task: <标题>                     [Detail] [Activity]
├──────────────────────────────────────────────────┤
│                                                  │
│  [Detail tab]                                    │
│  task.md 的阅读 + 编辑视图                        │
│  frontmatter structured editor                   │
│  markdown 正文渲染                                │
│                                                  │
│  ----- 或 -----                                  │
│                                                  │
│  [Activity tab]                                  │
│  事件时间线（下面详细描述）                         │
│                                                  │
│  ┌─ 用户消息 ─────────────────────────────────┐  │
│  │ "请帮我重构这个模块"                         │  │
│  └─────────────────────────────────────────────┘  │
│                                                  │
│  > 分析代码结构和依赖关系  4.9s              ▸    │
│                                                  │
│  ✓ 读取 src/main/runner.ts 前 100 行  3.6s  ▸    │
│  ✓ 搜索 resume 相关引用  2.2s               ▸    │
│  ✗ 写入 src/main/runner.ts 失败  0.3s       ▸    │
│                                                  │
│  ┌─ Assistant ─────────────────────────────────┐  │
│  │ 我发现 `runner.ts` 的写入权限有问题...       │  │
│  │ (打字机效果 + 实时 markdown 渲染)            │  │
│  └─────────────────────────────────────────────┘  │
│                                                  │
│  $0.42 · 38s · claude-sonnet                     │
│                                                  │
│  ┌─ 输入框 ──────────────────────── [发送] ──┐  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 6.2 时间线事件卡片设计

**Thinking 卡片**：
```
> {第一行内容摘要}  {耗时}s               ▸
```
- 默认折叠，显示 thinking 内容的第一行 + 耗时
- 点击 ▸ 展开全文
- 图标用 `>` 或 `⠿`

**Tool Use 卡片**：
```
✓ {工具名}: {参数摘要}  {耗时}s            ▸
```
- 默认显示工具名 + 参数摘要 + 耗时
- 成功用 ✓（绿色），失败用 ✗（红色）
- 点击 ▸ 展开工具输入/输出详情

**Assistant Message**：
- 打字机效果（逐字符/逐 token 流式渲染）
- **实时 markdown 渲染**：流入的 token 立即渲染为格式化 markdown
- 代码块、标题、列表、链接等在打字过程中就应该呈现最终样式

### 6.3 Runtime 页展示增强

在 Workspace 的 Runtime 页面增加：
- 每个 runtime 的 capabilities 可视化（resume ✓ / hooks ✓ / background ✓）
- 当前活跃 session 数 / 最大并发
- Fallback 状态（primary / fallback-active / unavailable）
- 最近错误日志（最近 5 条）

---

## 7. 实施顺序

**严格按依赖顺序推进，阶段内可并行，阶段之间不可跳跃。**

### Phase 3.0：调试基础设施（1 周）

- [ ] 创建 Agent Playground 专属测试项目
- [ ] 实现 scenario harness（`orbit dev:agent-scenarios`）
- [ ] 实现三层事件录像（NDJSON 写入）
- [ ] 建立统一事件总线 schema（trace_id / span_id）
- [ ] 建立 Golden Files 回归基线框架

**验收**：能跑通 scenario-01（纯文本对话），事件三层录像有输出。

### Phase 3.1：Runtime 抽象贯通（2 周）

- [ ] 定义通用 AgentEvent 协议（TypeScript interface）
- [ ] 定义 RuntimeAdapter 接口
- [ ] 实现 Claude adapter（stream-json → AgentEvent）
- [ ] 实现 Codex adapter（stub，基于 capabilities）
- [ ] 实现 Copilot adapter（stub，基于 capabilities）
- [ ] 改造 runner.ts：从直接调 Claude CLI → 通过 adapter 调用
- [ ] 改造 dispatch.ts：使用通用 resume 接口
- [ ] 实现 Fallback 决策引擎
- [ ] 实现 Budget 在通用事件流中的检查

**验收**：scenario-01 ~ 03 通过 Claude adapter 跑通；scenario-06 触发 fallback（mock 错误）；scenario-08 触发 budget 熔断。

### Phase 3.2：可观察性 UI（2 周）

- [ ] Task 详情页 Chat tab → Activity tab 改造
- [ ] 事件时间线渲染组件（thinking / tool_use / tool_result / message）
- [ ] 打字机效果 + 实时 markdown 渲染
- [ ] Tool use 可折叠卡片组件
- [ ] Thinking 可折叠卡片组件
- [ ] Cost 实时累积显示
- [ ] Runtime 页 capabilities 可视化

**验收**：所有 9 个 scenario 在 UI 上有正确的时间线渲染；打字机效果流畅；markdown 实时渲染无抖动。

### Phase 3.3：延续性（1 周）

- [ ] Task-Session 绑定实现（一个 task 一个长期 session）
- [ ] 通用 resume 调用链路贯通
- [ ] 双向 stream-json 输出方向实现
- [ ] 双向 stream-json 输入方向实现（"agent 跑的时候用户追加消息"）
- [ ] Session reset 功能

**验收**：scenario-05（resume）跑通；用户能在 agent 运行中追加消息且 agent 能看到。

### Phase 3.4：全链路事件回放（2 周）

- [ ] 统一事件总线实现（所有事件源接入）
- [ ] Activity Log 事件接入统一总线
- [ ] Agent Events 接入统一总线
- [ ] Inbox Events 接入统一总线
- [ ] IPC 事件接入统一总线
- [ ] Developer Console 页面
  - [ ] 完整事件流时间轴
  - [ ] 按 trace_id 过滤
  - [ ] 按事件类型/来源过滤
  - [ ] Playback mode（回放历史）
- [ ] 回归测试：Golden Files 比对自动化

**验收**：Developer Console 能展示完整的跨层事件流；选一个 trace_id 能追踪从用户点击到 agent 执行到 Inbox 通知的全链路。

### Phase 3.5：Global Dashboard 重做（1 周）

- [ ] Dashboard 数据源 API（象限 3/4/5 的数据聚合）
- [ ] 象限 3：知识增长卡片（Capture 入库量、promote 数、项目数）
- [ ] 象限 4：思考轨迹卡片（Daily Review 入口、Activity Log 预览、Vision 提醒）
- [ ] 象限 5：系统健康卡片（磁盘、Git、Runtime、Budget）
- [ ] 象限 1+2 辅助展示（Inbox 汇总、doing tasks 汇总）
- [ ] 卡片点击跳转

**验收**：Dashboard 五个象限都有数据展示；数据实时更新；点击跳转到对应详情页。

### Phase 3.6：收尾与观察（1 周）

- [ ] 全量 9 scenario 回归测试绿
- [ ] typecheck / lint / test 全绿
- [ ] 文档更新（architecture.md / ROADMAP.md / CHANGELOG.md）
- [ ] 真实使用 dog-food 2-4 天
- [ ] 收集 dog-food 发现写入下一轮 open-questions

**总预期**：约 10 周（AI 实施可以显著压缩）

---

## 8. 子 Plan 列表

| 子 Plan | Scope | 对应支柱 | 对应 ADR |
|---------|-------|---------|---------|
| `2026-04-27-runtime-adapter-layer.md` | RuntimeAdapter 接口 + Claude/Codex/Copilot adapters + 通用 AgentEvent 协议 | 3.0 | ADR-011 |
| `2026-04-27-task-session-binding.md` | Task-Session 绑定 + 通用 resume + 双向 stream | 3.3 | ADR-012 |
| `2026-04-27-event-replay-infrastructure.md` | 统一事件总线 + 三层录像 + Developer Console + Golden Files | 3.4 | ADR-013 |
| `2026-04-27-runtime-fallback-rules.md` | Fallback 决策引擎 + 卡死检测 + 可重试/不可重试错误声明 + Budget 介入 | 3.3 | ADR-014 |
| `2026-04-27-activity-timeline-ui.md` | Activity tab + 时间线渲染 + 打字机 + 实时 markdown | 3.1 | — |
| `2026-04-27-agent-playground.md` | Playground 测试项目 + scenario harness + 自动化测试 | Phase 0 | — |
| `2026-04-27-global-dashboard.md` | Dashboard 重做，5 象限，重点 3/4/5 | 3.5 | — |

---

## 9. 配套新 ADR

| ADR | 标题 | 核心决策 |
|-----|------|---------|
| **ADR-011** | Runtime 抽象贯通 — 通用 Agent Event 协议 | 把现有 RuntimeDescriptor + capabilities **贯通到执行链路每一层**，定义通用事件协议，所有下游模块面向接口编程 |
| **ADR-012** | Task-Session 绑定模型 | 一个 task 绑定一个长期 vendor session，后续对话使用各 runtime 原生 resume 能力 |
| **ADR-013** | 统一事件回放基础设施 | 全链路事件写入统一格式（trace_id 关联），支持 Developer Console 回放和 Golden Files 回归 |
| **ADR-014** | Runtime Fallback 决策规则 | 基于进程状态判断 fallback 时机（alive=不切，stopped+non-retryable=切），15 分钟卡死超时，per-task budget |

---

## 10. 本期明确不做

| 事项 | 原因 |
|------|------|
| Agent 内部错误分类/自愈 | 由各 runtime 各自处理（Claude/Codex/Copilot 内部有重试/压缩/续跑） |
| Inbox 淹没策略 | 等真正淹没再加，不预设 |
| 任务数系统硬限制 | 系统不限，靠用户注意力自限 |
| Sandbox ExecutionContext | Phase 4 |
| Thinking Trail 自动化 | Phase 4 |
| 对话沉淀 → 项目 | Phase 4 |
| Capture 多入口 | Phase 4 |
| Dashboard 可配置 widget | 固定布局，避免过度复杂 |

---

## 11. Phase 4 预告

以下内容将在 Phase 3 完成后作为 Phase 4 规划：

| 方向 | 说明 |
|------|------|
| **Sandbox ExecutionContext** | 非代码项目（research / writing）的执行环境，补齐功能断层 |
| **Thinking Trail 自动化** | 每次 chat session 自动留痕、关键认知跃迁自动识别 |
| **对话沉淀 → 项目** | 从 Thoughts / Chat 自然沉淀识别主题集聚，agent 主动提议立项 |
| **Capture 多入口** | 剪贴板识别、Library Quick Capture、浏览器插件、手机 share、Voice Log |
| **Review 页面 UI** | Activity Log 的用户可视化（时间轴、汇总、检索） |
| **Orbit 自我进化** | Activity Log + Thinking Trail + Distillation 三向融合 |

---

## 验收标准（Phase 3 完成定义）

Phase 3 全部完成的标志：

- [ ] 9 个 Agent Playground scenario 全部通过
- [ ] Claude adapter 完整实现（stream-json → AgentEvent 全事件类型）
- [ ] Codex / Copilot adapter 至少有 stub 实现（声明 capabilities）
- [ ] Activity tab 时间线渲染完整（thinking / tool_use / tool_result / message / 打字机 + 实时 markdown）
- [ ] Task-Session 绑定 + resume 链路跑通
- [ ] Runtime fallback 在 scenario-06 触发且正确切换
- [ ] Budget 在 scenario-08 触发且正确熔断
- [ ] Developer Console 页面可用（事件流 + 过滤 + 回放）
- [ ] Dashboard 五象限数据展示完整
- [ ] Golden Files 回归测试自动化
- [ ] `npm run typecheck` / `npm test` 全绿
- [ ] 文档更新完毕（architecture.md / ROADMAP.md / CHANGELOG.md / decisions/README.md）
- [ ] 真实 dog-food 2-4 天无阻塞性问题
