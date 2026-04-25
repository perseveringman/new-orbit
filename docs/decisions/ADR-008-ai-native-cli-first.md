---
id: ADR-008
title: AI-Native 原则与 CLI-first 迁移（废弃 MCP）
status: accepted
date: 2026-04-26
supersedes: plans/2026-04-22-orbit-agent-context-architecture.md, plans/2026-04-22-orbit-agent-context-scheme-a.md, plans/2026-04-22-orbit-agent-context-scheme-c.md, plans/2026-04-22-orbit-agent-context-scheme-d.md
implementation: plans/2026-04-26-cli-migration.md
---

## Context

v1 Orbit 的 agent 能力通过 MCP Server 暴露：`src/mcp/server.ts` 注册 7 个工具（search_vault / get_file / create_task / update_task / search_memories / save_memory / query_project_graph），agent 启动时 MCP 客户端连接并读取工具清单。

v2 对话中识别出两个更根本的问题：

### 1. AI-Native 原则

用户明确提出：

> "这个应用里面尽量所有的能力都可以让 AI 去做，这样子才是一个 AI native 的应用。"

具体含义：**用户能做的（新增订阅源、保存文章、归档项目、移动任务状态），AI 都应该能做**。这意味着现有的 7 个 MCP 工具远远不够——随着 Inbox / Capture / Activity Log 等 v2 能力加入，能力清单要膨胀到 30+。

### 2. MCP 的 Token 开销

30+ 个 MCP 工具 × 每个 150-300 tokens 的工具定义 = **~6000 tokens 的永久 context 占用**。这是每次 agent 对话都要消耗的固定开销。

### 3. 用户对 MCP/CLI 的纯技术视角澄清

> "MCP 和 CLI 实际上都是针对 Agent 来说的，不太需要考虑用户去调用的情况，因为用户不需要了解这一层认知，他只和 AI 聊天。所以，你的取舍应该只考虑 Agent。"

这排除了"CLI 让用户也能用"这种软性价值，取舍纯粹基于 agent 的表现：

- **MCP 的真实优势**：schema 强约束（参数错误率低）+ 结构化返回
- **CLI 的真实优势**：token 开销小 + 可按需发现（`orbit --help`）+ 可组合 + 单一业务入口

用户最终拍板：

> "完全废弃，能力全部迁移到 CLI。后续观察一下 Agent 对任务执行的准确度，来考虑要不要把 MCP 接回来。"

## Decision

### 1. AI-Native 原则确立为元原则

**用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口。**

推论：
- 所有用户动作都应有对应的 IPC handler + CLI 命令
- 所有 CLI 命令都应该对等映射到 UI 里的某个操作（或者低频动作不出现在 UI，纯 AI 操作）
- 破坏性 / 扩大范围动作走 approval flow（见 ADR-006），不依赖具体接口（CLI 或 UI 都 OK）

### 2. 废弃 MCP，转向 CLI-first

**所有 agent 能力通过 `orbit` CLI 暴露**。MCP Server (`src/mcp/`) 在本期废弃。

架构：

```
┌─────────────┐
│ main process│
│ IPC handlers│ ← UI (IPC)
└──────┬──────┘
       │
       └─── orbit CLI ← Agent (CLI + stdin pipe events)
```

- CLI 是薄层，通过本地 IPC 调用 main process 的同一套 handler
- 不单独为 agent 写业务逻辑——和 UI 共享

### 3. CLI 设计规范

- **所有命令支持 `--json`**：agent 消费结构化返回
- **所有命令支持 `--help`**：agent 按需发现能力
- **长内容通过 stdin / `--file`**：规避 shell quoting 问题
  - 不推荐：`orbit thought create --content "带引号的\"内容\""`
  - 推荐：`echo "..." | orbit thought create` 或 `orbit thought create --file /tmp/x.md`
- **统一退出码**：0=成功 / 1=业务错误 / 2=参数错误
- **命令结构**：`orbit <domain> <action> [args]`（如 `orbit task update`）

### 4. 事件推送复用 stdin pipe

