# 原始对话记录

> 按轮次记录，不压缩不重组。用于后期提炼 key-pivots 和 decisions-traced。

---

## Round 1 — 用户触发

**User**：和 `/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit` 下一阶段的需求，先读存量的文档，了解项目全貌，我想做应用内 chat 的统一规划。

**Assistant**（摘要）：加载 project-brainstorm skill → 扫项目文档（overview / VISION / ROADMAP / architecture / ADR-004 / ADR-005 / open-questions / task-conversation-ui plan / ADR-015 / Phase 4.0 plan）→ 判定为 Evolve 模式 → 盘点 chat 在项目里的 7 处出现位置 → 识别 6 条张力（三套实现并行 / 数据模型三份 / 双通道耦合 / awaiting_user 入口不统一 / Thinking Trail 悬空 / 无统一规划文档）→ 抛四问题确认方向：scope / target scenes / pain / format。

**Assistant 埋了个预设**："真正的核心命题不是'统一三套 chat 实现'，而是'Orbit 需要一个 First-Class 的 Conversation 域模型'"——但用户没接这个，而是给了完全不同的答案。

---

## Round 2 — 用户纠正方向（关键 pivot 1）

**User 原话**：

> 我认为很重要的一点是，需要抽象出 chat 和 runtime agent 之间的逻辑，消息协议等等，需要业务无关，才能让这套逻辑在任何应用内的其他业务跑起来，且后面还有可能做应用内的 runtime，但没关系，应用内的 runtime 也是一种 runtime，抽象在 runtime agent 内就可以。任务页的 chat，要处理对话等待用户审批，对话完成，通知 inbox，这些其实都和 chat 本身无关，chat 不应该感知，chat 只负责渲染出 agent 的对话，用户的对话，中间的各种时机抛出各种事件，业务应该由每一个业务的地方去完成，就像 inbox 也是如此，他只负责定义接收哪些消息，业务负责去发送这些消息类型出去到应用总线。所有模块都解耦，这样才能长期稳定的迭代。这个阶段必须借助 chat 这个契机，把应用当前的架构给解耦到一个干净的地步。

**Assistant 的翻译**（四根支柱）：

1. Chat ⊥ Runtime Agent 的协议是**业务无关**的（应用内 runtime 也是 runtime 的一种）
2. Chat 组件是纯粹的"对话渲染器"（不知道 task、inbox、proposal、vault）
3. 业务逻辑通过**应用总线**解耦（订阅-产出，而非直接调用）
4. 这是一次**应用级架构治理**，chat 是切入点不是终点

**Assistant 的三个担心**：
- Q1. 业务无关 chat ↔ runtime 协议的边界在哪里（resume/tool use/proposal/附件/引用该谁管？）
- Q2. 应用总线是新造还是复用（现有 TraceableEvent / Activity Log / Inbox Events 三套并存）
- Q3. "干净"的验收标准是什么（防止事件泛滥 / 命名混乱 / leaky abstraction）

**Assistant 提议的五层讨论顺序**：Chat 边界 → Chat↔Runtime 协议 → 应用总线 → 迁移样本 → 验收标准

**Assistant 问 4 个问题**确认方向。

---

## Round 3 — 用户再次升级方向（关键 pivot 2）

**User 原话**：

> 我认为 chat ↔ runtime 协议边界需要先调研下 claude、codex 这两个最多用户的 runtime 内有哪些协议需要被对应，chat 不应该是凭空想出的协议，毕竟是针对 runtime 做的。
>
> TraceableEvent 升格为应用总线，这样整个应用的 replay 就更强大了，更好发现应用的 bug。
>
> 总线是"日志式"还是"消息式"需要讨论下优缺点。
>
> 究竟怎么解耦才干净，要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观，只有详细分析了所有功能，（包含现在已知要做但还没做的功能，比如 sandbox、阅读器、阅读订阅、笔记的各种功能、全局 ai 助手、定时任务 agent、可以通过 telegram 等 channel 控制应用，参考 openclaw。任务执行打通全流程从创建到执行，到 worktree，到 pr，到合入。sandbox 是另一套，又该怎么做）想清楚这些，可以不做，但是就能知道架构应该先打成什么样。

