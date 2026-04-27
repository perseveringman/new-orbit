# Conversation History Archive

- **Session**: bf5891dd-d541-4e41-a43c-68a06b30bba8
- **Exported at**: 2026-04-27T11:34:08.279Z
- **Messages**: 47 (2026-04-27T09:24:25.836Z ~ 2026-04-27T11:31:13.540Z)
- **Rounds**: 6 user turns

---

## [User] 2026-04-27T09:24:25.836Z
Task 端到端我会自己去跑，现在我只想和你继续聊功能规划，task暂时搁置，因为AI正在实现，我想并行先聊别的
Ask-Anywhere的三要素确实很关键，vault context注入很有技巧，我认为应该先列出来，应用里究竟有哪些context，因为我要打造的是基于第二大脑CODE + PARA的理论，context是很重要的一件事情，现在project做了很多能力，但area，resource还差很多。skills分拆也很重要，还有是现在ask-anywhere也是基于一个runtime的，runtime本身就有compact。
定时任务比较清晰了，可以直接给方案文档。
笔记系统要好好聊聊，我认为你理解不太对，笔记系统重点在于笔记都是用户自己写的，所以只有捕获的笔记，和用户自己写的文章，以及voice log算是用户的输出。 libarary是用户待看的材料，feed也是信息流，不属于笔记，可以好好聊聊基于第二大脑CODE + PARA的理论下，笔记放在哪里，libarary和feed放在哪里，怎么和这个应用的系统联动，resource的定位是什么，怎么在系统里用起来，实现时间复利。
把 Gateway Daemon + Telegram Channel 和Ask-Anywhere 产物舞台 的实施计划都细化一下，让AI可以直接完整实现。
你为我预估的时间应该按照AI实现的时间来估计，我是不写代码的，全是AI干。我只负责规划和验证。

---

## [Assistant] 2026-04-27T09:25:58.119Z
收到，这段信息量很大且方向很清晰。我先用结构化方式把你抛出的 5 个主题和隐含的 **CODE + PARA 理论基础**消化一下，然后逐个展开。

先确认一个认知地基——因为你后面提到的很多话题都围绕这个理论旋转：

**CODE（Capture / Organize / Distill / Express）+ PARA（Projects / Areas / Resources / Archives）是 Tiago Forte 的 Building a Second Brain 核心方法论**。这个框架对你的意义是：
- Orbit 不是"Todo App + AI"，而是**第二大脑的执行层**
- 信息流入（Capture）→ 组织（PARA）→ 提炼（Distill）→ 表达（Express）是完整循环
- 你说的"时间复利"就是 Distill + Express 阶段反复使用已有积累带来的复利效应

我之前对笔记系统的判断确实有偏差——把"用户产出"和"用户消费的素材"混在一起了。这次我纠正过来。

---

## 今天议程（你提了 5 件事，我排一下讨论顺序）

1. **Vault Context 盘点**（你提的地基，先做）
2. **笔记系统在 CODE+PARA 框架下的定位**（纠偏 + 深聊，最烧脑）
3. **Area / Resource 能力补齐**（和 2 强相关）
4. **Skills 分拆**（Ask-Anywhere 配套）
5. **定时任务方案文档** + **Gateway+Telegram 实施计划** + **Ask-Anywhere Stage View 实施计划**（都是可直接给 AI 的）

先处理 1 和 2/3（它们相互咬合），然后 4，最后 5 批量输出实施计划。

---

## 1. Vault Context 全量盘点

Ask-Anywhere 每次对话需要"知道什么"？我按 CODE+PARA 维度穷举一遍，你来校对漏没漏：

### A. 身份层（用户自身）
- `user.profile` — 用户名、时区、偏好的 runtime、默认语言
- `user.working_hours` — 什么时候工作（用于定时任务 / 提醒推断）
- `user.active_focus` — 当下最关注什么（手动设置或从最近活动推断）

### B. PARA 层（核心组织结构）

| Context | 描述 | 现状 | 需要补 |
|---------|------|------|--------|
| `para.projects` | 所有项目列表，含状态/描述/roles/最近活动 | ✅ 有 | — |
| `para.areas` | 所有 area，含责任范围/评审周期/关联项目 | 🟡 基础有 | 需要补 area review、area health、area → projects 关系可视 |
| `para.resources` | 所有 resource，含主题/素材/笔记/链接 | 🔴 缺 | 几乎从零 |
| `para.archives` | 所有已归档实体 | 🔴 缺 | 几乎从零 |

### C. 活动层（时间维度）
- `activity.today` — 今天发生了什么（task 执行、Ask-Anywhere 对话、capture、定时任务）
- `activity.recent_7d` — 最近一周趋势
- `activity.pending` — 待处理的事（Inbox items / proposed tasks / 待审批 PR）

### D. 对话层（Conversation 历史）
- `conversation.recent` — 最近 N 轮 Ask-Anywhere 对话摘要（不是全文，避免爆 context）
- `conversation.anchored_to.<entity>` — 与当前实体有关的所有 conversation
- `conversation.thinking_trail` — 对某个议题的累积思考轨迹

### E. 产物层（CODE 的 E）
- `output.writings` — 用户写的长文 / 笔记
- `output.thoughts` — 用户的 thoughts 流
- `output.captures` — capture 的原始素材（用户捕获的）
- `output.voice_logs` — 语音日志
- **注意**：library/feed **不在此层**（按你的纠偏）

### F. 素材层（Library / Feed —— 待消化的外部输入）
- `input.library` — 用户待看 / 收藏的材料
- `input.feed` — 订阅的信息流
- `input.captured_but_unprocessed` — 捕获了但还没 distill 的

### G. 系统层
- `system.scheduled_tasks` — 所有定时任务及其最近执行
- `system.inbox` — Inbox 当前未处理项
- `system.skills` — Ask-Anywhere 可用的 skill 列表
- `system.runtimes` — 已配置的 runtime 列表

### H. 关系层（交叉索引）
- `relations.<entity>.backlinks` — 某实体被谁引用
- `relations.<entity>.forward_links` — 某实体引用谁
- `relations.<entity>.conversations` — 和某实体有关的对话

---

**Ask-Anywhere 实际用法**：不是每次都全量加载所有 context（那会爆），而是**按意图按需 retrieval**：

- 用户说"帮我规划项目 X" → 加载 `para.projects[X]` + `relations[X].backlinks` + `activity.pending` + `conversation.anchored_to[X]`
- 用户说"我最近在学什么" → 加载 `para.resources` + `input.captured_but_unprocessed` + `activity.recent_7d`
- 用户说"记下一个想法：..." → 加载 `user.active_focus` + `output.thoughts.recent`（用于判断 tag/project 归属）

**这个"意图 → context retrieval 策略"本身就需要一个 skill**，我们下面聊 skill 分拆时会回到这里。

---

## 2. 笔记系统在 CODE+PARA 下的定位（我重新思考）

你的纠偏让我意识到**我上次把概念搅成了一锅**。重新梳理一次：

### 2.1 正确的本体分类

**用户的产出（Output，CODE 里的 E）**：
- **Captures**：用户主动捕获的瞬间（想法、摘录、语录、截图批注）
- **Articles / LongForms**：用户自己写的长文（博客 / 研究 / 复盘）
- **Voice Logs**：用户的口述记录（可转文字，可直接存）
- **Thoughts**：短笔记流，是 Captures 的轻量形式

**用户的素材（Input，等待 Distill）**：
- **Library**：用户主动收藏的待看材料（文章、PDF、视频）
- **Feed**：订阅源的信息流（RSS / newsletter / YouTube channel）

**两者的本质差别**：Output 是用户的**思考结晶**，Library/Feed 是用户的**信息食材**。

### 2.2 我之前的错误

我说"Capture/Library/Thoughts 底层统一到 Note primitive"——**这是错的**。Capture/Thought 可以统一（都是用户产出），但 Library/Feed **不是笔记**，它们是**信息资源**，本体上属于 PARA 里的 **Resources** 或流入 Resources 的原料。

### 2.3 正确的数据模型（修订）

```
Output（用户产出）
├── Note （统一 primitive）
│   ├── type: 'thought'        — 短笔记
│   ├── type: 'longform'       — 长文
│   ├── type: 'capture'        — 捕获（有 source 字段指向原始来源）
│   └── type: 'voice_log'      — 语音（有 audio 字段）
│   共性：用户自己写的/说的；有 wikilink；有 tag；可以进 PARA；Obsidian 格式兼容

Input（素材库，外部来源）
├── LibraryItem（原 Library）
│   ├── kind: 'article' | 'pdf' | 'video' | 'url_bookmark'
│   ├── status: 'unread' | 'reading' | 'read' | 'distilled'
│   ├── annotations: Note[] （标注产生的 capture 笔记反向关联回来）
│   └── distilled_into: Note[] （提炼出的长文指回来）
└── FeedItem（原 Feed）
    ├── source: RSS/Newsletter/YouTube
    ├── status: 'new' | 'seen' | 'saved_to_library' | 'dismissed'
    └── 用户 save 后变成 LibraryItem
```

### 2.4 PARA 归属（核心问题）

这是你问的最关键的一个问题——**笔记 / Library / Feed 放在 PARA 哪一格**？

**Forte 的原则**：PARA 按"**可执行性 + 时间性**"分层：
- **Projects**：有明确目标 + 截止日期
- **Areas**：持续责任范围，无截止日期
- **Resources**：参考材料，主题聚合
- **Archives**：已完成 / 已失效的存档

**Orbit 的映射**：

| 实体 | PARA 归属 | 理由 |
|------|----------|------|
| `Note (thought/capture)` | **浮动**：新建时进 Inbox/Capture，由用户 distill 后归入 Project/Area/Resource/Archive | Capture 的本质是"还没归类"的瞬间 |
| `Note (longform)` | **主属 Project 或 Area**，可同时出现在 Resource | 长文通常为某个项目/关注面而写，但写完后可作为参考资源 |
| `Note (voice_log)` | 同 thought | 语音也是捕获 |
| `LibraryItem` | **主属 Resource**（按主题聚合）+ **可被 Project/Area 引用** | 素材天然是资源 |
| `FeedItem` | **不归属 PARA**，是流水 | 订阅流入 → 筛选后 save 成 LibraryItem 才进 PARA |
| `Project` | Projects | — |
| `Area` | Areas | — |
| `Task` | 依附 Project（主）或 Area | Task 不是独立 PARA 实体 |
| `Conversation` | 依附于某个 anchor（Task/Project/Area/Note...） | 对话是所有实体的"谈论" |

### 2.5 时间复利机制（核心野心）

你说的"时间复利"我理解为：**让同一份思考/素材在多个时间点被反复激活，每次激活都增值**。

CODE+PARA 框架里的复利机制有 4 层：

#### 第 1 层：Capture 复利
捕获过的东西不丢 → 任何时候 Ask-Anywhere 能搜到 → 每次被引用都强化

#### 第 2 层：Distill 复利（渐进式总结 · Progressive Summarization）
```
LibraryItem 原文（长）
  ↓ 第 1 次阅读：高亮
LibraryItem + 高亮段落
  ↓ 第 2 次重读：加粗关键句
LibraryItem + 高亮 + 加粗
  ↓ 第 3 次：写一段自己的总结 → 生成 Note
Note (distilled_from: LibraryItem)
  ↓ 用于项目时引用
Project 的参考资料
```

**Orbit 实现**：LibraryItem 的 `annotations` 字段积累高亮，每层 distill 生成一个 Note 并反向链。Ask-Anywhere 回答问题时**优先引用高层 distilled Note**，而不是原始长文——这是复利。

#### 第 3 层：Express 复利（创作时的回用）
写新长文时，Ask-Anywhere 能基于**过去所有 thought / distilled note / 相关 project conversation** 找出可复用的观点。**这就是第二大脑的核心价值**。

#### 第 4 层：Retrospective 复利（定时回顾）
- Weekly Review：看这周积累了什么（Area 维度）
- Monthly Review：主题提炼（Resource 生成新主题）
- Yearly Review：思维演化（对比一年前的同主题 thought）

**Orbit 实现**：定时任务 agent **自动生成这些 review**，进 Inbox。这就把"定时任务"和"笔记系统"和"Ask-Anywhere"完美咬合了。

### 2.6 Area / Resource 能力补齐

你说"area、resource 还差很多"，具体差什么：

**Area 差什么**：
1. **健康度（Health）**：这个 area 最近多久没更新？关联的 project 停滞了吗？
2. **周期评审（Review cadence）**：weekly/monthly 自动触发 review（和定时任务联动）
3. **责任边界（Commitments）**：这个 area 承诺了什么（比如"每周写一篇博客"）
4. **Area → Projects 的可视化**：一个 area 下的活跃/停滞/归档项目

**Resource 差什么（几乎从零）**：
1. **Resource 实体本身**：目前应该还没有独立的 Resource 类型
2. **主题聚合（Topic Cluster）**：围绕一个 resource 聚合 LibraryItem + Note + Feed 订阅
3. **引用追踪**：哪些 Project / Area 在使用这个 resource
4. **Resource 的 Ask-Anywhere skill**：让用户"给我调一下关于 XX 的所有素材"
5. **Distill 状态**：这个 resource 有多少素材还没被消化

**Archive 差什么**：
1. **归档实体**：project/area/note 归档后去哪
2. **搜索可达性**：归档的东西 Ask-Anywhere 还能搜到
3. **复活机制**：archive 能被 unarchive

---

## 3. Skill 分拆（纠正后的版本）

你说"Ask-Anywhere 也是基于一个 runtime 的，runtime 本身就有 compact"——**这句话非常对，我之前设计多余了**。

修正：Ask-Anywhere 直接依赖 runtime 的 compact（Claude Code 有 `/compact`，Codex 的 session rollout 有自己的机制）。**Orbit 不需要自己做 compact 层**，只需要暴露"触发 compact"的 ChatAction 给用户，runtime 自己处理。

ADR-014 里的 `runtime.compact` 事件保留，但 Orbit 是消费者不是生产者。

那真正需要的 Skill 分拆是什么？我按**意图维度**给 Ask-Anywhere 列 skill：

| Skill 名 | 激活场景 | 核心能力 |
|---------|---------|---------|
| `orbit-planning` | 用户提到"规划 / 拆任务 / 立项目 / 做计划" | 原 Planner 的精调 prompt；知道怎么拆 Project → Milestone → Task |
| `orbit-capture` | 用户说"记一下 / 捕获 / 想到" | 快速创建 Note (thought/capture)，自动判断归属 project/area |
| `orbit-distill` | 用户说"整理 / 总结 / 提炼" | 从 LibraryItem/Note 做渐进式总结 |
| `orbit-express` | 用户说"帮我写 / 起草" | 基于已有 Note 生成长文，引用来源 |
| `orbit-retrieve` | 用户问"我之前写过 / 看到过 / 讨论过" | 跨 Note/Conversation/Library 语义搜索 |
| `orbit-review` | 用户说"周报 / 月报 / review" | 按 Area 生成时段回顾 |
| `orbit-triage` | 用户说"Inbox / 待办 / 有什么要做的" | 分析 Inbox + proposed tasks 给出优先建议 |
| `orbit-scheduling` | 用户说"每天 / 定时 / 提醒" | 创建 scheduled task |

每个 skill 只加载自己需要的 context subset（不是全量），这是控制 context 膨胀的关键。

**Skill 选择机制**：用户输入 → 轻量 LLM 判断意图 → 激活 1~3 个 skill → 加载对应 context → 组装 system prompt → 交给 Ask-Anywhere runtime 执行。

---

## 4. 先停一下，跟你对齐

在我开始输出 3 份实施计划文档（定时任务 / Gateway+Telegram / Stage View）前，想确认上面 2.1~2.5 的重新理解是对的。

### Tool Calls:
- **ask_followup_question**({"title":"笔记系统 & CODE+PARA 理解确认","questions":[{"id":"note_model","prompt":"笔记/Library/Feed 的分类模型（§2.3）我理解对了吗？","options":[{"id":"correct","label":"A. 理解对了，Note 统一用户产出，Library/Feed 独立为素材层"},{"id":"partly","label":"B. 大方向对，但某些细节不对（我下一条消息说清楚）"},{"id":"wrong","label":"C. 仍有偏差，重新整理"}]},{"id":"para_mapping","prompt":"PARA 归属表（§2.4）和时间复利 4 层机制（§2.5）你认为？","options":[{"id":"aligned","label":"A. 方向对，可以基于此写实施文档"},{"id":"adjust","label":"B. 还要调整（下一条说）"},{"id":"need_more","label":"C. 还要再深入聊一轮再定"}]},{"id":"skill_split","prompt":"Skill 分拆（§3）列的 8 个 skill？","options":[{"id":"good","label":"A. 可以作为初始版本，细节后续在实施中调"},{"id":"need_tweak","label":"B. 有幾个不对，我改改"},{"id":"too_many","label":"C. 太多了，合并"},{"id":"too_few","label":"D. 缺些关键 skill，我补充"}]},{"id":"next_batch","prompt":"接下来执行文档批量输出的顺序：","options":[{"id":"all_parallel","label":"A. 三份一起下（定时任务 + Gateway + Stage View）"},{"id":"by_priority","label":"B. 按优先级：定时任务 → Stage View → Gateway"},{"id":"note_first","label":"C. 先输出笔记系统 + PARA 扩展的方案文档（最大的东西），其他 3 份放后面"}]}],"toolExplanation":"对齐笔记系统理解和输出节奏"})

---

## [Tool] 2026-04-27T09:25:58.137Z
{"pending":true,"questions":[{"id":"note_model","prompt":"笔记/Library/Feed 的分类模型（§2.3）我理解对了吗？","options":[{"id":"correct","label":"A. 理解对了，Note 统一用户产出，Library/Feed 独立为素材层"},{"id":"partly","label":"B. 大方向对，但某些细节不对（我下一条消息说清楚）"},{"id":"wrong","label":"C. 仍有偏差，重新整理"}]},{"id":"para_mapping","prompt":"PARA 归属表（§2.4）和时间复利 4 层机制（§2.5）你认为？","options":[{"id":"aligned","label":"A. 方向对，可以基于此写实施文档"},{"id":"adjust","label":"B. 还要调整（下一条说）"},{"id":"need_more","label":"C. 还要再深入聊一轮再定"}]},{"id":"skill_split","prompt":"Skill 分拆（§3）列的 8 个 skill？","options":[{"id":"good","label":"A. 可以作为初始版本，细节后续在实施中调"},{"id":"need_tweak","label":"B. 有幾个不对，我改改"},{"id":"too_many","label":"C. 太多了，合并"},{"id":"too_few","label":"D. 缺些关键 skill，我补充"}]},{"id":"next_batch","prompt":"接下来执行文档批量输出的顺序：","options":[{"id":"all_parallel","label":"A. 三份一起下（定时任务 + Gateway + Stage View）"},{"id":"by_priority","label":"B. 按优先级：定时任务 → Stage View → Gateway"},{"id":"note_first","label":"C. 先输出笔记系统 + PARA 扩展的方案文档（最大的东西），其他 3 份放后面"}]}],"title":"笔记系统 & CODE+PARA 理解确认"}

---

## [Assistant] 2026-04-27T09:26:09.974Z
等你对齐这 4 个问题后我再动笔。

---

## 关于时间估算的修正

你说得对，我之前按人日估是错的。AI 实现节奏和人不一样，重新估：

| 任务 | AI 实施（一次性）| 你的验证时间 |
|------|----------------|------------|
| 定时任务完整 UI | 1~2 轮对话（半天～1 天） | 1~2 小时操作验证 |
| Gateway + Telegram | 3~5 轮对话（1~2 天，主要在调试 WebSocket/Telegram Bot 注册） | 手机端联调 1~2 小时 |
| Ask-Anywhere Stage View | 2~3 轮对话（1 天） | 0.5~1 小时 |
| 笔记系统 + PARA 扩展 | 5~8 轮对话（2~3 天，数据模型改动大） | 2~3 小时深度验证 |

**你的真实约束不是 AI 写代码的时间，而是 2 件事**：
1. 你回答问题 / 拍板 / review 的时间
2. 每个功能完成后你的手动验证时间（跑一下、用一下、看数据对不对）

所以**实施文档的质量 > 速度**——写得越清晰、越完备、AI 越不回头问，你的节省越大。我后续输出实施计划会特别注意这一点：

- 把所有数据模型明确到字段
- 把所有 IPC channel / CLI 命令明确到签名
- 把 edge case 和回滚方案写在文档里
- 把验证步骤明确到可 copy 的命令

---

等你拍这 4 个问题。

---

## [User] 2026-04-27T10:25:22.089Z
note 统一由用户产出， library和feed为素材。 
对于note我认为应该有一个独立的页面来让用户查看和编辑note，不应该把note散落在各地，应该集中存储。且兼容obsidian格式，有双链，这个目录甚至可以在obsidian打开查看和编辑。
还有一个问题是，用户第一次使用应用的时候，希望了解用户，从他的存量笔记了解是最好的，用户如果提供存量笔记，应该放在哪里？和应用的笔记系统是否要先隔离？
skills可以先列在这里，后面单独找一个阶段做展开


---

## [Assistant] 2026-04-27T10:31:01.469Z
非常重要的两个澄清——尤其是"存量笔记导入"这一点，直接决定了数据架构的边界。我按你补充的信息往下走。

---

## 一、Note 统一管理的含义（基于你的补充）

你的要求解开后有 3 层：

### 层 1：物理上集中存储
Note 不能"散落在各处业务代码里"（比如 task 的附属、capture 的附属、thought view 的附属）。必须有一个**统一目录**：

```
<vault>/notes/
  daily/2026-04-29.md
  thoughts/<id>.md
  longforms/<slug>.md
  captures/<id>.md
  voice_logs/<id>.md
  # 可以完全平铺，靠 frontmatter 的 type 区分；也可以按 type 分子目录
```

**这个目录要能直接用 Obsidian 打开**——意味着：
- 所有文件是 `.md`，不是自定义格式
- frontmatter 走 YAML
- 链接用 `[[wikilink]]` 语法
- 不要用数据库索引代替文件（可以有索引作为 cache，但真相源是 md 文件）

### 层 2：逻辑上一个一级入口

左侧栏需要一个 **Notes** 一级入口（和 Projects / Areas / Ask-Anywhere / Inbox 并列）。点击进去是：
- 全局笔记浏览（按 type 过滤 / 按 PARA 归属过滤 / 按标签过滤）
- 创建 / 编辑 / 删除
- 双链图谱视图（可选，后期做）
- 搜索

### 层 3：编辑能力的双轨
Orbit 内的编辑器和 Obsidian 的编辑**同时存在，同时可用，互不冲突**。这对实现有一个硬约束：

- 写入时只写 md 文件（不要维护"内存副本"作为真相源）
- 要有文件系统 watcher，Obsidian 在外部改动后 Orbit 能感知
- 冲突处理简单化：**文件系统 win**（Orbit 内存状态以磁盘为准）

这是一个很 Obsidian 式的架构（Obsidian 本身就是"文件夹 over markdown"），我个人非常支持。

---

## 二、存量笔记导入 —— 你提的关键问题

你抛出的问题是：
> 用户第一次使用应用的时候，希望了解用户，从他的存量笔记了解是最好的，用户如果提供存量笔记，应该放在哪里？和应用的笔记系统是否要先隔离？

这是一个非常深的架构决策点。我看到 3 种可能路径，优劣差异很大：

### 路径 A：直接合并（存量笔记直接成为 Orbit 笔记）

用户导入的存量笔记**直接写入 `<vault>/notes/` 目录**，和 Orbit 新建的笔记平起平坐。

**优点**：
- 简单，没有"两套笔记"概念
- Ask-Anywhere 天然能操作（搜索、引用、distill）
- 用户已有的 Obsidian vault 可以直接当 Orbit vault 用

**缺点**：
- 可能破坏用户原有结构（比如用户在 Obsidian 里有复杂的目录组织）
- Orbit 的 frontmatter schema 可能污染用户笔记
- 如果用户后来想"退出 Orbit"，需要清理 Orbit 写入的元数据

**风险点**：用户可能有几千篇笔记，你的 frontmatter / PARA 归属元信息批量写入可能不可逆

### 路径 B：完全隔离（存量笔记只读导入）

存量笔记放在专门的 `<vault>/imported-knowledge/` 目录下，**只读**。Orbit 能索引、能搜索、能引用，但**不修改**。用户新产生的笔记写到 `<vault>/notes/`。

**优点**：
- 用户数据安全，原始结构不被污染
- 清晰的边界："这是我过去的积累 vs 这是我用 Orbit 新产的"
- 退出 Orbit 时存量笔记完全不受影响

**缺点**：
- 两套结构，用户会疑惑"一个笔记我应该放哪边"
- Orbit 的 PARA 归属机制不能作用于存量笔记
- "时间复利"的效果打折——过去的思考没法被 distill 层层提炼

**风险点**：存量区变成死水区，新笔记变成孤岛

### 路径 C：分层引用（我倾向的方案 —— "Knowledge Base" 概念）

这是我看了你需求后构思的第三种，借鉴了 Apple Photos 的 **"Library"** + **"Imports"** 模式，也借鉴了 Roam/Logseq 的 **"Source"** 概念。

#### 核心思想
- `<vault>/notes/` 是 Orbit 的**活跃工作区**，用户和 Orbit 共同在这里产出
- `<vault>/knowledge-base/` 是用户的**存量知识库**（可多个，每个是独立文件夹）
- 存量可以是**只读**也可以是**读写**，由用户导入时选择
- Ask-Anywhere 把两者都作为 context 来源
- 用户可以"**激活**"某篇存量笔记到活跃区（触发一次 copy-or-link 操作，元信息写到活跃区的新 Note，原文在存量区保留引用）

#### 目录结构

```
<vault>/
├── notes/                        # 活跃工作区（Orbit 产生 + 用户产生）
│   ├── thoughts/
│   ├── longforms/
│   ├── captures/
│   └── daily/
├── knowledge-base/               # 存量知识区
│   ├── obsidian-vault-2023/      # 用户导入的一个 Obsidian vault
│   │   └── ... (用户原有结构)
│   ├── work-notes-export/        # 另一个来源
│   └── .orbit-kb-meta/           # Orbit 给 kb 加的元信息（不污染原文）
│       ├── index.json            # 向量索引 / 全文索引
│       └── annotations/          # Orbit 对这些笔记的标注（反向链，不写到原文件）
├── library/                      # Library 素材层
├── feeds/                        # Feed 订阅层
└── .orbit/                       # Orbit 系统目录
```

