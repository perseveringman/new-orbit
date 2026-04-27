# 阶段 1：Runtime 协议调研（Claude Code / Codex）

> **产出**：两家 runtime 事件协议对齐表 + Orbit 协议分层建议
> **时间**：2026-04-29
> **参考**：
> - Orbit 现有 `src/shared/agent-event.ts` + `src/main/agent/runner.ts` + `src/main/agent/adapter/`
> - Claude Code CLI 官方 https://code.claude.com/docs/en/cli-reference + Issue #24596
> - Codex CLI 官方 https://developers.openai.com/codex/noninteractive
> - 第三方深度博客 https://avasdream.com/blog/claude-cli-agentic-wrapper

---

## 1. 现有 Orbit `UnifiedAgentEvent` 回顾

```typescript
UNIFIED_AGENT_EVENT_KINDS = [
  'thinking',     // agent 思考过程
  'tool_use',     // agent 调用工具开始
  'tool_result',  // 工具返回
  'message',      // agent 消息
  'cost',         // token / USD 费用
  'done',         // run 完成
  'error',        // 错误
  'heartbeat'     // 心跳（定义但未用）
]

UnifiedAgentEvent {
  id, traceId, spanId, parentSpanId?, at,
  kind: UnifiedAgentEventKind,
  runtime: { provider, runtimeId?, name? },
  runId, taskId?, vendorSessionId?,
  text?, toolName?, cost?, vendorEvent?, metadata?
}
```

**观察**：
1. 已经相当业务无关——无 task/inbox/proposal 侵入
2. `taskId` 是唯一轻度耦合（可视为 metadata）
3. `heartbeat` 定义了但 Claude/Codex adapter 都没实现
4. 缺少我们可能需要的：`awaiting_user`、`interrupt`、`compact`、`partial_structured_output`

---

## 2. Claude Code CLI stream-json 协议

### 2.1 输出格式

```bash
claude -p "<prompt>" --output-format stream-json --verbose [--include-partial-messages]
```

NDJSON（每行一个 JSON 对象）。

### 2.2 事件类型清单（从代码 + 第三方博客反推）

| 原生 `type` 字段 | 语义 | Orbit 映射 |
|-----------------|------|-----------|
| `init` | 会话初始化，含 session_id + timestamp | （Orbit 不需要独立事件，session_id 进 context） |
| `message` (role=user) | 用户消息 | 不 emit（Orbit 自己管输入） |
| `message` (role=assistant) | assistant 输出 | **`message`** |
| `tool_use` / `tool_call` | 开始调用工具，含 name + input | **`tool_use`** |
| `tool_result` | 工具返回结果 | **`tool_result`** |
| `thinking` | extended thinking 输出 | **`thinking`** |
| `stream_event` (subtype=`text_delta`) | 流式文本 delta（需 `--include-partial-messages`） | **`message`** (streaming delta) |
| `stream_event` (subtype=`input_json_delta`) | 流式 tool input delta | **`tool_use`** (streaming delta) |
| `stream_event` (subtype=`message_start/stop`) | 消息边界 | （Orbit 不需要单独事件） |
| `result` / `summary` / `cost` / `usage` | 最终结果 + 费用 | **`cost`** + **`done`** |
| `error` | 错误 | **`error`** |

### 2.3 双向通道（input-format stream-json）

Claude 支持**运行中追加用户消息**：

```bash
claude -p --output-format stream-json --input-format stream-json --verbose
```