**Assistant 的翻译**（四根支柱升级版）：

1. 协议必须从 runtime **反向推导**（不能凭空设计，两家都有的才抽象）
2. TraceableEvent 确定**升格为应用总线**，让 replay 从单次 run 升级到全应用
3. 总线"日志式 vs 消息式"的 trade-off 要讨论（但方向已定）
4. 解耦的前提是**全局功能盘点**——包含未来功能（sandbox / 阅读器 / feed 多来源 / note 全套 / 全局 AI 助手 / 定时 agent / Telegram channel / 任务全流程打通 / sandbox 另一套执行环境）

**Assistant 的推进计划**（调整为六阶段）：

0. 全功能盘点（先做，奠定上帝视角）
1. Runtime 协议调研（从 claude/codex 反推）
2. 应用总线形态决策（日志式 vs 消息式 vs 混合）
3. Chat ↔ Runtime 协议定稿
4. 用未来功能压测架构
5. 现有代码迁移路径
6. 验收标准 + ADR 定稿

**Assistant 抛了 2 个问题**：推进顺序确认 + openclaw 怎么查。

---

## Round 4 — 用户确认顺序 + 给 openclaw 链接

**User 原话**：

> 六阶段顺序没问题，openclaw 是这个：https://github.com/openclaw/openclaw

**Assistant 行动**：
- 建立 todo list（7 项）
- 并行：扒 openclaw README + 读 ADR-009/011/013/008 + 看 events/bus.ts 现有实现 + 列 main 进程模块清单
- 建 thinking-trail 目录 + 写 README + 写本 conversation.md
- 进入阶段 0：全功能盘点

**关键发现（来自本轮调研）**：

### openclaw README 关键架构要点
1. Gateway = 单一控制面（sessions/channels/tools/events）
2. Channel 抽象：WhatsApp/Telegram/Slack/Discord/iMessage/macOS/iOS/Android 都是 channel
3. Multi-agent routing：入站 channel/account/peer 路由到不同 agent（workspaces + per-agent sessions）
4. Live Canvas + A2UI = agent 驱动的可视化工作区（与 Orbit ADR-005 Stage View 同构）
5. Nodes：iOS/Android/桌面都是 node，WebSocket pairing 接入
6. Session spawn/list/history/send 作为一等工具
7. Voice Wake / Talk Mode = 声音作为 channel
8. DM pairing + allowlist = 外部 channel 的安全默认

### TraceableEvent 现状
- 已有 `eventReplayBus` EventEmitter + `publishTraceableEvent` + NDJSON 存储
- Source 枚举成 4 类（activity/agent/inbox/ipc）
- 有 `traceId` / `spanId` / `parentSpanId` 骨架
- 但 **type 是 string**（无 schema 约束）、**subscribe 是单一 'event' 通道**（无 pattern 订阅）、**无 handler 契约**（只是 EventEmitter）
- → 升格为应用总线的基础已铺好 ~80%

### 项目现有 chat 实体（盘点）
1. `orchestration/conversation.ts` + `Tasks/TaskConversationTab.tsx` —— Task Conversation
2. `Timeline/TimelineCards.tsx` + Activity tab 渲染
3. `inbox/stage/StageView.tsx` + `HelpRequestRenderer.tsx` —— Inbox 内联 chat
4. `ProjectPlannerView` —— v1 Planner Chat（ADR-005 明确不重构）
5. `chat/approvalCardModel.ts` —— chat 原地审批卡片双通道
6. `Terminal/TerminalManager.tsx` + `agent/terminal_sessions.ts` —— Terminal Agent
7. `agent/claude_sessions.ts` / `agent/codex_sessions.ts` —— vendor session 管理
8. `agent/adapter/` —— Runtime adapter（Phase 3 的 UnifiedAgentEvent 底座）

---

## 后续轮次将追加到这里…


---

## Round 5 — 用户回答 §D 的 8 个功能细节问题（关键 pivot 3）

**User 原话**：

