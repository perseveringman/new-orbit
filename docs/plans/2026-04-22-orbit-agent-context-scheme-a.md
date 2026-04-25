---
status: superseded
created: 2026-04-22
updated: 2026-04-26
superseded_by: ADR-008
superseded_at: 2026-04-26
---

> ⚠️ **本方案已被 [ADR-008 (AI-Native 与 CLI-first)](../decisions/ADR-008-ai-native-cli-first.md) 覆盖。**
>
> 方案 A 原本设计标准化的 Context Pack + CLI 适配层让 agent 在启动时拿到结构化的 Orbit 世界观。v2 改为纯 CLI 路线，不再需要 context pack 生成管线。新方案见 [`plans/2026-04-26-cli-migration.md`](./2026-04-26-cli-migration.md)。
>
> 本文保留作为历史参考。

---

# Orbit Agent Context Architecture — 方案 A 详细设计

## 1. 背景

Orbit 的产品定位不是“一个带终端的 Electron App”，而是“个人愿景驱动的 AI 协作工作台”。它把用户的长期方向、项目、任务、资源、日记和 agent 执行痕迹都沉淀在本地 PARA vault 中，并通过 Markdown、Git、worktree、MCP hooks 形成一套可追踪、可恢复、可审计的执行系统。

Orbit 已经有很多对终端 agent 友好的基础设施：

- project 根目录自动写 `.mcp.json`
- embedded terminal 会注入 `ORBIT_VAULT_PATH`、`ORBIT_PROJECT_UID`、`ORBIT_PROJECT_SLUG`
- project 有 `README.md`、`AGENT.md`、`.agent/config.json`
- `.agent/tasks/` 和 `.agent/memories/` 已经是天然的工作语义存储

但这些能力是碎片化的。它们解决的是“agent 能不能调用 Orbit 工具”和“agent 是否知道当前 project 身份”，没有解决“agent 是否真正理解 Orbit 这个世界、当前项目的目标、当前状态和推荐工作方式”。

因此，用户在 Orbit 终端里输入 `claude` 时，Claude 获得的是一个“能跑命令、能看到一些文件、能连 MCP”的环境，但不是一个“已经理解 Orbit”的环境。它仍然需要自行拼接 README、AGENT、环境变量、任务目录、MCP 能力，成本高且不稳定。

方案 A 的目标，就是把这些碎片整合为一套**标准化、结构化、可递送、可适配**的 Agent Context System。

---

## 2. 这套方案要解决的真实问题

### 2.1 表层问题

- 为什么终端里的 `claude` 看起来“不懂 Orbit”？
- 为什么它知道当前目录，却不知道当前项目真正想完成什么？
- 为什么它会把 Orbit 项目当普通 repo，而不是一个有 task/worktree/night shift/distill 规则的工作台？

### 2.2 深层问题

Orbit 目前缺的不是“再多写一点提示词”，而是**上下文递送链路**：

1. **缺事实源整合**
   - 信息存在，但分散在 Vision、README、AGENT、config、tasks、git 状态里

2. **缺结构化快照**
   - 运行时状态没有形成统一的 agent 可消费模型

3. **缺 CLI 适配**
   - 不同 agent 对上下文文件的读取方式不一致

4. **缺强制入口**
   - 不能保证 `claude` 启动时一定读到 Orbit 上下文

这意味着，如果只在 `AGENT.md` 上继续做增强，问题还会反复出现。

---

## 3. 核心设计原则

方案 A 的原则是：

1. **Canonical Source First**  
   以 Vision / README / AGENT / config / tasks / git 状态作为事实源，而不是在 adapter 中手写重复内容。

2. **Generated Pack for Agents**  
   agent 真正消费的是 Orbit 生成的 context pack，而不是直接消费全部原始文件。

3. **Adapter, Not Assumption**  
   不假设所有 CLI 都遵循同一文件约定。Orbit 自己提供 Claude/Codex/Gemini 的 adapter。

