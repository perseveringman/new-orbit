---
status: completed
created: 2026-04-22
updated: 2026-04-23
---

# Orbit 终端会话感知系统设计

## 1. 问题

Orbit 当前对终端中运行的 agent 有两种截然不同的感知程度：

| | Night Shift（Headless Runner） | 终端交互式（用户在 terminal 里跑 claude） |
|---|---|---|
| Orbit 是否知道有 agent 在跑 | ✅ 完全知道 | ❌ 完全不知道 |
| 生命周期追踪 | ✅ start/running/done/error/killed | ❌ 无 |
| 需要审批时能否感知 | ✅ hook 有 PermissionRequest | ❌ 无 |
| 历史会话列表 | ✅ `_active.json` + event log | ❌ 无 |
| 会话恢复 | ✅ reattach 机制 | ❌ 无 |

这意味着用户在 Orbit 终端里启动 `claude` / `codex` / `gemini` 后，Orbit 的 Project Room 无法展示：

- 当前有哪些 agent 在工作
- 哪个 agent 完成了，等待用户审查
- 哪个 agent 需要权限审批
- 这个项目历史上有过哪些 agent 会话
- 能否恢复上次中断的会话

---

## 2. 设计目标

1. **感知生命周期**：Orbit 知道终端里的 agent 何时开始、何时结束、何时等待审批
2. **关联到 pane**：能映射到具体的终端 pane，UI 可以展示状态指示器
3. **记录会话历史**：Project Room 能展示该项目的历史 agent 会话列表
4. **支持多 agent**：不只是 Claude Code，也覆盖 Codex、Gemini、Cursor 等
5. **与方案 D 互补**：hooks 负责生命周期感知（"谁在干活"），操作日志负责内容记忆（"干了什么"）
6. **最小侵入**：不修改 agent 进程本身，利用各 agent CLI 原生的 hook 机制

---

## 3. 参考：Superset 的做法

Superset 已经实现了完整的终端 agent 感知系统，其架构经过验证，值得借鉴。

### 3.1 核心架构

```
应用启动时（一次性）
  └─ setupAgentHooks()
       ├─ 写 ~/.claude/settings.json   → hooks 指向 notify.sh
       ├─ 写 ~/.codex/hooks.json       → hooks 指向 notify.sh
       ├─ 写 ~/.cursor/hooks.json      → hooks 指向 notify.sh
       ├─ 写 gemini hook script        → 指向 notify.sh
       └─ 写 ~/.superset/hooks/notify.sh  → curl → 本地 HTTP server

终端里 agent 运行时
  agent 生命周期事件触发
    → agent 调用 notify.sh（自身 hook 机制）
    → notify.sh 发 HTTP GET 到本地 server
       参数：eventType, paneId, tabId, workspaceId
    → server 标准化事件类型（Start / Stop / PermissionRequest）
    → server 根据 paneId 解析到具体终端面板
    → 通过 subscription 推送到 renderer
    → renderer 更新 pane 状态指示器
```

### 3.2 关键设计决策

1. **利用 agent 原生 hook 机制**：不侵入 agent 进程，不监控 PTY 输出
2. **统一 notify 脚本**：所有 agent 的 hook 都指向同一个 `notify.sh`
3. **环境变量传递身份**：终端启动时注入 pane/workspace ID，hook 回传时带上
4. **事件类型标准化**：各家 agent 事件名不同，统一映射为三种状态
5. **兜底机制**：Terminal Exit 事件清理卡住的指示器

### 3.3 Superset 注册的 Hook 事件

| Agent | Hook 事件 | 映射到 |
|---|---|---|
| Claude | `UserPromptSubmit` | Start |
| Claude | `Stop` | Stop |
| Claude | `PostToolUse` / `PostToolUseFailure` | Start（表示仍在工作） |
| Claude | `PermissionRequest` | PermissionRequest |
| Codex | `SessionStart` | Start |
| Codex | `UserPromptSubmit` | Start |
| Codex | `Stop` | Stop |

---

## 4. Orbit 的实现方案

### 4.1 Orbit 已有的基础设施

Orbit 已经有方案中需要的大部分组件：

