# Orbit `.orbit`-First Agent Exposure Implementation Plan

> 目标：把 Orbit 自有的 agent 能力、上下文、任务与桥接逻辑全部收敛到 `.orbit/`，并把“是否让 agent 感知 Orbit、感知到什么程度”做成用户可选的项目级策略，而不是硬编码到项目根目录规范文件中。

## Goal

把 Orbit 从“依赖项目根目录 `AGENT.md` / `.agent` / `.mcp.json` 才能工作”的模式，重构成：

1. **`.orbit/` 是唯一主权空间**
2. **Orbit 启动的 agent 总能稳定感知 Orbit**
3. **是否向项目根目录暴露 Orbit，由用户选择**
4. **默认不覆盖、不接管社区规范文件**

这份文档是执行导向的实施方案，不只是概念蓝图。

---

## Problem

当前 Orbit 的 agent 相关能力分散在多个位置：

- vault 根 `AGENT.md` 会被 `src/main/agent/persona.ts` 注入 prompt
- project 创建时会生成 `AGENT.md`
- project 创建时会生成 `.agent/config.json`、`.agent/tasks/`、`.agent/memories/`
- `src/main/mcp_config.ts` 会在项目根写 `.mcp.json`
- `src/main/project_agent_context.ts` 会生成 project-local agent skills / logs

这套设计在 Orbit 自建模板项目里能工作，但在导入已有 GitHub 仓库时会出现结构性问题：

1. **与社区规范冲突**  
   `.agent`、`AGENTS.md`、`CLAUDE.md`、`.mcp.json` 都可能已经被仓库使用。

2. **Orbit 的能力边界不清晰**  
   一部分是 Orbit 内部状态，一部分是桥接文件，一部分又是用户可见规范，主权不清楚。

3. **手动启动 agent 与 Orbit 内启动 agent 的体验不一致**  
   Orbit 内嵌终端可以注入环境与上下文；用户手动在项目目录跑 `claude` 时，则依赖根目录文件是否存在。

4. **导入已有仓库时默认写入根目录风险高**  
   如果 Orbit 直接生成或覆盖 `.agent` / `AGENT.md` / `.mcp.json`，会污染用户仓库，也可能破坏已有工作流。

---

## Product decision

### 决策一：`.orbit/` 成为 Orbit 能力的唯一事实源

Orbit 自己生成、维护、消费的 agent 能力都应放在 `.orbit/` 中，而不是把项目根目录文件当成主存储。

### 决策二：项目根目录文件只作为“桥接层”

根目录的：

- `.mcp.json`
- `AGENT.md`
- `AGENTS.md`
- `.agent/`

都不再被视为 Orbit 的主权空间。它们最多是：

- 用户已有资产
- 社区规范文件
- Orbit 在用户允许下生成的薄桥接文件

### 决策三：用户选择暴露策略

Orbit 不再假设所有项目都应该把 Orbit 能力暴露到项目根目录。  
每个项目应有一个可配置的 **Agent Exposure Strategy**。

### 决策四：永不默认覆盖社区文件

当目标路径已有文件时，Orbit 默认：

- 不覆盖
- 不静默合并
- 不接管所有权

而是退回到更安全的方案：运行时注入、跳过桥接、或显式冲突提示。

---

## Non-goals

本方案**不**追求：

1. 在第一阶段统一所有社区 agent 规范
2. 在第一阶段支持所有第三方 agent 的深度适配
3. 通过复杂自动 merge 去“智能整合”用户已有 `AGENTS.md` 或 `.agent`
4. 把 Orbit 变成一个必须接管根目录规范文件的 agent 平台

---

## Design principles

1. **Orbit-owned data stays in `.orbit/`**
2. **Root files are adapters, not the source of truth**
3. **Orbit-launched agents must work without root bridges**
4. **Manual-launched agents may need bridges**
5. **No silent overwrite**
6. **Compatibility is opt-in**
7. **Imported repositories keep repo sovereignty**

---

## Scope model

这个方案引入两个作用域：

### 1. Vault-scoped `.orbit/`

继续保留当前 vault 根的 `.orbit/` 作为工作台级控制平面：

- vault config
- worktree index
- global logs
- global search / refmap / cost

### 2. Project-scoped `.orbit/`

在具体项目根目录下引入 **project-local `.orbit/`**，作为 Orbit 面向该项目的 agent 集成平面。

这一层负责：

