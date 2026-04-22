# Orbit Agent Context Architecture — 方案 C 详细设计

## 1. 背景

方案 C 代表 Orbit 的另一条路线：不再把“终端 + 文件 + adapter”视为主要集成方式，而是让 Orbit 自己成为 agent 的**运行时控制平面**。在这条路线里，Orbit 不只是提供一个 project terminal，而是成为：

- agent 的启动器
- agent 的上下文提供者
- agent 的能力分发器
- agent 的状态观察器
- agent 的会话协调者

也就是说，用户表面上看仍然是在“运行 Claude/Codex/Gemini”，但实际上 Orbit 会接管它们的启动、会话生命周期、上下文注入、工具注册和状态同步。

这是一条更强、更重、更系统化的路。它的吸引力在于：如果 Orbit 真的想成为 AI 协作工作台，那么 agent 运行时也许最终不该外包给 CLI，而应成为 Orbit 自己的一部分。

---

## 2. 为什么会出现方案 C

方案 C 不是凭空产生的，它通常在以下问题同时出现时浮现：

1. 文件级上下文太弱
2. wrapper 只能解决启动时问题，不能持续同步状态
3. 多 terminal、多 agent、多 worktree 的状态越来越复杂
4. 用户希望 Orbit “真正知道 agent 在做什么”，而不是只知道终端里跑了个进程
5. Night Shift、headless runner、interactive terminal agent 逐渐共享同一套生命周期需求

当这些需求叠加时，人们会自然想到：

> 既然 Orbit 已经知道 project、task、worktree、budget、MCP、日志、任务状态，为什么不直接接管 agent lifecycle？

这就是方案 C 的前因。

---

## 3. 方案 C 的核心定义

### 一句话定义

> Orbit 引入一个 **Agent Daemon / Broker**，所有终端型 agent 都通过它启动、注册、注入上下文、同步状态，并向 Orbit 报告生命周期事件。

### 不再只是“让 Claude 读某些文件”

而是：

- Orbit 生成 agent session
- Orbit 为该 session 分配 project context / task context / terminal pane context
- Orbit 负责连接 MCP、日志、task tracking、budget、worktree
- agent 的输入输出流、状态变化、退出事件都进入 Orbit 自己的 runtime

从产品语义上看，这意味着 Orbit 将从：

> 终端宿主 + 本地工具平台

逐步演进为：

> 本地 agent orchestration runtime

---

## 4. 高层架构

### 4.1 新增核心组件

#### Agent Broker
负责：

- 注册 agent profile（claude/codex/gemini/custom）
- 启动会话
- 管理环境变量
- 分配上下文
- 管理 session id
- 跟踪 pane/session 绑定关系

#### Context Service
负责：

- 收集 Vision / README / AGENT / tasks / git / logs / worktrees
- 输出结构化 session context
- 向 broker 提供启动时上下文与运行中增量更新

#### Session Runtime
负责：

- PTY / stdio 绑定
- 会话日志
- exit/restart handling
- 状态广播
- title / mode / cwd / branch 等 runtime 属性

#### Policy Engine
负责：

- budget gating
- worktree policy
- write safety policy
- project boundary policy

---

## 5. 用户旅程

### 旅程 A：用户在 Project Room 点击“Start Claude”

1. 用户进入某个 Project Room
2. Orbit UI 显示“Start Claude”而不是单纯依赖裸 terminal
3. 用户点击后，Orbit broker 创建 `agentSession`
4. session 绑定：
   - 当前 project
   - 当前 pane
   - 当前 git/worktree 状态
   - 当前 task（若有）
5. broker 调用真实 Claude CLI，但不是直接放给用户一个普通 PTY
6. Claude 的 stdio / 生命周期 / context 都挂在 Orbit runtime 上
7. Orbit 可以实时知道：
   - 这个 Claude session 为哪个项目服务
   - 它是否有活跃 task
   - 当前 budget 消耗
   - MCP 是否连通
   - 最近执行了哪些命令

对用户来说，体验像是在“打开一个懂 Orbit 的 Claude 终端”；  
对系统来说，这已经不是普通终端，而是一个受管 session。

### 旅程 B：用户从 task 卡片进入 agent

1. 用户在 Kanban 中选中一个 task
2. 点击“Open in Claude”
3. Orbit 创建一个 task-bound agent session
4. broker 自动把 task brief、project brief、recent activity 注入 session
5. agent session 在关闭时可以自动：
   - 追加入 execution log
   - 标记 task 状态建议
   - 记录本次上下文摘要

这条旅程是方案 C 的强项：它可以真正做到“任务级 agent”。

### 旅程 C：Night Shift / Headless / Interactive 统一

1. 用户白天用 interactive Claude terminal 做探索
2. 晚上把几个 task 扔进 Night Shift
3. Night Shift 不再是完全不同的一套执行通路，而是同一个 Agent Runtime 的 headless 模式
4. 第二天用户打开 interactive session 时，Orbit 可以显示：
   - 上次 Night Shift 做了什么
   - 哪些上下文可以恢复
   - 是否继续某个 session lineage

这是方案 C 真正迷人的地方：**interactive 与 headless 可以统一**。

---

## 6. 为什么方案 C 很强

### 6.1 完整生命周期控制

方案 A 只能控制“启动时上下文”。  
方案 C 可以控制：

- 启动
- attach/detach
- session 迁移
- context refresh
- task bind/unbind
- worktree bind/unbind
- exit / retry / relaunch

### 6.2 原生支持 task-bound agents

Orbit 的核心单位不只是 project，还有 task。  
如果 Orbit 想让 agent 真正成为 task workflow 的一部分，broker model 更自然。

