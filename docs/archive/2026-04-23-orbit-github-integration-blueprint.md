---
status: completed
created: 2026-04-23
updated: 2026-04-23
---

# Orbit GitHub 集成蓝图

> 一个产品与架构蓝图，旨在将 GitHub 打造成 Orbit 的远程协作层，并对比 Superset 当前的 GitHub 集成方案。

## 为什么存在这份文档

Orbit 已经具备有价值的本地 Git 原语：

- 通过 `src/main/git/ipc.ts` 实现本地仓库状态和提交流程
- 通过 `src/main/git/worktree.ts` 实现隔离的 worktree 执行
- 通过 `src/main/git/checks.ts` 实现安全门控的合并检查
- 通过 `src/main/env/gh.ts` 探测 `gh` 可用性
- 通过 `src/main/night_shift/dispatcher.ts` 实现 Night Shift PR 创建

Orbit **尚未**具备的是完整的 GitHub 产品面。目前 GitHub 是 Night Shift 末端的一个可选的边缘操作。目标状态要大得多：GitHub 应该成为 Orbit 可以连接的远程系统，可以从中导入、发布到、同步、以及反映回项目/任务状态的远程系统。

本文档记录了该目标状态的设计。

## 当前实现状态

截至本次实施，Orbit 已完成一版可用的本地优先 GitHub 集成：

- 后端通过 `gh` CLI 实现连接探测、项目发布、仓库导入、项目状态聚合与 PR 创建
- 前端已在新建项目和 Project Room 接入 GitHub 导入、发布、刷新与建 PR
- 项目级 GitHub binding 已落到 `.orbit/config.json`

也就是说，这份蓝图里的主链路已经具备可运行实现；后续增强重点将转向更深的 review / CI / issue 建模，而不是从零开始补 GitHub 基础能力。

---

## 产品定位

Orbit 中的 GitHub 应该被视为**远程协作层**，而不是一小组 git 快捷方式。

Orbit 继续负责：

- 本地优先的项目状态
- Markdown 知识和任务结构
- Worktree 和 agent 执行
- 合并前的安全门控
- 应用内部的人与 agent 工作流

GitHub 负责：

- 远程仓库标识
- 远程协作状态
- PR 生命周期和审查
- CI/检查状态
- 应该流回 Orbit 的 issue/PR 链接

结果是单一端到端旅程：

`连接 GitHub -> 导入或发布仓库 -> 分支/worktree -> 任务执行 -> 推送 -> PR -> 检查/审查 -> 合并 -> 状态回传到 Orbit`

---

## 设计原则

1. **本地优先，远程增强**  
   Orbit 必须在没有 GitHub 的情况下也能工作。GitHub 应该提升协作，而不是作为基本使用的门槛。

2. **明确的仓库绑定**  
   每个 Orbit 项目都应该知道自己是无绑定、本地 git 支持，还是绑定到了具体的远程仓库。

3. **状态必须回流**  
   仅打开 PR 是不够的。PR 状态、检查、审查状态和合并状态必须回到 Orbit 界面。

4. **不要隐藏 Git 现实**  
   推送、拉取、领先/落后、冲突、缺失权限和失败的检查应该可见且可理解。

5. **自动化不含静默风险**  
   Agent 和 Night Shift 可能推送分支和创建 PR，但不应该静默绕过现有的合并质量防护栏。

---

## 用户旅程

### 1. 连接 GitHub

用户可以从以下位置连接 GitHub：

- 欢迎界面
- 设置
- 项目头部（当项目仍是本地状态时）

成功连接后应建立：

- 已连接账户身份
- 可用的组织/所有者
- 授予 Orbit 的能力
- 仓库创建、PR、issue 和检查数据是否可用

连接步骤应该只发生一次，然后成为环境产品状态。

### 2. 从 GitHub 导入

用户选择**从 GitHub 导入**并选择仓库。Orbit 然后：

