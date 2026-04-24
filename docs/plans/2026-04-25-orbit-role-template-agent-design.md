---
status: completed
created: 2026-04-25
updated: 2026-04-25
---

# Orbit Global Role Template Agent Design

> 日期：2026-04-25
> 状态：Completed
> 范围：全局角色模板、项目角色绑定、运行实例、调度参与、历史观察、版本升级与健康状态

---

## 一、问题背景

Orbit 已经完成了两条更底层的设计：

- Planner Agent + Agent Dispatching
- Local Runtime Architecture

但如果没有一套稳定的 agent 配置模型，这两条设计最终仍会退化成“某处代码直接拉起某个 provider CLI”。在继续落地自动调度之前，Orbit 需要先回答：

1. agent 到底是全局资产还是项目资产
2. 谁负责定义 agent 的长期人格与方法论
3. 谁负责决定某个项目里哪些 agent 可以参与调度
4. 用户应该去哪里看 agent 的执行历史与当前状态

Multica 的 agent 设计提供了重要参考，但它天然更偏 **team-first**：

- 面向 workspace 共享 agent
- 面向共享 runtimes / shared skills
- 面向 owner/admin 级别的敏感配置权限控制
- 面向“这个虚拟员工被分配过哪些任务”

Orbit 的目标不同。Orbit 更适合做成 **role-first**：

- 用户沉淀一组跨项目可复用的工作角色
- 项目只引用这些角色，并做少量局部覆盖
- 真正参与抢单的是项目里的“角色绑定”，不是模板本身

因此，本方案的核心是：**把 Orbit 的 agent 设计为“全局角色模板 + 项目角色绑定 + 运行时实例”三层模型。**

---

## 二、设计目标

### G1. 全局复用优先

同一个 `planner`、`executor`、`reviewer`、`researcher` 模板应能被多个项目复用，而不是每个项目都重新配置一套 agent。

### G2. 项目差异可控

项目可以针对模板做局部覆盖，但不能无限制改写模板的核心人格，避免角色漂移。

### G3. 历史与运行态分层

长期角色配置、项目内执行历史、单次运行日志必须分开存放和展示。

### G4. 与调度系统天然耦合

角色系统必须和 planner / dispatch / runtime 设计自然对接，而不是额外平行存在一套“agent 面板”。

### G5. 演进可追溯

模板升级要像代码一样可版本化、可比较、可回滚，而不是全局热替换。

---

## 三、核心设计决策

| 问题 | 决策 |
| --- | --- |
| Orbit 的 agent 是全局还是项目级 | **全局角色模板为主，项目通过 binding 引用** |
| 是否提供预置角色 | **是**，内置 `planner / executor / reviewer / researcher`，并允许自定义模板 |
| 项目是否允许覆盖模板 | **允许少量覆盖** |
| 项目覆盖方式 | **引用模板 + project overlay**，不复制整份模板 |
| 任务历史放在哪里看 | **双入口：模板页看跨项目汇总，binding 页看项目内任务列表** |
| 谁能参与自动调度 | **项目 binding**，不是模板 |
| 自动化粒度如何配置 | **每个 binding 单独配置 `manual / suggested / autonomous`** |
| 模板更新如何传播 | **版本化发布，项目显式升级** |
| 故障隔离单位是什么 | **binding health**，维护 `healthy / degraded / paused / blocked` |

---

## 四、三层模型

Orbit 的 agent 不应是一个单一对象，而应拆成三层。

### 1. Role Template（全局角色模板）

这是长期资产，用于定义“这个角色是谁”。它保存：

- 角色名称与 slug
- 模板类型（内置 / 自定义）
- 默认 instructions
- 默认 skills
- 默认 model / provider 偏好
- 默认并发上限
- 默认执行策略
- 默认输出风格
- 默认自治能力

这层表达的是跨项目稳定不变的方法论。例如：

- `planner`：优先拆解目标、识别依赖、输出 proposal
- `reviewer`：保守、重验证、关注回归风险
- `researcher`：优先搜集证据与上下文，再输出建议

### 2. Project Role Binding（项目角色绑定）

这是项目层对象，用于定义“某个项目如何使用这个角色模板”。它引用具体模板版本，并保存：

- project overlay instructions
- skills 启用/禁用覆盖
- runtime 偏好
- 并发上限覆盖
- 调度模式（manual / suggested / autonomous）
- 任务范围过滤条件
- 是否启用自动认领

### 3. Execution Instance / Lease（运行实例）

这是高频运行态对象，只在真正认领任务时生成。它保存：

- binding id
- task id
- run id / session id
- heartbeat
- retry
- release reason
- failure reason
- runtime execution metadata

这层不属于长期配置，不应和模板或 binding 混在一起。

---

## 五、模板与绑定的字段边界

为避免配置漂移，Orbit 必须严格区分模板层与 binding 层的职责。

### 模板层负责长期稳定内容

