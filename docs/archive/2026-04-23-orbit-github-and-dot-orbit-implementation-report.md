---
status: completed
created: 2026-04-23
updated: 2026-04-23
---

# Orbit GitHub Integration & `.orbit` Exposure Implementation Report

> 本文档记录 2026-04-23 两份实施计划的实际交付结果：`.orbit`-first agent exposure 与 GitHub integration blueprint。

## 结论

两份计划的代码实现已经落地完成，当前代码库支持：

1. 以 `.orbit/` 作为项目级 Orbit 主权空间，`AGENT.md` / `AGENTS.md` / `.mcp.json` / `.agent` 仅作为可选桥接或兼容输入。
2. 以 `gh` CLI 为基础的 GitHub 连接、导入、发布、状态读取与 PR 创建流程。
3. 在新建项目、导入项目、项目详情页和后端 IPC 中贯通上述能力。

## 已交付范围

### 1. `.orbit`-first 项目结构

项目级 Orbit 数据已统一收敛到：

```text
<project>/
  .orbit/
    config.json
    .mcp.json
    agent/
      tasks/
      memories/
      skills/
      logs/
    bridge/
      AGENT.md
      AGENTS.md
      .mcp.json
      manifest.json
```

当前实现已把以下数据迁移为 `.orbit` canonical：

- project config
- project-local MCP config
- task storage
- memory storage
- agent skills
- session history / timeline logs
- bridge manifest

### 2. Agent exposure 策略

项目级配置新增 `agent_exposure`，支持三种模式：

- `isolated`: 仅使用 `.orbit/`，不写根目录桥接
- `bridge`: 在安全前提下发布根目录桥接
- `compatible`: 在 `bridge` 基础上读取社区 `AGENT.md` / `AGENTS.md` / `.agent`

桥接行为具备以下约束：

- 根目录已有文件时不覆盖
- 冲突写入 `.orbit/bridge/manifest.json`
- 根目录桥接始终从 `.orbit/` 派生，不反向成为事实源

### 3. 社区规范兼容

兼容模式下，Orbit 会读取：

- `<project>/AGENT.md`
- `<project>/AGENTS.md`
- `<project>/.agent/`

并将其整理为 `.orbit/agent/skills/community-conventions.md`，供 Orbit 启动的 agent 在运行时感知，但不接管这些社区文件的所有权。

### 4. GitHub 后端能力

已新增 GitHub service / IPC / preload / shared types，覆盖：

- GitHub 连接状态探测
- 项目与 GitHub 仓库绑定
- 将本地项目发布到 GitHub
- 从 GitHub 仓库导入为 Orbit 项目
- 汇总项目 GitHub 状态
- 为当前分支创建 PR

当前实现基于本地 `gh` CLI，保持 Orbit 的 local-first 模型，不引入云端 GitHub App 依赖。

### 5. Renderer 入口

已完成以下界面接入：

- `NewProjectModal`
  - 本地创建 / GitHub 导入切换
  - 项目级 exposure mode 选择
- `ProjectRoomView`
  - GitHub 状态条
  - publish to GitHub
  - refresh GitHub state
  - 引导 `gh auth login --web`
  - create pull request

## 关键实现文件

### `.orbit` / exposure

- `src/main/project_config.ts`
- `src/main/project.ts`
- `src/main/project_bridges.ts`
- `src/main/project_agent_context.ts`
- `src/main/project_session_history.ts`
- `src/main/mcp_config.ts`
- `src/main/migrations.ts`
- `src/main/walk.ts`

### GitHub

- `src/shared/github.ts`
- `src/shared/ipc.ts`
- `src/main/github/service.ts`
- `src/main/github/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/Modals/NewProjectModal.tsx`
- `src/renderer/src/views/ProjectRoomView.tsx`

### 测试

- `tests/github_integration.test.ts`
- `.orbit` 迁移与桥接相关回归测试
- R7 / IPC / content hash / migration 等全量回归测试

## 用户旅程结果

### GitHub 导入

现在用户可以从新建项目流程直接选择 GitHub 导入。导入流程会：

1. clone 仓库到 `01_Projects/<slug>/`
2. 保留原仓库内容
3. 只在 `.orbit/` 内补充 Orbit 元数据
4. 建立持久化 GitHub binding

### 发布现有项目到 GitHub

现在用户可以在项目页直接将现有项目发布到 GitHub。流程会：

1. 检查/初始化本地 git
2. 通过 `gh repo create` 创建远程仓库
3. 建立 `origin`
4. 推送当前分支
5. 持久化 GitHub binding 到项目配置

### 项目内 GitHub 感知

现在项目页可以展示：

- 仓库绑定信息
- 当前分支
- ahead / behind / dirty 等同步状态
- 当前分支 PR 摘要

并提供刷新、发布、认证、创建 PR 等操作入口。

## 验证结果

当前实现已通过全量测试与类型检查。

## 当前边界

以下属于后续增强方向，不属于本次未完成项：

- GitHub App / OAuth 云端授权模型
- 仓库组织级浏览、issue 深度同步、review thread 全量建模
- 更丰富的任务级 issue / PR 绑定 UI
- CI / review / merge queue 的更细粒度界面映射

本次交付已经完整覆盖两份实施文档定义的本地优先、`.orbit` canonical、可选桥接、GitHub 导入/发布/PR/状态回流主链路。
