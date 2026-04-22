# Orbit Agent Context Architecture — 方案 D 详细设计

## 1. 背景

方案 A 提出了标准化上下文包（Context Pack）+ CLI 适配层的路线，让 agent 在启动时拿到结构化的 Orbit 世界观和项目状态。方案 C 提出了更激进的 Agent Daemon / Broker 路线，由 Orbit 完全接管 agent 生命周期。

两者都有明确的价值，但也有各自的问题：

- **方案 A 的核心风险**：Orbit 需要维护一套 context pack 生成管线（生成、刷新、快照），并通过 wrapper / PATH 注入来保证 agent 确定性读取。这既增加了工程复杂度，也意味着 Orbit 要替 agent 决定"它需要知道什么"——而实际上，不同任务场景下 agent 需要的上下文差异很大。

- **方案 C 的核心风险**：工程量过重，产品边界漂移，当前阶段成本不合理。

方案 D 是在反思这两个路线后产生的。它的核心观察是：

> Orbit 已经有 MCP tools、有 `.agent/tasks/`、有 `Vision.md`、有 `AGENT.md`。agent 缺的不是"更多被推送的上下文文件"，而是**知道 Orbit 能干什么、自己该怎么干**的认知入口。

这和 agent skills 的模式完全一致：不是把所有知识灌进 system prompt，而是**给 agent 一个目录，让它按需加载自己需要的认知模块**。

---

## 2. 核心理念

方案 D 的一句话定义：

> **Orbit 通过 Skills（认知文档）教会 agent 怎么用 Orbit，通过 MCP Tools（能力接口）让 agent 调用 Orbit，通过操作日志（自然副产物）让 agent 和 Orbit 共同积累项目记忆。**

三层分工：

| 层 | 职责 | 形态 | 谁写 | 谁读 |
|---|---|---|---|---|
| **认知层：Skills** | 教 agent "Orbit 是什么、怎么做" | 静态 Markdown | Orbit 维护 | Agent 按需读取 |
| **能力层：MCP Tools** | 让 agent 调用 Orbit 能力 | MCP JSON-RPC | Orbit 实现 | Agent 调用 |
| **记忆层：操作日志** | 沉淀每次操作的痕迹 | 结构化 Markdown/JSON | MCP tools 自动写 | Agent / 人类 / Orbit 均可读 |

关键区别：

- **方案 A 是 Push 模型**：Orbit 生成上下文 → 推给 agent → agent 被动接收
- **方案 D 是 Pull 模型**：Orbit 提供 skills 目录 → agent 按需加载 → agent 主动获取

---

## 3. 为什么这个模式更自然

### 3.1 终端 agent 已经具备"自主获取上下文"的能力

Claude Code、Codex CLI、Gemini CLI 等现代终端 agent 都能：
- 读取文件系统
- 根据文件名 / 目录结构判断该读什么
- 按需加载上下文

这意味着 Orbit 不需要替 agent 把所有信息打包好，只需要提供一个**结构清晰、命名直觉的认知文件目录**，agent 自己会判断当前任务需要读哪些。

### 3.2 Skills 模式已经被验证

Amp agent skills、Claude Code 的 `CLAUDE.md` include 机制、Cursor rules 都证明了一个模式：

> 给 agent 一个 skill/rule 的目录和索引，比把所有内容塞进一个大文件更有效。

### 3.3 操作日志是最好的运行时上下文

方案 A 需要专门生成 `30-project-state.md`（git 状态）和 `70-recent-activity.md`（最近活动），这些文件需要定时刷新、需要生成管线。

但在方案 D 中，这些信息是 MCP 工具调用的**自然副产物**：
- agent 创建了一个 task → 日志记录了 `create_task`
- agent 提交了代码 → 日志记录了 `checkpoint_commit`
- agent 更新了任务状态 → 日志记录了 `update_task_status`

不需要额外生成，天然保鲜，天然完整。

---

## 4. 架构设计

### 4.1 目录结构

```text
<project>/
  .agent/
    skills/                        # 认知层：Orbit 提供的 skills
      _index.md                    # 技能索引：列出所有 skill 及简要说明
      orbit-world.md               # Orbit 世界模型与核心概念
      task-workflow.md             # 任务创建、状态流转、执行日志
      project-understanding.md     # 如何理解当前项目目标和约束
      tooling-commands.md          # 构建/测试/运行命令
      worktree-workflow.md         # Worktree 使用场景与流程
      safety-rules.md              # 安全边界与操作规则
      mcp-tools.md                 # 可用 MCP 工具及使用指南
    tasks/                         # 已有：任务文件
    memories/                      # 已有：长期记忆
    logs/                          # 记忆层：操作日志（新增）
      operations.jsonl             # 结构化操作流水
      TIMELINE.md                  # 人/agent 可读的操作时间线
    config.json                    # 已有：项目配置
  AGENT.md                         # 已有：人类维护的 agent persona
  CLAUDE.md                        # 适配入口（轻量，指向 skills）
  README.md                        # 已有：项目说明
  .mcp.json                        # 已有：MCP 配置
```

### 4.2 与现有基础设施的关系