#### "激活"机制（时间复利的关键）

当用户（或 Ask-Anywhere）在存量笔记里发现一个有价值的段落：

1. 用户选中段落 → "激活到工作区"
2. Orbit 在 `notes/thoughts/<id>.md` 创建一个新 Note
3. 新 Note 的 frontmatter 里写：
   ```yaml
   sourced_from:
     kb: obsidian-vault-2023
     path: "subfolder/original.md"
     excerpt: "原始段落..."
   ```
4. 原文件**不改动**
5. 这个新 thought 进入 PARA 归属、被 distill、被引用、被 Ask-Anywhere 利用

→ **这就实现了你说的"从存量笔记了解用户"的"复利激活"路径**：不是一次性倾倒，而是按需激活。

#### Ask-Anywhere 的三级 context

- L1：`notes/` 活跃区 —— 实时、双向、权威
- L2：`knowledge-base/*/` 存量区 —— 只读 / 手动读写、Ask-Anywhere 用作 context retrieval 的向量检索源
- L3：`library/`、`feeds/` 素材区 —— 外部素材

Ask-Anywhere 回答问题时可以引用 L2 的内容，并主动建议"要不要把这段激活到工作区"。

#### 用户初次使用的流程

第一次打开 Orbit：
1. 提问："你有存量笔记想导入吗？"
2. 如果有 → 选择文件夹 → 导入到 `knowledge-base/<name>/`（选择只读 / 读写）
3. Orbit 后台索引（用一个新的定时任务/初始化任务做向量化）
4. Ask-Anywhere 可以立刻做一次"**欢迎分析**"：读存量笔记 → 理解用户在关注什么 → 提取出可能的 Areas / Resources → 建议 PARA 初始化

→ **这个"欢迎分析"本身就是一个 skill**，值得单独做。

---

## 三、我对 3 条路径的推荐

**强烈推荐路径 C**，理由：

| 标准 | 路径 A | 路径 B | 路径 C |
|------|-------|-------|-------|
| 数据安全 | ⚠️ 会污染 | ✅ 绝对安全 | ✅ 默认安全（只读），可选读写 |
| 退出成本 | ❌ 元信息回不去 | ✅ 零成本 | ✅ 零成本（存量区独立） |
| 时间复利 | ✅ 直接 | ❌ 存量死水 | ✅ 通过"激活"实现按需复利 |
| 用户心智 | ⚠️ 混乱 | ⚠️ 双套混乱 | ✅ 清晰：活跃 vs 存量 |
| Obsidian 兼容 | ✅ 但可能冲突 | ✅ 两边都兼容 | ✅ 两边都兼容，边界清晰 |
| 欢迎分析 | ✅ 全量扫描 | ✅ 全量扫描 | ✅ 全量扫描 + 激活机制 |
| 长期扩展 | 🟡 | 🟡 | ✅ 未来可支持多 KB 并存（工作笔记/学习笔记/...） |

唯一的代价：多一个目录层级，多一个"激活"动作。但这个多出来的动作其实是**优点**——它是一个"**慎重提取**"的仪式感，符合 Distill 的哲学。

---

## 四、修订后的笔记 + PARA 总图

```
┌─────────────────────────────────────────────────────────────────┐
│ Vault                                                            │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Output（产出）     │  │ Input（素材）      │  │ Organization│  │
│  │                  │  │                  │  │             │  │
│  │ notes/           │  │ library/         │  │ projects/   │  │
│  │   thoughts/      │  │   articles/      │  │ areas/      │  │
│  │   longforms/     │  │   pdfs/          │  │ resources/  │  │
│  │   captures/      │  │   videos/        │  │ archives/   │  │
│  │   daily/         │  │   bookmarks/     │  │             │  │
│  │   voice_logs/    │  │                  │  │             │  │
│  │                  │  │ feeds/           │  │             │  │
│  │                  │  │   <source>/      │  │             │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Knowledge Base（存量知识区，多个独立 KB）                   │   │
│  │                                                          │   │
│  │ knowledge-base/                                          │   │
│  │   <kb-name>/         # 用户原始结构，Orbit 只读 or 可写    │   │
│  │     ... 用户原有组织 ...                                   │   │
│  │                                                          │   │
│  │ .orbit-kb-meta/      # Orbit 的 index / annotation       │   │
│  │   index.json                                             │   │
│  │   annotations/                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  .orbit/            # 系统目录（conversations / events / ...）    │
└─────────────────────────────────────────────────────────────────┘
```

**关键关系**：
- Output 的 Note 可以 **sourced_from** 一个 KB 笔记（引用关系）
- Library/Feed 可以 **distilled_into** Output 的 Note（提炼关系）
- Output / Library / KB 都可以 **attached_to** Project / Area / Resource（归属关系）
- Archives 里可以存放归档的任意实体

---

## 五、Skill 清单（按你意思冻结，不展开）

记录如下，后续单独讨论：

1. `orbit-planning` — 规划
2. `orbit-capture` — 捕获
3. `orbit-distill` — 提炼
4. `orbit-express` — 创作
5. `orbit-retrieve` — 检索
6. `orbit-review` — 回顾
7. `orbit-triage` — 分流
8. `orbit-scheduling` — 定时
9. `orbit-welcome-analysis` — **新增：首次导入存量笔记后的欢迎分析**
10. `orbit-activate-from-kb` — **新增：从 KB 激活一段到工作区**

（9/10 是这轮讨论新识别的，先记下）

---

## 六、需要你拍板的点

先把笔记系统的核心决策敲死，才能进实施文档：

### Tool Calls:
- **ask_followup_question**({"title":"笔记系统核心决策","questions":[{"id":"kb_path","prompt":"存量笔记的存放方式","options":[{"id":"path_a","label":"A. 直接合并到 notes/（最简单，但有污染风险）"},{"id":"path_b","label":"B. 完全隔离，Orbit 只读"},{"id":"path_c","label":"C（我强烈推荐）：knowledge-base/ 存量区 + notes/ 活跃区，通过“激活”连接，债用多 KB"},{"id":"path_d","label":"D. 其他 —— 我说"}]},{"id":"kb_rw","prompt":"KB 导入时的默认权限","options":[{"id":"readonly","label":"A. 默认只读，用户可升级为可写"},{"id":"readwrite","label":"B. 默认可读写（Orbit 可以添加 frontmatter）"},{"id":"ask_each_time","label":"C. 每次导入时让用户选"}]},{"id":"notes_org","prompt":"notes/ 目录下的组织方式","options":[{"id":"by_type","label":"A. 按 type 分子目录（thoughts/longforms/captures/daily/voice_logs）"},{"id":"flat","label":"B. 扇平一层，靠 frontmatter.type 区分"},{"id":"by_date","label":"C. 按日期（daily notebook 模式）"},{"id":"user_choose","label":"D. 用户在初始化时选"}]},{"id":"notes_page","prompt":"Notes 一级入口页面的重点","options":[{"id":"minimal","label":"A. 最小可用：列表 + 简单编辑 + 搜索，MVP 优先"},{"id":"obsidian_like","label":"B. Obsidian 类型：召连预览 + 图谱 + tag 视图，功能完备"},{"id":"minimal_then_grow","label":"C（我倾向）：MVP 简单先用，相信用户会用 Obsidian 做复杂编辑"}]},{"id":"welcome_analysis","prompt":"“欢迎分析”（导入 KB 后 Ask-Anywhere 分析用户兴趣并初始化 PARA）","options":[{"id":"mvp_include","label":"A. 要做，是用户第一个 WOW 时刻"},{"id":"optional","label":"B. 做但作为可选（用户需要主动触发）"},{"id":"later","label":"C. 后期再做"}]},{"id":"next_docs","prompt":"下一步我输出的实施文档","options":[{"id":"notes_first","label":"A. 先写“笔记系统 + PARA 扩展 + KB 导入”完整方案（最大的一份，其他 3 份后做）"},{"id":"all_at_once","label":"B. 四份都写（笔记 + 定时任务 + Gateway + Stage View）"},{"id":"by_priority","label":"C. 按优先级：笔记 → 定时任务 → Stage View → Gateway"}]}],"toolExplanation":"拍板笔记系统核心决策并确定实施文档顺序"})

---

## [Tool] 2026-04-27T10:31:01.480Z
{"pending":true,"questions":[{"id":"kb_path","prompt":"存量笔记的存放方式","options":[{"id":"path_a","label":"A. 直接合并到 notes/（最简单，但有污染风险）"},{"id":"path_b","label":"B. 完全隔离，Orbit 只读"},{"id":"path_c","label":"C（我强烈推荐）：knowledge-base/ 存量区 + notes/ 活跃区，通过“激活”连接，债用多 KB"},{"id":"path_d","label":"D. 其他 —— 我说"}]},{"id":"kb_rw","prompt":"KB 导入时的默认权限","options":[{"id":"readonly","label":"A. 默认只读，用户可升级为可写"},{"id":"readwrite","label":"B. 默认可读写（Orbit 可以添加 frontmatter）"},{"id":"ask_each_time","label":"C. 每次导入时让用户选"}]},{"id":"notes_org","prompt":"notes/ 目录下的组织方式","options":[{"id":"by_type","label":"A. 按 type 分子目录（thoughts/longforms/captures/daily/voice_logs）"},{"id":"flat","label":"B. 扇平一层，靠 frontmatter.type 区分"},{"id":"by_date","label":"C. 按日期（daily notebook 模式）"},{"id":"user_choose","label":"D. 用户在初始化时选"}]},{"id":"notes_page","prompt":"Notes 一级入口页面的重点","options":[{"id":"minimal","label":"A. 最小可用：列表 + 简单编辑 + 搜索，MVP 优先"},{"id":"obsidian_like","label":"B. Obsidian 类型：召连预览 + 图谱 + tag 视图，功能完备"},{"id":"minimal_then_grow","label":"C（我倾向）：MVP 简单先用，相信用户会用 Obsidian 做复杂编辑"}]},{"id":"welcome_analysis","prompt":"“欢迎分析”（导入 KB 后 Ask-Anywhere 分析用户兴趣并初始化 PARA）","options":[{"id":"mvp_include","label":"A. 要做，是用户第一个 WOW 时刻"},{"id":"optional","label":"B. 做但作为可选（用户需要主动触发）"},{"id":"later","label":"C. 后期再做"}]},{"id":"next_docs","prompt":"下一步我输出的实施文档","options":[{"id":"notes_first","label":"A. 先写“笔记系统 + PARA 扩展 + KB 导入”完整方案（最大的一份，其他 3 份后做）"},{"id":"all_at_once","label":"B. 四份都写（笔记 + 定时任务 + Gateway + Stage View）"},{"id":"by_priority","label":"C. 按优先级：笔记 → 定时任务 → Stage View → Gateway"}]}],"title":"笔记系统核心决策"}

---

## [Assistant] 2026-04-27T10:31:14.193Z
等你拍板。

---

## 在你回答前，我额外想确认两件事，顺便让你思考

### 额外思考 1：Daily Note 这个概念要不要有？

Obsidian 核心习惯之一是每天一个 `YYYY-MM-DD.md` daily note，聚合当天的 thoughts / log / 会议记录 / 随想。

Orbit 是否要有这个？我倾向**要有**，理由：
- 它是 thought 的天然容器（用户"记一下..."默认进今天的 daily）
- 定时任务的 review 可以写进今天的 daily
- Ask-Anywhere 每天可以做一次"今天总结"进 daily
- 和 Obsidian 用户的习惯无缝

但这不影响你上面的决策，只是影响 `notes/daily/` 这个子目录要不要预留。

### 额外思考 2：Resource 是 PARA 里的独立实体还是 Tag？

Forte 原始 PARA 里，Resource 是和 Project/Area 并列的目录。但实现上有两种做法：
- **目录式**：`resources/<topic>/`，里面放该主题的所有 LibraryItem 和 Note
- **Tag 式**：所有 Note/Library 都打 `#resource/<topic>` tag，通过 tag 聚合

**我倾向目录式**（文件系统直观、Obsidian 里可见、和 Project/Area 对称）。但 tag 式对现有 Obsidian 重度用户更友好。

这个可以放到实施文档里细化，先不急。

---

等你拍这 6 个问题。

---

## [User] 2026-04-27T10:34:50.767Z
我认为路径 C 非常棒
导入时默认权限可读写。
按type分子目录
notes的页面先按最小可用，保留向丰富功能扩展的可能性，记录在计划中
欢迎分析要做，且要和愿景的初始化放在一起作为初始化流程之一。


---

## [User] 2026-04-27T10:40:56.684Z
我认为路径 C 非常棒
导入时默认权限可读写。
按type分子目录
notes的页面先按最小可用，保留向丰富功能扩展的可能性，记录在计划中
欢迎分析要做，且要和愿景的初始化放在一起作为初始化流程之一。
四份都写
daily note 不要，对于orbit来说，有一个更宏伟的规划，daily是一个时间轴，应用中的所有操作会有一个daily的展示，包括所有的能力调用，这里需要帮我详细设计，我举几个例子，quick capture写了一个笔记，收集了一篇网站文章，增加了一个feed订阅，完成了一个项目的某个任务，等等，我进入这个页面，就能看到我每天做的事情，写的note融入其中，日积月累，这本日记就是我的一生。这个设计是我做orbit很重要的原因之一，我想把我的人生记录下来。
resource接下来也详细讨论一下，我没想太清楚，你调研下tiago forte的para，结合orbit的愿景规划，resource未来会有什么内容？应该在应用中如何流转

---

## [Assistant] 2026-04-27T10:44:22.075Z
这两个话题都值得好好聊——**Daily Timeline** 是你做 Orbit 的一个核心动因（我认真对待），**Resource 流转**是 CODE+PARA 里最被误解的一环。我先聊这两个，然后再出四份实施文档。

---

# 一、Daily Timeline —— "人生日记"设计

## 1.1 你表达出的野心（我的理解）

> "这本日记就是我的一生"

这不是一个普通的 feature。你在说的其实是：**让 Orbit 成为你人生的 event sourcing**——所有你在数字生活中做的事都流成一条时间河，未来回看任何一天都能还原当时的"存在状态"。

类比：
- **Day One 日记 App**：手写记录，人工驱动
- **Rewind.ai / Memex**：全自动记录屏幕，机器驱动
- **Orbit Daily Timeline**：**系统操作 + 产物 + 对话**的语义聚合，自主 AI 帮你整理

**价值密度**比 Day One 高（不用手写），**隐私控制**比 Rewind 好（本地 vault、语义粒度可控）。

## 1.2 架构复用（关键发现）

这件事 Orbit 现有架构**完美支持**——你已经有 `TraceableEvent`。Daily Timeline **本质上就是 TraceableEvent 的 UI 视图**：

```
TraceableEvent 早就存在          Daily Timeline 是视图层
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
agent.run.started           →   "11:23 你开始执行任务 'xxx'"
task.completed              →   "11:47 任务 'xxx' 完成"
conversation.started        →   "12:15 和 Ask-Anywhere 开始对话 'yyy'"
note.created(type=capture)  →   "14:02 捕获想法：'zzz'"
library.item.added          →   "15:10 收藏文章：'www'"
feed.subscription.added     →   "15:12 订阅了 ..."
inbox.item.resolved         →   "16:30 处理了 inbox..."
```

你不需要新建一张表，只需要：
1. 在阶段 2 `02-app-bus-design.md` 的 event kind 基础上**扩展一批 "life event" kind**
2. 设计一个 `DailyTimelineView` 来 consume 这些事件
3. 事件上附带"**渲染 hint**"（icon + summary + 可选的产物预览）

这是**免费架构**。

## 1.3 事件分层（Timeline 的语义粒度）

不是所有 TraceableEvent 都该上时间轴。我按**用户感知度**分三层：

### Layer 1：User-Visible（时间轴默认显示）
这些是**用户会说"我今天做了..."**的事：

| 事件 | 渲染示例 |
|------|---------|
| `note.created (thought)` | 💭 11:23 捕获想法："XX 项目可能应该..." |
| `note.created (longform)` | ✍️ 15:00 开始写长文《YYY》 |
| `note.updated (longform, +N words)` | ✍️ 15:40 长文《YYY》新增 423 字 |
| `library.item.added` | 📚 10:15 收藏《CODE+PARA 实践指南》 |
| `library.item.read` | 📖 16:30 读完《...》|
| `library.item.annotated` | 🖍️ 16:45 标注了 3 处 |
| `feed.subscription.added` | 📡 09:10 订阅了 Tiago Forte 的 newsletter |
| `feed.item.saved_to_library` | 📌 09:30 从 feed 收藏了一篇 |
| `project.created` | 🎯 14:00 立项《XXX》 |
| `project.completed` | 🏆 18:00 完成项目《XXX》 |
| `task.completed` | ✅ 17:20 完成任务 "修复 chat bug" |
| `area.review.completed` | 🔄 20:00 完成 Area 周评审 |
| `conversation.meaningful` | 💬 13:00 和 Ask-Anywhere 讨论了 XX（+产物链接） |
| `voice_log.recorded` | 🎤 19:00 录了 5 分钟语音日志 |
| `vision.milestone.reached` | 🌟 完成了愿景里程碑 XX |

### Layer 2：Developer-Visible（默认折叠，可展开）
工程调试用的：
- `agent.run.started / done` 的详细事件
- `tool_use / tool_result` 序列
- IPC trace

这些**也存在时间轴上**，但默认 collapse。展开后给工程师看。

### Layer 3：System-Noise（不上时间轴）
- `heartbeat`
- `cost` 事件（除非达到阈值）
- 自动扫描事件

## 1.4 时间轴的**视觉设计**（重点）

你说"日积月累，这本日记就是我的一生"——这意味着**视觉上它要美、要耐看、要可打印**。不是 log viewer。

我建议的形态：

```
┌────────────────────────────────────────────────────────────────┐
│ [← 2026-04-28]  2026-04-29 周三  [2026-04-30 →]  [日/周/月/年]  │
│                                                                 │
│  ╭──────────────────────────────────────────────────────────╮  │
│  │  📊 今日一瞥                                              │  │
│  │  · 3 个项目有进展   · 7 个 thoughts   · 2 篇文章已读        │  │
│  │  · 完成 4 个任务    · 1 次深度对话    · 0 个长文产出         │  │
│  ╰──────────────────────────────────────────────────────────╯  │
│                                                                 │
│  ── 早晨 ──                                                     │
│   09:10  📡  订阅了 Tiago Forte 的 newsletter                    │
│   09:30  📌  从 feed 收藏《Building a Second Brain 2025》        │
│   10:15  📚  打开阅读                                            │
│   10:42  💭  "渐进式总结对定时任务设计很有启发"                    │
│         ↳ 来自阅读《Building a Second Brain 2025》               │
│                                                                 │
│  ── 上午 ──                                                     │
│   11:23  🎯  立项《orbit-resource-system》                       │
│   11:47  💬  和 Ask-Anywhere 讨论 Resource 设计（45 min）        │
│         ↳ 产出：ADR-016 草稿                                     │
│                                                                 │
│  ── 下午 ──                                                     │
│   14:00  ✍️   开始写长文《第二大脑在工具里的实现》                 │
│   15:40  ✍️   长文新增 1,240 字                                  │
│   16:30  ✅  完成任务 "Stage View 原型"                          │
│                                                                 │
│  ── 夜晚 ──                                                     │
│   19:30  🎤  语音日志 8 min："今天想明白了 Resource 不是静态素材  │
│               而是动态主题，明天和团队同步..."                      │
│   20:15  📖  读完《...》                                          │
│   21:00  🔄  完成 Area "工程 team lead" 的周评审                  │
│                                                                 │
│  ╭──────────────────────────────────────────────────────────╮  │
│  │  🌙 今日总结（Ask-Anywhere 自动生成，21:45）                │  │
│  │  主线："Resource 系统设计" 贯穿全天，从收藏到立项到讨论        │  │
│  │  到长文创作，形成完整的 Distill→Express 闭环。              │  │
│  │  这是很典型的"深度工作日"。                                  │  │
│  │                                                           │  │
│  │  [展开完整总结]  [编辑]  [发到邮箱]                          │  │
│  ╰──────────────────────────────────────────────────────────╯  │
└────────────────────────────────────────────────────────────────┘
```

### 设计要点
1. **时段分组**（早晨/上午/下午/夜晚）而不是单调的时间戳——符合人的记忆方式
2. **事件之间有语义关联线**（"↳"）——展示事件之间的因果/承接
3. **"今日一瞥"** 顶部卡片——给人整体感
4. **"今日总结"** 底部卡片——Ask-Anywhere 自动生成，这就是 daily note 的语义版本（你不想要"手写 daily note"，但你想要"AI 帮我总结的 daily"）
5. **可切换视图**（日/周/月/年）—— 年视图是一张 365 格的热力图，看哪天最多事；月视图是日历格+每天一句话摘要
6. **可打印 / 导出 PDF**——让它真的能"成书"

## 1.5 自动生成"今日总结"

每天 22:00 或睡前，由一个**系统定时任务**自动跑：

```
scheduled_task: daily-summary
runtime: Ask-Anywhere
prompt: |
  基于今天的所有 Layer-1 事件（从 TraceableEventStore 拉取），
  生成一段 150~300 字的语义总结，包括：
  - 主线叙事（今天最重要的 1~2 件事）
  - 隐藏关联（看似无关但其实相关的事件）
  - 明日的延续（今天未完成/挖坑）
  
  写作风格：第二人称"你"，温暖、精确、不鸡汤。
output: notes/daily-summaries/2026-04-29.md
anchor_to: timeline(2026-04-29)
```

产出的 summary 既是 Timeline 底部卡片，也是一个独立 Note（可以被 Ask-Anywhere 后续检索）。

## 1.6 年/生的复利机制

一年后你能做什么：
- **Ask-Anywhere**："一年前的今天我在想什么？" → 拉 2025-04-29 的 timeline + summary
- **年度回顾**：AI 基于 365 天的 summary 生成你这一年的"主题演化"
- **主题视图**：选一个 tag（比如 #BuildingSecondBrain），看这个主题在时间轴上的所有出现
- **"如果有一天我不在了"**：这是一本完整的数字日记，家人/朋友可以翻看

这是**真正的 Digital Memento Mori**。不是玄学，是可执行的产品特性。

---

# 二、Resource —— Tiago Forte 原意 + Orbit 的落地

## 2.1 先还原 Forte 的原意（我做了调研）

Tiago Forte 在《Building a Second Brain》和后续文章里对 Resource 的**精确定义**：

> **"A topic or theme of ongoing interest."**
>
> — *Resources are subjects you're interested in, but without a specific goal or deadline attached.*

关键点：
- **Subject / Topic / Theme** —— 是一个**话题**，不是一堆素材
- **Ongoing interest** —— 是你**持续感兴趣**的领域，不是一次性用的
- **No goal, no deadline** —— 和 Project 的区别（Project 有 goal），和 Area 的区别（Area 有 commitment）

Forte 特别强调：**Resource 不是收藏夹，不是剪藏，不是 Pocket**。如果一个话题你只是"可能有一天会看"，那它不是 Resource，是 noise。

## 2.2 三个常见误解（你担心的就是这里）

### 误解 1：Resource = Library
错。Library 是**单个素材**（一篇文章/一本书），Resource 是**话题聚合**（对这个话题的全部积累）。

一个关系：`Resource("第二大脑") contains LibraryItem*`，但 Library 可以独立存在不属于任何 Resource（只是兴趣但还没成话题）。

### 误解 2：Resource = Tag
错。Tag 是扁平标签，Resource 是**有结构的话题空间**，里面有：
- 核心论点 / canonical 文章
- 周边素材
- 自己的 distilled notes
- 相关人物 / 工具
- 演化历史

一个 Resource 长得更像一个**主题百科页**，不是标签。

### 误解 3：Resource = 归档
错。归档是"**这事已经过去了**"，Resource 是"**这件事一直活着**"。

## 2.3 Resource 在 Orbit 里的"产品形态"

基于 Forte 原意 + 你的愿景，我设计 Resource 为一个**主题工作站**：

```
resources/
  second-brain/
    index.md                    # 主题页：我对这个主题的核心理解
    _canonical/                 # 规范材料（最重要的几篇）
      building-a-second-brain-book.md  → link to library
      code-para-article.md             → link to library
    _distilled/                 # 我对这个主题的提炼（Note）
      2025-10-para-my-interpretation.md
      2026-01-code-workflow-redesign.md
    _related/                   # 相关引用（不是核心但有价值）
      tag: #second-brain
    _people/                    # 这个主题下的人
      tiago-forte.md
    _projects-touched/          # 这个主题启发的 project（引用）
      - "[[../projects/orbit-note-system]]"
      - "[[../projects/personal-kb-migration]]"
    _timeline/                  # 这个主题的演化（auto-generated from Timeline）
      2025-Q4.md
      2026-Q1.md
```

### 一个 Resource 的内在属性

```yaml
---
type: resource
title: Second Brain
status: active | dormant | evolved
depth: exploring | practicing | mastered | teaching
curated_by: user
created: 2025-10-01
last_engaged: 2026-04-29
engagement_count: 247  # 这个主题被引用/访问的次数
---
```

- `status`：active = 最近 3 个月有活动；dormant = 长期没碰；evolved = 演化进了另一个主题（可以指向新 resource）
- `depth`：我对这个主题的自我评估层次
- `engagement_count`：自动统计——Timeline 上这个主题被触及的次数（**时间复利的直接度量**）

## 2.4 Resource 在应用中的流转（你最关心的问题）

我设计 4 条流转路径，这是 Resource 真正"活起来"的关键：

### 路径 A：Feed → Library → Resource（外部流入）

```
用户订阅 feed（比如 Tiago Forte 的 blog）
    ↓
Feed 带来一篇文章
    ↓
用户"save to library"  →  LibraryItem
    ↓
Ask-Anywhere 提问："这属于哪个 resource？"
    ↓  （LLM 根据 Library 标题/摘要建议；或用户手动）
LibraryItem 被 link 到 Resource("Second Brain")
    ↓
Resource 的 _related/ 自动更新；engagement_count +1
```

### 路径 B：Note → Resource（自下而上的主题发现）

这条路径很关键——**Resource 不是先有壳再往里塞，而是从大量 Note 中涌现出来的**。