| 组件 | 当前状态 | 需要的改动 |
|---|---|---|
| Hook HTTP server | ✅ 已有（`src/main/agent/hooks/server.ts`） | 协议从 POST + Bearer token 改为支持 GET（兼容 shell 脚本简单调用） |
| `notify.sh` 模板 | ✅ 已有（`src/main/agent/hooks/template.ts`） | 改为通用模板，不绑定特定 runId |
| 事件类型标准化 | ✅ 已有（`hooks/mapEventType.ts`） | 扩展支持更多 agent 的事件名 |
| 事件路由 + 去重 | ✅ 已有（`eventRouter.ts`） | 改为按 paneId 去重（当前按 runId） |
| 终端 pane 环境变量注入 | ✅ 已有（`ORBIT_VAULT_PATH` 等） | 新增 `ORBIT_PANE_ID`、`ORBIT_PROJECT_UID` |
| Renderer 终端组件 | ✅ 已有（`TerminalPane.tsx`） | 新增状态指示器 |

核心差距：**当前 hook 只给 Night Shift runner 配置，不覆盖终端交互式场景**。

### 4.2 整体架构

```
Layer 1: Hook 注入（应用启动时一次性）
  Orbit 启动
    → setupTerminalAgentHooks()
        ├─ 生成 <vault>/.orbit/hooks/notify.sh（通用版，不绑定 runId）
        ├─ 写 ~/.claude/settings.json  hooks 字段（合并，不覆盖用户配置）
        ├─ 写 ~/.codex/hooks.json（合并）
        └─ 未来扩展：gemini / cursor 等

Layer 2: 终端环境注入（每次打开终端 pane 时）
  TerminalManager 创建 session
    → 注入环境变量到 PTY：
        ORBIT_VAULT_PATH      = vault 路径
        ORBIT_PROJECT_UID     = 项目 UID
        ORBIT_PROJECT_SLUG    = 项目 slug
        ORBIT_PANE_ID         = 终端 pane 的 leaf ID（新增）
        ORBIT_HOOK_PORT       = hook server 端口（新增）

Layer 3: 运行时事件流（agent 运行期间）
  Claude Code 在终端中启动
    → Claude 读取 ~/.claude/settings.json 中的 hooks
    → 生命周期事件触发 → 调用 notify.sh
    → notify.sh 读取 ORBIT_* 环境变量
    → 向 http://127.0.0.1:${ORBIT_HOOK_PORT}/hook 发送事件
       携带：eventType, paneId, projectUid
    → Hook server 接收 → 标准化事件类型
    → 通过 IPC 推送到 renderer
    → TerminalPane 更新状态指示器

Layer 4: 会话注册表（持久化）
  Hook server 收到 Start 事件
    → 在 session registry 中创建会话记录
  Hook server 收到 Stop 事件
    → 标记会话结束，记录 endedAt
  终端进程退出（兜底）
    → PTY manager onExit 清理卡住状态
```

### 4.3 `notify.sh` 通用版设计

当前 Orbit 的 `notify.sh` 是 per-run 生成的（绑定 `runId` + `token`），需要改为通用版：

```bash
#!/usr/bin/env bash
# Orbit agent lifecycle notification hook
set -eu

# 从终端环境变量中读取身份信息
HOOK_PORT="${ORBIT_HOOK_PORT:-}"
PANE_ID="${ORBIT_PANE_ID:-}"
PROJECT_UID="${ORBIT_PROJECT_UID:-}"

# 如果不在 Orbit 终端中，静默退出
if [ -z "${HOOK_PORT}" ]; then
  exit 0
fi

# 从 agent hook 环境变量中读取事件类型
# Claude Code 用 CLAUDE_HOOK_EVENT_TYPE
# 兼容多个来源
EVENT_TYPE="${CLAUDE_HOOK_EVENT_TYPE:-${ORBIT_HOOK_EVENT_TYPE:-Stop}}"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -fsS --max-time 3 \
  -X GET \
  "http://127.0.0.1:${HOOK_PORT}/hook/event?eventType=${EVENT_TYPE}&paneId=${PANE_ID}&projectUid=${PROJECT_UID}&ts=${ts}" \
  >/dev/null 2>&1 || true
```

关键区别：
- 不需要 `runId`（终端交互式没有 Orbit 分配的 runId）
- 不需要 `Bearer token`（改为 GET 请求 + 端口隐含信任）
- 身份信息从终端环境变量中读取，不是 hardcode 在脚本里
- 事件类型从 agent 的 hook 环境变量中读取

