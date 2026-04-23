# Orbit — Product Vision

## 核心定位

Orbit 是一个**个人愿景驱动的 AI 协作工作台**。

它不是一个带终端的笔记软件，也不是一个 AI 聊天工具。Orbit 的目标是让用户把自己的长期方向（Vision）、项目（Projects）、任务（Tasks）和知识（Resources）沉淀在本地 Markdown + Git vault 中，并通过 AI agent 将思考转化为真实执行——以可追踪、可审计、可恢复的方式。

## 核心原则

### 本地优先，数据主权属于用户
所有内容存储在用户自己的文件系统上，使用 plain Markdown + PARA 目录结构 + Git 管理版本。没有云同步锁定，没有专有格式。任何 Markdown 编辑器（包括 Obsidian）都可以读写同一套文件。

### 愿景驱动
用户的 `Vision.md` 是整个工作台的北极星。它被注入到每个 Agent 的 system prompt 中，让 AI 知道"你到底想成为谁"，而不是只知道"这个任务要做什么"。

### 项目即文件夹
每个项目是一个独立的文件夹，有自己的 `README.md`、`AGENT.md`、独立 git 仓库和任务目录。项目是执行的基本单位，也是 AI agent 的上下文边界。

### Agent 参与真实执行，而非只聊天
Agent 不是附属功能，而是执行系统的一部分。通过 MCP Hooks、worktree 隔离、ghost-commit 流程，Agent 的产出可以被审查、合并或拒绝，留下完整的可审计历史。

### 双模驱动：交互式 + 无人值守
- **交互式 (Terminal)**：在 Project Room 的嵌入式终端里直接和 Claude / Codex / Gemini 对话，MCP-capable CLI 自动连接到 Orbit Hooks。
- **无人值守 (Night Shift)**：批量调度任务，每个任务在独立 worktree 执行，晨起看结果、审查、合并。

## 长期方向

1. **Agent Context System** — 让 Orbit 能稳定、低摩擦地把"项目状态 + Orbit 能力"传递给任意终端 agent，无论是 Claude、Codex 还是未来的任何 CLI。
2. **Capture & Content** — 提供低摩擦的快速捕获入口（Quick Capture、Voice Log、Scratch Pad），让想法能在第一时间落地，而无需切换工具或填写 frontmatter。
3. **跨项目知识蒸馏** — 项目结束后，通过 Distillation 把积累的经验提炼为可复用的 Resource，并通过 vector wake-up 在新项目启动时自动关联。
4. **GitHub 作为远程协作层** — 连接本地 vault 与 GitHub 仓库，支持从 GitHub Issues 导入任务、将 Night Shift 结果自动开 PR、读取 CI 状态。

## 不做什么

- **不做实时协作**（多人编辑同一文件）：Orbit 是个人工具，不是团队 Wiki。
- **不做专有云存储**：vault 始终是用户本地的普通文件夹。
- **不做 AI 聊天界面**：Orbit 不封装 AI 对话 UI，而是让最好的 CLI（`claude`、`codex`…）在项目根目录里直接工作。
- **不强制绑定特定 AI 提供商**：通过 MCP + 环境变量注入，用户可以把任意 MCP-compatible CLI 接入 Orbit。