```text
已有（不改）          新增                        增强
─────────────        ─────────────              ─────────────
.mcp.json            .agent/skills/*            MCP tools（加日志）
AGENT.md             .agent/logs/               CLAUDE.md（改为索引）
.agent/tasks/        
.agent/memories/     
.agent/config.json   
Vision.md            
```

方案 D 的改动面很小：新增 skills 目录、新增 logs 目录、MCP tools 加操作日志、CLAUDE.md 改为轻量索引。不需要 wrapper、不需要 PATH 注入、不需要 context pack 生成管线。

---

## 5. 认知层：Skills 详细设计

### 5.1 设计原则

- **静态文档**：skills 是 Orbit 维护的 Markdown 文件，不需要运行时生成
- **按需加载**：agent 根据当前任务选择性读取，不要求全部加载
- **命名直觉**：文件名即内容描述，agent 看到目录就知道该读什么
- **可演进**：新增 skill 只需要加文件 + 更新索引

### 5.2 `_index.md`：技能索引

这是 agent 的唯一入口点。CLAUDE.md 会指向它。

```markdown
# Orbit Agent Skills

以下是在 Orbit 工作台中工作时可用的技能指南。根据当前任务按需阅读。

| Skill | 文件 | 说明 |
|---|---|---|
| Orbit 世界模型 | `orbit-world.md` | Orbit 是什么、PARA/Project/Task/Worktree 概念 |
| 任务工作流 | `task-workflow.md` | 如何创建、管理、推进任务 |
| 项目理解 | `project-understanding.md` | 如何理解当前项目目标与约束 |
| 工具与命令 | `tooling-commands.md` | 项目的构建/测试/运行命令 |
| Worktree 工作流 | `worktree-workflow.md` | 何时以及如何使用 worktree |
| 安全规则 | `safety-rules.md` | 操作边界与安全约束 |
| MCP 工具指南 | `mcp-tools.md` | 可用的 Orbit MCP 工具及使用方式 |

## 操作记录
`.agent/logs/TIMELINE.md` 包含本项目的历史操作记录，可用于恢复上下文。
```

### 5.3 各 Skill 内容概要

#### `orbit-world.md` — Orbit 世界模型

覆盖内容（对应方案 A 的 `00-orbit.md`）：
- Orbit 是什么：个人愿景驱动的 AI 协作工作台
- 核心概念：Vault / PARA / Project / Task / Worktree / Night Shift / Distill
- Agent 在 Orbit 中的角色：不是聊天助手，而是工作流参与者
- Orbit 的透明性原则：一切都是 Markdown + Git + 本地文件

#### `task-workflow.md` — 任务工作流

覆盖内容（对应方案 A 的 `60-open-tasks.md` 的认知部分）：
- Task 的四段式结构：Description / Agent Thinking / Execution Log / Summary
- 状态流转：inbox → today → doing → blocked → done
- 如何使用 MCP tools 操作 task：`create_task` / `update_task_status` / `append_execution_log` / `log_thinking`
- 何时创建 task vs 直接执行
- Task 目录在哪里：`.agent/tasks/`

#### `project-understanding.md` — 项目理解

覆盖内容（对应方案 A 的 `10-vault-vision.md` + `20-project-brief.md`）：
- 如何获取项目目标：读 `README.md` frontmatter 和正文
- 如何获取工作人格：读 `AGENT.md`
- 如何获取长期方向：调用 `get_vision` MCP tool
- 如何获取项目配置：读 `.agent/config.json`
- 如何了解最近状态：读 `.agent/logs/TIMELINE.md`

**关键区别**：方案 A 由 Orbit 生成项目简报（`20-project-brief.md`），方案 D 教 agent 自己去读原始文件。这避免了信息的重复和过时问题。

#### `tooling-commands.md` — 工具与命令

覆盖内容（对应方案 A 的 `40-tooling-and-commands.md`）：
- 如何发现项目命令：读 `package.json` scripts / `Makefile` / `Cargo.toml`
- 常见命令模式：build / test / lint / dev
- 如何安全执行：用 `checkpoint_commit` 保存节点
- 危险命令提醒

**注意**：这个 skill 可以是 Orbit 根据模板自动生成的，不同模板（Node/Python/Rust）生成不同内容。

#### `worktree-workflow.md` — Worktree 工作流

覆盖内容（方案 A 没有单独覆盖，但属于 `00-orbit.md` 的一部分）：
- 什么是 Orbit worktree
- 何时应该使用 worktree：大改动、实验性探索、并行任务
- 如何创建和管理 worktree
- Worktree 与 task 的关系

#### `safety-rules.md` — 安全规则

覆盖内容（对应方案 A 的 `50-operating-rules.md`）：
- 小步提交，可逆操作
- 不越过项目边界
- 不fabricate信息，不确定时显式说明
- 修改任务相关内容时更新 task markdown
- 不把临时状态写到源码目录
- 对 vault 外文件要显式确认

**这个 skill 的部分核心规则建议内联到 CLAUDE.md**，不依赖 agent 主动加载。

#### `mcp-tools.md` — MCP 工具指南

这是方案 D 独有的 skill，在方案 A 中没有对应物。覆盖内容：
- 当前项目可用的 MCP tools 列表及用途
- 每个 tool 的使用场景和推荐时机
- 工具间的协作模式（例：创建 task → 更新状态 → 追加日志 → 提交代码）
- 常见工作流示例

