# Changelog

> 倒序记录（最新在最前）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

### Fixed

- **Vault 切换文件树竞态**：`fs:listTree` 不再因旧 session 与新 vault 路径短暂交错而抛出 `path escapes vault`；文件树订阅初始化也会主动丢弃过期 listener
- **Session 详情页信息降噪**：精简 Project Session 详情头部，移除 sessionId / pane / prompt / permission / vendor 等内部字段；仅保留会话标题、状态、时间与入口动作，并将 transcript 文案调整为更面向用户的表述
- **Inbox 终端审批同步**：terminal approval 卡片在终端里批准/继续执行后会及时清除待审批状态；`Notification` hook 统一按进度事件处理，避免审批消息卡住
- **Area / Vision 用户旅程闭环**：补齐 Vision 冷启动、笔记接入、Area 级任务创建、Area Session 历史，以及 vault 创建后进入 Vision Room 的导航链路

### Added

- **Area Room + Vision System 设计方案**：`docs/plans/2026-04-23-area-room-vision-system-design.md`（status: completed）；设计 Area 升级为文件夹单元（含 Kanban + Terminal + Sessions）；内置 Vision 模板（基于 45 题访谈协议 + 笔记接入 + 迭代 review 流程）；vault 创建时自动 scaffold vision area
- **Vision 冷启动交互**：新增 `NotesConnectPanel`、Vision 冷启动/活跃态切换、启动访谈与 review 预填命令、外部笔记目录链接/导入、`ORBIT_EXTERNAL_NOTES_PATHS` 终端注入
- **Area 日常工作流**：Area Room 改为 `Kanban / Terminal / Sessions`，普通 Area 支持 area-owned task 文件与 Kanban；Vision Area 支持 transcript 历史与回顾入口

### Changed

- **Areas 左侧导航层级**：移除 Workspace 区的 `Area Overview` 入口，并恢复 `Areas` 独立分组，让它以 `Workspace → Areas → Projects` 的层级出现在左栏
- **Areas 侧边栏**：改为 Vision 置顶、按 tag 分组展示，且新建 Area 后会直接进入对应 Area Room
- **Area 创建流**：`NewAreaModal` 现在支持 blank / vision 模板与 GitHub 仓库导入；GitHub 导入内容会落入 Area 目录但不会保留独立 `.git`

---

## [2026-04-23]

### Added

- **Contextual Right Sidebar**：右侧栏改为跟随当前页面上下文，三级 tab（Overview / Focus / Execution）；Project Room 下的 task detail、session list、run log、diff 各归其位
- **`.orbit`-First Agent Exposure**：项目级 Orbit 数据统一收敛到 `.orbit/`；新增 `agent_exposure` 项目配置（isolated / bridge / compatible）；社区规范文件（`AGENT.md` / `AGENTS.md` / `.mcp.json`）仅作兼容桥接
- **GitHub Integration**：以 `gh` CLI 为基础的 GitHub 连接、仓库导入、发布、PR 创建与状态读取；`src/main/github/` 模块 + IPC surface
- **Project Session History**：终端 agent 会话升级为项目级历史记录系统；支持 Claude / Codex 本地 transcript 导入；Project Room 新增 Sessions 外层页签 + Session History tab；`src/main/agent/terminal_sessions.ts`、`src/main/project_session_history.ts`
- **Capture & Content System 方案文档**：`docs/plans/2026-04-23-capture-and-content-system.md`（status: draft）

### Changed

- 终端环境注入优化：`ORBIT_VAULT_PATH`、`ORBIT_PROJECT_UID`、`ORBIT_PROJECT_SLUG` 注入时机提前；pty 启动更稳定

---

## [2026-04-22]

### Added

- **Agent Context Architecture 设计**：`docs/plans/` 新增整体方案分析 + 方案 A / C / D 详细设计（status: draft）
- **Terminal Session Awareness 设计**：`docs/plans/2026-04-22-orbit-terminal-session-awareness.md`（已落地为 Project Session History）

---

## [2026-04 初期 — v1.0 基础功能]

### Added

- Electron 三进程架构（main / preload / renderer），contextBridge + `window.orbit` typed API
- PARA vault（`01_Projects` / `02_Areas` / `03_Resources` / `04_Archives`）+ refmap UID 系统
- 文件系统 IPC（`fs:*`）：原子写入、backlink-safe rename、watcher rename heuristic、MiniSearch 全文索引
- PARA Zod schemas、task index、Kanban（dnd-kit）、`para:*` IPC
- Claude Code agent runner：stream-json、hydration protocol、cost NDJSON、RunnerPool（单任务单 runner 限制）
- Git worktree 管理：ghost-branch policy、GitQueue（global + per-cwd）、pre-merge check（build + secrets scan）、CheckCache、SafetyGate
- Token 预算系统：BudgetGate（pre-spawn）+ BudgetWatch（runtime）、每日 cost 报告
- 项目 Distillation：composeDistillPrompt、parseDistillResponse、hash-trick vector store（512-d）、experience wake-up
- 项目即文件夹（`01_Projects/<slug>/`）、per-project git repo、模板系统（blank/web-app/research/writing）
- Vision-first Dashboard、+ New Project wizard
- 四段式 Task Editor（Description / Thinking / Execution Log / Summary）、per-section auto-save
- Project Room：Kanban + xterm.js 嵌入式终端 + Sessions 三模式
- Orbit Hooks MCP server（`out/mcp/server.cjs`，7 工具）、auto-written `.mcp.json`
- Night Shift：per-task worktree、headless runner、自动 PR、🌙 History drawer
- Worktree GC（launch + 24h 周期）
- Daily Review 生成（LLM + fallback 模板）、Journal 历史列表
- Legacy → v3 项目迁移（dryRun、snapshot commit、幂等）
- Command Palette（`⌘K`）、Settings（Budget/API/Vectors/Worktree GC）
- 崩溃日志（NDJSON at `<vault>/.orbit/crash/`）、ErrorBoundary + Reload
