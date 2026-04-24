---
status: draft
created: 2026-04-24
updated: 2026-04-24
---

# Orbit Local Runtime Architecture（借鉴 Multica Runtime/Daemon）

> 日期：2026-04-24
> 状态：Draft
> 范围：runtime 发现、注册、通信、任务认领、provider 执行、恢复模型

---

## 一、问题背景

Orbit 当前已经具备：

- 本地 agent runner（`src/main/agent/runner.ts`）
- RunnerPool（`src/main/agent/pool.ts`）
- hook runtime / terminal hook
- worktree / git / terminal / session history

但这些能力仍然是“面向单次运行”的：

- UI 或某个功能直接调用 `startTask`
- 运行逻辑由具体模块零散触发
- provider 发现仍以 Claude 为中心
- 还没有一层统一的 runtime 抽象来承接未来的自动任务分配

而 Orbit 新近确定的方向是：

- planner agent 负责任务拆分与依赖图
- 人确认后，任务进入看板
- agent 平时主动认领 `todo` 任务执行

要支撑这个工作流，Orbit 必须先有一层稳定的 runtime 体系，否则“任务分配给 agent”仍会退化成“某处代码直接 spawn Claude”。

---

## 二、为什么要借鉴 Multica

Multica 最值得借鉴的不是 Go server 或云端形态，而是它对执行系统的切法：

1. **runtime discovery**
   - daemon 启动时发现 PATH 上的可用 provider CLI
   - 每个 provider 被注册为 runtime

2. **runtime communication**
   - daemon 与 server 之间通过显式协议通信
   - 语义包括：`register / heartbeat / claim / start / progress / complete / fail`

3. **agent uses runtime**
   - agent 不是直接操作底层 CLI
   - task 先路由到 runtime，再由 runtime 负责拉起 provider 执行

这种抽象的价值是：

- 上层任务系统不需要知道如何调用 Claude/Codex
- provider 差异收敛在 runtime / adapter 层
- 任务所有权、重试、健康检查、恢复逻辑都能统一表达

Orbit 不需要把 Multica 的网络形态照搬过来，但非常需要把这三层逻辑关系带进 Electron。

---

## 三、Multica 运行链路分析

### 1. 发现

Multica daemon 启动后会读取配置中的 provider 列表，为每个 provider 探测 binary 与版本；符合最低版本要求的 provider 会被构造成 runtime 并注册到 server。

关键点：

- discovery 在 daemon 启动时发生
- runtime 是 provider 能力的注册对象
- runtime 有稳定 ID、provider、version、status

### 2. 通信

Multica 的 daemon client 定义了完整执行协议：

- `register`
- `heartbeat`
- `claimTask`
- `startTask`
- `reportProgress`
- `reportTaskMessages`
- `completeTask`
- `failTask`
- `pinTaskSession`
- `recoverOrphans`

这些动作虽然通过 HTTP 传输，但核心其实是状态机，不是 HTTP 本身。

### 3. agent 如何使用 runtime

Multica 中，task 先与 agent / runtime 绑定，再由 runtime 去 claim 任务并拉起实际 provider CLI。也就是说：

- agent 是执行身份
- runtime 是执行能力资源
- provider CLI 是 runtime 的具体实现

---

## 四、Orbit 的约束与目标

Orbit 当前的边界和 Multica 不同：

- 单机 Electron 应用
- 本地 vault、本地 worktree、本地 terminal
- 没有必须存在的远程 server
- UI、任务系统、执行器都处于同一个受控宿主中

因此 Orbit 第一版 runtime 方案应采用：

- **方案 2：本机本进程 runtime**
- 保留向方案 3（本地 sidecar daemon / localhost 服务）扩展的可能
- 但不在第一版引入额外 sidecar 进程、认证令牌与本地 HTTP 控制面

核心目标：

1. 让 runtime 变成 Orbit 的一等对象
2. 让任务系统按 runtime-aware 方式调度
3. 让现有 runner / terminal / hook / worktree 收敛到统一执行底座
4. 让未来拆 sidecar 成为“transport 替换”，而不是整体重做

---

## 五、方案选型

### 方案 1：继续以现有 RunnerPool 为核心，外面包 dispatcher

优点：

- 改动最少
- 可以快速跑通自动认领

缺点：

