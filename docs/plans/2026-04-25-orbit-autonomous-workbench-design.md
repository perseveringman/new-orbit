---
status: draft
created: 2026-04-25
updated: 2026-04-25
---

# Orbit Autonomous Workbench Design

> 日期：2026-04-25
> 状态：Draft
> 范围：一个带持续调度和注意力回路的 autonomous workbench；覆盖 Planner、Kanban、Dispatch、Inbox、Scheduler 与人机协同闭环

---

## 一、问题背景

Orbit 已经逐步具备了以下能力：

- Project Room + Kanban
- Planner proposal 与 React Flow 画布
- Local Runtime registry
- Dispatch lease / report / binding
- Task conversation
- Project-level agent context

但这些能力目前仍更像一组“并列功能”，而不是一个真正持续运转的工作台。

当前缺口在于：

1. **规划、执行、注意力、自动化没有形成闭环**
2. **用户补充信息后，系统还不能稳定恢复原 autonomous chain**
3. **Scheduler / auto agent 的产物还没有统一进入工作流**
4. **Inbox / attention 语义尚未成为系统级骨架**

因此，Orbit 下一阶段不应只继续修单点问题，而应明确它的整体产品形态：

> **一个带持续调度和注意力回路的 autonomous workbench**

---

## 二、设计目标

### G1. Kanban 仍是任务唯一真相

所有正式任务的状态、列语义、依赖结果仍然以 Kanban / task frontmatter 为准。

### G2. Planner 持续生成工作图，不直接替代正式任务系统

Planner 负责 proposal、拆分、依赖与版本化，不直接成为执行态真相。

### G3. Agent 能持续认领并执行 ready 任务

Orbit 应从“手动点一下才跑”演进为“有约束地持续调度”。

### G4. 人类通过 Inbox 介入，而不是直接打断系统模型

当 agent 需要澄清、审批或 review 时，应通过 attention loop 拉人进入，而不是各模块自己弹窗或临时分叉。

### G5. Auto agents 与 scheduled jobs 是一等公民

每日 AI 资讯、定时 review、巡检、总结都应能在同一工作台内生存，而不必先伪装成 task。

### G6. 系统应具备长期学习与再规划能力

执行历史、daily review、distill、planner proposal 应形成长期反馈回路。

---

## 三、核心设计决策

| 问题 | 决策 |
| --- | --- |
| Orbit 的核心界面是什么 | **Kanban + Inbox + Planner + Runtime** 的统一工作台 |
| task 是否仍是唯一工作单位 | **不是，task 是正式工作单位；artifact / approval / digest 也是系统对象** |
| autonomous 是否意味着完全无人参与 | **不是，人通过 Inbox 进入 attention loop** |
| 用户回复澄清时如何恢复 | **恢复原 autonomous chain，而不是创建新 manual 语义** |
| scheduler 产物是否必须先建 task | **不必须，可先成为 artifact / inbox item** |
| Planner proposal 与 task 的关系 | **proposal 是待发布设计；task 是已发布执行真相** |
| Inbox 的职责 | **承接所有待处理事项，不局限于 task** |
| Runtime / Roles 的职责 | **负责谁可以执行、在哪里执行、以什么人格执行** |

---

## 四、Orbit 的五层工作台模型

Orbit 可以被理解成五层。

### 1. Planning Layer（规划层）

负责高层目标收敛与 proposal 生成：

- planner chat
- proposal versions
- dependency graph
- publish diff

产出的是“未来应该做什么”。

### 2. Work Layer（正式任务层）

负责正式执行真相：

- Kanban columns
- task markdown
- DAG / preconditions
- owner / execution_strategy

产出的是“当前有哪些正式工作项”。

### 3. Execution Layer（执行层）

负责真正的 agent 调度与运行：

- role templates
- project bindings
- runtime registry
- leases / reports / run segments

产出的是“谁正在做、是否卡住、是否完成”。

### 4. Attention Layer（注意力层）

负责把需要用户介入、review、批准或确认的事项汇总到 Inbox：

- clarification needed
- approval required
- task completed
- scheduled digest ready
- failed job needs review

产出的是“用户现在需要看什么、处理什么”。

### 5. Learning Layer（学习层）

负责沉淀经验、推动下一轮规划：

- execution log
- task summary
- daily review
- distill
- proposal re-planning

产出的是“系统下一轮如何更聪明、更稳地执行”。

---

## 五、四个核心闭环

### 1. 规划闭环（Plan Loop）