```
用户在 thoughts 里反复写同一个主题（系统检测 tag/关键词频次）
    ↓
到一定阈值（比如 10 个 thoughts 都带 #second-brain）
    ↓
Ask-Anywhere 主动提示："你最近对 second-brain 写了 10+ 想法，
                      要不要正式立为 Resource？"
    ↓  （用户确认）
Resource 被创建；相关 Note 自动 link 过去
```

### 路径 C：Resource → Project（创造性跃迁）

```
用户长期持有 Resource "Second Brain"
    ↓
某天 Ask-Anywhere 说："你在 Second Brain 主题积累了 40 篇 thoughts，
                    其中 12 篇提到'想做工具'。要不要立项？"
    ↓
用户说好 → 基于 Resource 里的 distilled notes 生成 Project 规划
    ↓
Project 立项，Resource 的 _projects-touched/ 记录下来
    ↓  （项目完成后）
Project 产出的产物（长文、代码、设计）反哺 Resource
```

### 路径 D：Resource → Timeline 复利可视化

```
Resource 页面里有一个"时间轴视图"
    ↓
显示：这个主题在过去 2 年里，我哪些天触及过
    ↓
每个触及点可点开：那天的 thoughts / library / project activity
    ↓
这是 "时间复利" 最直接的视觉呈现
```

### 路径 E：Resource → Archive（主题终结 / 演化）

```
Resource 长期 dormant（比如 6 个月无活动）
    ↓
Ask-Anywhere 提醒："这个主题你很久没碰了"
    ↓
用户选：
  - 归档：Resource → archives/
  - 演化：Resource 分裂 / 合并到新 Resource
  - 保留：强制标记"仍在孵化"
```

## 2.5 Resource 的三个关键 UX 瞬间

### 瞬间 1：新建 Resource（仪式感）
不是"点+号输入标题"。应该是 Ask-Anywhere 辅助的**对话式立题**：

```
User: 我想立一个新 Resource
AA:   你最近哪些想法指向这个主题？我查一下 notes...
      [列出 10 条相关 thoughts]
AA:   这个主题想叫什么？用一两个词。
User: "精力管理"
AA:   我帮你起草 resource 主页（index.md）
      [基于相关 notes 的 Ask-Anywhere 自动摘要]
      你可以直接用，或者改写。
```

### 瞬间 2：进入一个 Resource 页（"主题工作站"体验）

左侧是主题索引（canonical / distilled / related / timeline），中间是 index.md 主页，右侧是 Ask-Anywhere 对话（以这个 resource 为唯一 context）。

这是一个**沉浸式的思考空间**，不是信息列表。

### 瞬间 3：周期性 Resource 评审

每月一次，Ask-Anywhere 触发："你的 active resources 有 8 个，我来帮你 review"：
- 哪些没动过 → 建议归档
- 哪些爆炸增长 → 建议拆分
- 哪些主题开始交叉 → 建议合并

---

# 三、整合：daily timeline / notes / library / feed / resource / vision 的关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Daily Timeline                              │
│            （系统自动记录；UI 是人生河流）                            │
│            ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←             │
│            ↓                                                        │
│    ┌───────────────────────────────────────────────────────┐        │
│    │  所有事件都会流到 Timeline（TraceableEvent）            │        │
│    └───────────────────────────────────────────────────────┘        │
│                ↑                        ↑                           │
│                │                        │                           │
│   ┌────────────┴──────────┐    ┌───────┴────────────┐              │
│   │   Output（用户产出）    │    │  Input（外部流入）   │              │
│   │                        │    │                    │              │
│   │   Note (thought)       │    │   Feed → filter →  │              │
│   │   Note (longform)      │    │   LibraryItem      │              │
│   │   Note (capture)       │    │                    │              │
│   │   Note (voice_log)     │    │   Knowledge Base   │              │
│   │                        │    │   (存量导入)        │              │
│   └────────┬──────────────┘    └────┬───────────────┘              │
│            │                         │                              │
│            └──────────┬──────────────┘                              │
│                       ▼                                             │
│         ╔══════════════════════════════════════╗                   │
│         ║            PARA 组织层                ║                   │
│         ║                                      ║                   │
│         ║   Projects ──有目标，有截止─→ 完成归档   ║                   │
│         ║   Areas    ──长期责任──────→ 周期评审   ║                   │
│         ║   Resources──持续兴趣──────→ 时间复利   ║ ← 本次新增重点    │
│         ║   Archives ──历史但可唤醒              ║                   │
│         ╚══════════════════════════════════════╝                   │
│                       ▼                                             │
│         ╔══════════════════════════════════════╗                   │
│         ║         Vision（最高指引）             ║                   │
│         ║   愿景 / 5年 / 年 / 季 / 月 计划        ║                   │
│         ║   欢迎分析时初始化                     ║                   │
│         ╚══════════════════════════════════════╝                   │
│                       ▲                                             │
│                       │                                             │
│                 Ask-Anywhere                                        │
│            （唯一 AI 入口，贯通全部）                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**核心洞察**：
1. **Timeline 是最底层**——所有事件都流到它（event sourcing）
2. **PARA 是组织层**——Note/Library/Knowledge 都归到 PARA 里
3. **Vision 是最高指引**——给 PARA 提供优先级和意义
4. **Ask-Anywhere 贯通所有层**——代用户在各层间操作
5. **Resource 是"时间复利的物化"**——它专门用于积累，区别于 Project（完成）和 Area（维持）

---

# 四、在输出 4 份实施文档前——你需要确认

### Tool Calls:
- **ask_followup_question**({"title":"Daily Timeline + Resource 确认","questions":[{"id":"timeline_ambition","prompt":"Daily Timeline 的野心层次（§1.4 视觉设计 + §1.5 AI 总结）","options":[{"id":"full_vision","label":"A. 全部采纳：时段分组 + 今日一瞑 + AI 总结卡片 + 年月视图 + 导出PDF"},{"id":"mvp_first","label":"B. 先做时间轴重商型或 + 今日一瞑，后面加 AI 总结/多级视图"},{"id":"adjust","label":"C. 里面有些不对，我改改"}]},{"id":"layer3_noise","prompt":"Layer-3 System-Noise 事件（heartbeat/cost细粒度）上不上 Timeline？","options":[{"id":"no_noise","label":"A. 完全不上，只上 Layer 1/2"},{"id":"debug_mode","label":"B. 上，但默认隐藏，开发者模式可見（我推荐）"},{"id":"always_on","label":"C. 全部展示（我很小众、需要完整计备）"}]},{"id":"resource_model","prompt":"Resource 的内在模型（§2.3 主题工作站 + 5 目录）","options":[{"id":"adopt_full","label":"A. 完全采纳（canonical/distilled/related/people/projects-touched/timeline）"},{"id":"simplify","label":"B. 简化最小集，MVP 只保留 index.md + distilled/ + 自动 timeline"},{"id":"adjust_model","label":"C. 我想调整结构"}]},{"id":"resource_emerge","prompt":"Resource “自下而上涌现”机制（路径 B：Ask-Anywhere 检测频签 → 建议立题）","options":[{"id":"key_feature","label":"A. 非常关键，必须做，是 Resource 活起来的核心"},{"id":"manual_ok","label":"B. 手动建立也能活着，自动涌现可后期"},{"id":"need_design","label":"C. 需要再设计触发规则"}]},{"id":"daily_summary_scope","prompt":"AI 自动生成的今日总结","options":[{"id":"ambitious","label":"A. 每天自动跑，作为系统默认定时任务之一"},{"id":"opt_in","label":"B. 做但默认关闭，用户自己启用"},{"id":"post_mvp","label":"C. Timeline 做了再加总结能力"}]},{"id":"notes_in_docs","prompt":"4 份文档是否包含 Daily Timeline + Resource 系统？","options":[{"id":"yes_separate","label":"A. Daily Timeline 和 Resource 各作为第 5 / 第 6 份文档（总共 6 份，但按完整度输出）"},{"id":"merge_into_notes","label":"B. Daily Timeline 合到 “笔记系统”文档里，Resource 单独成第 5 份（共 5 份）"},{"id":"all_merge","label":"C. 保持 4 份，笔记文档伸展覆盖 Daily Timeline 和 Resource，文档会非常大"}]}],"toolExplanation":"对齐 Daily Timeline 和 Resource 的细节"})

---

## [Tool] 2026-04-27T10:44:22.086Z
{"pending":true,"questions":[{"id":"timeline_ambition","prompt":"Daily Timeline 的野心层次（§1.4 视觉设计 + §1.5 AI 总结）","options":[{"id":"full_vision","label":"A. 全部采纳：时段分组 + 今日一瞑 + AI 总结卡片 + 年月视图 + 导出PDF"},{"id":"mvp_first","label":"B. 先做时间轴重商型或 + 今日一瞑，后面加 AI 总结/多级视图"},{"id":"adjust","label":"C. 里面有些不对，我改改"}]},{"id":"layer3_noise","prompt":"Layer-3 System-Noise 事件（heartbeat/cost细粒度）上不上 Timeline？","options":[{"id":"no_noise","label":"A. 完全不上，只上 Layer 1/2"},{"id":"debug_mode","label":"B. 上，但默认隐藏，开发者模式可見（我推荐）"},{"id":"always_on","label":"C. 全部展示（我很小众、需要完整计备）"}]},{"id":"resource_model","prompt":"Resource 的内在模型（§2.3 主题工作站 + 5 目录）","options":[{"id":"adopt_full","label":"A. 完全采纳（canonical/distilled/related/people/projects-touched/timeline）"},{"id":"simplify","label":"B. 简化最小集，MVP 只保留 index.md + distilled/ + 自动 timeline"},{"id":"adjust_model","label":"C. 我想调整结构"}]},{"id":"resource_emerge","prompt":"Resource “自下而上涌现”机制（路径 B：Ask-Anywhere 检测频签 → 建议立题）","options":[{"id":"key_feature","label":"A. 非常关键，必须做，是 Resource 活起来的核心"},{"id":"manual_ok","label":"B. 手动建立也能活着，自动涌现可后期"},{"id":"need_design","label":"C. 需要再设计触发规则"}]},{"id":"daily_summary_scope","prompt":"AI 自动生成的今日总结","options":[{"id":"ambitious","label":"A. 每天自动跑，作为系统默认定时任务之一"},{"id":"opt_in","label":"B. 做但默认关闭，用户自己启用"},{"id":"post_mvp","label":"C. Timeline 做了再加总结能力"}]},{"id":"notes_in_docs","prompt":"4 份文档是否包含 Daily Timeline + Resource 系统？","options":[{"id":"yes_separate","label":"A. Daily Timeline 和 Resource 各作为第 5 / 第 6 份文档（总共 6 份，但按完整度输出）"},{"id":"merge_into_notes","label":"B. Daily Timeline 合到 “笔记系统”文档里，Resource 单独成第 5 份（共 5 份）"},{"id":"all_merge","label":"C. 保持 4 份，笔记文档伸展覆盖 Daily Timeline 和 Resource，文档会非常大"}]}],"title":"Daily Timeline + Resource 确认"}

---

## [Assistant] 2026-04-27T10:44:51.637Z
等你对齐这 6 个问题再出文档。

---

## 提前说明一下——Vision 这块我注意到了

你这次回答里漏掉了一个话题我想主动点出来：

> "欢迎分析要做，且要和**愿景**的初始化放在一起作为初始化流程之一"

你提到了 **Vision（愿景）**，但之前的讨论里我们没展开过 Vision 系统。这是一个独立的大话题：
- Vision 和 PARA 的关系（我猜：Vision 是 Area/Project 的上位指引）
- Vision 的产物形态（一段文字？一张图？一组 milestone？）
- Vision 如何和 Daily Timeline 连动（Timeline 应该显示"离愿景又近了一点"吗？）
- 5 年 / 年 / 季 / 月计划的层级关系

在你的记忆库里我看到过 `兴趣爱好/项目管理.md` 和 `life-vision-planner` skill 相关的笔记，说明你有思考过这个。

**我建议**：把 **Vision 系统**也作为一个独立话题，放在"欢迎分析 + 初始化流程"文档里一起设计，或者单独一轮讨论。

如果你同意，Vision 会成为第 7 份实施文档（或合并进"欢迎分析与初始化"文档）。

### Tool Calls:
- **ask_followup_question**({"title":"Vision 系统该怎么处理","questions":[{"id":"vision_strategy","prompt":"Vision 系统的处理方式","options":[{"id":"separate_doc","label":"A. 单独出一份 Vision 实施文档（包含欢迎分析 + 初始化流程）"},{"id":"merge_onboarding","label":"B. 合并到一份“欢迎分析 + Vision + 初始化”文档（我推荐）"},{"id":"discuss_later","label":"C. 本轮先不展开，Vision 另外找时间讨论"},{"id":"already_done","label":"D. Vision 我跟其他 AI 聊过了，已有设计，你不用再想"}]}],"toolExplanation":"确认 Vision 系统的处理方式"})

---

## [Tool] 2026-04-27T10:44:51.646Z
{"pending":true,"questions":[{"id":"vision_strategy","prompt":"Vision 系统的处理方式","options":[{"id":"separate_doc","label":"A. 单独出一份 Vision 实施文档（包含欢迎分析 + 初始化流程）"},{"id":"merge_onboarding","label":"B. 合并到一份“欢迎分析 + Vision + 初始化”文档（我推荐）"},{"id":"discuss_later","label":"C. 本轮先不展开，Vision 另外找时间讨论"},{"id":"already_done","label":"D. Vision 我跟其他 AI 聊过了，已有设计，你不用再想"}]}],"title":"Vision 系统该怎么处理"}

---

## [Assistant] 2026-04-27T10:45:05.039Z
等你拍 6+1 = 7 个问题。拍完后我一次性输出全部实施文档（可能 5~6 份，数量取决于你选择）。

---

## 我额外想对 Timeline 再做一点深度思考

让你决策前多一点信息：

### Timeline 的"**特殊事件**"机制

除了自动 TraceableEvent，我建议保留一个**用户主动埋点**的能力：

```
用户在任何地方点 "📌 埋点到时间轴"
  → 可以加一句话（"今天突然想通了..."）
  → 可以附截图
  → Timeline 上显示为特殊图标（🌟 insight / 💡 breakthrough / 💔 setback）
```

这些"特殊事件"才是日记的灵魂——平时的工作流是"你做了什么"，特殊事件是"**你真正感受到什么**"。

### Timeline 和外部世界的连接

未来（不是现在做）：
- GitHub commit 也流入 timeline（用户的代码产出）
- Email 重要事件可选流入（出差、合同）
- Calendar 事件流入（会议、生日、纪念日）
- 甚至 Health 数据（跑步公里数 / 睡眠质量）—— 这是"人生全景"

**现在不做**，但架构要为这个预留。——这也是为什么 Timeline 要基于 TraceableEvent 抽象而不是硬编码事件类型。

### 隐私层级

日记是极私密的东西。未来要支持：
- 加密层（本地密钥）
- "隐身事件"（某事件不进入 AI 总结，也不进入搜索）
- 导出/备份的加密

**现在不做**，但数据模型要 future-proof。

---

等你决策。

---

## [User] 2026-04-27T11:05:41.406Z
.全部采纳：时段分组+今日一瞑+AI 总结卡片+年月视图＋导出PDF
Layer-3 System-Noise 事件（heartbeat/cost细粒度）上不上 Timeline?
 完全不上,只上Layer 1/2
Timeline 的"特殊事件"机制 这可以融入到quick capture中


---

## [User] 2026-04-27T11:07:21.206Z
.全部采纳：时段分组+今日一瞑+AI 总结卡片+年月视图＋导出PDF
Layer-3 System-Noise 事件（heartbeat/cost细粒度）上不上 Timeline?
完全不上,只上Layer 1/2
resource部分完全采纳
 Daily Timeline 和 Resource 各作为第5/第6份文档总共6份，完整输出细节
本轮先不展开，Vision 另外找时间讨论
Timeline 的"特殊事件"机制 这可以融入到quick capture中
Timeline 和外部世界的连接现在不做，但架构要为这个预留。
隐私层级现在不做，但数据模型要 future-proof。


---

## [Assistant] 2026-04-27T11:07:30.995Z
收到，决策全部拍板。6 份实施文档一次性输出，按"完整度高于简洁"原则写（因为 AI 将直接据此实施，写得越清楚你越省力）。

先建一个总目录和索引，然后逐份输出。