- runtime 不是一等对象
- provider 发现、能力判断、健康状态会分散在各处
- 向远程 / sidecar 扩展时重构成本高

### 方案 2：LocalRuntimeManager + DispatchService + ProviderAdapter（推荐）

优点：

- 最贴近 Multica 的抽象收益
- 不引入 sidecar 复杂度
- 兼容 Electron 本地场景
- 可自然扩展到方案 3

缺点：

- 需要做一次 main-process 内部模块重构

### 方案 3：本地 sidecar daemon + localhost 通信

优点：

- 与 Multica 的形态最一致
- 后期多进程 / headless / 多设备扩展更顺

缺点：

- 现在引入过重：端口、生命周期、认证、重启、状态一致性成本都太高

结论：**Orbit 第一版采用方案 2。**

---

## 六、总体架构

Electron 方案拆成 5 个核心模块：

1. **LocalRuntimeManager**
2. **RuntimeProbe**
3. **DispatchService**
4. **ProviderAdapter**
5. **RuntimeEventBus**

并预留 3 个抽象接口：

1. **RuntimeTransport**
2. **TaskLeaseStore**
3. **ExecutionBackend**

### 模块职责

#### LocalRuntimeManager

负责：

- 发现本地 provider CLI
- 注册 / 更新 / 移除 runtime
- 提供 runtime registry
- 暴露 runtime 健康状态与能力快照

#### RuntimeProbe

负责：

- 检查设置指定路径
- 扫描 PATH
- 检查已知默认安装路径
- 探测 provider 版本与支持能力

#### DispatchService

负责：

- 从已发布任务中筛选 `todo`
- 根据 agent 配置和 runtime 能力做匹配
- 执行原子认领
- 启动 / 重试 / release / force release

#### ProviderAdapter

负责：

- 将 Orbit 任务上下文翻译为 provider-specific 执行参数
- 拉起 Claude / Codex / Gemini 等进程
- 接收 hook / stdout / usage / session 事件

#### RuntimeEventBus

负责：

- 聚合 runtime / lease / run 事件
- 做节流与去重
- 广播给 renderer

---

## 七、runtime 数据模型

建议新增 shared schema：

```ts
type RuntimeMode = 'local';
type RuntimeStatus = 'online' | 'offline' | 'degraded';

interface RuntimeDescriptor {
  runtimeId: string;
  mode: RuntimeMode;
  provider: 'claude' | 'codex' | 'gemini' | 'opencode' | 'custom';
  name: string;
  binaryPath: string;
  version: string | null;
  status: RuntimeStatus;
  discoveredAt: string;
  lastSeenAt: string;
  capabilities: {
    supportsResume: boolean;
    supportsHooks: boolean;
    supportsWorktree: boolean;
    supportsBackgroundRuns: boolean;
    supportsLongContext?: boolean;
  };
  limits: {
    maxConcurrentRuns: number;
  };
}
```

### 说明

- `runtimeId` 必须稳定，不依赖 UI 临时状态
- 结构里保留 `mode`，为将来 `remote` 扩展留口
- `capabilities` 不能隐含在 provider 名字里，应显式建模

---

## 八、发现与注册流程

### 触发时机

1. App 启动
2. 打开 vault
3. 设置变更（provider path / API key）
4. 用户手动点击“重新扫描 runtime”

### 流程

1. `RuntimeProbe.scan()` 被触发
2. 对每个 provider 执行路径解析与版本探测
3. 生成 `RuntimeDescriptor[]`
4. `LocalRuntimeManager.reconcile()` 对比现有 registry
5. 发布 `runtime:registered / runtime:updated / runtime:removed` 事件

### 持久化

建议持久化到：

```text
<vault>/.orbit/runtime/registry.json
```

或在无 vault 状态下持久化到：

```text
<userData>/runtime-registry.json
```

这样 renderer 在启动时可快速显示“上次已知 runtime 状态”，同时允许后台重新扫描后再刷新。

---

## 九、本地通信协议（语义层）

Orbit 不走 HTTP，但应保留与 Multica 对齐的状态机语义。

建议在 main process 内定义如下协议接口：

```ts
registerRuntime(descriptor)
heartbeatRuntime(runtimeId)
claimTask(runtimeId, taskId?)
startExecution(runtimeId, leaseId)
reportExecutionEvent(runtimeId, leaseId, event)
completeExecution(runtimeId, leaseId, result)
failExecution(runtimeId, leaseId, error)
releaseLease(runtimeId, leaseId, reason)
```