```text
高层目标 -> Planner Chat -> Proposal -> 人工确认发布 -> 正式 Task
```

关键原则：

- Planner 不直接执行
- Proposal 可多版本演化
- 发布后才进入正式任务系统

### 2. 执行闭环（Execution Loop）

```text
todo task -> binding claim -> running -> done / blocked / needs_attention
```

关键原则：

- `todo` 才能进入自动认领
- owner/binding 一旦认领，默认持续负责
- 失败或澄清不会自动把任务伪装成完成

### 3. 注意力闭环（Attention Loop）

```text
run 产生 attention -> Inbox item -> 用户处理 -> 系统恢复执行/闭环 -> Inbox resolve
```

这是 autonomous workbench 的关键特征：

- 自动化不停机
- 人类只在关键点被拉入
- 用户介入后系统继续向前滚动

### 4. 自动化闭环（Scheduled Automation Loop）

```text
schedule trigger -> auto agent run -> artifact / update -> Inbox -> 用户消费/转化 -> resolve
```

这类闭环往往不先经过 task，而是从 schedule 直接进入 artifact + inbox。

---

## 六、核心对象模型

### 1. Proposal

表达“尚未发布”的规划版本。

### 2. Task

表达“已发布的正式工作项”，Kanban 唯一真相。

### 3. Binding / Lease / Run

表达“谁在做、做到了哪一步、当前执行态如何”。

### 4. InboxEntry

表达“用户待处理事项”。

### 5. Schedule

表达“应自动定时执行的 agent 工作”。

### 6. Artifact

表达“auto agent 产出的可消费对象”，例如：

- digest
- report
- summary
- imported notes

它可以后续转化为 task，但不要求一开始就是 task。

---

## 七、状态机与职责边界

### Task 状态机

- `backlog`
- `waiting`
- `todo`
- `doing`
- `blocked`
- `done`

Task 回答的问题是：

> 这件正式工作当前处于什么阶段？

### Lease / Run 状态机

- `claimed`
- `running`
- `needs_attention`
- `completed`
- `failed`
- `released`

Run 回答的问题是：

> 当前执行有没有被谁持有、是否正在跑、是否需要介入？

### Inbox 状态机

- read: `unread / read`
- lifecycle: `open / monitoring / resolved / archived / snoozed`

Inbox 回答的问题是：

> 用户现在是否需要继续看、继续处理、继续等待？

这三套状态机必须**正交**，不能互相偷懒代替。

---

## 八、用户在这个工作台中的角色

Orbit 不是要把用户踢出流程，而是重新定义用户的工作方式。

用户应主要负责：

1. 提出高层目标
2. 审阅/发布 proposal
3. 处理 Inbox 中的 attention items
4. 对关键结果做最终确认
5. 调整角色、策略、schedule 与长期方向

用户不需要反复手动 dispatch 每个小任务，但也不会被完全排除在系统之外。

---

## 九、为什么 Inbox 是 autonomous workbench 的核心

如果没有统一 Inbox，Orbit 会退回成：

- 一个 Kanban
- 一个 Planner 面板
- 一个 Runtime 面板
- 若干零散提示

这样 autonomous 只会变成“后台有人在跑”，而不是“一个真正可协作的工作台”。

Inbox 的作用是：

1. 把系统拉人机制做成统一入口
2. 让用户知道当前有哪些事真的需要自己处理
3. 让 auto agent / scheduler 的产物有统一归宿
4. 让 Orbit 能在多业务扩展下保持一致交互模式

因此：

> **Kanban 是工作真相，Inbox 是注意力真相。**

---

## 十、关键业务流示例

### 1. 普通 autonomous task

1. task 发布后进入 `todo`
2. binding 自动认领
3. task -> `doing`
4. agent 执行
5. agent 标记 `done`
6. dispatch 收尾
7. Inbox 产生 `task_completed`

### 2. 澄清型 autonomous task

1. task -> `todo`
2. binding 认领
3. agent 发现信息不足
4. task -> `blocked`
5. run -> `needs_attention`
6. Inbox 产生 `clarification_needed`
7. 用户回复
8. 原 binding 恢复执行
9. task -> `doing` -> `done`
10. Inbox clarification resolve，并产生 completion item

### 3. 审批型任务

1. 运行过程中 agent 请求审批
2. Inbox 产生 `approval_required`
3. 用户审批
4. 原 run 继续
5. item resolve

### 4. 每日 AI 资讯

