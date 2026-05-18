# Orbit 用户手册 / User Guide (v2)

Orbit 是一个"项目即文件夹 + AI 协作"的本地工作台。本指南用一个完整的日常流程，带你从 0 走到 1。

## 1. 首次打开 / Pick or create a vault

首次启动看到 Welcome 界面：

- **Create vault**: 选一个空文件夹，Orbit 会帮你 scaffold `01_Projects / 02_Areas / 03_Resources / 04_Archives` + `.orbit/` 控制目录 + 一份空的 `Vision.md`。
- **Open vault**: 指向一个已经存在的 Orbit vault（含 `.orbit/config.json`）。
- **Last vault**: 默认会在启动时自动重开上次的 vault（Settings → General 可关）。

顶部拉到最右可以随时 `Switch vault` 切换工作库。

## 2. 写下你的 Vision.md

Dashboard 顶部有 **Vision** 卡片。第一件事就是把它写出来——Orbit 会把这段文字塞进每个 Agent 的 system prompt，让所有 AI 都知道"你到底想成为谁"。

支持：
- 使用任何 Markdown 格式
- 通过 `[[]]` 链接到 Project / Resource / Area 的 README
- 在 Project Room 里再看一次 Vision 摘要

## 3. 新建项目 / + New Project

顶栏按 **+ New Project** 或按 `⌘N`。

弹窗会问你：

- **Template**: `blank` / `web-app` / `research` / `writing`
- **Slug**: 会成为文件夹名（`01_Projects/<slug>/`）
- **Name** + **Description**
- 可选 area, tags

确认后 Orbit：
1. 创建 `01_Projects/<slug>/` 文件夹
2. 初始化独立 git 仓库（`cd` 进去就是一个干净的 repo）
3. 按模板渲染 `README.md`, `AGENT.md`, `.orbit/config.json`
4. 写入项目级 agent context（包括 `orbit-cli.md`），这样在项目根跑 `claude` 时，CLI 能看到 Orbit 的可用命令
5. 在 Dashboard 上新增一张卡片

## 4. 进入 Project Room

点 Dashboard 卡片或顶栏 **Project** tab 进入 Project Room：

- **中间主区**：Project header + 外层 `Kanban / Terminal / Sessions / GitHub` 四个工作模式
- **Kanban 模式**：全宽任务看板；点 task 后在右栏里编辑
- **Terminal 模式**：嵌入式终端，cwd 就是项目根
- **GitHub 模式**：看仓库状态、issues / PR / worktrees，并直接完成 publish / Create PR
- **最右侧 Sidebar**：上下文右栏，按你当前在做什么切换

Project Room 的右栏现在分两级：

- **一级 tab**：`Overview / Focus / Execution`
- **二级 tab**：只显示当前页面相关的共享子面板

具体来说：

- 在 **Kanban** 外层页签下，点一个 task 会把详情放进右栏的 **Focus → Task Detail**
- 切到 **Terminal** 外层页签，右栏默认显示 **Overview → Task Tree**，方便边跑命令边看整个项目任务状态
- 在 **Editor / Project Room** 里，右栏都可以切到统一的 **Overview → Inspector**，里面有 `Files / Changes` 两个 tab
- `Sessions / Run Log / Diff / Review` 归到 **Execution**，不再和文件/任务上下文混在一起
- 切到 **Sessions** 外层页签时，右栏会自动跳到 **Execution → Sessions**；列表留在右栏，主区专门显示会话详情与 transcript
- 目前 Project Sessions 会优先导入本机的 **Claude** 与 **Codex** 本地 transcript，能看到用户/agent 的聊天记录

Kanban 顶部：
- 拖拽卡片换列会立即写回 frontmatter 的 `status`
- 卡片右上角 ▶ 一键发起**单次 headless Agent run**（会走 worktree + ghost-commit 流程）
- 如果 task 被 Daily Review 选为 "Recommended today"，会有 🌟 徽章

## 5. 在终端里跑 Claude（或 Codex / Gemini）

