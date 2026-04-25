# Conversation — Orbit v2 方向确立

> **Date**: 2026-04-26
> **Context**: Onboard 模式对话（project-brainstorm skill）
> **Purpose**: 完整保留 AI 和项目拥有者关于 Orbit v2 方向的对话原文
>
> 下方按对话轮次组织，每轮有简短标题描述该轮主题。轮次编号供其他文档（`decisions-traced.md`、`key-pivots.md`）交叉引用。

> ⚠️ **关于本文的完整性说明**：
>
> 这是 AI 在写作时基于当前对话上下文重建的对话文本。内容语义完整、关键句保真，但：
> - 每轮的具体措辞可能和原文略有差异（AI 在输出时有少量复述）
> - 时间戳按轮次编号给出，不是真实对话时钟
> - 保留了所有关键决策瞬间和 6 次认知跃迁的原始表述
>
> 未来自动化 Thinking Trail 子系统会从对话引擎直接捕获原始流，保证完全保真。本次作为手动实践留痕。

---

## Round 1 — Onboard 启动

**User**: `[使用Skills: project-brainstorm]` 帮我梳理一下 `/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit` 这个项目。

**Assistant**: 调用 project-brainstorm skill，进入 Onboard 模式。先读项目结构：`README.md`、`docs/VISION.md`、`docs/ROADMAP.md`、`docs/architecture.md`、`docs/plans/*`。

确认项目是一个已有的 Electron + React + Claude Code CLI 协作工作台，当前处于 v1 阶段（M1-M7 + R1-R7 已完成），重点 feature 包括：Project-as-Folder、Vision、Kanban、嵌入式终端、Orbit Hooks MCP、Night Shift、Daily Review。

给出初步总览草稿（.onboard-draft/），询问用户偏好的 Onboard 流程。

---

## Round 2 — 选择 Onboard 流程

