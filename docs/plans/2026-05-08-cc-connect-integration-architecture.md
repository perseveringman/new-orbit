---
status: implemented
created: 2026-05-08
updated: 2026-05-08
related: ADR-017, ROADMAP Phase 8.1
---

# cc-connect 集成架构 — External Gateway 与 Orbit 域能力的联姻

> 日期：2026-05-08
> 状态：Implemented（Orbit 侧 External Gateway 已落地；cc-connect 上游内置 agent 仍按协议对接）
> 范围：External Gateway 协议、cc-connect agent 适配层、Orbit 能力暴露、流式响应模型
> 关联 ADR：ADR-017（External Gateway via cc-connect）

---

## 一、背景与动机

Orbit 在 Phase 8.1 已经落地了基于 Telegram long-polling 的 Gateway（`src/main/gateway/`）：

- `channels/telegram.ts` 单平台支持
- `router.ts` 的 `/capture /ask /summary /start` 命令解析
- `store.ts` 绑定、权限、消息历史
- `runtime.ts` 频道生命周期管理

当前 Gateway 是**为 Orbit 自建 channel 设计**的。要让 Orbit 对接更多 IM（微信、飞书、Slack、Discord、钉钉、LINE、微博……），沿用当前路径意味着**每加一个平台都要自己实现长连接、消息解析、鉴权、断线重连**——这是一个巨大的、持续性的维护负担，且与 Orbit 的核心使命无关。

与此同时，社区已经存在一个成熟的**聊天平台桥接生态** `cc-connect`（Go 实现，MIT license），它提供：

- **11+ IM 平台适配器**：Feishu、DingTalk、Slack、Telegram、Discord、WeCom、Weixin、QQ、LINE、Weibo、ShadowOB
- **10+ CLI agent 适配器**：Claude Code、Codex、Cursor、Gemini CLI、Kimi、OpenCode、iFlow、Qoder、Pi、Devin、ACP 通用
- **成熟工程能力**：stream-json 流式、权限询问、session 管理、selective compilation、i18n、Web Admin UI
- **活跃维护**：持续新增平台和 agent

**核心矛盾**：
- 全盘采用 cc-connect 会丢失 Orbit 的结构化业务能力（Ask-Anywhere、Capture、Inbox、Library、Vision 等）
- 完全自建会重复造轮子，永远追不上 cc-connect 的生态速度
- 两边并存运行（双 bot 同时处理一条消息）会引发配置地狱和消息分裂

**目标**：让 Orbit **借用 cc-connect 的传输生态**，同时**守住 Orbit 的域能力和愿景**。

---

## 二、设计原则

### 2.1 哲学原则：三层解耦

> **cc-connect 是管道（Transport），Orbit 是大脑（Domain），中间用一个瘦身的 orbit-agent 做翻译官。管道可替换，大脑要保留，翻译官保证它们不互相污染。**

```
┌─────────────────────────────────────────────────────┐
│  🌐 Transport Layer      — cc-connect (Go daemon)   │
│     负责：IM 平台收发、长连接、鉴权、流式分片        │
│     不关心：内容语义、业务逻辑                       │
└──────────────────────┬──────────────────────────────┘
                       │  External Gateway Protocol
                       │  (JSON-Lines over Unix Socket)
┌──────────────────────▼──────────────────────────────┐
│  🎭 Orchestration Layer  — orbit-agent (Go, new)    │
│     在 cc-connect 内以 agent 身份注册                │
│     把 cc-connect session 映射到 Orbit conversation  │
│     按意图分发：orbit_command / coding_task / hybrid │
└──────────────────────┬──────────────────────────────┘
                       │  IPC (Socket Stream)
┌──────────────────────▼──────────────────────────────┐
│  📚 Orbit Domain Layer   — Orbit Main Process       │
│     src/main/external-orchestrator/ (new)           │
│     复用：Ask-Anywhere / Capture / Library / Inbox   │
│              / Task / Synthesis / Memory             │
└─────────────────────────────────────────────────────┘
```

### 2.2 工程原则

1. **契约优先（Contract First）**：`external-gateway-protocol.ts` 是两边唯一的耦合点，先有契约再写实现
2. **零侵入域层（Non-invasive）**：`external-orchestrator/` 只调用现有 Orbit 服务，不修改业务逻辑
3. **协议语言无关（Wire Format Neutral）**：JSON-Lines，Go 和 Node 都能零开销解析
4. **按能力注册（Capability Registry）**：新增 Orbit 能力暴露 = 写一个 adapter 并注册，不改协议
5. **优雅降级（Graceful Fallback）**：Orbit 主进程宕机时，orbit-agent 回落到 claudecode（配置开关）
6. **愿景守住（Vision-Aligned）**：不搞"另一个 ChatGPT UI"；每个外部消息仍然落到结构化产物（Note/Thought/LibraryItem/Inbox Entry），可审计可追溯