### Tool Calls:
- **todo_write**({"merge":false,"todos":[{"id":"idx","status":"in_progress","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"pending","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"pending","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"pending","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"pending","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"toolExplanation":"建立本轮 6 份文档输出任务清单"})

---

## [Tool] 2026-04-27T11:07:31.006Z
{"todos":[{"id":"idx","status":"in_progress","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"pending","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"pending","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"pending","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"pending","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Created new todo list with 8 items"}

---

## [Assistant] 2026-04-27T11:07:57.340Z
### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/README.md","content":"# Phase 2 · 知识栈扩展\n\n> **Phase 1**（2026-04-29）聚焦 Chat 解耦和 Ask-Anywhere 基础。\n> **Phase 2**（本目录）聚焦笔记系统、PARA 扩展、Daily Timeline、Resource 主题工作站等\"知识复利\"核心能力。\n\n## 前置决策\n\n本 Phase 基于 Phase 1 的 8 个决策锚点（`docs/thinking-trail/2026-04-29-chat-unification-decoupling/decisions-anchor.md`），以及以下新增的 Phase 2 决策：\n\n### Phase 2 核心决策（P2-D1 ~ P2-D10）\n\n| # | 决策 |\n|---|------|\n| **P2-D1** | 笔记 / Library / Feed 三分：Note 是用户产出（统一 primitive），Library 是素材，Feed 是流水 |\n| **P2-D2** | KB 导入采用\"分层引用\"路径 C：`notes/` 活跃区 + `knowledge-base/` 存量区（多 KB 并存）+ \"激活\"机制桥接 |\n| **P2-D3** | KB 默认权限可读写（Orbit 可加 frontmatter） |\n| **P2-D4** | `notes/` 按 type 分子目录（thoughts/longforms/captures/daily-summaries/voice_logs） |\n| **P2-D5** | Notes 一级入口页面采用\"最小可用，可扩展\"策略（列表+简单编辑+搜索优先） |\n| **P2-D6** | 欢迎分析作为初始化流程之一（与 Vision 初始化并列） |\n| **P2-D7** | Daily Timeline 全套采纳：时段分组 + 今日一瞥 + AI 总结卡片 + 年月视图 + 导出 PDF |\n| **P2-D8** | Timeline 仅上 Layer 1/2 事件，Layer 3（heartbeat/cost 细粒度）完全不上 |\n| **P2-D9** | Resource 采用主题工作站完整模型（6 子目录），支持\"自下而上涌现\"机制 |\n| **P2-D10** | Timeline 特殊事件（insight/breakthrough/setback）融合进 Quick Capture |\n\n### Phase 2 延后决策\n\n- **Vision 系统**：本 Phase 暂不展开，另找时间讨论。但**欢迎分析**里预留 Vision 初始化钩子\n- **Timeline 外部世界连接**（GitHub/Calendar/Health）：架构预留，本 Phase 不实现\n- **Timeline 隐私层级**（加密/隐身事件）：架构预留，本 Phase 不实现\n\n---\n\n## 文档清单（共 6 份，可独立实施）\n\n| # | 文档 | 大致规模 | 实施依赖 |\n|---|------|---------|---------|\n| 1 | `01-note-system-and-para.md` — 笔记系统 + PARA 扩展 + KB 导入 | L | 无（最基础） |\n| 2 | `02-scheduled-tasks-ui.md` — 定时任务一级入口 | M | 无 |\n| 3 | `03-gateway-telegram.md` — Gateway Daemon + Telegram Channel | L | 依赖 Phase 1 Ask-Anywhere 完成 |\n| 4 | `04-ask-anywhere-stage-view.md` — Ask-Anywhere 产物舞台 | M | 依赖 Phase 1 Ask-Anywhere、文档 1（知道有哪些产物） |\n| 5 | `05-daily-timeline.md` — Daily Timeline 人生日记 | L | 依赖文档 1（需要 Note 事件定义） |\n| 6 | `06-resource-workstation.md` — Resource 主题工作站 | L | 依赖文档 1（Library/Note）、文档 5（Timeline 集成） |\n\n### 建议实施顺序\n\n```\n01 (笔记系统 + PARA)  ──┐\n                       ├──→ 05 (Daily Timeline)\n02 (定时任务)          ──┘           ↓\n                                    06 (Resource)\n03 (Gateway)          ──── 独立\n04 (Stage View)       ──── 依赖 01\n```\n\nP2-M1: 01（笔记系统）\nP2-M2: 02（定时任务）+ 03（Gateway）并行\nP2-M3: 05（Timeline）\nP2-M4: 06（Resource）\nP2-M5: 04（Stage View）\n\n---\n\n## 验收标准\n\n本 Phase 2 全部完成后，Orbit 应该能：\n\n1. ✅ 用户有一个独立的 Notes 一级入口，能查看 / 编辑 / 搜索所有笔记\n2. ✅ 用户能导入存量 Obsidian vault 到 `knowledge-base/`\n3. ✅ 初次使用时 Orbit 能\"读懂\"用户（欢迎分析）\n4. ✅ 用户能看到一个 Daily Timeline，一天一张页，一生积累\n5. ✅ 用户能在 Timeline 上看到 AI 生成的\"今日总结\"\n6. ✅ 用户能从多个 thoughts 涌现出 Resource 主题\n7. ✅ 用户能在 Resource 主题工作站里沉浸思考\n8. ✅ 用户能从 Telegram 远程和 Ask-Anywhere 对话\n9. ✅ 用户能设置定时任务并看执行历史\n10. ✅ Ask-Anywhere 对话能展示产物（stage view）\n\n---\n\n## 实施提示词\n\n所有文档完成后会生成 `IMPLEMENTATION_PROMPT.md`，可一次性交给 AI 实施。\n","toolExplanation":"建立 Phase 2 总目录和索引"})

---

## [Tool] 2026-04-27T11:07:57.345Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/README.md","size":4066,"append":false}

---

## [Assistant] 2026-04-27T11:08:04.132Z
### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"in_progress","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"}],"toolExplanation":"开始文档 1 笔记系统"})

---

## [Tool] 2026-04-27T11:08:04.136Z
{"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"in_progress","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"pending","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"pending","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"pending","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-27T11:10:51.557Z
---

# 📄 文档 1：笔记系统 + PARA 扩展 + KB 导入

这是最大的一份，我分段写入（避免单次输出截断）：

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/01-note-system-and-para.md","content":"# 文档 1：笔记系统 + PARA 扩展 + KB 导入\n\n> **规模**：L（约 3~5 天 AI 实施 + 数据模型改动）\n> **依赖**：Phase 1 完成（Chat 解耦、Conversation 一等公民、Ask-Anywhere MVP）\n> **产物**：Notes 一级入口 + KB 导入 + Area/Resource/Archive 基础 + 欢迎分析初始化流程\n\n---\n\n## 1. 设计哲学\n\n### 1.1 Forte CODE+PARA 在 Orbit 的落地\n\n| CODE 阶段 | Orbit 实现 |\n|----------|-----------|\n| **Capture** | Quick Capture UI + `notes/captures/` 目录 + Feed → Library → 收藏 |\n| **Organize** | PARA 四象限（Projects / Areas / Resources / Archives） |\n| **Distill** | Library 的 annotation + Note 渐进总结 + Ask-Anywhere 的 `orbit-distill` skill |\n| **Express** | `notes/longforms/` + Ask-Anywhere 的 `orbit-express` skill |\n\n### 1.2 本体论划分（严格遵守，这是模型灵魂）\n\n```\n┌─────────────────────────────────────────────────────────────────┐\n│  Output（用户产出）          Input（外部素材）                    │\n│  ─────────────────          ─────────────────                  │\n│  Note                        LibraryItem（用户主动收藏的）        │\n│    type: thought             FeedItem（订阅流入，待筛选）         │\n│    type: longform                                               │\n│    type: capture             Knowledge Base（存量导入，分层引用） │\n│    type: voice_log                                              │\n│    type: daily_summary                                          │\n│                                                                 │\n│  全部是用户自己写的/说的       全部是外部信息                      │\n│  → 可进 PARA                  → 素材 → 激活 / distill → Note    │\n└─────────────────────────────────────────────────────────────────┘\n```\n\n**铁律**：\n- Note 是用户产出的统一 primitive\n- Library/Feed **不是** Note\n- Knowledge Base 的笔记**不是 Orbit 的活跃 Note**，但可以通过\"激活\"转换\n\n---\n\n## 2. 目录结构（Vault 内）\n\n### 2.1 完整目录树\n\n```\n<vault>/\n├── notes/                           # 活跃工作区（Output）\n│   ├── thoughts/                    # 短想法\n│   │   └── 2026-04-30T14-02-ab12.md\n│   ├── longforms/                   # 长文 / 文章\n│   │   └── building-second-brain.md\n│   ├── captures/                    # 捕获（有 source 字段）\n│   │   └── 2026-04-30T10-15-cd34.md\n│   ├── voice_logs/                  # 语音日志\n│   │   └── 2026-04-30T19-30-ef56.md\n│   └── daily-summaries/             # AI 生成的每日总结\n│       └── 2026-04-30.md\n│\n├── library/                         # 素材层（Input - 用户主动收藏）\n│   ├── articles/                    # 网页文章\n│   ├── pdfs/                        # PDF 文件\n│   ├── videos/                      # 视频（只存元信息 + 链接）\n│   └── bookmarks/                   # URL 书签\n│\n├── feeds/                           # Feed 订阅（流水，未筛选）\n│   ├── _sources.json                # 订阅源配置\n│   └── <source-id>/                 # 每个订阅源的 items\n│       └── 2026-04-30-<item>.json\n│\n├── knowledge-base/                  # 存量知识区（Input - 导入）\n│   ├── <kb-name>/                   # 每个 KB 独立目录，保持原结构\n│   │   └── ... 用户原始笔记结构 ...\n│   └── .orbit-kb-meta/              # Orbit 对 KB 的元信息（不污染原文）\n│       ├── registry.json            # KB 列表 + 配置\n│       ├── annotations/             # 对 KB 笔记的标注（Orbit 侧）\n│       └── indexes/                 # 检索索引\n│\n├── projects/                        # PARA - Projects\n├── areas/                           # PARA - Areas\n├── resources/                       # PARA - Resources（详见文档 6）\n├── archives/                        # PARA - Archives\n│\n└── .orbit/                          # 系统目录\n    ├── conversations/\n    ├── events/\n    └── config.json\n```\n\n### 2.2 路径约定\n\n| 目录 | 谁写入 | Obsidian 可见 | Ask-Anywhere 可操作 |\n|------|--------|--------------|---------------------|\n| `notes/*` | 用户 + Orbit | ✅ | ✅ 读写 |\n| `library/*` | Orbit + 用户 | ✅ | ✅ 读写 |\n| `feeds/*` | Orbit 自动 | ✅ | ✅ 只读 |\n| `knowledge-base/<kb>/*` | 用户 + Orbit（可读写）| ✅ | ✅ 读写（默认） |\n| `knowledge-base/.orbit-kb-meta/*` | Orbit | ✅（但不建议用户改） | ✅ |\n| `projects / areas / resources / archives` | 用户 + Orbit | ✅ | ✅ 读写 |\n| `.orbit/*` | Orbit | ⚠️ 不建议暴露 | 内部使用 |\n\n---\n\n## 3. Note 数据模型\n\n### 3.1 TypeScript 类型\n\n```typescript\n// src/shared/note/types.ts\n\nexport type NoteType = \n  | 'thought'         // 短想法\n  | 'longform'        // 长文\n  | 'capture'         // 捕获（有来源）\n  | 'voice_log'       // 语音日志\n  | 'daily_summary';  // AI 生成的每日总结\n\nexport type NotePARAKind = \n  | 'floating'        // 尚未归属\n  | 'project'         // 归属某 project\n  | 'area'            // 归属某 area\n  | 'resource'        // 归属某 resource\n  | 'archive';        // 归档\n\nexport interface NoteFrontmatter {\n  // 标识\n  id: string;\n  type: NoteType;\n  title?: string;\n  created: string;              // ISO timestamp\n  updated: string;\n  \n  // PARA 归属\n  para_kind: NotePARAKind;\n  para_ref?: string;            // e.g. \"projects/orbit-v2\"、\"resources/second-brain\"\n  \n  // 标签\n  tags: string[];\n  \n  // 来源（仅 type=capture 有）\n  source?: {\n    kind: 'library' | 'kb' | 'url' | 'conversation' | 'feed' | 'manual';\n    ref?: string;               // 指向来源的引用\n    excerpt?: string;           // 原文片段\n  };\n  \n  // Voice log 特有\n  audio?: {\n    path: string;               // 相对路径\n    duration_sec: number;\n    transcribed: boolean;\n  };\n  \n  // 双向链\n  links_out: string[];          // 出链（wikilink 目标）\n  backlinks: string[];          // 反向链（自动维护）\n  \n  // 元数据\n  word_count?: number;\n  author?: string;              // 默认用户自己\n  visibility?: 'normal' | 'private';  // future-proof 隐私\n}\n\nexport interface Note {\n  frontmatter: NoteFrontmatter;\n  body: string;                 // Markdown 正文\n  path: string;                 // 相对 vault 的路径\n}\n```\n\n### 3.2 Frontmatter 示例\n\n**thought**:\n```yaml\n---\nid: note-2026-04-30T14-02-ab12\ntype: thought\ncreated: 2026-04-30T14:02:33+08:00\nupdated: 2026-04-30T14:02:33+08:00\npara_kind: resource\npara_ref: resources/second-brain\ntags: [second-brain, distill, insight]\nlinks_out: [\"[[Tiago Forte]]\"]\nbacklinks: []\n---\n\n渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，\n而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。\n```\n\n**capture** (from library):\n```yaml\n---\nid: note-2026-04-30T10-42-cd34\ntype: capture\ncreated: 2026-04-30T10:42:00+08:00\nupdated: 2026-04-30T10:42:00+08:00\npara_kind: floating\npara_ref: null\ntags: [second-brain]\nsource:\n  kind: library\n  ref: library/articles/building-a-second-brain-2025.md\n  excerpt: \"Progressive summarization creates a multi-layer cake of insights...\"\nlinks_out: []\nbacklinks: []\n---\n\n这个比喻很有意思。我想记下来应用到 Orbit 的定时任务设计。\n```\n\n**longform**:\n```yaml\n---\nid: note-longform-orbit-philosophy\ntype: longform\ntitle: Orbit 是第二大脑的执行层\ncreated: 2026-04-30T14:00:00+08:00\nupdated: 2026-04-30T15:40:12+08:00\npara_kind: project\npara_ref: projects/orbit-v2\ntags: [orbit, second-brain, philosophy]\nword_count: 3421\nlinks_out: [\"[[para-in-orbit]]\", \"[[code-in-orbit]]\", \"[[Tiago Forte]]\"]\nbacklinks: [\"resources/second-brain/index.md\"]\n---\n\n# Orbit 是第二大脑的执行层\n\n……正文……\n```\n\n---\n\n## 4. Library / Feed 数据模型\n\n### 4.1 LibraryItem\n\n```typescript\n// src/shared/library/types.ts\n\nexport type LibraryItemKind = \n  | 'article'         // Web 文章（纯文字）\n  | 'pdf'             // PDF\n  | 'video'           // 视频（只存链接 + 元信息）\n  | 'bookmark';       // URL 书签\n\nexport type LibraryItemStatus = \n  | 'unread'\n  | 'reading'\n  | 'read'\n  | 'distilled'       // 已提炼成 Note\n  | 'archived';\n\nexport interface LibraryItemFrontmatter {\n  id: string;\n  kind: LibraryItemKind;\n  title: string;\n  url?: string;\n  author?: string;\n  published_at?: string;\n  added_at: string;\n  status: LibraryItemStatus;\n  \n  // PARA 关联\n  para_refs?: string[];           // 可属于多个 project/area/resource\n  \n  // 标签\n  tags: string[];\n  \n  // Distill 关联\n  distilled_into?: string[];      // 产生的 Note id 列表\n  annotations_count: number;\n  \n  // 文件位置（本地有副本时）\n  local_path?: string;            // e.g. \"library/pdfs/xxx.pdf\"\n}\n\nexport interface LibraryItem {\n  frontmatter: LibraryItemFrontmatter;\n  body?: string;                  // markdown 正文（article 类型）\n  annotations: LibraryAnnotation[];\n}\n\nexport interface LibraryAnnotation {\n  id: string;\n  at: string;                     // 时间\n  range: { start: number; end: number };\n  type: 'highlight' | 'underline' | 'bold' | 'comment';\n  text: string;                   // 标注的原文\n  comment?: string;               // 用户评论\n  color?: string;\n  note_id?: string;               // 如果这条 annotation 转成了 note\n}\n```\n\n### 4.2 FeedItem & FeedSource\n\n```typescript\n// src/shared/feed/types.ts\n\nexport type FeedSourceKind = 'rss' | 'newsletter' | 'youtube' | 'twitter' | 'manual';\n\nexport interface FeedSource {\n  id: string;\n  kind: FeedSourceKind;\n  name: string;\n  url: string;\n  last_fetched_at?: string;\n  fetch_interval_minutes: number;\n  active: boolean;\n  tags?: string[];\n}\n\nexport type FeedItemStatus = \n  | 'new'\n  | 'seen'\n  | 'saved_to_library'   // 用户 save 进 library 了\n  | 'dismissed';\n\nexport interface FeedItem {\n  id: string;\n  source_id: string;\n  title: string;\n  url: string;\n  summary?: string;\n  published_at: string;\n  fetched_at: string;\n  status: FeedItemStatus;\n  saved_to_library_ref?: string;  // library item path\n}\n```\n\n### 4.3 存储\n\n**LibraryItem**：每个是一个目录（因为可能有大文件 + annotation）\n```\nlibrary/articles/<id>/\n  index.md          # frontmatter + body\n  annotations.json  # 标注列表（或嵌入 frontmatter）\n  assets/           # 图片等资源\n```\n\n或简化为单文件（MVP 推荐）：\n```\nlibrary/articles/<slug>.md   # frontmatter + body + annotations 嵌入\n```\n\n**FeedSource**：单个配置文件 `feeds/_sources.json`\n**FeedItem**：单 JSON 文件，按 source 分子目录 `feeds/<source-id>/<item-id>.json`\n\n---\n\n## 5. Knowledge Base（KB）数据模型\n\n### 5.1 KB Registry\n\n```typescript\n// src/shared/knowledge-base/types.ts\n\nexport interface KnowledgeBase {\n  id: string;                      // 内部 id\n  name: string;                    // 用户起的名\n  path: string;                    // 相对 vault 的路径，如 \"knowledge-base/obsidian-2023\"\n  source_type: 'obsidian' | 'markdown-folder' | 'notion-export' | 'generic';\n  imported_at: string;\n  last_scanned_at?: string;\n  \n  // 权限（P2-D3 默认可读写）\n  writable: boolean;\n  \n  // 索引状态\n  index_status: 'pending' | 'indexing' | 'ready' | 'error';\n  item_count: number;\n  \n  // 元数据\n  description?: string;\n  welcome_analysis_done: boolean;\n}\n```\n\n### 5.2 Registry 文件\n\n```\nknowledge-base/.orbit-kb-meta/registry.json\n```\n\n```json\n{\n  \"kbs\": [\n    {\n      \"id\": \"kb-obsidian-2023\",\n      \"name\": \"Obsidian 2023 Archive\",\n      \"path\": \"knowledge-base/obsidian-2023\",\n      \"source_type\": \"obsidian\",\n      \"imported_at\": \"2026-04-30T09:00:00+08:00\",\n      \"writable\": true,\n      \"index_status\": \"ready\",\n      \"item_count\": 1247,\n      \"welcome_analysis_done\": true\n    }\n  ]\n}\n```\n\n### 5.3 激活机制的数据关系\n\n当用户从 KB 激活一段到活跃区：\n\n```yaml\n# 在 notes/thoughts/xxx.md 新建：\n---\nid: note-2026-04-30T14-02-activated\ntype: capture\nsource:\n  kind: kb\n  ref: kb-obsidian-2023/folder/original.md\n  excerpt: \"原始段落内容...\"\npara_kind: floating\n---\n\n（用户可编辑）我对这段的新理解...\n```\n\n**原 KB 文件不动**。只是在 `.orbit-kb-meta/annotations/` 里记录一条 activation：\n\n```json\n// knowledge-base/.orbit-kb-meta/annotations/<kb-id>/<original-file>.json\n{\n  \"activations\": [\n    {\n      \"at\": \"2026-04-30T14:02:00+08:00\",\n      \"source_range\": { \"start\": 120, \"end\": 280 },\n      \"activated_to\": \"notes/thoughts/note-2026-04-30T14-02-activated.md\"\n    }\n  ]\n}\n```\n\n这样 KB 原文保持纯净，但 Orbit 知道\"这段被激活过\"。\n\n---\n\n## 6. PARA 扩展（Area / Resource / Archive 基础能力）\n\n> **说明**：Resource 详细设计见文档 6。本节只给 Area / Archive / Resource 的基础数据模型和目录结构。\n\n### 6.1 Project（已有，本次不改）\n\n现有 `projects/<slug>/` 目录结构保持不变。本次新增的是**让 Note/Library 能 link 到 Project**（通过 `para_ref`）。\n\n### 6.2 Area\n\n```\nareas/\n  engineering-lead/\n    index.md                  # Area 主页：职责/承诺/评审频率\n    _commitments.md           # 具体承诺（e.g. \"每周写一篇技术周报\"）\n    _reviews/                 # 周/月评审记录\n      2026-04-week-17.md\n      2026-04.md\n    _projects-active.md       # 当前活跃 projects（自动生成的 link 列表）\n    _notes-linked.md          # 关联 notes（自动生成）\n```\n\n**Area frontmatter**:\n```yaml\n---\ntype: area\ntitle: Engineering Lead\ncreated: 2026-01-01\nreview_cadence: weekly       # weekly | monthly | quarterly | none\nlast_reviewed_at: 2026-04-24\nhealth: active               # active | stagnant | dormant\ncommitments: \n  - \"每周写一篇技术周报\"\n  - \"每月做一次团队 1on1\"\ntags: [engineering, leadership]\n---\n```\n\n### 6.3 Resource（见文档 6，此处略）\n\n目录预留 `resources/`。\n\n### 6.4 Archive\n\n```\narchives/\n  projects/\n    2025-10-rewrite-auth-system/    # 完整搬迁过来\n  areas/\n  notes/                             # 归档的长文（很少见）\n  resources/\n```\n\n**归档操作**：\n```\narchive(entity) {\n  from = entity.path\n  to = \"archives/\" + entity.type + \"/\" + entity.slug\n  move file(s)\n  update links (wikilink 不变但 Orbit 记录重定向)\n  emit event: para.archived\n}\n```\n\n---\n\n## 7. Notes 一级入口 UI（最小可用 + 扩展路径）\n\n### 7.1 路由\n\n- 左侧栏新增一级入口：`Notes`（icon: `NotebookPen` from lucide-react）\n- 位置：Ask-Anywhere 之下，Projects 之上\n- 路由：`/notes`\n\n### 7.2 MVP UI 布局\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  Notes                                       [+ 新建] [🔍] [⚙️]   │\n│  ────────────────────────────────────────────────────────────── │\n│                                                                  │\n│  ┌─── 筛选栏 ────────────────────────────────────────────────┐   │\n│  │ 类型: [全部] [thought] [longform] [capture] [voice] [daily]│   │\n│  │ PARA: [全部] [project] [area] [resource] [floating]        │   │\n│  │ 标签: [#second-brain] [#orbit] [+]                         │   │\n│  │ 排序: [最近更新 ▼]                                          │   │\n│  └──────────────────────────────────────────────────────────┘   │\n│                                                                  │\n│  ┌── 列表 ────────────────────────────────────────────────────┐ │\n│  │ 💭 渐进式总结对定时任务设计很有启发                         │ │\n│  │    thought · resources/second-brain · 10 分钟前              │ │\n│  ├────────────────────────────────────────────────────────────┤ │\n│  │ ✍️  Orbit 是第二大脑的执行层                                │ │\n│  │    longform · 3421 字 · projects/orbit-v2 · 40 分钟前       │ │\n│  ├────────────────────────────────────────────────────────────┤ │\n│  │ 📌 这个比喻很有意思                                          │ │\n│  │    capture · 来自 library · 3 小时前                        │ │\n│  └────────────────────────────────────────────────────────────┘ │\n│                                                                  │\n│  [← 上一页]  [1 / 5]  [下一页 →]                                  │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 7.3 笔记详情 / 编辑视图\n\n点击进入单笔记：\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  ← 返回   [保存] [删除] [归档] [...]                              │\n│                                                                  │\n│  💭 渐进式总结对定时任务设计很有启发                              │\n│  ────────────────────────────────────────────────────────────── │\n│  thought · resources/second-brain · 2026-04-30 14:02             │\n│                                                                  │\n│  ┌── frontmatter (可折叠) ──────────────────────────────────┐    │\n│  │ para_kind: resource                                     │    │\n│  │ para_ref: resources/second-brain                        │    │\n│  │ tags: [second-brain, distill, insight]                  │    │\n│  └───────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 正文 (markdown 编辑器) ────────────────────────────────┐    │\n│  │ 渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，      │    │\n│  │ 而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。     │    │\n│  │                                                         │    │\n│  │ [[Tiago Forte]]                                         │    │\n│  └───────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 反向链 (backlinks) ─────────────────────────────────┐       │\n│  │ · resources/second-brain/index.md                     │       │\n│  │ · projects/orbit-v2/notes/distill-explorations.md     │       │\n│  └───────────────────────────────────────────────────────┘       │\n│                                                                  │\n│  [💬 和 Ask-Anywhere 讨论这条笔记]                                │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 7.4 编辑器技术选型\n\n- 用现有 markdown editor（项目应该已有，如 `react-markdown` + 简单 textarea，或 `codemirror`）\n- **不引入** Monaco / Tiptap 等重型编辑器\n- 支持：frontmatter 折叠、wikilink 自动补全（输入 `[[` 弹出笔记列表）、tag 自动补全（`#`）\n\n### 7.5 MVP 不做但要预留的扩展点\n\n在文档中**明确标记这些是后续迭代方向**，现在不做但架构不要挡路：\n\n- 🔮 **图谱视图**（双链可视化）\n- 🔮 **日历视图**（按时间看笔记创建分布）\n- 🔮 **Tag 云**\n- 🔮 **全文搜索增强**（向量检索、语义搜索）\n- 🔮 **协作编辑 / 分享**\n- 🔮 **版本历史**（git-like）\n- 🔮 **Templates**（笔记模板）\n- 🔮 **Diagrams**（Mermaid / Excalidraw 嵌入）\n\n---\n\n## 8. 欢迎分析 + 初始化流程\n\n### 8.1 触发条件\n\n- 用户首次打开 Orbit（没有 vault 或 vault 是空的）\n- 用户主动点击\"重新分析\"（设置里）\n\n### 8.2 初始化流程（5 步）\n\n```\n┌─ Step 1: 欢迎 ───────────────────────────────────────────┐\n│  \"欢迎使用 Orbit。我是你的规划者代理 Ask-Anywhere。       │\n│   在开始前，我想了解一下你。\"                             │\n│                                                         │\n│  [开始] [跳过初始化]                                     │\n└─────────────────────────────────────────────────────────┘\n\n┌─ Step 2: Vault 位置 ─────────────────────────────────────┐\n│  \"你的 Orbit vault 放在哪里？\"                            │\n│                                                         │\n│  ○ 新建一个 vault                                        │\n│  ○ 使用已有的 Obsidian vault                             │\n│  ○ 稍后设置                                              │\n└─────────────────────────────────────────────────────────┘\n\n┌─ Step 3: 存量笔记导入 ───────────────────────────────────┐\n│  \"你有存量的笔记 / 知识库想导入吗？                        │\n│   我会读它们来了解你，并给你建议 PARA 初始结构。\"          │\n│                                                         │\n│  [导入文件夹]  [添加更多]  [跳过]                         │\n│                                                         │\n│  已添加:                                                 │\n│  ┌─────────────────────────────────────────────────┐    │\n│  │ 📂 Obsidian 2023 Archive                         │    │\n│  │    /Users/.../obsidian-vault                     │    │\n│  │    ✓ 1247 个笔记                                  │    │\n│  │    权限: ⦿ 可读写  ○ 只读                         │    │\n│  │    [移除]                                        │    │\n│  └─────────────────────────────────────────────────┘    │\n└─────────────────────────────────────────────────────────┘\n\n┌─ Step 4: 欢迎分析（进行中）──────────────────────────────┐\n│  \"我在读你的笔记...\"                                     │\n│  [████████████░░░░░░░░]  62%                            │\n│                                                         │\n│  扫描中: obsidian-2023/projects/...                      │\n│  已发现: 47 个主题、12 个人物、3 个活跃项目               │\n└─────────────────────────────────────────────────────────┘\n\n┌─ Step 5: 分析结果 + 初始化建议 ──────────────────────────┐\n│  \"我读完了。以下是我的观察：\"                             │\n│                                                         │\n│  📚 核心主题（可立为 Resource）:                          │\n│    ⦿ Second Brain / 知识管理 (42 次提及)                 │\n│    ⦿ 工程领导力 (28 次)                                   │\n│    ⦿ 创业与商业洞察 (19 次)                              │\n│    ○ AI 与 Agent (14 次)                                  │\n│    [手动调整]                                            │\n│                                                         │\n│  🎯 看起来在做的项目（可立为 Project）:                   │\n│    ⦿ Orbit 应用开发 (最近活跃)                           │\n│    ⦿ 个人知识库迁移                                       │\n│    [手动调整]                                            │\n│                                                         │\n│  🗺️ 责任领域（可立为 Area）:                              │\n│    ⦿ 工程 team lead                                       │\n│    ⦿ 家庭与健康                                           │\n│    [手动调整]                                            │\n│                                                         │\n│  📅 下一步建议:                                          │\n│    \"你的愿景还没设置。完成 PARA 初始化后，                │\n│     我建议你花 10 分钟和我对话，一起梳理愿景。\"           │\n│                                                         │\n│  [应用以上建议]  [逐项确认]  [全部跳过]                   │\n└─────────────────────────────────────────────────────────┘\n```\n\n### 8.3 欢迎分析的实现（Ask-Anywhere Skill）\n\n在 Phase 1 的 Skill 清单里我们标记过：`orbit-welcome-analysis`。\n\n实现要点：\n\n```typescript\n// src/main/ask-anywhere/skills/welcome-analysis.ts\n\nexport const welcomeAnalysisSkill: Skill = {\n  id: 'orbit-welcome-analysis',\n  name: '欢迎分析',\n  trigger: 'explicit',  // 不是自动激活，由初始化流程显式调用\n  \n  async analyze(kbPaths: string[]): Promise<WelcomeAnalysisResult> {\n    // 1. 扫描所有 KB，提取 markdown 文件\n    // 2. 用 LLM 批量处理（分批避免 context 爆炸），提取:\n    //    - 高频主题（标签 / 关键词 tf-idf）\n    //    - 活跃项目（最近修改 + 有明确目标的笔记）\n    //    - 责任领域（长期出现但无具体项目）\n    //    - 人物（@提及、[[人名]] 链接）\n    // 3. 返回结构化结果\n  }\n};\n\ninterface WelcomeAnalysisResult {\n  topics: Array<{ name: string; mentions: number; sample_notes: string[]; suggested_as: 'resource' }>;\n  projects: Array<{ name: string; recent_activity: string; suggested_as: 'project' }>;\n  areas: Array<{ name: string; commitment_hints: string[]; suggested_as: 'area' }>;\n  people: Array<{ name: string; context: string }>;\n}\n```\n\n### 8.4 Vision 初始化钩子（本 Phase 不实现，但预留）\n\n在 Step 5 之后，初始化流程**建议**用户继续做 Vision 初始化：\n\n```\n\"你的愿景还没设置。这对 Orbit 很重要——它决定了我帮你怎么规划。\n 花 10 分钟和我对话设置？\"\n\n[去设置愿景]  [稍后]\n```\n\n点击\"去设置愿景\"跳转到 Vision 初始化界面（本 Phase 不实现，返回 \"Coming Soon\"）。\n\n代码里保留这个路由和跳转逻辑，待 Vision Phase 填充。\n\n---\n\n## 9. Ask-Anywhere 相关 Skill 接入\n\n本文档涉及 3 个 skill 的 stub 实现（skill 完整设计见未来单独讨论）：\n\n### 9.1 `orbit-capture`（捕获）\n- 触发：用户说\"记一下\"、\"捕获\"、\"想到\"、\"保存\"\n- 行为：创建 `notes/captures/` 或 `notes/thoughts/` 笔记\n- 自动判断 PARA 归属：基于当前 active focus + 近期笔记主题相似度\n\n### 9.2 `orbit-retrieve`（检索）\n- 触发：用户说\"我之前写过\"、\"有没有笔记关于\"、\"查一下\"\n- 行为：跨 notes / library / kb 语义搜索\n- 返回：Note/Library 列表 + 相关度\n\n### 9.3 `orbit-welcome-analysis`（首次导入后分析）\n- 触发：初始化流程 / 用户手动\n- 行为：如 8.3 节\n\n**skill 完整清单**：Phase 1 定义 10 个，本 Phase 实装上面 3 个 stub，其余后续。\n\n---\n\n## 10. IPC / API 接口\n\n### 10.1 Main Process\n\n```typescript\n// src/main/note/ipc.ts\n\nIPC.notes = {\n  // 列表\n  list: (filter?: NoteFilter): Promise<Note[]> => {},\n  \n  // 单个\n  get: (noteId: string): Promise<Note | null> => {},\n  getByPath: (path: string): Promise<Note | null> => {},\n  \n  // 创建/更新/删除\n  create: (input: CreateNoteInput): Promise<Note> => {},\n  update: (noteId: string, patch: Partial<NoteFrontmatter> & { body?: string }): Promise<Note> => {},\n  delete: (noteId: string): Promise<void> => {},\n  archive: (noteId: string): Promise<void> => {},\n  \n  // 搜索\n  search: (query: string, options?: SearchOptions): Promise<Note[]> => {},\n  \n  // 订阅变化（双工：Orbit UI 改动 + Obsidian 外部改动）\n  subscribe: (cb: (event: NoteChangeEvent) => void): () => void => {},\n};\n\nIPC.library = {\n  list: (filter?: LibraryFilter) => {},\n  get: (id: string) => {},\n  addUrl: (url: string) => {},                   // 从 URL 抓取文章\n  addFile: (path: string) => {},                 // 导入本地文件\n  addBookmark: (url: string, metadata?: {...}) => {},\n  annotate: (itemId: string, annotation: LibraryAnnotation) => {},\n  distillToNote: (itemId: string, annotationId?: string) => Promise<Note> => {},\n};\n\nIPC.feeds = {\n  sources: {\n    list: () => {},\n    add: (source: FeedSource) => {},\n    remove: (sourceId: string) => {},\n    update: (sourceId: string, patch: Partial<FeedSource>) => {},\n  },\n  items: {\n    list: (filter?: FeedFilter) => {},\n    saveToLibrary: (itemId: string) => {},\n    dismiss: (itemId: string) => {},\n  },\n  refresh: (sourceId?: string) => {},             // 立即拉取\n};\n\nIPC.knowledgeBase = {\n  list: () => {},                                 // 所有 KB\n  import: (input: {\n    name: string;\n    sourcePath: string;\n    sourceType: KnowledgeBase['source_type'];\n    writable?: boolean;\n  }) => Promise<KnowledgeBase> => {},\n  remove: (kbId: string, deleteFiles?: boolean) => {},\n  rescan: (kbId: string) => {},\n  search: (kbId: string | 'all', query: string) => {},\n  \n  // 激活机制\n  activate: (input: {\n    kbId: string;\n    sourceFile: string;\n    excerpt: string;\n    targetType?: 'thought' | 'capture';\n    userText?: string;                             // 用户追加的文字\n  }) => Promise<Note> => {},\n};\n\nIPC.para = {\n  archive: (entityRef: string) => {},\n  unarchive: (archiveRef: string) => {},\n  move: (entityRef: string, newParaKind: NotePARAKind, newParaRef?: string) => {},\n};\n\nIPC.onboarding = {\n  status: () => Promise<OnboardingStatus> => {},   // 初始化到了哪一步\n  skip: () => {},\n  runWelcomeAnalysis: (kbIds: string[]) => Promise<WelcomeAnalysisResult> => {},\n  applySuggestions: (suggestions: WelcomeAnalysisResult) => {},\n};\n```\n\n### 10.2 事件发布（进 TraceableEvent）\n\n```typescript\n// 在 src/shared/events/kinds.ts 新增\nexport const NOTE_EVENT_KINDS = [\n  'note.created',\n  'note.updated',\n  'note.deleted',\n  'note.archived',\n] as const;\n\nexport const LIBRARY_EVENT_KINDS = [\n  'library.item.added',\n  'library.item.annotated',\n  'library.item.status_changed',\n  'library.item.distilled',\n] as const;\n\nexport const FEED_EVENT_KINDS = [\n  'feed.source.added',\n  'feed.source.removed',\n  'feed.items.fetched',\n  'feed.item.saved_to_library',\n  'feed.item.dismissed',\n] as const;\n\nexport const KB_EVENT_KINDS = [\n  'kb.imported',\n  'kb.removed',\n  'kb.scanned',\n  'kb.activated',                    // 激活一段到 notes\n  'kb.welcome_analysis_completed',\n] as const;\n\nexport const PARA_EVENT_KINDS = [\n  'para.archived',\n  'para.unarchived',\n  'para.moved',\n] as const;\n```\n\n这些事件会被 Daily Timeline 消费（见文档 5）。\n\n---\n\n## 11. 迁移 / 兼容策略\n\n### 11.1 现有数据处理\n\n| 现有内容 | 迁移策略 |\n|---------|---------|\n| 现有的 thoughts（如果有散落的） | 扫描 + 移动到 `notes/thoughts/`，补齐 frontmatter |\n| 现有的 library（Phase 1 之前有的话）| 原结构保留，迁移到 `library/` 顶层 |\n| projects / areas（Phase 1 已有）| 不动 |\n\n迁移脚本：`src/main/migrations/phase2-note-system.ts`\n- 启动时检查 vault 里是否有\"旧结构\"\n- 有则提示用户\"发现旧数据，自动迁移？\"\n- 用户同意后执行（原子操作，失败回滚）\n- 迁移完成后写入 `.orbit/migrations.json` 标记\n\n### 11.2 Obsidian vault 兼容\n\n- 如果用户的 vault 原本就是 Obsidian vault，导入时**识别 `.obsidian/`** 目录，不破坏\n- 用户在 Obsidian 里改动笔记（外部修改）→ Orbit 文件系统 watcher 感知 → 更新内存索引 → UI 刷新\n- Orbit 写入的 frontmatter 对 Obsidian **完全兼容**（YAML 格式、标准字段名）\n\n### 11.3 冲突处理\n\n- 文件系统 win：Orbit 内存状态以磁盘为准\n- 用户同时在 Orbit 和 Obsidian 编辑同一文件：**磁盘最后写入的胜出**，Orbit 收到文件变化事件后丢弃内存未保存的改动（但弹出提示）\n\n---\n\n## 12. 实施步骤（AI 执行顺序）\n\n**每一步完成后必须 build 通过，可独立 commit。**\n\n### Step 1: 数据模型 + 存储基础（半天）\n1. 新建 `src/shared/note/types.ts`\n2. 新建 `src/shared/library/types.ts`\n3. 新建 `src/shared/feed/types.ts`\n4. 新建 `src/shared/knowledge-base/types.ts`\n5. 新建 `src/main/note/store.ts`（CRUD + frontmatter 解析）\n6. 新建 `src/main/library/store.ts`\n7. 新建 `src/main/feed/store.ts`\n8. 新建 `src/main/knowledge-base/store.ts`\n9. 补齐 `src/shared/events/kinds.ts` 新增事件\n\n### Step 2: IPC + 事件发布（半天）\n1. `src/main/note/ipc.ts`\n2. `src/main/library/ipc.ts`\n3. `src/main/feed/ipc.ts`\n4. `src/main/knowledge-base/ipc.ts`\n5. `src/main/para/ipc.ts`\n6. `src/main/onboarding/ipc.ts`\n7. preload 暴露\n8. 所有 CUD 操作发布 TraceableEvent\n\n### Step 3: Notes 一级入口 UI MVP（1 天）\n1. 新建 `src/renderer/views/NotesView.tsx`\n2. 新建 `src/renderer/components/NoteList.tsx`\n3. 新建 `src/renderer/components/NoteEditor.tsx`（基础 markdown 编辑）\n4. 新建 `src/renderer/components/NoteFilters.tsx`\n5. 左侧栏添加入口\n6. 路由 `/notes`、`/notes/:noteId`\n\n### Step 4: Library 基础 UI（半天）\n1. 新建 `src/renderer/views/LibraryView.tsx`\n2. LibraryItem 列表 + 详情\n3. \"Add from URL\" / \"Add PDF\" / \"Add Bookmark\" 入口\n4. 集成到 Ask-Anywhere（用户说\"我保存一下这个链接...\"）\n\n### Step 5: Feed 基础 UI（半天）\n1. `src/renderer/views/FeedView.tsx`\n2. 订阅源管理\n3. Feed items 浏览 + save/dismiss\n4. 定时拉取机制（与定时任务系统协同，详见文档 2）\n\n### Step 6: Knowledge Base 导入 + 激活（1 天）\n1. KB 导入向导（文件夹选择 + 类型检测）\n2. KB 扫描 + 索引（全文 + 简单向量）\n3. 激活机制 UI（在 KB 笔记里选中段落 → 激活按钮）\n4. 激活后创建 Note 并跳转编辑\n\n### Step 7: 欢迎分析 + 初始化流程（1 天）\n1. 初始化检测逻辑（`src/main/onboarding/manager.ts`）\n2. 初始化向导 UI（5 步流程）\n3. `orbit-welcome-analysis` skill stub 实现\n4. 应用建议的 Project/Area/Resource 初始化\n5. Vision 初始化钩子（跳转占位）\n\n### Step 8: Obsidian 兼容（文件系统 watcher，半天）\n1. `chokidar` 或 Node `fs.watch` 监听 `notes/` 和 `knowledge-base/`\n2. 外部变化 → 重新加载 → 发事件到 UI\n3. 冲突处理（磁盘 win + UI 提示）\n\n### Step 9: 迁移脚本（半天）\n1. 扫描旧数据\n2. 迁移 UI + 进度条\n3. 回滚机制\n\n### Step 10: 测试 + 收尾（半天）\n1. 集成测试：完整流程走一遍（导入 KB → 欢迎分析 → 创建 note → 编辑 → 激活）\n2. Obsidian 兼容验证（在 Obsidian 里改，Orbit 能同步）\n3. CHANGELOG + ADR-016（本文档定稿为 ADR）\n\n**总计：约 6~7 天 AI 实施**\n\n---\n\n## 13. 验收标准\n\n### 功能\n- [ ] Notes 一级入口可见，能看到所有笔记\n- [ ] 能创建 4 种类型的 note（thought/longform/capture/voice_log），frontmatter 正确\n- [ ] 能编辑、删除、归档\n- [ ] wikilink 自动补全工作（输入 `[[` 弹出列表）\n- [ ] 反向链自动计算\n- [ ] Library 能添加 URL 文章、PDF、书签\n- [ ] Feed 能订阅 RSS / Newsletter\n- [ ] KB 能导入（至少 obsidian 类型）\n- [ ] 激活机制工作（从 KB 选段 → 生成 note，原 KB 文件不变）\n- [ ] 欢迎分析初始化流程走通\n- [ ] PARA 归属能正确设置\n- [ ] 归档能正常移动文件\n\n### 数据\n- [ ] 所有写入 `notes/` 的文件是标准 markdown + YAML frontmatter\n- [ ] Obsidian 能打开 vault 并正常显示\n- [ ] 在 Obsidian 里编辑笔记，Orbit 能感知并刷新\n- [ ] 删除文件的原子性保证（失败不留半截）\n\n### 事件\n- [ ] CRUD 操作都发布对应 TraceableEvent\n- [ ] 事件能在 DeveloperConsoleView 看到\n\n### 兼容\n- [ ] 旧数据迁移工作（如果有）\n- [ ] Phase 1 的 Task / Conversation / Ask-Anywhere 功能不受影响\n\n---\n\n## 14. Future-Proof 预留\n\n架构上预留但本 Phase 不实现：\n\n- **笔记加密**：`NoteFrontmatter.visibility: 'private'` 字段已定义，未来可扩展为加密存储\n- **笔记版本历史**：考虑在 `.orbit/note-history/<id>/<version>.md` 存历史\n- **协作/同步**：frontmatter 已有 `author` 字段，未来扩展多人\n- **Templates**：`notes/_templates/` 目录预留\n- **AI 增强编辑**：编辑器组件设计时预留 plugin 接口\n\n---\n\n## 附录：和既有决策的映射\n\n| Phase 1 决策 | 本文档如何承接 |\n|------------|---------------|\n| D-5 Conversation 一等公民 | Note 也可作为 Conversation 的 anchor（讨论某条笔记） |\n| D-6 各地方自己配置 auto agent | Note / Library 也可以配置自动 agent（如自动打标签） |\n| ADR-014 Chat 解耦 | Notes 页面里的\"💬 和 Ask-Anywhere 讨论\" 按钮复用 ChatView |\n| ADR-015 Ask-Anywhere 规划者 | 欢迎分析是 Ask-Anywhere 的第一个 skill 实战 |\n","toolExplanation":"输出文档 1：笔记系统"})

---

## [Tool] 2026-04-27T11:10:51.569Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/01-note-system-and-para.md","size":40447,"append":false}

---

## [Assistant] 2026-04-27T11:11:28.038Z
### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"d1","status":"completed","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"in_progress","content":"文档 2：定时任务一级入口"}],"toolExplanation":"文档 1 完成，切换文档 2"})

---

## [Tool] 2026-04-27T11:11:28.045Z
{"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"completed","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"in_progress","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"pending","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"pending","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-27T11:12:49.147Z
---

# 📄 文档 2：定时任务一级入口

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/02-scheduled-tasks-ui.md","content":"# 文档 2：定时任务一级入口\n\n> **规模**：M（约 1~2 天 AI 实施）\n> **依赖**：Phase 1 完成；底层 scheduled_task MCP 工具已有\n> **产物**：左侧栏 Scheduled Tasks 入口 + 列表 + 详情 + 创建向导 + 执行历史 + Ask-Anywhere 语义创建\n\n---\n\n## 1. 设计哲学\n\n### 1.1 定位\n\n定时任务是 Orbit 里一类\"**沉默的 agent**\"——它们不等用户召唤，按时间自主唤醒、执行、产出、归档。\n\n主要用途：\n1. **系统自动**：每日总结 / 每周 Area 评审 / Feed 拉取 / Resource health 扫描\n2. **用户定义**：定时 capture、定时提醒、定时复盘、定时检查某个 URL\n3. **Ask-Anywhere 触发**：对话中用户说\"以后每天 8 点帮我...\"，AA 代建定时任务\n\n### 1.2 和现有 MCP 工具的关系\n\n系统已有 `scheduled_task` MCP server（`scheduled_task_create`/`list`/`get`/`update`/`delete`/`run`/`executions`），**不新建底层**，本文档只做：\n- UI 层：展示 + 操作\n- 语义层：Ask-Anywhere 如何通过自然语言创建 / 修改 / 查询\n- 系统级默认任务：预置几个对 Orbit 本身有用的任务\n\n---\n\n## 2. 数据模型（与 MCP 工具对齐）\n\n```typescript\n// src/shared/scheduled-task/types.ts\n\nexport type ScheduleKind = \n  | 'cron'              // 标准 cron 表达式\n  | 'interval'          // 固定间隔（如每 30 分钟）\n  | 'daily'             // 每天 HH:MM\n  | 'weekly'            // 每周几的 HH:MM\n  | 'monthly'           // 每月 N 号 HH:MM\n  | 'once';             // 只跑一次（调度到一个具体时间）\n\nexport interface ScheduleConfig {\n  kind: ScheduleKind;\n  cron?: string;                    // kind=cron\n  interval_minutes?: number;        // kind=interval\n  time?: string;                    // 'HH:MM'\n  day_of_week?: number[];           // kind=weekly [0..6]\n  day_of_month?: number;            // kind=monthly\n  target_datetime?: string;         // kind=once\n  timezone?: string;                // IANA timezone，默认系统时区\n}\n\nexport type ScheduledTaskAction = \n  | { kind: 'ask_anywhere'; prompt: string; skills?: string[] }\n  | { kind: 'agent_run'; agent: string; prompt: string; runtime?: string }\n  | { kind: 'shell'; command: string; cwd?: string }\n  | { kind: 'feed_refresh'; source_id?: string }  // 若无则刷全部\n  | { kind: 'webhook'; url: string; method: 'GET' | 'POST'; body?: any };\n\nexport interface ScheduledTask {\n  id: string;\n  name: string;\n  description?: string;\n  \n  schedule: ScheduleConfig;\n  action: ScheduledTaskAction;\n  \n  // 生命周期\n  status: 'active' | 'paused' | 'disabled' | 'error';\n  created_at: string;\n  updated_at: string;\n  next_run_at?: string;\n  last_run_at?: string;\n  \n  // 源\n  source: 'system' | 'user' | 'ask_anywhere';   // 谁创建的\n  system_key?: string;                          // 如果是系统任务（e.g. 'daily-summary'）\n  \n  // PARA 关联（可选）\n  para_ref?: string;                            // 这个任务属于哪个 project/area/resource\n  \n  // 统计\n  total_runs: number;\n  success_runs: number;\n  failure_runs: number;\n  \n  // 标签\n  tags?: string[];\n}\n\nexport interface ScheduledTaskExecution {\n  id: string;\n  task_id: string;\n  triggered_at: string;\n  started_at: string;\n  completed_at?: string;\n  status: 'pending' | 'running' | 'success' | 'failure' | 'timeout';\n  \n  // 结果\n  output?: any;\n  error?: string;\n  \n  // 产物链接（如果任务产生了 Note/Conversation 等）\n  artifacts?: Array<{\n    kind: 'note' | 'conversation' | 'library_item' | 'log';\n    ref: string;\n  }>;\n  \n  // trace\n  trace_id?: string;                            // 关联 TraceableEvent\n}\n```\n\n---\n\n## 3. UI 设计\n\n### 3.1 左侧栏入口\n\n- 位置：在 Notes 下面，Projects 上面\n- icon: `AlarmClock` (lucide-react)\n- 文案: \"Scheduled\"\n- 路由: `/scheduled`\n\n### 3.2 列表页\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  Scheduled Tasks                              [+ 新建]  [⚙️]      │\n│  ────────────────────────────────────────────────────────────── │\n│                                                                  │\n│  ┌─ 筛选 ──────────────────────────────────────────────────┐     │\n│  │ 状态: [全部] [active] [paused] [error]                  │     │\n│  │ 来源: [全部] [system] [user] [ask_anywhere]             │     │\n│  │ 关联: [全部] [project] [area] [resource]                │     │\n│  └─────────────────────────────────────────────────────────┘     │\n│                                                                  │\n│  ┌─────────────────────────────────────────────────────────┐     │\n│  │ ● 每日总结                                    系统         │     │\n│  │   每天 22:00 · 下次 今天 22:00 · 最近成功                │     │\n│  │   Ask-Anywhere: \"生成今日总结\"                           │     │\n│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │\n│  ├─────────────────────────────────────────────────────────┤     │\n│  │ ● Feed 拉取                                  系统         │     │\n│  │   每 30 分钟 · 下次 14:30 · 上次 1 分钟前                │     │\n│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │\n│  ├─────────────────────────────────────────────────────────┤     │\n│  │ ● 每周技术周报提醒                          用户          │     │\n│  │   每周五 17:00 · Area: engineering-lead                 │     │\n│  │                                   [⏸] [▶️ 立即执行] [⋯] │     │\n│  ├─────────────────────────────────────────────────────────┤     │\n│  │ ⏸ 每月月度回顾（已暂停）                     用户          │     │\n│  │   每月 1 号 09:00                                        │     │\n│  │                                   [▶️ 启用] [⋯]          │     │\n│  ├─────────────────────────────────────────────────────────┤     │\n│  │ ⚠ Feed RSS 抓取（错误）                     系统          │     │\n│  │   错误: Source http://... 连续失败 3 次                   │     │\n│  │                                   [查看] [禁用] [⋯]      │     │\n│  └─────────────────────────────────────────────────────────┘     │\n│                                                                  │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 3.3 详情页\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  ← 返回   每日总结                     [保存] [删除] [⋯]           │\n│  ────────────────────────────────────────────────────────────── │\n│                                                                  │\n│  ┌── 基本信息 ──────────────────────────────────────────────┐    │\n│  │ 名称: 每日总结                                            │    │\n│  │ 描述: 每晚自动生成当日 Timeline 总结卡片                   │    │\n│  │ 状态: [active ▼]  来源: system                           │    │\n│  │ 标签: [daily, summary, system]                           │    │\n│  └─────────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 调度 ──────────────────────────────────────────────────┐    │\n│  │ 类型: [每天 ▼]                                            │    │\n│  │ 时间: [22:00]    时区: [Asia/Shanghai ▼]                 │    │\n│  │                                                          │    │\n│  │ 下次执行: 今天 22:00 (约 7 小时后)                        │    │\n│  └─────────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 动作 ──────────────────────────────────────────────────┐    │\n│  │ 类型: [Ask-Anywhere ▼]                                   │    │\n│  │                                                          │    │\n│  │ Prompt:                                                  │    │\n│  │ ┌──────────────────────────────────────────────────────┐ │    │\n│  │ │ 基于今天的 Timeline 事件，生成 150-300 字总结...       │ │    │\n│  │ └──────────────────────────────────────────────────────┘ │    │\n│  │                                                          │    │\n│  │ 使用 Skills: [orbit-retrieve, orbit-express]             │    │\n│  └─────────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 执行历史（最近 10 次）───────────────────────────────────┐   │\n│  │ ✓ 2026-04-29 22:00  成功  耗时 12s  产出 note            │    │\n│  │ ✓ 2026-04-28 22:00  成功  耗时 15s  产出 note            │    │\n│  │ ✗ 2026-04-27 22:00  失败  timeout                        │    │\n│  │ ✓ 2026-04-26 22:00  成功  耗时 11s  产出 note            │    │\n│  │ ...                                         [查看全部]    │    │\n│  └─────────────────────────────────────────────────────────┘    │\n│                                                                  │\n│  ┌── 高级 ──────────────────────────────────────────────────┐    │\n│  │ 超时: [60 秒]                                             │    │\n│  │ 失败后: [重试 3 次] [禁用]                                │    │\n│  │ 关联 PARA: [无 ▼]                                         │    │\n│  └─────────────────────────────────────────────────────────┘    │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 3.4 创建向导（简化流程）\n\n点击 `+ 新建` 弹出模态框：\n\n```\n┌──────────────────────────────────────────────────────────┐\n│  新建定时任务                                  [x]       │\n│  ────────────────────────────────────────────────────── │\n│                                                         │\n│  你想让我做什么？                                        │\n│  ┌──────────────────────────────────────────────────┐  │\n│  │ 例如: 每天早上 8 点提醒我写日报                     │  │\n│  │       每周五下午 5 点总结本周 Area 健康状况         │  │\n│  └──────────────────────────────────────────────────┘  │\n│                                                         │\n│  [用 Ask-Anywhere 自然语言创建 →]                        │\n│                                                         │\n│  或手动填写：                                            │\n│  名称: [________________]                                │\n│  调度: ○ cron  ⦿ 每天  ○ 每周  ○ 每月  ○ 自定义间隔   │\n│  时间: [08:00]                                           │\n│  动作类型: [Ask-Anywhere ▼]                              │\n│  Prompt: [________________]                              │\n│                                                         │\n│  [取消]                          [创建]                  │\n└──────────────────────────────────────────────────────────┘\n```\n\n### 3.5 Ask-Anywhere 语义创建（关键体验）\n\n点击\"用 Ask-Anywhere 自然语言创建\"后：\n1. 跳转到 Ask-Anywhere Chat\n2. 自动激活 `orbit-scheduling` skill\n3. AA 主动问：\"好，你想让我做什么？什么时候？\"\n4. 用户对话式输入\n5. AA 解析出 schedule + action，show preview card\n6. 用户确认 → 调用 `scheduled_task_create`\n\n对话示例：\n```\n用户：以后每天早上 8 点提醒我写日报\nAA:   好，让我理解一下：\n      · 什么时候：每天早上 8:00（时区：Asia/Shanghai）\n      · 做什么：发送一个提醒（需要通知中心）\n      \n      [确认创建]  [调整参数]  [取消]\n```\n\n---\n\n## 4. 系统预置定时任务\n\nOrbit 启动时确保以下\"系统任务\"存在（`source: 'system'`）。用户可以 pause/disable，但无法 delete（只能禁用）：\n\n### 4.1 每日总结\n```typescript\n{\n  name: '每日总结',\n  system_key: 'daily-summary',\n  description: '每晚自动生成当日 Timeline 的 AI 总结',\n  schedule: { kind: 'daily', time: '22:00' },\n  action: {\n    kind: 'ask_anywhere',\n    prompt: DAILY_SUMMARY_PROMPT,    // 见文档 5\n    skills: ['orbit-retrieve', 'orbit-express'],\n  },\n}\n```\n\n### 4.2 Feed 定时拉取\n```typescript\n{\n  name: 'Feed 拉取',\n  system_key: 'feed-refresh',\n  description: '每 30 分钟拉取所有订阅源',\n  schedule: { kind: 'interval', interval_minutes: 30 },\n  action: { kind: 'feed_refresh' },\n}\n```\n\n### 4.3 Resource 健康扫描（周）\n```typescript\n{\n  name: 'Resource 健康扫描',\n  system_key: 'resource-health-scan',\n  description: '每周扫描所有 Resource 的活跃度，把 dormant 的 flag 出来',\n  schedule: { kind: 'weekly', day_of_week: [0], time: '09:00' },  // 周日 9 点\n  action: {\n    kind: 'ask_anywhere',\n    prompt: '扫描所有 active resource，如果某个 resource 超过 4 周没有新 engagement，把它 flag 为 dormant 并在 Inbox 提醒我。',\n  },\n}\n```\n\n### 4.4 Area 周评审提醒（周）\n```typescript\n{\n  name: 'Area 周评审提醒',\n  system_key: 'area-weekly-review',\n  description: '每周五下午提醒评审 Area',\n  schedule: { kind: 'weekly', day_of_week: [5], time: '17:00' },\n  action: {\n    kind: 'ask_anywhere',\n    prompt: '帮我检查所有 review_cadence=weekly 的 Area，列出本周是否完成评审；未完成的写到 Inbox。',\n  },\n}\n```\n\n### 4.5 KB 增量扫描（日）\n```typescript\n{\n  name: 'KB 增量扫描',\n  system_key: 'kb-incremental-scan',\n  description: '每天凌晨扫描 KB 变化',\n  schedule: { kind: 'daily', time: '03:00' },\n  action: {\n    kind: 'ask_anywhere',\n    prompt: '扫描所有 KB 在过去 24 小时内的新增/修改笔记，更新索引。',\n  },\n}\n```\n\n---\n\n## 5. IPC / API\n\n```typescript\n// src/main/scheduled-task/ipc.ts\n\nIPC.scheduledTasks = {\n  // 列表\n  list: (filter?: ScheduledTaskFilter) => Promise<ScheduledTask[]> => {},\n  \n  // 单个\n  get: (taskId: string) => Promise<ScheduledTask | null> => {},\n  \n  // 创建/更新/删除\n  create: (input: CreateScheduledTaskInput) => Promise<ScheduledTask> => {},\n  update: (taskId: string, patch: Partial<ScheduledTask>) => Promise<ScheduledTask> => {},\n  delete: (taskId: string) => Promise<void> => {},   // 系统任务报错\n  \n  // 生命周期\n  pause: (taskId: string) => {},\n  resume: (taskId: string) => {},\n  triggerNow: (taskId: string) => Promise<ScheduledTaskExecution> => {},\n  \n  // 历史\n  executions: (taskId: string, limit?: number, offset?: number) => Promise<ScheduledTaskExecution[]> => {},\n  \n  // 订阅事件\n  subscribe: (cb: (event: ScheduledTaskEvent) => void) => () => void => {},\n  \n  // 自然语言解析（Ask-Anywhere 用）\n  parseNaturalLanguage: (text: string) => Promise<{\n    schedule: ScheduleConfig;\n    action: ScheduledTaskAction;\n    confidence: number;\n  }> => {},\n};\n\n// 事件\nexport const SCHEDULED_TASK_EVENT_KINDS = [\n  'scheduled_task.created',\n  'scheduled_task.updated',\n  'scheduled_task.deleted',\n  'scheduled_task.paused',\n  'scheduled_task.resumed',\n  'scheduled_task.execution.started',\n  'scheduled_task.execution.completed',\n  'scheduled_task.execution.failed',\n] as const;\n```\n\n### 5.1 底层对接现有 MCP\n\n本层 IPC 的实现**包装现有 `scheduled_task` MCP tool**，不重写调度器：\n\n```typescript\nasync function create(input) {\n  const result = await mcpCall('scheduled_task', 'scheduled_task_create', input);\n  emitTraceableEvent('scheduled_task.created', { taskId: result.id, ... });\n  return result;\n}\n```\n\n---\n\n## 6. `orbit-scheduling` Skill\n\n```typescript\n// src/main/ask-anywhere/skills/scheduling.ts\n\nexport const schedulingSkill: Skill = {\n  id: 'orbit-scheduling',\n  name: '定时任务',\n  triggers: ['每天', '定时', '提醒', '每周', '每月', 'schedule', 'remind'],\n  \n  async describe() {\n    // 系统 prompt 片段，告诉 LLM 能做什么\n    return `你可以帮用户创建/管理定时任务。支持 cron、每天 HH:MM、每周几、每月 N 号、固定间隔、一次性。\n            创建前务必让用户确认 schedule 和 action。`;\n  },\n  \n  tools: [\n    {\n      name: 'create_scheduled_task',\n      description: '创建一个定时任务',\n      parameters: { /* 对应 CreateScheduledTaskInput */ },\n      execute: (params) => IPC.scheduledTasks.create(params),\n    },\n    {\n      name: 'list_scheduled_tasks',\n      description: '列出用户的定时任务',\n      parameters: { /* filter */ },\n      execute: IPC.scheduledTasks.list,\n    },\n    // update / delete / pause / trigger_now ...\n  ],\n};\n```\n\n---\n\n## 7. 实施步骤\n\n### Step 1: 数据模型 + IPC 包装（半天）\n1. `src/shared/scheduled-task/types.ts`\n2. `src/main/scheduled-task/ipc.ts`（包装现有 MCP 工具）\n3. `src/main/scheduled-task/event-bridge.ts`（MCP 返回 → TraceableEvent）\n4. preload 暴露\n\n### Step 2: 左侧栏入口 + 列表页（半天）\n1. `src/renderer/views/ScheduledTasksView.tsx`\n2. `src/renderer/components/ScheduledTaskList.tsx`\n3. `src/renderer/components/ScheduledTaskListItem.tsx`\n4. 左侧栏入口\n\n### Step 3: 详情页 + 编辑（半天）\n1. `src/renderer/views/ScheduledTaskDetailView.tsx`\n2. `src/renderer/components/ScheduleConfigEditor.tsx`（cron/daily/weekly/monthly/interval/once 切换）\n3. `src/renderer/components/ActionConfigEditor.tsx`（action 类型切换 + 参数表单）\n4. 执行历史面板\n\n### Step 4: 创建向导（半天）\n1. 模态框 UI\n2. 手动填写流程\n3. \"用 AA 自然语言创建\"的入口（跳 Ask-Anywhere 并带上意图）\n\n### Step 5: `orbit-scheduling` skill（半天）\n1. 实现 skill\n2. 注册到 Ask-Anywhere\n3. 对话式创建流程（AA 解析 + preview card + 确认）\n\n### Step 6: 系统预置任务（半天）\n1. Orbit 启动时 `ensureSystemTasks()`\n2. 5 个系统任务定义\n3. 系统任务的\"不可删除\"保护\n\n### Step 7: 测试 + 收尾（半天）\n1. 创建/暂停/立即执行/历史查询链路\n2. Ask-Anywhere 语义创建\n3. 系统任务首次注册\n\n**总计：约 3~4 天 AI 实施**\n\n---\n\n## 8. 验收标准\n\n- [ ] 左侧栏 Scheduled 入口可见\n- [ ] 列表页能看到所有任务，含系统任务和用户任务\n- [ ] 能创建、编辑、暂停、恢复、立即执行、删除\n- [ ] 系统任务有 🔒 标记不可删除但可 pause\n- [ ] 执行历史能看到最近 N 次\n- [ ] Ask-Anywhere 能通过自然语言创建任务\n- [ ] 5 个系统任务在首次启动自动创建\n- [ ] 事件正确发到 TraceableEvent（能在 DeveloperConsole 看到）\n- [ ] 定时任务执行产生的产物（如 note）能 link 回来\n\n---\n\n## 9. Future-Proof\n\n- **条件触发**（非时间）：如 \"当 Inbox > 20 条时\" —— 数据模型 Schedule 可扩展 `trigger_kind: 'time' | 'condition'`\n- **任务链**：A 完成后触发 B —— 预留 `on_success_run: taskId`\n- **外部 webhook 触发**：action 里已有 webhook 类型\n","toolExplanation":"输出文档 2：定时任务"})

---

## [Tool] 2026-04-27T11:12:49.155Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/02-scheduled-tasks-ui.md","size":23026,"append":false}

---

## [Assistant] 2026-04-27T11:13:02.694Z
### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"d2","status":"completed","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"in_progress","content":"文档 3：Gateway Daemon + Telegram Channel"}],"toolExplanation":"文档 2 完成，切换文档 3"})

---

## [Tool] 2026-04-27T11:13:02.700Z
{"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"completed","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"completed","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"in_progress","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"pending","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-27T11:14:41.180Z
---

# 📄 文档 3：Gateway Daemon + Telegram Channel

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/03-gateway-telegram.md","content":"# 文档 3：Gateway Daemon + Telegram Channel\n\n> **规模**：L（约 3~4 天 AI 实施，含 Telegram Bot 调试）\n> **依赖**：Phase 1 Ask-Anywhere 完成；defaults runtime 可用\n> **产物**：独立 Gateway daemon + Telegram Bot + Orbit App 与 Gateway 的 IPC 协议\n\n---\n\n## 1. 设计哲学\n\n### 1.1 问题陈述\n\nOrbit 目前是一个 Electron 桌面 App。用户出门、在手机上、或 App 没开时：\n1. 想快速记一下 capture\n2. 想问 Ask-Anywhere 一个问题\n3. 想收到定时任务的提醒 / 今日总结推送\n4. 想转发一篇文章到 Library\n\n**无法**。只能等回家开电脑。\n\n### 1.2 Gateway 抽象（参考 openclaw）\n\n引入 **Gateway Daemon**——一个独立运行的后台进程（不依赖 Orbit App 界面），充当：\n- **多渠道网关**（Telegram / WhatsApp / WeChat / Email / SMS / Web Push）\n- **Orbit App 的代表**（App 不开时也能响应）\n- **外部触发入口**（webhook / shortcuts / siri）\n\n```\n   ┌──────────────┐       ┌──────────────┐      ┌──────────────┐\n   │  Telegram    │──────→│              │←────→│  Ask-Anywhere│\n   │  WhatsApp    │──────→│   Gateway    │      │  Runtime     │\n   │  Email       │──────→│   Daemon     │      └──────────────┘\n   │  Webhook     │──────→│              │      ┌──────────────┐\n   │  Shortcuts   │──────→│   (Node.js)  │←────→│  Orbit App   │\n   └──────────────┘       └──────────────┘      │  (Electron)  │\n                              ↑      ↓           └──────────────┘\n                              │   Vault File IO\n                              └────→ 直接读写 vault（Orbit App 没开也能工作）\n```\n\n### 1.3 本 Phase 范围\n\n**做**：\n- Gateway Daemon 核心（启动 / 停止 / channel 抽象）\n- Telegram Channel（完整）\n- Orbit App ↔ Gateway 的通信协议\n- 基础管理 UI（在 Orbit 里配置 Telegram Token、绑定用户）\n\n**不做**（预留扩展点）：\n- WhatsApp / WeChat / Email / SMS / Webhook 其他渠道\n- Gateway 的集群 / 云端托管（只做本地守护进程）\n- 端到端加密（本地通信默认不加密，但协议预留 `signature` 字段）\n\n---\n\n## 2. 架构\n\n### 2.1 进程结构\n\n```\n┌─────────────────────────────────────────────────────────────────┐\n│  Orbit 应用集群（用户机器）                                       │\n│                                                                 │\n│  ┌──────────────────┐         ┌──────────────────┐             │\n│  │  Orbit App       │  IPC    │  Gateway Daemon   │             │\n│  │  (Electron)      │←───────→│  (Node.js)        │             │\n│  │                  │         │                   │             │\n│  │  - UI            │         │  - Channel 管理   │             │\n│  │  - 主控面板       │         │  - Telegram Bot   │             │\n│  │  - 配置          │         │  - Routing        │             │\n│  └──────────────────┘         │  - 直接 vault I/O │             │\n│                               └──────────────────┘             │\n│                                    ↑      ↓                     │\n│                                    │      ↓                     │\n│                                    │  Vault (磁盘文件)            │\n│                                    │                             │\n│                                    ↓                             │\n│                                 外部网络                          │\n│                                    ↓                             │\n│  ┌───────────────────────────────────────────────────────┐      │\n│  │  Telegram API  /  WhatsApp API  /  Email SMTP  ...    │      │\n│  └───────────────────────────────────────────────────────┘      │\n└─────────────────────────────────────────────────────────────────┘\n```\n\n### 2.2 进程职责边界\n\n| 职责 | Orbit App | Gateway Daemon |\n|------|----------|----------------|\n| 渲染 UI | ✅ | ❌ |\n| 用户交互 | ✅ | ❌ |\n| Channel 连接（TG/WA/...） | ❌ | ✅ |\n| Ask-Anywhere 调用 | ✅（来自 App 用户）| ✅（来自远程渠道）|\n| 写 Note / Library | ✅ | ✅（代替用户）|\n| 读 vault | ✅ | ✅ |\n| 定时任务触发 | ❌（交给系统 scheduler）| ✅（监听 cron/系统 scheduler 回调）|\n| 推送通知到 channel | ❌ | ✅ |\n\n**设计原则**：两边都能直接读写 vault（以文件系统为真相源），但 App 和 Daemon 之间也需要 IPC 通信来协同（避免并发冲突 + 推消息）。\n\n### 2.3 Gateway 生命周期\n\n- **启动**：Orbit App 启动时检查 daemon 是否在，不在则 spawn（`node gateway/index.js`）\n- **独立运行**：Orbit App 关闭时 daemon **继续运行**（用户可选）\n- **停止**：用户在 UI 里显式停止，或系统关机\n- **崩溃恢复**：daemon 注册为 launchd / systemd service（可选，高阶）\n\n### 2.4 通信协议\n\n**Orbit App ↔ Gateway**：Unix Domain Socket + JSON-RPC 2.0\n\n```\nsocket path: ~/.orbit/gateway.sock (macOS/Linux)\n             \\\\.\\pipe\\orbit-gateway (Windows)\n```\n\n消息格式（JSON-RPC 2.0）：\n```json\n// App → Gateway\n{ \"jsonrpc\": \"2.0\", \"id\": \"1\", \"method\": \"channel.list\", \"params\": {} }\n\n// Gateway → App（响应）\n{ \"jsonrpc\": \"2.0\", \"id\": \"1\", \"result\": [{ \"id\": \"tg-main\", \"kind\": \"telegram\", \"status\": \"connected\" }] }\n\n// Gateway → App（push 通知）\n{ \"jsonrpc\": \"2.0\", \"method\": \"channel.message_received\", \n  \"params\": { \"channel\": \"tg-main\", \"from\": \"user-123\", \"text\": \"记一下...\" } }\n```\n\n---\n\n## 3. Channel 抽象\n\n### 3.1 接口定义\n\n```typescript\n// gateway/src/channels/types.ts\n\nexport interface IChannel {\n  id: string;\n  kind: ChannelKind;                // 'telegram' | 'whatsapp' | 'email' | ...\n  name: string;\n  \n  // 生命周期\n  start(): Promise<void>;\n  stop(): Promise<void>;\n  status(): ChannelStatus;\n  \n  // 发送\n  send(message: ChannelOutboundMessage): Promise<void>;\n  \n  // 接收（事件驱动）\n  on(event: 'message', handler: (msg: ChannelInboundMessage) => void): void;\n  on(event: 'error', handler: (err: Error) => void): void;\n  on(event: 'status', handler: (status: ChannelStatus) => void): void;\n  \n  // 配置\n  getConfig(): ChannelConfig;\n  updateConfig(patch: Partial<ChannelConfig>): Promise<void>;\n}\n\nexport type ChannelKind = \n  | 'telegram'\n  | 'whatsapp'\n  | 'email'\n  | 'sms'\n  | 'webhook'\n  | 'wechat';\n\nexport type ChannelStatus = \n  | 'disconnected'\n  | 'connecting'\n  | 'connected'\n  | 'error';\n\nexport interface ChannelInboundMessage {\n  channel_id: string;\n  from: {\n    id: string;                     // 渠道内的用户 id（如 TG user id）\n    name?: string;\n    identity_verified?: boolean;    // 是否已绑定到 Orbit user\n  };\n  kind: 'text' | 'image' | 'audio' | 'file' | 'url' | 'forward';\n  content: any;                     // 具体结构见下文\n  timestamp: string;\n  raw?: any;                        // 原始载荷（调试用）\n}\n\nexport interface ChannelOutboundMessage {\n  channel_id: string;\n  to: string;                       // 渠道内的用户 id\n  kind: 'text' | 'image' | 'file' | 'link_card';\n  content: any;\n}\n```\n\n### 3.2 Telegram Channel 实现\n\n```typescript\n// gateway/src/channels/telegram.ts\n\nimport { Telegraf } from 'telegraf';   // 用 telegraf 库\n\nexport class TelegramChannel implements IChannel {\n  kind = 'telegram' as const;\n  private bot: Telegraf;\n  private config: TelegramChannelConfig;\n  private emitter = new EventEmitter();\n  \n  constructor(config: TelegramChannelConfig) {\n    this.config = config;\n    this.id = config.id;\n    this.name = config.name;\n    this.bot = new Telegraf(config.bot_token);\n    this.setupHandlers();\n  }\n  \n  private setupHandlers() {\n    // 文本消息\n    this.bot.on('text', (ctx) => {\n      const from_id = ctx.from.id.toString();\n      if (!this.isAuthorized(from_id)) {\n        ctx.reply('你还没有绑定到 Orbit 账号。请在 Orbit 应用的 Gateway 设置里获取绑定码。');\n        return;\n      }\n      this.emitter.emit('message', {\n        channel_id: this.id,\n        from: { id: from_id, name: ctx.from.first_name, identity_verified: true },\n        kind: 'text',\n        content: { text: ctx.message.text },\n        timestamp: new Date().toISOString(),\n        raw: ctx.message,\n      });\n    });\n    \n    // URL 转发 → 自动收藏到 Library\n    this.bot.on('message', (ctx) => {\n      const msg = ctx.message as any;\n      if (msg.entities?.some(e => e.type === 'url')) { /* ... */ }\n    });\n    \n    // 图片\n    this.bot.on('photo', (ctx) => { /* ... */ });\n    \n    // 语音\n    this.bot.on('voice', (ctx) => { /* ... */ });\n    \n    // 文件\n    this.bot.on('document', (ctx) => { /* ... */ });\n    \n    // 命令\n    this.bot.command('start', (ctx) => ctx.reply(WELCOME_MSG));\n    this.bot.command('bind', (ctx) => this.handleBindCommand(ctx));\n    this.bot.command('help', (ctx) => ctx.reply(HELP_MSG));\n  }\n  \n  async start() {\n    await this.bot.launch();\n    this.emitter.emit('status', 'connected');\n  }\n  \n  async stop() {\n    this.bot.stop();\n  }\n  \n  async send(msg: ChannelOutboundMessage) {\n    switch (msg.kind) {\n      case 'text':\n        await this.bot.telegram.sendMessage(msg.to, msg.content.text, {\n          parse_mode: 'Markdown',\n        });\n        break;\n      case 'image':\n        await this.bot.telegram.sendPhoto(msg.to, msg.content.url);\n        break;\n      case 'file':\n        await this.bot.telegram.sendDocument(msg.to, { source: msg.content.path });\n        break;\n      case 'link_card':\n        // 发带预览的链接\n        await this.bot.telegram.sendMessage(msg.to, \n          `*${msg.content.title}*\\n${msg.content.description}\\n${msg.content.url}`,\n          { parse_mode: 'Markdown' });\n        break;\n    }\n  }\n  \n  // ...\n}\n\ninterface TelegramChannelConfig {\n  id: string;\n  name: string;\n  bot_token: string;\n  authorized_users: Array<{\n    tg_user_id: string;\n    orbit_user_id: string;\n    bound_at: string;\n  }>;\n}\n```\n\n### 3.3 绑定流程（安全）\n\nTelegram 是公开的，任何人知道 Bot 的名字都能 @它。必须绑定机制：\n\n```\n┌─ Orbit 应用里 ──────────────────────────┐    \n│  设置 → Gateway → Telegram              │\n│                                        │\n│  生成绑定码: [ABC123]                    │\n│  有效期: 10 分钟                         │\n│                                        │\n│  使用方法：                              │\n│  1. 打开 Telegram，搜索 @OrbitBot（你的）│\n│  2. 发送: /bind ABC123                  │\n│  3. 完成绑定                            │\n└────────────────────────────────────────┘\n```\n\n绑定码机制：\n- Orbit App 生成 6 位随机码，写入 Gateway config: `pending_binds: [{ code, orbit_user_id, expires_at }]`\n- TG 用户发 `/bind ABC123` → Gateway 查 code → 匹配成功 → 添加 `authorized_users`\n- 绑定成功后 TG 端回复\"已绑定\"\n\n---\n\n## 4. 消息路由（Telegram → Ask-Anywhere）\n\n### 4.1 路由规则\n\n收到 TG 文本消息时，Gateway 判断意图：\n\n```typescript\n// gateway/src/router.ts\n\nasync function routeInboundMessage(msg: ChannelInboundMessage) {\n  if (msg.kind !== 'text') return routeByKind(msg);\n  \n  const text = msg.content.text.trim();\n  \n  // 1. 命令（以 / 开头）\n  if (text.startsWith('/')) return handleCommand(text, msg);\n  \n  // 2. URL → 自动 save to library\n  if (isURL(text)) return saveToLibrary(text, msg);\n  \n  // 3. 快捷记笔记（以 # 开头）\n  //    例: \"# 想到 Resource 涌现机制应该...\"\n  if (text.startsWith('#')) return quickCapture(text.slice(1).trim(), msg);\n  \n  // 4. 默认：丢给 Ask-Anywhere\n  return askAnywhere(text, msg);\n}\n```\n\n### 4.2 Ask-Anywhere 调用\n\nGateway 有一个**轻量 Ask-Anywhere Runtime 客户端**（不是完整 runtime，而是调用方）：\n\n```typescript\nasync function askAnywhere(text: string, msg: ChannelInboundMessage) {\n  const conversation = await getOrCreateRemoteConversation(msg.from.id);\n  \n  // 发给 Orbit App（通过 Unix socket JSON-RPC）\n  // 如果 App 不在，Gateway 直接调用 runtime 的 CLI 入口\n  const response = await invokeAskAnywhere({\n    conversation_id: conversation.id,\n    user_message: text,\n    source: {\n      channel: msg.channel_id,\n      user: msg.from.id,\n    },\n  });\n  \n  // 把响应发回 TG\n  await channel.send({\n    channel_id: msg.channel_id,\n    to: msg.from.id,\n    kind: 'text',\n    content: { text: response.text },\n  });\n  \n  // 如果产生了产物，追加一条 link 消息\n  for (const artifact of response.artifacts ?? []) {\n    await channel.send({\n      channel_id: msg.channel_id,\n      to: msg.from.id,\n      kind: 'link_card',\n      content: { title: artifact.title, description: artifact.description, url: artifact.deeplink },\n    });\n  }\n}\n```\n\n**关键**：Ask-Anywhere 的调用要支持两种模式：\n- **App 在线**：Gateway → IPC → App → Ask-Anywhere runtime\n- **App 离线**：Gateway 直接 spawn runtime（需要 runtime 有 CLI 入口）\n\n后者复杂度高，**本 Phase 先做 App 在线模式**，App 离线时 Gateway 回复 \"Orbit App 未运行，你的消息已记录，打开 App 后我会处理\"（并把消息存到 `gateway/inbox.jsonl` 等 App 连上后重放）。\n\n### 4.3 TG 命令清单\n\n```\n/start          - 欢迎语\n/bind <code>    - 绑定 Orbit 账号\n/unbind         - 解绑\n/help           - 帮助\n/capture <text> - 快速记笔记（等价于 \"# text\"）\n/save <url>     - 保存链接到 Library\n/ask <question> - 显式调用 Ask-Anywhere\n/today          - 获取今日总结\n/inbox          - 查看 Orbit Inbox 未处理项\n/scheduled      - 列出定时任务\n```\n\n---\n\n## 5. Orbit App 里的 Gateway 管理 UI\n\n### 5.1 位置\n\n设置（Settings）里新增一个 \"Gateway\" tab，不在左侧栏一级入口（因为不是高频）。\n\n### 5.2 UI 设计\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  Settings > Gateway                                              │\n│  ────────────────────────────────────────────────────────────── │\n│                                                                  │\n│  Gateway 守护进程                                                │\n│  状态: ● 运行中 (PID 12345)                                       │\n│  启动方式: ⦿ 随 Orbit 启动  ○ 手动                              │\n│  Orbit 关闭后: ⦿ 继续运行  ○ 停止                                │\n│                                                                  │\n│  [停止守护进程]   [重启]   [查看日志]                             │\n│                                                                  │\n│  ────────────────────────────────────────────────────────────── │\n│  Channels                                                        │\n│                                                                  │\n│  ┌───────────────────────────────────────────────────────────┐   │\n│  │ ● Telegram (@OrbitUserBot)                       [编辑]   │   │\n│  │   已绑定用户: 1 个                                          │   │\n│  │   最近消息: 3 分钟前                                        │   │\n│  │   状态: connected                                          │   │\n│  └───────────────────────────────────────────────────────────┘   │\n│                                                                  │\n│  ┌───────────────────────────────────────────────────────────┐   │\n│  │ ○ WhatsApp                                    [Coming]    │   │\n│  │ ○ Email                                       [Coming]    │   │\n│  │ ○ Webhook                                     [Coming]    │   │\n│  └───────────────────────────────────────────────────────────┘   │\n│                                                                  │\n│  [+ 添加 Telegram Bot]                                           │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 5.3 Telegram 配置页\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│  ← Gateway   Telegram Bot 配置                                    │\n│  ────────────────────────────────────────────────────────────── │\n│                                                                  │\n│  Bot Token                                                       │\n│  ┌──────────────────────────────────────────────────────────┐   │\n│  │ •••••••••••••••••••••••                     [显示] [编辑]│   │\n│  └──────────────────────────────────────────────────────────┘   │\n│  获取 Token: https://t.me/BotFather                              │\n│                                                                  │\n│  Bot 名称: @OrbitUserBot                                         │\n│  状态: ● connected                                               │\n│                                                                  │\n│  ────────────────────────────────────────────────────────────── │\n│  已绑定用户                                                       │\n│                                                                  │\n│  ┌──────────────────────────────────────────────────────────┐   │\n│  │ Ryan (@ryanbz)                              [解绑]        │   │\n│  │ TG ID: 12345                                              │   │\n│  │ 绑定于: 2026-04-30 10:00                                   │   │\n│  └──────────────────────────────────────────────────────────┘   │\n│                                                                  │\n│  [+ 生成绑定码]                                                   │\n│                                                                  │\n│  ┌── 生成绑定码 ──────────────────────────────────────────┐     │\n│  │  绑定码: ABC123   (有效期 10:00 倒计时)                │     │\n│  │                                                        │     │\n│  │  使用方式:                                             │     │\n│  │  1. Telegram 中打开 @OrbitUserBot                      │     │\n│  │  2. 发送: /bind ABC123                                 │     │\n│  └────────────────────────────────────────────────────────┘     │\n│                                                                  │\n│  ────────────────────────────────────────────────────────────── │\n│  消息路由规则（默认路由可自定义）                                   │\n│                                                                  │\n│  以 # 开头 → Quick Capture                                       │\n│  纯 URL → Save to Library                                        │\n│  其他 → Ask-Anywhere                                             │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n---\n\n## 6. 数据模型 + 存储\n\n### 6.1 Gateway Config\n\n存储位置：`~/.orbit/gateway/config.json`\n\n```typescript\ninterface GatewayConfig {\n  version: 1;\n  daemon: {\n    auto_start: boolean;           // 随 Orbit 启动\n    keep_running_after_app_close: boolean;\n    log_level: 'debug' | 'info' | 'warn' | 'error';\n  };\n  channels: ChannelConfig[];\n  orbit: {\n    app_ipc_socket: string;        // socket 路径\n    vault_path: string;            // Gateway 直接访问的 vault\n  };\n  pending_binds: Array<{\n    code: string;\n    orbit_user_id: string;\n    expires_at: string;\n  }>;\n}\n\ntype ChannelConfig = TelegramChannelConfig | /* ... */;\n```\n\n### 6.2 Inbox（App 离线时暂存）\n\n`~/.orbit/gateway/offline-inbox.jsonl`，每行一条 `ChannelInboundMessage`。App 连上后重放，处理完的消息移到 `offline-inbox.processed.jsonl`。\n\n---\n\n## 7. IPC 协议细节\n\n### 7.1 Method 列表\n\n| Method | 方向 | 用途 |\n|--------|------|------|\n| `gateway.status` | App→GW | 查询 daemon 状态 |\n| `gateway.shutdown` | App→GW | 请求停止 daemon |\n| `channel.list` | App→GW | 列出所有 channel |\n| `channel.add` | App→GW | 新增 channel |\n| `channel.remove` | App→GW | 删除 |\n| `channel.update` | App→GW | 更新配置 |\n| `channel.start` / `channel.stop` | App→GW | 控制 channel |\n| `channel.send` | App→GW | App 要求 Gateway 推送消息 |\n| `channel.generate_bind_code` | App→GW | 生成绑定码 |\n| `channel.message_received` | GW→App | 收到入站消息（推送给 App）|\n| `channel.status_changed` | GW→App | channel 状态变化 |\n| `askAnywhere.invoke` | GW→App | GW 调用 AA |\n| `askAnywhere.response` | App→GW | AA 响应 |\n\n---\n\n## 8. 实施步骤\n\n### Step 1: Gateway Daemon 骨架（半天）\n1. 新建 `gateway/` 顶层目录（不在 `src/` 下，独立项目）\n2. `gateway/package.json`（独立依赖：`telegraf`, `jsonrpc-lite` 等）\n3. `gateway/src/index.ts` 启动入口\n4. `gateway/src/ipc-server.ts`（Unix socket JSON-RPC 2.0 服务端）\n5. `gateway/src/config-store.ts`（config 读写）\n6. 启动 + 停止 + 状态查询\n\n### Step 2: Channel 抽象 + 注册表（半天）\n1. `gateway/src/channels/types.ts`\n2. `gateway/src/channels/registry.ts`\n3. `gateway/src/channels/base.ts`（公共逻辑）\n\n### Step 3: Telegram Channel（1 天）\n1. `gateway/src/channels/telegram.ts`\n2. Bot 初始化 + 消息监听\n3. 绑定命令实现\n4. URL / 文件 / 语音 handler\n\n### Step 4: 消息路由（半天）\n1. `gateway/src/router.ts`\n2. 路由规则（命令 / URL / # capture / AA）\n3. 直接 vault 写入（capture / save to library 时）\n\n### Step 5: Ask-Anywhere 调用（App 在线模式）（半天）\n1. Gateway 通过 IPC 调用 App\n2. App 端实现 `askAnywhere.invoke` handler\n3. 离线降级（存 offline-inbox）\n\n### Step 6: Orbit App 里的 Gateway 管理 UI（1 天）\n1. `src/renderer/views/settings/GatewaySettingsView.tsx`\n2. 子页 Telegram 配置\n3. 绑定码生成 UI\n4. Channel 列表 + 状态\n\n### Step 7: App ↔ Gateway 通信整合（半天）\n1. App 端 IPC client\n2. App 启动时 spawn daemon（可选）\n3. 状态同步（channel status → UI）\n\n### Step 8: 调试 + 端到端测试（半天）\n1. 建一个测试 Bot（@BotFather 注册）\n2. 端到端跑通：TG 发消息 → Gateway → AA → 回复\n3. URL 收藏链路\n4. /capture 快捷\n5. 绑定流程\n\n**总计：约 4~5 天 AI 实施（含 Telegram 调试时间）**\n\n---\n\n## 9. 验收标准\n\n- [ ] Gateway daemon 能独立启动/停止\n- [ ] Orbit App 启动时能自动 spawn daemon（如果配置）\n- [ ] Orbit App 关闭后 daemon 继续运行（如果配置）\n- [ ] Telegram Channel 能连上 Bot\n- [ ] `/bind` 绑定流程工作\n- [ ] TG 发文本消息 → Ask-Anywhere 响应回到 TG\n- [ ] TG 发 URL → 自动 save 到 Library\n- [ ] TG 发 `# 捕获内容` → 创建 thought note\n- [ ] 未绑定的 TG 用户被拒绝\n- [ ] App 离线时消息被暂存，App 上线后重放\n- [ ] Gateway 产生的操作发事件（TraceableEvent 有 `gateway.*` kind）\n\n---\n\n## 10. Future-Proof\n\n- **WhatsApp**：基于 `whatsapp-web.js` 或 Cloud API\n- **Email**：IMAP 监听 → 邮件正文当 AA prompt；SMTP 发回\n- **Webhook**：HTTP 服务器 + 签名验证\n- **WeChat**：itchat 或 wxpy（需谨慎，风控）\n- **Siri Shortcuts**：iOS Shortcuts → HTTP POST → Gateway\n- **Gateway 云化**：未来可把 Gateway 部署到 VPS（但需要处理 vault 同步，复杂度高，不做）\n\n---\n\n## 11. 安全考虑\n\n- Bot Token 加密存储（用 OS keychain）\n- 绑定码短时效（10 分钟）+ 一次性\n- 未绑定用户严格拒绝\n- Gateway 日志不打印 Bot Token 全文\n- 未来 channel 之间的消息路由避免跨用户泄露\n\n---\n\n## 12. 依赖清单\n\n```json\n{\n  \"dependencies\": {\n    \"telegraf\": \"^4.x\",\n    \"jsonrpc-lite\": \"^2.x\",\n    \"chokidar\": \"^3.x\"\n  }\n}\n```\n","toolExplanation":"输出文档 3：Gateway Telegram"})

---

## [Tool] 2026-04-27T11:14:41.189Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/03-gateway-telegram.md","size":27739,"append":false}

---

## [Assistant] 2026-04-27T11:14:48.147Z
### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"d3","status":"completed","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"in_progress","content":"文档 4：Ask-Anywhere Stage View"}],"toolExplanation":"文档 3 完成，切换文档 4"})

---

## [Tool] 2026-04-27T11:14:48.153Z
{"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"completed","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"completed","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"completed","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"in_progress","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"pending","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-27T11:18:00.761Z
---

# 📄 文档 4：Ask-Anywhere Stage View

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/04-ask-anywhere-stage-view.md","content":"# 文档 4：Ask-Anywhere Stage View（产物舞台）\n\n> **规模**：M（约 2~3 天 AI 实施）\n> **依赖**：文档 1 完成（需要 Note/Library 概念）；Phase 1 Ask-Anywhere MVP 完成\n> **产物**：Ask-Anywhere 页面增加右侧产物区，展示对话中创建/引用的实体\n\n---\n\n## 1. 设计哲学\n\n### 1.1 问题\n\n现状：Ask-Anywhere 的对话里 AI 说\"好的，我给你创建了一个 note\"，但用户**看不到**这个 note 长什么样、在哪里、能不能点进去。产物（artifact）是埋在对话流里的。\n\n这样不行，因为：\n1. 用户没有\"具体做了什么\"的实感\n2. 产物无法被直接操作（修改、删除、打开）\n3. 用户要回去找这个产物必须切到 Notes 页\n\n### 1.2 设计\n\nAsk-Anywhere 页面分成三区：\n\n```\n┌──────────────────┬──────────────────────────┬──────────────────────┐\n│   Context        │     对话流（Chat）         │    Stage（产物舞台）│\n│   (可折叠)        │                          │                      │\n│                  │                          │  ┌────────────────┐ │\n│   · 当前锚定       │  你: 帮我记一下 ...       │  │  📝 New Note   │ │\n│     的实体         │                          │  │  \"Resource...\" │ │\n│                  │  AA: 好，已捕获。          │  │  [打开] [编辑] │ │\n│   · 激活的 skills │                          │  └────────────────┘ │\n│                  │  你: 查一下 second-brain  │                      │\n│   · Context hints│                          │  ┌────────────────┐ │\n│                  │  AA: 找到 8 条相关...     │  │  🔍 Retrieved  │ │\n│                  │                          │  │  8 notes       │ │\n│                  │                          │  │  [展开列表]     │ │\n│                  │                          │  └────────────────┘ │\n└──────────────────┴──────────────────────────┴──────────────────────┘\n```\n\n### 1.3 核心概念\n\n**Artifact**：对话中产生或引用的具体实体。\n- 由 AA 在调用 skill tool 时\"挂上舞台\"\n- 用户可以直接在 stage 上操作（打开、编辑、删除、确认/取消提议）\n- 舞台是**按时间累积**的——新的 artifact 往下加，旧的不消失（但可以折叠）\n\n---\n\n## 2. 数据模型\n\n### 2.1 Artifact\n\n```typescript\n// src/shared/ask-anywhere/stage-types.ts\n\nexport type ArtifactKind = \n  // 产物（AA 创建的）\n  | 'note.created'\n  | 'library.item.added'\n  | 'feed.source.added'\n  | 'project.created'\n  | 'area.created'\n  | 'resource.created'\n  | 'scheduled_task.created'\n  | 'conversation.anchor_changed'\n  \n  // 引用（AA 检索到的）\n  | 'notes.retrieved'\n  | 'library.items.retrieved'\n  | 'kb.items.retrieved'\n  \n  // 提议（AA 建议但未执行）\n  | 'proposal.create_note'\n  | 'proposal.create_project'\n  | 'proposal.update_para'\n  | 'proposal.run_task'\n  \n  // 状态/分析\n  | 'analysis.result'\n  | 'welcome_analysis.result';\n\nexport interface Artifact {\n  id: string;                       // 舞台内唯一\n  conversation_id: string;\n  message_id?: string;              // 对应哪条 AI message\n  kind: ArtifactKind;\n  created_at: string;\n  \n  title: string;                    // 卡片标题\n  summary?: string;                 // 一句话描述\n  \n  // 引用的实体\n  refs?: Array<{\n    kind: 'note' | 'library_item' | 'project' | 'area' | 'resource' | 'scheduled_task' | 'kb_item';\n    ref: string;                    // 路径或 id\n    label?: string;\n  }>;\n  \n  // 用于渲染的 payload\n  payload: any;                     // kind 相关数据\n  \n  // 状态\n  status: 'proposed' | 'confirmed' | 'rejected' | 'stale';\n  \n  // 可用动作\n  actions?: ArtifactAction[];\n}\n\nexport interface ArtifactAction {\n  id: string;\n  label: string;                    // \"打开\"、\"编辑\"、\"确认\"、\"取消\"\n  kind: 'navigate' | 'execute' | 'dismiss' | 'edit_inline';\n  target?: any;                     // kind=navigate 时的路由\n  execute_fn?: string;              // kind=execute 时的 tool 名\n}\n```\n\n### 2.2 Stage（一个 Conversation 的舞台）\n\n```typescript\nexport interface ConversationStage {\n  conversation_id: string;\n  artifacts: Artifact[];            // 按 created_at 排序\n  last_updated: string;\n}\n```\n\n持久化：\n- 存于 `.orbit/conversations/<conv-id>/stage.json`\n- 也可以从 TraceableEvent 重建（artifact 都来自事件）\n\n---\n\n## 3. 如何产生 Artifact\n\n### 3.1 Skill tool 调用时自动生成\n\n每个 skill 在执行 tool 后声明对应的 artifact：\n\n```typescript\n// e.g. orbit-capture skill 的 create_thought tool\n{\n  name: 'create_thought',\n  async execute(params) {\n    const note = await IPC.notes.create({ type: 'thought', ... });\n    \n    // 返回 tool result 的同时声明 artifact\n    return {\n      result: { note_id: note.frontmatter.id },\n      artifact: {\n        kind: 'note.created',\n        title: 'Thought 已创建',\n        summary: truncate(note.body, 120),\n        refs: [{ kind: 'note', ref: note.path, label: note.frontmatter.title }],\n        payload: { preview: note.body },\n        status: 'confirmed',\n        actions: [\n          { id: 'open', label: '打开', kind: 'navigate', target: `/notes/${note.frontmatter.id}` },\n          { id: 'delete', label: '删除', kind: 'execute', execute_fn: 'delete_note' },\n        ],\n      },\n    };\n  },\n}\n```\n\n### 3.2 Runtime 层捕获\n\nAsk-Anywhere runtime 适配器在收到 `tool_use_result` 事件时：\n1. 检查 payload 里是否带 `artifact`\n2. 有则 emit `StageArtifactAdded` 事件\n3. Stage store 收到后更新 `stage.json`\n\n### 3.3 Proposal 流（建议但未执行）\n\n某些 skill 可能需要用户确认才执行：\n\n```typescript\n// 用户：\"帮我立一个项目叫 XXX\"\n// AA 回复里带 proposal artifact（status: 'proposed'）\n\n{\n  kind: 'proposal.create_project',\n  title: '建议创建项目',\n  summary: '名称：XXX，描述：...，初始 milestone：...',\n  status: 'proposed',\n  actions: [\n    { id: 'confirm', label: '确认创建', kind: 'execute', execute_fn: 'create_project_confirmed' },\n    { id: 'modify', label: '修改', kind: 'edit_inline' },\n    { id: 'reject', label: '取消', kind: 'dismiss' },\n  ],\n}\n```\n\n用户点\"确认创建\" → 调用真正的 tool → artifact 从 `proposed` → `confirmed`，同时更新 refs。\n\n---\n\n## 4. UI 设计\n\n### 4.1 Stage 区位置\n\n在 Ask-Anywhere ChatView 里：\n- 桌面模式（宽屏）：右侧固定 stage panel（默认 320~400px 宽，可拖拽）\n- 移动/窄屏：stage 折叠为底部抽屉，点 🎭 icon 展开\n\n### 4.2 Stage Panel\n\n```\n┌─ Stage ──────────────────────── [折叠] ─┐\n│                                         │\n│ ━━━━━ 14:02 ━━━━━━━━━━━━━━━━━━━━━━━    │\n│ ┌───────────────────────────────────┐  │\n│ │ 📝 Note 已创建                     │  │\n│ │ \"渐进式总结对定时任务设计很有启发...\"│  │\n│ │ thought · resources/second-brain   │  │\n│ │ [打开] [编辑] [删除]                │  │\n│ └───────────────────────────────────┘  │\n│                                         │\n│ ━━━━━ 14:05 ━━━━━━━━━━━━━━━━━━━━━━━    │\n│ ┌───────────────────────────────────┐  │\n│ │ 🔍 检索到 8 条相关笔记             │  │\n│ │ second-brain 主题                 │  │\n│ │ ┌─────────────────────────────┐   │  │\n│ │ │ · 2026-04-28 \"Forte 原意..\"  │   │  │\n│ │ │ · 2026-04-20 \"Library 和..\"  │   │  │\n│ │ │ · 2026-03-15 \"PARA 是一个..\"│   │  │\n│ │ │ ... [展开全部]              │   │  │\n│ │ └─────────────────────────────┘   │  │\n│ └───────────────────────────────────┘  │\n│                                         │\n│ ━━━━━ 14:08 ━━━━━━━━━━━━━━━━━━━━━━━    │\n│ ┌───────────────────────────────────┐  │\n│ │ ⚠️ 建议创建项目                    │  │\n│ │ 名称: orbit-resource-system        │  │\n│ │ 描述: 围绕 Resource 工作站的...    │  │\n│ │ 初始 milestones: 3 个              │  │\n│ │                                    │  │\n│ │ [✓ 确认创建]  [✎ 修改]  [✕ 取消]  │  │\n│ └───────────────────────────────────┘  │\n│                                         │\n└─────────────────────────────────────────┘\n```\n\n### 4.3 卡片样式（按 kind 分）\n\n| Kind | icon | 颜色 | 必备动作 |\n|------|------|------|---------|\n| `note.created` | 📝 | 蓝 | 打开、编辑、删除 |\n| `library.item.added` | 📚 | 紫 | 打开、归档 |\n| `scheduled_task.created` | ⏰ | 绿 | 查看、立即执行、删除 |\n| `notes.retrieved` | 🔍 | 灰 | 展开列表 |\n| `proposal.*` | ⚠️ | 橙 | 确认、修改、取消 |\n| `welcome_analysis.result` | 🌟 | 金 | 应用建议 |\n\n### 4.4 Context 区（左侧）\n\n```\n┌─ Context ──────────────────── [折叠] ─┐\n│                                       │\n│ 锚定实体                                │\n│ ┌────────────────────────────────┐   │\n│ │ 🎯 projects/orbit-v2            │   │\n│ │   Phase 4.0 dog-food 观察期     │   │\n│ │ [切换]                          │   │\n│ └────────────────────────────────┘   │\n│                                       │\n│ 激活的 Skills                          │\n│ · orbit-retrieve                       │\n│ · orbit-planning                       │\n│                                       │\n│ Context Hints                          │\n│ · 最近 7 天: 12 个 thoughts            │\n│ · 相关 Library: 3 条                   │\n│ · KB 命中: 5 条                        │\n│                                       │\n└───────────────────────────────────────┘\n```\n\n---\n\n## 5. Inline artifact（聊天流里的产物预览）\n\n有些场景 stage 不够直观，用户希望在聊天流里直接看到：\n\n```\nAA: 好，我给你创建了：\n\n    ┌──────────────────────────────────┐\n    │ 📝 Thought                        │\n    │ \"渐进式总结对定时任务设计...\"       │\n    │ resources/second-brain            │\n    │ [打开]                            │\n    └──────────────────────────────────┘\n\n    还要我为它起个标题吗？\n```\n\n**实现**：AI message 的内容支持 markdown + 自定义 `artifact-card` fence：\n\n````markdown\n好，我给你创建了：\n\n```artifact\n{\n  \"kind\": \"note.created\",\n  \"refs\": [{ \"kind\": \"note\", \"ref\": \"notes/thoughts/xxx.md\" }],\n  \"title\": \"Thought\",\n  \"summary\": \"渐进式总结...\"\n}\n```\n````\n\nChatMessage 渲染时识别 `artifact` fence → 渲染成卡片。**同一个 artifact 同时出现在 stage 和 inline**（是同一条数据）。\n\n---\n\n## 6. IPC / API\n\n```typescript\nIPC.stage = {\n  // 获取某个对话的 stage\n  get: (conversationId: string) => Promise<ConversationStage> => {},\n  \n  // 订阅变化\n  subscribe: (conversationId: string, cb: (stage: ConversationStage) => void) => () => void => {},\n  \n  // 动作执行（按 artifact action）\n  execAction: (conversationId: string, artifactId: string, actionId: string, params?: any) => Promise<void> => {},\n  \n  // 手动移除 artifact（用户\"从舞台撤下\"）\n  removeArtifact: (conversationId: string, artifactId: string) => {},\n};\n```\n\n---\n\n## 7. 事件\n\n```typescript\nexport const STAGE_EVENT_KINDS = [\n  'stage.artifact.added',\n  'stage.artifact.updated',\n  'stage.artifact.removed',\n  'stage.artifact.action_executed',\n] as const;\n```\n\n这些事件也上 TraceableEvent。\n\n---\n\n## 8. 实施步骤\n\n### Step 1: 数据模型 + 存储（半天）\n1. `src/shared/ask-anywhere/stage-types.ts`\n2. `src/main/ask-anywhere/stage-store.ts`（持久化到 `.orbit/conversations/<id>/stage.json`）\n3. 事件定义 + 发布\n\n### Step 2: Skill tool → Artifact 机制（半天）\n1. Skill tool 返回结构扩展 `artifact` 字段\n2. Runtime 适配器捕获 artifact 并发事件\n3. 改造现有的 skill stub（`orbit-capture`, `orbit-retrieve`, `orbit-welcome-analysis`）\n\n### Step 3: Stage Panel UI（1 天）\n1. `src/renderer/views/ask-anywhere/StagePanel.tsx`\n2. `src/renderer/views/ask-anywhere/ArtifactCard.tsx`（各 kind 的渲染）\n3. `src/renderer/hooks/useStage.ts`\n4. 接入 ChatView 布局（三栏）\n\n### Step 4: Artifact 动作执行（半天）\n1. `IPC.stage.execAction`\n2. navigate/dismiss 动作\n3. execute 动作（调用对应 skill tool）\n4. edit_inline（打开 modal 编辑 payload）\n\n### Step 5: Proposal 流（半天）\n1. Proposal artifact 状态机：proposed → confirmed/rejected\n2. 确认时二次调 tool\n3. 修改时弹出编辑器\n\n### Step 6: Inline artifact（半天）\n1. ChatMessage renderer 识别 `artifact` fence\n2. 渲染成卡片（复用 ArtifactCard）\n3. 和 stage 共享数据\n\n### Step 7: Context 区（半天）\n1. `src/renderer/views/ask-anywhere/ContextPanel.tsx`\n2. 锚定实体显示 + 切换\n3. 激活的 skills 列表\n4. Context hints 计算\n\n### Step 8: 测试 + 打磨（半天）\n1. 端到端走几个典型场景（capture/retrieve/propose project/welcome analysis）\n2. 移动/窄屏折叠\n3. 空态（无 artifact）\n\n**总计：约 4~5 天 AI 实施**\n\n---\n\n## 9. 验收标准\n\n- [ ] Ask-Anywhere 页面三栏布局\n- [ ] Stage Panel 能实时展示 artifact\n- [ ] 至少支持以下 artifact kind:\n  - note.created / library.item.added / scheduled_task.created\n  - notes.retrieved / library.items.retrieved\n  - proposal.create_project\n  - welcome_analysis.result\n- [ ] 每种 kind 有对应的卡片样式\n- [ ] 卡片动作可执行（打开、删除、确认、取消）\n- [ ] Proposal 流工作：建议 → 用户确认 → 真执行\n- [ ] Inline artifact 在聊天流内也能渲染\n- [ ] 切换 conversation 时 stage 正确切换\n- [ ] Stage 状态持久化，重启后恢复\n\n---\n\n## 10. Future-Proof\n\n- **Artifact 分类 tab**：历史多了后，按 kind 筛选（所有 note / 所有 proposal / ...）\n- **Artifact 全局检索**：跨 conversation 搜索\"我让 AA 做过什么\"\n- **Artifact 历史复盘**：某个 artifact 被引用的次数（\"时间复利\"度量）\n- **协作 artifact**：未来多人共享对话时，artifact 的权限控制\n","toolExplanation":"输出文档 4：Stage View"})

---

## [Tool] 2026-04-27T11:18:00.770Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/04-ask-anywhere-stage-view.md","size":16016,"append":false}

---

## [Assistant] 2026-04-27T11:18:14.202Z
### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"d4","status":"completed","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"in_progress","content":"文档 5：Daily Timeline"}],"toolExplanation":"文档 4 完成，切换文档 5"})

---

## [Tool] 2026-04-27T11:18:14.211Z
{"todos":[{"id":"idx","status":"completed","content":"建立下一阶段总目录 + 索引"},{"id":"d1","status":"completed","content":"文档 1：笔记系统 + PARA 扩展 + KB 导入"},{"id":"d2","status":"completed","content":"文档 2：定时任务一级入口"},{"id":"d3","status":"completed","content":"文档 3：Gateway Daemon + Telegram Channel"},{"id":"d4","status":"completed","content":"文档 4：Ask-Anywhere Stage View"},{"id":"d5","status":"in_progress","content":"文档 5：Daily Timeline"},{"id":"d6","status":"pending","content":"文档 6：Resource 主题工作站"},{"id":"prompt","status":"pending","content":"整合实施提示词"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-27T11:23:30.899Z
---

# 📄 文档 5：Daily Timeline

### Tool Calls:
- **write_to_file**({})

---

## [Tool] 2026-04-27T11:23:30.909Z
Missing 'content' parameter. This usually means your output was truncated due to length.

You MUST split into multiple writes:
  write_to_file(filePath, "<short content>")                          // create file
  write_to_file(filePath, "<more content>", append=true)              // append chunk
  write_to_file(filePath, "<even more content>", append=true)         // append chunk

Keep each write short to avoid output truncation.

---

## [Assistant] 2026-04-27T11:23:54.720Z
### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","content":"# 文档 5：Daily Timeline —— 人生日记\n\n> **规模**：L（约 3~4 天 AI 实施）\n> **依赖**：文档 1（需要 Note/Library/KB 事件定义）；TraceableEvent 基础\n> **产物**：Timeline 一级入口 + 日/周/月/年四级视图 + AI 今日总结 + 特殊事件融入 Quick Capture + PDF 导出\n\n---\n\n## 1. 设计哲学\n\n### 1.1 野心声明\n\n> \"这本日记就是我的一生\"\n\nOrbit Daily Timeline 不是普通的 activity log，而是**基于语义聚合的人生 event sourcing**。每一天、每一周、每一年都能被唤回、被回顾、被打印成书、被传承。\n\n### 1.2 核心架构决策\n\n**复用 TraceableEvent 作为底层事件源**，Timeline 是视图层而非存储层。\n\n这意味着：\n- 不新增\"timeline 事件表\"\n- 所有业务事件（note/library/project/task/conversation/...）通过 `TraceableEvent` 天然流入\n- Timeline 只负责**选择、聚合、渲染**\n- 未来接入外部事件（GitHub/Calendar）只需让它们也产 TraceableEvent\n","toolExplanation":"文档 5 开头"})

---

## [Tool] 2026-04-27T11:23:54.729Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","size":1006,"append":false}

---

## [Assistant] 2026-04-27T11:29:40.899Z
### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","append":true,"content":"\n\n---\n\n## 2. 事件分层（P2-D8）\n\n### 2.1 Layer 1 — User-Visible（默认显示）\n\n用户会说\"我今天做了...\"的事件。这些**必定**出现在 Timeline：\n\n| 事件 kind | 渲染形态 |\n|----------|---------|\n| `note.created (thought)` | 💭 `时间` 捕获想法：\"开头...\" |\n| `note.created (longform)` | ✍️ `时间` 开始写长文《标题》 |\n| `note.updated (longform, +N words)` | ✍️ `时间` 长文《标题》新增 N 字 |\n| `note.created (capture)` | 📌 `时间` 捕获（来源：xxx） |\n| `note.created (voice_log)` | 🎤 `时间` 语音日志 N 分钟 |\n| `note.archived` | 📦 `时间` 归档笔记 |\n| `library.item.added` | 📚 `时间` 收藏《xxx》 |\n| `library.item.read` | 📖 `时间` 读完《xxx》 |\n| `library.item.annotated` | 🖍️ `时间` 标注了 N 处 |\n| `library.item.distilled` | 💎 `时间` 提炼为 note |\n| `feed.source.added` | 📡 `时间` 订阅 xxx |\n| `feed.item.saved_to_library` | 📌 `时间` 从 feed 收藏 |\n| `project.created` | 🎯 `时间` 立项《xxx》 |\n| `project.completed` | 🏆 `时间` 完成项目《xxx》 |\n| `task.completed` | ✅ `时间` 完成任务 \"xxx\" |\n| `area.review.completed` | 🔄 `时间` 完成 Area 评审 |\n| `resource.created` | 🗂️ `时间` 立题 Resource \"xxx\" |\n| `resource.engagement` | 🔁 `时间` 触及 Resource \"xxx\" |\n| `conversation.meaningful` | 💬 `时间` 和 AA 讨论 xxx |\n| `scheduled_task.execution.completed` | ⏰ `时间` 定时任务执行 |\n| `kb.imported` | 📥 `时间` 导入 KB |\n| `vision.milestone.reached` | 🌟 `时间` 里程碑达成（Vision Phase 后启用）|\n| `capture.special` | ⭐ 特殊事件（见 §4）|\n\n### 2.2 Layer 2 — Developer-Visible（默认折叠）\n\n- `agent.run.started / done`\n- `tool_use / tool_result`\n- IPC trace\n- runtime event\n\nTimeline 上**有**这些事件，但默认 collapse。设置里开\"开发者模式\"后展开。\n\n### 2.3 Layer 3 — System-Noise（不上 Timeline）\n\n按 P2-D8 **完全不上**：\n- `heartbeat`\n- `cost` 细粒度事件\n- 文件系统 watcher 内部事件\n- IPC 心跳\n- 其他系统 trace\n\n在 TraceableEventStore 里**保留**（用于调试和复盘），但 Timeline **不查询**。\n\n### 2.4 实现：Event Kind 白名单\n\n```typescript\n// src/shared/timeline/event-filter.ts\n\nexport const TIMELINE_LAYER_1_KINDS = new Set([\n  'note.created',\n  'note.updated',              // 只有特定类型才要\n  'note.archived',\n  'library.item.added',\n  'library.item.read',\n  // ... 全部 Layer 1\n]);\n\nexport const TIMELINE_LAYER_2_KINDS = new Set([\n  'agent.run.started',\n  'agent.run.completed',\n  // ... Layer 2\n]);\n\nexport function shouldShowOnTimeline(\n  event: TraceableEvent,\n  developerMode: boolean,\n): boolean {\n  if (TIMELINE_LAYER_1_KINDS.has(event.kind)) return true;\n  if (developerMode && TIMELINE_LAYER_2_KINDS.has(event.kind)) return true;\n  return false;\n}\n```\n\n---\n\n## 3. 数据模型\n\n### 3.1 TimelineEntry（视图层的统一结构）\n\n```typescript\n// src/shared/timeline/types.ts\n\nexport interface TimelineEntry {\n  // 来源\n  event_id: string;                 // TraceableEvent.id\n  event_kind: string;\n  trace_id?: string;\n  \n  // 时间\n  occurred_at: string;              // ISO\n  \n  // 分层\n  layer: 1 | 2;                     // Layer 3 不进\n  \n  // 显示\n  icon: string;                     // emoji 或 lucide icon 名\n  title: string;                    // \"捕获想法\"\n  summary?: string;                 // \"开头第一段...\"\n  \n  // 引用实体\n  refs?: Array<{\n    kind: 'note' | 'library' | 'project' | 'area' | 'resource' | 'task' | 'conversation' | 'kb';\n    ref: string;                    // 路径或 id\n    label?: string;\n  }>;\n  \n  // 聚合 hint（同类事件短时间内可合并）\n  aggregation_key?: string;         // e.g. \"longform-update:<note-id>\"\n  \n  // 关联事件（语义承接）\n  derived_from?: string[];          // 其他 entry 的 event_id\n}\n\nexport interface DailyTimeline {\n  date: string;                     // YYYY-MM-DD\n  entries: TimelineEntry[];\n  stats: DailyStats;\n  summary?: DailySummary;\n}\n\nexport interface DailyStats {\n  total_events: number;\n  thoughts_count: number;\n  longforms_wrote: number;          // 今天有写长文的数量\n  longforms_words: number;          // 今天新增字数\n  library_added: number;\n  library_read: number;\n  tasks_completed: number;\n  projects_touched: string[];       // 今天触及的 project paths\n  areas_touched: string[];\n  resources_touched: string[];\n  conversations_count: number;\n}\n\nexport interface DailySummary {\n  generated_at: string;\n  note_path: string;                // notes/daily-summaries/YYYY-MM-DD.md\n  headline: string;                 // \"深度工作日\"\n  narrative: string;                // 150~300 字\n  highlights?: string[];\n}\n```\n\n### 3.2 TimelineIndex（缓存 + 性能）\n\n为了年/月视图快速加载，做一个索引：\n\n```typescript\n// .orbit/timeline/index/\n//   2026-04.json        # 月索引\n//   2026.json           # 年索引\n\nexport interface MonthlyIndex {\n  month: string;                    // \"2026-04\"\n  days: Array<{\n    date: string;\n    entry_count: number;\n    highlight_kinds: string[];      // 当天出现的主要事件类型\n    summary_headline?: string;\n  }>;\n}\n\nexport interface YearlyIndex {\n  year: number;                     // 2026\n  months: Array<{\n    month: string;\n    total_events: number;\n    days_active: number;            // 当月活跃天数\n  }>;\n}\n```\n\n增量更新：每次 Layer 1 事件产生时，异步 upsert 月/年索引。\n\n### 3.3 SpecialCapture（特殊事件，P2-D10）\n\n特殊事件融入 Quick Capture（不单独做新实体）。在 Note frontmatter 新增字段：\n\n```yaml\n---\nid: note-xxx\ntype: capture\nspecial_marker:\n  kind: insight | breakthrough | setback | milestone | gratitude | reflection\n  icon: 🌟 | 💡 | 💔 | 🏁 | 🙏 | 🪞\n---\n```\n\nTimeline 渲染时对 `special_marker` 有的 note 做特殊高亮（大 icon + 更突出的卡片）。\n\nQuick Capture UI 里新增\"标记为特殊\"选项：\n```\n┌─ Quick Capture ──────────────────┐\n│ ┌────────────────────────────┐   │\n│ │ 今天想通了一件事...         │   │\n│ └────────────────────────────┘   │\n│                                  │\n│ 类型: [thought ▼]                │\n│ 特殊? [ ] 无                     │\n│        [x] 💡 灵感时刻           │\n│        [ ] 🌟 突破               │\n│        [ ] 💔 挫折               │\n│        [ ] 🏁 里程碑             │\n│        [ ] 🙏 感恩               │\n│        [ ] 🪞 反思               │\n│                                  │\n│ [取消]            [捕获]         │\n└──────────────────────────────────┘\n```\n\n---\n\n## 4. UI 设计（P2-D7 全套采纳）\n\n### 4.1 一级入口\n\n- 位置：左侧栏顶部区域（Daily 是核心体验），放在 Ask-Anywhere 之上或并列\n- icon: `Calendar` (lucide)\n- 文案: \"Timeline\"（或 \"Daily\"）\n- 路由: `/timeline`（默认 `/timeline/today`）\n\n### 4.2 日视图\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│ [← 2026-04-29]  2026-04-30 周三  [2026-05-01 →]  [日|周|月|年]   │\n│                                            [📄 导出PDF] [⚙️]      │\n│ ────────────────────────────────────────────────────────────── │\n│                                                                 │\n│  ╭─── 今日一瞥 ───────────────────────────────────────────╮   │\n│  │  📊 18 个事件    📝 7 个 thoughts    ✍️ 新增 1240 字       │   │\n│  │  ✅ 4 个任务     💬 2 次 AA 对话      📚 2 篇文章已读      │   │\n│  │  🎯 2 个项目有进展                                         │   │\n│  ╰────────────────────────────────────────────────────────╯   │\n│                                                                 │\n│  ── 早晨 (06:00 - 12:00) ──                                    │\n│                                                                 │\n│   09:10  📡  订阅了 Tiago Forte 的 newsletter                   │\n│                                                                 │\n│   09:30  📌  从 feed 收藏《Building a Second Brain 2025》      │\n│             ↳ 稍后阅读                                          │\n│                                                                 │\n│   10:15  📚  打开阅读 《Building a Second Brain 2025》          │\n│                                                                 │\n│   10:42  💡  灵感时刻: \"渐进式总结对定时任务设计很有启发\"        │\n│             ↳ 来自阅读《Building a Second Brain 2025》          │\n│             → 归入 resources/second-brain                       │\n│                                                                 │\n│  ── 上午 (12:00 - 14:00) ──                                    │\n│                                                                 │\n│   11:23  🎯  立项《orbit-resource-system》                      │\n│                                                                 │\n│   11:47  💬  和 Ask-Anywhere 讨论 Resource 设计 (45 min)       │\n│             ↳ 产出：ADR-016 草稿                                │\n│                                                                 │\n│  ── 下午 (14:00 - 18:00) ──                                    │\n│                                                                 │\n│   14:00  ✍️  开始写长文《第二大脑在工具里的实现》                │\n│                                                                 │\n│   15:40  ✍️  长文新增 1240 字  (聚合: 4 次保存)                  │\n│                                                                 │\n│   16:30  ✅  完成任务 \"Stage View 原型\"                         │\n│                                                                 │\n│  ── 夜晚 (18:00 - 24:00) ──                                    │\n│                                                                 │\n│   19:30  🎤  语音日志 (8 min)                                   │\n│             \"今天想明白了 Resource 不是静态素材...\"              │\n│                                                                 │\n│   20:15  📖  读完《Building a Second Brain 2025》               │\n│                                                                 │\n│   21:00  🔄  完成 Area \"工程 team lead\" 的周评审                │\n│                                                                 │\n│  ╭─── 🌙 今日总结 (AA 自动生成, 21:45) ─────────────────────╮   │\n│  │                                                          │   │\n│  │  主线: \"Resource 系统设计\" 贯穿全天。从 feed 收藏到立项    │   │\n│  │  到长文创作，形成完整的 Distill→Express 闭环。            │   │\n│  │  灵感时刻: 10:42 的渐进式总结联想让整个下午的写作顺流而下。 │   │\n│  │  这是典型的深度工作日。                                    │   │\n│  │                                                          │   │\n│  │  明日延续: 长文还差结尾；ADR-016 要和阶段 3 连接。        │   │\n│  │                                                          │   │\n│  │  [展开完整] [编辑] [发到邮箱] [加入 longform]               │   │\n│  ╰──────────────────────────────────────────────────────────╯   │\n│                                                                 │\n│ ──────────────────────────────────────────────────────────── │\n│  [⬇ 展开 3 条开发者事件（Layer 2）]                              │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 4.3 时段分组算法\n\n```typescript\nfunction groupByTimeOfDay(entries: TimelineEntry[]): TimeSegmentGroup[] {\n  const segments = [\n    { id: 'dawn',    label: '清晨',  range: [5, 8] },\n    { id: 'morning', label: '早晨',  range: [8, 12] },\n    { id: 'noon',    label: '上午',  range: [12, 14] },\n    { id: 'afternoon', label: '下午', range: [14, 18] },\n    { id: 'evening', label: '夜晚',  range: [18, 24] },\n    { id: 'night',   label: '深夜',  range: [0, 5] },\n  ];\n  // 按 entry.occurred_at 的小时归到对应 segment\n}\n```\n\n### 4.4 事件聚合\n\n同类型事件短时间内合并成一行。规则：\n\n```typescript\nfunction aggregate(entries: TimelineEntry[]): TimelineEntry[] {\n  // 1. 长文多次保存 → 合并为一条 \"新增 N 字\"\n  //    aggregation_key: \"longform-update:<note-id>\"\n  //    合并窗口: 10 分钟\n  \n  // 2. 多次标注同一 library → \"标注了 N 处\"\n  \n  // 3. 多次 task 完成（同一 project）在 10 分钟内 → \"完成 3 个任务 on <project>\"\n  \n  // 4. 其他事件不聚合\n}\n```\n\n### 4.5 周视图\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│ [← 上周]  2026-04-27 ~ 2026-05-03  [下周 →]  [日|周|月|年]       │\n│ ────────────────────────────────────────────────────────────── │\n│                                                                 │\n│  ┌────────┬────────┬────────┬────────┬────────┬────────┬──────┐ │\n│  │   周一  │  周二  │  周三  │  周四  │  周五  │  周六  │ 周日 │ │\n│  │  04-27 │  04-28 │  04-29 │  04-30 │  05-01 │  05-02 │05-03│ │\n│  ├────────┼────────┼────────┼────────┼────────┼────────┼──────┤ │\n│  │  💭 3  │  💭 5  │  💭 7  │  ⛅️    │        │        │      │ │\n│  │  ✅ 2  │  ✅ 4  │  ✅ 4  │  Today │        │        │      │ │\n│  │  ✍️ 0  │  ✍️ 1  │  ✍️ 2  │        │        │        │      │ │\n│  │   ...  │   ...  │   ...  │        │        │        │      │ │\n│  │  [点开]│  [点开]│  [点开]│        │        │        │      │ │\n│  ├────────┴────────┴────────┴────────┴────────┴────────┴──────┤ │\n│  │  📅 本周一句话总结（AA 周总结，周日 22:00 生成）               │ │\n│  │  \"围绕 Orbit Phase 2 的深度设计周。完成 6 份设计文档...\"     │ │\n│  └──────────────────────────────────────────────────────────────┘ │\n│                                                                 │\n│  本周重点事件                                                    │\n│  · 立项 orbit-resource-system                                   │\n│  · 长文《第二大脑在工具里的实现》 完成初稿                        │\n│  · 💡 3 个灵感时刻                                              │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 4.6 月视图\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│ [← 03]  2026 年 4 月  [05 →]              [日|周|月|年]         │\n│ ────────────────────────────────────────────────────────────── │\n│                                                                 │\n│  ┌───┬───┬───┬───┬───┬───┬───┐                                  │\n│  │周一│周二│周三│周四│周五│周六│周日│                                  │\n│  ├───┼───┼───┼───┼───┼───┼───┤                                  │\n│  │ 30│ 31│ 1 │ 2 │ 3 │ 4 │ 5 │  (颜色深浅代表活跃度)             │\n│  │ ░ │ ░ │▒▒│▒▒▒│▓▓│▓▓▓│ ░ │                                  │\n│  ├───┼───┼───┼───┼───┼───┼───┤                                  │\n│  │ 6 │ 7 │ 8 │ 9 │10 │11 │12 │                                  │\n│  │▒▒│▓▓▓│▒▒│▒▒▒│▓▓│ ░ │ ░ │                                  │\n│  ├───┼───┼───┼───┼───┼───┼───┤                                  │\n│  │13 │14 │15 │16 │17 │18 │19 │                                  │\n│  ├───┼───┼───┼───┼───┼───┼───┤                                  │\n│  │20 │21 │22 │23 │24 │25 │26 │                                  │\n│  ├───┼───┼───┼───┼───┼───┼───┤                                  │\n│  │27 │28 │29 │30 │   │   │   │                                  │\n│  │▓▓│▓▓▓│▓▓▓│█ │                                                │\n│  └───┴───┴───┴───┴───┴───┴───┘                                  │\n│                                                                 │\n│  月度亮点                                                        │\n│  · 立项 2 个，完成 1 个                                         │\n│  · 28 个 thoughts                                               │\n│  · 最活跃日: 4 月 29 日（32 事件）                               │\n│  · 💡 5 个灵感时刻                                              │\n│                                                                 │\n│  [月度 AA 总结（由 AA 生成）]                                    │\n│  \"四月是 Orbit Phase 2 设计爆发期，围绕知识栈...\"               │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 4.7 年视图（热力图）\n\n```\n┌──────────────────────────────────────────────────────────────────┐\n│ [← 2025]  2026 年  [2027 →]              [日|周|月|年]          │\n│ ────────────────────────────────────────────────────────────── │\n│                                                                 │\n│  1月 ░░░▒▒▓▓▓▓▒▒░░░░▒▒▒▒▓▒▒░░░░░░░                              │\n│  2月 ▒▒▒▒▓▓▓▓▓▒▒▒░░░▒▒▓▓▒▒▒▒▒░                                  │\n│  3月 ▓▓▓▓▓▓▒▒▒▒▒▓▓▓▓▓▓▒▒▒░░▒▒▓▓▓▓▒▒░                           │\n│  4月 ▓▓▓▒▒▒▓▓▓▓▓▒▒▒▓▓▓█▓▒▒░░▓▓██▓▒                             │\n│  5月 ░░░░                                                        │\n│  ...                                                             │\n│                                                                 │\n│  ┌── 年度亮点 ──────────────────────────────────────────────┐   │\n│  │ · 最活跃月: 4 月 (487 事件)                                │   │\n│  │ · 连续活跃: 28 天                                          │   │\n│  │ · 新增长文: 12 篇                                          │   │\n│  │ · 立项: 7 个，完成: 4 个                                   │   │\n│  │ · 💡 灵感时刻: 23 次                                       │   │\n│  └─────────────────────────────────────────────────────────┘   │\n│                                                                 │\n│  [年度 AA 总结 · 本年主题演化 · 导出年鉴 PDF]                     │\n└──────────────────────────────────────────────────────────────────┘\n```\n\n### 4.8 PDF 导出\n\n- 单日 PDF：完整的日视图 + 今日总结 + 所有关联产物的摘要\n- 周 / 月 PDF：概览 + 每天简述\n- 年鉴 PDF：热力图 + 重点事件列表 + 年度总结\n\n技术选型：\n- `puppeteer` 或 `electron`'s `webContents.printToPDF()`\n- 模板用 React + 打印样式 `@media print`\n- 文件输出到 `vault/exports/timeline/`\n","toolExplanation":"文档 5 章节 2-4"})

---

## [Tool] 2026-04-27T11:29:40.908Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","size":24265,"append":true}

---

## [Assistant] 2026-04-27T11:31:13.531Z
### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","append":true,"content":"\n\n---\n\n## 5. AI 今日总结\n\n### 5.1 触发机制\n\n通过**系统预置定时任务**（见文档 2 第 4.1 节）：\n\n```typescript\n// 每晚 22:00 运行\n{\n  system_key: 'daily-summary',\n  schedule: { kind: 'daily', time: '22:00' },\n  action: {\n    kind: 'ask_anywhere',\n    prompt: DAILY_SUMMARY_PROMPT,\n  },\n}\n```\n\n### 5.2 Prompt 模板\n\n```\n你是 Orbit 的每日总结助手。请基于用户 {today} 的 Timeline 事件，生成一段总结。\n\n【今日事件列表】\n{events}\n\n【今日数据】\n- 事件总数: {stats.total_events}\n- 笔记产出: {stats.thoughts_count} 条 thought, {stats.longforms_words} 字长文\n- 完成任务: {stats.tasks_completed}\n- 触及的 Projects: {stats.projects_touched}\n- 触及的 Areas: {stats.areas_touched}\n- 触及的 Resources: {stats.resources_touched}\n- 对话次数: {stats.conversations_count}\n\n【要求】\n1. 150-300 字\n2. 第二人称\"你\"\n3. 温暖、精确、不鸡汤\n4. 包括 4 部分:\n   - headline: 10 字内概括（如\"深度工作日\"、\"探索日\"、\"修复日\"）\n   - 主线叙事: 今天最重要的 1-2 件事，以及它们之间的承接\n   - 隐藏关联: 看似无关但其实连贯的事件（如上午的 feed 收藏→下午的长文）\n   - 明日延续: 今天未完成/挖坑\n\n【输出格式】\n以 JSON 输出:\n{\n  \"headline\": \"...\",\n  \"narrative\": \"...\",\n  \"highlights\": [\"...\", \"...\"]\n}\n```\n\n### 5.3 产物\n\n- 生成一个 note：`notes/daily-summaries/YYYY-MM-DD.md`\n- frontmatter `type: daily_summary`\n- Timeline 底部卡片展示 summary\n- 同时 emit 事件 `daily_summary.generated`\n\n### 5.4 手动触发\n\n用户在 Timeline 日视图里，当天还没总结（比如 22:00 前）：\n\n```\n┌─ 今日尚未总结 ─────────────────────┐\n│  [立即生成总结]                     │\n│  将总结设为今晚 22:00 自动生成      │\n└────────────────────────────────────┘\n```\n\n---\n\n## 6. IPC / API\n\n```typescript\nIPC.timeline = {\n  // 获取指定日期的 timeline\n  getDay: (date: string, options?: { developerMode?: boolean }) => Promise<DailyTimeline> => {},\n  \n  // 周/月/年\n  getWeek: (isoWeek: string) => {},          // \"2026-W17\"\n  getMonth: (month: string) => {},           // \"2026-04\"\n  getYear: (year: number) => {},\n  \n  // 索引（用于日历热力图）\n  getMonthlyIndex: (month: string) => Promise<MonthlyIndex> => {},\n  getYearlyIndex: (year: number) => Promise<YearlyIndex> => {},\n  \n  // 手动触发今日总结\n  generateDailySummary: (date: string) => Promise<DailySummary> => {},\n  \n  // 编辑总结（用户可改）\n  updateDailySummary: (date: string, patch: { narrative?: string; headline?: string }) => {},\n  \n  // 导出 PDF\n  exportPDF: (scope: { kind: 'day' | 'week' | 'month' | 'year'; value: string }) => Promise<{ path: string }> => {},\n  \n  // 订阅变化（有新事件时）\n  subscribeDay: (date: string, cb: (timeline: DailyTimeline) => void) => () => void => {},\n};\n```\n\n---\n\n## 7. 事件投影机制\n\n### 7.1 TraceableEvent → TimelineEntry 映射\n\n每个 event kind 需要一个 projector：\n\n```typescript\n// src/main/timeline/projectors.ts\n\ntype Projector = (event: TraceableEvent, context: ProjectorContext) => TimelineEntry | null;\n\nconst projectors: Record<string, Projector> = {\n  'note.created': (event, ctx) => {\n    const { note_id, type, title, body } = event.payload;\n    const iconMap = {\n      thought: '💭',\n      longform: '✍️',\n      capture: '📌',\n      voice_log: '🎤',\n      daily_summary: '🌙',\n    };\n    return {\n      event_id: event.id,\n      event_kind: event.kind,\n      occurred_at: event.occurred_at,\n      layer: 1,\n      icon: iconMap[type],\n      title: type === 'thought' ? '捕获想法' : ...,\n      summary: truncate(body, 80),\n      refs: [{ kind: 'note', ref: event.payload.path, label: title }],\n    };\n  },\n  \n  'note.updated': (event, ctx) => {\n    // 只对 longform 且字数变化大 > 100 时投影\n    if (event.payload.type !== 'longform') return null;\n    if (Math.abs(event.payload.word_delta) < 100) return null;\n    return {\n      ...,\n      aggregation_key: `longform-update:${event.payload.note_id}`,\n    };\n  },\n  \n  'library.item.added': (event) => ({ /* ... */ }),\n  \n  // ... 所有 Layer 1 event kinds\n};\n```\n\n### 7.2 特殊事件投影\n\n```typescript\n'note.created': (event, ctx) => {\n  const entry = baseProjector(event, ctx);\n  if (event.payload.special_marker) {\n    entry.icon = event.payload.special_marker.icon;\n    entry.title = SPECIAL_TITLES[event.payload.special_marker.kind] + \": \" + entry.summary;\n    entry.layer = 1;  // 特殊事件强制 Layer 1\n  }\n  return entry;\n},\n```\n\n### 7.3 关联推断（derived_from）\n\n两个事件之间的承接关系由 projector 推断：\n\n- `library.item.read` 之后 10 分钟内的 `note.created(capture)` → capture.derived_from = library.read\n- `feed.item.saved_to_library` → `library.item.added` 自动关联\n- `conversation.message_sent` 里提到某 library 名字 → 关联\n\n这些关联用**渲染时的`↳`**来展示。\n\n---\n\n## 8. 实施步骤\n\n### Step 1: 数据模型 + 事件白名单（半天）\n1. `src/shared/timeline/types.ts`\n2. `src/shared/timeline/event-filter.ts`\n3. 补齐所有 Phase 2 新增事件（note/library/feed/kb/para 等）的定义\n4. `src/main/timeline/projectors.ts`（每个 event kind 的 projector）\n\n### Step 2: Timeline Store（1 天）\n1. `src/main/timeline/store.ts`\n2. 从 TraceableEventStore 按日期范围读取 events → 投影成 TimelineEntry\n3. 聚合规则（长文、任务等）\n4. 索引生成（月/年）\n5. IPC 暴露\n\n### Step 3: 日视图 UI（1 天）\n1. `src/renderer/views/TimelineView.tsx`\n2. `src/renderer/components/timeline/DailyTimeline.tsx`\n3. `src/renderer/components/timeline/TimelineEntryCard.tsx`\n4. `src/renderer/components/timeline/TodaysGlanceCard.tsx`\n5. `src/renderer/components/timeline/DailySummaryCard.tsx`\n6. 时段分组渲染\n\n### Step 4: 周/月/年视图（1 天）\n1. `src/renderer/components/timeline/WeeklyView.tsx`\n2. `src/renderer/components/timeline/MonthlyCalendar.tsx`（热力色块）\n3. `src/renderer/components/timeline/YearlyHeatmap.tsx`\n4. 视图切换器\n\n### Step 5: 今日总结（半天）\n1. 系统定时任务 `daily-summary` 注册\n2. Prompt 模板实装\n3. 手动触发 API\n4. 总结编辑 UI\n\n### Step 6: 特殊事件 + Quick Capture（半天）\n1. Quick Capture UI 增加 \"特殊标记\" 选择\n2. Note frontmatter 新增 `special_marker`\n3. Projector 渲染特殊样式\n\n### Step 7: PDF 导出（半天）\n1. PDF 模板（React + print CSS）\n2. 日/周/月/年四种模板\n3. 导出 IPC\n\n### Step 8: 测试 + 打磨（半天）\n1. 跑过完整的 Phase 1+2 事件 → timeline 正确渲染\n2. 开发者模式切换（Layer 2 展开）\n3. 空日（没事件）的优雅降级\n4. 大日（几百个事件）的性能\n\n**总计：约 4~5 天 AI 实施**\n\n---\n\n## 9. 验收标准\n\n- [ ] Timeline 一级入口可见\n- [ ] 日视图：时段分组、今日一瞥、AI 总结卡片\n- [ ] 日视图 entry 渲染正确（所有 Layer 1 event kinds）\n- [ ] 事件聚合工作（长文、多次任务）\n- [ ] 承接关系 ↳ 渲染正确\n- [ ] 周视图：7 天卡片 + 本周总结\n- [ ] 月视图：日历 + 热力色块 + 月度亮点\n- [ ] 年视图：热力图 + 年度亮点\n- [ ] 视图切换流畅\n- [ ] AI 今日总结：定时任务自动生成 + 手动触发\n- [ ] 特殊事件融入 Quick Capture\n- [ ] PDF 导出（日/周/月/年）\n- [ ] Layer 2 折叠/展开（开发者模式）\n- [ ] Layer 3 绝对不出现在 Timeline\n\n---\n\n## 10. Future-Proof\n\n### 架构预留（现在不实现）\n\n1. **外部事件流入**\n   - GitHub commits (`external.github.commit`)\n   - Calendar events (`external.calendar.event`)\n   - Health data (`external.health.activity`)\n   - Email 重要事件 (`external.email.flagged`)\n   - 架构上：TraceableEvent 的 kind 前缀 `external.*`，projector 继续扩展\n\n2. **隐私层级**\n   - `TimelineEntry.visibility: 'normal' | 'private' | 'encrypted'`\n   - 某些事件可标记\"**隐身**\"：不进 AI 总结、不进年鉴 PDF\n   - 加密存储（未来加 SQLCipher 或 EncFS 包装）\n\n3. **Memory 可视化**\n   - 某个 entry 未来被引用/关联的次数\n   - \"这段回忆被唤回 N 次\"\n\n4. **年鉴成书**\n   - 未来可以把一年的 timeline 打印成一本书\n   - 精装封面、章节目录、索引\n\n### 数据字段预留\n\n```typescript\ninterface TimelineEntry {\n  // ... 已有字段\n  \n  // Future-Proof 预留\n  visibility?: 'normal' | 'private' | 'encrypted';   // 隐私\n  external_source?: string;                           // 外部来源\n  engagement_count?: number;                          // 被回忆次数\n  emotional_tone?: 'positive' | 'neutral' | 'negative';  // AI 情感分析\n  location?: { lat: number; lng: number };             // 地理（如有）\n}\n```\n\n---\n\n## 11. 和其他文档的连接\n\n| 文档 | 本文档如何依赖 |\n|------|---------------|\n| 文档 1（笔记系统） | Note 事件是 Timeline 的主要来源 |\n| 文档 2（定时任务） | daily-summary 作为系统定时任务 |\n| 文档 4（Stage View） | Timeline 的 entry 可以有 artifact 链接（跳转到当时的 stage） |\n| 文档 6（Resource） | Resource engagement 事件进 Timeline；Resource 页面的 timeline 视图是本文档的子集 |\n","toolExplanation":"文档 5 章节 5-11"})

---

## [Tool] 2026-04-27T11:31:13.540Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md","size":33696,"append":true}

---