### 5.4 Skills 的生成策略

Skills 分为两类：

**通用 skills（跨项目共享）：**
- `orbit-world.md`
- `task-workflow.md`
- `safety-rules.md`
- `mcp-tools.md`
- `worktree-workflow.md`

这些由 Orbit 在创建项目时从内置模板复制到 `.agent/skills/`。升级 Orbit 时可选择性更新。

**项目特化 skills（按模板/项目定制）：**
- `project-understanding.md` — 通用模板，但指向具体项目文件路径
- `tooling-commands.md` — 根据项目模板（Node/Python/Rust/Writing）生成不同内容

---

## 6. 能力层：MCP Tools 增强

### 6.1 现有工具不变

当前 7 个 MCP tools 保持原样：
- `create_task`
- `update_task_status`
- `append_execution_log`
- `log_thinking`
- `get_vision`
- `search_global_context`
- `checkpoint_commit`

### 6.2 所有工具调用写操作日志

这是方案 D 的关键增强。每次 MCP tool 被调用时，无论成功失败，都向 `.agent/logs/operations.jsonl` 追加一条记录：

```jsonl
{"ts":"2026-04-22T10:30:00Z","tool":"create_task","args":{"title":"实现登录页面"},"result":{"uid":"abc123"},"ok":true}
{"ts":"2026-04-22T10:35:00Z","tool":"update_task_status","args":{"task_uid":"abc123","status":"doing"},"ok":true}
{"ts":"2026-04-22T11:15:00Z","tool":"checkpoint_commit","args":{"message":"feat: login page scaffold","task_uid":"abc123"},"result":{"sha":"a1b2c3d"},"ok":true}
{"ts":"2026-04-22T11:20:00Z","tool":"update_task_status","args":{"task_uid":"abc123","status":"done"},"ok":true}
```

实现方式：在 `callTool` 函数中加一层 wrapper，所有工具共享同一个日志写入逻辑。改动量极小。

### 6.3 可选：新增便利工具

根据 skills 的需求，可以考虑新增少量工具：

| 工具 | 用途 | 优先级 |
|---|---|---|
| `list_tasks` | 列出当前项目所有任务的 uid/title/status | 高 |
| `get_project_state` | 返回项目的 git 状态 + 活跃任务摘要 | 中 |
| `read_operation_log` | 读取最近 N 条操作记录 | 中 |

这些工具的价值在于：agent 不需要自己去 parse 文件系统和 git 命令，可以通过 MCP 获得结构化数据。它们的调用同样会被记录到操作日志中。

---

## 7. 记忆层：操作日志详细设计

### 7.1 设计目标

操作日志系统要满足以下需求：

1. **可查询**：能按终端会话、项目、日期、工具名、任务等维度筛选
2. **低成本**：是 MCP 工具调用的自然副产物，不需要额外生成管线
3. **双消费**：机器可程序化分析（JSONL），人/agent 可直接阅读（Markdown）
4. **可追溯**：每条记录都能关联到具体的会话、项目、任务

### 7.2 日志记录 Schema

每条操作日志是一行 JSON，包含以下字段：

```typescript
interface OperationLogEntry {
  /** ISO-8601 时间戳 */
  ts: string;

  /** 调用的 MCP tool 名称 */
  tool: string;

  /** 传入参数（原样记录，敏感字段可脱敏） */
  args: Record<string, unknown>;

  /** 工具返回的结果摘要（成功时） */
  result?: Record<string, unknown>;

  /** 错误信息（失败时） */
  error?: string;

  /** 是否成功 */
  ok: boolean;

  /** 执行耗时（毫秒） */
  durationMs: number;

  // ---- 查询维度字段 ----

  /** 项目 UID */
  projectUid: string;

  /** 项目 slug */
  projectSlug: string;

  /** MCP server 进程的 PID，作为会话标识
   *  同一个 MCP server 进程 = 同一个终端会话发起的同一批调用。
   *  MCP server 是 per-terminal-session 的 stdio 子进程，
   *  PID 天然唯一且在进程存活期间不变。 */
  sessionPid: number;

  /** 关联的 task UID（如果工具参数中包含 task_uid） */
  taskUid?: string;

  /** 日期分区键（YYYY-MM-DD，用于按天查询和归档） */
  date: string;
}
```

示例记录：

```jsonl
{"ts":"2026-04-22T10:30:12.345Z","tool":"create_task","args":{"title":"实现登录页面","priority":"high"},"result":{"uid":"abc123","path":"/vault/01_Projects/foo/.agent/tasks/20260422_implement-login.md"},"ok":true,"durationMs":12,"projectUid":"proj_x1y2z3","projectSlug":"foo","sessionPid":48230,"date":"2026-04-22"}
{"ts":"2026-04-22T10:35:08.100Z","tool":"update_task_status","args":{"task_uid":"abc123","status":"doing"},"ok":true,"durationMs":8,"projectUid":"proj_x1y2z3","projectSlug":"foo","sessionPid":48230,"taskUid":"abc123","date":"2026-04-22"}
{"ts":"2026-04-22T11:15:22.500Z","tool":"checkpoint_commit","args":{"message":"feat: login page scaffold","task_uid":"abc123"},"result":{"committed":true,"sha":"a1b2c3d4"},"ok":true,"durationMs":340,"projectUid":"proj_x1y2z3","projectSlug":"foo","sessionPid":48230,"taskUid":"abc123","date":"2026-04-22"}
{"ts":"2026-04-22T14:00:05.200Z","tool":"create_task","args":{"title":"修复样式问题"},"result":{"uid":"def456"},"ok":true,"durationMs":10,"projectUid":"proj_x1y2z3","projectSlug":"foo","sessionPid":51002,"date":"2026-04-22"}
```

