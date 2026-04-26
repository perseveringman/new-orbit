---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-008
supersedes: 2026-04-22-orbit-agent-context-architecture.md, 2026-04-22-orbit-agent-context-scheme-a.md, 2026-04-22-orbit-agent-context-scheme-c.md, 2026-04-22-orbit-agent-context-scheme-d.md
---

# CLI Migration — 废弃 MCP，转向 `orbit` CLI

> 把 v1 MCP Server (`src/mcp/`) 的 agent 能力接口整体迁移到 `orbit` CLI。观察期内保留 MCP 代码在 git history 以备回退。

---

## Scope

- 新增 `orbit` CLI 入口 + IPC bridge
- 迁移 v1 MCP 7 个工具到对应 CLI 命令
- 新增 v2 所有业务能力的 CLI 命令（Inbox / Capture / Activity / Approval / Task / Project）
- Agent 的 context exposure 改为 `PATH` 前置 + `orbit --help` 自发现
- 废弃 `src/mcp/` 启动流程

---

## 架构

```
┌────────────────────────────┐
│  main process              │
│  ├── IPC handlers (业务层) │
│  └── CLI IPC server        │← 本地 socket / named pipe
└────────────┬───────────────┘
             │
     ┌───────┴───────┐
     │               │
  Renderer       orbit CLI
  (electron)     (Node script, spawned by agent)
```

**关键设计**：
- CLI 是**薄层** wrapper，通过 IPC 调用 main process 的业务 handler
- **不重复实现业务逻辑**——UI 和 CLI 共享同一个 handler
- CLI 不需要 Electron runtime，作为独立 Node CLI 启动
- IPC 传输：本地 Unix socket（macOS/Linux） / Named Pipe（Windows），由 electron main process 启动时监听

---

## 模块结构

```
src/cli/
├── index.ts                 # CLI 入口（bin/orbit 指向这里）
├── bridge.ts                # 连接 main process 的 IPC
├── output.ts                # human / json 格式化
├── errors.ts                # 统一错误和退出码
├── commands/
│   ├── search.ts
│   ├── cat.ts
│   ├── task.ts              # orbit task list/get/propose/update/deps/...
│   ├── project.ts
│   ├── inbox.ts
│   ├── capture/
│   │   ├── feed.ts
│   │   ├── library.ts
│   │   └── thought.ts
│   ├── activity.ts
│   ├── memory.ts
│   ├── approval.ts          # orbit approval list/resolve/...
│   ├── agent.ts             # orbit agent status/stop/...
│   └── auto_runner.ts       # orbit auto-runner status/start/stop
└── help/
    └── generate.ts          # 自动生成 orbit --help 内容
```

`bin/orbit` 是一个 shebang Node 脚本，运行 `dist/cli/index.js`。

---

## IPC Bridge

### 协议

```typescript
// src/cli/bridge.ts
interface CliRequest {
  id: string
  method: string         // 对应 IPC channel，如 'task:update'
  params: unknown
}

interface CliResponse {
  id: string
  ok: boolean
  data?: unknown
  error?: { code: string; message: string }
}
```

### 实现

1. CLI 启动时连接到 `<vault>/.orbit/cli-socket`（macOS/Linux）或命名管道（Win）
2. 发送请求 → main process IPC server 路由到对应 handler
3. 返回结果 → CLI 按 `--json` / 人类可读格式化输出

### Main process 端

```typescript
// src/main/cli_server/index.ts
export function startCliServer(): void {
  const server = net.createServer(socket => {
    socket.on('data', async buf => {
      const req: CliRequest = JSON.parse(buf.toString())
      const handler = cliHandlers.get(req.method)
      if (!handler) {
        socket.write(JSON.stringify({ id: req.id, ok: false,
          error: { code: 'unknown_method', message: req.method } }))
        return
      }
      try {
        const data = await handler(req.params)
        socket.write(JSON.stringify({ id: req.id, ok: true, data }))
      } catch (e) {
        socket.write(JSON.stringify({ id: req.id, ok: false,
          error: { code: 'handler_error', message: String(e) } }))
      }
    })
  })
  server.listen(getCliSocketPath())
}
```

---

## 命令清单（v2 目标集）

### 基础查询

| 命令 | v1 MCP 对应 | 说明 |
|------|------------|------|
| `orbit search <query>` | `search_vault` | 全局搜索（索引） |
| `orbit cat <path-or-uid>` | `get_file` | 读文件 |
| `orbit memory search <query>` | `search_memories` | 记忆检索 |
| `orbit memory save` | `save_memory` | 记忆保存（stdin 或 --file） |
| `orbit project graph [--uid X]` | `query_project_graph` | 项目图谱 |

### Task