---

## 三、核心组件

### 3.1 External Gateway Protocol（共享契约）

**文件位置**：`src/shared/external-gateway-protocol.ts`

协议基于 JSON-Lines：每行一个 JSON 对象，`\n` 分隔。

#### Inbound（cc-connect → Orbit）

```typescript
type InboundRequest =
  | {
      type: 'message.submit'
      requestId: string                    // UUID，幂等与回溯关键
      sessionId: string                    // cc-connect session（= Orbit conversation）
      user: {
        platform: string                   // 'wecom' | 'telegram' | ...
        id: string                         // 平台用户 ID
        name?: string
      }
      content: MessageContent              // text | image | file | url
      context?: { replyTo?: string }
    }
  | { type: 'message.cancel'; requestId: string }
  | { type: 'session.close'; sessionId: string }
  | { type: 'ping' }

type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; path: string; caption?: string }
  | { kind: 'file'; path: string; name: string; mime: string }
  | { kind: 'url'; url: string }
```

#### Outbound（Orbit → cc-connect）

```typescript
type OutboundEvent =
  // 1. 路由决策
  | { type: 'request.accepted'; requestId: string; routedTo: Capability }
  | { type: 'request.rejected'; requestId: string; reason: string }

  // 2. 进度事件（长任务反馈）
  | { type: 'progress'; requestId: string; stage: string; detail?: string }

  // 3. 流式文本（AI 边生成边发）
  | { type: 'text.delta'; requestId: string; text: string }

  // 4. 结构化结果
  | { type: 'artifact'; requestId: string; kind: ArtifactKind; ref: string; preview: unknown }
  | { type: 'card'; requestId: string; card: CardDefinition }
  | { type: 'file'; requestId: string; path: string; mime: string }

  // 5. 人类输入请求（权限、审批）
  | { type: 'human_input.required'; requestId: string; prompt: string; options: HumanOption[] }

  // 6. 终结事件（每个 requestId 必有一个 end）
  | { type: 'request.completed'; requestId: string; summary?: string }
  | { type: 'request.failed'; requestId: string; error: { code: string; message: string } }

  // 7. 委托（交还给其他 cc-connect agent）
  | { type: 'delegate'; requestId: string; targetAgent: string; enrichedPrompt: string; workingDirectory?: string }

  // 8. 主动推送（不与特定 requestId 绑定）
  | { type: 'notification'; target: TargetUser; content: NotificationContent }
  | { type: 'pong' }

type Capability =
  | 'ask_anywhere'
  | 'capture.thought'
  | 'capture.note'
  | 'library.save'
  | 'task.query'
  | 'inbox.review'
  | 'synthesis.run'
  | 'memory.recall'
  | 'delegate.coding_agent'

type ArtifactKind = 'note' | 'library_item' | 'task' | 'thought' | 'approval' | 'synthesis_artifact'
```

#### 协议不变量

1. 每个 `message.submit` 最终必须收到**一个**结束事件：`request.completed` / `request.failed` / `delegate`
2. 中间事件（`progress` / `text.delta` / `artifact` / `card`）可零条或多条
3. `requestId` 在 socket 连接的生命周期内唯一
4. `delegate` 是一次性移交，后续所有响应不再经过 Orbit
5. `notification` 不携带 `requestId`，由 Orbit 自发，用于定时推送

---

### 3.2 Orbit 侧：External Orchestrator（新模块）

**文件位置**：`src/main/external-orchestrator/`

```
external-orchestrator/
├── socket-server.ts          # Unix Socket 监听，JSONL 帧解析
├── intent-router.ts          # 三层意图识别（规则 → 关键词 → LLM）
├── session-bridge.ts         # cc-connect session ↔ Orbit conversation 映射
├── capability-registry.ts    # 能力注册与查找
├── capabilities/
│   ├── ask-anywhere.adapter.ts
│   ├── capture.adapter.ts
│   ├── library.adapter.ts
│   ├── task.adapter.ts
│   ├── inbox.adapter.ts
│   ├── synthesis.adapter.ts
│   ├── memory.adapter.ts
│   └── delegate.adapter.ts
├── notification-pusher.ts    # 主动推送（Daily summary 等）
└── protocol-codec.ts         # 协议编解码 + 节流
```