### 6.3 更好的可观测性

Orbit 能知道：

- 当前开了哪些 agent
- 每个 agent 绑定哪个 project/task
- 哪个 session 消耗了多少预算
- 哪个 session 执行了哪些命令
- 哪个 session 失败了，为什么失败

### 6.4 更强的 future platform potential

如果未来 Orbit 想做：

- session replay
- agent lineage
- shared memory graph
- agent handoff
- multi-agent coordination

那么 broker/daemon 是更合适的底座。

---

## 7. 为什么方案 C 当前不推荐直接落地

虽然强，但它对 Orbit 当前阶段来说偏重，原因有五个。

### 7.1 它改变了 Orbit 的产品边界

当前 Orbit 更像：

- 本地 Markdown + Git workbench
- 带 agent orchestration 能力

方案 C 会把它推进成：

- 本地 agent runtime platform

这会带来定位漂移。团队和用户都需要重新理解 Orbit 是什么。

### 7.2 工程复杂度显著抬升

你需要设计：

- broker state model
- session registry
- attach/detach protocol
- crash recovery
- stream routing
- session persistence
- runtime policy enforcement

这已经不是“增强终端”，而是“新增一个运行时子系统”。

### 7.3 CLI 兼容性会复杂很多

不同 CLI：

- 启动参数不同
- 配置文件发现机制不同
- MCP 集成方式不同
- 输出流语义不同

如果 Orbit 要成为 broker，就需要为这些差异承担长期兼容成本。

### 7.4 更容易引入“魔法”

用户会越来越难回答：

- 我现在到底是在运行真实 `claude`，还是 Orbit 的某个代理？
- 哪些命令是 CLI 原生，哪些是 Orbit 注入？
- 出问题时应该看哪里？

### 7.5 当前收益/成本比不划算

现在用户最痛的点，其实是：

- agent 缺上下文
- terminal integration 不够确定
- session/task 语义弱

这些问题用方案 A 已经能解决 70%–80%。  
此时直接跳 C，属于过度前置架构。

---

## 8. 如果将来要做方案 C，应该怎么设计

### 8.1 Phase C1：先做 Broker-lite

不是一上来就完全代理所有 agent，而是：

- 保留真实 CLI
- Orbit 只负责启动包装、context injection、session metadata registry
- 不接管全部 IO

这是从 A 到 C 的安全过渡。

### 8.2 Phase C2：受管 session 模式

给特定入口提供“受管 session”：

- Start Claude (managed)
- Start Codex (managed)

这类 session 才启用 broker tracking、budget policy、task binding。

### 8.3 Phase C3：统一 headless / interactive runtime

让 Night Shift、single-run agent、interactive terminal session 都跑在同一个 runtime 概念上。

### 8.4 Phase C4：session lineage / replay

一旦 runtime 稳定，才能安全做：

- session resume
- cross-session memory linking
- replay / audit timeline

---

## 9. 用户旅程视角下的前因后果

### 现状旅程

用户现在做的是：

1. 打开项目
2. 进入 terminal
3. 输入 `claude`
4. Claude 启动
5. Claude 自己猜 Orbit 上下文

问题是第五步太不稳定。

### 方案 A 之后

用户旅程变成：

1. 打开项目
2. 进入 terminal
3. 输入 `claude`
4. Orbit wrapper 递送 context pack
5. Claude 读取 Orbit 结构化上下文

Orbit 控制了“启动时语境”。

### 方案 C 之后

用户旅程会变成：

1. 打开项目
2. Orbit 创建/恢复 agent session
3. session 已绑定 project/task/context
4. 用户进入的是 Orbit 管理下的 Claude 会话
5. Claude 的整个生命周期都处于 Orbit runtime 内

Orbit 控制的不再只是“启动时语境”，而是“整个 agent runtime”。

---

## 10. 方案 C 最适合什么阶段

我认为只有在 Orbit 出现以下信号时，方案 C 才值得正式进入 roadmap：

1. interactive terminal agent 已成为主工作流
2. Night Shift / headless runner / worktree runner 与 interactive agent 需要统一
3. 用户显著依赖 task-bound agent 会话
4. 需要 session replay / resume / lineage
5. 多 agent 协作成为核心卖点，而不是附属能力

在这之前，方案 C 更适合作为**长期架构方向文档**，而不是当前实施路线。

---

## 11. 与方案 A 的关系

最重要的一点：

> 方案 A 不是方案 C 的替代品，而是方案 C 的前置基础。

原因是：

- 没有 canonical context pack，就没有 broker 能分发的标准上下文
- 没有 adapter layer，就无法统一 CLI 接入
- 没有 context schema，就无法做 task-bound session

也就是说，**A 是地基，C 是上层结构**。

如果直接跳到 C，最后还是会回头补 A。

---

## 12. 结论

方案 C 很有吸引力，因为它代表 Orbit 的终极形态之一：

> Orbit 不只是“一个知道 agent 的工作台”，而是“agent 真正运行其中的本地协作操作系统”。

但对 Orbit 当前阶段来说，它太重、太早、边界变化太大。

因此更合理的策略是：

1. 先落地方案 A，建立 Canonical Context Pack + Adapter + Wrapper
2. 在实践中观察：
   - 用户是否真的需要受管 session
   - interactive 与 headless 是否开始融合
   - task-bound session 是否成为刚需
3. 当这些信号足够明确时，再从 A 平滑演进到 C

这意味着方案 C 应该被认真设计、完整记录，但**暂时不应作为第一实施方案**。