### 关键原则

1. **协议语义与传输层分离**
   - 今天是进程内方法调用
   - 将来可替换为 localhost RPC/HTTP

2. **renderer 不直接调用底层执行对象**
   - renderer 只通过 typed IPC 读取聚合状态或触发高层动作

3. **所有长流程都要可恢复**
   - 运行开始、进度、完成、失败、释放都进入统一 event stream

---

## 十、agent 如何使用 runtime

在新模型里，agent 与 runtime 解耦：

- **agent** = 执行身份与策略
- **runtime** = 底层 provider 能力资源

建议 agent profile 增加：

```ts
interface AgentProfile {
  agentId: string;
  role: 'planner' | 'executor' | 'reviewer' | 'terminal';
  providerPreference?: string[];
  requires: {
    supportsHooks?: boolean;
    supportsResume?: boolean;
    supportsWorktree?: boolean;
    supportsLongContext?: boolean;
  };
  maxConcurrentTasks: number;
}
```

### 匹配逻辑

1. 任务被分配给某个 agent profile
2. `DispatchService` 根据 profile 的约束匹配 runtime
3. 找到合适 runtime 后，生成 lease
4. `ProviderAdapter` 根据 runtime/provider 实际启动执行

这样一来：

- planner agent 不必知道如何启动 Claude
- executor agent 不必自己做 PATH 发现
- provider fallback 可以统一在匹配层处理

---

## 十一、ProviderAdapter 与现有 Orbit 代码的收敛

Orbit 当前已有的执行逻辑，不需要推翻，只需要收口：

### 可复用模块

- `src/main/agent/runner.ts`
- `src/main/agent/pool.ts`
- `src/main/agent/eventRouter.ts`
- `src/main/agent/hooks/server`
- `src/main/agent/terminal_sessions.ts`
- `src/main/agent/claude_sessions.ts`
- `src/main/agent/codex_sessions.ts`

### 重构方向

#### 现状

- `detectClaude()` 只服务 Claude
- `startTask()` 直接从 IPC 触发
- `RunnerPool` 更像运行容器，而不是 runtime backend

#### 目标

- `detectClaude()` 泛化为 `RuntimeProbe`
- `RunnerPool` 下沉为 `ExecutionBackend`
- `startTask()` 不再直接代表“执行任务”的唯一入口，而是被 `DispatchService` 间接调用

换句话说：

**保留现有 runner 执行能力，但改变其被调用的位置与抽象层次。**

---

## 十二、lease / ownership / 任务认领

这套 runtime 架构的存在，是为了服务前面确定的任务分配方案。

因此调度层必须引入 **lease**：

```ts
interface TaskLease {
  leaseId: string;
  taskId: string;
  runtimeId: string;
  agentId: string;
  ownerType: 'agent' | 'human';
  ownerId: string;
  status: 'claimed' | 'running' | 'needs_attention' | 'released' | 'completed' | 'failed';
  claimedAt: string;
  lastHeartbeatAt?: string;
  runId?: string;
}
```

### 原子认领

`todo -> doing` 必须同时完成：

1. 校验任务仍为 `todo`
2. 校验依赖已满足
3. 写入 owner
4. 创建 lease
5. 关联 runtime / agent
6. 启动 run（或标记待启动）

任何一步失败，都必须回滚，不允许留下半认领状态。

---

## 十三、失败恢复模型

Orbit 当前 `runner.ts` 已经有 `_active.json` 与 orphan reconcile，这一思路应扩展到 runtime 层。

### 启动恢复流程

1. 读取 runtime registry
2. 读取 active leases
3. 对每个 active lease 检查：
   - 子进程是否仍存活
   - run log 是否已有终态
   - hook/session 是否可恢复

### 恢复结果

- 仍活着 → reattach
- 已退出但有终态 → 标记 completed/failed
- 已退出且无终态 → 标记 `needs_attention`

### 与任务 ownership 的关系

恢复不自动把任务退回 `todo`。

原因：

- 任务已经明确归属给某个 agent
- 失败、重试、继续执行默认应由原 owner 闭环
- 只有 `release` 或人工 `force release` 才回到公共池

---

## 十四、主进程边界

方案 2 会不会让 main process 太重，取决于职责划分。

### main 只负责