Project Room 底部终端直接敲：

```bash
claude
# or any other local agent CLI
```

Agent 可以通过项目 context 学到 `orbit` CLI。常用命令包括：

| 命令 | 作用 |
| --- | --- |
| `orbit search <query>` | 跨整个 vault 全文搜索 |
| `orbit cat <path-or-uid>` | 读任意 Markdown（by UID 或相对路径）|
| `orbit task list --project <uid>` | 获取项目 task 列表 |
| `orbit task update <uid> ...` | 更新 task frontmatter 或四段内容 |
| `orbit proposal create ...` | 为独立新任务提交待审批 Proposal |
| `orbit inbox list` | 查看 Inbox 待处理事件 |
| `orbit activity list` | 查看 Activity Log |

让它 "根据 README，提出 3 个新任务"——它应通过 Proposal 流程把独立任务交给你审批，而不是直接写入 Kanban。

快捷键：`` ⌘` `` 把焦点扔回终端。

## 5.1 配置 Runtime B SDK endpoint

在 **Settings → AI Endpoints** 可以配置应用内 SDK runtime。Orbit 内置 Anthropic、MiniMax、DeepSeek 和 Custom Anthropic-compatible endpoint 模板。

每个 endpoint 包含 base URL、默认模型、启用状态和 API key。API key 不会显示明文；保存后界面只展示 masked key state。可以用 **Test** 按钮验证 endpoint 是否可用，并为 Ask / Synthesis / Background 分别设置默认 endpoint。

Ask-Anywhere 会优先使用已启用且带 key 的 Ask 默认 SDK endpoint 进行 streaming；如果没有可用 SDK endpoint，则继续回退到 Claude Code CLI。

## 5.2 Synthesis artifacts

Orbit 的 AI 摘要和建议会先进入 Layer 2 Synthesis artifact，而不是直接改写你的 truth 数据。artifact 存在 `<vault>/.orbit/synthesis/`，带有来源、prompt version、runtime/model、生成时间和状态。

当前接入点：

- **Daily Timeline → Summarize**：生成 `summary.daily` artifact，并在用户点击 Summarize 的动作下物化/更新 daily-summary note。
- **Resources → Suggest from Notes**：生成 `emerge.resource` artifact-backed suggestions。只有点击 **Create** 后才创建真正的 Resource。
- **Developer Console**：右侧 Synthesis artifacts 面板可查看 artifact payload、provenance、fresh/stale/failed/superseded 状态。

## 5.3 Ask-Anywhere conversations

Ask-Anywhere overlay 和全页 Ask 现在使用同一套 Conversation。打开悬浮球时会默认回到最近使用的全局 conversation；切到全页 Ask 后仍然看到同一个对话、消息和 Artifact Stage。

可用动作：

- 顶部下拉切换 conversation。
- **+ New** 新建 conversation。
- **Archive** 归档当前 conversation（历史仍保留在 `.orbit/conversations/`）。
- 右侧 **Artifact Stage** 显示当前 conversation 生成的 artifact/action card。

后续 Resource / Area scoped chat 会复用同一套 Conversation 结构，不再为每个页面单独实现 chat。

## 5.4 Notes and Knowledge Base

**Notes** 是 Layer 1 的用户输出 primitive。Notes 页面可以浏览、搜索、编辑以下目录：

- `notes/thoughts`
- `notes/longforms`
- `notes/captures`
- `notes/voice_logs`
- `notes/daily-summaries`

Note 支持 tags、areas、resource refs、source origin、special marker 和 synthesis ref。右侧 Context 面板会显示路径、source、backlinks、outlinks 和 synthesis ref。

**Knowledge Base** 用来导入旧 Markdown / Obsidian archive。导入后的文档保留在 `knowledge-base/<kb-name>`，不会自动成为活跃 Note。只有点击 **Activate to Note** 后，Orbit 才会创建带 `source.kind = kb` 的 Note，并记录 `kb.doc.activated` promotion event。

## 5.5 Library workstation

**Library** 是用户主动保存的外部素材层，属于 Layer 1。可以保存 URL/文章/PDF/视频/书签，并维护阅读状态、annotations、areas、resource refs。

Library 页面支持：

- **Save URL**：保存外部素材为 `library/<kind>/...md`。
- status filters：`saved / reading / read / distilled / archived`。
- reader/editor：编辑素材正文和 metadata。
- annotations：记录 highlight/comment。
- **Distill**：先生成 `distill.library` SynthesisArtifact。
- **Accept to Note**：用户确认后才创建 Note，Note 会带 `source.kind = library` 和 `synthesis_ref`。

Feed item 仍然必须先 Save to Library，不能直接进入 Resource 或 Note。

## 5.6 Feed Reader

**Feed Reader** 是 Layer 0 信号源阅读器，用来跟踪 RSS 等外部输入。原始 feed item 只是候选信号，不会自动进入主 Timeline、Library、Resource、Note 或主知识库。

Feed Reader 页面支持：

- **Sources**：添加、选择、移除 RSS / YouTube / X 账号等 feed source。
- **Fetch**：从选中的 source 或全部 source 拉取最新条目，并做去重。
- **Filters**：查看 new / seen / ignored / saved / all 状态。
- **Save to Library**：显式 promotion gate。只有点击保存后，feed item 才会成为 Layer 1 `LibraryItem`。
- **Seen / Ignore**：整理阅读状态，不改变 Layer 1 truth。
- **Digest / Cluster**：生成 feed-scoped synthesis artifact，用于快速浏览当日摘要或主题簇，不会自动写入 Note。

这意味着 Feed 可以大胆接收噪声；真正进入长期知识系统的内容必须由用户保存。

## 5.7 Daily Timeline

**Timeline** 是基于 `TraceableEvent` 的人生事件投影视图，不是新的手写数据表。它把 Notes、Library、Feed 保存、KB 激活、Conversation、Resource、Task 等 Layer 1 事件按天/周/月/年重新组织。

Timeline 页面支持：

- **Day / Week / Month / Year**：在日视图看时段分组，在周/月/年视图看活动热力和汇总。
- **Today at a glance**：快速查看事件数、thoughts、长文新增字数、Library、Tasks、Conversations。
- **AI Daily Summary**：手动生成 `summary.daily` artifact，并 materialize 为 `notes/daily-summaries/...`。不会在未触发时静默写 Note。
- **Layer 2 toggle**：默认隐藏 agent/runtime/synthesis 技术事件；打开后用于调试。
- **Export PDF**：导出当前 day/week/month/year 范围到 `.orbit/timeline/exports/`。

Feed fetch、seen、ignore 等原始信号整理不会出现在 Timeline；只有 Save to Library 这种 promotion gate 会显示。

## 5.8 Resource Workstation

**Resource** 是长期主题工作站，不是收藏夹，也不是 tag dump。它用于沉淀一个持续感兴趣的主题，例如 “second brain”、“LLM workflows” 或 “health systems”。

Resource 页面支持：

- **Create / Edit**：创建主题工作站并编辑 `index.md`。
- **Sections**：把材料放入 canonical、distilled、related、people、projects touched 等区域。
- **Areas / Status / Depth**：记录这个主题属于哪些 Area、当前是否 active/dormant/evolved，以及掌握深度。
- **Link material**：链接 Note、LibraryItem、KB item、Project、Area、Person 或 URL。Feed source/raw feed item 不能直接链接，必须先 Save to Library。
- **Promote canonical**：把一个 related/distilled ref 提升到 canonical。
- **Record engagement**：手动记录一次触及，更新 Resource 的 timeline、last engaged 和 engagement count。
- **Suggest from Notes**：从重复出现的 note tags 生成 `emerge.resource` artifact；只有点击 Create 后才创建 Resource。
- **Scoped Chat**：为当前 Resource 创建 resource-scoped conversation，供 Ask-Anywhere 注入主题上下文。

Resource 的结构化状态保存在 `.orbit-resource.json`，同时生成 Obsidian-compatible 的 Markdown 目录和 README。

## 5.9 Semantic Search

**Search** 是跨 vault 的语义入口，会同时检索 Layer 1 truth（Notes、Library、Resources、Projects、Areas、Conversations、KB docs）和 Layer 2 synthesis artifacts。Feed 原始条目不会直接出现在搜索里；只有 **Save to Library** 后才进入 Layer 1 并被索引。

Search 页面支持：

- natural-language query，输入后 300ms debounce 搜索。
- filters：entity kind、Layer 1/2、Area slug、时间范围，以及 semantic / keyword / hybrid mode。
- index status：如果 TraceableEvent 标记索引 stale，页面会显示 stale badge 和 Refresh 按钮。
- memory recall：搜索时会同步召回相关 Memory，显示 semantic / episodic / procedural layer、召回原因，并支持 Helpful / Not relevant 反馈。
- **Generate answer**：生成 `search.answer` synthesis artifact，带 provenance 和引用来源，不会写入 Notes/Library/Resources。
- **Ask across results**：创建 Ask-Anywhere conversation，并把当前搜索结果和召回的 Memory 一起作为上下文注入。

## 5.10 Memory Explorer

**Memory** 是可解释的长期记忆层，用来管理 Orbit 从对话、复盘和手动输入中提取的偏好、兴趣、行为模式、教训、目标和实体记忆。记忆不是 Note/Resource/Project truth；只有用户点击提升动作时才会写入 Layer 1。

Memory 页面支持：

- hybrid layers：semantic（偏好、目标、兴趣、实体事实）/ episodic（过去经历与教训）/ procedural（工作方式与可复用流程）。
- filter by kind：interest / preference / pattern / lesson / entity memory / goal。
- stability：volatile / stable / core，会根据 evidence、confidence、recall count 和用户确认自动演化。
- actions：Confirm、Archive、Promote to Resource、Promote to Project。
- **Memory graph**：按 shared entity、shared source 和 theme overlap 显示记忆之间的关系，用来解释为什么旧想法会一起浮现。
- **Generate digest**：生成 `memory.digest` synthesis artifact，汇总新增、增强、可能衰退的记忆和 clusters。
- Ask-Anywhere：有相关记忆被唤回时，会在对话顶部显示 memory chips、memory layer 和召回原因，并可隐藏。

## 5.11 Review System

**Review** 会从 Layer 1 truth 中生成结构化复盘运行记录（ReviewRun）和 findings，用于发现 stale、unassigned、dormant、undistilled 等异常。旧的 Daily Review journal 仍然保留；新的 Review 页面面向周/月/Area/Resource 等结构化复盘。

Review 页面支持：

- tabs：daily / weekly / monthly / area / resource。
- **Run review now**：立即生成一条 ReviewRun，并写入 `review.weekly` 或对应 summary synthesis artifact 作为 Layer 2 输出。
- findings：warning / suggestion / info，带 rationale、evidence 和 suggested actions。
- actions：Acknowledge、Ignore、Create Task、Archive Project、Assign Area、Refresh Resource 等；写 Truth 的动作必须由用户点击触发。
- review history：已生成或归档的 run 会保存在 `.orbit/review/`。

## 5.12 Vision Dashboard

**Vision** 保留根目录 `Vision.md` 作为可读的 North Star，同时新增结构化目标层：goal、milestone、alignment 和 drift review。结构化数据保存在 `vision/.orbit/vision-store.json`。

Vision 页面支持：

- 创建不同 horizon 的目标：life / 5y / 1y / quarter。
- 将目标关联到 Area slug，并通过 Area 下的 Projects、Resources、Notes 计算 alignment score。
- drift warnings：发现目标关联 Area 缺失、inactive 或活动不足时提示。
- milestone completion：里程碑完成会记录 TraceableEvent。
- **Quarterly review**：生成 Vision review synthesis artifact，不会自动改写目标。

## 5.13 Scheduled Automation

**Scheduled** 用来管理 Orbit 的系统任务和用户自定义自动化。系统任务包括 Daily Summary、Weekly Review、Monthly Review、Resource Health Scan、Feed Daily Digest、Vision Quarterly Review 和 Memory Weekly Digest。

Scheduled 页面支持：

- 系统任务区和用户任务区，显示状态、下一次执行时间和执行历史。
- 自然语言创建自动化，并可设置 budget、retry attempts 和通知渠道。
- **Run now** 立即执行任务并记录 execution；synthesis、review 和 memory digest 动作只生成 Layer 2 产物或排队执行，不会静默写入 Truth。
- **Enable / Disable** 管理任务状态；用户任务删除前会二次确认。
- budget exceeded 会写入失败执行记录并禁用任务，避免后台无限消耗。

## 5.14 Gateway + Telegram

**Gateway** 是 Orbit 与外部世界连接的本地守护进程入口。当前 v1 支持 Telegram long polling、用户绑定/白名单、权限开关、消息历史和基础路由。

Telegram 支持：

- `/start <code>`：在 Gateway 页面生成一次性 bind code 后绑定 Telegram 用户。
- `/capture <text>`：创建 capture note，写入 Layer 1 需要用户显式发送命令。
- `/ask <question>`：把问题路由到 Ask-Anywhere conversation。
- `/summary`：请求生成当天 summary。
- 转发 URL：保存到 Library gate。
- 转发文件：保存到 vault 的 gateway inbox 路径。

Gateway 页面支持启动/停止 daemon、配置 Telegram token、维护 whitelist、查看 channel permissions、最近消息和 Gateway logs。App 侧 IPC 也提供 `getStatus/listChannels/enableChannel/disableChannel/getMessages/sendOutbound/startDaemon/stopDaemon/setVaultPath`，方便后续拆成真正独立进程。

## 6. 四段式任务编辑

每个 task 文件是一份 Markdown：

```md
---
uid: XXXXXXXX
type: task
project_uid: <project-uid>
title: ...
status: doing
priority: high
git_branch: orbit/ghost/ABC12345
---