#### 3.2.1 Socket Server

- 路径：`<vault>/.orbit/external-gateway.sock`
- 协议：JSONL（每行一个 JSON，`\n` 分隔）
- 连接：接受多 client 并发（理论上支持多 cc-connect 实例）
- 每个连接维护：`sessions: Map<sessionId, SessionState>` + `pendingRequests: Map<requestId, AbortController>`
- 心跳：客户端每 30s 发 `ping`，Orbit 立即回 `pong`，超时 90s 判定连接死亡

#### 3.2.2 Intent Router（三层意图识别）

```
Level 1：规则匹配（0 ms，显式前缀 / URL 检测）          命中率 ~60%
  ↓ miss
Level 2：关键词分类（<5 ms，本地词典 + 历史模式）        命中率 ~20%
  ↓ miss
Level 3：LLM 分类（~500 ms，Claude Haiku / 便宜模型）    兜底 ~20%
```

规则匹配沿用现有 `gateway/router.ts` 的模式：`/capture`、`/ask`、`/summary`、`/start <code>`、裸 URL、`#` 前缀；并扩展 `/task`、`/inbox`、`/memory`、`/synthesis`。

LLM 分类 prompt 需要注入可用 Capability 清单 + 最近 3 轮对话上下文，返回：
```json
{ "capability": "...", "params": {...}, "confidence": 0.85, "reasoning": "..." }
```

#### 3.2.3 Capability Adapter 模式

每个 adapter 是一个 **AsyncGenerator**，标准签名：

```typescript
export async function* handleXxx(
  req: InboundRequest,
  params: Record<string, unknown>,
  signal: AbortSignal
): AsyncGenerator<OutboundEvent, void, unknown>
```

Adapter 的三个职责：
1. **调用现有服务**（`askAnywhereOrchestrator` / `createNoteStore` / `createLibraryService` 等）
2. **转换内部事件 → 协议事件**
3. **响应取消（signal）**

示例见第五节 End-to-End 示例。

#### 3.2.4 Session Bridge

cc-connect 的 `sessionId` 必须稳定映射到 Orbit 的 `conversationId`，否则多轮对话上下文会丢。

映射规则：
- 首次收到某个 `sessionId` → 创建新 Orbit Conversation（scope 带 `{ kind: 'external', platform, userId }`）
- 同一 `sessionId` 后续请求 → 复用同一 Conversation
- 收到 `session.close` → 归档 Conversation（不删）
- 持久化存储：`<vault>/.orbit/external-gateway/session-map.json`

这保证：
- 用户在微信里 10 天后回复前一条消息，Ask-Anywhere 能看到完整历史
- 跨设备、跨平台可以通过 `session.export` / `session.rebind` IPC 迁移（未来能力）

#### 3.2.5 Notification Pusher

主动推送场景：
- Daily Summary（每天早 8 点）
- Weekly Review 提醒
- Inbox 新审批提醒
- Auto-runner 异常告警

推送路径：
```
Orbit Scheduler → Notification Pusher → Socket.write(notification event)
                                      → cc-connect orbit-agent 收到
                                      → 查询 target → 调 platform.Reply()
```

`TargetUser` 必须包含绑定时写入的 `{ platform, userId }`。映射信息由 session-bridge 持久化。

---

### 3.3 cc-connect 侧：orbit-agent（新 Go package）

**文件位置（cc-connect 仓库）**：`agent/orbit/`

```
agent/orbit/
├── orbit.go              # 实现 core.Agent，注册 "orbit" 到 cc-connect engine
├── session.go            # 实现 core.AgentSession，管理 socket 连接
├── gateway_client.go     # Unix Socket 连接 + 重连 + 心跳
├── protocol.go           # 协议 struct（与 external-gateway-protocol.ts 对齐）
├── delegate.go           # 处理 delegate 事件 → 切换到其他 cc-connect agent
├── plugin.go             # go:build !no_orbit 构建标签
└── orbit_test.go
```

#### 关键实现点

1. **连接管理**：启动时连 Orbit socket，断开自动重连（指数退避）；如果 Orbit 连不上且配置允许 fallback，使用 cc-connect 的 `claudecode` agent 接管
2. **Session 映射**：cc-connect 给的 `session_key` 直接作为协议里的 `sessionId` 传给 Orbit
3. **事件翻译**：把协议的 `OutboundEvent` 翻译成 cc-connect 的 `core.Event`：
   - `text.delta` → `core.TextDeltaEvent`
   - `progress` → `core.StatusEvent`
   - `artifact` → `core.CardEvent`（渲染为卡片，带点击链接）
   - `human_input.required` → `core.PermissionRequestEvent`（借用 cc-connect 的权限机制）
   - `delegate` → 内部切换当前 session 的"底层 agent" 到指定目标