#### 为什么用 `sessionPid` 而不是终端 pane ID

Orbit 的终端会话有两层 ID：renderer 侧的 leaf ID（UI pane）和 main 侧的 PTY session ID（`nanoid(10)`）。但 MCP server 是被 Claude Code 通过 `.mcp.json` 作为 stdio 子进程启动的，**不经过 Orbit 的 PTY manager**，所以它拿不到 Orbit 的终端 session ID。

然而 MCP server 的 `process.pid` 是天然可用的：
- 同一个终端会话里的 Claude Code 启动的 MCP server 进程是同一个（stdio 长连接）
- 不同终端会话的 Claude Code 会启动不同的 MCP server 进程
- PID 在进程生命周期内唯一且不变

所以 `sessionPid = process.pid` 就是最简单、最准确的会话标识。

### 7.3 存储设计

#### 文件布局

```text
<project>/.agent/logs/
  operations.jsonl          # 主日志文件（追加写入）
  TIMELINE.md               # 人/agent 可读时间线
  archive/                  # 归档目录
    operations.2026-04-15.jsonl.gz
    operations.2026-04-08.jsonl.gz
```

#### 为什么选 JSONL 而不是 SQLite

| 维度 | JSONL | SQLite |
|---|---|---|
| 写入方式 | 追加，无锁 | 需要事务 |
| 并发安全 | 多进程追加安全（OS 保证 < PIPE_BUF 原子写） | 需要 WAL 模式 |
| 可读性 | `cat` / `grep` / `jq` 即可查 | 需要 sqlite3 CLI |
| Git 友好 | 可 diff、可 merge | 二进制，不可 diff |
| Agent 可消费 | 直接读文件 | 需要工具 |
| 依赖 | 零 | 需要 better-sqlite3 等 native 模块 |

JSONL 在 Orbit 场景下完全够用。操作日志的量级是每个项目每天几十到几百条，不需要数据库级别的查询能力。

#### `TIMELINE.md`：人/agent 可读格式

与 `operations.jsonl` 同步维护，按天分组：

```markdown
# 操作时间线

## 2026-04-22

### 会话 48230
- 10:30 — 创建任务「实现登录页面」(uid: abc123, priority: high)
- 10:35 — 任务 abc123 状态：inbox → doing
- 11:15 — 提交代码：feat: login page scaffold (sha: a1b2c3d4, task: abc123)

### 会话 51002
- 14:00 — 创建任务「修复样式问题」(uid: def456)

## 2026-04-21

### 会话 42100
- 09:15 — 获取 Vision
- 09:20 — 搜索全局上下文：「认证方案」(5 hits)
- 10:00 — 创建任务「设计认证模块」(uid: xyz789)
```

TIMELINE.md 的价值：
- Agent 恢复上下文时直接读这个文件，比 parse JSONL 更高效
- 按会话分组，让 agent 能理解"哪些操作是同一次工作会话中完成的"
- 人类也能直接阅读

### 7.4 MCP 层实现方案

#### 核心改动：`callTool` 加日志 wrapper

在 `src/mcp/tools.ts` 中，改动点只有一个——给 `callTool` 加一层拦截：

