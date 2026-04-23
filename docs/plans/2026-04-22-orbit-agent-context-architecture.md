---
status: draft
created: 2026-04-22
updated: 2026-04-22
---

下面是我给 Orbit 的**整体中文设计方案（第一版）**。目标不是只修“在终端里跑 `claude` 时不懂 Orbit”这个点，而是建立一套**长期可扩展的 Agent Context Architecture**：让所有终端型 agent 都能稳定、持续、低摩擦地理解 Orbit 的愿景、项目状态、工具能力和工作约束。

---

## 一、现状分析：Orbit 已经有“上下文碎片”，但没有“可消费的上下文系统”

### 1. Orbit 的设计愿景已经很清晰
从 README / USER_GUIDE / architecture 看，Orbit 的核心不是“带终端的 Markdown 编辑器”，而是：

- **个人愿景驱动的 AI 协作工作台**
- **项目即文件夹（Project-as-Folder）**
- **所有知识与工作流都落在本地 Markdown + Git + PARA vault**
- **Agent 不只是聊天，而是通过 tasks / worktrees / MCP hooks 参与真实执行**
- **每个 project 都是一个独立上下文单元**，有 README、AGENT、.agent/tasks、.agent/memories、独立 git repo

### 2. 当前终端 agent 的问题不是“没有信息”，而是“信息不可直接消费”
现在 Orbit 已经做了两件对的事：

1. **project 根跑 `claude` 时有 `.mcp.json`**，能接 Orbit MCP tools  
2. **TerminalPane 会注入 ORBIT_* 环境变量**

但这还不够。原因是：

- `.mcp.json` 解决的是“能调用什么工具”，不是“我身处什么世界”
- 环境变量只告诉 agent 三个标识：vault 路径、project uid、slug，**不告诉它 Orbit 是什么、当前项目在干什么、有哪些约束、最近状态如何**
- 当前 `BASE_AGENT_MD` 太薄，只是 persona 级别的短提示，不是可执行上下文包
- `README.md` 更偏人类读物，不是面向终端 agent 的“启动上下文”

所以现在的 `claude` 实际上是：

> 拿到了工具接口，但没拿到足够完整的工作语境。

---

## 二、方案对比：三种思路

### 方案 A（推荐）：**Canonical Context Pack + CLI Adapter Layer**
核心思路：

- 建立一套 Orbit 自己的**标准上下文包**
- 以**文件 + 结构化快照 + CLI 适配层**三层交付
- 对 Claude 用“确定可读取”的入口，对其他 agent 保留兼容层

优点：

- 不依赖单一 CLI 约定
- 可扩展到 Claude / Codex / Gemini / 自定义 agent
- 可同时服务人类、MCP、终端 agent、未来 headless runner
- 适合 Orbit 长期演化

缺点：

- 比单纯增强 AGENT.md 更复杂
- 需要设计上下文生成、更新、适配三层机制

### 方案 B：只增强 `AGENT.md` / `README.md` / `CLAUDE.md`
优点：

- 最快
- 对用户可见，易理解

缺点：

- 不足以表达运行时状态
- 不足以保证终端 agent 一定读到
- 不适合多 agent 生态
- 很快会退化成“大而乱的提示词文件”

### 方案 C：做一个 Orbit Agent Daemon / Broker
即 Orbit 不再只提供 terminal，而是代理所有 CLI agent 的启动、注入、观察和上下文同步。

优点：

- 最强控制力
- 真正能统一 agent lifecycle

缺点：

- 过重
- 会把 Orbit 从“工作台”推向“运行时平台”
- 当前阶段成本过高

### 推荐结论
我建议走 **方案 A**：

> **用 Orbit 自己的标准上下文包做“事实源”，再为 Claude 提供强制可消费的适配层。**

这样既能解决你眼前的问题，也不会把架构做歪。

---

## 三、推荐方案：Orbit Agent Context Architecture

### 1. 设计目标
这套系统要同时满足四个目标：

1. **让终端 agent 理解 Orbit 本身**
   - Orbit 是什么
   - PARA / Project / Task / Worktree / Night Shift / Distill 是什么
   - 它应该如何在 Orbit 中工作

2. **让终端 agent 理解当前项目**
   - 当前 project 的目标、状态、结构、脚本、约束、最近任务
   - 当前最该做什么，不该做什么

3. **让终端 agent 理解运行时状态**
   - 当前 branch / worktree / active tasks / MCP tools / 项目阶段
   - 当前 terminal 所在 pane/tab 的上下文

4. **让这套机制可迁移到其他 agent**
   - Claude 只是第一适配对象
   - 后面 Codex / Gemini / headless runner 都能复用

---

## 四、上下文分层：把“世界模型”拆成 4 层

### Layer 0：Human-authored canonical source（人类维护）
这是 Orbit 里最稳定、最值得信任的语义源：

- `<vault>/Vision.md`
- `<vault>/AGENT.md`
- `<project>/README.md`
- `<project>/AGENT.md`
- `<project>/.agent/config.json`