4. **节流**：`text.delta` 每 500ms 批量合并后再 emit（避免 IM 编辑频率超限）

#### 配置（cc-connect config.toml）

```toml
[[projects.agents]]
type = "orbit"

[projects.agents.options]
socket_path       = "/Users/xxx/vault/.orbit/external-gateway.sock"
fallback_agent    = "claudecode"   # Orbit 不可用时的兜底
auto_reconnect    = true
heartbeat_seconds = 30
throttle_delta_ms = 500
```

#### Selective Compilation 支持

沿用 cc-connect 的 `//go:build !no_orbit` 约定，用户可通过 build tag 排除：
```bash
go build -tags no_orbit ./cmd/cc-connect
```

---

## 四、关键设计决策与理由

### 4.1 为什么 orbit-agent 放在 cc-connect 内而不是外部

**决策**：新 agent 注册到 cc-connect engine，而不是在 cc-connect 外再做一层代理。

**理由**：
- 享受 cc-connect 的**会话路由 / 权限机制 / 卡片渲染 / 流式节流**，不重复实现
- 用户在 cc-connect config 里把"orbit"当普通 agent 配置即可，零心智负担
- `delegate` 能力天然可行：orbit-agent 可以指挥同一个 engine 内的 claudecode agent 接管
- 如果外挂一层代理，会失去 cc-connect 的 `/model`、`/reasoning`、`/mode`、`/memory` 等内建控制

**代价**：需要维护 Go 代码；但这是必然的，因为 cc-connect 的 agent 接口就是 Go 接口。

### 4.2 为什么选 Unix Socket + JSONL

**决策**：Unix Domain Socket + JSON-Lines 协议。

**对比**：
| 选项 | 优点 | 缺点 | 评估 |
|---|---|---|---|
| **Unix Socket + JSONL** ✅ | 快（内核直通）、无端口冲突、流式天然 | 本机限制 | Orbit 已用 cli-socket，规范一致 |
| HTTP/SSE | 跨机器、易调试、浏览器兼容 | 需端口、HTTP 开销 | 跨机器场景尚未发生，过度设计 |
| gRPC | 强类型、高效 | 两边都要 codegen、复杂度高 | 契约强约束但学习成本大 |
| MCP Protocol | 生态开放、可被第三方 AI 用 | 标准仍在演进、SDK 未普及 | **未来演进目标**，现阶段不强绑 |

选 Unix Socket 的决定性理由：**Orbit 的 main 进程和 cc-connect daemon 都在同一台机器**（用户的笔记本 / 工作台）。跨机器场景（比如用户在公司机访问家里的 Orbit）是下一阶段目标，届时可在 socket 外套一层 SSH tunnel 或 WireGuard。

### 4.3 为什么意图识别不一次性全走 LLM

**决策**：三层渐进式意图识别（规则 → 关键词 → LLM）。

**理由**：
- 显式命令（`/capture`、`/ask`、URL）占比约 60%，走规则零成本、零延迟、100% 准确
- LLM 分类每次调用 ~200 tokens + 500ms 延迟，全量走 LLM 日均成本和体验都不划算
- LLM 兜底保证灵活性：用户写"帮我记一下今天学到的东西"能正确路由到 `capture.note`

**演进路径**：Phase 2 可把 Level 3 升级为用 Ask-Anywhere 自身做路由（"AI 路由 AI"）。

### 4.4 为什么 delegate 模式是整个方案的点睛之笔

**决策**：Orbit 无法处理的请求（如纯编程任务）通过 `delegate` 事件交还给 cc-connect 内的其他 agent，但 **Orbit 注入上下文**。

**典型场景**：用户在微信发 "帮我给 gateway 加一个飞书 channel"：
1. cc-connect 收到 → orbit-agent.Send()
2. Orbit intent-router 判断：`delegate.coding_agent`
3. Orbit 查询当前 conversation 关联的 vault / project / task，构造 enriched prompt：
   ```
   # 项目背景
   - Project: orbit
   - 相关 ADR: ADR-017
   - Worktree: /tmp/orbit-worktree-xxx
   # 用户请求
   帮我给 gateway 加一个飞书 channel
   ```
