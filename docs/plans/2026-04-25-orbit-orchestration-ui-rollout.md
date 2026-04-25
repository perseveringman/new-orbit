---
status: completed
created: 2026-04-25
updated: 2026-04-25
---

# Orbit Orchestration UI Rollout

> 日期：2026-04-25
> 状态：Completed
> 范围：runtime workspace、agents library、project role binding 入口收敛、React Flow planner canvas

---

## 一、问题重述

前三份 orchestration 方案的主进程能力已经基本落地，但 UI 仍停留在“Project Room 附属管理面板”阶段：

1. **缺少 workspace 级 runtime 页面**
   - runtime registry、leases、reports 只能零散出现在项目角色页中
   - 无法像 Multica 那样从一个独立控制面观察 provider 能力与当前执行负载

2. **缺少 workspace 级 agents / roles library 页面**
   - 当前只有 Project Roles tab
   - 全局模板、版本、跨项目使用情况、模板级汇总没有独立入口

3. **planner 仍是列表 + JSON，不是画布**
   - proposal 历史已经存在
   - 但还没有方案要求的可平移 / 缩放 / 聚焦的任务图画布

4. **缺少从 workspace 页面跳回项目执行现场的顺滑入口**
   - agents library 看不到项目 binding 的稳定跳转路径
   - runtime 页面看不到以 runtime 为中心的 leases / reports drill-down

---

## 二、三份方案中仍缺的页面

### 1. 来自 Planner Agent + Dispatch 方案

- **Project Planner Canvas**
  - 版本切换
  - proposal graph 画布
  - 节点 / 边可视化
  - proposal publish 结果联动
- **proposal 版本可视化工作区**
  - 当前先不做图结构 diff 编辑器，但页面结构要为后续 diff / accept / reject 留位

### 2. 来自 Local Runtime Architecture 方案

- **Runtime Workspace**
  - runtime registry 列表
  - runtime detail
  - capabilities / limits / binary / version
  - active leases / recent reports
  - refresh & health observation

### 3. 来自 Global Role Template Agent 方案

- **Agents / Roles Library**
  - 全局模板列表
  - 模板详情
  - 版本历史
  - provider / dispatch 默认策略
  - 跨项目 binding 汇总
- **Project Role Binding 深链入口**
  - 从 library / runtime 直接跳到某项目的 Roles 面板
  - Project Room 接收 `roles` / `planner` pane hint

---

## 三、布局策略（参考 Multica，结合 Orbit 优化）

参考 Multica 的两个核心模式：

1. **workspace 左栏固定入口**
   - runtime / agents 进入 workspace 级控制面
   - Orbit 保持现有 Dashboard / Inbox / Today / Kanban，不引入第二套导航

2. **list/detail 双栏工作区**
   - 左栏：对象列表（runtime / template）
   - 右栏：detail + statistics + recent activity
   - Orbit 先采用固定宽度双栏，避免引入过多新的面板状态管理

结合 Orbit 的优化：

- **runtime 页面**偏“控制面 / 状态面板”
  - 更强调 capabilities、leases、reports、当前执行负载
- **agents 页面**偏“资产库 / 方法论”
  - 更强调模板基线、版本、跨项目 binding 使用情况
- **planner 页面**保留在 Project Room
  - 因为 proposal 仍是 project-scoped artifact
  - 但主体换成 React Flow canvas

---

## 四、目标信息架构

### Workspace 左栏新增

- `Runtimes`
- `Agents`

### Workspace 主内容新增

- `RuntimesView`
- `AgentsLibraryView`

### Project Room 增强

- `planner` pane hint
- `roles` pane hint
- `ProjectPlannerView` 升级为 React Flow canvas

---

## 五、实施步骤

### Phase 1：导航与文档

- 扩展 `WorkspaceView`
- 扩展左栏入口 / top bar / VaultView 路由
- 新建 rollout 文档

### Phase 2：Runtime Workspace

- 实现 runtime list/detail 页面
- 聚合 snapshot / leases / reports
- 增加跳转到项目 Roles 的入口

### Phase 3：Agents Library

- 实现模板 list/detail 页面
- 版本信息、provider 偏好、dispatch 默认策略可视化
- 聚合跨项目 bindings / reports

### Phase 4：React Flow Planner

- 引入 React Flow
- 将 proposal nodes / edges 渲染为可平移缩放画布
- 保留 publish、JSON 编辑、proposal history
- 增加节点详情与布局保存

### Phase 5：文档与验证

- 更新 CHANGELOG / ROADMAP / architecture
- 跑 typecheck / lint / test

---

## 六、完成标准

满足以下条件才算本次 rollout 完成：

1. 左侧 workspace 导航可直接进入 Runtime 与 Agents 页面
2. Runtime 页面可独立查看 registry、capabilities、leases、reports
3. Agents 页面可独立查看模板、版本、跨项目 bindings 与最近报告
4. Project Planner 使用 React Flow 渲染 proposal graph
5. Agents / Runtime 页面能深链回 Project Room 的 roles/planner 执行现场