1. scheduler 按时触发
2. news agent 运行
3. 生成 digest artifact
4. Inbox 产生 `digest_ready`
5. 用户打开阅读、转 task、归档或忽略

---

## 十一、主要 UI 形态

### Workspace 层

- **Inbox**：全局 attention collection
- **Backlog/Capture**：未分拣任务
- **Runtimes**：执行面板
- **Agents**：角色模板与 bindings

### Project 层

- **Planner**：proposal 与任务图
- **Kanban**：正式任务真相
- **Task Detail / Chat**：任务级上下文与执行沟通
- **Project Inbox Slice**：当前项目 attention item 子集

### Task 层

TaskCard / Task Detail 应同时显示：

- task status
- owner / binding
- active run
- active inbox badge

这样用户才能在单个 task 上既看到工作状态，也看到注意力状态。

---

## 十二、自动化与 schedule 设计原则

Orbit 后续的 auto agents 不应只是“后台偷偷跑脚本”，而应成为工作台的一等组成部分。

### 1. Schedule 是显式对象

应保存：

- schedule id
- name
- purpose
- trigger（cron / interval / manual）
- target project / scope
- bound role / runtime
- output type
- failure policy

### 2. Schedule run 是一等运行态

每次调度都有：

- scheduleRun id
- startedAt / finishedAt
- status
- artifact refs
- inbox refs

### 3. Artifact 不强迫转 task

例如每日 AI 资讯，本体更像 digest artifact，而不是任务。

但 Orbit 要支持：

- 从 artifact 派生 task
- 从 artifact 进入 review
- 从 artifact 进入 archive

---

## 十三、系统不变量

为了让 Orbit 真正成为 autonomous workbench，需要坚持以下不变量：

1. **Kanban task status 是正式任务唯一真相**
2. **Inbox 不是任务列表，而是 attention case collection**
3. **read/unread 不等于 open/resolved**
4. **用户回复澄清应恢复原 autonomous chain，而不是切成新的 manual 模式**
5. **scheduled artifacts 可以独立存在，不强制伪装成 task**
6. **Planner proposal 永远不是正式任务真相，发布后才是**
7. **binding 是自动化参与调度的最小单位**

---

## 十四、分阶段实施建议

### Phase 1 — 信息架构收敛

- 将现有 `Inbox` 更名为 `Backlog` 或 `Capture`
- 正式定义 Workspace Inbox 为 attention center
- 引入 `InboxEntry` 通用模型

### Phase 2 — Attention System 落地

- 建立 domain event -> inbox projector
- 接入 clarification / approval / completion / failure
- 在 TaskCard / Project Room / Workspace 显示 attention badges

### Phase 3 — Autonomous Resume Flow

- 用户回复 clarification 后恢复原 binding/running chain
- 自动 resolve clarification item
- completion 后再生成 completed item

### Phase 4 — Schedule / Auto Agent

- 建立 schedule object
- 支持 digest/report/review 等 artifact 型自动化
- 让 scheduler 统一接入 inbox

### Phase 5 — Learning Loop

- completion / failure / inbox history 进入 distill
- planner 参考历史 attention 模式优化 proposal

---

## 十五、与现有设计文档的关系

本方案不是替代已有设计，而是把它们串成一个更高层的产品骨架：

- `2026-04-24-orbit-planner-agent-dispatch-design.md`
  - 提供规划图、waiting/todo/ownership 的任务执行骨架
- `2026-04-24-orbit-local-runtime-architecture.md`
  - 提供 runtime registry 与 dispatch 能力
- `2026-04-25-orbit-role-template-agent-design.md`
  - 提供 roles / bindings / health / history 的角色骨架
- `2026-04-25-orbit-inbox-attention-architecture.md`
  - 提供 attention collection 与 watch/resolve 机制

这个 autonomous workbench 文档负责回答的是：

> **Orbit 作为一个整体，应该如何持续规划、持续调度、持续拉人、持续学习。**

---

## 十六、结论

Orbit 的下一阶段产品形态不应只是“带 agent 的 Kanban”，而应是：

> **一个带持续调度和注意力回路的 autonomous workbench。**

在这个工作台中：

- Planner 持续生成结构化工作图
- Kanban 持续承载正式任务真相
- Dispatch / Runtime 持续推动 ready work 前进
- Inbox 持续承接需要用户介入的事项
- Scheduler / Auto Agent 持续生成新的 artifact 与工作流
- Distill / Review 持续把经验反馈到下一轮规划

这样 Orbit 才能真正从“工具集合”进化为“可长期共工作的本地 AI 协作系统”。