4. Orbit 回 `delegate` 事件，指定 `targetAgent = claudecode`
5. cc-connect orbit-agent 把当前 session 的底层 agent 切换到 claudecode，把 enriched prompt 作为首条消息
6. 后续所有流式回复直接走 claudecode，Orbit 不再介入

**价值**：用户从一个入口（微信）既能用 Orbit 的结构化能力（捕获/查询），又能用 Claude Code 的编程能力，且 Claude Code **自动带上 Orbit 的项目上下文**——这是单独任何一方都做不到的。

### 4.5 为什么要保留 Orbit 现有 Telegram Gateway

**决策**：External Gateway 与现有 `src/main/gateway/` 并存，不删除。

**理由**：
- cc-connect 不支持某些小众场景（如企业内网 IM）时有兜底
- Orbit 想要的"完全自主通道"（如未来的加密通讯、Matrix 协议等）仍可通过自建 channel 实现
- 现有用户的 Telegram 配置不被破坏

**边界**：新平台优先接 cc-connect；仅当 cc-connect 不支持或不合适时才考虑自建 channel。

---

## 五、End-to-End 示例

### 示例 1：`/capture` 快速捕获

```
微信消息：/capture 今天学到一个新架构思路：三层解耦

t=  0 ms  WeCom API 推送到 cc-connect
t= 40 ms  cc-connect platform/wecom 解码 → engine.Dispatch
t= 45 ms  engine 选择 orbit agent（用户配置）→ session.Send(msg)
t= 50 ms  orbit-agent 往 socket 写：
          {"type":"message.submit","requestId":"r1","sessionId":"wx-u123",
           "user":{"platform":"wecom","id":"u123"},
           "content":{"kind":"text","text":"/capture 今天学到..."}}
t= 60 ms  Orbit socket-server 收到 → intent-router 匹配 "/capture"
          → capability = capture.note
t= 65 ms  写回：{"type":"request.accepted","requestId":"r1","routedTo":"capture.note"}
t= 70 ms  capture.adapter 调 createNoteStore(vault).create(...)
t=150 ms  Note 创建完成 → 写回：
          {"type":"artifact","requestId":"r1","kind":"note","ref":"note-abc",
           "preview":{"title":"今天学到..."}}
          {"type":"request.completed","requestId":"r1","summary":"Captured as \"今天学到...\""}
t=160 ms  orbit-agent 收到 → 转成 CardEvent → cc-connect 回 WeCom
t=200 ms  用户微信看到："✅ 已保存为笔记" + 附带笔记链接卡片
```

### 示例 2：Ask-Anywhere 流式响应

```
微信消息：/ask 我昨天的设计思路在哪个笔记里

t=   0 ms  cc-connect 收到 → orbit-agent.Send
t=  20 ms  Orbit socket-server 收到 → 路由到 ask_anywhere
t=  25 ms  回 {"type":"request.accepted","requestId":"r2","routedTo":"ask_anywhere"}
t=  30 ms  ask-anywhere.adapter：
           yield {"type":"progress","stage":"retrieving_notes"}
t=  35 ms  orbit-agent 转 StatusEvent → cc-connect 微信消息变 "正在检索笔记..."
t= 120 ms  yield {"type":"progress","stage":"generating"}
           → 微信 "正在生成回答..."
t= 500 ms  LLM 开始流式：
           yield {"type":"text.delta","text":"在你的「架构"}
t= 520 ms  yield {"type":"text.delta","text":"思考」笔记中，"}
t= 540 ms  yield {"type":"text.delta","text":"关键观点是..."}
           ...(持续 10 秒)
           
           orbit-agent 每 500ms 合并 delta 批量 edit 微信消息
           
t=10.5 s   LLM 停 → Ask-Anywhere 附带引用：
           yield {"type":"artifact","kind":"note","ref":"note-123",
                  "preview":{"title":"架构思考","excerpt":"..."}}
           yield {"type":"request.completed","summary":"已引用 1 篇笔记"}
t=10.7 s   用户微信看到：完整流式回答 + 底部"查看笔记"卡片
```

### 示例 3：Delegate 到 Claude Code