> 我认为 ask-anywhere 是一个随时待命的助手，他可以帮我在应用中做任何事情，应用内所有 chat 的对话不仅是 ask-anywhere，都应该在一个统一的页面能看到，ask-anywhere 也有多种形态，比如左侧栏会有一个一级入口，点击是全功能的页面，有对话列表，有 chat，有产物预览。另外在应用内还有个悬浮球，点击在右下角展开一个对话框和 chat。可以随时对话，是一个极简状态。至于怎么能展开成全屏，后面再讨论。完全可以操作 vault 内容，ask-anywhere 是一个深度助手，用户可以做的事情，他都可以做。权限可以先不限制，以后再说。
>
> 外部 channel 功能想做到和 openclaw 一样，双向通信，自建 gateway，独立于主进程之外。但 channel 对接的到底是哪一层的 agent 呢？现在 agent 有点多了，我怎么更合理的使用 channel 达到我想要做的事情？比如通过 channel 直接做某个项目，或者通过 channel 快速捕获想法，文章阅读链接，或者通过设置新定时任务等等日常会想做的任务。怎么做意图识别并路由到对应的应用能力。
>
> 定时任务跑完后进 inbox 通知，点击之后能看任务详情，实际上跟项目任务很像，只不过是定时任务，和项目不绑定，而是全局的，全局需要一个定时任务一级入口在左侧栏可以直接打开，展示现在所有的定时任务列表，点击定时任务，可以看到某个定时任务的执行列表，每条具体任务执行的成功失败情况，点击能看到任务的详情。
>
> 任务全流程打通的"卡点"，现在任务没有走 worktree、pr、merge，还没跑通过，我怎么跑通一次，直接就执行了。
>
> sandbox 是一个更轻量的做法，为了没有 git 的对话打造的，必须要做，但可以延后，现阶段可以裸跑任务也没关系。
>
> 笔记一定要有捕获、编辑、AI 能力、obsidian 格式兼容。
>
> Thought 是笔记的一种，笔记还有长文的形式。
>
> 未来可能做应用内的 runtime 指的是内置 agent 框架，不依赖外部的 cli，而是通过配置 LLM API key，或者用应用内置提供的 key 来执行任务。这样对普通用户比较友好，用户不一定有外部的 runtime。能力声明不做区分，目标是要做到比外部体验更好。但不是现阶段的任务，后面再做。
>
> 借鉴 openclaw 的 channel/gateway 思路即可，因为 orbit 也需要一个从手机上远程操作的入口才行。

**关键决策沉淀**（从这段话提取）：

### D1. Ask-Anywhere 定性
- 是 **"随时待命的深度助手"**，不是弱 AI 助手
- **统一对话中心**：应用内所有 chat（task / inbox / planner / ask-anywhere / 外部 channel 回显）都能在这一个页面看到
- **多形态同一内核**：
  - 左侧栏一级入口 → 全功能页面（对话列表 + chat + 产物预览）
  - 应用内悬浮球 → 右下角极简对话框
  - 未来支持展开成全屏（细节待定）
- **能力**：完全可以操作 vault 内容，用户能做的 AI 都能做
- **权限**：先不限制，以后再说

→ **Ask-Anywhere 本质上是"Chat 一等公民 + 全应用 AI 代理"的第一个产品化形态**

### D2. 外部 Channel 深度
- **双向通信**（入站 + 出站）
- **自建 Gateway，独立于主进程之外**——借鉴 openclaw
- **核心未决问题（用户提出）**：channel 对接的是哪一层 agent？现在 agent 有点多了，**如何合理使用 channel 完成日常意图**（做项目 / 捕获想法 / 保存阅读链接 / 设定时任务 / ...）？**需要意图识别并路由到应用能力**
- **动机**：从手机上远程操作 Orbit

→ **这是一个"Channel → Intent Router → Application Capabilities"的架构问题**，不是简单的消息桥接。几乎等同于把 Ask-Anywhere 的能力从桌面端延伸到外部 channel