### 4.4 `~/.claude/settings.json` Hook 注册

Orbit 需要在 `~/.claude/settings.json` 的 `hooks` 字段中注册以下事件：

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "<vault>/.orbit/hooks/notify.sh"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "<vault>/.orbit/hooks/notify.sh"
      }]
    }],
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "<vault>/.orbit/hooks/notify.sh"
      }]
    }]
  }
}
```

**合并策略**（借鉴 Superset）：
- 读取现有 `settings.json`
- 保留用户自定义的 hooks
- 只替换/添加 Orbit 管理的 hook entries（通过脚本路径识别）
- 使用 `isManagedHookCommand()` 判断是否为 Orbit 管理的 hook

### 4.5 事件类型标准化

扩展现有的 `mapEventType.ts`，覆盖终端交互式场景：

```typescript
export type OrbitHookEventType =
  | 'Start'
  | 'Stop'
  | 'PermissionRequest'
  | 'Progress';

export function mapEventType(rawEventType: string): OrbitHookEventType | null {
  // Start 类事件
  if ([
    'Start', 'SessionStart', 'UserPromptSubmit',
    'PostToolUse', 'PostToolUseFailure',
    'BeforeAgent', 'AfterTool',
    'session_start', 'user_prompt_submit', 'task_started'
  ].includes(rawEventType)) {
    return 'Start';
  }

  // PermissionRequest 类事件
  if ([
    'PermissionRequest', 'PreToolUse', 'Notification',
    'pre_tool_use', 'exec_approval_request',
    'apply_patch_approval_request', 'request_user_input'
  ].includes(rawEventType)) {
    return 'PermissionRequest';
  }

  // Stop 类事件
  if ([
    'Stop', 'stop',
    'agent-turn-complete', 'AfterAgent',
    'session_end', 'task_complete'
  ].includes(rawEventType)) {
    return 'Stop';
  }

  return null;
}
```

### 4.6 Hook Server 改造

当前 hook server 只接受 POST + Bearer token。需要新增一个 GET 端点，供 `notify.sh` 简单调用：

```typescript
// 在 server.ts 中新增 GET 端点
// GET /hook/event?eventType=Start&paneId=xxx&projectUid=yyy&ts=...
server.on('request', (req, res) => {
  const url = new URL(req.url ?? '', `http://127.0.0.1`);

  if (url.pathname === '/hook/event' && req.method === 'GET') {
    const rawEventType = url.searchParams.get('eventType') ?? '';
    const paneId = url.searchParams.get('paneId') ?? undefined;
    const projectUid = url.searchParams.get('projectUid') ?? undefined;
    const ts = url.searchParams.get('ts') ?? new Date().toISOString();

    const eventType = mapEventType(rawEventType);
    if (!eventType) {
      writeJson(res, 200, { ignored: true });
      return;
    }

    const envelope: TerminalAgentEvent = {
      eventType,
      paneId,
      projectUid,
      ts
    };

    events.emit('terminal-agent-event', envelope);
    writeJson(res, 200, { ok: true });
    return;
  }

  // ... 保留现有 POST /hook 端点用于 Night Shift
});
```

### 4.7 终端环境变量注入

在 `ProjectRoomView.tsx` 的 `TerminalManager` env 中新增：

```typescript
env={vault ? {
  ORBIT_VAULT_PATH: vault.path,
  ORBIT_PROJECT_UID: project.uid,
  ORBIT_PROJECT_SLUG: project.slug,
  // 新增
  ORBIT_PANE_ID: leafId,             // 终端 pane 标识
  ORBIT_HOOK_PORT: String(hookPort), // hook server 端口
} : undefined}
```

`hookPort` 从 main 进程通过 IPC 获取（hook server 启动后端口已知）。

---

## 5. 终端 Pane 状态模型

### 5.1 状态定义

```typescript
type TerminalPaneAgentStatus =
  | 'idle'        // 无 agent 在运行，或 agent 已退出
  | 'working'     // agent 正在工作（收到 Start 事件）
  | 'permission'  // agent 等待用户授权（收到 PermissionRequest 事件）
  | 'review';     // agent 已完成，等待用户查看结果（Stop 但用户不在当前 tab）