```
微信消息：帮我给 gateway 加一个飞书 channel

t=  0 ms  orbit-agent.Send → Orbit intent-router
t= 50 ms  Level 1 规则未匹配 → Level 2 关键词未明确 → Level 3 LLM 分类
t=600 ms  LLM 返回：{ capability: "delegate.coding_agent", 
                     params: { agent: "claudecode" }, confidence: 0.88 }
t=610 ms  delegate.adapter 查询 Orbit conversation 关联的 project
t=620 ms  构造 enriched prompt（注入 ADR-017、当前 plan 文档、worktree path）
t=630 ms  yield {"type":"delegate","requestId":"r3","targetAgent":"claudecode",
                 "enrichedPrompt":"# 项目背景\n...\n# 用户请求\n...",
                 "workingDirectory":"/tmp/orbit-worktree-feishu"}
t=650 ms  orbit-agent 收到 delegate → 切换 session 底层 agent 到 claudecode
          把 enrichedPrompt 作为首条消息
t= 1 s    Claude Code 启动，开始流式输出代码
          (后续完全走 cc-connect 原生 claudecode 流程，Orbit 不再介入)
```

### 示例 4：Orbit 主动推送 Daily Summary

```
t=08:00  Orbit Scheduler 触发 daily-summary 任务
t=08:05  Synthesis 生成 summary.daily artifact
t=08:06  Notification Pusher 查询订阅了该推送的 session-bindings
           → [{ platform: "wecom", userId: "u123", sessionId: "wx-u123" }]
t=08:06  Orbit socket 写：
           {"type":"notification",
            "target":{"platform":"wecom","userId":"u123"},
            "content":{"kind":"markdown","text":"## 今日总结\n..."}}
t=08:06  orbit-agent 收到 notification → 无 requestId，走独立分支
           → 调用 cc-connect 平台抽象的 Reply(target, content)
t=08:07  用户微信收到 Daily Summary
```

---

## 六、数据模型与持久化

### 6.1 新增持久化文件

```
<vault>/.orbit/external-gateway/
├── session-map.json          # cc-connect sessionId → Orbit conversationId
├── push-subscriptions.json   # 订阅了主动推送的 bindings
└── request-log.ndjson        # 请求日志（用于幂等、审计、回放）
```

### 6.2 Schema

```typescript
interface SessionMapping {
  sessionId: string            // cc-connect 的 session_key
  conversationId: string       // Orbit 的 conversation UID
  platform: string
  userId: string
  userName?: string
  createdAt: string
  lastActivityAt: string
  archived: boolean
}

interface PushSubscription {
  id: string
  kind: 'daily_summary' | 'weekly_review' | 'inbox_approval' | 'auto_runner_alert'
  target: { platform: string; userId: string }
  enabled: boolean
  schedule?: string            // cron，仅定时类推送需要
  createdAt: string
}

interface RequestLogEntry {
  requestId: string
  sessionId: string
  platform: string
  userId: string
  receivedAt: string
  routedTo: Capability
  outcome: 'completed' | 'failed' | 'delegated' | 'cancelled'
  finishedAt: string
  durationMs: number
  artifactRefs: Array<{ kind: ArtifactKind; ref: string }>
  errorCode?: string
}
```

### 6.3 事件发布

External Orchestrator 每处理一个请求，发一条 TraceableEvent：

```typescript
publishTraceableEvent({
  source: 'conversation',
  kind: 'external.gateway.message',
  summary: decision.reasoning,
  payload: {
    platform: req.user.platform,
    userId: req.user.id,
    capability: decision.capability,
    requestId: req.requestId,
    outcome
  }
})
```

这样 Activity Log、Timeline、Memory Layer 都能自动感知外部通道的交互，与愿景中的"所有 agent 动作都留痕可审计"保持一致。

---

## 七、安全与权限

### 7.1 鉴权层次

1. **cc-connect 层**：由 cc-connect 各平台 adapter 自身鉴权（Telegram bot token、Feishu App Secret 等）
2. **session 层**：Orbit 维护 `allowed_user_ids`（沿用现有 gateway 的 bind code 机制），未绑定用户的请求直接拒绝
3. **capability 层**：每个 adapter 可声明 required_permissions，对应 channel config 的 permissions 字段（capture / ask / save_url / save_file / summary 等）
4. **human_input 层**：涉及破坏性操作（删除、归档、合并 worktree）强制走 `human_input.required` 事件，用户在 IM 里点按钮确认

### 7.2 敏感数据处理

- **令牌与密钥**：绝不从 Orbit 侧 log；协议事件传递时 redact
- **用户消息**：存入 `request-log.ndjson` 需遵守用户配置的保留策略（默认保留 30 天）
- **artifact 链接**：只存 `ref`，preview 不含完整内容（防 log 泄露）

### 7.3 滥用防护