### D3. 定时任务 Agent
- 定时任务跑完 → **进 Inbox 通知**，点击看任务详情
- **数据模型上和项目任务很像**，只是和项目解耦、全局
- **全局一级入口**：左侧栏直接打开 → 定时任务列表 → 某个定时任务 → 执行列表（每次的成功/失败）→ 执行详情
- **本质：定时任务是 Task 实体的一个"订阅版本"**

### D4. 任务全流程"卡点"
- 用户明确承认："**现在任务没有走 worktree、pr、merge，还没跑通过**"
- 这是 dog-food 里很关键的事实——之前以为功能已经"基本打通"，但实际上**完整 pipeline 从来没跑通过一次**
- 用户诉求："**我怎么跑通一次，直接就执行了**"

→ 本次讨论必须把"跑通一次 end-to-end"作为成功标准的一部分

### D5. Sandbox
- **必须要做**，但可以延后
- 是为**没有 git 的对话**打造的轻量做法
- 现阶段可以**裸跑任务**也没关系（不走 worktree 的兜底模式）

→ 启示：ExecutionContext 抽象要预留"裸跑"这个第三种形态（worktree / sandbox / bare）

### D6. 笔记野心
- 必须支持：**捕获 + 编辑 + AI 能力 + Obsidian 格式兼容**
- **Thought 是笔记的一种**（短笔记），还有**长文**形式
- 隐含：笔记不是独立新模块，是 Capture/Library/Thoughts 的**统一底层数据模型**，Thought 只是其中的类型

→ "Thought vs Note" 的模糊边界其实是：**Note 是统一 primitive，Thought / LongForm 是 type 字段**

### D7. 应用内 Runtime
- 指内置 agent 框架，**不依赖外部 CLI**
- 通过 LLM API key（用户填 or 应用内置）执行任务
- 动机：**对普通用户友好**——用户不一定有外部 runtime
- 能力声明**不做区分**（和外部 CLI runtime 同构）
- 目标：**比外部 CLI 体验更好**
- 时机：后面再做，不是现阶段

→ Runtime 抽象层要天然装下"内置 runtime"这一种实现，当前设计必须不能假设"runtime 总是外部进程"

### D8. 参考 openclaw 的深度
- **借鉴 channel/gateway 思路即可**
- 动机：Orbit 需要**从手机远程操作的入口**

→ Orbit 的 Gateway 是"手机远程操作的接入层"，不是"业务处理层"（这个边界划得很清楚）

---

## Assistant 本轮待推进事项

1. 把这段沉淀更新到 `00-feature-landscape.md`（补充 §D 答案对骨架的含义）
2. 识别两个**战略分叉点**必须先和用户对齐，再进阶段 1
3. 展开 Ask-Anywhere "Channel → Intent Router → Capabilities" 架构图的讨论
4. 答用户提出的"channel 对接哪层 agent / 意图识别路由"这个具体问题（这其实是整个 Gateway 架构的核心）

后续轮次继续追加…


---

## Round 6 — 用户做出 3 大战略分叉拍板（本次讨论的核心决策轮）

**User 原话**：

> 我认为应该这样，用户日常就应该大部分只和 ask-anywhere 聊天，来完成应用内的所有事情，比如我想做某个项目，想进行规划，那直接和 ask-anywhere 聊，就不需要 Planner agent 了，ask-anywhere 直接生成对项目的具体规划，落地到看板任务列表，然后项目内配置的 roles agent 会去自动认领任务。area 也是一样，其他的各种定时任务、review ui 都一样，全部从 ask-anywhere 来做，这样用户的认知负荷就收敛到 ask-anywhere 这一个地方。架构变成各个地方自己配置自己的 auto agent，ask-anywhere 负责做各种规划上的事情，这也符合用户是规划者，执行者是各个 roles 的设计。
>
> 这样 channel 也通了，只需要对接 ask-anywhere。
>
> Gateway 独立 Daemon，没必要做两套兼容，太复杂。
>
> Conversation 升格为一等公民。

### 核心决策（统一编号以便后续引用）