这层是“原材料”，**不应该被终端 agent 直接当唯一启动材料**，因为它们不够结构化、也不够实时。

### Layer 1：Generated Context Pack（Orbit 生成）
为每个项目生成标准化上下文包，例如：

```text
<project>/.agent/context/
  00-orbit.md
  10-vault-vision.md
  20-project-brief.md
  30-project-state.md
  40-tooling-and-commands.md
  50-operating-rules.md
  60-open-tasks.md
  70-recent-activity.md
  context.index.json
```

这层是**Agent 真正该读的主上下文**。

### Layer 2：CLI-specific adapters（CLI 适配层）
针对 Claude / 其他 agent 生成兼容入口，例如：

- `<project>/CLAUDE.md`
- `<project>/AGENT.md`（保留给通用 agent）
- `<project>/.agent/context/SESSION_BRIEF.md`

### Layer 3：Terminal bootstrap / wrapper（强制交付层）
这是“保证终端 agent 一定读到”的关键层：

- Orbit embedded terminal 启动时，**把一个 shim 目录放到 PATH 最前面**
- 这个 shim 里有 `claude` 包装脚本
- 用户在 Orbit 终端里输入的 `claude`，实际走 Orbit wrapper
- wrapper 再去调用真实 Claude CLI，并把 Orbit 上下文包显式带进去

> 这层才是“确定性入口”。  
> 只写文件，不足以保证一定被读取；  
> 只有 wrapper + controlled PATH，才是 Orbit 自己可控的交付链路。

---

## 五、Context Pack 具体内容设计

### 1. `00-orbit.md` —— Orbit 世界说明
不是项目说明，而是 Orbit 运行世界的解释，包含：

- Orbit 是个人愿景驱动的 AI 协作工作台
- Vault = PARA + Markdown + Git + `.orbit/`
- Project = folder with README / AGENT / .agent/tasks / .agent/memories / git repo
- Task = 四段式 Markdown task
- Orbit agent 行为边界
- MCP 工具能力简介
- Worktree / Night Shift / Distill / Daily Review 的概念

这让 agent 不会把当前目录误解成普通 repo。

### 2. `20-project-brief.md` —— 项目简报
从 README、AGENT、config 提取和融合：

- 项目标题、slug、uid、模板
- 一句话目标
- 当前阶段 / 状态
- 主要约束
- 成功定义
- 相关 Area / tags
- 推荐工作方式

### 3. `30-project-state.md` —— 运行时快照
这是现在 Orbit 最缺的部分。建议包含：

- 当前 git 分支 / 是否 dirty
- open tasks 概览
- doing / blocked / today task summary
- 最近 agent runs / worktrees
- 是否已启用 Orbit MCP
- 当前 project 是否 legacy / active / archived
- 最近日志更新时间
- 上下文 freshness timestamp

### 4. `40-tooling-and-commands.md`
把当前 project 可执行命令整理给 agent：

- package scripts / build / test / lint
- 启动方式
- 常见开发命令
- 哪些命令推荐优先执行
- 哪些命令危险 / 昂贵

### 5. `50-operating-rules.md`
把 Orbit 特有约束收敛成稳定规则：

- 优先小步、可逆
- 修改任务相关内容时要更新 task markdown
- 修改项目状态要走 Orbit task/worktree 约定
- 不要绕开 project git/worktree safety gates
- 不要把临时状态写到源码目录
- 对 vault 外文件要显式确认

### 6. `60-open-tasks.md`
不是全量 task dump，而是摘要：

- today / doing / blocked 优先
- 每个任务只保留：标题 / uid / status / 简要意图 / 文件路径
- 给 agent 一个“当前最值得继续的工作清单”

---

## 六、对 Claude 的“确定性交付”设计

### 目标
不是“希望 Claude 会读某个文件”，而是：

> **只要用户在 Orbit 终端里输入 `claude`，Orbit 就能确定 Claude 拿到了 Orbit Context Pack。**

### 设计
在 embedded terminal 环境里新增：

- `PATH=<vault>/.orbit/bin:$PATH`
- `ORBIT_CONTEXT_ROOT=<project>/.agent/context`
- `ORBIT_CONTEXT_INDEX=<project>/.agent/context/context.index.json`
- `ORBIT_AGENT_PROFILE=claude`

然后生成：

```text
<vault>/.orbit/bin/claude
```

这个 wrapper 负责：

1. 找到真实 `claude` binary
2. 读取 `ORBIT_CONTEXT_ROOT`
3. 组装要交给 Claude 的启动材料
4. 调用真实 `claude`

### 为什么这是“整体设计”而不是临时补丁
因为这层未来可以平移成：

- `.orbit/bin/codex`
- `.orbit/bin/gemini`
- `.orbit/bin/orbit-agent`

也就是说，Orbit 不是为单个 CLI 写魔法，而是在建立**Agent Adapter Layer**。

### 兼容文件层
同时仍生成：

- `<project>/CLAUDE.md`
- `<project>/AGENT.md`

用途是：

