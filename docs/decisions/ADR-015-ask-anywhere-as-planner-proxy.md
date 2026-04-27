# ADR-015: Ask-Anywhere 作为规划者代理

| 状态 | 日期 | 作者 |
|------|------|------|
| **Proposed** | 2026-04-29 | Ryan / AI |

## Context

Orbit 的 agent 层级随着功能增长变得复杂：
- Planner Agent：负责项目规划
- Task Agent（按 role 绑定）：负责具体任务执行
- Auto-runner：负责自动认领和调度
- 未来的 Ask-Anywhere Agent：全应用 AI 助手
- 未来的 Scheduled Task Agent：定时任务执行

用户提出问题："channel 对接的到底是哪一层的 agent？现在 agent 有点多了。"

同时，产品方向要求：
- 用户应该只和一个 AI 入口打交道
- 用户的认知负荷收敛到一点

## Decision

### D-1: 规划者 / 执行者二层结构

建立清晰的 Agent 语义划分：

```
用户（规划者）  ←→  Ask-Anywhere（规划者代理）
        ↓                      ↓
        └──────────────────────┴──→ Role Agents（执行者）
```

**语义锚点**：
> **用户是规划者，执行者是各个 Roles**

### D-2: Ask-Anywhere 是用户的唯一 AI 入口

- 用户日常只和 Ask-Anywhere 对话
- Ask-Anywhere 代用户做**规划类工作**：创建项目、拆分任务、安排优先级
- Role Agents 作为后台 worker 做**执行类工作**

**形态**：
- 左侧栏一级入口：全功能页面（对话列表 + chat + 产物预览）
- 悬浮球：右下角极简对话框
- 未来全屏模式

### D-3: Planner Agent 作为独立实体退役

规划能力由 Ask-Anywhere 承担。原 Planner Agent 的 system prompt 作为 Ask-Anywhere 的 skill 保留。

`ProjectPlannerView` 冻结，不再新增功能。入口指向 Ask-Anywhere（带 project 上下文）。

### D-4: 各业务模块自己配置 auto agent

去中心化原则：
- **Project**：配置自己的 Role Agents（已有）
- **Area**：配置自己的 Reviewer Agent
- **Scheduled Task**：每个定时任务声明自己用哪个 runtime
- **Capture**：可配置自动 summarize agent

模块间只通过 CLI / AppBus event 通信，不直接调用。

### D-5: Channel 只对接 Ask-Anywhere

所有外部 channel（Telegram / 未来其他）入站消息统一路由到 Ask-Anywhere。

```
Telegram → Gateway Daemon → AppBus → AskAnywhereOrchestrator
```

不需要 Intent Router——LLM（Ask-Anywhere 本身）就是最好的意图识别器。

### D-6: Ask-Anywhere 通过 orbit CLI 操作 vault

Ask-Anywhere 的能力完全通过 `orbit` CLI 工具集实现：
- `orbit project list`
- `orbit task propose`
- `orbit capture create`
- ...

**这是 ADR-008（AI-Native + CLI-first）的第一次真正落地**：CLI 是给 AI 的接口，Ask-Anywhere 是第一个使用者。

## Consequences

### 正面

1. **用户认知收敛**：只需记住"有事找 Ask-Anywhere"
2. **Channel 路由简化**：不需要业务层路由逻辑
3. **ADR-008 落地**：CLI-first 原则从理论变为现实
4. **业务模块解耦**：每个模块自己管自己的 worker

### 负面

1. **Ask-Anywhere prompt 膨胀**：需要 skill 分拆 + context retrieval
2. **Planner 代码迁移**：需要把精调 prompt 打包为 skill

### 风险

- Ask-Anywhere 规划质量可能不如原 Planner Agent（缓解：保留精调 skill）

## Related

- ADR-008（AI-Native + CLI-first）：本 ADR 是其第一次实践
- ADR-014（Chat 解耦与 Conversation 一等公民）：Ask-Anywhere 依赖 Conversation 模型
- ADR-004（Inbox 枢纽）：Ask-Anywhere 创建的 proposal 进 Inbox
