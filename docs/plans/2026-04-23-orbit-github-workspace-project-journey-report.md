# Orbit GitHub Workspace / Project Journey 实施报告

## 结论

本轮 GitHub 重构已经落地完成。Orbit 现在具备三层连续能力：

1. **Workspace > GitHub 控制平面**：账号状态、仓库列表、筛选、导入、打开已绑定项目。
2. **Project > GitHub 协作面**：Overview / Issues / PRs / Worktrees 四个项目级页面，以及 issue 绑定 / 解绑。
3. **GitHub-aware Night Shift**：Night Shift 计划可携带 GitHub 选项，任务状态会回传 issue / PR / checks 元数据。

## 本次交付

### 1. Workspace > GitHub

- 左侧 workspace 导航增加 **GitHub**
- 新增 workspace 级 GitHub 页面：
  - 连接状态与当前 GitHub 账号
  - `gh` Web 登录触发
  - 仓库搜索 / owner 过滤
  - 仓库 readiness / importStatus 展示
  - 已导入仓库可直接 **Open Project**
  - 未导入仓库可直接 **Import**

关键文件：

- `src/renderer/src/store/github.ts`
- `src/renderer/src/views/GitHubWorkspaceView.tsx`
- `src/main/github/service.ts`
- `src/main/github/ipc.ts`

### 2. Project > GitHub

Project Room 新增 **GitHub** 外层 tab，并接入专用 sidebar surface。

项目级 GitHub 页面已实现：

- **Overview**
  - repo / viewer / branch / PR 摘要
  - Publish to GitHub / Create PR / Refresh
  - 正常 Terminal 与 Night Shift 两条交付旅程卡片
- **Issues**
  - issue 列表
  - Orbit task 与 GitHub issue 的绑定 / 解绑
- **PRs**
  - PR 列表
  - checks / reviews 摘要
- **Worktrees**
  - Orbit worktree 与分支 / PR 对应关系

关键文件：

- `src/renderer/src/views/ProjectRoomView.tsx`
- `src/renderer/src/views/ProjectGitHubView.tsx`
- `src/renderer/src/views/projectRoomModel.ts`
- `src/renderer/src/views/vaultRightSidebarModel.ts`

### 3. Night Shift GitHub-aware 流程

Night Shift 现在支持 GitHub 选项入参并回传结果：

- 计划参数：
  - `pushBranch`
  - `createDraftPr`
  - `baseBranch`
  - `reviewers`
  - `labels`
  - `waitForChecks`
- 执行结果：
  - `issueNumber`
  - `prUrl`
  - `prNumber`
  - `checks`

前端 Night Shift 模态框也增加了 GitHub 配置项，并支持 project-scoped 启动。

关键文件：

- `src/main/night_shift/dispatcher.ts`
- `src/main/r6_ipc.ts`
- `src/renderer/src/components/Modals/NightShiftModal.tsx`
- `src/renderer/src/store/nightShift.ts`

## 共享契约与后端补充

本轮同时完成了 GitHub 契约与后端补齐：

- IPC / preload 新增：
  - `github.authenticate`
  - `github.listRepositories`
  - `github.getProjectDetails`
  - `github.bindTaskIssue`
  - `github.unbindTaskIssue`
- task frontmatter 新增 GitHub issue 绑定字段：
  - `github_issue_number`
  - `github_issue_title`
  - `github_issue_url`

## 与原蓝图的对应关系

本次实施已经覆盖蓝图中的核心主链路：

`Workspace GitHub -> 导入 / 打开项目 -> Project GitHub 页面 -> task 绑定 issue -> PR / worktree / checks 可见 -> Night Shift GitHub-aware`

这意味着 GitHub 不再只是 Project Room 头部的一条状态条，而是 Orbit 内部的一级产品面。

## 当前边界

当前版本仍保持本地优先和 `gh` CLI 优先：

- GitHub 认证通过 `gh auth login --web` 驱动，不是内嵌 OAuth WebView
- Issue 绑定使用轻量 prompt 选择 task，还不是完整的表格式批量绑定器
- Night Shift 后端支持 reviewers / labels，但当前 modal 先暴露了最关键的 push / draft PR / base branch / checks 选项

这些边界不会阻断主链路，但它们是下一轮可以继续增强的方向。

## 验证结果

- 全量测试：`437 passed`
- Typecheck：通过

## 建议的下一步

下一轮最有价值的增强方向是：

1. Project GitHub 页面内做结构化的 task-issue 绑定器
2. 在 Night Shift modal 中补齐 reviewers / labels 输入
3. 将 checks / reviews 的增量刷新做成自动轮询或订阅式体验