Agent 需要接收 Orbit 主动推送的事件（依赖满足、审批通过）时，复用现有 hydration 机制（`parseHydrationLine`），通过向 agent stdin 发送事件行实现。不需要 MCP 的 notification 能力。

### 5. MCP 废弃策略

- `src/mcp/` 标记为废弃，源码保留在 git history
- 当前 MCP server 的启动流程（`out/mcp/server.cjs` 生成、项目 `.mcp.json` 注入）在实施 CLI 后移除
- 现有 7 个 MCP 工具全部改为 CLI 命令（对应关系见实施方案）

### 6. 观察期策略

- 上线后监控 agent 对 CLI 的调用准确度（通过 Activity Log + 错误日志）
- 若错误率过高（阈值待定），重新引入 MCP 作为高准确度场景的补充
- MCP 代码留在 git history，随时可复活

## Rationale

**为什么纯 CLI 而不是混合**：

- 混合方案需要为每个能力做"走 CLI 还是走 MCP"的决策——增加设计复杂度
- 两套接入通道维护成本翻倍
- Agent 的能力心智要理解两种不同交互风格

**MCP 的 schema 强约束风险通过 CLI 规范缓解**：
- 长内容走 stdin / `--file` → 避免 quoting 错误
- `--json` 输出 → 返回结构化数据
- `--help` 自文档化 → 参数错误时 LLM 能自主修正

**Orbit 的 agent 是 Claude Code CLI，它是 shell-native 的**：
- Anthropic 对 Claude 的 shell 命令生成已经做了优化
- CLI 错误率并不会显著高于 MCP

**替代方案**：

- **继续用 MCP + 加载时裁剪工具清单**：MCP 协议不支持按 agent 角色动态裁剪工具；需要在 server 层 hack；复杂度高。
- **MCP + CLI 混合**：增加设计决策摩擦；没必要（见上）。
- **完全不暴露能力给 agent，只靠 prompt**：违背 AI-Native 原则；agent 无法实际操作系统。

## Consequences

**正面**：
- Agent context 占用大幅降低（~6000 → ~200 tokens）
- Orbit 只维护一条业务接入通道
- Agent Context System（原 scheme A/C/D 系列 plan）大幅简化——不需要复杂的 context wrapper，只需要 `PATH` 前置 `<vault>/.orbit/bin`，agent 自己 `orbit --help` 发现能力
- 低频运维动作（清理 Feed 历史、批量改 tag）不用做专门 UI，让 AI 用文件系统能力做

**负面 / 待处理**：
- Agent 对 CLI 的生成准确度**有不确定性**——需要观察期验证
- 现有 MCP 相关代码（`src/mcp/`、测试、`.mcp.json` 注入、项目创建流程）需要迁移
- CLI 的 `--json` 输出契约需要规范化，避免解析歧义

### 迁移表

| v1 MCP 工具 | v2 CLI 命令 | 备注 |
|------------|-------------|------|
| `search_vault(query)` | `orbit search <query>` | 纯查询 |
| `get_file(path)` | `orbit cat <path-or-uid>` | 纯读取 |
| `create_task(draft)` | `orbit task propose` | 改为 propose-approve（见 ADR-006） |
| `update_task(uid, patch)` | `orbit task update <uid>` | 直接 CRUD |
| `search_memories(query)` | `orbit memory search <query>` | 纯查询 |
| `save_memory(content)` | `orbit memory save` | 直接写入 |
| `query_project_graph()` | `orbit project graph` | 纯查询 |

v2 新增的大批命令（inbox / capture / activity / feed / library / thought 等）见实施方案。

### 被本 ADR 废弃的 plans

以下 plan 已被本 ADR 取代（标记 superseded 并保留原文供历史参考）：

- `plans/2026-04-22-orbit-agent-context-architecture.md`
- `plans/2026-04-22-orbit-agent-context-scheme-a.md`
- `plans/2026-04-22-orbit-agent-context-scheme-c.md`
- `plans/2026-04-22-orbit-agent-context-scheme-d.md`

## Implementation

见 [`plans/2026-04-26-cli-migration.md`](../plans/2026-04-26-cli-migration.md)。