## Description
用户视角、目标、验收标准。

## Thinking
AI 在干活前自己发散出的计划。

## Execution Log
每一条操作、每一次 `git commit`、每一次 `claude` 调用的时间轴。

## Summary
收尾时填，会喂给 Daily Review。
```

编辑器特性：
- 每段独立保存（去抖 300ms）
- `## Execution Log` 默认以时间线形式只读展示，勾 "Raw edit" 切换到原文编辑
- Frontmatter 有专门的表单，也允许你直接 free-form 编辑 description 字段
- 顶部 "Try rescue" 按钮用于找回孤儿任务（见 §12）

## 7. 拖拽换列 / 单次 Agent run

- 拖卡片：实时改 `status`，`fs:watcher` 会广播事件让 Backlinks / Today / Inbox 同步
- 点卡片 ▶：发起一个单次 headless 运行
  - 创建新 worktree → 起 `claude --print` → ghost branch 提交结果
  - 需人工 preMergeCheck 通过后才能 squash 回 main
  - 跑完如果超预算会被 budget gate 拦下（顶栏红色 Today pill）

## 8. Auto-runner —— 持续调度

Auto-runner 默认关闭，需要你在 Settings 里显式开启：

1. Settings → Auto-runner → 开启 `autoRunner.enabled`
2. 确保 task 已 approved 且依赖链已解锁
3. Dispatcher 会周期性扫描 ready task，并在独立 worktree 中启动 agent run
4. 运行状态、错误、proposal 与需要你处理的事件会进入 Activity Log / Inbox

