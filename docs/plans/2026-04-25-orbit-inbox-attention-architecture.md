---
status: draft
created: 2026-04-25
updated: 2026-04-25
---

# Orbit Inbox Attention Architecture

> 日期：2026-04-25
> 状态：Draft
> 范围：Inbox 作为用户待处理事项收集箱、通用事件投影、监听/闭环流转、跨业务扩展

---

## 一、问题背景

Orbit 现在已经有多种“需要用户看一眼”的东西，但它们散落在不同位置：

- `InboxView` 仍然主要承载 `backlog` task 的分拣
- `ReviewInboxView` 承载 Night Shift / terminal 审批与 review 项
- task chat / dispatch / runtime 已开始产生 `needs_attention` 语义
- 后续还会出现定时 auto agent，例如每日 AI 资讯、日报、自动巡检、定时 review

这些对象有一个共同点：

1. **它们都不是“瞬时通知”**
2. **它们需要持续存在，直到用户或系统把它们真正处理完**
3. **它们需要被持续监听，直到后端状态发生闭环**

因此，Orbit 不能再把 Inbox 定义成“待分拣任务池”或“消息列表”，而应将其升级为：

> **用户注意力与待处理事项收集箱（attention collection system）**

在这个定义下：

- “看过”只影响未读状态
- “是否还存在于 Inbox”由事项生命周期决定
- Inbox item 可以等待审批、等待澄清、等待用户 review、等待外部系统完成

---

## 二、设计目标

### G1. Inbox 是待处理事项，不是瞬时消息

Inbox item 必须可以在用户看过之后继续存在，直到事项真正闭环。

### G2. 与具体业务解耦

Inbox 不能只服务任务系统。后续 scheduler、planner、approval、digest、external sync 都应接入同一套模型。

### G3. 生命周期与未读状态分离

“未读/已读”描述的是注意力是否被看到；“open/resolved”描述的是事项是否已完成，二者必须独立。

### G4. 支持持续监听与自动闭环

例如 agent 等待审批、任务等待澄清、scheduled job 等待用户 review，都应被统一监听与自动 resolve。

### G5. 跨 UI 一致

Inbox、Kanban 卡片、Task Detail、Runtime Workspace、Workspace Badge 应该看到同一份 attention 状态，而不是每处自己猜。

### G6. 可扩展、可投影、可恢复

Inbox 应由通用事件系统和投影器构成，支持重启恢复、去重、历史归档和新业务快速接入。

---

## 三、核心设计决策

| 问题 | 决策 |
| --- | --- |
| Inbox 是 task list 还是 attention system | **attention system** |
| `backlog` task 是否继续叫 Inbox | **否，改为 Backlog / Capture** |
| Inbox item 是业务真相吗 | **不是，是投影视图** |
| Inbox item 是否会因“已读”而消失 | **不会** |
| Inbox item 生命周期由谁决定 | **watch / resolver 规则决定** |
| 新业务如何接入 Inbox | **发标准化领域事件，由 Inbox projector 物化** |
| 同一事项重复触发如何处理 | **基于 dedupe key 合并/upsert** |
| 监听机制怎么做 | **事件优先，轮询兜底** |
| Inbox 是否只在 Workspace 层展示 | **否，Workspace 汇总 + Project / Task 局部投影** |

---

## 四、Inbox 的定位：事项收集箱，不是消息中心

Orbit 中应明确区分以下概念：

| 概念 | 含义 |
| --- | --- |
| Toast / Notification | 瞬时提醒 |
| Domain Event | 一次业务状态变化 |
| Inbox Item | 需要用户继续处理、跟进或确认的事项 |
| Task | 工作本体 |
| Run / Approval / ScheduleJob | 事项背后的业务对象 |

因此：

- 任务完成可以产生一条 Inbox item
- 审批请求可以产生一条 Inbox item
- 定时 AI 资讯生成可以产生一条 Inbox item
- 但这些 item 本身**不是 task，也不是审批对象本身**

Inbox item 是面向用户的“待处理 case”。

---

## 五、双状态模型：已读 ≠ 已完成

Inbox item 至少需要两套状态。

### 1. 阅读状态（read state）

- `unread`
- `read`

### 2. 生命周期状态（lifecycle state）

- `open`：尚未开始处理或仍在等待动作
- `monitoring`：用户已处理一部分，但系统还需继续观察后续状态
- `resolved`：事项闭环完成
- `archived`：已归档，不再占用主 Inbox
- `snoozed`：暂时隐藏，稍后再提醒

示例：

#### 审批请求

- 初始：`unread + open`
- 用户看过但未批准：`read + open`
- 用户批准，agent 继续执行：`read + resolved`

#### 资讯日报

- 初始：`unread + open`
- 用户打开阅读：`read + open`
- 用户归档或转为 task：`read + resolved`