```typescript
// src/mcp/oplog.ts — 新文件，~60 行

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECT_AGENT_DIR } from '@shared/constants';
import type { ToolCallResult, ToolContext } from './tools';

const LOGS_DIR = 'logs';
const OPS_FILE = 'operations.jsonl';
const TIMELINE_FILE = 'TIMELINE.md';

export interface OpLogEntry {
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  ok: boolean;
  durationMs: number;
  projectUid: string;
  projectSlug: string;
  sessionPid: number;
  taskUid?: string;
  date: string;
}

function extractTaskUid(args: Record<string, unknown>): string | undefined {
  const v = args['task_uid'];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function projectLogsDir(ctx: ToolContext): string {
  return path.join(
    ctx.vault, '01_Projects', ctx.projectSlug,
    PROJECT_AGENT_DIR, LOGS_DIR
  );
}

export async function writeOpLog(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  result: ToolCallResult,
  durationMs: number
): Promise<void> {
  const dir = projectLogsDir(ctx);
  await fs.mkdir(dir, { recursive: true });

  const now = new Date();
  const entry: OpLogEntry = {
    ts: now.toISOString(),
    tool,
    args,
    ok: !result.isError,
    durationMs,
    projectUid: ctx.projectUid,
    projectSlug: ctx.projectSlug,
    sessionPid: process.pid,
    taskUid: extractTaskUid(args),
    date: now.toISOString().slice(0, 10)
  };

  // 成功时记录结果摘要，失败时记录错误文本
  if (result.isError) {
    entry.error = result.content[0]?.text ?? 'unknown error';
  } else {
    try {
      entry.result = JSON.parse(result.content[0]?.text ?? '{}');
    } catch {
      entry.result = { text: result.content[0]?.text };
    }
  }

  // 追加 JSONL
  const jsonlPath = path.join(dir, OPS_FILE);
  await fs.appendFile(jsonlPath, JSON.stringify(entry) + '\n', 'utf8');

  // 追加 TIMELINE.md
  await appendTimeline(dir, entry);
}

async function appendTimeline(dir: string, e: OpLogEntry): Promise<void> {
  const file = path.join(dir, TIMELINE_FILE);
  const time = e.ts.slice(11, 16); // HH:MM
  const line = formatTimelineLine(e, time);

  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    content = '# 操作时间线\n';
  }

  const dayHeader = `## ${e.date}`;
  const sessionHeader = `### 会话 ${e.sessionPid}`;

  if (!content.includes(dayHeader)) {
    // 新的一天：在文件头部（# 操作时间线 之后）插入日期和会话块
    const insertPos = content.indexOf('\n') + 1;
    content =
      content.slice(0, insertPos) + '\n' +
      dayHeader + '\n\n' +
      sessionHeader + '\n' +
      line + '\n' +
      content.slice(insertPos);
  } else if (!content.includes(sessionHeader)) {
    // 同一天但新会话：在日期块末尾追加会话块
    const dayPos = content.indexOf(dayHeader);
    const nextDayPos = content.indexOf('\n## ', dayPos + dayHeader.length);
    const insertPos = nextDayPos === -1 ? content.length : nextDayPos;
    content =
      content.slice(0, insertPos) + '\n' +
      sessionHeader + '\n' +
      line + '\n' +
      content.slice(insertPos);
  } else {
    // 同一天同一会话：在会话块末尾追加
    const sessionPos = content.indexOf(sessionHeader);
    const nextSectionPos = content.indexOf('\n### ', sessionPos + sessionHeader.length);
    const nextDayPos = content.indexOf('\n## ', sessionPos + sessionHeader.length);
    let insertPos = content.length;
    if (nextSectionPos !== -1 && nextDayPos !== -1) {
      insertPos = Math.min(nextSectionPos, nextDayPos);
    } else if (nextSectionPos !== -1) {
      insertPos = nextSectionPos;
    } else if (nextDayPos !== -1) {
      insertPos = nextDayPos;
    }
    content = content.slice(0, insertPos) + line + '\n' + content.slice(insertPos);
  }

  await fs.writeFile(file, content, 'utf8');
}

function formatTimelineLine(e: OpLogEntry, time: string): string {
  switch (e.tool) {
    case 'create_task':
      return `- ${time} — 创建任务「${e.args['title']}」` +
        `(uid: ${(e.result as any)?.uid ?? '?'}` +
        (e.args['priority'] ? `, priority: ${e.args['priority']}` : '') + ')';
    case 'update_task_status':
      return `- ${time} — 任务 ${e.taskUid} 状态 → ${e.args['status']}`;
    case 'append_execution_log':
      return `- ${time} — 任务 ${e.taskUid} 追加执行日志`;
    case 'log_thinking':
      return `- ${time} — 任务 ${e.taskUid} 记录思考`;
    case 'get_vision':
      return `- ${time} — 获取 Vision`;
    case 'search_global_context':
      return `- ${time} — 搜索全局上下文：「${e.args['query']}」` +
        `(${(e.result as any)?.hits?.length ?? 0} hits)`;
    case 'checkpoint_commit':
      return `- ${time} — 提交代码：${e.args['message']}` +
        ((e.result as any)?.sha ? ` (sha: ${((e.result as any).sha as string).slice(0, 7)})` : '') +
        (e.taskUid ? ` (task: ${e.taskUid})` : '');
    default:
      return `- ${time} — ${e.tool}(${JSON.stringify(e.args)})` +
        (e.ok ? '' : ` ❌ ${e.error}`);
  }
}
```

#### `callTool` 的改动

在 `src/mcp/tools.ts` 的 `callTool` 中加 wrapper：

```typescript
// 修改前
export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  switch (name) {
    case 'create_task': return createTaskTool(ctx, args);
    // ...
  }
}

// 修改后
import { writeOpLog } from './oplog';

export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const start = Date.now();
  const result = await callToolInner(ctx, name, args);
  const durationMs = Date.now() - start;

  // 异步写日志，不阻塞工具返回
  writeOpLog(ctx, name, args, result, durationMs).catch(() => {});

  return result;
}