- 项目级 agent config
- 项目级 task / memory / logs
- 项目上下文包
- 桥接文件模板与渲染结果
- project-local MCP metadata

这两层都叫 `.orbit/`，但职责不同：

- **vault `.orbit/`** = Orbit 工作台控制平面
- **project `.orbit/`** = 项目级 agent 集成平面

---

## Target file layout

建议的项目级 `.orbit/` 结构如下：

```text
<project>/
  .orbit/
    project.json
    agent/
      config.json
      context/
        index.json
        orbit-world.md
        project-brief.md
        runtime-state.md
        tooling-commands.md
        operating-rules.md
        open-tasks.md
        recent-activity.md
      tasks/
      memories/
      logs/
        TIMELINE.md
        SESSION_HISTORY.md
        operations.jsonl
      skills/
        _index.md
        orbit-world.md
        task-workflow.md
        project-understanding.md
        tooling-commands.md
        worktree-workflow.md
        safety-rules.md
        mcp-tools.md
    bridge/
      AGENT.md
      AGENTS.md
      mcp.json
      manifest.json
```

### Canonical ownership rules

| 路径 | 所有者 | 说明 |
| --- | --- | --- |
| `<project>/.orbit/**` | Orbit | 唯一事实源 |
| `<project>/.mcp.json` | 用户仓库 / 可选桥接 | 仅在开启桥接时生成 |
| `<project>/AGENT.md` | 用户仓库 / 可选桥接 | 仅在开启桥接时生成 |
| `<project>/AGENTS.md` | 用户仓库 / 可选桥接 | 仅在开启桥接时生成 |
| `<project>/.agent/**` | 社区 / 用户仓库 | Orbit 不再默认作为主存储写入 |

---

## Agent exposure strategy

每个项目新增一组配置：**Agent Exposure Strategy**。

推荐先落三种模式，而不是过早增加更多分支复杂度。

### Mode A: `isolated`（推荐默认）

Orbit 只使用 `.orbit/` 和运行时注入，不向项目根目录写任何桥接文件。

**行为：**

- Orbit 内启动 agent：可以完整感知 Orbit
- 用户手动在项目根启动 agent：默认感知不到 Orbit
- 不碰 `AGENT.md` / `AGENTS.md` / `.mcp.json` / `.agent`

**适用：**

- 导入已有 GitHub 仓库
- 不希望污染仓库
- 已有成熟社区规范的项目

### Mode B: `bridge`

Orbit 仍以 `.orbit/` 为事实源，但允许生成**薄桥接文件**到项目根目录。

**行为：**

- Orbit 内启动 agent：完整感知 Orbit
- 手动启动 agent：可通过桥接文件感知 Orbit
- 只生成用户选中的桥接文件
- 目标路径有冲突时默认跳过并提示

**可选桥接项：**

- `.mcp.json`
- `AGENT.md`
- `AGENTS.md`

### Mode C: `compatible`

在 `bridge` 基础上，Orbit 在运行时主动**读取并吸收社区规范文件**，但仍不接管它们。

**行为：**

- 运行时上下文组装会读取已有 `AGENTS.md`、`AGENT.md`、`.agent/`
- Orbit 自有上下文仍然来自 `.orbit/`
- 桥接文件依旧是可选的
- 社区文件保留原有所有权

**适用：**

- 已有社区 agent 规范，希望 Orbit 与之共存
- 希望 Orbit agent 同时遵守仓库既有约定

---

## Fine-grained toggles

除 `mode` 外，再提供细粒度开关，避免模式过度膨胀。

```ts
interface AgentExposureSettings {
  mode: 'isolated' | 'bridge' | 'compatible';
  exposeMcpBridge: boolean;
  exposeAgentMdBridge: boolean;
  exposeAgentsMdBridge: boolean;
  consumeCommunityAgentMd: boolean;
  consumeCommunityAgentsMd: boolean;
  consumeCommunityDotAgent: boolean;
}
```

默认建议：

```ts
{
  mode: 'isolated',
  exposeMcpBridge: false,
  exposeAgentMdBridge: false,
  exposeAgentsMdBridge: false,
  consumeCommunityAgentMd: true,
  consumeCommunityAgentsMd: true,
  consumeCommunityDotAgent: false
}
```

理由：

- 默认不暴露
- 默认可以读社区规范文本
- 默认不把 `.agent/` 整个目录当作稳定输入源，因为语义不统一、冲突风险高

---

## Runtime architecture

## 1. Context source layers

运行时上下文分为三层：

### Layer 1: Orbit canonical context