模板层应该承载：

- 核心 persona 与 instructions
- 默认技能组合
- 默认模型与 provider 倾向
- 默认并发策略
- 默认自治能力
- 输出风格与工作方法

这些内容应跨项目稳定，体现角色的长期身份。

### 绑定层负责项目局部执行偏好

binding 层只负责：

- 项目补充上下文
- 启用/禁用局部 skills
- runtime 偏好
- 并发上限覆盖
- 自治开关
- 任务范围过滤

### 关键约束

**项目不能直接改写模板的核心 instructions，只能追加 project overlay。**

原因是：

1. 同一角色必须跨项目保持可识别
2. 模板升级需要有稳定基线
3. 失败分析需要知道究竟是模板问题还是项目覆盖问题

UI 上应明确展示：

> 最终生效配置 = 模板基线 + 项目覆盖

---

## 六、任务历史与观察入口

Orbit 不应把“某个 agent 干过什么”只放在一个地方，而应提供 **双入口、同一底层数据**。

### 1. 模板页：看跨项目汇总

在 Role Template 详情页中，展示：

- 哪些项目启用了该模板
- 总执行次数
- 最近活跃项目
- 常见失败模式
- 各模板版本的整体表现

模板页回答的问题是：

> 这个角色整体表现如何？

### 2. Binding 页：看项目内任务列表

在项目的 Role Binding 详情页中，展示：

- 当前项目里该 binding 的任务列表
- 最近 runs
- 成功率与平均耗时
- 当前是否空闲
- 最近失败原因
- release / retry 历史

binding 页回答的问题是：

> 这个项目里的这个角色做过什么？

### 3. Run Detail：看单次执行

如果需要看某次具体执行，则进入 run 详情，查看：

- prompt 组装结果
- session transcript
- tool 调用
- stdout / stderr
- lease 生命周期
- 失败原因与释放原因

---

## 七、调度参与模型

Orbit 真正参与抢单的不是模板，而是 **已启用的项目角色绑定**。

### 1. Binding 才是调度候选者

模板本身不能认领任务。只有当某个项目创建 binding 并启用后，它才进入候选池。

### 2. 每个 binding 独立配置调度模式

建议支持三种模式：

- `manual-only`
- `suggested`
- `autonomous`

含义：

- `manual-only`：只能手动指派
- `suggested`：可被系统推荐，但不自动认领
- `autonomous`：可主动认领 `todo` 任务

这样同一个 `reviewer` 模板在不同项目可以有不同自治等级。

### 3. 任务优先面向“角色”而不是“实例”

planner 发布任务时，不直接绑定具体 agent，而是写入：

- 推荐角色
- 或能力标签

例如：

- `recommended_role = reviewer`
- `candidate_roles = [researcher, planner]`

之后由 dispatcher 结合 binding 状态、runtime 能力、并发额度、健康状态去选择实际执行者。

### 4. Ownership 写 binding，不写模板

认领成功后，任务 owner 应记录的是 **project role binding id**，而不是 template id。因为真正持有任务的是项目中的角色实例，而非全局角色定义。

---

## 八、模板版本化与升级策略

全局模板一旦被多个项目复用，就必须可版本化。

### 1. 模板按版本发布

例如：

- `reviewer@v1`
- `reviewer@v2`
- `reviewer@v3`

项目 binding 引用的是某个具体版本，而不是“永远跟随最新版”。

### 2. 升级必须显式触发

当模板发布新版本后，项目 binding 页面应展示：

- 当前使用版本
- 最新可升级版本
- 升级摘要
- overlay 冲突提示

项目可以选择：

- 保持在旧版
- 升级并保留 overlay
- 升级后重建 overlay

### 3. 这样做的好处

1. 角色行为可审计
2. 失败分析更可靠
3. 可支持局部试用新版模板
4. 不会因为模板微调而影响所有项目

**结论：模板更新采用版本化发布，项目显式升级。**

---

## 九、UI 信息架构

Orbit 的角色系统建议按 **资产层 / 项目层 / 运行层** 三层展示，而不是做成单一 agent 详情页。

### 1. Roles Library（模板层）

用于查看与维护：

- 所有预置和自定义模板
- 模板详情
- 默认 instructions / skills / model 偏好
- 版本历史
- 跨项目汇总

### 2. Project Role Bindings（项目层）

用于查看与维护：

- 当前项目启用的 bindings
- 调度模式
- runtime 偏好
- 并发占用
- 最近任务
- 健康状态
- 模板升级提醒

binding 详情页是“查看这个项目中的角色任务历史”的主入口。

### 3. Run Detail（运行层）

用于查看：

- 单次执行日志
- 任务与 session
- tool 调用
- lease 生命周期
- 失败 / release 细节

### 4. 任务卡上的 owner 展示

任务卡上的 owner 不应只是一个抽象的 `@agent-name`，而应显示可点击的 binding badge，使用户能从任务直接跳到 binding 详情。