- runtime discovery
- registry 管理
- lease 状态推进
- 事件聚合与广播
- 高层调度决策

### main 不负责

- 大规模图计算
- embedding/检索重运算
- provider 真正执行计算
- 逐行无节流地驱动 UI

### 重活仍在

- child process（Claude/Codex/Gemini）
- node-pty
- hook server
- 独立 planner/executor 子进程

因此方案 2 的本质是：

**主进程做轻协调器，重执行仍在子进程。**

---

## 十五、面向方案 3 的扩展口

为了保留未来拆 sidecar 的可能，第一版必须避免实现绑死在进程内调用上。

建议预留：

### 1. RuntimeTransport

```ts
interface RuntimeTransport {
  registerRuntime(...): Promise<void>;
  heartbeatRuntime(...): Promise<void>;
  reportEvent(...): Promise<void>;
}
```

今天由进程内实现提供，未来可替换为 localhost HTTP / IPC。

### 2. TaskLeaseStore

```ts
interface TaskLeaseStore {
  claim(...): Promise<TaskLease>;
  update(...): Promise<void>;
  release(...): Promise<void>;
  listActive(...): Promise<TaskLease[]>;
}
```

今天可用本地文件或 sqlite，未来可移到 sidecar。

### 3. ExecutionBackend

```ts
interface ExecutionBackend {
  spawnRun(...): Promise<RunHandle>;
  stopRun(...): Promise<void>;
  reattach(...): Promise<RunHandle | null>;
}
```

今天由 `RunnerPool + runner.ts` 实现，未来可替换为 sidecar 执行代理。

---

## 十六、IPC 建议

renderer 需要看到 runtime 与 dispatch 的状态，但不应该拿到低层控制权。

建议新增 IPC namespace：

- `runtime:list`
- `runtime:refresh`
- `runtime:get`
- `runtime:onEvent`
- `dispatch:status`
- `dispatch:onEvent`
- `dispatch:releaseTask`
- `dispatch:retryTask`

### renderer 关心的展示

- 当前有哪些可用 runtime
- 每个 runtime 正在跑几个任务
- 哪些任务在 `todo`
- 哪些任务已被某个 runtime/agent 持有
- 哪些任务处于 `needs_attention`

---

## 十七、落地顺序

### Phase 1 — Runtime Discovery

- 新建 `RuntimeProbe`
- 将 `detectClaude` 泛化为多 provider 探测
- 新建 `LocalRuntimeManager`
- UI 展示 runtime registry

### Phase 2 — Runtime Execution Abstraction

- 引入 `ProviderAdapter`
- 引入 `ExecutionBackend`
- 让现有 runner / pool / hook 归入 runtime 层

### Phase 3 — Lease + Dispatch

- 实现 `TaskLeaseStore`
- 实现 `DispatchService`
- 跑通 `todo -> doing` 的原子认领

### Phase 4 — Planner Integration

- planner 发布任务后进入 `waiting/todo`
- runtime 自动消费 ready task

### Phase 5 — Future Sidecar Readiness

- 将 `RuntimeTransport` 抽象补齐
- 让核心逻辑不依赖进程内直接调用

---

## 十八、与现有 Planner Agent 方案的关系

这份 runtime 架构文档是 `Planner Agent + Agent Dispatching` 的前置基础设施。

关系是：

```text
Planner 画布 / 任务图
  ↓ publish
正式任务系统（backlog / waiting / todo / doing）
  ↓ ready set
DispatchService
  ↓ match runtime
ProviderAdapter / ExecutionBackend
  ↓ spawn provider
Run / Hook / Session / Retry / Release
```

如果没有这层 runtime 抽象，planner 方案会停留在“任务能分好，但无法稳定自动执行”。

---

## 十九、结论

Orbit 第一版应采用 **本机本进程 runtime 架构**：

- 借鉴 Multica 的 discovery / communication / runtime-aware orchestration
- 不照搬其远程 server + daemon 形态
- 用 `LocalRuntimeManager + DispatchService + ProviderAdapter` 作为本地实现
- 用 `RuntimeTransport / TaskLeaseStore / ExecutionBackend` 为未来 sidecar 化留口

这套方案既足够轻，适合 Electron 当前阶段落地；又足够正交，能承接后续的 planner、自动认领、ownership、retry、release，以及更远期的本地 sidecar daemon 形态。