来自 `<project>/.orbit/agent/context/*`，由 Orbit 生成与维护：

- Orbit 世界模型
- 项目简报
- 运行时状态
- 任务摘要
- 工具命令
- 安全规则

这是 Orbit 自己最可信的上下文源。

### Layer 2: Optional compatibility inputs

按设置可选读取：

- `<project>/AGENT.md`
- `<project>/AGENTS.md`
- `<project>/.agent/**`

这层是**兼容输入**，不是事实源。

### Layer 3: Launch-time injection

Orbit 在启动 agent 时进行最终组装：

- persona/system prompt prepend
- project session brief
- MCP registration
- runtime env vars

最终结论是：

> Orbit agent 的可靠感知来自**运行时注入**，不是来自“希望 agent 自己读某个文件”。

---

## 2. Orbit-launched agents

当 agent 由 Orbit 启动时，Orbit 必须保证**不依赖根目录桥接文件**也能正常工作。

### Required runtime behavior

1. 组装 `.orbit` canonical context
2. 根据配置吸收社区规范文本
3. 把 Orbit 世界模型 + 项目状态显式 prepend 到 prompt
4. 通过 Orbit 控制的 MCP 注册路径加载 project-local MCP
5. 注入 project-local Orbit env

建议新增 env：

```text
ORBIT_PROJECT_ROOT=<project>
ORBIT_PROJECT_ORBIT_ROOT=<project>/.orbit
ORBIT_AGENT_CONTEXT_ROOT=<project>/.orbit/agent/context
ORBIT_AGENT_EXPOSURE_MODE=isolated|bridge|compatible
```

### Implication

只要 agent 是 Orbit 启动的，根目录没有 `AGENT.md` / `AGENTS.md` / `.mcp.json` 也不影响其感知 Orbit。

---

## 3. Manually-launched agents

当用户在项目根目录手动运行 `claude` / `codex` / `gemini` 时，Orbit 无法天然控制启动链路。

这类场景下，agent 是否能感知 Orbit，取决于是否存在桥接。

### Without bridge

- 默认无法感知 Orbit
- 只能看到仓库自身文件

### With bridge

- 可通过根目录桥接文件进入 `.orbit`
- 仍然由 `.orbit` 提供主内容

---

## Bridge artifact design

桥接文件必须是**薄适配层**，不能成为新的主权配置中心。

### 1. `.mcp.json`

桥接用途最明确，优先级最高。

#### Canonical source

`<project>/.orbit/bridge/mcp.json`

#### Root bridge

`<project>/.mcp.json`

#### Rule

- 如果项目根不存在 `.mcp.json`，可在 `bridge` / `compatible` 模式下生成
- 如果已存在，Orbit 不覆盖
- 如果用户希望 Orbit MCP 与现有 `.mcp.json` 共存，后续再做 merge-aware writer；第一阶段只做“保守跳过 + 提示”

### 2. `AGENT.md`

定位为**通用 agent 薄桥接文档**，其内容不应承载 Orbit 全部知识，只应说明：

- Orbit canonical context 位于 `.orbit/agent/context/`
- 若 agent 由 Orbit 启动，运行时会自动注入 Orbit context
- 当前仓库若已有社区规范，应优先遵循已有规范并结合 `.orbit`

#### Canonical source

`<project>/.orbit/bridge/AGENT.md`

#### Root bridge

`<project>/AGENT.md`

### 3. `AGENTS.md`

定位为**社区兼容桥接文档**。  
只有用户明确开启时才生成。

内容原则：

- 说明 Orbit 能力位于 `.orbit/`
- 说明项目还有哪些社区规范输入
- 不复制整个 Orbit 上下文包

#### Canonical source

`<project>/.orbit/bridge/AGENTS.md`

#### Root bridge

`<project>/AGENTS.md`

### 4. `.agent/`

第一阶段不再默认生成根目录 `.agent/`。  
如果项目已有 `.agent/`，仅在 `compatible` 模式下将其视为可读输入。

后续若需要社区兼容写入，也应优先考虑：

- 在 `.orbit/bridge/` 中生成兼容视图
- 再由用户选择是否发布到根目录

而不是让 `.agent/` 回到 Orbit 主权空间。

---

## Conflict policy

### Hard rule

Orbit **永不默认覆盖** 以下路径：

- `<project>/.mcp.json`
- `<project>/AGENT.md`
- `<project>/AGENTS.md`
- `<project>/.agent/**`

### When conflict exists