- 用户在项目根直接用外部终端运行 `claude` 时，仍有较高概率拿到上下文
- 人类也能看到 agent 的默认工作说明
- 未来其他 CLI 也能复用

但“保证读到”不靠它们，靠 wrapper。

---

## 七、文件放在哪里才合理

### 我建议的最终落点

#### 可编辑、长期语义源
- `<vault>/Vision.md`
- `<vault>/AGENT.md`
- `<project>/README.md`
- `<project>/AGENT.md`
- `<project>/.agent/config.json`

#### Orbit 自动生成、供 agent 消费
- `<project>/.agent/context/*.md`
- `<project>/.agent/context/context.index.json`

#### Claude 适配入口
- `<project>/CLAUDE.md`

#### 终端强制注入入口
- `<vault>/.orbit/bin/claude`

### 为什么不把所有内容都写进 `AGENT.md`
因为 `AGENT.md` 应该保留为**人写、人读、长期稳定**的“人格与工作原则”文件。  
而像任务快照、git 状态、最近 runs、tool availability 这些东西是**高频变化的运行时信息**，必须分离到 generated context 中。

否则 AGENT.md 会变成一个混乱的大文件，既不好维护，也不适合 agent 稳定消费。

---

## 八、上下文生成策略：何时更新，谁负责生成

### 生成触发时机
建议四类触发：

1. **项目创建时**
   - 初始化 context pack
   - 初始化 CLAUDE.md adapter
   - 初始化 wrapper 依赖信息

2. **项目打开时**
   - 刷新 runtime snapshot
   - 重新计算 commands / tasks / git state

3. **关键文件变化时**
   - README.md / AGENT.md / Vision.md / .agent/config.json / tasks 改动
   - watcher 触发上下文重建

4. **终端启动前**
   - lazy refresh 一次 SESSION_BRIEF
   - 确保 agent 启动拿到的是最新状态

### 生成职责拆分
建议拆成三类模块：

- `context_sources/`：读 Vision / README / AGENT / tasks / git / worktrees
- `context_builder/`：组装成统一 schema
- `context_emitters/`：输出 markdown / json / CLAUDE.md / wrapper env

这样 Orbit 的上下文能力以后能被：
- embedded terminal
- headless agent runner
- worktree agent
- future review bots

统一复用。

---

## 九、建议提供给 agent 的“丰富能力包”

要让 `claude` 真正懂 Orbit，建议上下文里至少要覆盖这 8 类能力信息：

1. **世界观能力**  
   Orbit 是什么、PARA 是什么、project/task/worktree/night shift 是什么

2. **项目理解能力**  
   当前项目目标、范围、状态、模板、约束、成功定义

3. **执行能力**  
   如何 build / test / lint / run / package

4. **结构理解能力**  
   当前 repo 的主目录、关键文件、任务目录、记忆目录

5. **工作流能力**  
   怎么创建 task、更新 task、写执行日志、什么时候该用 worktree

6. **工具能力**  
   MCP 提供哪些工具，什么时候该用 `search_vault` / `create_task` / `query_project_graph`

7. **状态感知能力**  
   当前 branch、dirty 状态、active tasks、blocked items、recent runs

8. **安全边界能力**  
   不能瞎改 vault 外文件、不能跳过 git/worktree safety、不能伪造信息

---

## 十、分阶段落地建议

### Phase 1：建立标准 Context Pack
先不碰 wrapper，只把上下文模型立住：

- `.agent/context/*.md`
- `context.index.json`
- richer `AGENT.md`
- generated `CLAUDE.md`

目标：让文件层上下文完整起来。

### Phase 2：加 Claude Adapter / Wrapper
在 embedded terminal 中：

- PATH prepend `.orbit/bin`
- `claude` shim
- 运行前自动刷新 SESSION_BRIEF

目标：让 Orbit 终端里的 `claude` 一定拿到上下文。

### Phase 3：做任务/终端会话级上下文
进一步增强：

- 某个 terminal tab 绑定某个 task
- `SESSION_BRIEF.md` 加入当前 pane intent
- 关闭/重开 terminal 时保留 task context

目标：从“项目级理解”提升到“当前工作单元级理解”。

### Phase 4：多 agent 生态
扩展到：

- codex / gemini adapters
- headless runner consume same context pack
- night shift / worktree agent consume same profile

---

## 十一、我对这个方案的判断

我推荐的不是“再写一个更长的 AGENT.md”，而是：

> **把 Orbit 从“有上下文文件”升级为“有 Context Delivery System”。**

这样 Orbit 的终端 agent 才会真正像 Orbit 的一部分，而不是“在项目根目录里偶然拥有几个文件和一个 MCP 配置”。

如果后面按这个方案做，最终效果会是：

- 用户进入项目终端，输入 `claude`
- Claude 不只是知道“当前目录是一个 repo”
- 而是知道：
  - 我正在 Orbit 中
  - 这是哪个 project
  - 这个 project 的目标是什么
  - 当前有哪些 task / git 状态 / MCP 能力
  - 我应该如何在 Orbit 里安全地工作

这才是我认为正确的整体方向。