| 命令 | 说明 |
|------|------|
| `orbit task list [--status S] [--project X]` | 列任务 |
| `orbit task get <uid>` | 读任务 |
| `orbit task update <uid> [--status S] [--depends-on uids]` | 更新 |
| `orbit task propose` | **替代 create_task**，走 approval flow |
| `orbit task propose-scope <current-uid>` | 扩范围审批 |
| `orbit task deps <uid>` | 显示依赖树 |
| `orbit task delete <uid>` | 删除（级联处理） |

### Project

| 命令 | 说明 |
|------|------|
| `orbit project list` | 列项目 |
| `orbit project get <uid>` | 项目元信息 |
| `orbit project archive <uid>` | 归档（走 approval） |

### Inbox

| 命令 | 说明 |
|------|------|
| `orbit inbox list [--category] [--subtype] [--status]` | 列条目 |
| `orbit inbox get <id>` | 读条目 |
| `orbit inbox resolve <id> --decision approve/reject --note ...` | 处理 |
| `orbit inbox dismiss <id>` | 忽略 |
| `orbit inbox archive <id>` | 归档 |
| `orbit inbox emit-message --type B1 --summary ...` | **agent 内部用**，emit 求助/警示事件 |

### Capture — Feed

| 命令 | 说明 |
|------|------|
| `orbit feed add <url>` | 添加订阅 |
| `orbit feed list-subscriptions` | 订阅源列表 |
| `orbit feed remove <id>` | 删订阅 |
| `orbit feed refresh [id]` | 手动刷新 |
| `orbit feed list [--unread]` | 列 feed 条目 |
| `orbit feed save <item-id> [--note ...]` | 升级到 Library |
| `orbit feed history search <query>` | Feed History 全文搜 |
| `orbit feed history purge --before DATE` | 清理旧归档 |

### Capture — Library

| 命令 | 说明 |
|------|------|
| `orbit library save <url> [--note ...]` | 保存文章 |
| `orbit library list [--status]` | 列 Library |
| `orbit library get <id>` | 读文章元信息 + 内容 |
| `orbit library mark-read <id>` | 标记 read |
| `orbit library promote <id>` | Promote to Resource |
| `orbit library dismiss <id>` | 丢弃 |

### Capture — Thought

| 命令 | 说明 |
|------|------|
| `orbit thought create [--content-file F] [--tags a,b]` | 创建 thought（长内容 stdin 或 --file） |
| `orbit thought list [--tag X]` | 列 thoughts |
| `orbit thought get <id>` |  |
| `orbit thought promote <id>` | Promote to Resource |
| `orbit thought link <id> --project <uid>` | Link to project |
| `orbit thought dismiss <id>` |  |

### Activity

| 命令 | 说明 |
|------|------|
| `orbit activity list [--from] [--to] [--actor] [--action] [--project-uid]` | 查活动 |
| `orbit activity summary --from -7d` | 按 action 分组 |

### Approval

| 命令 | 说明 |
|------|------|
| `orbit approval list [--pending]` | 列 proposal（底层存储视图，通常用 inbox 入口即可） |
| `orbit approval resolve <id> --decision ...` | 直接操作 proposal（等价 inbox resolve） |

### Auto-runner

| 命令 | 说明 |
|------|------|
| `orbit auto-runner status` | 当前运行状态 |
| `orbit auto-runner start` | 启动（若已关闭） |
| `orbit auto-runner stop` | 暂停 |
| `orbit agent list-runs` | 正在运行的 agent runs |
| `orbit agent stop <run-id>` | 中止某个 run |

### Run（agent 自己用）

| 命令 | 说明 |
|------|------|
| `orbit run request-merge [--summary-file F]` | Agent 请求合并（触发 A1 审批） |
| `orbit run report-progress --file F` | Agent 汇报进展到 Execution Log |
| `orbit run emit-insight --content "..."` | Agent emit C3 主动汇报事件 |

---

## `orbit --help` 自发现

Agent 启动时不需要在 system prompt 里塞所有命令——通过 `orbit --help` / `orbit <domain> --help` 按需发现。

### 顶层 help

```
$ orbit --help
Orbit CLI - 本地 AI 协作工作台命令接口

Usage: orbit <command> [args]

Available commands:
  search       全局搜索 (files, tasks, resources)
  cat          读取文件或 UID 对应的内容
  task         任务管理 (list / get / propose / update / deps ...)
  project      项目管理
  inbox        Inbox 事件处理 (list / resolve / dismiss ...)
  feed         Feed 订阅和浏览
  library      Library 文章管理
  thought      Thought 笔记
  activity     活动日志查询
  memory       记忆检索和保存
  approval     审批管理
  auto-runner  Auto-runner 状态
  agent        Agent run 管理
  run          Agent 自身使用的命令

Run `orbit <command> --help` for more info on a specific command.
Global flags: --json (structured output), --help
```

### 命令级 help

`orbit task --help` 列出 task 的所有子命令 + 参数 + 示例。