若用户开启桥接但目标根目录文件已存在：

1. 记录冲突检测结果
2. 跳过该桥接项
3. 在 UI 显示“该文件已存在，Orbit 未覆盖”
4. 继续保留运行时注入能力

### Future extension

后续可以增加“冲突预览 / patch 预览 / 手动合并”能力，但不属于第一阶段。

---

## Import and new-project behavior

## 1. Import existing GitHub repository

默认使用：

- `mode = isolated`

导入时应检测：

- `AGENT.md`
- `AGENTS.md`
- `.mcp.json`
- `.agent/`

并生成一个结构化检测结果：

```ts
interface AgentConventionDetection {
  hasAgentMd: boolean;
  hasAgentsMd: boolean;
  hasMcpConfig: boolean;
  hasDotAgentDir: boolean;
}
```

UI 应提示：

- 已发现哪些社区规范文件
- Orbit 默认不会覆盖
- 用户可在项目设置中开启 bridge / compatible

## 2. Create new Orbit project

对新建项目，可以允许默认更积极，但仍应遵循 `.orbit` 主权规则：

- canonical agent assets 写进 project-local `.orbit/`
- 是否额外生成根目录桥接文件，取决于创建向导选项

推荐新建项目默认：

- `mode = bridge`
- 自动生成 `.mcp.json`
- 自动生成 `AGENT.md`
- 不自动生成 `AGENTS.md`

这样新建 Orbit 模板项目开箱即用，但架构仍然清晰。

---

## Data model

建议新增 project-level 持久化配置：

```ts
interface ProjectOrbitConfig {
  uid: string;
  slug: string;
  name: string;
  template: string;
  agentExposure: AgentExposureSettings;
  bridgeStatus: {
    mcp: 'not-requested' | 'generated' | 'skipped-conflict';
    agentMd: 'not-requested' | 'generated' | 'skipped-conflict';
    agentsMd: 'not-requested' | 'generated' | 'skipped-conflict';
  };
}
```

建议位置：

- `<project>/.orbit/project.json`

---

## Required code changes

## 1. Canonical path migration

当前代码中以下能力需要从 `.agent` / root files 迁移到 `.orbit` canonical paths：

- `src/main/project.ts`
- `src/main/project_agent_context.ts`
- `src/main/mcp_config.ts`
- `src/main/agent/persona.ts`
- `src/shared/constants.ts`

### Required refactor

把常量按“root bridge path”与“canonical orbit path”分开：

- `PROJECT_AGENT_DIR` 不再表示 Orbit canonical dir
- 新增类似：
  - `PROJECT_ORBIT_DIR = '.orbit'`
  - `PROJECT_ORBIT_AGENT_DIR = '.orbit/agent'`
  - `PROJECT_ORBIT_CONTEXT_DIR = '.orbit/agent/context'`
  - `PROJECT_ORBIT_BRIDGE_DIR = '.orbit/bridge'`

## 2. Context assembler

新增一个集中式运行时上下文组装器，例如：

- `src/main/agent/context_assembler.ts`

职责：

1. 读取 `.orbit/agent/context/*`
2. 按配置读取社区 `AGENT.md` / `AGENTS.md` / `.agent`
3. 组装最终 prompt context
4. 为不同 agent vendor 提供统一入口

## 3. Bridge manager

新增：

- `src/main/agent/bridge.ts`

职责：

1. 根据 exposure settings 生成 canonical bridge files 到 `.orbit/bridge/`
2. 决定是否发布到项目根目录
3. 检测冲突并更新 `bridgeStatus`

## 4. MCP config split

当前 `ensureMcpConfig()` 直接写项目根 `.mcp.json`。应拆成两层：

1. 生成 canonical Orbit MCP bridge  
   `project/.orbit/bridge/mcp.json`
2. 依据 exposure settings 决定是否发布到  
   `project/.mcp.json`

## 5. Persona loading split

当前 `loadPersona()` 读取 vault 根 `AGENT.md`。  
后续应拆成：

- vault-level orbit persona
- project-level orbit context
- optional community prompt inputs

并通过 context assembler 做统一组装，而不是单点读一个 `AGENT.md`。

## 6. Project creation flow

当前 `createProject()` 仍会：

- 生成根目录 `AGENT.md`
- 生成 `.agent/config.json`
- 生成 `.mcp.json`

后续应改成：

1. 生成 `.orbit/` canonical assets
2. 根据创建模式/设置生成桥接

---

## UX changes