---

## 六、统一 Inbox Entry 模型

建议引入通用 `InboxEntry`。

```ts
type InboxEntry = {
  id: string
  dedupeKey: string

  kind: string
  source: 'dispatch' | 'approval' | 'planner' | 'scheduler' | 'system'

  title: string
  summary?: string
  body?: string

  severity: 'info' | 'warning' | 'critical'
  attentionType: 'needs_action' | 'needs_review' | 'monitoring' | 'informative'

  readState: 'unread' | 'read'
  lifecycleState: 'open' | 'monitoring' | 'resolved' | 'archived' | 'snoozed'

  subjectType?: 'task' | 'run' | 'approval' | 'schedule_run' | 'artifact' | 'project'
  subjectId?: string

  vaultId?: string
  projectUid?: string
  taskUid?: string
  runId?: string
  bindingId?: string
  scheduleId?: string

  actions?: InboxAction[]
  watch?: InboxWatchDescriptor

  createdAt: string
  updatedAt: string
  resolvedAt?: string
}
```

该模型要点：

1. `kind` 负责表达业务类型
2. `source` 负责表达来源模块
3. `subject*` 负责关联真实业务对象
4. `actions` 提供 UI 可执行动作
5. `watch` 负责持续监听闭环

---

## 七、通用事件 → Inbox 投影架构

Inbox 不应让每个业务模块自己写 UI 数据，而应引入一个统一投影器。

### 1. Domain Event Producers

各模块只负责发标准化事件，例如：

- `task.clarification_requested`
- `task.completed`
- `task.failed`
- `approval.requested`
- `approval.resolved`
- `dispatch.needs_attention`
- `schedule.job_succeeded`
- `schedule.job_failed`
- `artifact.generated`

### 2. Inbox Projector

统一的 `InboxProjector` 负责：

1. 将事件转换为 `InboxEntry`
2. 基于 `dedupeKey` 执行 upsert
3. 决定默认 `attentionType / severity / actions / watch`
4. 在后续事件到来时自动 resolve / update

### 3. Inbox Store

`InboxStore` 负责：

- 查询当前 active items
- 按项目/来源/严重级过滤
- 标记已读/未读
- snooze / archive
- 持久化与恢复

### 4. Inbox Watcher

`InboxWatcher` 负责：

- 订阅领域事件
- 对支持事件订阅的 subject 使用 event-first watch
- 对不支持事件流的 subject 使用 polling fallback
- 在 watch 条件满足时发出 resolve/update 事件

---

## 八、Watch / Resolver 系统

这是 Inbox 区别于“消息列表”的核心。

### 1. Watch Descriptor

每个 Inbox item 都可以附带一个 watch 描述：

```ts
type InboxWatchDescriptor = {
  mode: 'event' | 'poll' | 'hybrid'
  subjectType: string
  subjectId: string
  resolveWhen: string[]
  updateWhen?: string[]
  pollIntervalMs?: number
  expiresAt?: string
}
```

### 2. 典型场景

#### 审批

- subject: `approval:<id>`
- resolveWhen: `approved | rejected | cancelled`

#### 任务澄清

- subject: `task:<uid>` 或 `lease:<id>`
- resolveWhen:
  - task status 重新进入 `doing`
  - 或 task 进入 `done`
  - 或 lease 被 release

#### 定时资讯

- subject: `schedule_run:<id>`
- resolveWhen:
  - 用户 archive
  - 用户 convert-to-task
  - 用户 open artifact 并标记已处理

### 3. Resolver 原则

- resolver 只修改 Inbox item，不修改真实业务对象
- 真实业务对象的变化来自原领域模块
- Inbox 只是消费这些变化并更新自己的投影视图

---

## 九、Inbox Action 机制

Inbox 不能只展示文本，还要提供通用动作接口。

典型动作包括：

- `open_task`
- `open_project`
- `reply_in_chat`
- `approve`
- `reject`
- `retry`
- `resume`
- `open_run_log`
- `open_artifact`
- `convert_to_task`
- `archive_item`

建议动作采用统一结构：

```ts
type InboxAction = {
  id: string
  label: string
  kind: string
  payload?: Record<string, unknown>
  style?: 'primary' | 'secondary' | 'danger'
}
```

UI 层只渲染 action；真正执行逻辑由 `InboxActionExecutor` 路由到具体业务模块。

---

## 十、去重、合并与历史保留

Inbox 若不做去重，很快会被刷爆。

### 去重原则

#### 1. 同 subject + same kind 默认合并

例如：

- 同一个 task 连续三次要求补充信息
- 应更新同一条 `clarification_needed` item，而不是创建三条

#### 2. `dedupeKey` 由 projector 决定

例如：