## 9. 次日早晨 / Daily Review

Dashboard → **Today's Journal**：
- 已有：`02_Areas/Journal/YYYY-MM-DD.md` 直接读
- 没有：点 **Generate** 让 LLM（或 fallback 模板）生成
- 生成后会把被推荐的 task 标 🌟 Recommended today
- 顶栏点 **Journals** 回看所有历史

## 10. 归档项目

当项目完成：
- 打开 README，点标题栏的 **结项 / Close project**
- 可选勾 "Distill"：Orbit 跑一次 LLM distillation 生成一份 Resource 摘要
- 整个 `01_Projects/<slug>/` 文件夹会被搬到 `04_Archives/YYYY/<slug>/`
- UID 保持不变，所有 `[[wikilink]]` 依然有效

## 11. 从旧版迁移

如果你的 vault 里还有旧式单文件项目（`01_Projects/<slug>.md`），顶部会出现黄色提示条。点击进入 Migration Dialog：

1. 先做 dryRun 展示将要迁移的项目列表
2. 确认后，Orbit 在 vault 根做 `git add -A && git commit -m "orbit: pre-v3 migration snapshot"`（如果 vault 根已经是 git repo 的话）
3. 显示 snapshot 的 SHA；如出问题可 `git reset --hard <sha>` 回滚
4. 每个项目独立迁移，部分失败会继续处理其它项目并在最终报告里列出失败列表
5. 再跑一次无变化（幂等）

