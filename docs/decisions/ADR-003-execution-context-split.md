---
id: ADR-003
title: ExecutionContext 分化 — Worktree + Sandbox 双轨
status: accepted
date: 2026-04-26
related: ADR-001
implementation: plans/2026-04-26-execution-model-migration.md
---

## Context

v1 Orbit 的任务执行隔离依赖 `git worktree`：每个任务在独立 worktree 里跑，用 ghost-commit 流程落产出，通过 pre-merge check 审批入主分支。

这套机制对**代码项目**很有效，但 v2 方向扩展到包括：

- 纯笔记项目（写作、研究笔记、阅读摘录）
- 非代码的设计项目（产品构思、PRD 起草）
- 资源整理项目（PARA 的 `03_Resources/` 下的内容项目）

这些项目的共性是：
- **没有 build / test / deploy 流程**（ghost-commit 的 pre-merge check 无用）
- **不一定需要 git**（用户可能只想存原始 Markdown，无需版本控制）
- **变更粒度小**（通常是单文件编辑，不是大范围代码改动）

强行把非代码项目塞进 worktree 模型会产生：
- 不必要的 git 操作开销（clone / branch / commit）
- pre-merge check 无法提供有意义的校验
- 用户看到 "worktree 冲突 / 合并失败" 这类和业务无关的错误

用户在 v2 对话中还纠正了一个关键误区：

> "有 .git 不代表是代码项目，有可能只是用 .git 来管理。"

**所以判定信号不能是"有没有 .git"，而应该是"这个项目是否需要构建/测试"。**

## Decision

**引入 `ExecutionContext` 抽象**，把"任务执行的隔离容器"从 worktree 泛化为可插拔的接口，v2 本期落地两种实现：

- **Worktree ExecutionContext**：代码项目（需要 build/test）使用，保留 v1 的 ghost-commit + pre-merge check
- **Sandbox ExecutionContext**：非代码项目使用，轻量文件副本 + 变更快照

**判定信号**：

- 项目 `AGENT.md` 中显式声明 `execution_context: worktree | sandbox`
- 项目模板创建时按模板类型预填（web-app / research / writing 等）
- 用户可以随时在项目设置中切换（但切换会触发迁移确认）

**Git 启用与 ExecutionContext 正交**：
- Sandbox 也可以启用 git（作为快照保留工具）
- Worktree 则强依赖 git

## Rationale

**为什么引入抽象而不是"worktree 加开关"**：

- Worktree 的实现大量依赖 git worktree / ghost branch / pre-merge check 的流程代码，要把它拆成"可选"工作量巨大且脆弱
- 把"隔离"抽象成接口后，**未来更多类型**（比如 Docker Sandbox / 进程级隔离）可以按同一套接口接入，不必每次都改全局逻辑
- Sandbox 的实现可以非常轻量，不需要复用 worktree 的任何代码

**为什么双轨而不是完全替换 worktree**：

- 代码项目的 worktree + ghost-commit 机制已经证明有效，废弃成本过高
- 代码项目的审查流程依赖 diff 审阅——没有 git 就没有 diff——保留 worktree 是合理的

**替代方案**：

- **只做 Sandbox，废弃 worktree**：拒绝。代码项目无法接受 ghost-commit 和 merge check 的缺失。
- **不引入抽象，在 worktree 里按项目类型分支**：拒绝。会让 worktree 代码越来越杂糅，无法维护。

## Consequences

**正面**：
- Orbit 可以真正覆盖非代码的 PARA 项目（笔记、研究、写作）
- 架构清晰：worktree 作为一种具体实现而非唯一路径
- 为未来 Docker/进程级隔离等更强隔离方案保留接入点

**负面 / 待处理**：
- Sandbox 的详细设计**本期不做**，下一阶段单独开设计（见 `open-questions.md`）
- 需要一个 ExecutionContext 工厂 / adapter 层在 Auto-runner Dispatcher 里使用
- 迁移时需要处理 v1 项目的判定（默认 worktree，用户可手动切换 sandbox）

## Implementation

本期：
1. 抽出 `ExecutionContext` 接口（`src/main/execution/`）
2. Worktree 实现适配此接口（`WorktreeExecutionContext`）
3. `AGENT.md` 支持 `execution_context` 字段
4. Auto-runner Dispatcher 调用接口而不是直接调用 worktree

下一阶段：
- Sandbox ExecutionContext 的详细设计与实现

见 [`plans/2026-04-26-execution-model-migration.md`](../plans/2026-04-26-execution-model-migration.md)。