```

### 5.2 状态转换

```
idle ──Start──→ working
working ──PermissionRequest──→ permission
working ──Stop(用户在当前tab)──→ idle
working ──Stop(用户不在当前tab)──→ review
permission ──Stop──→ idle
review ──用户切换到该tab──→ idle
任何状态 ──Terminal Exit──→ idle（兜底）
```

### 5.3 UI 指示器

| 状态 | 终端 Tab 指示器 | 说明 |
|---|---|---|
| `idle` | 无 | 正常状态 |
| `working` | 🟡 脉冲圆点 | Agent 正在工作 |
| `permission` | 🔴 脉冲圆点 | 需要用户注意/授权 |
| `review` | 🟢 静态圆点 | Agent 已完成，等待查看 |

---

## 6. 会话注册表

### 6.1 数据模型

```typescript
interface AgentSession {
  /** 唯一会话 ID（MCP server PID 或 hook 生成） */
  sessionId: string;

  /** 关联的终端 pane ID */
  paneId: string;

  /** 项目 UID */
  projectUid: string;

  /** Agent 类型（claude / codex / gemini / unknown） */
  agentType: string;

  /** 会话状态 */
  status: 'active' | 'completed' | 'interrupted';

  /** 开始时间 */
  startedAt: string;

  /** 结束时间 */
  endedAt?: string;

  /** 最后一次活动时间 */
  lastActivityAt: string;

  /** 操作统计 */
  stats: {
    /** 收到的 Start 事件数（约等于用户 prompt 数） */
    promptCount: number;
    /** 收到的 PermissionRequest 事件数 */
    permissionCount: number;
  };
}
```

### 6.2 存储

会话注册表存储在 `<vault>/.orbit/sessions/registry.json`：

```json
{
  "sessions": [
    {
      "sessionId": "pane_abc123_1713800000",
      "paneId": "abc123",
      "projectUid": "proj_x1y2z3",
      "agentType": "claude",
      "status": "completed",
      "startedAt": "2026-04-22T10:30:00Z",
      "endedAt": "2026-04-22T11:20:00Z",
      "lastActivityAt": "2026-04-22T11:20:00Z",
      "stats": { "promptCount": 5, "permissionCount": 1 }
    }
  ]
}
```

### 6.3 会话生命周期

```
Hook 收到 Start 事件（paneId=X）
  → 查找 paneId=X 的 active session
    → 没有 → 创建新 AgentSession，status=active
    → 有   → 更新 lastActivityAt，promptCount++

Hook 收到 PermissionRequest 事件（paneId=X）
  → 更新 active session 的 permissionCount++

Hook 收到 Stop 事件（paneId=X）
  → 更新 active session 的 lastActivityAt
  → 注意：Stop 不立即结束 session（agent 可能继续接收下一个 prompt）

终端 PTY 进程退出（paneId=X）
  → 如果有 active session → status=completed, endedAt=now
  → 这是 session 结束的真正信号

Orbit 应用启动时
  → 扫描 registry，把所有 active session 标记为 interrupted
  → （因为上次退出时可能没来得及记录结束）
```

### 6.4 与 Claude Code 本地会话的关联

Claude Code 把会话存储在 `~/.claude/projects/<project-path-hash>/` 中。关联方式：

**时间窗口匹配**：
- Orbit session 有 `startedAt` / `endedAt`
- Claude Code session 文件有创建时间和最后修改时间
- 两者的时间窗口重叠 + 同一个项目路径 → 高置信度匹配

**会话恢复**：
- Orbit 展示历史会话列表
- 用户点击某个历史 session → Orbit 找到对应的 Claude Code session ID
- 在终端中执行 `claude --resume <session-id>` 恢复对话

这是 Phase 2+ 的能力，Phase 1 先不做。

---

## 7. 与方案 D 的关系

```
方案 D 操作日志
  │  记录"干了什么"
  │  数据来源：MCP tool 调用
  │  粒度：每次工具调用
  │  存储：<project>/.agent/logs/
  │
  │                      共同服务于
  │                    ┌─────────────┐
  ├───────────────────→│  Project     │
  │                    │  Dashboard   │
  │                    │  会话历史     │
  │                    │  操作时间线   │