## 1. Project settings

为每个项目新增 **Agent Exposure** 设置面板：

- 模式选择：Isolated / Bridge / Compatible
- Bridge toggles：
  - Expose `.mcp.json`
  - Expose `AGENT.md`
  - Expose `AGENTS.md`
- Compatibility toggles：
  - Read existing `AGENT.md`
  - Read existing `AGENTS.md`
  - Read existing `.agent/`

## 2. Import modal

导入仓库时显示：

- 检测到的社区文件
- Orbit 默认不会覆盖
- 推荐模式：Isolated

## 3. New project modal

新建项目时显示：

- 是否生成根目录桥接文件
- 推荐模式：Bridge

## 4. Status surfaces

项目内显示一个小型状态卡：

- 当前 exposure mode
- 已生成哪些 bridge
- 哪些 bridge 因冲突被跳过

---

## Migration plan

建议分三阶段实施，降低风险。

## Phase 1: establish `.orbit` canonical storage

### Goal

引入 project-local `.orbit/`，但暂不完全移除旧路径写入。

### Work

1. 新增 `.orbit` canonical path 常量
2. 让 `project_agent_context.ts` 输出到 `.orbit/agent/*`
3. 新增 `project.json` 与 `agentExposure` schema
4. 为旧 `.agent` 路径保留临时兼容读写

### Exit criteria

- `.orbit/agent/context/*` 可稳定生成
- 旧功能不回退

## Phase 2: runtime injection fully depends on `.orbit`

### Goal

Orbit-launched agents 不再依赖根目录 `AGENT.md` / `.mcp.json`。

### Work

1. 引入 `context_assembler.ts`
2. 调整 persona / runtime prompt assembly
3. MCP 读取转向 `.orbit` canonical source
4. Orbit 内 agent 启动链路改为依赖 `.orbit`

### Exit criteria

- 在 `isolated` 模式下，Orbit 内 agent 仍完整可用
- 根目录完全没有桥接文件时也能工作

## Phase 3: bridge manager and user controls

### Goal

增加用户可控的桥接策略和兼容策略。

### Work

1. 实现 `bridge.ts`
2. 新增项目设置 UI
3. 导入与新建项目流程接入 exposure mode
4. 冲突检测与状态展示

### Exit criteria

- 用户可切换模式
- 冲突场景下不发生覆盖
- 手动启动 agent 可通过 bridge 感知 Orbit

---

## Testing strategy

需要增加的测试面应覆盖：

### 1. Canonical generation

- `.orbit/agent/context/*` 是否生成
- `.orbit/project.json` 是否持久化 exposure settings

### 2. Runtime assembly

- `isolated` 模式下是否只使用 `.orbit`
- `compatible` 模式下是否吸收社区 `AGENT.md` / `AGENTS.md`
- 社区输入为空时是否稳定退化

### 3. Bridge generation

- 无冲突时是否写入根目录桥接文件
- 有冲突时是否跳过而不覆盖
- `bridgeStatus` 是否正确更新

### 4. Import behavior

- 导入已有仓库时是否默认进入 `isolated`
- 是否正确检测社区规范文件

### 5. New project behavior

- 新建项目是否先生成 `.orbit`
- 是否仅按所选策略生成根目录桥接

---

## Success criteria

方案完成后，应满足以下标准：

1. Orbit 自有 agent 能力都可以从 `.orbit/` 恢复
2. Orbit 内启动 agent 时，不依赖根目录规范文件也能感知 Orbit
3. 导入已有 GitHub 仓库时，默认不会污染项目根目录
4. 用户可以自主决定是否生成桥接文件
5. 已有 `AGENTS.md` / `.agent` 的项目不会被 Orbit 静默覆盖
6. Orbit 与社区规范之间形成“兼容层”而不是“争夺主权”

---

## Final recommendation

最终产品定义应明确为：

> **`.orbit/` 是 Orbit 的能力本体；项目根目录文件只是可选适配层。**

Orbit 不应该再把 `AGENT.md`、`.agent`、`.mcp.json` 这些根目录文件当作自己的主权空间。  
它们可以存在、可以兼容、可以桥接，但它们不再是 Orbit 事实源。

这会带来三个直接收益：

1. 导入已有仓库时不再天然冲突
2. Orbit 内部 agent 感知链路更稳定
3. 用户终于可以按项目选择“隔离、桥接、兼容”三种策略，而不是被强制绑定到一种目录规范

这就是这次重构真正要建立的边界。