详见 [MIGRATION.md](./MIGRATION.md)。

## 12. Relink —— 找回跑丢的 task

如果一个 task 文件被意外挪动或项目被改 slug 导致孤儿：

1. 打开那个 task（任意方式）
2. TaskEditor 顶部 **Try rescue**
3. 下拉选要挂到哪个项目
4. 点 **Relink**：后台 IPC `task.relink(path, newProjectUid)` 改 frontmatter + 文件搬到目标项目的 `.orbit/agent/tasks/`

## 13. 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘K` | Command palette（fuzzy 搜 projects / tasks / vision） |
| `⌘N` | 新项目 |
| `⌘⇧N` | 新任务（在 Project Room 内） |
| `⌘B` | 折叠 / 展开左侧 Sidebar |
| `` ⌘` `` | 把焦点切到嵌入式终端 |
| `⌘S` | 强制保存当前编辑器 |
| `Esc` | 关 Modal / Drawer / Palette |

## 14. 右侧 Sidebar 的工作方式

右侧栏不再是全局固定工具箱，而是**跟随当前页面上下文**：

- **Editor**：显示 `Inspector / Backlinks`，其中 Inspector 提供 `Files / Changes`
- **Dashboard**：显示总览与执行相关面板，比如 `Review / Worktrees / Agent / Run Log / Diff`
- **Project Room**：按 `Overview / Focus / Execution` 切分任务理解、对象处理、执行跟进

这样切换页面时，右栏只保留和这一页真正相关的面板，不会再把所有工具同时堆出来。

### Inspector：Files vs Changes

- **Files**：像 IDE 一样浏览当前项目目录；project surface 下会显示完整项目树，而不是只看 Markdown；支持搜索、刷新、折叠
- **Changes**：按目录分组查看当前 git 变更；可对单个文件 stage / unstage / discard；右侧直接看 unified diff
- **Commit / Publish**：Changes 底部可直接提交 staged changes；如果项目还没绑定 GitHub，会显示 publish 表单；已绑定则显示 Create PR 表单。整个流程不再弹 `prompt / confirm`

## 15. Settings 要点

- **Budget**: 每次 run + 每日的 token / USD 上限；Hard stop 打开时超限直接中断
- **API / CLI**: 自定义 `claude` binary 路径（留空则走 PATH）
- **Vectors**: 调 wake-up 阈值（0–1，默认 0.2）
- **Worktree GC**: `worktreeGcEnabled` / `worktreeGcDays`（默认 7 天）
- **Daily Review**: 定时自动生成 Daily Review 的时间

## 16. 常见问题

- **Claude not found** → Settings → API / CLI 里填 binary 路径
- **预算耗尽** → Settings → Budget 提高上限或关掉 Hard stop
- **Worktree 清理不掉** → Settings → Advanced → "Reset all unmerged worktrees"
- **崩了不启动** → 看 `<vault>/.orbit/crash/YYYY-MM-DD.log` 或 userData 的 crash 目录
