# Changelog

> 倒序记录（最新在最前）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

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
