---
status: draft
created: 2026-04-24
updated: 2026-04-24
---

# Orbit Planner Agent + Agent Dispatching 设计方案

> 日期：2026-04-24
> 状态：Draft
> 范围：任务规划画布、依赖图、任务发布、agent 抢单与任务 ownership

---

## 一、问题重述

Orbit 当前已经有任务、Kanban、Agent Runner、Night Shift、worktree 与 Project Room，但这些能力仍然偏向“人手动挑任务，再触发 agent 执行”。

这带来几个问题：

1. **任务拆分与依赖管理缺位**
   - 用户知道要做一个目标，但系统缺少稳定的任务规划层
   - 任务之间的阻塞关系只能靠文字描述，无法形成可计算的依赖图

2. **Night Shift 偏批处理，不是持续调度**
   - 它更像一次性批量运行器，而不是常驻的任务 dispatch 系统
   - 不适合“agent 平时主动找任务做”的工作方式

3. **任务模型缺少 ownership 语义**
   - 当前任务缺少明确的创建来源、规划来源、owner、release 语义
   - `status` 一项不足以表达“谁在负责这个任务”

本方案目标不是在现有 Night Shift 上继续打补丁，而是将 Orbit 升级为：

- 上层有 **Planner Agent + 规划画布**
- 中层有 **已确认的正式任务系统**
- 下层有 **本地 agent dispatching / ownership / retry / release**

---

## 二、设计目标

### G1. 规划与执行解耦

Planner Agent 只负责拆任务、识别依赖、生成 proposal，不直接执行任务。

### G2. 看板仍是唯一真相

所有任务仍在同一套 Kanban 中可见，而不是额外建一个独立的“抢单池”。

### G3. 进入视图 ≠ 可认领

任务可以都出现在看板上，但只有依赖满足的任务才进入可认领集合。

### G4. ownership 必须是一等概念

任务从 `todo` 被认领成功后，必须明确归属于某个 agent 或人，而不是一个临时模糊状态。

### G5. Markdown / Git-first 不动摇

正式任务仍然以 Markdown/frontmatter 作为 canonical artifact；高频运行态放入 `.orbit/`。

---

## 三、核心设计决策

| 问题 | 决策 |
| --- | --- |
| 任务是否仍然只在 Kanban 中展示 | **是**，所有已确认任务都在同一张板上 |
| 规划中的任务放哪一列 | **`backlog`** |
| 有前置依赖但未 ready 的任务放哪一列 | **新增 `waiting` 列** |
| 可被 agent 认领的列 | **`todo`** |
| `todo -> doing` 如何发生 | **事务性认领：状态切换 + owner 写入必须同成败** |
| 任务失败后是否自动回到 `todo` | **否**，默认仍归原 owner 处理 |
| 回到 `todo` 的条件 | **agent 主动 release 或人强制 release** |
| 依赖关系如何表达 | **DAG（任务图）**，不是仅靠 `blocked` 状态 |
| planner 输出如何呈现 | **版本化规划画布（proposal history）** |
| 多个规划版本如何比较 | **图结构 diff + 版本切换渲染** |
| 高频执行态存哪里 | **`.orbit/` runtime state** |

---

## 四、任务生命周期与列语义

本方案下，任务列语义重定义如下：

- **`backlog`**：任务尚在规划阶段，未正式发布到执行系统
- **`waiting`**：任务已确认，但有未完成的前置依赖
- **`todo`**：任务已确认，且依赖满足，可被人或 agent 认领
- **`doing`**：任务已被明确 owner 持有，正在执行
- **`blocked`**：软阻塞，如等待设计确认、外部系统、人工输入
- **`done`**：任务完成

这里的关键点是：

1. `waiting` 是 **依赖未满足** 的结构化结果
2. `blocked` 是 **软阻塞**，用于非 DAG 型阻塞
3. `doing` 不是“有人正在碰一下”，而是“已明确归属给某个 owner”

### ownership 规则

任务一旦从 `todo` 被认领成功，就必须写入：

- `owner_type`: `agent | human`
- `owner_id`
- `claimed_at`
- `active_run_id`（如适用）

此后该任务默认由 owner 持续负责，失败或重试不自动回公共池。

---

## 五、Planner Agent 与规划画布

