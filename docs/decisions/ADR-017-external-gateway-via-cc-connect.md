---
id: ADR-017
title: External Gateway — 借助 cc-connect 生态，保留 Orbit 域能力
status: accepted
date: 2026-05-08
related: ADR-008, ADR-011, ADR-014, ADR-015
implementation: plans/2026-05-08-cc-connect-integration-architecture.md
---

# ADR-017: External Gateway — 借助 cc-connect 生态，保留 Orbit 域能力

## Context

Phase 8.1 已实现基于 Telegram long-polling 的自建 Gateway（`src/main/gateway/`）。该方案可行，但扩展到更多 IM 平台（微信、飞书、Slack、Discord、钉钉、LINE 等）意味着：

- 每个平台都要自实现长连接 / 鉴权 / 消息解析 / 断线重连 / 文件传输
- 平台 API 变更带来的持续维护成本
- 这些工作与 Orbit 的核心使命（local-first 知识与执行工作台）无关

与此同时，社区成熟方案 cc-connect（MIT）已经提供了 **11+ IM 平台适配器**和 **10+ CLI agent 适配器**，并处于活跃维护状态。

Orbit 面临的关键问题：**如何介入 cc-connect 生态，同时不丢失自己的结构化业务能力（Ask-Anywhere、Capture、Inbox、Library、Vision 等）？**

四种方向中，三种被明确否决：

1. **让 Orbit CLI 作为 cc-connect 的普通 agent**：丢失所有结构化能力，退化成纯命令转发，违背 VISION "不做另一个 ChatGPT UI"
2. **抛弃 Orbit Gateway，完全用 cc-connect 替代**：丢失深度能力，`/capture` `/ask` `/summary` 无法工作
3. **两边并存运行**：一条消息被两个 bot 处理，配置地狱，体验撕裂

## Decision

采用 **三层解耦架构**：cc-connect 作为**传输层**，Orbit 保留为**域层**，在 cc-connect 内新增 `orbit-agent` 作为**编排层**。

```
Transport Layer    : cc-connect (Go)       — IM 平台收发
Orchestration Layer: agent/orbit/ (Go, new)— session 桥接、意图分发、delegate
Domain Layer       : Orbit Main (Node)     — 现有 Ask-Anywhere / Capture / Inbox / ...
```

三层之间通过 **External Gateway Protocol** 通信（Unix Socket + JSON-Lines，共享 TypeScript 定义，Go 侧对齐 struct）。

### 关键约束

1. **协议优先（Contract First）**：`src/shared/external-gateway-protocol.ts` 是两边唯一耦合点
2. **零侵入域层（Non-invasive）**：新增 `src/main/external-orchestrator/` 只**调用**现有服务，不修改业务逻辑
3. **按能力注册（Capability Registry）**：新增 Orbit 能力暴露 = 写 adapter + 注册，无需改协议
4. **委托可穿透（Delegate）**：Orbit 无法处理的请求（如纯编程）通过 `delegate` 事件交还 cc-connect 内其他 agent，但 Orbit 注入 vault 上下文
5. **自建 Gateway 保留**：现有 `src/main/gateway/` 作为兜底不删除；新平台优先走 cc-connect

### 协议核心形态

**Inbound（cc-connect → Orbit）**：
- `message.submit` — 消息请求（带 requestId、sessionId、user、content）
- `message.cancel` — 取消正在处理的请求
- `session.close` — 关闭会话
- `ping` — 心跳

**Outbound（Orbit → cc-connect）**：
- `request.accepted` / `request.rejected` — 路由决策
- `progress` — 进度事件
- `text.delta` — 流式文本
- `artifact` / `card` / `file` — 结构化结果
- `human_input.required` — 人类确认（借用 cc-connect 权限机制）
- `delegate` — 交接给其他 agent（附带 enrichedPrompt 和 workingDirectory）
- `request.completed` / `request.failed` — 终结
- `notification` — 主动推送（不与 requestId 绑定）

### 协议不变量

- 每个 `message.submit` 最终必须收到**一个**结束事件（completed / failed / delegate）
- `requestId` 在连接生命周期内唯一
- `delegate` 一次性移交，后续响应不再经过 Orbit
- `notification` 由 Orbit 自发，用于 Daily Summary / 审批提醒等

## Consequences

### Positive