终端会话感知            │  状态指示器   │
  │                    └─────────────┘
  │  记录"谁在干活"
  │  数据来源：Agent hook 回调
  │  粒度：会话生命周期事件
  │  存储：<vault>/.orbit/sessions/
```

**关联维度**：

- 操作日志的 `sessionPid`（MCP server PID）可以与 AgentSession 的时间窗口匹配
- 同一个 pane 里的 agent session 和 MCP 操作日志天然关联
- Project Dashboard 可以展示："这个 agent 会话期间，通过 MCP 做了以下操作"

---

## 8. 已知限制（来自 Superset 的经验）

这些是 agent CLI hook 机制本身的限制，不是 Orbit 的实现问题：

1. **用户 Ctrl+C 中断**：Claude Code 的 Stop hook 不会在用户中断时触发。兜底：Terminal Exit 事件清理状态
2. **权限拒绝**：用户拒绝权限请求时没有 hook 触发。兜底：Terminal Exit 或下一个 Start 事件清理状态
3. **工具执行失败**：工具失败时不触发特定 hook。状态保持 working 直到 Stop 或退出
4. **外部终端**：用户在系统终端（非 Orbit）中运行 claude 时，环境变量中没有 `ORBIT_PANE_ID`，hook 仍会触发但无法关联到 pane。Session 仍可记录但无 UI 指示器

---

## 9. 落地顺序

### Phase 1：基础感知（最小可用）

**目标**：Orbit 终端里跑 claude 时，pane tab 上显示状态指示器

- [ ] 通用 `notify.sh` 模板（不绑定 runId）
- [ ] `~/.claude/settings.json` hook 注入（合并式写入）
- [ ] Hook server 新增 GET `/hook/event` 端点
- [ ] 终端环境变量注入 `ORBIT_PANE_ID` + `ORBIT_HOOK_PORT`
- [ ] 事件类型标准化扩展
- [ ] TerminalPane 状态指示器 UI（working / permission / review / idle）
- [ ] Terminal Exit 兜底清理

**改动范围**：
- `src/main/agent/hooks/`：server 新增 GET 端点，template 改为通用版
- `src/renderer/src/views/ProjectRoomView.tsx`：env 注入
- `src/renderer/src/components/Terminal/TerminalPane.tsx`：状态指示器
- 新增：`src/main/agent/setup/` 全局 hook 注入逻辑

### Phase 2：会话注册表 + 多 Agent

**目标**：Project Room 展示历史会话列表

- [ ] AgentSession 数据模型 + registry.json 持久化
- [ ] 会话生命周期管理（Start → active → PTY exit → completed）
- [ ] Project Room 会话列表 UI
- [ ] Codex hooks.json 注入
- [ ] Gemini hook 注入
- [ ] 应用启动时 orphan session 清理

### Phase 3：会话恢复 + Claude Code 关联

**目标**：用户可以从 Orbit 恢复历史 Claude 会话

- [ ] Claude Code 本地会话文件扫描（`~/.claude/projects/`）
- [ ] 时间窗口匹配算法
- [ ] 一键恢复（在终端中执行 `claude --resume <session-id>`）
- [ ] 会话详情页（操作日志 + 会话事件时间线融合展示）

### Phase 4：与操作日志深度融合

**目标**：完整的项目 agent 活动视图

- [ ] 操作日志的 `sessionPid` 与 AgentSession 自动关联
- [ ] Project Dashboard：会话列表 + 每个会话的操作时间线
- [ ] Night Shift 报告从会话维度生成
- [ ] Session-level cost tracking（结合现有 cost 模块）

---

## 10. 结论

终端会话感知是 Orbit 从"有终端的工作台"走向"知道 agent 在做什么的工作台"的关键一步。

核心洞察：

> **Orbit 不需要侵入 agent 进程，只需要利用各 agent CLI 已有的 hook 机制，把生命周期事件标准化后关联到终端 pane。**

这个方案的优势：

1. **Orbit 已有 80% 的基础设施**：hook server、事件路由、环境变量注入都已就绪
2. **最小侵入**：不修改 agent，不监控 PTY 输出，不做进程树扫描
3. **与方案 D 互补**：hooks 感知"谁"，操作日志记录"什么"，两者共同构成完整的项目 agent 活动视图
4. **可扩展到任意 agent**：只要该 agent CLI 支持 hook 回调机制