Planner Agent 的职责不是直接创建正式任务，而是基于项目上下文生成一个 **plan snapshot**。

输入可包括：

- Project README / Vision / AGENT.md
- 当前正式任务
- Session history
- 用户提出的高层目标

输出包括：

- 任务节点
- 父子关系
- 前置依赖边
- 推荐 owner 类型（human / agent / either）
- 推荐执行策略（manual / autonomous）
- 关键阻塞链与摘要说明

### 规划画布

Planner 输出在 UI 中表现为一张画布：

- 任务节点是卡片
- `depends_on` / `blocks` / `parent-child` 是边
- 用户可以平移、缩放、聚焦局部任务图

### 版本化 proposal

每次 planner 运行会形成一个新的 `plan version`，例如：

- `v1 初始规划`
- `v2 细化拆分`
- `v3 重排依赖`

Orbit 不默认相信最新规划，而是将每次规划都视为可审阅 proposal。只有用户确认某个版本后，该版本才会被发布为正式任务系统。

---

## 六、规划发布流程

规划版本从 proposal 进入正式任务系统时，采用“显式发布”而不是自动覆盖。

### 发布前，用户可以看到

- 新增了哪些任务
- 删除了哪些任务
- 哪些任务被拆分
- 哪些依赖边新增 / 删除 / 调整
- 哪些任务会进入 `waiting`
- 哪些任务会进入 `todo`

### 发布时，Orbit 执行

1. 创建或更新正式任务文件
2. 写入任务 frontmatter
3. 持久化依赖图
4. 重新计算列归属
5. 将该规划版本标记为 accepted

发布后规则：

- 有未完成前置依赖的任务 → `waiting`
- 无依赖或依赖已完成的任务 → `todo`
- 人类明确保留在手上的任务，也可直接进入 `doing`

同一个版本允许重复发布，但必须保证幂等，不得重复造任务。

---

## 七、存储模型：三层分离

为兼顾 Git 可读性和调度效率，落盘分成三层。

### 1. Markdown 任务（正式事实层）

保存长期事实：

- `uid`
- `title`
- `status`
- `project_uid`
- `execution_strategy`
- `origin`
- `created_by`
- `assigned_to`
- `parent_task_uid`

这层进入 Git，是用户可读、可 review 的正式任务定义。

### 2. `.orbit` Runtime State（高频执行层）

保存高频变化：

- 当前 owner
- active run / session
- retry count
- last heartbeat
- release reason
- force release audit

这层不进入 Git，不污染 Markdown。

### 3. 规划画布快照（proposal history）

建议路径：

```text
.orbit/plans/<projectUid>/<planVersion>.json
```

其中保存：

- 任务节点
- 依赖边
- 布局坐标
- planner summary
- accepted / rejected 状态
- 输入上下文摘要

最终形成：

- **画布层** = proposal history
- **Markdown 层** = accepted reality
- **runtime 层** = execution state

---

## 八、任务与依赖的数据模型

当前 `TaskFrontmatter` 需要扩展，建议新增：

```yaml
uid: task-xxx
type: task
title: 接入 GitHub 发布
status: todo
project_uid: proj-xxx
origin: human | agent | system | imported
created_by: human:ryan | agent:planner
assigned_to: null | human:xxx | agent:planner-1
execution_strategy: manual | autonomous
parent_task_uid: task-parent
generated_from_task_uid: task-source
```

### 依赖边

当前已有 `pre_conditions` 雏形，建议正式承认为硬依赖：

```yaml
pre_conditions:
  - task-a
  - task-b
```

规则：

- `pre_conditions` 只表达硬依赖
- `blocked_reason` 只表达软阻塞
- 发布 / 编辑时必须检测环

### inline task 规则

inline task 默认不参与 agent dispatching。若要参与依赖图与自动认领，必须先 promote 为 file task，以获得稳定 `uid`。

---

## 九、认领事务与调度器

执行层引入本地 **dispatcher/runtime loop**。

### 候选集

看板上的所有任务都可见，但 dispatcher 只扫描：

- `status = todo`
- 依赖已满足
- `execution_strategy = autonomous`
- 当前无 owner

### 原子认领

`todo -> doing` 必须一次性完成以下动作：