1. **生态借力**：cc-connect 每新增一个 IM 平台或 CLI agent，Orbit 自动受益，无需额外工作
2. **愿景守住**：所有外部消息最终仍落到结构化产物（Note / Thought / LibraryItem / Inbox Entry），保持 "Vision 驱动 + 可审计" 的核心原则
3. **替换成本低**：协议解耦意味着哪天放弃 cc-connect 只需替换传输层，Orbit 域零影响
4. **能力可插拔**：新增 Orbit 能力（如 `memory.recall`、`synthesis.run`）只需写一个 adapter 并注册
5. **delegate 解锁新体验**：用户从 IM 单一入口既能用 Orbit 的结构化能力，又能用 Claude Code 的编程能力，且 Claude Code **自动带上 Orbit 上下文**——单独任何一方做不到
6. **复用现有基础**：Conversation（ADR-014）、Ask-Anywhere（ADR-015）、CLI-first（ADR-008）、Runtime abstraction（ADR-011）全部继承，无需重造

### Negative

1. **多语言栈**：`agent/orbit/` 是 Go 代码，Orbit 主仓库保持 TypeScript；需要在 cc-connect 仓库维护 Go 包
2. **协议演进成本**：两边协议不同步会导致连接失败；每次破坏性升级需要版本号协商
3. **部署复杂度增加**：用户需要同时运行 Orbit 主进程 + cc-connect daemon
4. **调试链路更长**：bug 定位可能需要在 Orbit / orbit-agent / cc-connect engine / platform adapter 四层排查
5. **依赖上游项目**：cc-connect 停止维护或做出破坏性变更时 Orbit 被动承受风险（缓解：协议解耦 + 自建 Gateway 兜底）

### Neutral（取舍）

1. **选择 Unix Socket 而非 HTTP/gRPC/MCP**：现阶段本机即可，选最轻量方案；未来可升级到 MCP
2. **意图识别采用三层渐进（规则 → 关键词 → LLM）**：不为了简洁而牺牲 60% 请求的延迟和成本
3. **把 orbit-agent 放在 cc-connect 内而非外挂代理**：享受其原生 session 管理和权限机制，代价是要维护 Go 代码

## Alternatives Considered

### A. Orbit CLI 作为 cc-connect 普通 agent

让 cc-connect 的 agent 每次收到消息就 fork 一个 `orbit <cmd> --json` 子进程。

**拒绝理由**：
- 语义层太低，无法承载 Ask-Anywhere 等流式对话能力
- 违背 VISION "UI 是人的界面，CLI 是 AI 的界面"——CLI 不是让 AI **翻译给** 人，而是让 AI **操作** Orbit
- 冷启动慢（每条消息 fork 进程）
- 丢失 Inbox / Conversation / Vision 注入等核心能力

### B. 完全替换为 cc-connect

抛弃 Orbit Gateway，所有消息都走 cc-connect，用户在 IM 里只跟 Claude Code 等通用 agent 聊天。

**拒绝理由**：
- 退化为"一个带 IM 入口的 ChatGPT"，丧失 Orbit 的产品身份
- `/capture`、`/ask` 等命令没有承载者
- 用户 vault 的知识无法被 IM 对话利用

### C. 两边独立并存

Orbit Gateway 和 cc-connect 同时运行，各自绑定不同 IM 平台。

**拒绝理由**：
- 一条消息可能被两个 bot 处理（重复响应）
- 配置和绑定要维护两套
- 用户心智负担大，不知道同一个功能该去哪个界面用
- 平台重叠时冲突不可避免

### D. MCP-based 架构（未来候选）

直接采用 Model Context Protocol，让 Orbit 暴露为 MCP server，cc-connect / Claude Desktop / 任何 MCP client 都能调用。

**暂不采纳，但留作演进目标**：
- MCP 规范仍在快速演进，SDK 成熟度不一
- 生态 client 尚未普及，现阶段投入产出比低
- 本 ADR 的协议设计保持 "协议层可替换"，未来升级 MCP 时只替换 socket 层，业务逻辑零影响

## Implementation Notes

详细实施计划见 `plans/2026-05-08-cc-connect-integration-architecture.md`。

关键交付节点：

- **阶段 1（MVP，2-4 周）**：协议定稿 + socket server + 3 个核心 adapter（ask_anywhere / capture.note / library.save）+ cc-connect agent/orbit Go 实现 + Telegram 端到端
- **阶段 2（深度融合，2-3 月）**：全能力暴露 + 意图 LLM 分类 + Daily Summary 主动推送 + delegate + Settings UI + 多 IM 平台验证
- **阶段 3（生态贡献，长期）**：PR orbit-agent 到 cc-connect 上游 + 协议独立发布 + 基于 MCP 重构

## Related Work

- ADR-008: AI-Native + CLI-First — 业务能力必须对 AI 可操作
- ADR-011: Runtime abstraction through capabilities — 能力抽象模式
- ADR-014: Chat decoupling, Conversation first-class — Conversation 作为一等公民
- ADR-015: Ask-Anywhere as planner proxy — Ask-Anywhere 作为入口
- ROADMAP Phase 8.1 — Gateway daemon and Telegram channel
- cc-connect — https://github.com/chenhg5/cc-connect