1. 克隆仓库到本地
2. 检测默认分支和仓库元数据
3. 创建或链接 Orbit 项目
4. 记录持久化的仓库绑定
5. 将用户直接带入 Project Room

重要的 UX 规则：导入不只是克隆。它也确立了仓库作为该项目的 Orbit 权威远程。

### 3. 将当前项目发布到 GitHub

对于尚未远程支持的本地项目，用户选择**发布到 GitHub**。Orbit 然后：

1. 检查项目是否已有 git 仓库
2. 如需要则初始化 git
3. 询问所有者、仓库名称、可见性和默认分支
4. 创建远程仓库
5. 设置 `origin`
6. 推送初始分支
7. 存储仓库绑定

此后，项目不再是"仅本地"；它变成了带有 PR 和同步流程的链接远程项目。

### 4. 日常同步和感知

项目链接后，Orbit 应始终显示：

- 当前分支
- 领先 / 落后
- 需要推送
- 有可用的远程更新
- 最近 CI / 检查状态
- 链接的开放 PR

这属于项目头部和相关侧边栏中的小型 GitHub 状态区域。

### 5. 任务到 PR

这是最重要的路径：

1. 任务开始
2. Orbit 创建或分配分支/worktree
3. 用户或 agent 修改代码
4. 更改被提交
5. 分支被推送
6. 创建草稿 PR 或开放 PR
7. 检查和审查进度回到 Orbit
8. 合并或关闭更新任务状态

每个任务都应该能够显示：

- 链接的分支
- 链接的 worktree
- 链接的 issue
- 链接的 PR
- 检查状态
- 审查状态
- 合并结果

### 6. 支持 GitHub 感知的 Night Shift

Night Shift 应该从"成功后选择性地创建 PR"演进为一流的 GitHub 批量流程。对于每个任务批次，用户应该能够定义：

- 是否推送分支
- 是否打开草稿 PR
- 目标基础分支
- 标签 / 被 assignee / 审查者
- 是否等待检查或仅报告

历史记录应同时显示本地执行结果和 GitHub 结果。

---

## UX 界面

### 欢迎 / 新项目

使这三个成为一流入口点：

- **从 GitHub 导入**
- **发布到 GitHub**
- **继续仅本地**

### 项目头部

添加一个紧凑的 GitHub 条带，显示：

- 仓库徽章（`owner/repo`）
- 可见性
- 活动分支
- 领先 / 落后
- 开放 PR 数量
- 最近检查状态

主要操作：

- 同步
- 在 GitHub 上打开
- 创建 PR
- 发布 / 连接（未绑定时）

### 任务详情

添加一个 GitHub 区域，显示：

- 链接的 issue
- 分支
- PR 编号和标题
- 草稿/开放/已合并/已关闭
- 检查摘要
- 审查者 / 审查决定

### Worktrees 面板

每个 worktree 应该呈现：

- 分支已推送或未推送
- 链接的 PR 或无
- PR 状态
- 合并资格
- 清理就绪

### Night Shift 模态框和历史

模态框应预先收集 GitHub 意图。历史抽屉应显示：

- PR 链接
- 检查状态
- 被审查阻止或被 CI 阻止状态

---

## 能力地图

### 连接和身份

Orbit 需要一流 GitHub 连接模型。最低职责：

- 发现 GitHub 是否已连接
- 识别当前执行者
- 枚举可用的所有者/组织
- 捕获授予的能力
- 暴露清晰的重新认证/重连路径

### 仓库绑定

每个 Orbit 项目需要一个持久的远程绑定，具有足够的信息以使所有 GitHub 操作具有确定性。

推荐模型：

```ts
type RepoBindingState = "unbound" | "bound";

interface RepoBinding {
  provider: "github";
  state: RepoBindingState;
  owner: string;
  repo: string;
  fullName: string; // owner/repo
  cloneUrlHttps: string;
  cloneUrlSsh?: string | null;
  defaultBranch: string;
  visibility: "public" | "private" | "internal";
  connectedAt: string;
  lastFetchedAt?: string | null;
}
```