- `clarification_needed:task:<taskUid>`
- `approval_required:approval:<approvalId>`
- `digest_ready:schedule:<scheduleRunId>`

#### 3. resolved item 不直接硬删除

应保留历史，供：

- 项目审计
- 调试追踪
- 后续 daily review / distill 使用

活跃视图只展示 `open / monitoring / unread` 的主集合。

---

## 十一、UI 与信息架构建议

### 1. Workspace Inbox

显示整个 vault 的待处理事项：

- clarification
- approvals
- failures
- completed tasks
- scheduled outputs

并提供：

- 未读数
- 按项目过滤
- 按类型过滤
- 按严重级过滤

### 2. Project 层投影

Project Room 只显示与当前项目有关的 item：

- `projectUid === currentProjectUid`

### 3. Task 层投影

TaskCard / TaskRow / Task Detail 只显示与该 task 相关的 active inbox item。

例如：

- `Needs info`
- `Approval pending`
- `Failed`
- `Completed`

### 4. Backlog / Capture 重命名

现有承接 `backlog` task 的视图，不应继续叫 Inbox。

建议改为：

- `Backlog`
- 或 `Capture`

这样 Orbit 的信息架构才清楚：

- `Backlog` = 未分拣任务
- `Inbox` = 待处理事项

---

## 十二、典型流转示例

### 1. Agent 需要用户补充信息

1. dispatch / conversation 产生 `task.clarification_requested`
2. Inbox projector 创建 `clarification_needed`
3. item 状态：`unread + open`
4. 用户查看后变为 `read + open`
5. 用户回复，agent 恢复执行
6. watch 检测 task 回到 `doing`
7. Inbox item 自动 `resolved`

### 2. Agent 请求审批

1. 运行过程产生 `approval.requested`
2. Inbox 创建 `approval_required`
3. 用户未审批前 item 始终存在
4. 用户审批后产生 `approval.resolved`
5. agent 流程继续，Inbox item resolve

### 3. 每日 AI 资讯

1. scheduler 触发资讯 agent
2. 产出 digest artifact
3. Inbox 创建 `digest_ready`
4. 用户打开 digest 但未处理，仅变为 `read`
5. 用户 archive 或转 task 后 resolve

### 4. 任务完成

1. task 被 agent 标记 `done`
2. 产生 `task.completed`
3. Inbox 创建 `task_completed`
4. 该 item 可以是 `needs_review` 或 `informative`
5. 用户查看并归档后 resolve

---

## 十三、存储建议

建议在 `.orbit/` 下新增 inbox 存储层。

### 推荐路径

```text
.orbit/
  inbox/
    entries.json
    history.jsonl
```

### 设计建议

- `entries.json`：当前快照，便于快速加载 UI
- `history.jsonl`：事件历史，便于审计与恢复

不建议把 Inbox item 写入 Markdown / Git：

1. 它们属于高频运行态
2. 很多 item 不是 task
3. 已读/监控/resolve 会频繁变化，不适合污染 repo

---

## 十四、与现有模块的关系

### 现有 `InboxView`

应重构为 `BacklogView` 或 `CaptureView`，不再承担真正 Inbox 的角色。

### 现有 `ReviewInboxView` / `reviewQueue`

应逐步并入统一 Inbox 系统，作为：

- 一类 domain event producer
- 或一类 `approval_required / review_required` projector

### 现有 Dispatch / Task Conversation / Runtime

这些模块继续维护自己的领域真相，但将 attention 事件统一发给 InboxProjector。

---

## 十五、实施阶段建议

### Phase 1 — 统一模型与持久化

- 定义 `InboxEntry` / `InboxWatchDescriptor` / `InboxAction`
- 新建 `.orbit/inbox/` 存储
- 实现基础 query / read / mark-read / resolve / archive

### Phase 2 — 事件投影

- 接入 dispatch needs_attention / completed / failed
- 接入 approval request / resolved
- 接入 scheduled artifact generated / failed

### Phase 3 — UI 收敛

- `InboxView` 正式切为 attention center
- backlog task 迁移到 `Backlog`
- TaskCard / Project Room / Workspace 顶栏统一显示 attention badge

### Phase 4 — Watcher 与闭环自动化

- 引入 watch / resolver
- 支持 event-first + polling fallback
- 自动 resolve clarification / approval / resumed execution

---

## 十六、结论

Orbit 的 Inbox 不应再被理解为“消息列表”或“待分拣任务池”，而应被定义为：

> **一个面向用户待处理事项的持久 attention collection system。**

它与 task、approval、scheduler、planner 等业务解耦，通过：

- 通用领域事件
- 统一投影器
- watch / resolver
- 可执行 actions
- 读状态与生命周期双状态模型

来支持 Orbit 后续越来越多的自动化能力，而无需为每个新业务再重新发明一套“消息中心”。