4. **Deterministic Delivery**  
   只写 `CLAUDE.md` 不足以保证读到；必须有 wrapper/launch path 才能形成确定性交付。

5. **One Source, Many Consumers**  
   同一个 context pack 可以被 embedded terminal、headless runner、night shift、worktree agents 统一复用。

---

## 4. 整体架构

### 4.1 Layer 0：人类维护语义源

- `<vault>/Vision.md`
- `<vault>/AGENT.md`
- `<project>/README.md`
- `<project>/AGENT.md`
- `<project>/.agent/config.json`
- `<project>/.agent/tasks/*.md`
- `<project>/.agent/memories/*`

### 4.2 Layer 1：Orbit 生成 Context Pack

建议目录：

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
  SESSION_BRIEF.md
  context.index.json
```

### 4.3 Layer 2：CLI Adapter

- `<project>/CLAUDE.md`
- `<project>/AGENT.md`
- 未来可扩展到 `CODEX.md`、`GEMINI.md`

### 4.4 Layer 3：Launch Wrapper

```text
<vault>/.orbit/bin/claude
```

Orbit embedded terminal 启动时把 `.orbit/bin` 放在 PATH 最前面，让用户在 Orbit 终端输入 `claude` 时，优先走 Orbit wrapper。

---

## 5. Context Pack 详细内容

### 5.1 `00-orbit.md`
定义 Orbit 世界模型：

- Orbit 是什么
- Vault / PARA / Project / Task / Worktree / Night Shift / Distill 的含义
- agent 在 Orbit 中的推荐行为和边界
- Orbit 不鼓励的行为（越过 vault 外修改、跳过任务更新、跳过 safety gate 等）

### 5.2 `10-vault-vision.md`
从 `Vision.md` + vault 根 `AGENT.md` 融合：

- 长期方向
- 当前工作台偏好的做事方式
- 用户关注的 north star

### 5.3 `20-project-brief.md`
从 project README / AGENT / config 提取：

- 项目目标
- 项目当前状态
- 模板类型
- 关键约束
- 成功定义
- 推荐优先级

### 5.4 `30-project-state.md`
运行时生成：

- branch / dirty / recent commits
- active task count
- doing / blocked / today 摘要
- recent agent runs / worktrees
- MCP readiness
- freshness timestamp

### 5.5 `40-tooling-and-commands.md`
抽取 package scripts、常见命令、构建/测试路径、常用入口、危险命令。

### 5.6 `50-operating-rules.md`
用 Orbit 语义约束 agent 行为：

- 小步提交
- 遇到不确定先说明
- 尽量落在 task/worktree/workflow 内
- 不越过项目边界乱改

### 5.7 `60-open-tasks.md`
从 `.agent/tasks/` 生成摘要，优先显示：

- today
- doing
- blocked

### 5.8 `70-recent-activity.md`
从 `.orbit/logs/`、night shift、recent task execution 中总结最近行动轨迹。

---

## 6. Claude 适配设计

### 6.1 文件适配

生成 `<project>/CLAUDE.md`，内容不是整包复制，而是**索引式入口**：

- 告诉 Claude 优先读取 `.agent/context/context.index.json`
- 强调 Orbit 运行世界与规则
- 提示优先看 `SESSION_BRIEF.md`

### 6.2 包装器适配

Orbit terminal 注入：

- `ORBIT_CONTEXT_ROOT`
- `ORBIT_CONTEXT_INDEX`
- `ORBIT_AGENT_PROFILE=claude`
- `PATH=<vault>/.orbit/bin:$PATH`

wrapper 行为：

1. 找真实 `claude`
2. 确保 context pack 已刷新
3. 把 `SESSION_BRIEF.md` 作为显式启动材料
4. 调用真实 Claude CLI

这样 Orbit 能**确定** Claude 启动时拿到了正确上下文，而不是靠运气。

---

## 7. 用户旅程

### 旅程 A：新建项目后第一次运行 Claude

1. 用户点击 `+ New Project`
2. Orbit 创建 README / AGENT / `.agent/config.json` / `.mcp.json`
3. Orbit 初始化 `.agent/context/`
4. 用户进入 Terminal tab，输入 `claude`
5. 实际执行的是 `.orbit/bin/claude`
6. wrapper 刷新 context pack
7. Claude 启动时读取 `SESSION_BRIEF.md`
8. Claude 已知：
   - 自己在 Orbit 中
   - 当前 project 的目标
   - 当前任务状态
   - 可用 Orbit MCP 工具

### 旅程 B：项目做了一半，用户回来继续

1. 用户几天后重新打开 vault
2. Orbit 打开 project room
3. system watcher 刷新 project state / tasks / git 状态
4. 用户按 ``⌘` `` 聚焦终端并运行 `claude`
5. Claude 拿到最新 `30-project-state.md` 与 `60-open-tasks.md`
6. 它知道“从哪里继续”，而不是重新猜上下文