### 远程同步状态

将同步状态与仓库标识分开。

```ts
interface RemoteSyncStatus {
  branch: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  lastFetchAt?: string | null;
  hasUnpushedCommits: boolean;
  hasRemoteUpdates: boolean;
  conflictState?: "none" | "merge-conflict" | "rebase-conflict";
}
```

### PR 和 issue 链接

```ts
interface PullRequestLink {
  number: number;
  url: string;
  title: string;
  state: "draft" | "open" | "merged" | "closed";
  baseBranch: string;
  headBranch: string;
  reviewDecision?: "approved" | "changes_requested" | "review_required" | null;
  checksStatus: "none" | "pending" | "success" | "failure";
  mergedAt?: string | null;
}

interface IssueLink {
  number: number;
  url: string;
  title: string;
  state: "open" | "closed";
}
```

---

## 架构蓝图

Orbit 应该在主进程代码中添加专门的 GitHub 层：

- `src/main/github/auth.ts`
- `src/main/github/client.ts`
- `src/main/github/repo.ts`
- `src/main/github/sync.ts`
- `src/main/github/pr.ts`
- `src/main/github/issues.ts`
- `src/main/github/checks.ts`
- `src/main/github/ipc.ts`

以及共享契约：

- `src/shared/github.ts`
- `src/shared/ipc.ts` 中 `github` 下的附加内容

推荐 IPC 表面：

- `github.getConnection`
- `github.connect`
- `github.disconnect`
- `github.listOwners`
- `github.listRepositories`
- `github.importRepository`
- `github.publishProject`
- `github.getRepoBinding`
- `github.getSyncStatus`
- `github.fetch`
- `github.pull`
- `github.pushBranch`
- `github.createPullRequest`
- `github.listPullRequests`
- `github.getPullRequest`
- `github.linkIssue`
- `github.listChecks`

### 边界设计

Git 和 GitHub 应该保持关联但分离：

- **Git 层**决定分支状态、工作树状态、合并状态、diff 和 worktree 状态。
- **GitHub 层**决定远程仓库标识、远程协作状态、PR 状态、issue 状态和检查状态。

这使本地真值和远程真值不会混淆。

---

## 传输策略

### 推荐策略：混合

使用混合模型：

- 对于身份引导和 CLI  ergonomics 最强的简单仓库本地操作，使用 `gh`
- 对于更丰富的状态读取和结构化元数据，使用 GitHub API

这最符合 Orbit 当前的代码库，因为 Orbit 已有：

- 本地 git 和 worktree 流程
- `gh` 检测
- 本地桌面假设

但产品目标现在需要比原始 CLI 输出更丰富的状态。

### 为什么不全用 `gh`

CLI 方案因速度有吸引力，但当 Orbit 需要以下内容时会变弱：

- 跨多个 UI 表面的一致结构化状态
- 明确的能力发现
- PR 检查、审查者和 issue 链接的可重复模型
- 比命令 stderr 解析更好的错误类型

### 为什么不用纯 API

纯 API 集成将 Orbit 推向了比必要更重的身份和认证架构。Orbit 仍然是本地优先的，所以最低摩擦的路径是让仓库本地操作贴近桌面环境，让更丰富的状态来自 API 支持的调用。

---

## 操作流程

### 导入仓库

1. 用户选择 owner/repo
2. Orbit 解析克隆 URL
3. Orbit 克隆到选定的本地目录
4. Orbit 验证远程映射
5. Orbit 创建项目元数据和仓库绑定
6. Orbit 打开项目并开始后台刷新远程状态

### 发布仓库

1. 验证项目路径
2. 确保或初始化本地 git 仓库
3. 如需要则创建初始提交
4. 创建 GitHub 仓库
5. 添加 `origin`
6. 推送默认分支
7. 持久化仓库绑定

### 创建 PR