- 每个 `{platform, userId}` 的请求速率限制（默认：10 req/min）
- `delegate.coding_agent` 需要显式白名单开关（避免未授权触发付费 API）
- 主动推送默认关闭，用户在 Orbit UI 订阅后才生效

---

## 八、UI 影响

在 Orbit 设置面板新增 **External Gateway** 子页（与现有 Gateway 页并列）：

```
Settings
├── Gateway (existing)         ← 自建 Telegram channel
└── External Gateway (new)     ← cc-connect 集成
    ├── Socket Status          连接健康度、活跃 session 数、日消息量
    ├── Session Bindings       当前已映射的 sessionId 列表、平台、用户、最近活跃
    ├── Push Subscriptions     管理主动推送订阅
    ├── Request Log            最近 100 条请求（capability、耗时、产物）
    └── Capability Permissions 每个 capability 的全局开关
```

与 `GatewayView.tsx` 共享底层组件（消息列表、状态徽章），避免重复。

---

## 九、分阶段交付计划

### 阶段 1：MVP 闭环（约 2-4 周）

**目标**：跑通一条最小链路，验证协议和延迟。

- [ ] 定稿 `src/shared/external-gateway-protocol.ts` 协议 v1
- [ ] `src/main/external-orchestrator/socket-server.ts` 基础 socket 监听
- [ ] `intent-router.ts` 仅实现 Level 1（规则）
- [ ] 实现 3 个 adapter：`ask-anywhere`、`capture.note`、`library.save`
- [ ] cc-connect 侧 `agent/orbit/` Go 实现（不含 delegate）
- [ ] 端到端测试：一条 IM 平台（建议先 Telegram，因为 cc-connect 最成熟）
- [ ] 文档：README + 配置示例

**验收**：
- 用户在 Telegram 发 `/ask 今天有什么任务` → 流式收到 Ask-Anywhere 回答
- `/capture` 能正确写入 Note
- 发 URL 能保存到 Library
- 100 条连续请求无丢失、无乱序

### 阶段 2：深度融合（约 2-3 月）

**目标**：Orbit 能力全暴露 + 主动推送。

- [ ] 补齐 adapter：`capture.thought` `task.query` `inbox.review` `synthesis.run` `memory.recall`
- [ ] `intent-router` Level 2（关键词）+ Level 3（LLM 分类）
- [ ] `session-bridge` 持久化 + Conversation 映射
- [ ] `notification-pusher` + Daily Summary 定时推送
- [ ] `delegate` 能力：交给 cc-connect 内的 claudecode
- [ ] Orbit Settings UI 的 External Gateway 页
- [ ] Card / human_input.required 的完整实现
- [ ] 扩展测试平台：飞书、Discord 各跑通一条链路

**验收**：
- 用户用自然语言（非 `/` 前缀）也能正确路由
- 每天早 8 点微信自动收到 Orbit Daily Summary
- 在微信说"帮我改一下刚才那段代码" → 自动 delegate 到 Claude Code 并带 vault 上下文
- Inbox 的审批按钮能在 IM 里点击处理

### 阶段 3：生态贡献（长期）

**目标**：让方案不仅服务 Orbit 自己。

- [ ] 把 `agent/orbit/` PR 提交到 cc-connect 上游，成为官方内建 agent
- [ ] 抽象出 `external-gateway-protocol` 为独立 npm 包，其他工具也可复用
- [ ] 基于 MCP 协议重构 socket 层，让 Orbit 能力不止 cc-connect 能用
- [ ] 支持跨机器（socket over SSH tunnel / WireGuard）

---

## 十、与现有架构的关系

### 10.1 继承

- **复用现有 Gateway store**：`pending_binds`、`allowed_user_ids`、`permissions` 概念全部继承，只是承载体从单一 Telegram channel 变成多平台聚合
- **复用 Conversation 架构**（ADR-014）：cc-connect session → Orbit Conversation，重用 message timeline、artifact stage 等
- **复用 Ask-Anywhere orchestrator**（ADR-015）：不重写任何推理逻辑，只是接入新入口
- **复用 TraceableEvent bus**：外部请求同样走 event bus，天然被 Activity Log / Timeline / Memory 接住
- **复用 Runtime abstraction**（ADR-011）：delegate 时走现有 RuntimeAdapter，不重造

### 10.2 取代

- **不再单独扩展 `src/main/gateway/channels/`**：新 IM 平台不自建 channel，走 cc-connect
- **原 `src/main/gateway/`** 作为"自建 channel 兜底"保留，不再是首选路径

### 10.3 新增