| 决策编号 | 决策内容 | 替代方案 |
|---------|---------|---------|
| **D-1** | Agent 层采用"规划者/执行者"二层：Ask-Anywhere 是用户的规划者代理，Role Agents 是执行者代理 | (拒绝) 扁平多 Agent + Intent Router |
| **D-2** | **Planner Agent 作为独立概念退役**，规划能力迁入 Ask-Anywhere | — |
| **D-3** | **Channel 只对接 Ask-Anywhere**，不做业务层路由 | (拒绝) Channel 直接路由到专业 Agent |
| **D-4** | Gateway 采用独立 Daemon 形态，无嵌入式 fallback | (拒绝) 方案 C 分层混合，用户嫌复杂 |
| **D-5** | **Conversation 升格为一等公民**，task/inbox/channel/ask-anywhere 都是 Conversation 的 anchor | — |
| **D-6** | "各地方自己配置自己的 auto agent"——业务模块自带 worker 逻辑 | (拒绝) 全局调度器 |
| **D-7** | 语义锁定："用户是规划者，执行者是各个 Roles"—— 映射到 Agent 层即 Ask-Anywhere vs Roles | — |

### 架构简化效应（从 D-1 ~ D-7 推导）

1. **Planner Agent 独立身份消失**（D-2）→ ADR-005 里的 Planner Chat 问题自然解决：Plan 产物（proposal canvas）只是 Ask-Anywhere 对话的 Stage View 产物之一
2. **Intent Router 不需要**（D-3）→ LLM（Ask-Anywhere 本体）就是最好的 Intent Router
3. **用户认知收敛到一点**（D-1 + D-3）→ "有事找 Ask-Anywhere" 是唯一心智
4. **业务模块解耦从目标变结果**（D-6）→ 每个业务自带 worker，彼此通过 CLI/event 通信
5. **Channel 对接问题消解**（D-3）→ Gateway 只需桥接到 Ask-Anywhere runtime，不需要理解业务
6. **Gateway 代码复杂度减半**（D-4）→ 只写 Daemon 路径，不维护嵌入式兼容
7. **统一对话中心有了数据基础**（D-5）→ 从"5 种对话混显"变成"1 种实体多种 anchor"的自然结果
8. **ADR-008 AI-Native + CLI-first 推到极致**（D-1 + D-6）→ orbit CLI 是 AI 的接口，Ask-Anywhere 是用户看见的唯一 AI

### 新挑战（后续阶段要处理）

1. **Ask-Anywhere Prompt / Context 膨胀风险**——需要 skills 分拆 + context retrieval + conversation compact
2. **Gateway Daemon 安装复杂度**——要设计良好的 `orbit daemon install` 体验
3. **既有 Planner 代码的命运**——是迁移还是保留冻结？（阶段 5 回答）
4. **如何确保 Ask-Anywhere 的规划质量不低于原 Planner Agent**——原 Planner 有精调 prompt，现在要把它作为 skill 装进 Ask-Anywhere

### 对既有 ADR / OQ 的影响

- **ADR-005**（Plan Chat = Stage View 实例）：**D-2 直接 supersede** 其中"Planner 作为独立实现"的结论。需要新 ADR 标记 ADR-005 的 partial supersede
- **OQ #13**（Stage View + Planner 重构）：**由 D-2 解决** —— Planner 不重构而是退役
- **ADR-008**（AI-Native + CLI-first）：**被 D-1/D-6 强化**，不冲突
- **ADR-011**（Runtime 抽象贯通）：**被 E8 扩展**——需要明确包含"内置 runtime"作为未来形态
- **ADR-004**（Inbox 枢纽）：**被 D-5/D-6 间接影响**——Inbox 里的内联 chat 在 D-5 下变成 Conversation with anchor=inbox.item

### 后续 Assistant 动作

1. 本轮 conversation 追加 ✅（本文件）
2. 更新 `00-feature-landscape.md`：把 D-1~D-7 反映到硬约束 §E
3. 新建 `decisions-anchor.md`：沉淀 7 个核心决策（让后续阶段 1-5 讨论时有锚点可引用）
4. 等用户回答分叉 4（任务全流程跑通优先级）
5. 回答后进入阶段 1：Claude/Codex Runtime 协议调研