### 旅程 C：外部终端直接进入 project 根运行 Claude

1. 用户在系统终端 `cd 01_Projects/foo`
2. 手动运行 `claude`
3. 即便没有 Orbit wrapper，也有：
   - `.mcp.json`
   - `CLAUDE.md`
   - `.agent/context/`
4. Claude 仍有较高概率建立正确上下文

这保证 Orbit 内外体验一致，但 Orbit 内体验仍然更确定。

---

## 8. 前因后果：为什么方案 A 是当前最优

### 前因

- Orbit 已经走到了 project-as-folder、MCP、terminal、task/worktree 的阶段
- agent 不再只是“辅助聊天”，而是实际工作流参与者
- 这意味着“上下文是否稳定”已经变成产品能力本身

### 转折点

一旦 agent 开始参与：

- 创建任务
- 更新任务
- 跑 worktree
- 写执行日志
- 调用 MCP tools

那么 Orbit 必须定义“agent 的世界模型”，不能再完全交给 CLI 自由发挥。

### 后果

方案 A 落地后，Orbit 会从：

> 有很多相关文件，但 agent 需自行拼装理解

变成：

> Orbit 主动构建并递送一个一致、可适配、可扩展的 Context Delivery System

这会显著提升：

- 首次启动成功率
- 长会话连续性
- agent 输出稳定性
- task/worktree 流程对齐度

---

## 9. 风险与应对

### 风险 1：context pack 过大
应对：分层文件 + `SESSION_BRIEF.md` 摘要入口，不直接把所有内容一次塞给 agent。

### 风险 2：上下文过时
应对：打开项目、关键文件变动、终端启动前三层刷新。

### 风险 3：多 CLI 行为不一致
应对：adapter layer 分离，不把 Claude 特性写死在 canonical pack。

### 风险 4：用户觉得“太魔法”
应对：wrapper 明确、文件可见、`.agent/context/` 可读、`CLAUDE.md` 可检查。

---

## 10. 落地顺序

### Phase 1
- 定义 context schema
- 生成 `.agent/context/*.md`
- 生成 `context.index.json`

### Phase 2
- 生成 `CLAUDE.md`
- embedded terminal 注入 `ORBIT_CONTEXT_*`
- `.orbit/bin/claude` wrapper

### Phase 3
- session brief
- terminal pane 级上下文
- 与 task selection 联动

### Phase 4
- 扩展到 Codex / Gemini / headless runner

---

## 11. 结论

方案 A 的价值不只是“让 Claude 更懂 Orbit”，而是为 Orbit 建立一套**通用、长期、可迁移的 agent 上下文体系**。

它既保留了 Orbit 当前“Markdown + Git + 本地文件”的透明优势，又补上了 agent 时代最关键的一环：**Context Delivery**。

对 Orbit 当前阶段来说，这是最稳、最正确、最可演进的路线。