async function callToolInner(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  switch (name) {
    case 'create_task': return createTaskTool(ctx, args);
    // ... 原有 switch 不变
  }
}
```

**改动量**：原有 `callTool` 函数拆成 `callTool`（wrapper）+ `callToolInner`（原逻辑），加上 `oplog.ts` 新文件，总共约 100 行新代码。

#### 关键设计决策

1. **异步写入，不阻塞**：`writeOpLog(...).catch(() => {})` 确保日志写入失败不影响工具调用本身
2. **日志写入是 append-only**：JSONL 追加写入，并发安全（单行 < 4KB，远小于 PIPE_BUF）
3. **不记录 `get_vision` 和 `search_global_context` 的完整返回内容**：这两个工具的返回可能很大，result 字段只记录摘要（如搜索命中数）

### 7.5 查询设计

#### 方式一：Agent 直接读文件

Agent 可以直接读取 `TIMELINE.md` 来恢复上下文，或用 `grep` / `cat` 读取 `operations.jsonl` 并 parse。这是最简单的方式，适合大多数场景。

#### 方式二：`query_operation_log` MCP 工具（Phase 2）

提供结构化查询能力：

```typescript
// 新增 MCP tool 定义
{
  name: 'query_operation_log',
  description: 'Query operation logs for this project. Supports filtering by date, session, tool, and task.',
  inputSchema: {
    type: 'object',
    properties: {
      date:      { type: 'string', description: 'Filter by date (YYYY-MM-DD)' },
      sessionPid:{ type: 'number', description: 'Filter by terminal session PID' },
      tool:      { type: 'string', description: 'Filter by tool name' },
      taskUid:   { type: 'string', description: 'Filter by related task UID' },
      limit:     { type: 'number', description: 'Max entries to return (default 50, newest first)', minimum: 1, maximum: 200 },
      offset:    { type: 'number', description: 'Skip N entries for pagination', minimum: 0 }
    }
  }
}
```

实现逻辑：读取 `operations.jsonl`，按条件过滤，返回结果。

查询示例：

```jsonc
// "今天发生了什么"
{ "date": "2026-04-22" }

// "这个终端会话做了什么"
{ "sessionPid": 48230 }

// "这个任务的操作历史"
{ "taskUid": "abc123" }

// "最近的代码提交"
{ "tool": "checkpoint_commit", "limit": 10 }

// "昨天下午的任务创建"
{ "date": "2026-04-21", "tool": "create_task" }

// 组合查询："这个会话中与某任务相关的操作"
{ "sessionPid": 48230, "taskUid": "abc123" }
```

#### 查询维度总结

| 查询维度 | 字段 | 使用场景 |
|---|---|---|
| **按时间** | `date` (YYYY-MM-DD) | "今天做了什么"、"昨天发生了什么" |
| **按会话** | `sessionPid` | "这个终端会话的操作历史"、"上一次会话做了什么" |
| **按项目** | `projectUid` / `projectSlug` | 已通过文件路径隔离（每个项目独立 logs 目录）|
| **按工具** | `tool` | "最近的提交记录"、"所有任务创建操作" |
| **按任务** | `taskUid` | "这个任务经历了哪些操作" |
| **组合查询** | 以上任意组合 | "今天这个会话中关于某任务的操作" |

### 7.6 日志轮转与归档

#### 触发条件

- **按大小**：`operations.jsonl` 超过 500KB 时触发归档
- **按时间**：保留最近 14 天的记录在主文件中

#### 归档流程

```text
operations.jsonl (> 500KB)
  ↓ 归档 14 天前的记录
  ├── archive/operations.2026-04-08.jsonl.gz
  └── operations.jsonl (只保留最近 14 天)
```

#### TIMELINE.md 轮转

- 保留最近 7 天
- 更早的内容删除（JSONL 归档中仍有完整记录）
- 控制 TIMELINE.md 大小，避免 agent 读取时消耗过多 token

#### 轮转时机

- MCP server 启动时检查一次
- 每次写入时如果文件大小超过阈值则触发

### 7.7 为什么操作日志比生成快照更好

| 维度 | 方案 A 的生成快照 | 方案 D 的操作日志 |
|---|---|---|
| **生成成本** | 需要生成管线 + 刷新触发器 | 零额外成本，是工具调用的副产物 |
| **保鲜度** | 取决于刷新频率 | 实时，每次操作即写入 |
| **信息完整度** | 快照只能捕捉某一时刻的状态 | 日志包含完整操作历史和因果链 |
| **恢复上下文** | agent 看到的是"当前状态" | agent 看到的是"怎么到达当前状态的" |
| **跨会话连续性** | 需要 SESSION_BRIEF 机制 | 自然连续，新 session 读日志即可恢复 |
| **会话维度** | 无法区分不同终端会话的操作 | `sessionPid` 天然隔离不同会话 |

### 7.8 操作日志的额外价值

操作日志不只服务于 agent 上下文恢复，还能被 Orbit 自身利用：

- **Project Dashboard**：显示最近操作轨迹，按会话分组
- **Night Shift 报告**：自动从日志生成"今晚做了什么"的摘要
- **Daily Review**：Distill 流程可以从日志中提取待回顾的操作
- **调试与审计**：agent 做了什么、什么时候做的、结果如何，一目了然
- **成本归因**：结合 `durationMs` 和会话信息，可以分析不同工作流的效率

---

## 8. 适配入口：CLAUDE.md 设计

方案 D 中 `CLAUDE.md` 的角色不是"上下文包入口"，而是"最小必要认知 + 技能索引"。

```markdown
# Orbit Project

你正在 Orbit 工作台的一个项目中工作。Orbit 是个人愿景驱动的 AI 协作工作台，
所有项目数据都以 Markdown + Git 形式存储在本地 vault 中。