- 一份协议文件（`external-gateway-protocol.ts`）
- 一个模块（`src/main/external-orchestrator/`）
- 三个持久化文件（session-map / push-subscriptions / request-log）
- 一个 UI 页（Settings → External Gateway）
- cc-connect 仓库里的 `agent/orbit/` Go 包

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| cc-connect 上游停止维护 | 所有接入失效 | 协议层解耦，可替换为自建 channel 或其他桥接方案；`external-gateway-protocol` 可移植到其他 Transport |
| 协议版本不兼容（cc-connect 升级） | orbit-agent 无法连接 | 协议带 `version` 字段，不兼容升级时 orbit-agent 显式拒连并提示用户 |
| LLM 意图识别错误率 > 10% | 用户体验受损 | 保留 `/` 前缀强制路由 + Settings 里可关闭 Level 3 | 
| 长连接断流 | 用户消息丢失 | 指数退避重连；`request-log.ndjson` 做最后 24h 请求快照；断连期间 cc-connect 本地缓存消息 |
| 主动推送打扰用户 | 体验负向 | 默认全部关闭；仅当用户显式订阅后生效；每个推送有"静音"按钮 |
| 多 cc-connect 实例重复处理 | 一条消息处理两次 | Socket 连接层支持幂等：`requestId` + LRU 去重窗口（1000 条） |
| Orbit 主进程宕机 | 所有 IM 请求失败 | orbit-agent 可配置 `fallback_agent`，降级到纯 claudecode 保证不中断 |

---

## 十二、开放问题

以下问题在 MVP 阶段不阻塞，但需要进入 `docs/open-questions.md` 继续跟踪：

1. **跨机器场景**：用户在公司机器访问家里的 Orbit，socket 需要经 SSH/WireGuard 还是另起 HTTP 层？
2. **多 vault 支持**：一个 cc-connect daemon 如何同时接多个 Orbit vault（多身份、多工作区）？
3. **MCP 协议迁移时机**：什么时候从自定义 JSONL 切换到 MCP？是否值得并存一段？
4. **IM 端 UI 原生能力**：飞书的 "互动卡片" / 钉钉的 "AI 卡片" / Slack 的 Block Kit 差异很大，是否每个平台需要定制 adapter 的渲染层？
5. **审计合规**：企业场景下，request-log 的保留策略、加密、脱敏如何可配置？
6. **成本核算**：LLM intent 分类 + Ask-Anywhere 生成的费用如何归账到 Orbit 现有 Budget 系统？

---

## 十三、验收清单

MVP 交付时全部 ✅：

- [ ] 协议文档 `external-gateway-protocol.ts` 完整注释 + 版本号
- [ ] `socket-server.ts` 通过 Orbit 单元测试
- [ ] 每个 adapter 有至少一个 happy-path 集成测试
- [ ] cc-connect 侧 `agent/orbit/` 通过 `go test ./...`
- [ ] E2E：Telegram 发 `/capture`、`/ask`、URL、自然语言，四条链路全绿
- [ ] 协议事件数量、耗时有 metrics 输出
- [ ] README 包含端到端搭建步骤
- [ ] 用户可以在 Settings 看到连接状态 + 消息日志
- [ ] 断线重连、幂等、取消三个边界场景有自动化测试

---

## 十四、参考与交叉引用

- `docs/VISION.md` — "UI 是人的界面，CLI 是 AI 的界面"
- `docs/ROADMAP.md` Phase 8.1 — Gateway daemon and Telegram channel
- `docs/decisions/ADR-008-ai-native-cli-first.md` — CLI 暴露所有业务能力
- `docs/decisions/ADR-011-runtime-abstraction-through-capabilities.md` — 能力抽象
- `docs/decisions/ADR-014-chat-decoupling-conversation-first-class.md` — Conversation 作为一等公民
- `docs/decisions/ADR-015-ask-anywhere-as-planner-proxy.md` — Ask-Anywhere 作为入口
- `docs/architecture/chat-conversation-surface.md` — Conversation Surface 统一
- `docs/decisions/ADR-017-external-gateway-via-cc-connect.md` — 本方案的架构决策
- cc-connect 仓库 — https://github.com/chenhg5/cc-connect
- cc-connect `AGENTS.md` — Adding a new Agent 流程

---

## 十五、变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-05-08 | 落地 Orbit 侧 External Gateway：协议、socket server、session bridge、能力 adapter、Settings UI、请求日志与测试 | Copilot |
| 2026-05-08 | 初始提案 | @ryanbzhou |
