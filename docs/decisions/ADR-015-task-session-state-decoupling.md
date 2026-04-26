---
id: ADR-015
title: Task 状态机与 Agent 会话状态机解耦
status: accepted
date: 2026-04-28
related: ADR-006, ADR-007, ADR-012, ADR-014
implementation: plans/2026-04-28-task-execution-lifecycle-realignment.md
---

# ADR-015: Task 状态机与 Agent 会话状态机解耦

## Context

Phase 3 完成代码后第一次真实 dog-food 立刻暴露根因故障：

1. 用户在看板新建 task（`to do` + `autonomous`）
2. Auto-runner 拾取派发，agent 启动
3. **Agent 第一句话就说**："我需要补充 X、Y、Z" → 进程退出
4. Orbit 把 task 状态从 `doing` 改成 `blocked`
5. 用户在 task chat 补充信息 → **task 不会自动回 `doing`**
6. 链路死在这里

根因：Orbit 把两层完全不同的概念混在一个状态字段里：

| 层 | 关心的事 | 时间尺度 |
|---|---|---|
| **Task 状态**（项目层） | 这件事做完了没？人审过没？依赖就绪没？ | 跨 session、跨次会话、长期持有 |
| **Agent 会话状态**（执行层） | 进程活着吗？等用户回信吗？哪个 runtime 在跑？ | 跨多次启动、跨 runtime 切换 |

混在一起后：
- agent 进程"软退出"（求助补充信息）被当成 task 阶段终结
- ADR-007 定义的 `blocked`（依赖未就绪）被复用来表达"等用户回信"，语义重叠导致 unblock 路径都没接通
- ADR-012 已经把"vendor session 不死"做了，但 task 状态机还在按"agent 进程退出 = task 阶段结束"的旧模型运转

ADR-006 引入的 `propose-approve` 也没有覆盖这一类情形——agent 求助是"我没法继续"而不是"我要扩张状态"，没有合适的 propose 类型来匹配。

## Decision

把 task 状态和 agent 会话状态**显式拆成两台独立的状态机**，互不直接耦合：

### Task 状态机（项目层 / 持久 / 跨 session）

```
to do → ready → doing → review → done
                  │                  │
                  │                  ▼
                  │              archived
                  ▼
                blocked  ← 仅用于 ADR-007 depends_on 未就绪
                  │
                  ▼
                ready
```

**`blocked` 严格收敛为"依赖未就绪"语义**，不再表达任何"等用户"或"agent 失败"语义。

### Agent 会话状态机（执行层 / per RunSegment）

```
idle → launching → running ⇄ awaiting_user
                       │
                       ├→ completed
                       ├→ failed_retryable    （runtime 内部已处理）
                       └→ failed_terminal     （触发 fallback / Inbox）
```

`awaiting_user` 是新引入的会话子状态，专门表达"agent 求助等用户回信"。

### 关键迁移规则

| 触发 | task 当前 | task 迁移 | agent 会话迁移 |
|---|---|---|---|
| Auto-runner 派发 | ready | doing | idle → running |
| Agent 主动求助 | doing | **不变** | running → awaiting_user |
| 用户在 chat 发消息 | doing/awaiting | doing | awaiting → running |
| Agent 完成 | doing | review | running → completed |
| Agent 不可重试错 | doing | **不变** | running → failed_terminal |
| 全 runtime 失败 | doing | **不变** | failed_terminal + Inbox B3 |
| 依赖未就绪 | ready | blocked | — |
| 依赖就绪 | blocked | ready | — |

**关键约束**：agent 会话事件 **不直接修改 task 状态**，必须经过 `task state reducer` 决定是否影响 task 状态。所有 task 状态变更点统一走这个 reducer。

## Rationale

**为什么不用一个状态机统揽**：

混在一起的代价（dog-food 已经验证）：单向门、状态语义重叠、unblock 路径漏接、用户体验断裂。

**为什么 `awaiting_user` 是会话子状态而不是 task 状态**：

- "等用户回信"是会话内部事件，不是项目阶段——一个 task 可能在生命周期里反复进入 `awaiting_user` 多次
- 看板视觉上仍然是 `doing` 列里的卡片（仅加图标提示）——避免用户误认为 task 死了
- 不需要新一个 task 状态来表达，避免状态空间膨胀

**为什么 reducer 必须统一**：

事件来源多（user/agent/dispatcher/system），如果每个调用点直接改 status，状态机无法单元测试，无法回放，无法演进。Reducer 模式让所有迁移路径有单一入口、可测试、可观察。

**替代方案**：

- **新增 `awaiting_user` 作为独立 task 状态**：拒绝。看板呈现复杂化、用户认知负担；本质是会话事件不该上升到项目层。
- **保留 `blocked` 双语义，加 sub-reason 字段**：拒绝。等同于把语义模糊性藏到深处，状态机推理仍然受影响。
- **不解耦，靠 dispatcher 自动重新派发解决"agent 求助→blocked"**：拒绝。dispatcher 不知道 agent 求助是不是已被回应；语义在错的层。

## Consequences

**正面**：

- 5 个 dog-food 症状（blocked 单向门 / 求助即死亡 / 续跑不连通 / 切 runtime 怕丢历史 / 故障无恢复入口）一起松动
- 状态机可单元测试 + 边覆盖
- ADR-007 `blocked` 语义被还原干净
- 与 ADR-012 task-session 绑定能完整协同（resume 不再被 task 状态破坏）

**负面 / 待处理**：

- 现有所有直接改 `task.status` 的代码点都需要重写为走 reducer——一次性工作量
- 测试需要同步覆盖两个状态机的协同（在 plan 的 lifecycle scenario 里覆盖）
- 看板需要新增 `awaiting_user` 子状态的视觉表达

**回退计划**：

如果 reducer 模式被发现性能或调试问题，可以局部退回直接调用，但状态机解耦本身不可逆——`blocked` 的语义已经被还原，agent 会话事件不再写 task 状态。

## Implementation

详见 [`plans/2026-04-28-task-execution-lifecycle-realignment.md`](../plans/2026-04-28-task-execution-lifecycle-realignment.md) 的 §3.1 和 §5 实施顺序。

关键实施点：

- 新模块：`src/main/task-state/reducer.ts`
- 字段扩展：`RunSegment.sessionStatus` (`idle` / `launching` / `running` / `awaiting_user` / `completed` / `failed_retryable` / `failed_terminal`)
- 现有 `task.status = ...` 调用点全部改为 `dispatch(reducer, input)`
- 看板组件读取 `task.status === 'doing' && activeRunSegment.sessionStatus === 'awaiting_user'` 决定是否显示等待图标