stdin 写入：
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"用户追加消息"}]}}
```

**Orbit 已经在 `runner.ts` 里实现了这个**（`sendMessage` → `writeStdin`）。

### 2.4 Resume 能力

```bash
claude -p --resume <vendorSessionId>
```

允许在新进程中继续之前的 session。**Orbit 已经在 `claude.ts` adapter 里支持**。

### 2.5 Structured Output

```bash
claude -p --output-format json --json-schema '{...}'
```

最终 response 含 `structured_output` 字段。

---

## 3. Codex CLI exec 协议

### 3.1 输出格式

```bash
codex exec --json "<prompt>"
```

JSONL（每行一个 JSON 对象）。

### 3.2 事件类型清单

| 原生 `type` 字段 | 语义 | Orbit 映射 |
|-----------------|------|-----------|
| `thread.started` | run 开始，含 thread_id | **（context）** |
| `turn.started` | 一轮对话开始 | **（无需独立事件）** |
| `turn.completed` | 一轮对话完成，含 usage | **`cost`** |
| `turn.failed` | 一轮对话失败 | **`error`** |
| `item.started` | 某个 item（命令/消息/文件）开始 | 按 item.type 分流 |
| `item.completed` | item 完成 | 按 item.type 分流 |
| `error` | 全局错误 | **`error`** |

**item.type 子类型**：
| item.type | 语义 | Orbit 映射 |
|-----------|------|-----------|
| `agent_message` | assistant 输出 | **`message`** |
| `reasoning` | 推理过程 | **`thinking`** |
| `command_execution` | bash 执行 | **`tool_use`** + **`tool_result`** |
| `file_change` | 文件修改 | **`tool_use`** (Edit tool) + **`tool_result`** |
| `mcp_tool_call` | MCP 工具调用 | **`tool_use`** + **`tool_result`** |
| `web_search` | 搜索 | **`tool_use`** + **`tool_result`** |
| `plan_update` | 计划更新 | **（可选：`thinking` 或自定义）** |

### 3.3 双向通道

Codex 的 `exec` 模式**不支持**运行中追加用户消息（one-shot）。
但支持 `resume`：

```bash
codex exec resume --last "<follow-up prompt>"
codex exec resume <SESSION_ID> "<follow-up prompt>"
```

### 3.4 Structured Output

```bash
codex exec --output-schema ./schema.json -o ./result.json
```

---

## 4. 协议对齐表

| 语义 | Claude stream-json | Codex --json | Orbit UnifiedAgentEvent | 状态 |
|------|-------------------|--------------|------------------------|------|
| **会话初始化** | `init` | `thread.started` | context.vendorSessionId | ✅ 已处理 |
| **assistant 消息** | `message (role=assistant)` | `item.completed (type=agent_message)` | `message` | ✅ |
| **思考过程** | `thinking` | `item.* (type=reasoning)` | `thinking` | ✅ |
| **工具调用开始** | `tool_use` / `tool_call` | `item.started (type=command_execution/mcp_tool_call/...)` | `tool_use` | ✅ |
| **工具返回** | `tool_result` | `item.completed (type=command_execution/...)` | `tool_result` | ✅ |
| **费用汇报** | `result.usage` / `cost` | `turn.completed.usage` | `cost` | ✅ |
| **完成** | `result (subtype=success)` | `turn.completed` (final) | `done` | ✅ |
| **错误** | `error` / `result (subtype=error)` | `turn.failed` / `error` | `error` | ✅ |
| **流式 delta** | `stream_event.text_delta` | ❌ 不支持 | 🟡 需扩展 |
| **心跳** | ❌ 无原生支持 | ❌ 无 | `heartbeat` (定义但未用) | 🟡 |
| **等待用户输入** | ❌ 无（runtime 自己阻塞 stdin） | ❌ 无 | ❌ 无 | 🔴 需新增 |
| **被打断** | ❌ 无（进程收 SIGTERM） | ❌ 无 | ❌ 无 | 🔴 需新增 |
| **对话压缩** | ❌ 无 | ❌ 无 | ❌ 无 | 🔴 需新增 |
| **结构化输出** | `structured_output` 字段 | `--output-schema` 写文件 | ❌ 无 | 🔴 需新增 |
| **文件变更** | ❌ tool_result 内嵌 | `item.* (type=file_change)` | tool_result 内嵌 | 🟡 可选升格 |
| **计划更新** | ❌ 无 | `item.* (type=plan_update)` | ❌ 无 | 🟡 可选新增 |

---

## 5. Orbit 协议分层建议

基于上表，建议 Orbit 的 chat ↔ runtime 协议分三层：

### 5.1 Core（两家都有，必须支持）

| kind | 描述 |
|------|------|
| `message` | assistant 输出（支持 streaming delta） |
| `thinking` | 推理/思考过程 |
| `tool_use` | 工具调用开始 |
| `tool_result` | 工具返回 |
| `cost` | 费用汇报 |
| `done` | 完成 |
| `error` | 错误 |

这 7 种是**最小完备集**。任何 runtime adapter 必须把原生事件映射到这 7 种之一。

### 5.2 Capability-Gated（能力声明决定是否渲染）

| kind | 描述 | capability flag |
|------|------|-----------------|
| `heartbeat` | 心跳（adapter 人工注入） | `supportsHeartbeat` |
| `file_change` | 文件变更（可选从 tool_result 升格） | `supportsFileChangeEvents` |
| `plan_update` | 计划更新 | `supportsPlanUpdates` |
| `partial_structured_output` | 结构化输出流式预览 | `supportsStructuredOutput` |

这些事件的存在与否由 `RuntimeAdapterCapabilities` 声明。Chat 渲染层检查 capability flag 决定 UI 行为。

### 5.3 Orbit-Level Extensions（两家都没有，Orbit 自己定义）

| kind | 描述 | 注入方式 |
|------|------|---------|
| `awaiting_user` | runtime 等待用户输入（用于 stdin 交互场景） | adapter 在检测到 stdin 阻塞时注入 |
| `interrupt` | 被用户/系统打断 | adapter 在收到 stop() 调用时注入 |
| `compact` | 对话上下文被压缩 | Ask-Anywhere 在做 context truncation 时注入 |
| `session_resume` | 从 vendorSessionId 恢复 | adapter 在 resume 时注入 |
| `budget_warn` | 接近费用上限警告 | Orbit 层在 cost 事件后检查 budget 阈值时注入 |
| `budget_halt` | 达到费用上限停止 | Orbit 层在触发 budget block 时注入 |

这些事件**完全由 Orbit 定义**，不依赖 vendor。Adapter 或 Orbit 上层在适当时机注入。

---

## 6. 与决策锚点的关联

| 决策 | 本阶段发现的支撑 |
|------|-----------------|
| **D-1** Ask-Anywhere 是规划者代理 | Ask-Anywhere 需要 `awaiting_user` / `interrupt` / `compact` 这些 Orbit-level 扩展来实现深度助手 UX |
| **D-3** Channel 只对接 Ask-Anywhere | 协议三层结构确保 Channel 入站消息经 Ask-Anywhere 处理后产生的事件全部用统一协议表达 |
| **D-5** Conversation 一等公民 | Conversation 存储的 turns 就是 UnifiedAgentEvent 序列，协议简洁意味着存储简洁 |
| **D-7** Runtime 不假设外部进程 | Extensions 层的事件由 Orbit 注入，不依赖 vendor stdin/stdout 协议，未来内置 runtime 同样可以注入 |

---

## 7. 遗留问题（待阶段 2/3 回答）

1. **streaming delta 如何表示？** 目前 `message` 事件的 `text` 字段是累积还是增量？建议：增量 + `metadata.streaming: true` 标记
2. **tool_use 与 tool_result 的 span 关联？** 建议：tool_use 创建 spanId，tool_result 用 parentSpanId 引用
3. **plan_update 是否升格为 core？** 如果 Ask-Anywhere 的规划能力需要向用户展示"规划修订"，就需要
4. **awaiting_user 的检测时机？** Claude stream-json 双向模式下，如何判断"runtime 在等用户输入"？—— 可能需要超时推断 + heartbeat 注入

---

## 8. 下一步

- [x] 本文档完成 ✅
- [ ] 阶段 2：AppBus 设计（日志式 vs 消息式 + 事件 schema 强类型化）
- [ ] 阶段 3：Chat ↔ Runtime 协议定稿（基于本文 §5 三层结构）