1. 再次校验任务仍处于 `todo`
2. 再次校验依赖已满足
3. 写入 `owner_type / owner_id`
4. 写入 `claimed_at`
5. 写入 `active_run_id`
6. 将 `status` 切换到 `doing`

只要其中一步失败，整次认领失败，任务保留在 `todo`。

### retry / release 语义

- 任务失败后默认仍归当前 owner 处理
- owner 可以 retry / resume
- owner 可以主动 release
- 人可以强制 release
- 只有 release 后任务才回到 `todo`

这能避免因短暂失败或进程抖动导致任务被其他 agent 重复抢占。

---

## 十、UI 方案

### 1. Kanban 本体

同一张看板新增并固定列顺序：

```text
backlog → waiting → todo → doing → blocked → done
```

### 2. 规划画布

Project Room 或独立规划面板中提供：

- 版本切换
- 图结构 diff
- 发布当前版本
- 拒绝当前版本
- 从当前 accepted 版本继续派生新规划

### 3. 任务卡片信息

任务卡片需要能看出：

- 来源：human / agent / imported
- 当前 owner
- 是否有未满足依赖
- 是否是 planner 生成的子任务

### 4. ownership 操作

对 `doing` 中的任务提供：

- Retry
- Resume
- Release
- Force release（仅人工）

---

## 十一、异常处理与恢复

### 必须处理的异常

1. **循环依赖**
   - planner 发布前校验，手动编辑依赖时也校验

2. **半认领状态**
   - 若 owner 已写入但 run 未完整启动，启动时应自动修复

3. **重复发布**
   - 同一 plan version 重复发布必须幂等

4. **异常退出**
   - Orbit 或 agent 崩溃后，任务默认仍保留原 owner
   - 不自动回到 `todo`

5. **人工接管**
   - 用户可 force release，将任务退回 `todo`
   - 必须记录释放原因与操作者

---

## 十二、测试边界

### T1. 纯模型测试

- 列归属计算
- 依赖满足判断
- DAG 环检测
- 图结构 diff 生成

### T2. 存储测试

- plan snapshot 发布后的任务文件生成
- accepted version 标记
- runtime state 写入与回收

### T3. 调度测试

- 两个 agent 同时抢同一任务，仅一个成功
- 认领失败时任务不脏写

### T4. 恢复测试

- 半认领恢复
- 崩溃后 retry / resume
- force release
- 上游完成后，下游从 `waiting` 自动进入 `todo`

---

## 十三、与 Night Shift 的关系

本方案的方向不是继续强化 Night Shift，而是将其能力吸收到更通用的 dispatch 系统中。

- Night Shift 的 **worktree / auto-PR / batch runner** 仍然有价值
- 但“挑任务”这一步不再由 Night Shift 主导
- 长期看，Night Shift 可收敛为一种 **批量 dispatch 策略**，而不是单独的核心工作流

也就是说，Orbit 的主路径将从：

```text
人选任务 → Night Shift 批量跑
```

转向：

```text
Planner 产出任务图 → 人确认 → 任务进入看板 → agent 自动认领可执行任务
```

---

## 十四、分阶段落地建议

### Phase 1

- 扩展任务 schema（origin / owner / parent / generated_from）
- 新增 `waiting` 列
- 让 `pre_conditions` 真正参与列计算

### Phase 2

- 引入 planner proposal 数据结构
- 做出版本化规划画布
- 支持发布某一版为正式任务

### Phase 3

- 引入 dispatcher loop
- 实现 `todo -> doing` 原子认领
- 引入 retry / release / force release

### Phase 4

- 将 Night Shift 收敛为 dispatch 策略的一种
- 支持 planner / executor agent 分工协作

---

## 十五、结论

本方案的核心不是“再加一个 agent 功能”，而是把 Orbit 的任务系统升级为：

1. **上游是版本化规划画布**
2. **中游是 Markdown-first 正式任务系统**
3. **下游是带 ownership 的本地 agent dispatching**

这样 Orbit 才能稳定支持：

- agent 参与任务拆分与依赖分析
- 人类审核并发布规划版本
- agent 平时主动找任务干
- 任务在失败时仍保持明确 owner，而不是退化成混乱的公共池

这会让 Orbit 从“带 agent 的本地看板”进一步演化为“本地优先的人机协作任务操作系统”。
