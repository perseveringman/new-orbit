# Orbit — Agent Guidelines

## Project Overview

Orbit 是一个基于 Electron + React 的本地 AI 协作工作台，兼容 Obsidian Markdown 格式，使用本地 Git 管理内容，并可通过 Claude Code CLI 在 parallel worktrees 中编排子 Agent。

## Tech Stack

| Layer      | Technology                                     |
| ---------- | ---------------------------------------------- |
| Framework  | Electron + electron-vite                       |
| Frontend   | React 18, TypeScript                           |
| State      | Zustand                                        |
| Styling    | Tailwind CSS (utility-first, `darkMode: class`) |
| Editor     | CodeMirror 6                                   |
| Terminal   | xterm.js + node-pty                            |
| Git        | simple-git                                     |
| Validation | Zod                                            |
| Test       | Vitest (unit), Playwright (e2e)                |
| Build      | electron-vite, esbuild (MCP server)            |

## Code Conventions

### TypeScript
- 严格模式；不使用 `any`，优先 `unknown` + 类型守卫
- 未使用变量加 `_` 前缀（`argsIgnorePattern: '^_'`）
- 函数签名中显式声明返回类型（组件返回 `JSX.Element`）

### Formatting (Prettier)
- 单引号，分号，无尾逗号，行宽 100，缩进 2 空格

### React & Renderer
- 函数组件 + hooks，不使用 class 组件
- 状态管理统一用 Zustand（`src/renderer/src/store/`），不使用 Redux / Context
- 样式统一用 Tailwind utility class，不写自定义 CSS（除 `styles.css` 中的全局 base）
- 暗色模式：使用 `dark:` variant，颜色体系基于 `neutral` 色阶
- 字体：Inter 为主字体

### Main Process
- 模块化：每个领域一个文件或目录（`git/`、`agent/`、`terminal/`）
- IPC handler 注册集中在 `src/main/index.ts` 或各模块的 bridge 文件中

## Git Commit Convention

**每次完成一个任务后，必须将相关代码提交为一个语义化 commit。**

### Commit 格式

```
feat(renderer): add session transcript detail pane
fix(sidebar): resolve overflow in session list
refactor(main): extract git operations into dedicated module
style(renderer): adjust dark mode colors for kanban board
chore: update electron-vite to v2
```
但:后的内容换成中文

### Commit 规则

1. **只暂存当前任务相关的文件**——禁止 `git add -A` 或 `git add .`
2. **一个 commit 对应一个逻辑变更**——不要把不相关的改动混在一起
3. **commit message 用英文**，简洁清晰，描述"做了什么"而非"怎么做的"
4. 如果工作区有非本任务的未提交变更，**忽略它们，不要 revert**

## Documentation Strategy

### 目标

`docs/` 目录始终保持**精简、准确、可信赖**，让任何人（包括 AI Agent）能在 5 分钟内理解项目的愿景、现状和待办项。

### 文档层级

```
docs/
├── VISION.md          # 产品愿景与长期方向（变动极少）
├── architecture.md    # 系统架构与核心设计决策
├── DEVELOPMENT.md     # 开发指南（环境搭建、调试、测试）
├── ROADMAP.md         # 当前阶段目标与待办项（定期更新）
├── plans/             # 需求方案文档（大功能落地后归档或删除）
│   └── YYYY-MM-DD-<topic>.md
└── archive/           # 已完成/过期的方案文档（按需清理）
```

### 变更分级规则

| 变更规模 | 文档动作 | 示例 |
| -------- | -------- | ---- |
| **小改动**（bug fix、UI 微调、配置变更） | 仅在 `CHANGELOG.md` 追加记录 | 修复侧边栏溢出、调整暗色模式颜色 |
| **中等改动**（新组件、新 IPC 通道、模块重构） | `CHANGELOG.md` + 更新受影响的现有文档（如 `architecture.md`） | 新增 terminal session 模块 |
| **大需求**（新子系统、架构变更、跨模块功能） | `CHANGELOG.md` + 在 `docs/plans/` 新建方案文档 + 更新 `ROADMAP.md` | GitHub 集成、Agent 编排系统 |
| **方向性决策**（新原则、废弃模块、长期走向） | `CHANGELOG.md` + 新建 ADR（`docs/decisions/`）+ 对应 plan + 更新 `overview.md` 和 `ROADMAP.md` | v2 方向确立（2026-04-26） |
| **重大设计对话**（引起 3+ ADR 或 plans 的对话） | 上述加上在 `docs/thinking-trail/` 下保留对话 | v2 方向 Onboard 对话 |