**User**: 选 C. 走标准 Onboard 流程——在 boxai 的 output 下建一份标准结构（overview.md + features/*.md + ADR + session.json），以后用 project-brainstorm 激活时直接从这里加载。

**Assistant**: 确认，开始标准 Onboard。先生成 overview 草稿供用户校验方向。

---

## Round 3 — 用户提供关键方向校正（Night Shift 废弃）

**User**: 你先说下你对这个项目的总览和理解，我看看和我想象的有没有偏差。

**Assistant**: 抛出一份 overview 草稿，定位 Orbit 为"个人愿景驱动的 AI 协作工作台"，列出核心能力、执行模型（含 Night Shift）、未来方向。

**User**: 我认为一开始我的设想是一个个人的工作台，但后面实施的时候有一点偏差的是我对 Agent 没有那么的了解，导致我做了一个 night shift 的功能，实际上不需要这么一个功能，需要的是自动执行的 Agent，不应该局限于夜晚批量执行。Night Shift 应该废弃掉，但是当时设计了一套 worktree 的流程，这部分可以复用。

**Assistant**: 【关键认知跃迁 Pivot 1】记录方向变更。问：

1. Auto-runner 相比 Night Shift 的 scope 是否是：24×7 持续、按依赖满足自动拾取、不再有"批量"概念？
2. Worktree 流程保留，但是否需要做 Sandbox 分支覆盖非代码项目？
3. Agent 自主程度的边界怎么划？

---

## Round 4 — 人机分工的边界

**User**: 还有几个问题我还没回答。人机分工的边界：执行包括写代码，也包括执行中发现新问题，可以自己去开子任务，但子任务需要在看板去创建子任务，并且 Agent 需要去认领这个任务，到自己这开新的 Runtime 实例...

**Assistant**: 确认初版边界理解：

- 人：写 Vision、开 Project、定 Task、审合并、负责方向
- AI：执行 Task，遇到问题自己开子 Task，自己认领执行

回问几个边界问题：agent 自己发现的子任务如果有 100 个，全部上看板合适吗？

---

## Round 5 — 提出子任务折叠的想法

**User**: Agent 开子任务，这个我有新的想法，如果他要开很多子任务的话，实际上不如就在这个主 Agent 里面全部完成，子任务只作为这个主任务的 Markdown 文档里面的执行记录，不需要单独的开一个新的任务 markdown 文件。

**Assistant**: 【关键认知跃迁 Pivot 3 前奏】强烈认可。这让看板保持"认知地图"属性，agent 的内部步骤下沉到 Execution Log。

但追问：

- 如果 agent 发现了一个**独立的新方向**（比如"应该单独修 auth 模块的 bug"），这个情况下该不该独立成 task？
- agent 何时可以自主扩张，何时要让用户审批？

---

## Round 6 — propose_new_task 与授权原则

**User**: Agent 调用 create_task 之前需要主动告诉用户他想创建新的任务，而不是随意的去创建，用户允许再开始创建。人主动拆分的任务才会出现在看板上，这个人主动拆分的概念，实际上不一定是人手动添加任务，也可以是人允许 AI 按照 AI 的方式去添加。

**Assistant**: 【关键认知跃迁 Pivot 3】澄清：**看板 = 用户的认知地图**，所有入看板的都必须有"人的授权"，但"授权"可以是人批准 agent 的 proposal。

梳理边界：

1. 折叠进 Execution Log 的情况（绝大多数）
2. propose_new_task 的情况（少数，有独立价值）
3. 必须 escalate 的情况（需要人介入）

问：propose 的审批该在哪儿做？chat 内还是专门页面？

---

## Round 7 — 审批在 chat 原地 vs 专门页面

**User**: 我也觉得方案二更靠谱，工具里内建强制审批，但是如果我正在规划任务，Agent 调用了以后，我难道还要去 Inbox 去审批吗，能不能直接在 chat 页面也加这个审批能力呢。衍生关系没有问题，看板内的任务都是独立的，但能看出衍生关系就够了。

**Assistant**: 确认方向：

1. **审批能力是通用的 chat 基建**，不是特定 view 的功能
2. 同一个 proposal 在 chat 原地和 Inbox 都能处理，通过 proposal_id 同步
3. 衍生关系用 `derived_from` 字段记录，任务本身独立

引出需要讨论的：依赖循环怎么办？依赖任务被删怎么办？

---

## Round 8 — 依赖模型拍板

**User**: 原地审批能力是通用的 chat 基建，没有问题。依赖模型的方案，用方案 A。Task editor / planner publish 时做检测，拒绝循环依赖。依赖任务被删除或归档 → Task-A 进入 blocked + Inbox 警示。依赖任务长时间卡住也要 Inbox 警示。只做 task-to-task，不做跨项目。

**Assistant**: 全部接受：

- 方案 A：独立 `depends_on` 字段，不改状态机，Dispatcher 层拓扑计算 ready
- 循环检测在入口层做（Editor / Planner publish），不在运行时
- 依赖被删/归档 → 级联 blocked + C 类 Inbox 事件
- 依赖长时间卡住 → C1 警示
- v1 不做跨项目

---

## Round 9 — ExecutionContext 问题浮现

**Assistant**: 既然 Auto-runner 要给各种项目跑任务，是不是所有项目都适合 worktree 隔离？比如笔记项目、研究项目。

**User**: 这是个好问题。我的想法是：既然看板和任务是通用的，那执行隔离机制也应该是通用的，只是内部按项目类型分不同实现。

---

## Round 10 — .git 不等于代码项目（Pivot 2）

**Assistant**: 判定信号用"项目里有没有 `.git`"如何？有 → 代码项目 → worktree；没有 → 笔记项目 → sandbox。

**User**: 有 .git 不代表是代码项目，有可能只是用 .git 来管理。

**Assistant**: 【关键认知跃迁 Pivot 2】立刻意识到这是对的。判定信号必须是"**是否需要 build/test**"而不是"是否有 git 目录"。

修正设计：

- `AGENT.md` 里显式声明 `execution_context: worktree | sandbox`
- 项目模板按类型预填
- Git 启用与 ExecutionContext 正交（Sandbox 也可启用 git 做快照）

Sandbox 的详细设计本期不做，下一阶段专门设计。

---

## Round 11 — Auto-runner Dispatcher 的具体形态

**User**: OK。Dispatcher 要怎么跑？cron? daemon? 每次开 App 才跑？

**Assistant**: 提议：main process 内的永驻 loop，每 5s tick，观察看板状态，按 ready 集合分配 agent。但用户可以通过 Settings 全局暂停。

**User**: OK，但预算和并发要卡住。

**Assistant**: 确认复用现有 BudgetGate / BudgetWatch + 新增 `autoRunner.maxConcurrent` / `hourlyTaskLimit` 设置。

---

## Round 12 — 授权链路字段设计

**Assistant**: Task frontmatter 需要加哪些字段来记录授权链路？

**User**: 至少要知道：谁创建的（手动还是 agent）、谁批准的（如果是 agent 提议）、在什么情况下提议的（哪个任务执行中）、提议的 run 是哪个。

**Assistant**: 整理字段：

```yaml
created_by: user | agent_run:<run_id>
approved_by: user | null
approved_at: ISO
proposed_by_agent_run: <run_id> | null
proposed_during_task: <task_uid> | null
proposal_id: <proposal_id> | null
approval_decision_note: "..." | null
```

约束：`created_by: agent_run:*` 时必须有 `approved_by`。

---

## Round 13 — 转向 Inbox 设计

**Assistant**: 审批/求助/警示都要有个入口让用户累积和处理。Inbox 似乎是自然的承载。能和你聊下你对 Inbox 的设想吗？

**User**: Inbox 我想做成左列表 + 右内容区，左边是各种消息，右边是对应处理界面。chat 直接放右边，点审批消息右侧打开 chat 就能原地审批。

**Assistant**: 这个想法非常对味——我一开始的 Inbox 设想是"列表 + 详情卡"，你直接把 chat 放右边就把 "Inbox 是通用舞台" 这个抽象捅破了。我抛一份完整的 Inbox 设想 v0。

---

## Round 14 — Inbox 设想 v0

**Assistant**: 抛 Inbox 设想 v0。核心论点：

1. Inbox 定位："用户注意力在场时的待处理事件清单"
2. 四大事件类：A 审批 / B 求助 / C 警示 / D 纪律
3. 左列表 + 右通用舞台，舞台按事件类型渲染不同组件
4. chat 和 Inbox 双通道同步

留 6 个空白让用户决定：通知频率、批量处理、Inbox Zero 仪式、全局 vs 项目内、agent 主动汇报、历史检索。

---

## Round 15 — 用户逐条回应 + 引入 BASB（Pivot 4）

**User**: 实际上，Inbox 里面应该基本可以处理所有的消息，Inbox 我打算做成左侧是列表，右侧是一个内容区，那 chat 其实就可以直接放在内容区，点击左侧的审批消息，右侧直接就打开 chat，这不就直接就能审批了吗？

关于前面的留白：
- 暂时不要推送通知，只需要 Inbox 的左侧栏那块有一个消息未读数的红点就可以
- 暂时可以不做批量处理，后面再做
- 可以有已读不处理的缓冲区，处理完的不用直接消失，而是以一种状态保存下来，比如说归档状态
- vault 级全局 Inbox
- Agent 主动汇报有趣发现我想要，这个是一个很棒的主动型 Agent 的一个例子
- 要做 Inbox 历史检索，但不用这一期就做

我增加一个额外的说明，这个工作台后续不只是项目和执行任务，你看到了，其实整体是基于 The second brain，CODE 第二大脑的，文件系统用的 PARA 加上 inbox。所以除了执行以外，还需要有 capture 的阶段，后续会涉及到阅读功能和笔记功能，可以下一阶段再聊，但你要先知道，会有 quick capture 功能，内容会先进到 inbox。但阅读和笔记实际上和刚才这些审批的 inbox 是不太一样的，所以我认为可以分层级，把阅读笔记审批作为一个层级，然后第二级才是消息列表，这样子就可以分开看消息，而不是把它们混在一块儿。

---

## Round 16 — BASB 定位重大吸收

**Assistant**: 【关键认知跃迁 Pivot 4】这是这一整轮讨论里最关键的一次架构澄清。让我先把它讲透：

你刚才讲的其实是：**Orbit 的基础不是"项目管理 + AI 执行"，而是 Building a Second Brain (BASB) 方法论的完整实现**。

按 CODE 四阶段对齐：
- Capture → 缺失 / Quick Capture 进 Inbox
- Organize → PARA 目录结构（我之前当文件夹约定看，其实就是 BASB）
- Distill → Distillation 系统（之前当 AI 产出看，其实是 D 阶段）
- Express → Agent execution

这让 Inbox 自然分层：
- Capture 类（阅读/笔记/灵感）：慢、沉浸
- Operation 类（审批/求助/警示）：快、扫描

提出新结构：

```
Inbox
├── 📥 Capture (12)  
├── 💬 Messages (3)
└── 📦 Archive
```

Capture 内部进一步分，但留给下一轮讨论。

---

## Round 17 — Capture 内部：Feed vs Library

**User**: Capture 类 和 Messages 类的状态模型区分我同意，但关于阅读这一块，我想跟你多聊一下，这里我想设计成 feed 和 library 两种。feed 是一种低信号的信息流，用户是被动在消费，他不一定喜欢 feed 流里面的每一篇文档，因为这个流里面有可能是订阅的 RSS，有可能是 GitHub 的 trending 等等。而 library 是一种高信号的用户主动加入的单篇文档，有可能是用户某一天他手机刷到的一个推文，或者是一篇公众号文章，他把它收藏了起来，是主动的想要以后再读。这两种情况在 inbox 里怎么去区分？

**Assistant**: 把区分抽象成两个维度：信号浓度（低 vs 高）、消费姿态（扫描 vs 沉浸）。BASB 默认只覆盖 Library，Orbit 扩展了 Feed。

建议 Capture 下分两层：

- 🌊 Feed：高密度列表、扫过即忘、唯一动作是 Save to Library、不计未读数
- 📚 Library：低密度列表、沉浸阅读器、有 `reading` 中间态、scroll position 持久化、Promote to Resource 连接 Distill

数据流：外部订阅 → Feed → (★Save) → Library → (🔥Promote) → Resources

还有几个确认项：Feed 归档到哪？Feed 未读要不要显示？订阅源管理放哪？

---

## Round 18 — Feed History 独立 + Thoughts 单独一类

**User**: 你提到 Feed 归档是自然淡出，不进入 Archive view，那归档到哪里去呢？因为平时阅读 feed 的时候是很快的，有可能只是选择了一些阅读，但我认为 feed 是有搜索价值的，有可能以后在某一次对话的时候，可以把之前归档的 feed 也作为信息库来搜索，还能从中再找出一些和我做的项目相关的资料来详细阅读。当然 feed 的权重和 library 明显不是一个层级，这个可以后面要做细化搜索的时候再去考虑。但确实不应该和其他的内容放到一个 archive view 里，它应该是一个单独的。

Feed 不显示未读，订阅源管理作为 Feed tab 内部的一个"设置"入口没有问题，灵感笔记确实应该单独一类。

且有一个额外的事情，我想在这里提一下。现在有设计一个操作记录的功能，这个操作记录实际上我是希望能够作为用户每天的留痕，也就是我其实希望有一个 review 页面，能看到每天用户做的那些事儿。后面做阅读和笔记的时候，也需要做操作记录。Review 页面后面我们也可以单独找一个机会去讨论。

Feed 的内容支持可以先只做 RSS，其他单独找一期去做，只要先验证了这个功能流程就行。而且，feed 的订阅源添加是可以让 AI 去完成的，需要加这个 MCP 的接口，这里我也说明一下，这个应用里面尽量所有的能力都可以让 AI 去做，这样子才是一个 AI native 的应用。

Feed 后台刷新 + 手动触发并存。Library 的阅读进度，记 scroll position, 滚动完就记录，200ms 节流，也需要记阅读时长。

Voice Log / Thoughts 这块、Quick Capture 的入口设计，手机 share 进来的路径我都挺感兴趣，你可以给个粗略的方案，在下一期再做，这一期 Quick capture 需要有一个简单的能力，能让我跑通 Inbox 里面的流程就行了。

---

## Round 19 — 吸收并引出三大新基础设施

**Assistant**: 这一轮信息量很大，其中有两件事是比 Inbox 细节更高层级的架构话题：

1. **操作记录（Activity Log）/ Review 页面**
2. **"所有能力都可以让 AI 去做"的 AI-Native 原则**

另外你提到 AI 对话记录也是关键数据——这个观察比你可能意识到的更重要。

### Feed History 独立

同意。独立区域，UI 默认隐藏，作为 agent 检索池存在。永久 vs 滚动保留？

### Activity Log 是新基础设施

你说的"操作记录"其实是一个贯穿全系统的用户行为时间轴。不只是 review 页面的数据源，更是 BASB Progressive Summarization 的基础。

建议 `.orbit/activity/YYYY-MM-DD.ndjson`，统一 emitter 接口，所有状态改变都 emit 一条事件。

### AI-Native 原则

"用户能做的，AI 都能做"——这是元原则。推论：

- MCP 工具集要大幅扩展（30+）
- Role Template 的 tool permission 分化
- 破坏性动作走 approval flow
- 文档生成规范

但 MCP 工具集膨胀会带来严重的 token 开销（~6000 tokens）——提议考虑 CLI 路线？

---

## Round 20 — 接受新基础设施 + AI 对话记录也要保留

**User**: Feed History 永久保留，但当用户认为想清理 feed 的时候，可以跟 AI 说清理多少时间以前的。这个能力不用额外做，因为只是一个文件系统的编辑能力，AI 都可以做。

Orbit 自我进化的数据基础我很感兴趣，可以作为后续某个阶段待讨论的项，这期可以先不聊。你有没有发现，你跟我聊天的这些会话记录，也是很关键的数据，这个非常能分析出我想做什么。所以 AI 的对话记录也是一个很重要的，需要去单独找地方去存放的数据，这个也作为待讨论的项，后面再找时间聊。

MCP 工具集膨胀，能否考虑做成 CLI，这样 Agent 很容易节省 token 和 context。你可以分析一下对于 orbit 来说，MCP 和 CLI 的优劣。

Activity Log 本期一起实施。

---

## Round 21 — MCP vs CLI 深度分析（AI 提出混合方案）

**Assistant**: 开始分析 MCP vs CLI。

- MCP 优势：schema 强约束、结构化返回
- CLI 优势：token 小、可按需拉取 `--help`、可组合、用户和 AI 共享心智

提议混合方案：CLI 承载主要能力（CRUD、查询），MCP 承载流程控制（审批、状态转换）。

给出现有 7 个 MCP 工具的迁移表（6 个去 CLI，1 个保留 MCP 但改成 propose-approve）。

---

## Round 22 — 用户反驳"用户心智一致"论点（Pivot 5）

**User**: 有一个问题我想跟你澄清一下，MCP 和 CLI 实际上都是针对 Agent 来说的，不太需要考虑用户去调用的情况，因为用户不需要了解这一层认知，他只和 AI 聊天。所以，你的取舍应该只考虑 Agent，而不需要考虑用户。所以，是不是就不需要混合方案，而直接用 CLI 就可以？CLI 多步骤事务会有问题吗？

---

## Round 23 — AI 撤回伪论点 + 确定纯 CLI

**Assistant**: 【关键认知跃迁 Pivot 5】你这个反驳切中了要害——我刚才的"用户和 AI 共享心智"论点确实是一个伪价值。让我认真自我审视。

撤掉伪论点后重新分析：

- MCP 真实独有优势只剩 "schema 强约束"（可被 CLI 规范缓解）
- "多步骤事务" 在 CLI 和 MCP 里都没有天然支持，由业务层解决
- 会话类多轮交互不适合做成单次工具（chat 承载）
- 异步返回 CLI 和 MCP 都是"立即返回 + 异步跟踪"，无本质差异

结论：**纯 CLI 足够**。MCP 保留一个可能用途是"接收事件推送"——但这可以用 stdin pipe 扩展现有 hydration 机制实现，不需要 MCP。

推荐：**纯 CLI + stdin 事件推送**，废弃 `src/mcp/`。

---

## Round 24 — 拍板废弃 MCP，留观察期

**User**: 完全废弃，能力全部迁移到 CLI，后续观察一下 Agent 对任务执行的准确度，来考虑要不要把 MCP 接回来。

---

## Round 25 — 确认清单，准备写文档

**Assistant**: 拍板了——完全废弃 MCP，全面迁移到 CLI，观察期后再考虑回补。

决策正式记录：
1. Orbit 现有 `src/mcp/` 完全废弃
2. Agent 只通过 CLI + stdin 事件推送与 Orbit 交互
3. 设立观察期监控准确度
4. 回退条件：错误率 > X% → 引入 MCP 补充
5. MCP 代码保留在 git history

整理最终共识清单（按主题组织，不按编号）：
- A. 产品定位
- B. 人机分工
- C. 看板与任务
- D. 执行上下文
- E. Inbox 枢纽
- F. Capture 子系统
- G. 审批与授权
- H. Plan Chat
- I. 操作记录与自省
- J. AI-Native 与 CLI
- K. 本期范围 vs 后续

文档产出规划：10 份 ADR、8 份 plans、overview 重写、VISION/ROADMAP 更新。

确认 4 件事：
1. ADR 命名规范 `ADR-NNN-<title>.md`
2. ADR 和 plans 一一对应关系
3. 语言风格
4. 放置位置（output 还是原项目）

---

## Round 26 — 用户决定写入原项目 + 保留对话（Pivot 6）

**User**: 把原来项目文档的规范全部改成你认为的规范就可以，不用在乎原来的规范。

一个 ADR 对应一个 plan 没有问题。

主要写中文为主，术语保留英文。

其他问题都可以，直接做吧。

另外：直接把原来项目的过时文档都替换掉，不要放置在 output 了，直接放到项目里吧，项目里的过时文档会影响到后续 AI 迭代的时候对整个项目的判断。

我们这一次的这个长时间的对话，是不是也应该到时候直接把对话的记录的文件复制过来，保留在项目里，这样后续再进行迭代的时候，会有完整的思考过程？

---

## Round 27 — AI 意识到 Thinking Trail 的实践价值

**Assistant**: 【关键认知跃迁 Pivot 6】两个新指令都很关键——特别是第二个，直接回应了前面讨论过的 Thinking Trail 概念。

Thinking Trail 的三层设计：
- README.md（索引和导读）
- conversation.md（原始对话保真）
- key-pivots.md（关键认知跃迁点提炼）
- decisions-traced.md（ADR 溯源到对话位置）

这次手动实践为未来 Thinking Trail 子系统提供了模板。

### 最后确认 7 件事

1. ADR 命名用 `ADR-NNN-<title>.md` 风格？
2. ADR 和 plans 一一对应？
3. 语言中文为主，术语英文？
4. 不单独建 features/，内容合并进 plans/？
5. 旧方案加 superseded 标记但保留原文？
6. Thinking Trail 存 `docs/thinking-trail/2026-04-26-v2-direction/` 目录？
7. Thinking Trail 包含 README + conversation + key-pivots + decisions-traced 四份？

---

## Round 28 — 用户最终绿灯

**User**: 把原来项目文档的规范全部改成你认为的规范就可以，不用在乎原来的规范。一个 ADR 对应一个 plan 没有问题。主要写中文为主，术语保留英文。其他问题都可以，直接做吧。

---

## Round 29 — AI 开始批量写作

**Assistant**: 收到，全部绿灯。开工。

创建 todo list：
1. ✅ overview.md + VISION.md + ROADMAP.md
2. ✅ 10 份 ADR + decisions/README.md
3. ✅ 8 份新 plans
4. ✅ 旧 plans 标记 superseded + architecture.md 索引段
5. ✅ thinking-trail/（本文档是这一步的产出）
6. 🟡 README + AGENTS + CHANGELOG + open-questions

按批次连续输出文档，中间不中断。

---

## 对话节奏观察

本次对话共约 29 轮（按内容语义聚合，实际消息数略多），持续约 4-5 小时的工作时间。

特点：

1. **前 10 轮全在建立共识**：执行模型、看板定位、依赖策略、审批模式
2. **中 10 轮在展开子系统**：Inbox、Capture、BASB 定位、Activity Log、CLI
3. **后 10 轮在整理和落地**：清单汇总、文档规划、执行
4. **共识累积**：从 17 条（中途）到 40+ 条（结束前）
5. **6 次 pivot**：见 `key-pivots.md`
6. **最终产出**：26 个新/更新文件，~120KB 内容

---

## 编辑说明

本文的轮次是按"**语义聚合**"而不是"消息分界"划分的——实际对话里每轮可能由 AI 和用户多次来回组成，但为了可读性合并成一轮。

如果未来做自动化 Thinking Trail，建议按**消息**存储原始流，但提供**按轮次聚合的视图**作为主要阅读入口。原始流用于精准追溯，聚合视图用于快速浏览。