## 安全规则（必须遵守）
- 小步提交，保持可逆
- 不越过项目边界修改文件
- 不确定时显式说明，不要编造
- 修改任务相关内容时更新对应 task markdown

## 技能指南
`.agent/skills/_index.md` 列出了所有可用的 Orbit 工作技能，根据当前任务按需阅读。

## 操作记录
`.agent/logs/TIMELINE.md` 包含本项目的历史操作记录，可用于恢复上下文和了解近期进展。

## MCP 工具
本项目已配置 Orbit MCP server，提供任务管理、代码提交、知识检索等工具。
详见 `.agent/skills/mcp-tools.md`。
```

**设计要点**：
- 安全规则内联，不依赖 agent 主动读取
- 其他认知通过指向 skills 目录实现按需加载
- 总长度控制在 20 行以内，对 token 预算友好

---

## 9. 用户旅程

### 旅程 A：新建项目后第一次运行 Claude

1. 用户点击 `+ New Project`，选择模板
2. Orbit 创建 README / AGENT / `.agent/config.json` / `.mcp.json`（已有）
3. Orbit 同时生成 `.agent/skills/` 目录和 `CLAUDE.md`（新增）
4. 用户进入 Terminal tab，输入 `claude`
5. Claude 读取 `CLAUDE.md`，知道自己在 Orbit 中
6. 用户说"帮我搭建项目脚手架"
7. Claude 按需读取 `tooling-commands.md`，了解项目构建方式
8. Claude 调用 `create_task` 创建任务 → 操作自动写入日志
9. Claude 执行命令、提交代码 → 调用 `checkpoint_commit` → 日志记录

**不需要 wrapper**。Claude 通过 `CLAUDE.md` + skills 目录自然进入 Orbit 语境。

### 旅程 B：项目做了一半，用户回来继续

1. 用户几天后重新打开项目
2. 在终端运行 `claude`
3. Claude 读取 `CLAUDE.md`，看到有操作记录
4. Claude 读取 `.agent/logs/TIMELINE.md`，看到：
   - 上次创建了哪些任务
   - 哪些已完成、哪些还在进行
   - 最近一次提交是什么
5. Claude 自然知道"从哪里继续"
6. 用户说"继续昨天的工作"
7. Claude 按需读取 `task-workflow.md`，然后查看 `.agent/tasks/` 中的任务

**不需要生成快照**。操作日志就是最好的"最近发生了什么"。

### 旅程 C：用户从 task 卡片开始工作

1. 用户在 Kanban 中选中一个 task
2. 用户在终端告诉 Claude："帮我做 task abc123"
3. Claude 读取 `task-workflow.md`，了解 task 结构
4. Claude 打开 `.agent/tasks/abc123.md`，读取任务描述
5. Claude 调用 `update_task_status` 把状态改为 doing
6. Claude 边工作边调用 `append_execution_log` 记录进展
7. 完成后调用 `checkpoint_commit` 并标记 done
8. 整个过程自动沉淀到操作日志中

### 旅程 D：外部终端直接进入项目

1. 用户在系统终端 `cd 01_Projects/foo`
2. 运行 `claude`
3. Claude 发现 `CLAUDE.md` 和 `.agent/skills/`，进入 Orbit 语境
4. `.mcp.json` 让 Claude 连接 Orbit MCP server
5. 体验与 Orbit 内几乎一致

**不依赖 Orbit 终端的 wrapper 或 PATH 注入**。

---

## 10. 与方案 A 和方案 C 的对比

| 维度 | 方案 A | 方案 C | 方案 D |
|---|---|---|---|
| **上下文模型** | Push：Orbit 生成 pack 推给 agent | Push：Broker 分配 session context | Pull：Agent 从 skills 主动获取 |
| **确定性交付** | 靠 wrapper + PATH 注入 | 靠 Broker 启动 | 靠 `CLAUDE.md` 指向 skills（足够） |
| **运行时状态** | 需要生成 `30-project-state.md` | Broker 持续同步 | 操作日志自然积累 |
| **工程复杂度** | 中（生成管线 + adapter + wrapper） | 高（Broker + Session + Policy） | **低**（skills 文件 + 日志 wrapper） |
| **对 Orbit 代码的改动** | 大（新增 context 生成子系统） | 很大（新增 runtime 子系统） | **小**（MCP 加日志、模板加 skills） |
| **多 agent 支持** | 需要 per-CLI adapter | 需要 per-CLI profile | 天然支持（skills 是通用 Markdown） |
| **记忆沉淀** | 无（快照只捕捉当前态） | Session log（if implemented） | **自动**（操作日志是工具副产物） |
| **跨会话连续性** | 需要 SESSION_BRIEF 机制 | 需要 session resume | 自然连续（读日志即可） |
| **向方案 C 演进** | 是 C 的前置基础 | 终态 | 同样是 C 的前置基础 |

### 方案 D 相对方案 A 的核心优势

1. **不需要生成管线**：skills 是静态文档，不需要运行时生成和刷新
2. **不需要 wrapper**：`CLAUDE.md` + skills 目录已经足够让 agent 建立认知
3. **运行时状态是免费的**：操作日志作为 MCP 工具调用的副产物自动产生
4. **agent 自主性更强**：由 agent 决定读什么，而不是 Orbit 替 agent 决定
5. **改动面更小**：核心改动只有 MCP 加日志 + 模板加 skills + CLAUDE.md 改写

### 方案 D 与方案 A 的关系

方案 D 不是对方案 A 的否定，而是对同一个问题的更轻量解法。两者共享相同的核心信念：

> Agent 需要理解 Orbit 的世界模型、项目目标、操作规则和当前状态。

区别在于**交付方式**：A 是 Orbit 打包递送，D 是 Orbit 提供目录让 agent 自取。

---

## 11. 风险与应对

### 风险 1：Agent 不读 skills，直接乱做

**应对**：
- 核心安全规则内联到 `CLAUDE.md`，不依赖 agent 主动读取
- MCP tool description 中嵌入操作提示（如 `create_task` 的 description 已经说明了用途）
- 实践表明，Claude Code 对 `CLAUDE.md` 的遵循度很高

### 风险 2：Agent 读了错误的 skill 或漏读关键 skill

**应对**：
- `_index.md` 的表格设计让 agent 能快速判断需要哪个 skill
- Skill 文件名使用直觉命名，降低误判
- 关键规则（安全边界）不放在 skill 中，而是内联到 `CLAUDE.md`

### 风险 3：操作日志增长过快

**应对**：
- JSONL 保留最近 500 条，TIMELINE.md 保留最近 7 天
- 超出部分自动归档
- 只记录 MCP tool 调用，不记录普通终端命令

### 风险 4：不同 agent 对 skills 目录的发现能力不一致

**应对**：
- `CLAUDE.md` 是 Claude Code 的确定入口
- 未来可以为其他 agent 生成对应的入口文件（`CODEX.md` / `GEMINI.md`）
- Skills 本身是通用 Markdown，任何 agent 都能读

### 风险 5：Skills 内容过时

**应对**：
- 通用 skills 随 Orbit 版本更新（Orbit 升级时可选择性刷新）
- 项目特化 skills（tooling-commands.md）可被用户/agent 修改
- Skills 本身是静态认知，不含运行时数据，过时风险远低于方案 A 的生成快照

---

## 12. 落地顺序

### Phase 1：Skills + 操作日志基础（最小可用）

**目标**：让 `claude` 在 Orbit 项目里"懂 Orbit"

- [ ] 编写 7 个 skill 文件内容
- [ ] 项目模板中加入 `.agent/skills/` 目录
- [ ] MCP `callTool` 加日志 wrapper，写 `operations.jsonl` + `TIMELINE.md`
- [ ] 改写 `CLAUDE.md` 为轻量索引格式
- [ ] 已有项目的迁移：提供 migration 在 `.agent/` 下创建 skills 和 logs 目录

**预计改动**：
- 新增 ~7 个 Markdown 文件（skill 内容）
- `src/mcp/tools.ts`：`callTool` 加 ~30 行日志 wrapper
- `src/main/templates/`：模板增加 skills 文件
- `src/main/migrations.ts`：新增 migration

### Phase 2：便利工具 + 日志增强

**目标**：让 agent 更高效地与 Orbit 交互

- [ ] 新增 `list_tasks` MCP tool
- [ ] 新增 `get_project_state` MCP tool
- [ ] 新增 `read_operation_log` MCP tool
- [ ] 日志轮转机制
- [ ] TIMELINE.md 自动归档

### Phase 3：Skills 动态化 + 多 agent 入口

**目标**：让 skills 更智能，支持更多 agent

- [ ] `tooling-commands.md` 根据项目实际 `package.json` / `Makefile` 自动生成
- [ ] 生成 `CODEX.md` / `GEMINI.md` 等适配入口
- [ ] 用户可自定义 project-level skills

### Phase 4：向方案 C 演进的桥梁

当以下信号出现时，从 D 向 C 过渡：

- [ ] 操作日志成为 Orbit Dashboard 的核心数据源
- [ ] Night Shift 与 interactive terminal 需要共享 session context
- [ ] Task-bound session 成为刚需
- [ ] 需要 session replay / resume / lineage

此时，skills 成为 Broker 分发的认知模块，操作日志成为 Session Runtime 的事件流，方案 D 的所有产出都可以平滑接入方案 C。

---

## 13. 结论

方案 D 的核心洞察是：

> **Agent 不需要被投喂一个巨大的上下文包，它需要的是一个清晰的认知目录和一套会自动记住发生了什么的工具。**

这对应了三个设计决策：

1. **Skills 替代 Context Pack** — 从 push 到 pull，让 agent 自主决定需要什么认知
2. **操作日志替代状态快照** — 不生成运行时状态文件，让工具调用自然沉淀记忆
3. **轻量 CLAUDE.md 替代 wrapper** — 不需要 PATH 注入和启动包装，减少魔法

方案 D 是四个方案中**改动最小、概念最简洁、与现有基础设施最对齐**的路线。它既解决了当前"agent 不懂 Orbit"的核心痛点，又为将来向方案 C 演进留出了清晰的路径。

更重要的是，它引入了一个方案 A 没有的长期资产：**操作日志**。这不只是 agent 上下文的一部分，更是 Orbit 作为"可追踪、可审计的执行系统"的天然基础设施。