### CHANGELOG 格式

`CHANGELOG.md` 放在项目根目录，采用倒序记录（最新在最前）：

```markdown
# Changelog

## [Unreleased]

### Added
- 右侧边栏上下文面板

### Changed
- 重构 agent 调度模块，抽离为独立目录

### Fixed
- 修复 session list 在窄屏下的溢出问题

## [2026-04-22]

### Added
- Agent context 架构方案设计
```

### 方案文档（plans/）规范

- 文件名格式：`YYYY-MM-DD-<kebab-case-topic>.md`
- 每个方案文档顶部必须包含 **Status** 标记：

```markdown
---
status: draft | active | completed | archived
created: 2026-04-23
updated: 2026-04-23
---
```

- **draft**：设计中，尚未开始实施
- **active**：正在实施
- **completed**：已实施完成，等待归档
- **archived**：已移入 `archive/` 或删除

### 定期 Review 机制

**每完成一个里程碑或每两周（取先到者），执行一次文档 Review：**

1. **扫描 `docs/plans/`**——将 `status: completed` 的方案移入 `docs/archive/` 或直接删除（如核心信息已沉淀到 `architecture.md`）
2. **校验核心文档**——确认 `architecture.md`、`DEVELOPMENT.md`、`ROADMAP.md` 与代码现状一致；删除过时章节
3. **清理 `archive/`**——超过 3 个月且无参考价值的归档文档直接删除
4. **更新 `ROADMAP.md`**——标记已完成项，补充新的待办项

### Agent 文档职责

Agent 在完成任务时需遵循：

1. **小改动**——在 commit 后，将变更摘要追加到 `CHANGELOG.md` 的 `[Unreleased]` 区
2. **大需求**——实施前先在 `docs/plans/` 创建方案文档；实施完成后更新 status 为 `completed`
3. **发现过期文档**——如果在执行任务过程中发现某个文档描述与代码不符，主动更新该文档或标记为过期
4. **不创建冗余文档**——如果信息已存在于某个文档中，更新它而不是新建一个

## Workflow Checklist

完成任务时按以下顺序：

1. **阅读**——先读懂要改的文件，理解上下文和约定
2. **最小改动**——只改需要改的，不做额外重构
3. **验证**——运行 `npm run typecheck` 确认无类型错误
4. **文档**——按变更分级规则更新 `CHANGELOG.md` 及相关文档
5. **提交**——`git add <相关文件>` → `git commit -m "<semantic message>"`
�尚未开始实施
- **active**：正在实施
- **completed**：已实施完成，等待归档
- **archived**：已移入 `archive/` 或删除

### 定期 Review 机制

**每完成一个里程碑或每两周（取先到者），执行一次文档 Review：**

1. **扫描 `docs/plans/`**——将 `status: completed` 的方案移入 `docs/archive/` 或直接删除（如核心信息已沉淀到 `architecture.md`）
2. **校验核心文档**——确认 `architecture.md`、`DEVELOPMENT.md`、`ROADMAP.md` 与代码现状一致；删除过时章节
3. **清理 `archive/`**——超过 3 个月且无参考价值的归档文档直接删除
4. **更新 `ROADMAP.md`**——标记已完成项，补充新的待办项

### Agent 文档职责

Agent 在完成任务时需遵循：

1. **小改动**——在 commit 后，将变更摘要追加到 `CHANGELOG.md` 的 `[Unreleased]` 区
2. **大需求**——实施前先在 `docs/plans/` 创建方案文档；实施完成后更新 status 为 `completed`
3. **发现过期文档**——如果在执行任务过程中发现某个文档描述与代码不符，主动更新该文档或标记为过期
4. **不创建冗余文档**——如果信息已存在于某个文档中，更新它而不是新建一个

## Workflow Checklist

完成任务时按以下顺序：

1. **阅读**——先读懂要改的文件，理解上下文和约定
2. **最小改动**——只改需要改的，不做额外重构
3. **验证**——运行 `npm run typecheck` 确认无类型错误
4. **文档**——按变更分级规则更新 `CHANGELOG.md` 及相关文档
5. **提交**——`git add <相关文件>` → `git commit -m "<semantic message>"`