---

## 十、Binding 健康状态与失败处理

自动调度接入后，Orbit 需要把 **binding health** 作为一等状态。

建议状态：

- `healthy`
- `degraded`
- `paused`
- `blocked`

### 状态含义

- `healthy`：正常参与调度
- `degraded`：最近失败率高、超时过多或 runtime 不稳定，自动调度权重下降
- `paused`：暂时退出自动调度，但允许人工查看与恢复
- `blocked`：配置缺失、runtime 不可用或模板版本不兼容，不能认领新任务

### 失败处理分层

#### 任务层

保持前一份 dispatch 设计中的规则：

- 任务失败后不自动回到 `todo`
- 默认仍由当前 owner 负责
- 只有主动 release 或人工 force release 才回公共池

#### Binding 层

记录最近一段时间的失败窗口：

- timeout
- tool failure
- validation failure
- runtime unavailable

当失败达到阈值时，binding 自动从 `healthy` 降到 `degraded` 或 `paused`。

#### 模板层

模板本身不直接进入坏状态，但会聚合跨项目失败模式，帮助识别某个模板版本是否存在系统性问题。

---

## 十一、建议的数据结构

以下为概念层字段建议，具体命名可在实施阶段再定。

### RoleTemplate

```ts
type RoleTemplate = {
  id: string
  slug: string
  name: string
  kind: 'builtin' | 'custom'
  latestVersionId: string
  createdAt: string
  updatedAt: string
}
```

### RoleTemplateVersion

```ts
type RoleTemplateVersion = {
  id: string
  templateId: string
  version: number
  instructions: string
  skillRefs: string[]
  modelPreference?: string
  providerPreference?: string
  defaultConcurrency: number
  defaultDispatchMode: 'manual-only' | 'suggested' | 'autonomous'
  allowAutonomous: boolean
  changeSummary?: string
  createdAt: string
}
```

### ProjectRoleBinding

```ts
type ProjectRoleBinding = {
  id: string
  projectUid: string
  templateId: string
  templateVersionId: string
  overlayInstructions?: string
  enabledSkillRefs?: string[]
  disabledSkillRefs?: string[]
  runtimePreference?: string
  concurrencyOverride?: number
  dispatchMode: 'manual-only' | 'suggested' | 'autonomous'
  health: 'healthy' | 'degraded' | 'paused' | 'blocked'
  taskFilter?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

### BindingLease

```ts
type BindingLease = {
  id: string
  bindingId: string
  taskUid: string
  runId?: string
  sessionId?: string
  status: 'claimed' | 'running' | 'failed' | 'released' | 'completed'
  heartbeatAt?: string
  retryCount: number
  releaseReason?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
}
```

---

## 十二、与既有规划/调度/runtime 方案的关系

本方案不是独立系统，而是前两份设计的中间层。

### 与 Planner Agent + Agent Dispatching 的关系

- planner 输出任务时写推荐角色 / 候选角色
- 发布后任务进入 `waiting / todo / doing`
- `todo -> doing` 的事务性认领由 binding 完成
- ownership、release、retry 等语义落在 binding / lease 上

### 与 Local Runtime Architecture 的关系

- binding 提供 runtime 偏好与执行策略
- dispatcher 结合 runtime registry 与 binding 状态做匹配
- 真正执行仍由 LocalRuntimeManager / ProviderAdapter / DispatchService 驱动

因此角色系统是 **planner 与 runtime 之间的执行身份层**。

---

## 十三、落地顺序

建议分四步实施：

### Phase 1：静态模型与 UI

- Role Template 数据结构
- Project Role Binding 数据结构
- Roles Library
- Binding 列表与详情
- 模板版本显示与升级提示

此阶段先不接自动调度。

### Phase 2：接入人工指派

- 任务 owner 从“具体 agent 名称”升级成 binding
- 任务卡展示 binding badge
- binding 页可查看任务历史

### Phase 3：接入自治调度

- 启用 `manual / suggested / autonomous`
- 引入 binding health
- 将 autonomous binding 纳入候选池
- 接入失败阈值、降级与暂停

### Phase 4：接入 planner 闭环

- planner 输出推荐角色
- 发布流程生成角色感知的任务图
- 调度系统根据角色绑定自动认领与执行

原则是：**先稳定角色模型，再让它参与自动执行。**

---

## 十四、结论

Orbit 不应照搬 Multica 的 team-first agent 面板，而应建立一套更适合本地长期工作流的 **role-first agent system**：

- 用全局模板沉淀长期角色
- 用项目 binding 承接局部差异
- 用运行实例表达高频执行态
- 用模板版本化保证演进可控
- 用 binding health 保证自治执行有边界

这将使 Orbit 的 planner、dispatch、runtime 三条设计真正闭环，并为未来的自动执行体系提供稳定的人机协作骨架。