---

## Agent Context 改造

承接 ADR-008，Agent Context Architecture 系列 plan 被本 plan 取代。新方案极简：

### 1. `PATH` 前置

Agent 启动时的环境变量注入 `PATH=<vault>/.orbit/bin:$PATH`。`<vault>/.orbit/bin/orbit` 是一个 shim 脚本（指向 Orbit 安装路径的真实 CLI 二进制）。

### 2. System prompt 注入

简短提示：

```
You are an agent in Orbit. You have access to the `orbit` CLI for all
Orbit operations. Run `orbit --help` to discover available commands,
or `orbit <command> --help` for specific command usage.

All commands support `--json` for structured output and `--help` for
documentation. Use stdin or `--file` for long text content to avoid
shell quoting issues.
```

~80 tokens，固定开销。

### 3. 事件推送（stdin pipe）

Agent 需要接收主动推送的事件时，复用现有 hydration 机制：

```
[orbit-event] {"type":"dependency_satisfied","task_uid":"xxx"}
[orbit-event] {"type":"merge_approved","proposal_id":"yyy"}
```

Agent 的 hydration parser 识别这些行，转换为对 agent 的消息。

---

## 废弃 MCP 的步骤

### Phase 1：CLI 覆盖 MCP 全部能力（并行期）

- CLI 开发完成
- MCP 继续保留运行（但 Agent 提示改为"优先用 CLI"）
- 通过 Activity Log 对比 CLI 和 MCP 使用频率

### Phase 2：MCP 关闭（观察期）

- `.mcp.json` 不再写入新项目
- `src/mcp/server.ts` 启动流程关闭
- Agent 系统提示中移除 MCP 相关段落
- 代码保留，测试保留但标 `.skip`

### Phase 3：观察数据决定（可能回滚）

观察 1-2 个月：

- 如 agent CLI 错误率 < 3%：继续纯 CLI；考虑删除 MCP 代码
- 如 > 10%：有选择地恢复部分高价值能力的 MCP 接口（schema 约束强）
- 中间区间：保留 CLI 为主，根据具体问题类型考虑补 MCP

---

## 测试

- `tests/cli/bridge.test.ts` — IPC 协议
- `tests/cli/task.test.ts` — task 命令
- `tests/cli/output_json.test.ts` — 各命令 `--json` 契约
- `tests/cli/help.test.ts` — help 自发现
- `tests/cli/stdin_input.test.ts` — 长内容从 stdin 读
- `tests/cli/error_codes.test.ts` — 退出码规范
- `e2e/cli_agent_flow.spec.ts` — Agent 用 CLI 完成 propose → approve → run

---

## 打包与分发

### Electron 主应用内

- `electron.vite.config.ts` 加 CLI 构建配置 → 输出到 `out/cli/`
- Packaged app 里 `bin/orbit` 是 wrapper 脚本
- `<vault>/.orbit/bin/orbit` 在 vault 打开时创建 symlink / wrapper 指向 packaged CLI

### 开发时

- `npm run dev` 正常启动 Electron
- 另起 terminal：`npm run cli -- <args>` 手动测试 CLI
- 或者：`<repo>/bin/orbit <args>` 直接运行 dev CLI

---

## 风险

### Socket 权限/路径

不同 OS 上 socket 路径和权限不同。

**缓解**：
- macOS/Linux：`<vault>/.orbit/cli-socket` (Unix socket)
- Windows：命名管道 `\\.\pipe\orbit-<vault-hash>`
- 启动时测试连接，失败给清晰错误

### CLI 找不到 main process

用户没打开 Orbit 应用时 agent 调用 CLI 会失败。

**缓解**：
- 错误信息明确：`Orbit main process not running. Please open Orbit first.`
- 退出码 3（新增"无法连接 main process"）
- 文档提示：Auto-runner agent 必须在 Orbit 应用运行时工作

### Agent quote / escape 错误

复杂 JSON 参数通过命令行传容易出错。

**缓解**：
- 长内容走 stdin / `--file`
- 数组参数用逗号分隔（`--depends-on a,b,c`）
- 所有命令的 help 中给明确示例
- Agent 看到错误后可重试（LLM 通常能自修正）

---

## 验收

- [ ] `orbit --help` / `orbit <command> --help` 返回完整帮助
- [ ] 所有 v1 MCP 工具都有 CLI 等价命令，行为一致
- [ ] v2 新增命令（Inbox / Capture / Activity / Approval）全部可用
- [ ] Agent 通过 CLI 完成 propose → approval → run 的完整流程
- [ ] `--json` 输出格式稳定（有 schema 文档）
- [ ] 退出码符合约定
- [ ] MCP 启动流程已关闭（`.mcp.json` 不再写入）
- [ ] `src/mcp/` 保留但不在运行路径中