1. 确保分支存在且已推送
2. 从项目绑定解析基础分支
3. 创建草稿或就绪 PR
4. 将 PR 链接持久化到任务和 worktree
5. 开始检查和审查状态的状态刷新循环

### 同步刷新

1. 获取远程引用
2. 本地计算领先/落后
3. 为活动分支刷新链接的 PR
4. 为活动 PR 刷新检查
5. 向渲染器存储发出更新

---

## 错误处理预期

Orbit 应该使 GitHub 失败状态明确：

- 未认证
- 权限不足
- 仓库不可访问
- 远程缺失
- 分支未推送
- PR 已存在
- 合并被检查阻止
- 合并被审查阻止
- 网络故障
- 速率限制

这些不应折叠成通用的"GitHub 失败"警报。连接的产品需要类型化的失败，因为恢复操作依赖于原因。

---

## 与当前 Orbit 实现的关系

### Orbit 已有的

- 本地 git 状态和 worktree 生命周期
- 幽灵分支和预合并安全门控
- Night Shift 执行模型
- 可以承载更多状态的渲染器面板
- `gh` CLI 存在检测

### 仍然缺失的

- 账户级 GitHub 连接
- 仓库绑定/解绑模型
- 导入流程
- 发布流程
- 远程同步模型
- PR 和 issue 链接持久化
- UI 中的检查/审查状态反映
- 支持 GitHub 的任务和 worktree 界面

---

## Superset 研究

Superset **没有**将 GitHub 实现为单一机制。它使用分层混合模型：

1. **通过 GitHub App 进行云/组织集成**
2. **通过 `gh` 进行本地桌面集成**
3. **GitHub 远程和粘贴的 GitHub URL 的共享规范化助手**

### 1. GitHub App 和同步的组织元数据

Superset 有专门的数据库表用于：

- 安装
- 仓库
- 拉取请求

参见：

- `packages/db/src/schema/github.ts`
- `packages/db/drizzle/0011_add_github_integration_tables.sql`

模式持久化：

- 安装身份和权限
- 同步的仓库清单
- PR 状态、检查状态、审查决定和时间戳

这是一个真正的集成模型，而不仅仅是便捷的 CLI 包装器。

### 2. 应用安装回调和同步作业

Web 应用安装 GitHub App 并在回调后存储安装：

- `apps/api/src/app/api/github/callback/route.ts`

然后排队同步作业：

- 枚举可访问的仓库
- 存储仓库元数据
- 获取最近的 PR
- 获取 PR 头的检查

参见：

- `apps/api/src/app/api/github/jobs/initial-sync/route.ts`
- `apps/api/src/app/api/github/sync/route.ts`
- `packages/trpc/src/router/integration/github/github.ts`

这意味着 Superset 为组织拥有 GitHub 状态的服务器端远程清单。

### 3. 桌面端本地仍使用 `gh`

在桌面应用中，Superset 仍使用 `gh` 进行仓库本地查询，例如：

- 列出本地项目的 PR
- 搜索用于工作区创建的 PR
- 从本地检出获取仓库所有者

参见：

- `apps/desktop/src/lib/trpc/routers/projects/projects.ts`
- `apps/desktop/src/lib/trpc/routers/projects/utils/github.ts`

因此 Superset 不是"仅 GitHub App"。它使用云端进行同步的组织元数据，桌面端用于快速的本地仓库操作。

### 4. 规范远程解析被视为基础设施

Superset 有共享的 GitHub 远程解析器：

- `packages/shared/src/github-remote.ts`

它将 SSH/HTTPS 远程规范化为稳定的 `owner/name/url` 标识，且该解析器在项目链接、路径解析和远程匹配中重用：

- `packages/trpc/src/router/v2-project/v2-project.ts`
- `packages/host-service/src/trpc/router/project/utils/resolve-repo.ts`
- `packages/host-service/src/runtime/pull-requests/pull-requests.ts`

这是一个重要的架构选择：他们将远程规范化视为共享原语，而不是 UI 粘合剂。

### 5. PR 状态作为产品状态被刷新

Superset 有一个运行时管理器，定期：

- 解析分支上游
- 将分支映射到仓库标识
- 刷新 PR 状态
- 计算检查状态

参见：

- `packages/host-service/src/runtime/pull-requests/pull-requests.ts`
- `apps/desktop/src/renderer/lib/githubQueryPolicy/githubQueryPolicy.ts`

这更接近产品化的"GitHub 状态基质"，而不是一次性的 PR 按钮。

### 6. 查询规范化是明确的

Superset 还规范化粘贴的 GitHub PR 和 issue URL、`#123` 和纯数字查询：

- `packages/host-service/src/trpc/router/workspace-creation/normalize-github-query.ts`

这让产品可以自然地接受 GitHub 形的用户输入，而不是强制只有一种搜索风格。

---

## Orbit vs Superset

### Orbit 应该借用的

#### 1. 共享规范远程解析

Orbit 应该添加单一共享远程解析器，并通过它规范化所有仓库绑定。Superset 正确地将其作为基础。

#### 2. 持久的仓库绑定模型

Superset 的项目记录和仓库标识之间的项目级链接是正确方向。Orbit 需要相同的概念，即使其存储模型是本地优先的。

#### 3. PR/检查状态作为产品状态

Superset 将 PR 状态视为值得存储、轮询和在多个界面中反映的内容。Orbit 应该对 Project Room、任务、worktree 和 Night Shift 做同样的事情。

#### 4. 输入规范化

Superset 对 GitHub URL 和 `#123` 简写的明确规范化是 Orbit 未来 issue/PR 链接流程的良好先例。

### Orbit 不应该直接复制的内容

#### 1. 完整的云优先安装模型

Superset 有组织、服务器数据库表、GitHub App 安装和异步同步作业，因为其架构跨越 Web、桌面、组织范围和共享云状态。Orbit 当前是本地优先的桌面应用，以仓库为中心项目所有权。

因此 Orbit 应该避免第一个版本依赖于：

- 托管后端
- 组织范围的同步作业
- 服务器端 GitHub 清单作为主要真值源

#### 2. 分离的云和桌面产品假设

Superset 可以依赖云支持的组织图，然后丰富桌面应用。Orbit 应该让**本地项目**成为真值单位，并将 GitHub 作为项目绑定添加。

### 核心架构差异

Superset 的重心是：

- 组织 -> 同步的仓库 -> 工作区 -> PR 状态

Orbit 的重心应该是：

- 仓库/项目 -> 本地 git/worktree -> 远程仓库绑定 -> PR/检查状态

这种差异很重要。Orbit 应该借用 Superset 的严谨性，而不是其部署模型。

---

## 建议

Orbit 应该采用**混合本地优先 GitHub 架构**：

1. **项目范围的仓库绑定**作为核心模型
2. **共享 GitHub 远程规范化**作为基础设施
3. **结构化 GitHub 状态模型**用于 PR、issue 和检查
4. **选择性使用 `gh`** 用于本地友好的操作
5. **API 支持的更丰富元数据**用于 CLI 输出变得太弱的地方
6. **GitHub 状态直接反映到任务、worktree 和 Night Shift**

简言之：

- 借用 Superset 在规范化、持久化和状态反映方面的严谨性
- **不要**全盘复制 Superset 的 GitHub App 加云优先架构
- 保持 Orbit 以其本地仓库和项目模型为基础

---

## 最终产品论题

Orbit 中的 GitHub 不应该感觉像"一些用于远程 git 的按钮"。它应该感觉像是 Orbit 本地执行模型缺失的远程一半。

Orbit 已经知道工作如何在本地规划和执行。这个集成让 Orbit 也理解：

- 工作在远程何处
- 它如何被审查
- 检查是否通过
- 是否已合并
- 以及远程真值如何更新本地工作区

这才是将 GitHub 从配件变为真正 Orbit 子系统的产品线。
