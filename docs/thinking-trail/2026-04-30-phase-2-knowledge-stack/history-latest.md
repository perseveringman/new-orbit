# Conversation History Archive

- **Session**: 929bf5e0-8e09-4bfd-b0d6-7b705ae0f72d
- **Exported at**: 2026-04-28T07:44:40.704Z
- **Messages**: 91 (2026-04-28T04:01:18.927Z ~ 2026-04-28T07:13:51.862Z)
- **Rounds**: 5 user turns

---

## [User] 2026-04-28T04:01:18.927Z
<attachments>
The user has attached the following files/resources. Process them as needed to fulfill the request:
- /Users/ryanbzhou/Developer/vibe-coding/boxai/.uploads/1777348878924-clipboard_1777348825051.png (image)
</attachments>

[使用Skills: project-brainstorm] 和我讨论/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit 下一阶段的需求，先读存量的文档，了解项目全貌，我想优化ask-anywhere的使用体验，现在这个布局肯定是不对的，点击悬浮球出了这个页面，悬浮球应该出右下角弹窗，左侧导航栏也没有ask-anywhere的入口

---

## [Assistant] 2026-04-28T04:01:28.687Z
我先加载 project-brainstorm 技能，然后并行读取项目文档和截图，了解全貌。

### Tool Calls:
- **use_skill**({"command":"project-brainstorm","toolExplanation":"加载项目规划技能"})
- **image**({"image":"/Users/ryanbzhou/Developer/vibe-coding/boxai/.uploads/1777348878924-clipboard_1777348825051.png","task":"general","prompt":"详细描述这个应用的界面布局：左侧导航栏有哪些菜单项？中间主内容区显示什么？顶部有什么元素？整体视觉结构如何？特别关注右下角是否有悬浮球以及当前 Ask Anywhere 的呈现方式。","toolExplanation":"分析当前界面布局"})
- **_set_read_intent_dirs**({"dirs":["/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit"],"toolExplanation":"授权读取 orbit 项目目录"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit","depth":2,"offset":0,"limit":200,"toolExplanation":"查看项目目录结构"})
- **memory_read**({"path":"兴趣爱好/Orbit-Ask-Anywhere","toolExplanation":"读取已有 Ask Anywhere 记忆"})

---

## [Tool] 2026-04-28T04:01:41.550Z
{"action":"executed","skillName":"project-brainstorm","location":"user","content":"---\nname: project-brainstorm\ncn_name: 项目脑暴伙伴\ndescription: >-\n  Long-lived project thinking partner for the full project lifecycle. Five modes —\n  (1) Bootstrap, brainstorm new project from scratch;\n  (2) Onboard, reverse-engineer existing codebase into docs;\n  (3) Evolve, iterate with new features or pivots;\n  (4) Review, audit docs for gaps;\n  (5) Reference, deep-analyze another project/product to find borrowable patterns.\n  Reference mode supports local code paths, GitHub URLs, product names (web search),\n  and doc/RFC files. Analyzes product design, tech architecture, core abstractions,\n  trade-offs, anti-patterns, and evolution history, then outputs opinionated\n  recommendations with borrowing difficulty. Can also be invoked inline during\n  other modes. Trigger phrases include 从零开始做项目, 帮我规划项目, 梳理 XX 项目,\n  给 XX 加功能, review 文档, 参考/对比 XX 项目, XX 项目这块怎么做的,\n  借鉴 Linear/Things, analyze this codebase for reference.\n---\n\n**📁 SKILL DIRECTORY PATH**\n\n`/Users/ryanbzhou/Library/Application Support/Box/engine/skills/user/project-brainstorm`\n\nAll relative file paths mentioned in this skill are relative to the above directory.\n\n**📂 DIRECTORY CONFIGURATION**\n\n**Working Directory**: `/Users/ryanbzhou/Developer/vibe-coding/boxai`\n- This is the user's project root directory\n- Final deliverables should be saved to `/Users/ryanbzhou/Developer/vibe-coding/boxai/output/929bf5e0-8e09-4bfd-b0d6-7b705ae0f72d`\n\n**Session Temp Directory**: `/Users/ryanbzhou/Developer/vibe-coding/boxai/.session_tmps/929bf5e0-8e09-4bfd-b0d6-7b705ae0f72d`\n- This is a dedicated temp directory for this session\n\n**⚠️ CRITICAL FILE OPERATION RULES**:\n1. All intermediate/temporary files (HTML, JS scripts, images, thumbnails, cache, etc.) MUST be written to the Session Temp Directory\n2. Do NOT create \"workspace/\", \"temp/\", or other directories under Working Directory for intermediate files\n3. Final deliverables (e.g., output.pptx, result.pdf) should be saved to `/Users/ryanbzhou/Developer/vibe-coding/boxai/output/929bf5e0-8e09-4bfd-b0d6-7b705ae0f72d` or user-specified location\n\n---\n\n# 项目脑暴伙伴 (Project Brainstorm)\n\n一个陪你把项目想清楚、写下来、持续迭代的长周期思考伙伴。不是一次性生成文档，而是通过**结构化多轮对话**把模糊想法磨成可执行蓝图，并在项目演进中持续对话、持续沉淀。\n\n## 核心理念\n\n好的项目文档不是写出来的，是**问出来的**。用户脑子里有大量隐性认知没表达出来，你的工作是通过有节奏的追问把它挖出来并结构化。\n\n三个原则：\n\n1. **checklist 驱动完整性** — 每个阶段有明确维度要覆盖，不要凭感觉结束\n2. **主动评估 + 用户拍板** — 你负责基于 checklist 评估并汇报剩余疑点，用户最终决定是否收尾\n3. **文档随对话增长** — 每轮对话后增量更新文档，不要憋到最后一次性生成\n\n## 五种模式\n\n这个 skill 支持五种工作模式。**启动时必须先判定模式**，再走对应流程。\n\n| 模式 | 何时使用 | 详细流程 |\n|------|----------|----------|\n| **Bootstrap** | 全新项目，零起点 | `references/phases.md` |\n| **Onboard** | 已有代码/项目但无规范文档，需要考古+对齐 | `references/onboard-workflow.md` |\n| **Evolve** | 已有标准文档，要加功能/调方向/深化某模块 | 见下文\"Evolve 模式\" |\n| **Review** | 已有标准文档，想体检找断点 | 见下文\"Review 模式\" |\n| **Reference** | 分析另一个项目/产品，找可借鉴的设计 | `references/reference-workflow.md` |\n\n模式判定规则在 `references/modes.md`，启动时必读。\n\n**Reference 模式特殊性**：既可作为独立模式（系统性对比分析），也可在 Bootstrap/Evolve/Review 中**灰度调用**（聊到某模块时临时参考另一个项目的做法）。\n\n## 启动流程（每次对话第一步）\n\n### Step 1：判定模式\n\n读取 `references/modes.md`，根据用户消息和目录状态判定模式：\n\n- 用户提到\"参考/对比/借鉴 XX 项目\"或给出参照项目路径/URL/产品名 → **Reference**\n- 用户指向代码路径 / GitHub URL / 现有项目文件夹（且意图是梳理该项目本身） → **Onboard**\n- 目标项目文件夹不存在 → **Bootstrap**\n- 目标项目文件夹存在且含 `overview.md` + `.session.json` → 根据用户意图选 **Evolve** 或 **Review**\n- 目标项目文件夹存在但无 `overview.md` → **Onboard**\n\n### Step 2：确认项目名与工作目录\n\n从 `<user_info>` 读取 Output Directory（如 `/Users/xxx/output/SESSION_ID`）。\n\n项目工作目录统一为：`{OutputDir}/{project-name}/`\n\n**项目名规则**：kebab-case 英文。从用户描述中智能提取，不让用户手动起名。例如用户说\"AI native 个人工作台\"→ 提议 `ai-native-workspace`，给用户一次修改机会。\n\n### Step 3：加载/初始化 session\n\n`{project-dir}/.session.json` 维护对话状态：\n\n```json\n{\n  \"project_name\": \"ai-native-workspace\",\n  \"mode\": \"bootstrap\",\n  \"current_phase\": \"vision\",\n  \"phases_covered\": [],\n  \"checklist_status\": {},\n  \"pending_questions\": [],\n  \"features_identified\": [],\n  \"features_drafted\": [],\n  \"last_updated\": \"2026-04-25T10:00:00Z\"\n}\n```\n\n- 不存在 → 初始化\n- 存在 → 读取并向用户确认：\"上次我们聊到 {current_phase}，继续吗？还是切换话题？\"\n\n### Step 4：根据模式进入对应流程\n\n---\n\n## Bootstrap 模式 — 从零脑暴\n\n完整流程详见 `references/phases.md`。核心是**结构化分阶段 + 阶段内苏格拉底式深挖**：\n\n1. **愿景与动机**（为什么做这个、解决什么问题、你个人为什么在乎）\n2. **用户与场景**（谁用、典型场景、不服务谁）\n3. **核心价值主张与差异化**（跟现有方案比凭什么选你）\n4. **核心用户流程**（端到端走一遍，不是功能清单）\n5. **模块拆分**（从核心流程中识别出独立模块/功能）\n6. **逐模块深入**（每个模块一份 `features/{name}.md`，含产品设计 + 技术架构）\n7. **跨模块关切**（数据模型、权限、状态管理、可扩展性等）\n8. **MVP 边界与 roadmap**（明确砍什么、留什么）\n9. **风险与开放问题**（沉淀到 `open-questions.md`）\n\n每阶段结束前，基于 `references/checklists.md` 的该阶段 checklist 自评：\n- 全部覆盖 → 汇报\"本阶段 checklist 全部覆盖，建议进入下一阶段，你觉得呢？\"\n- 有未覆盖项 → 汇报\"还剩 X 个点没聊透：A、B、C，要继续还是先跳过标记 open question？\"\n\n**关键纪律**：用户说\"就这样吧\"不等于真的想好了。如果 checklist 明显未覆盖，要**明确指出**剩余疑点再让用户拍板。用户说\"先跳过\"是可以的，但必须写入 `open-questions.md`，不能假装没这回事。\n\n---\n\n## Onboard 模式 — 已有项目接入\n\n详见 `references/onboard-workflow.md`。核心是**考古 → 草稿 → 对齐 → 固化**：\n\n1. **考古分析**（扫代码结构、README、依赖、commit history）\n2. **推断草稿**（写到 `.onboard-draft/`，每份文档顶部标注\"⚠️ AI 推断，待确认\"）\n3. **逐份对齐对话**（带具体问题过每份草稿，发现方向偏差时明确指出）\n4. **固化收编**（对齐后转正为标准文档，删除 `.onboard-draft/`，切到 Evolve 模式）\n\n---\n\n## Evolve 模式 — 项目演进\n\n启动时先问用户本次想聊什么：\n\n- **加新功能** → 识别受影响模块，走小型 Bootstrap 流程只针对这个功能\n- **调整方向** → 讨论影响范围，更新 overview 相关章节，写 ADR\n- **深化某模块** → 针对该 feature 文档走苏格拉底式深挖\n- **技术选型重选** → 对比新旧方案 trade-off，写 ADR，更新技术架构章节\n\n**每次 Evolve 会话必须：**\n1. 识别受影响的文档（可能多份）\n2. 明确变更前后对比\n3. 追加一条 `changelog.md` 记录\n4. 重大变更（架构/方向/核心技术栈）追加一份 `decisions/ADR-NNN-*.md`\n\nADR 模板见 `references/doc-templates.md`。\n\n---\n\n## Review 模式 — 文档体检\n\n1. 通读所有已有文档\n2. 基于 `references/checklists.md` 的完整性 checklist 扫一遍\n3. 输出**诊断报告**：\n   - 缺失维度（比如 feature X 只有产品设计没写技术架构）\n   - 不一致（overview 说 A，features/xxx.md 说 B）\n   - 过时嫌疑（某段落跟最新 ADR 冲突）\n   - 过度含糊（\"支持高并发\"这种没量化的描述）\n4. 和用户逐项讨论要怎么处理，修复完更新文档\n\n---\n\n## Reference 模式 — 参照项目对比分析\n\n详见 `references/reference-workflow.md`。核心是**深度分析另一个项目，找到可借鉴的设计并给出带观点的推荐**。\n\n### 支持的输入类型\n\n| 输入类型 | 示例 | 处理方式 |\n|----------|------|----------|\n| 本地代码路径 | `/path/to/project` | 直接扫描分析 |\n| GitHub URL | `https://github.com/org/repo` | clone 到 session temp 后分析 |\n| 产品名/网站 | \"Linear\"、\"Things\"、\"Superhuman\" | 联网搜索 + 官网/文档分析（无源码时） |\n| 文档/RFC 路径 | `/path/to/rfc.md` | 直接阅读并提取设计思想 |\n\n### 分析维度（六维深挖）\n\n1. **产品设计思路** — 交互模式、用户流程、状态模型\n2. **技术架构** — 技术栈、数据模型、模块拆分、通信机制\n3. **核心抽象** — 有什么独特的概念或设计模式值得学习\n4. **权衡识别** — 他们为什么选 A 不选 B，付出了什么代价\n5. **反面素材** — 什么地方做得不好，我们避免踩坑\n6. **演进线索** — Roadmap / commit history 看他们的发展路径\n\n### 输出产物\n\n- `references/{ref-project-name}.md` — 完整分析报告\n- 每个借鉴点标注推荐级别：**🟢 强烈建议借鉴** / **🟡 可参考** / **🔴 不适合你的项目**\n- 给出搬过来的具体修改建议\n\n### 两种调用方式\n\n**独立模式**：用户明确说\"帮我分析/参考/对比 XX 项目\"\n- 进入完整 Reference 流程\n- 产出完整的 `references/{name}.md`\n\n**灰度调用**：在 Bootstrap/Evolve/Review 中临时触发\n- 用户说\"XX 项目这块怎么做的？参考一下\"\n- 只针对当前讨论的模块做定向分析\n- 结果直接融入当前对话，不单独写 reference 文档\n- 重要借鉴点记入当前 feature 文档的\"参照来源\"章节\n\n---\n\n## 主动行为（跨所有模式）\n\n详见 `references/proactive-patterns.md`。核心触发时机：\n\n- **挑战想法**：用户描述含糊 / 逻辑有漏洞 / 忽略明显边界 → 用具体反例追问\n- **引用参照**：用户描述的功能有成熟参照物 → 主动提及并说明借鉴/差异点\n- **技术 trade-off**：用户提到技术需求 → 给 2-3 个方案对比，不只推荐一个\n- **范围蔓延预警**：用户在 MVP 阶段加\"而且还要...\" → 提醒这会让工期翻倍，建议划入 v2\n- **用户故事转化**：用户给出抽象描述 → 转成具体场景走查\"假设一个新用户周一早上打开应用...\"\n\n**不要等用户问才做这些**。用户付你对话费不是让你记录，是让你贡献思考密度。\n\n## 输出文档结构\n\n```\n{OutputDir}/{project-name}/\n├── overview.md           # 蓝图总览（愿景/用户/核心流程/模块列表/MVP 边界）\n├── features/\n│   ├── {feature-1}.md    # 每个功能一份，含「产品设计」+「技术架构」两部分\n│   └── {feature-2}.md\n├── references/           # 参照项目分析（Reference 模式产出）\n│   └── {ref-project}.md  # 每个参照项目一份完整分析\n├── decisions/\n│   └── ADR-001-{title}.md  # 架构/产品决策记录，按编号递增\n├── open-questions.md     # 悬而未决的问题清单\n├── changelog.md          # 项目演进历史（每次 Evolve 追加）\n├── .session.json         # 会话状态（隐藏文件，不给用户看）\n└── .onboard-draft/       # 仅 Onboard 模式临时用，确认后删除\n```\n\n所有文档模板见 `references/doc-templates.md`。\n\n## 收尾判定（Checklist + 主动汇报）\n\n每个阶段/会话结束前，必须做这件事：\n\n1. 基于 `references/checklists.md` 对应阶段 checklist 自评\n2. 明确汇报：\"**已覆盖**：X、Y、Z。**未覆盖/存疑**：A、B。**建议**：继续聊 A，或先跳过标记 open question。\"\n3. **等用户拍板**，不自己决定结束\n\n**严禁的结束方式**：\n- ❌ 用户说\"差不多了\"你就停，不汇报 checklist 状态\n- ❌ 自己觉得聊够了就生成最终文档不征求意见\n- ❌ 无限追问同一个点不推进（用户说跳过就跳过，记到 open-questions）\n\n## 文档写入纪律\n\n- **每轮对话后增量更新相关文档**，不要憋到最后\n- 每次写入前先读当前版本，避免覆盖\n- 对关键段落保留修改历史的语义（通过 changelog + ADR，不是在文档里堆删除线）\n- 用户明确拍板的内容才进正式文档，未定的进 `open-questions.md`\n\n## 参考文件索引（按需加载）\n\n- `references/modes.md` — **启动时必读**，模式判定与切换逻辑\n- `references/phases.md` — Bootstrap 九阶段详细流程与每阶段提问模板\n- `references/onboard-workflow.md` — Onboard 模式完整工作流\n- `references/reference-workflow.md` — Reference 模式完整工作流（深度分析 + 借鉴推荐）\n- `references/checklists.md` — 各阶段/各维度完整性 checklist\n- `references/doc-templates.md` — overview / feature / ADR / changelog / reference 模板\n- `references/proactive-patterns.md` — 主动挑战/引用/预警的触发时机与话术模板\n\n不要一次性全读，按当前所处模式和阶段加载对应文件即可。\n\n\n---\n\n## ⚠️ Known Issues & Solutions (from past experience)\n\nThe following issues have been encountered before when using this skill. **Check these FIRST if you hit an error.**\n\n### Issue 1\n\n**Error:** 在 Review 模式分析项目实施情况时，若项目根目录不是 git 仓库（git 仓库在子目录如 orbit/ 下），会误判为'未按规范提交语义化 commit'，导致实施完整性分析错误\n\n**Solution:** 在 Review 模式开始分析前，先递归探测 git 仓库位置（检查项目根目录及常见子目录如 orbit/、src/、app/ 等）；若根目录无 git 但子目录有，应以子目录 git 为准进行 commit 历史分析，并在诊断报告中记录此路径偏差\n\n### Issue 2\n\n**Error:** 在 Reference 模式分析本地项目时，若项目目录仅包含 `.onboard-draft` 等隐藏子目录，默认的目录扫描会过滤隐藏文件，导致误判目录为空或项目无实质内容。\n\n**Solution:** 在使用 project-brainstorm 分析本地项目路径前，先执行显示隐藏目录的扫描（如 `ls -la` 或带 `show_hidden` 的 list_files），特别检查是否存在 `.onboard-draft` 目录，避免遗漏 Onboard 模式的草稿内容。\n\n### Issue 3\n\n**Error:** 在梳理已有项目时，若代码中存在“人工触发批次执行”（如 Night Shift）与“系统自动流式执行”（如 Orchestration 自动认领）两种机制并存，容易直接固化现状描述，导致文档与产品真实意图产生方向偏差。\n\n**Solution:** 在生成功能模块文档前，先询问用户关于 Agent 执行模式的核心假设（24小时自动流式执行 vs 人工调度批次），若发现代码实现与假设不符，在 overview 中明确标注“方向偏差”并记录意图态，而非直接描述现状。\n\n### Issue 4\n\n**Error:** 在 Onboard 模式中，当考古阶段发现代码走向与文档叙述存在方向偏差嫌疑（如 README 与 ROADMAP 语气不一致、功能实现与产品定位不符）时，直接基于代码现状生成推断草稿，可能导致草稿包含用户实际上已抛弃的功能方向或错误的产品定位。\n\n**Solution:** 在生成推断草稿前，如果发现代码走向与文档叙述存在方向偏差嫌疑，必须先按照方向偏差处理模式与用户确认真实产品方向，得到明确反馈后再基于确认后的方向生成草稿，避免固化错误的方向假设。\n","skillDir":"/Users/ryanbzhou/Library/Application Support/Box/engine/skills/user/project-brainstorm","message":"Loaded skill: project-brainstorm"}

---

## [Tool] 2026-04-28T04:01:41.553Z
好的，这是对您提供的图片内容的分析和描述。

---

### **1. 图片类型**

这是一个软件应用的用户界面（UI）截图，具体为一个名为“Orbit”的应用程序的聊天或工作流界面。

### **2. 主要内容**

这张截图展示了一个功能丰富的应用程序界面，其布局清晰，分为三个主要区域：

*   **左侧导航栏**：包含一个垂直排列的菜单列表，用于在应用的不同功能模块之间进行切换。

*   **中间主内容区**：被进一步划分为两个子区域。

    *   **左侧子区**：显示一个名为“ASK ANYWHERE”的聊天或会话列表。

    *   **右侧子区**：显示当前选中会话的“CONTEXT”（上下文）信息。

*   **右侧主内容区**：显示一个聊天对话框，其中包含一个AI代理（AGENT）的回复。

### **3. 文字内容**

以下是图片中可见的关键文字信息：

*   **应用名称**: Orbit

*   **左侧导航栏菜单项**:

    *   Dashboard

    *   Runtimes

    *   Agents

    *   Console

    *   GitHub

    *   Inbox

    *   Notes

    *   Library

    *   Feeds

    *   Resources

    *   Knowledge

    *   Timeline

    *   Scheduled

    *   Gateway

    *   Today

    *   Journals

    *   Kanban

*   **中间主内容区**:

    *   **聊天列表标题**: ASK ANYWHERE

    *   **聊天列表项**:

        *   Ask Anywhere (2026/4/28 11:48:35)

    *   **上下文标题**: CONTEXT

    *   **上下文内容**:

        *   **Anchors**: `ask_anywhere_session: ask-17...`

        *   **Active skills**:

            *   `orbit-capture`

            *   `orbit-retrieve`

            *   `orbit-scheduling`

            *   `orbit-welcome-analysis`

*   **右侧聊天区**:

    *   **AI代理回复**: `AGENT` `I'm working! How can I help you today?`

*   **其他文本**:

    *   `+ New` (按钮)

    *   `Stop` (按钮)

    *   `1` (在“Inbox”旁边的红色通知徽章)

### **4. 其他信息**

*   **整体视觉结构**: 界面采用经典的三栏式布局，结构清晰，信息分区明确。左侧为导航，中间为会话和上下文管理，右侧为实时交互。整体色调为浅色系，风格现代、简洁。

*   **右下角悬浮球**: 在当前可见的图片范围内，**没有**看到右下角有悬浮球（Floating Action Button）。

*   **当前 Ask Anywhere 的呈现方式**: “Ask Anywhere”是中间主内容区左侧聊天列表中的一个条目，它被高亮显示，表明这是当前选中的会话。其右侧的“CONTEXT”区域实时显示了与该会话相关的上下文信息，包括一个会话锚点（Anchors）和一组激活的技能（Active skills）。

1.  **图片类型**：这是一个软件应用的用户界面（UI）截图。

2.  **主要内容**：该截图展示了一个名为 "Claude" 的AI助手或知识管理应用的界面。界面整体采用浅色主题，布局清晰，分为三个主要区域：左侧的聊天对话区、中间的“STAGE”区以及右侧的“Focus”区。聊天区显示了AI助手的欢迎消息，而右侧的“Focus”区则是一个文件管理器，列出了多个文件夹和文件。

3.  **文字内容**（如有）：

    *   **聊天区**：`AGENT`，`I'm working! How can I help you today?`

    *   **顶部**：`0 worktrees`，`$0.34 / $20`，`About`，`Light`，`Open another vault`

    *   **中间区**：`STAGE`，`Artifacts created or referenced in this session.`，`No artifacts yet.`

    *   **右侧区**：`Focus`，`Inspector`，`Files`，`Changes`，`Search files...`，`.claude`，`01_Projects`，`02_Areas`，`03_Resources`，`04_Archives`，`knowledge-base`，`notes`，`resources`，`AGENT.md`，`Vision.md`

4.  **其他信息**：该应用的视觉风格现代、简洁，以白色和灰色为主色调，文字清晰易读。界面元素的排布逻辑性强，将聊天、文件管理和会话状态分区域展示。

这张截图展示了一个应用的左侧导航栏和中间主内容区的布局。界面整体风格简洁，以白色和浅灰色为主色调，文字为深灰色。左侧导航栏包含了多个功能模块，如“Today”、“Journals”、“Kanban”以及项目列表。中间区域大部分为空白，表明当前没有选中任何具体内容进行展示。右下角有一个消息输入框。

根据图片内容，提取到的文字信息如下：

    *   AREAS

    *   Create

    *   Vision

    *   PROJECTS

    *   deep-data

    *   Twitter抓取

*   **右下角输入框**：

    *   Type a message...

*   **界面布局**：界面采用经典的三栏式布局，左侧为导航栏，中间为主要内容区，右侧为辅助信息区（在本图中为空白）。

*   **视觉结构**：左侧导航栏通过“AREAS”和“PROJECTS”两个标题将菜单项进行了逻辑分组，结构清晰。项目名称“Twitter抓取”旁边有一个灰色的圆形标签，内有数字“1”，这通常表示该项目下有1个待办事项或相关条目。

*   **悬浮球**：在图片的右下角，有一个带有“Type a message...”占位符的输入框。这个输入框的样式和位置非常类似于一个悬浮的聊天或搜索按钮，它可能就是您所指的“悬浮球”。

*   **Ask Anywhere**：在当前的截图中，没有看到名为“Ask Anywhere”的独立按钮或标签。但是，右下角的“Type a message...”输入框的功能与“Ask Anywhere”这类AI助手或搜索功能高度一致，它很可能就是该应用的“Ask Anywhere”功能的入口。

1. **图片类型**：这是应用的用户界面（UI）截图。

2. **主要内容**：图片展示了一个聊天或对话界面。界面布局分为几个主要区域：底部是消息输入栏，中间是主内容区，右侧是侧边栏。整体设计风格简洁，以白色为主色调。

3. **文字内容**：

    *   输入框占位符文字：`type a message...`

    *   发送按钮文字：`Send`

        *   **左侧导航栏**：在当前视图中，左侧导航栏是空白的，没有显示任何菜单项。

        *   **中间主内容区**：这是界面的中心部分，目前是空白的，用于显示聊天记录或对话内容。

        *   **顶部元素**：图片顶部区域是空白的，没有显示标题栏、搜索框或其他顶部导航元素。

        *   **右下角悬浮球**：在界面的右下角，有一个浅蓝色的圆形悬浮按钮，上面写着“Ask Anywhere”。

    *   **整体视觉结构**：界面采用三栏式布局，但左侧和顶部的区域目前为空白。视觉焦点集中在底部的输入栏和右下角的悬浮按钮上。

---

## [Tool] 2026-04-28T04:01:41.553Z
Read intent directories registered.

---

## [Tool] 2026-04-28T04:01:41.554Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/
- AGENTS.md (1.6KB)
- CHANGELOG.md (32.7KB)
- README.md (7.3KB)
- bin/
- bin/orbit (601B)
- dist-electron/
- dist-electron/Orbit-1.0.0-arm64.dmg (96.1MB)
- dist-electron/Orbit-1.0.0-arm64.zip (92.7MB)
- dist-electron/Orbit-1.0.0-arm64.zip.blockmap (100.5KB)
- dist-electron/Orbit-1.0.0-x64.dmg (101.8MB)
- dist-electron/Orbit-1.0.0-x64.zip (98.5MB)
- dist-electron/Orbit-1.0.0-x64.zip.blockmap (107.1KB)
- dist-electron/builder-debug.yml (2.1KB)
- dist-electron/latest-mac.yml (488B)
- dist-electron/mac/
- dist-electron/mac-arm64/
- docs/
- docs/CHANGELOG.phase-4.0-implementation.md (3.2KB)
- docs/CHANGELOG.v2-implementation.md (5.2KB)
- docs/DEVELOPMENT.md (3.4KB)
- docs/MIGRATION.md (3.7KB)
- docs/ROADMAP.md (10.7KB)
- docs/USER_GUIDE.md (9.6KB)
- docs/VISION.md (7.3KB)
- docs/architecture.md (17.1KB)
- docs/archive/
- docs/decisions/
- docs/open-questions.md (13.5KB)
- docs/overview.md (17.3KB)
- docs/plans/
- docs/thinking-trail/
- e2e/
- e2e/smoke.spec.ts (2.3KB)
- e2e/task-chat-stream.spec.ts (5.7KB)
- electron-builder.yml (752B)
- electron.vite.config.ts (1.0KB)
- out/
- out/cli/
- out/main/
- out/mcp/
- out/preload/
- out/renderer/
- package-lock.json (424.1KB)
- package.json (3.2KB)
- playwright.config.ts (509B)
- pnpm-lock.yaml (213.6KB)
- postcss.config.cjs (81B)
- src/
- src/cli/
- src/main/
- src/preload/
- src/renderer/
- src/shared/
- tailwind.config.cjs (1.2KB)
- test-results/
- test-results/activity-tests/
- test-results/dependency-cascade/
- test-results/feed-fade-out/
- test-results/feed-fetcher/
- test-results/inbox-chat-sync/
- test-results/inbox-emitter/
- test-results/inbox-store/
- test-results/library-promote/
- test-results/library-scroll/
- test-results/planner-publish-dependency/
- test-results/proposal-new-task/
- test-results/proposal-service/
- test-results/proposal-sync/
- test-results/quick-capture/
- test-results/thought-lifecycle/
- tests/
- tests/activity_concurrency.test.ts (2.5KB)
- tests/activity_emitter.test.ts (2.9KB)
- tests/activity_query.test.ts (3.1KB)
- tests/agent_cost_log.test.ts (1.5KB)
- tests/agent_hydration.test.ts (2.4KB)
- tests/agent_persona.test.ts (3.2KB)
- tests/agent_playground_scenarios.test.ts (1.9KB)
- tests/agent_runner.test.ts (13.1KB)
- tests/agent_runtime_adapter.test.ts (2.5KB)
- tests/agent_text_fallback.test.ts (1.2KB)
- tests/agent_text_fallback_runtime.test.ts (4.3KB)
- tests/agent_tokens.test.ts (2.3KB)
- tests/app_settings_schema.test.ts (2.0KB)
- tests/approval_card_model.test.ts (1.1KB)
- tests/auto_runner_dispatcher.test.ts (7.8KB)
- tests/auto_runner_event_bridge.test.ts (2.5KB)
- tests/auto_runner_scheduler.test.ts (1.8KB)
- tests/auto_runner_settings.test.ts (1.5KB)
- tests/budget_daily_aggregation.test.ts (1.8KB)
- tests/budget_gate.test.ts (4.9KB)
- tests/budget_watch.test.ts (5.3KB)
- tests/chat_view.test.ts (3.9KB)
- tests/check_cache.test.ts (1.7KB)
- tests/claude_cli.test.ts (1.2KB)
- tests/claude_sessions.test.ts (2.4KB)
- tests/cli/
- tests/content_hash.test.ts (2.8KB)
- tests/conversation_resume.test.ts (2.3KB)
- tests/conversation_store.test.ts (4.0KB)
- tests/cost_report.test.ts (2.9KB)
- tests/crash.test.ts (3.0KB)
- tests/dashboard_view.test.ts (2.5KB)
- tests/dependency_cascade.test.ts (4.6KB)
- tests/developer_console_view.test.ts (547B)
- tests/diff_pane_helpers.test.ts (1.4KB)
- tests/dispatch_completion.test.ts (2.1KB)
- tests/distill.test.ts (4.4KB)
- tests/distill_prompt.test.ts (4.0KB)
- tests/env_has_gh.test.ts (2.2KB)
- tests/error_boundary.test.ts (1.9KB)
- tests/event_kind_publish.test.ts (2.5KB)
- tests/event_replay_store.test.ts (1.9KB)
- tests/execution_context.test.ts (3.9KB)
- tests/experience_wakeup.test.ts (4.4KB)
- tests/feed_fade_out.test.ts (1.7KB)
- tests/feed_fetcher.test.ts (2.2KB)
- tests/file_tree_navigation.test.ts (2.0KB)
- tests/files_store_project_tree.test.ts (7.4KB)
- tests/fixtures/
- tests/frontmatter.test.ts (1.7KB)
- tests/gateway_runtime.test.ts (4.6KB)
- tests/ghost_branch.test.ts (638B)
- tests/git_changes_actions.test.ts (11.3KB)
- tests/git_diff.test.ts (6.1KB)
- tests/git_queue.test.ts (2.7KB)
- tests/github_integration.test.ts (10.5KB)
- tests/github_project_details.test.ts (6.1KB)
- tests/github_workspace.test.ts (4.3KB)
- tests/github_workspace_view.test.ts (2.6KB)
- tests/golden/
- tests/golden_compare.test.ts (804B)
- tests/hash_embed.test.ts (1.7KB)
- tests/helpers/
- tests/hook_event_router.test.ts (2.1KB)
- tests/hook_map_event_type.test.ts (2.4KB)
- tests/hook_server.test.ts (4.0KB)
- tests/hook_template.test.ts (3.5KB)
- tests/inbox_chat_sync.test.ts (4.3KB)
- tests/inbox_emitter.test.ts (4.3KB)
- tests/inbox_renderer_store.test.ts (2.5KB)
- tests/inbox_shell.test.ts (4.1KB)
- tests/inbox_store.test.ts (4.4KB)
- tests/install_lock.test.ts (3.6KB)
- tests/ipc.test.ts (8.1KB)
- tests/kanban.test.ts (1.9KB)
- tests/library_promote.test.ts (1.6KB)
- tests/library_scroll_position.test.ts (1.7KB)
- tests/lifecycle_runner.test.ts (2.2KB)
- tests/limits.test.ts (964B)
- tests/migrate_v3.test.ts (8.9KB)
- tests/new_project_schema.test.ts (1.7KB)
- tests/orchestration_event_bridge.test.ts (3.2KB)
- tests/orchestration_workspace_views.test.ts (4.3KB)
- tests/osc133.test.ts (1.4KB)
- tests/panes_registry.test.ts (1.4KB)
- tests/panes_store.test.ts (6.2KB)
- tests/para.test.ts (5.2KB)
- tests/pathGuard.test.ts (870B)
- tests/path_bootstrap.test.ts (1.6KB)
- tests/persona_vision.test.ts (2.5KB)
- tests/phase.test.ts (3.0KB)
- tests/planner_agent.test.ts (2.3KB)
- tests/planner_publish_dependency.test.ts (3.8KB)
- tests/ports.test.ts (1.3KB)
- tests/project_agent_context_sessions.test.ts (3.8KB)
- tests/project_agent_session_imports.test.ts (6.1KB)
- tests/project_agent_sessions.test.ts (3.9KB)
- tests/project_archive.test.ts (3.4KB)
- tests/project_config_contract.test.ts (4.0KB)
- tests/project_create.test.ts (6.9KB)
- tests/project_fs.test.ts (7.1KB)
- tests/project_github_view.test.ts (8.3KB)
- tests/project_lifecycle.test.ts (2.7KB)
- tests/project_planner_view.test.ts (720B)
- tests/project_room_model.test.ts (2.0KB)
- tests/project_session_action.test.ts (2.2KB)
- tests/project_sessions_view.test.ts (4.9KB)
- tests/projects_nav.test.ts (2.2KB)
- tests/proposal_new_task.test.ts (3.1KB)
- tests/proposal_service.test.ts (3.1KB)
- tests/proposal_state.test.ts (2.3KB)
- tests/proposal_sync.test.ts (3.6KB)
- tests/protocol.test.ts (662B)
- tests/pty_manager.test.ts (4.9KB)
- tests/quick_capture_save.test.ts (1.6KB)
- tests/r7_e2e_ipc.test.ts (3.4KB)
- tests/ready_set.test.ts (2.1KB)
- tests/reattach.test.ts (2.5KB)
- tests/refmap.test.ts (2.6KB)
- tests/rename.test.ts (3.4KB)
- tests/resource_store.test.ts (3.6KB)
- tests/review_daily.test.ts (5.5KB)
- tests/review_queue.test.ts (4.2KB)
- tests/review_queue_presentation.test.ts (1.4KB)
- tests/ring_buffer.test.ts (1.6KB)
- tests/run_recorder.test.ts (1.2KB)
- tests/runtime_event_bridge.test.ts (2.0KB)
- tests/runtime_fallback_engine.test.ts (1.9KB)
- tests/safety_gate.test.ts (1.1KB)

... and 62 more files

---

## [Tool] 2026-04-28T04:01:41.555Z
File not found: 兴趣爱好/Orbit-Ask-Anywhere

---

## [Assistant] 2026-04-28T04:01:53.006Z
模式判定：`docs/` 下已有 `overview.md`、`architecture.md`、`ROADMAP.md` 等标准文档，项目成熟；本次用户意图是**优化 Ask Anywhere 的使用体验**（加/调功能），属于 **Evolve 模式**。

先读核心文档和 Ask Anywhere 相关记忆，了解全貌和历史决策。

### Tool Calls:
- **memory_list**({"path":"兴趣爱好/Orbit-Ask-Anywhere","depth":1,"limit":20,"toolExplanation":"列出 Ask Anywhere 记忆目录"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/overview.md","toolExplanation":"读取项目总览"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/ROADMAP.md","toolExplanation":"读取 roadmap"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/architecture.md","toolExplanation":"读取架构文档"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs","depth":2,"offset":0,"limit":100,"toolExplanation":"列出 docs 子目录"})

---

## [Tool] 2026-04-28T04:01:53.023Z
📄 Skills分拆.md
📄 Vault-Context.md
📄 布局优化.md

---

## [Tool] 2026-04-28T04:01:53.023Z
     1|# Orbit v2 — Architecture Overview
     2|
     3|> **Status**: accepted (2026-04-26)
     4|> **Scope**: 本文是 Orbit v2 演进方向的统一总览，吸收了 2026-04-26 那次 v2 方向确立对话的全部共识。
     5|> **Audience**: 产品决策者、贡献者、接手迭代的 AI agent。
     6|> **How to read**: 先读本文建立全局认知；细节决定读 `docs/decisions/ADR-*.md`；实施方案读 `docs/plans/`；想理解"为什么这样想"读 `docs/thinking-trail/`。
     7|
     8|---
     9|
    10|## 1. Orbit 是什么
    11|
    12|**Orbit 是 Building a Second Brain (BASB) 方法论在本地 AI 协作形态下的完整实现。**
    13|
    14|具体拆开来说：
    15|
    16|- **Building a Second Brain** 是 Tiago Forte 提出的个人知识管理方法论，核心是 **CODE** 四阶段（**C**apture / **O**rganize / **D**istill / **E**xpress）和 **PARA** 目录结构（**P**rojects / **A**reas / **R**esources / **A**rchives）。
    17|- Orbit 完整实现了这四阶段：
    18|  - **Capture** — 通过 Inbox 的 Feed / Library / Thoughts 三类入口捕获外部信息与内部灵感
    19|  - **Organize** — 通过 `01_Projects / 02_Areas / 03_Resources / 04_Archives` 目录落地 PARA
    20|  - **Distill** — 通过项目 Distillation + 向量 wake-up 把经验提炼为可复用的 Resource
    21|  - **Express** — 通过 AI agent 把思考转化为真实执行产物（代码、文档、设计、研究）
    22|- **AI agent 不是 Orbit 的附加能力，而是 Express 阶段的执行引擎。** 这是 Orbit 区别于 Obsidian / Notion / Logseq 等笔记应用的根本。
    23|
    24|### 一句话定位
    25|
    26|> **Orbit = 本地 Markdown/Git vault + PARA 目录 + Capture 信息漏斗 + 人审 AI 执行的自动化工作台。**
    27|
    28|---
    29|
    30|## 2. 三大核心哲学
    31|
    32|Orbit 的所有设计决策都可以追溯到以下三条哲学。当面临设计取舍时，优先遵守它们。
    33|
    34|### 2.1 本地优先 (Local-First)
    35|
    36|- 所有用户数据以 plain Markdown + Git 存储在用户自己选择的文件夹（vault）里
    37|- 应用状态与索引隔离在 `<vault>/.orbit/` 目录中，不污染用户笔记
    38|- 无云同步绑定、无专有格式、无供应商锁定
    39|- Obsidian / VSCode / 任何 Markdown 编辑器都可以直接读写同一套文件
    40|
    41|### 2.2 愿景驱动 (Vision-Driven)
    42|
    43|- 用户的 `Vision.md` 是整个工作台的北极星
    44|- Vision 被注入到每个 agent 的 system prompt，让 agent 知道"用户到底想成为谁"
    45|- 项目、任务、Capture 的组织都围绕 vision 收敛
    46|- 当系统里有太多碎片时，Vision 是收拢焦点的回拉力
    47|
    48|### 2.3 人机对等 (AI-Native)
    49|
    50|- **用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口**
    51|- 所有业务能力通过统一的 `orbit` CLI 暴露给 agent（详见 ADR-008）
    52|- UI 是人的界面，CLI 是 AI 的界面，两者背后是同一套业务逻辑
    53|- **破坏性或扩大范围的动作一定走审批流**（方案 B 审批模式，详见 ADR-006）
    54|
    55|---
    56|
    57|## 3. 核心抽象层次
    58|
    59|Orbit 的领域模型由以下几层构成，自下而上：
    60|
    61|```
    62|┌─────────────────────────────────────────────────────┐
    63|│  Vault                 （用户选择的文件夹）            │
    64|│   └── PARA 目录        （01_P / 02_A / 03_R / 04_A）  │
    65|│       └── Project      （01_Projects/<slug>/）        │
    66|│           ├── Tasks    （可以是单个 .md 或 checklist） │
    67|│           ├── Runs     （一次 agent 执行实例）         │
    68|│           └── ExecutionContext （Worktree / Sandbox）  │
    69|└─────────────────────────────────────────────────────┘
    70|```
    71|
    72|**关键概念**（完整定义见 `docs/architecture.md`）：
    73|
    74|- **Vault**：用户的主数据根目录，本地文件夹
    75|- **Project**：一个独立文件夹，有自己的 `README.md / AGENT.md / .agent/ / git repo`
    76|- **Task**：frontmatter `type: task` 的 `.md` 文件，或 inline `- [ ]` checkbox
    77|- **Run**：agent 在某个 task 上的一次执行实例
    78|- **ExecutionContext**：Run 的隔离容器（v2 起支持 Worktree + Sandbox 两种，详见 ADR-003）
    79|
    80|---
    81|
    82|## 4. v2 的主要子系统
    83|
    84|### 4.1 Inbox — 人机协作的统一枢纽
    85|
    86|> 详见 ADR-004 + `plans/2026-04-26-inbox-v2-architecture.md`
    87|
    88|Inbox 是 "**用户注意力在场时的统一入口**"，承载所有需要用户看/处理的事件。它不是通知中心，也不是审批中心——它是"**待处理事件清单**"。
    89|
    90|**一级分层（按处理模式）**：
    91|
    92|```
    93|Inbox
    94|├── 📥 Capture              # 原材料（沉浸式处理）
    95|│   ├── 🌊 Feed             # 低信号被动扫描（RSS 等）
    96|│   ├── 📚 Library          # 高信号主动阅读
    97|│   └── ✨ Thoughts          # 灵感笔记 / Voice Log / Scratch
    98|├── 💬 Messages             # 操作决策（扫描式处理）
    99|│   ├── A 审批类              # 批合并 / 批新任务 / 批 proposal
   100|│   ├── B 求助类              # agent 信息不足 / 方案选择 / 执行失败
   101|│   ├── C 警示类              # 依赖连锁 / 预算告警 / agent 主动发现
   102|│   └── D 纪律类              # Daily Review 就绪 / 项目待归档 / GC 报告
   103|└── 📦 Archive              # 统一归档视图（Feed 不入此处）
   104|```
   105|
   106|**右侧是通用内容舞台**：点击左侧条目，右侧渲染对应组件（chat / diff / 阅读器 / 笔记编辑器 / proposal 预览）。同一个事件在 chat 和 Inbox 里同步（共享 `proposal_id`），任一处处理两处一起消失。
   107|
   108|---
   109|
   110|### 4.2 Capture — BASB 的 C 阶段
   111|
   112|> 详见 ADR-010 + `plans/2026-04-26-capture-foundation.md`
   113|
   114|Capture 是 Orbit 的信息入口层。本期落地 Feed / Library / Thoughts 三类，每一类对应不同的信号强度和用户姿态：
   115|
   116|| 类别 | 信号 | 姿态 | v1 范围 |
   117||------|------|------|---------|
   118|| 🌊 Feed | 低 | 扫过即忘，感兴趣的 Save 到 Library | RSS only |
   119|| 📚 Library | 高 | 沉浸阅读 + 记录进度 + Promote to Resource | 全功能 |
   120|| ✨ Thoughts | 高 | 自己产生的灵感快速落地 | Quick Capture Thought-only |
   121|
   122|**数据流**：
   123|
   124|```
   125|外部订阅  ──→  Feed  ──(★Save)──→  Library  ──(🔥Promote)──→  03_Resources
   126|                 │                     │
   127|                 ↓ 扫过淡出               ↓ 放弃
   128|            Feed History (agent 检索池)  Archive
   129|```
   130|
   131|Feed History 永久保留，不占前台 UI，作为 **agent 的长期兴趣记忆池**存在。
   132|
   133|---
   134|
   135|### 4.3 Agent 执行模型 — v2 的根本变革
   136|
   137|> 详见 ADR-001 / ADR-002 / ADR-006 + `plans/2026-04-26-auto-runner-dispatcher.md`
   138|
   139|v2 废弃 Night Shift（按时间分段的批量执行）的概念，转向 **24×7 Auto-runner**：
   140|
   141|- Agent 随时可以拾取看板里处于 ready 状态的任务执行，不区分昼夜
   142|- 看板是用户的**认知地图**而不是工作日志
   143|- Agent 自主拆出来的子任务**折叠进主任务 Execution Log**，不入看板
   144|- Agent 只有在"**新任务有独立价值 + 需要用户跟踪**"时才 `propose_new_task`
   145|- 所有新入看板的任务都要通过**用户显式授权**（手动创建 or 审批 agent 提议）
   146|- Agent 的产出都要经过人审合并
   147|
   148|**授权链路**落地在任务的 frontmatter：
   149|
   150|```yaml
   151|type: task
   152|status: todo
   153|created_by: user | agent_run_XXX
   154|approved_by: user | null
   155|approved_at: 2026-04-26T10:12:00Z
   156|proposed_by_agent_run: run_XXX      # 如果是 agent 提议的
   157|proposed_during_task: task_YYY      # 在执行哪个任务时提议的
   158|```
   159|
   160|---
   161|
   162|### 4.4 ExecutionContext — Worktree + Sandbox 双轨
   163|
   164|> 详见 ADR-003 + `plans/2026-04-26-execution-model-migration.md`
   165|
   166|不是所有项目都适合 Git worktree 隔离。v2 引入 **ExecutionContext 抽象**，Worktree 只是其中一种实现：
   167|
   168|| ExecutionContext | 适用场景 | 隔离机制 |
   169||-----------------|---------|---------|
   170|| **Worktree** | 代码项目（有构建/测试需求） | `git worktree` + ghost commit + pre-merge check |
   171|| **Sandbox** | 非代码项目（笔记、写作、研究） | 轻量文件副本 + 变更快照 |
   172|
   173|**判定信号**是"**项目是否需要构建/测试**"，而**不是"项目里有没有 `.git`"**——因为用户可能只用 git 管理版本（比如 vault 自身），不代表是代码项目。
   174|
   175|Sandbox 的详细设计留待下一阶段，见 `docs/open-questions.md`。
   176|
   177|---
   178|
   179|### 4.5 任务依赖 — 轻量拓扑调度
   180|
   181|> 详见 ADR-007 + `plans/2026-04-26-task-dependency-system.md`
   182|
   183|任务之间存在两种关系，v2 明确分开：
   184|
   185|- **衍生关系** (derived_from)：描述"任务怎么来的"（从哪个任务提议拆分）
   186|- **依赖关系** (depends_on)：描述"任务执行需要等什么完成"
   187|
   188|**依赖不改状态机**（方案 A）——`depends_on` 是独立字段，状态机仍然 `inbox → today → doing → blocked → done`，依赖逻辑在 Dispatcher 层拓扑计算 ready 集合。
   189|
   190|**边界策略**：
   191|
   192|- 拒绝循环依赖（publish 时检测）
   193|- 依赖任务被删除/归档 → 当前任务自动 `blocked` + Inbox 警示
   194|- 依赖任务长时间卡住 → Inbox 警示（C 类）
   195|- 只支持 task-to-task 依赖，不支持跨项目依赖（v1）
   196|
   197|---
   198|
   199|### 4.6 Activity Log — 系统级用户行为留痕
   200|
   201|> 详见 ADR-009 + `plans/2026-04-26-activity-log-infrastructure.md`
   202|
   203|Orbit 里每一个"**状态改变**"都产生一条 Activity Event，统一写入 `<vault>/.orbit/activity/YYYY-MM-DD.ndjson`。
   204|
   205|**覆盖的动作类别**：
   206|
   207|- Task lifecycle（创建/修改/删除/移动状态）
   208|- Project lifecycle（创建/归档）
   209|- Inbox 事件（消息处理、Capture 入库）
   210|- Capture 动作（订阅源变更、保存文章、新增笔记）
   211|- Agent 执行（run 启停、proposal 提议/审批、merge 审批）
   212|- Planner 动作（proposal 发布/修改）
   213|- Settings 变更
   214|
   215|**用途**：
   216|
   217|- 未来 Review 页面（时间轴可视化，下一阶段 UI）
   218|- Daily Review (Journal) 的 LLM 输入源
   219|- 未来 Orbit 自我进化的数据基础
   220|
   221|---
   222|
   223|### 4.7 AI-Native 与 CLI — 能力暴露的唯一路径
   224|
   225|> 详见 ADR-008 + `plans/2026-04-26-cli-migration.md`
   226|
   227|v2 废弃 MCP server（`src/mcp/`），**所有 agent 能力通过 `orbit` CLI 暴露**。
   228|
   229|**理由**：
   230|- Token 开销：MCP 工具清单永久占据 system prompt（30+ 工具 → ~6000 tokens）；CLI 按需拉取 `orbit --help` 只占 ~200 tokens
   231|- 架构简化：只维护一条业务接入通道（CLI → main process IPC handler）
   232|- AI-Native 哲学的纯粹化：能力的唯一接口就是"命令行"
   233|
   234|**Agent 与 Orbit 的交互**：
   235|
   236|```
   237|Agent 执行能力  ────→  orbit CLI  ──→  main process IPC handler
   238|Agent 接收事件  ────→  stdin pipe（复用现有 hydration 通道）
   239|```
   240|
   241|**设计规范**：
   242|- 所有命令支持 `--json`（agent 消费）和 `--help`（agent 发现）
   243|- 长内容通过 stdin / `--file` 传入，规避 shell quoting 问题
   244|- 统一退出码约定（0 成功 / 1 业务错误 / 2 参数错误）
   245|
   246|**观察期策略**：本期上线后监控 agent 对 CLI 的调用准确度，若错误率过高则重新引入 MCP 作为补充。MCP 代码保留在 git history，不立即删除。
   247|
   248|---
   249|
   250|### 4.8 Plan Chat — 通用产物画布的一个实例
   251|
   252|> 详见 ADR-005
   253|
   254|v2 修正原先把 "Plan Chat" 当作特殊物种的设计：**Plan Chat 不是新组件，而是 `chat + 产物画布` 这个通用模式的一个具体应用**。
   255|
   256|通用模式：**聊天面板 + 右侧产物（画布/文档/图表）** 是 Orbit 多处共享的抽象，未来会有更多产物类型接入这套模式。Inbox 的右侧内容舞台、Planner 的 proposal 画布、未来的长文档协作都是同一个抽象的实例。
   257|
   258|---
   259|
   260|## 5. 工作流全景
   261|
   262|### 5.1 典型一天
   263|
   264|```
   265|早晨
   266|├── 打开 Orbit → Dashboard 看到 Daily Review (Journal 自动生成)
   267|├── 进 Inbox → Messages：快速处理昨夜 agent 的求助/审批 (几分钟)
   268|└── 进 Capture → Library：沉浸阅读昨天 Save 的文章 (半小时)
   269|
   270|工作时段
   271|├── 进 Project Room → 看板：选一个任务 → 交互式和 Claude Code CLI 对话
   272|├── Agent 遇到问题 → Inbox 出现 B 类求助 → 回应（或在 chat 原地）
   273|└── 被外界打断 → Quick Capture ⌘⇧I → 一条 Thought 进 Inbox
   274|
   275|碎片时间
   276|├── 手机看到好文章 → share 进 Library（下一阶段）
   277|└── 刷 Feed → 感兴趣的 Save 进 Library
   278|
   279|夜间
   280|├── 关了 Orbit 去睡觉，agent 继续 7×24 工作
   281|└── 遇到需要决定的 → 累积在 Inbox Messages → 第二天早晨处理
   282|```
   283|
   284|### 5.2 Agent 执行一个任务的完整流程
   285|
   286|```
   287|User 批准一个 task (inbox → todo)
   288|        ↓
   289|Dispatcher 检测 task ready
   290|        ↓
   291|分配 agent + 选择 ExecutionContext (Worktree 或 Sandbox)
   292|        ↓
   293|Agent 启动 → 读 Vision + project context + task 内容
   294|        ↓
   295|Agent 执行：
   296|  - 需要新增 task → propose_new_task → A2 审批事件入 Inbox
   297|  - 需要的信息不够 → emit B1 求助事件
   298|  - 发现相关内容 → emit C3 主动汇报事件
   299|  - 自主拆子步骤 → 折叠入主任务 Execution Log（不入看板）
   300|        ↓
   301|Agent 完成 → 生成合并产出
   302|        ↓
   303|A1 审批事件入 Inbox + chat 原地卡片
   304|        ↓
   305|User 批准 merge → pre-merge check → 正式合并
   306|        ↓
   307|Task 标记 done → Activity Log 记录
   308|```
   309|
   310|---
   311|
   312|## 6. 本期范围
   313|
   314|v2 首轮演进（本次 Onboard 的目标）落地以下能力：
   315|
   316|| 子系统 | 范围 | ADR | Plan |
   317||--------|------|-----|------|
   318|| 执行模型 | 废弃 Night Shift + Auto-runner + 子任务折叠 + propose-approve | 001, 002, 006 | `auto-runner-dispatcher` |
   319|| ExecutionContext | Worktree 适配新抽象（Sandbox 下一阶段） | 003 | `execution-model-migration` |
   320|| 任务依赖 | depends_on 字段 + 拓扑调度 + 边界策略 | 007 | `task-dependency-system` |
   321|| Inbox | Capture + Messages + Archive 完整架构 | 004 | `inbox-v2-architecture` |
   322|| Capture | Feed (RSS only) + Library + Thoughts 基础 | 010 | `capture-foundation` |
   323|| Activity Log | 基础设施 (schema / emitter / 存储) | 009 | `activity-log-infrastructure` |
   324|| CLI 迁移 | 废弃 MCP + orbit CLI 实施 | 008 | `cli-migration` |
   325|| Quick Capture | 最小版（Thought-only，跑通 Inbox 流程） | 004, 010 | `quick-capture-mvp` |
   326|| Plan Chat | 通用化（不是本期独立 feature，是 Inbox/Planner 共享抽象） | 005 | — |
   327|
   328|**显式不在本期范围**的见 `docs/open-questions.md`。
   329|
   330|---
   331|
   332|## 7. 不做什么
   333|
   334|沿袭原 VISION 并补充 v2 的强化：
   335|
   336|- **不做实时协作**（多人同时编辑）—— Orbit 是个人工具
   337|- **不做专有云存储** —— vault 永远是用户本地文件
   338|- **不做 AI 聊天界面封装** —— Orbit 不做另一个 ChatGPT UI，AI 通过 CLI 在终端/后台工作，产物进 Inbox
   339|- **不强制绑定特定 AI 提供商** —— 通过 CLI + 环境变量可接任何能识别命令行的 agent
   340|- **不做"通知中心"** —— Inbox 是用户主动来看的，不是系统推给人看的（AI-Native 原则的克制体现）
   341|- **不做团队看板** —— 看板是 **个人的认知地图**，不是协作面板
   342|
   343|---
   344|
   345|## 8. 如何继续阅读
   346|
   347|- **想理解决策过程** → `docs/thinking-trail/2026-04-26-v2-direction/`
   348|- **想理解某条具体决策** → `docs/decisions/ADR-*.md`
   349|- **想实施某个子系统** → `docs/plans/2026-04-26-*.md`
   350|- **想理解现有代码架构** → `docs/architecture.md`（现状描述，本文未取代它）
   351|- **想理解产品愿景** → `docs/VISION.md`（v2 更新版）
   352|- **想理解开发环境** → `docs/DEVELOPMENT.md`
   353|- **想看现状和路线** → `docs/ROADMAP.md`（v2 更新版）
   354|- **想看未来空白** → `docs/open-questions.md`
   355|
   356|---
   357|
   358|## 9. 术语表
   359|
   360|| 术语 | 含义 |
   361||------|------|
   362|| **BASB** | Building a Second Brain —— Tiago Forte 的个人知识管理方法论 |
   363|| **CODE** | BASB 的四阶段：Capture / Organize / Distill / Express |
   364|| **PARA** | BASB 的目录结构：Projects / Areas / Resources / Archives |
   365|| **Vault** | 用户选择的主数据根文件夹 |
   366|| **Project** | PARA 中 `01_Projects/<slug>/` 下的独立项目文件夹 |
   367|| **Task** | 项目内的执行单元 (`.md` frontmatter `type: task` 或 inline checkbox) |
   368|| **Run** | agent 在一个 task 上的一次执行实例 |
   369|| **ExecutionContext** | Run 的隔离容器抽象（v2 新增，包括 Worktree / Sandbox） |
   370|| **Worktree** | 基于 `git worktree` 的代码隔离环境（ExecutionContext 的一种实现） |
   371|| **Sandbox** | 非代码项目的轻量隔离环境（ExecutionContext 的一种实现，下一阶段） |
   372|| **Inbox** | 用户处理待决定事件的统一入口，含 Capture + Messages |
   373|| **Capture** | BASB 的 C 阶段，在 Orbit 下分为 Feed / Library / Thoughts |
   374|| **Feed** | 低信号扫描式信息流（RSS 等订阅） |
   375|| **Library** | 高信号主动阅读队列 |
   376|| **Thoughts** | 用户自产的灵感笔记 |
   377|| **Messages** | Inbox 中的操作决策事件（A/B/C/D 四类） |
   378|| **Activity Log** | 系统级用户行为留痕，`<vault>/.orbit/activity/*.ndjson` |
   379|| **Thinking Trail** | AI 对话记录的结构化留痕（下一阶段子系统） |
   380|| **Auto-runner** | v2 的 24×7 任务执行器（替代 Night Shift） |
   381|| **Proposal** | Agent 提议但需要人审批的"拟入库"事项（任务、合并、新订阅源等） |
   382|| **Ghost Commit** | Agent 产出先落到 `ghost/*` 分支的机制，审批通过才合并 |
   383|
   384|---
   385|
   386|**本文件是 Orbit v2 的入口文档。发现与代码/其他文档不一致时，更新本文是优先级最高的文档维护动作。**

(End of file. Total 386 lines.)

---

## [Tool] 2026-04-28T04:01:53.024Z
     1|# Orbit — Roadmap
     2|
     3|> **Status**: Phase 4.0 代码实施完成（2026-04-28），进入 lifecycle dog-food 观察期
     4|> **Update cadence**: 每个里程碑落地后更新；大方向调整随 ADR 同步刷新。
     5|
     6|本文记录 Orbit 各阶段的目标、当前状态和下一步计划。**v2 方向的完整说明在 `docs/overview.md`，决策记录在 `docs/decisions/`。**
     7|
     8|---
     9|
    10|## 已完成
    11|
    12|### v1 基础设施（M1–M7）
    13|
    14|| 里程碑 | 内容 |
    15|| ------ | ---- |
    16|| M1 | Electron 骨架、workspace/settings IPC、WelcomeView |
    17|| M2 | 文件系统层 (`fs:*`)、refmap、chokidar 监听、MiniSearch 索引、CodeMirror 编辑器 |
    18|| M3 | PARA 目录结构、Zod schemas、任务索引、`para:*` IPC、Kanban |
    19|| M4 | Claude Code agent runner、hydration protocol、cost NDJSON 记录、RunnerPool |
    20|| M5 | Git worktree 管理、ghost-commit 流程、pre-merge check、safety gate、InstallLock、PortAllocator |
    21|| M6 | Token 预算系统 (BudgetGate + BudgetWatch)、每日 cost 报告 |
    22|| M7 | 项目 Distillation、hash-trick vector store、experience wake-up |
    23|
    24|### v1 二期改造（R1–R7，Project-as-Folder）
    25|
    26|| 里程碑 | 内容 |
    27|| ------ | ---- |
    28|| R1 | 项目即文件夹 (`01_Projects/<slug>/`)、per-project git repo |
    29|| R2 | Vision-first Dashboard、+ New Project wizard |
    30|| R3 | 四段式 Task Editor (Description/Thinking/Execution Log/Summary) |
    31|| R4 | Project Room (Kanban + 嵌入式终端 + Sessions) |
    32|| R5 | Orbit Hooks MCP server（7 个工具）**⚠️ v2 中废弃，见 ADR-008** |
    33|| R6 | Night Shift 批处理 **⚠️ v2 中废弃，见 ADR-001** |
    34|| R7 | Worktree GC + Daily Review |
    35|
    36|### v1 近期交付（2026-04 前半月）
    37|
    38|| 功能 | 描述 |
    39|| ---- | ---- |
    40|| Contextual Right Sidebar | 右侧栏跟随当前页面上下文 |
    41|| Workspace Inspector | Files / Changes 工作台：项目树、staged-only commit、GitHub publish |
    42|| `.orbit`-First Agent Exposure | Orbit 数据收敛 `.orbit/`、agent_exposure 策略 |
    43|| GitHub Integration | `gh` CLI 驱动的 GitHub 连接、PR 创建、状态读取 |
    44|| Project Session History | 终端会话作为项目级历史 + Session History tab |
    45|| Area Room + Vision System | Area 升级为独立工作单元；Vision 冷启动与 review 工作流 |
    46|| Orchestration System (v1) | Planner proposal 历史、Local Runtime registry、Dispatch lease/report 流、Role Templates/Bindings |
    47|| Orchestration Workspace UI | workspace 级 Runtimes / Agents 面板，React Flow proposal canvas |
    48|
    49|---
    50|
    51|### v2 本期实施（2026-04-26）
    52|
    53|**触发**：2026-04-26 的 v2 方向 Onboard 对话，确立 10 项核心决策（ADR-001 ~ ADR-010）。
    54|
    55|**状态**：核心代码路径已落地，v1 architecture 已归档，Night Shift / MCP runtime 已清理。
    56|
    57|| 子系统 | ADR | Plan | 状态 |
    58||--------|-----|------|------|
    59|| 废弃 Night Shift → Auto-runner | [ADR-001](decisions/ADR-001-deprecate-night-shift.md) | [auto-runner-dispatcher](plans/2026-04-26-auto-runner-dispatcher.md) | completed |
    60|| Agent 自主边界：子任务折叠 | [ADR-002](decisions/ADR-002-agent-autonomy-scope.md) | 同上 | completed |
    61|| ExecutionContext 分化 | [ADR-003](decisions/ADR-003-execution-context-split.md) | [execution-model-migration](plans/2026-04-26-execution-model-migration.md) | completed |
    62|| Inbox 作为人机协作枢纽 | [ADR-004](decisions/ADR-004-inbox-as-hub.md) | [inbox-v2-architecture](plans/2026-04-26-inbox-v2-architecture.md) | completed |
    63|| Plan Chat 定位修正 | [ADR-005](decisions/ADR-005-plan-chat-reframing.md) | （合入 inbox-v2） | completed |
    64|| 任务授权链路 (propose-approve) | [ADR-006](decisions/ADR-006-task-authorization-model.md) | 同 auto-runner | completed |
    65|| 任务依赖模型 | [ADR-007](decisions/ADR-007-task-dependency-model.md) | [task-dependency-system](plans/2026-04-26-task-dependency-system.md) | completed |
    66|| AI-Native + CLI-first | [ADR-008](decisions/ADR-008-ai-native-cli-first.md) | [cli-migration](plans/2026-04-26-cli-migration.md) | completed |
    67|| Activity Log 基础设施 | [ADR-009](decisions/ADR-009-activity-log-infrastructure.md) | [activity-log-infrastructure](plans/2026-04-26-activity-log-infrastructure.md) | completed |
    68|| Capture 三分 (Feed/Library/Thoughts) | [ADR-010](decisions/ADR-010-capture-tri-partition.md) | [capture-foundation](plans/2026-04-26-capture-foundation.md) | completed |
    69|| Quick Capture MVP | 004 + 010 | [quick-capture-mvp](plans/2026-04-26-quick-capture-mvp.md) | completed |
    70|
    71|### Phase 3 — Agent Observability & Resilience（2026-04-27）
    72|
    73|**触发**：v2 实施完成后 dog-food 发现核心问题——agent 执行是黑盒（突然渲染、没有 tool use、resume 断裂）。同时确立了 Runtime 抽象贯通、全链路事件回放、Dashboard 重做等方向。
    74|
    75|**状态**：代码实施完成，进入真实 dog-food 观察期。4 项新 ADR（ADR-011 ~ ADR-014）保持 accepted。
    76|
    77|| 子系统 | ADR | Plan | 状态 |
    78||--------|-----|------|------|
    79|| Agent Playground 调试基础设施 | — | [agent-playground](plans/2026-04-27-agent-playground.md) | completed |
    80|| Runtime 抽象贯通（通用 Agent Event 协议） | [ADR-011](decisions/ADR-011-runtime-abstraction-through-capabilities.md) | [runtime-adapter-layer](plans/2026-04-27-runtime-adapter-layer.md) | completed |
    81|| Activity tab 时间线 UI（打字机 + markdown） | — | [activity-timeline-ui](plans/2026-04-27-activity-timeline-ui.md) | completed |
    82|| Task-Session 绑定（原生 resume + 双向 stream） | [ADR-012](decisions/ADR-012-task-session-binding-model.md) | [task-session-binding](plans/2026-04-27-task-session-binding.md) | completed |
    83|| Runtime Fallback 决策规则 + Budget | [ADR-014](decisions/ADR-014-runtime-fallback-decision-rules.md) | [runtime-fallback-rules](plans/2026-04-27-runtime-fallback-rules.md) | completed |
    84|| 统一事件回放（全链路 + Developer Console） | [ADR-013](decisions/ADR-013-unified-event-replay-infrastructure.md) | [event-replay-infrastructure](plans/2026-04-27-event-replay-infrastructure.md) | completed |
    85|| Global Dashboard 重做（5 象限） | — | [global-dashboard](plans/2026-04-27-global-dashboard.md) | completed |
    86|
    87|**观察期事项**：
    88|- 真实 dog-food 需要持续 2-4 天；当前只能完成代码与自动化验证，不能在同一实施会话里证明长期无阻塞问题。
    89|- Codex / Copilot adapter 仍是能力声明 + stub 启动路径，真实生产 fallback 需要后续接通各 vendor 的原生事件协议。
    90|- Sandbox ExecutionContext、Review 页面 UI、Thinking Trail 自动化和 Capture 多入口继续留在 Phase 4+。
    91|
    92|### Phase 4.0 — Task Execution Lifecycle Realignment（2026-04-28）
    93|
    94|**触发**：Phase 3 dog-food 暴露 task 状态机和 agent 会话状态机被错误耦合，导致 agent 求助即 task → blocked 死锁。
    95|
    96|**状态**：代码实施完成，进入真实 lifecycle dog-food 观察期。ADR-015 / ADR-016 已 accepted，ADR-012 已追加 Switch Runtime 修订。
    97|
    98|| 子系统 | ADR | Plan | 状态 |
    99||--------|-----|------|------|
   100|| Task / Agent Session 状态机解耦 | [ADR-015](decisions/ADR-015-task-session-state-decoupling.md) | [task-execution-lifecycle-realignment](plans/2026-04-28-task-execution-lifecycle-realignment.md) | completed |
   101|| Agent Onboarding Protocol | [ADR-016](decisions/ADR-016-agent-onboarding-protocol.md) | 同上 | completed |
   102|| Switch Runtime 与 Session 承接 | [ADR-012](decisions/ADR-012-task-session-binding-model.md)（修订） | 同上 | completed |
   103|| 端到端 lifecycle scenario 基础设施 | — | 同上 | completed |
   104|
   105|**观察期事项**：
   106|- 真实 L01-L15 lifecycle scenario 需要在具备 vendor agent CLI 的本机设置 `ORBIT_LIFECYCLE_REAL=1` 后长跑验证。
   107|- Codex / Copilot adapter 仍需完成真实 process/event/transcript 能力，当前 Switch Runtime 对非 Claude 的生产运行受 runtime gate 限制。
   108|- Kanban awaiting-user 图标已接 UI hook，后续需把 active run segment 聚合进 task list 数据。
   109|
   110|### v1 遗留中的 "进行中" 项（仍有效）
   111|
   112|| 功能 | 文档 | 状态 |
   113|| ---- | ---- | ---- |
   114|| Planner Agent + Agent Dispatching | `plans/2026-04-24-orbit-planner-agent-dispatch-design.md` | 已落地 (v1)，v2 中接受依赖增强 |
   115|| Local Runtime Architecture | `plans/2026-04-24-orbit-local-runtime-architecture.md` | 已落地 (v1) |
   116|| Global Role Template Agents | `plans/2026-04-25-orbit-role-template-agent-design.md` | 已落地 (v1) |
   117|
   118|---
   119|
   120|## 显式废弃 / 被覆盖
   121|
   122|| 项目 | 状态 | 被什么替代 |
   123||------|------|-----------|
   124|| **Night Shift** (`src/main/night_shift/`) | 废弃 | 24×7 Auto-runner (ADR-001) |
   125|| **MCP Server** (`src/mcp/`) | 废弃观察期 | `orbit` CLI (ADR-008) |
   126|| **Agent 直接 `create_task` 入库** | 废弃 | `propose_new_task` 两阶段 (ADR-006) |
   127|| **Agent 自主创建入看板的 subtask** | 废弃 | 折叠进主任务 Execution Log (ADR-002) |
   128|| `plans/2026-04-22-orbit-agent-context-*.md` | superseded | ADR-008 (CLI-first 取代 context wrapper 路线) |
   129|| `plans/2026-04-24-capture-knowledge-funnel.md` | superseded | ADR-010 + `capture-foundation` |
   130|
   131|---
   132|
   133|## 计划中
   134|
   135|> 按优先级排列。原 P1-P9 重新编号为 Phase 4+ 方向。
   136|
   137|### Phase 4 后续方向
   138|
   139|| 方向 | 说明 | 原编号 |
   140||------|------|--------|
   141|| **Sandbox ExecutionContext** | 非代码项目（research / writing）的执行环境，补齐功能断层 | 原 P2 |
   142|| **Thinking Trail 自动化** | 每次 chat session 自动留痕、关键认知跃迁自动识别 | 原 P3 |
   143|| **对话沉淀 → 项目** | 从 Thoughts / Chat 自然沉淀识别主题集聚，agent 主动提议立项 | 新增 |
   144|| **Capture 多入口** | 剪贴板识别、Library Quick Capture、浏览器插件、手机 share、Voice Log | 原 P4 |
   145|| **Review 页面 UI** | Activity Log 的用户可视化（时间轴、汇总、检索） | 原 P1 |
   146|
   147|### 长期方向（Phase 5+）
   148|
   149|| 方向 | 说明 | 原编号 |
   150||------|------|--------|
   151|| **Orbit 自我进化** | Activity Log + Thinking Trail + Distillation 三向融合 | 原 P5 |
   152|| **GitHub 深度集成** | Issue ↔ Task 双向同步、PR review 展示、远程分支推送 | 原 P6 |
   153|| **性能与稳定性** | 大 vault 索引、启动时间、崩溃恢复 | 原 P7 |
   154|| **跨平台支持** | Linux / Windows 打包 + CLI 跨平台路径 | 原 P8 |
   155|| **CLI-first 观察期决策** | agent CLI 调用准确度监控，决定是否重新引入 MCP | 原 P9 |
   156|
   157|---
   158|
   159|## 版本约定
   160|
   161|Orbit 目前处于 v1.x 阶段，尚未发布正式语义化版本号。v2 是**架构方向代号**，不一定对应 `package.json` 里的 `2.0.0` —— 版本发布策略待定。
   162|
   163|---
   164|
   165|## 如何更新本文件
   166|
   167|1. 每个 milestone 落地后，把对应条目从"进行中"挪到"已完成"
   168|2. 每次方向调整（新 ADR accepted），同步更新"计划中"的优先级和"废弃 / 被覆盖"列表
   169|3. 每两周做一次文档 review（参考 `AGENTS.md`）：清理 `plans/` 中 `completed` 的方案、校验"进行中"列表仍有效

(End of file. Total 169 lines.)

---

## [Tool] 2026-04-28T04:01:53.024Z
     1|# Orbit Architecture
     2|
     3|> 本文描述 Orbit v2 实施后的当前架构。v1 架构原文已归档到
     4|> [`docs/archive/architecture-v1.md`](./archive/architecture-v1.md)。
     5|
     6|## 1. Product shape
     7|
     8|Orbit 是一个本地优先的 AI 协作工作台：
     9|
    10|- **Markdown + Git** 是项目和知识的持久化边界。
    11|- **Electron main process** 拥有文件系统、Git、agent runner、调度器和本地 CLI bridge。
    12|- **React renderer** 提供 PARA、Project Room、Inbox、Capture、Planner、Roles、Terminal 与 Inspector 等工作面。
    13|- **`orbit` CLI** 是 agent-facing 能力入口；旧 MCP server 和 Night Shift 路径已移除。
    14|
    15|v2 的核心转向：
    16|
    17|| v1 | v2 |
    18|| --- | --- |
    19|| Night Shift 批量执行 | 24x7 Auto-runner，可通过 Settings 默认关闭 |
    20|| agent 直接创建 task | `propose -> approve/reject -> materialize` |
    21|| 隐式执行顺序 | `depends_on` 拓扑解锁 |
    22|| 分散审批入口 | Inbox hub + Proposal sync |
    23|| MCP server 工具面 | `orbit` CLI + main-process CLI bridge |
    24|| 仅 worktree 执行隔离 | `ExecutionContext` 抽象，当前实现 worktree，sandbox 暂 unsupported |
    25|| 无统一事件留痕 | Activity Log NDJSON event stream |
    26|
    27|## 2. Process model
    28|
    29|Orbit 仍采用 Electron 三进程布局：
    30|
    31|- **Main** (`src/main/`)：Node.js/Electron 主进程。注册 IPC，管理 vault session、watcher、Git、worktree、terminal、agent runner、Auto-runner、Activity Log、Inbox、Approval、Capture 与 CLI server。
    32|- **Preload** (`src/preload/index.ts`)：通过 `contextBridge` 暴露 typed `window.orbit`，实现 renderer 与 shared IPC contract 的唯一桥。
    33|- **Renderer** (`src/renderer/`)：React 18 + Zustand + Tailwind。所有系统能力通过 `window.orbit` 调用，不直接访问 Node API。
    34|
    35|启动或打开 vault 时，main process 会执行：
    36|
    37|1. `configureActivityEmitter(vaultPath)` 绑定 Activity Log 根目录。
    38|2. `openFsSession(vaultPath)` 建立 refmap、文件索引、search index、task index 与 watcher。
    39|3. `startCliServerForVault(vaultPath)` 在 `<vault>/.orbit/cli-socket` 暴露本地 CLI bridge。
    40|4. `configureEventReplay(vaultPath)` 绑定统一事件回放 store 与 run recorder。
    41|5. `reconcileOnStart(vaultPath)` 恢复 agent / terminal session 状态。
    42|6. `ensureOrchestrationForVault(vaultPath)` 初始化 runtime、planner、roles、dispatch storage。
    43|7. `getAutoRunnerDispatcher().attach(vaultPath)` 装载 Auto-runner，但是否运行由 settings 控制。
    44|8. `ensureTerminalAgentRuntimeForVault(vaultPath)` 启动 terminal hook runtime。
    45|9. `ensureVectorStore(vaultPath)` 与 worktree GC 作为后台能力初始化。
    46|
    47|关闭 vault 时，上述 runtime 会反向 detach / shutdown，并停止 CLI server 与 watcher。
    48|
    49|## 3. Shared IPC contract
    50|
    51|`src/shared/ipc.ts` 是 main、preload、renderer 的单一 IPC contract。新增 channel 必须同时经过：
    52|
    53|1. `IPC` namespace 定义。
    54|2. `OrbitApi` 类型声明。
    55|3. preload `api` 实现。
    56|4. main-side handler 注册。
    57|5. `tests/ipc.test.ts` contract 更新。
    58|
    59|当前主要 namespace：
    60|
    61|| Namespace | Owner |
    62|| --- | --- |
    63|| `workspace`, `settings`, `fs`, `para`, `project`, `task`, `vision`, `migrations` | vault / PARA / file / task core |
    64|| `git`, `github`, `env`, `envExt` | local Git, GitHub CLI integration, environment checks |
    65|| `agent`, `terminal`, `terminalAgent` | Claude/Codex/Gemini runner, pty, terminal session awareness |
    66|| `runtime`, `planner`, `conversation`, `dispatch`, `role` | orchestration core |
    67|| `activity`, `events`, `dashboard` | Activity Log、全链路事件回放、五象限 Dashboard 聚合 |
    68|| `approval` | proposal approval state machine |
    69|| `inbox` | unified Inbox hub |
    70|| `capture`, `quickCapture` | Feed, Library, Thoughts, global quick capture |
    71|| `autoRunner` | 24x7 dispatcher control/status/events |
    72|| `review`, `distill` | daily review and distillation |
    73|| `area`, `vaultConfig` | Area Room and external notes configuration |
    74|
    75|## 4. Vault and project layout
    76|
    77|Vault root:
    78|
    79|```text
    80|<vault>/
    81|├── 01_Projects/
    82|├── 02_Areas/
    83|├── 03_Resources/
    84|├── 04_Archives/
    85|├── AGENT.md
    86|├── .git/
    87|└── .orbit/
    88|    ├── config.json
    89|    ├── refmap.json
    90|    ├── activity/YYYY-MM-DD.ndjson
    91|    ├── events/YYYY-MM-DD.ndjson
    92|    ├── events/runs/<runId>/
    93|    │   ├── raw-vendor.ndjson
    94|    │   ├── abstract.ndjson
    95|    │   └── ui-render.ndjson
    96|    ├── cli-socket
    97|    ├── inbox/
    98|    ├── approval/
    99|    ├── orchestration/
   100|    ├── capture/
   101|    ├── logs/
   102|    ├── cost/
   103|    ├── trash/
   104|    └── worktrees/
   105|```
   106|
   107|Folder-backed project:
   108|
   109|```text
   110|01_Projects/<slug>/
   111|├── README.md
   112|├── AGENT.md
   113|├── CLAUDE.md
   114|├── CODEX.md
   115|├── GEMINI.md
   116|├── .git/
   117|└── .orbit/
   118|    ├── config.json
   119|    ├── agent/
   120|    │   ├── tasks/
   121|    │   ├── memories/
   122|    │   ├── skills/
   123|    │   │   ├── _index.md
   124|    │   │   ├── orbit-world.md
   125|    │   │   ├── task-workflow.md
   126|    │   │   ├── project-understanding.md
   127|    │   │   ├── tooling-commands.md
   128|    │   │   ├── worktree-workflow.md
   129|    │   │   ├── safety-rules.md
   130|    │   │   └── orbit-cli.md
   131|    │   └── logs/
   132|    └── bridge/
   133|        └── manifest.json
   134|```
   135|
   136|Orbit 不再自动写入 `.mcp.json`，project bridge 仅用于 `AGENT.md` / `AGENTS.md` 兼容暴露。
   137|
   138|## 5. File, refmap, and task index
   139|
   140|`src/main/fs.ts` owns the active `VaultSession`:
   141|
   142|- `RefmapStore` keeps `uid -> relPath` and content hash mappings.
   143|- `VaultIndex` scans Markdown frontmatter and wikilinks.
   144|- `SearchIndex` provides MiniSearch full-text lookup.
   145|- `TaskIndex` materializes PARA entities and task records.
   146|- `VaultWatcher` incrementally refreshes all indices and broadcasts `fs:event`.
   147|
   148|Task files use Zod schemas from `src/shared/schemas.ts`. v2 task fields include:
   149|
   150|- ownership and authorization: `created_by`, `approved_by`, `proposed_by_agent_run`, `approval_state`.
   151|- proposal links: `proposal_id`, `origin`.
   152|- dependency fields: `depends_on`, `derived_from`, `blocked_reason`.
   153|- execution metadata: recommended role, owner agent, implementation report fields.
   154|
   155|Immutable task frontmatter keys are still `uid`, `type`, and `created`; migrations must not rewrite them.
   156|
   157|Phase 4.0 separates project-level task state from execution-level agent session state:
   158|
   159|- task status remains the board/project state (`todo`, `doing`, `blocked`, `done`, etc.).
   160|- `blocked` is reserved for dependency unavailability from ADR-007, not agent help requests or runtime failures.
   161|- `src/main/task-state/reducer.ts` is the pure transition reducer for task/session lifecycle inputs.
   162|- agent session status is stored per `RunSegment.sessionStatus`: `idle`, `launching`, `running`, `awaiting_user`, `completed`, `failed_retryable`, or `failed_terminal`.
   163|- `awaiting_user` keeps the task in `doing`; user chat or switch-runtime can resume execution without abusing `blocked`.
   164|
   165|## 6. ExecutionContext and agent runner
   166|
   167|`src/main/execution/` defines the v2 execution abstraction:
   168|
   169|- `ExecutionContext` is the interface.
   170|- `WorktreeExecutionContext` adapts existing ghost worktree behavior.
   171|- `SandboxExecutionContext` is intentionally unsupported in this milestone and fails clearly.
   172|
   173|Project config (`.orbit/config.json`) stores `execution_context: "worktree" | "sandbox"`, defaulting to `worktree`.
   174|
   175|`src/main/agent/runner.ts` still executes Claude Code, while `src/main/agent/adapter/`
   176|adds the Phase 3 runtime adapter layer:
   177|
   178|- `UnifiedAgentEvent` (`src/shared/agent-event.ts`) is the vendor-neutral event protocol.
   179|- `ClaudeAdapter` converts Claude stream-json into unified events.
   180|- Codex / Copilot adapters declare capabilities and stub process startup paths.
   181|- `RunnerPool` emits both legacy `AgentEvent` and `UnifiedAgentEvent` so existing UI remains compatible during migration.
   182|- Runtime metadata (`runtimeId`, provider, name) is threaded from dispatch/startTask into runner events.
   183|
   184|Claude starts with structured output by default:
   185|
   186|```text
   187|claude -p <prompt> --output-format stream-json --verbose
   188|```
   189|
   190|When Orbit needs realtime stdin (for resumed task conversations or live user follow-up), it switches
   191|to Claude's stream-json input protocol and sends the initial task prompt as a `type: user` JSONL
   192|message on stdin:
   193|
   194|```text
   195|claude -p --output-format stream-json --input-format stream-json --verbose --resume <vendorSessionId>
   196|```
   197|
   198|The runner owns:
   199|
   200|- `.orbit/logs/<runId>.log` and `.ndjson` event files.
   201|- `_active.json` PID bookkeeping and startup reconciliation.
   202|- cost extraction and event normalization.
   203|- hook env vars for terminal/agent lifecycle integration.
   204|- `--resume <vendorSessionId>` when a task has a persisted vendor session.
   205|- stream-json stdin for sending user messages into an active run.
   206|
   207|It no longer auto-loads `.mcp.json`; agent capabilities should go through `orbit` CLI or terminal hooks.
   208|
   209|Task conversations persist `RunSegment.vendorSessionId` and reverse-scan latest completed/running
   210|segments before dispatching a new run. Manual task chat first attempts `agent:sendMessage` into an
   211|active run, then falls back to a resumed Claude process.
   212|
   213|Agent starts now prepend the ADR-016 onboarding protocol. The runner scans the first agent message
   214|for the required `我已了解：` acknowledgement and emits a non-blocking Activity event so dog-food can
   215|measure protocol compliance.
   216|
   217|Runtime adapters expose `getSessionTranscript(sessionId)`. Claude reads local JSONL session history
   218|and maps it into `UnifiedAgentEvent`; Codex and Copilot currently return `null`, allowing Switch
   219|Runtime to fall back to unified event/segment summaries. `src/main/orchestration/switch_runtime.ts`
   220|builds the continuation prompt, estimates transcript tokens with a rough character heuristic, and
   221|chooses full transcript vs summarized injection before launching the replacement runtime.
   222|
   223|Fallback and budget resilience are configured under `autoRunner` settings:
   224|
   225|- default stale timeout: 15 minutes.
   226|- default runtime priority: Claude -> Codex -> Copilot.
   227|- default per-task budget: `$20`, overridable by task frontmatter `budget_limit`.
   228|- helper rules classify non-retryable errors and choose the next runtime without interrupting an
   229|  event-emitting live process.
   230|
   231|## 7. Activity Log and Event Replay
   232|
   233|`src/main/activity/` provides append-only Activity Log infrastructure:
   234|
   235|- shared event schema in `src/shared/activity.ts`.
   236|- fire-and-forget `emitActivity`.
   237|- NDJSON storage under `.orbit/activity/YYYY-MM-DD.ndjson`.
   238|- query filters exposed through `activity:query`.
   239|
   240|Activity Log currently records task mutations, proposal lifecycle, Inbox events, Auto-runner events, and Capture operations. It is the audit trail for v2 behavior and the observation substrate for later review UI.
   241|
   242|Phase 3 adds `src/main/events/` as the unified replay layer:
   243|
   244|- `TraceableEvent` (`src/shared/events.ts`) normalizes Activity, Agent, Inbox and IPC events with
   245|  `traceId`, `spanId`, `runId`, `taskId/taskUid`, source and payload.
   246|- `TraceableEventStore` writes `.orbit/events/YYYY-MM-DD.ndjson` and supports source/trace/run/task
   247|  filters plus GC.
   248|- `RunRecorder` writes three parallel run files under `.orbit/events/runs/<runId>/`: raw vendor,
   249|  abstract unified event, and ui-render payload.
   250|- `events:*` IPC exposes historical query, GC and realtime push to the renderer.
   251|- Developer Console (`DeveloperConsoleView`) is the X-Ray surface for live event stream,
   252|  trace/source/kind/task filters, payload inspection and basic playback.
   253|
   254|## 8. Proposal approval system
   255|
   256|`src/main/approval/` implements the propose-approve state machine:
   257|
   258|- proposal schema and type definitions in `src/shared/approval.ts`.
   259|- pending/archive NDJSON stores.
   260|- `submit`, `resolve`, `list`, `get` IPC.
   261|- event emission to Activity Log.
   262|- materialization of approved `new_task` proposals into task Markdown.
   263|
   264|Agents must not create independent board tasks directly. They submit proposals; users approve or reject them through chat/Inbox surfaces.
   265|
   266|## 9. Inbox hub
   267|
   268|`src/main/inbox/` and `src/shared/inbox.ts` implement Inbox v2:
   269|
   270|- item categories: messages, capture events, proposal-linked approvals, archive/history.
   271|- persisted store under `.orbit/inbox/`.
   272|- resolver/dismiss/archive actions with Proposal sync where applicable.
   273|- renderer shell and stage components under `src/renderer/src/components/inbox/` and `InboxView`.
   274|
   275|Inbox is the common user attention surface for:
   276|
   277|- agent help requests.
   278|- proposal approval cards.
   279|- capture triage.
   280|- dependency/blocked notices.
   281|
   282|## 10. Dependency system
   283|
   284|`src/main/dependencies/` provides task dependency semantics:
   285|
   286|- validates `depends_on` graph updates.
   287|- detects cycles.
   288|- computes ready/blocked states for dispatch.
   289|- cascades dependency deletion/archive into dependent task blocking and Inbox notifications.
   290|
   291|`src/main/auto_runner/ready_set.ts` consumes these semantics to select runnable work. Planner publish also materializes dependency edges so generated task graphs are dispatchable.
   292|
   293|## 11. Auto-runner
   294|
   295|`src/main/auto_runner/` replaces Night Shift:
   296|
   297|- dispatcher attaches to the active vault.
   298|- scheduler observes task ready-set, authorization, dependency state, hourly limits, and concurrency.
   299|- IPC namespace `autoRunner` exposes `status/start/stop/event`.
   300|- settings default to disabled; users must explicitly enable Auto-runner.
   301|- unsupported `sandbox` execution emits a clear Inbox/help event instead of silently skipping.
   302|
   303|Auto-runner is designed as a continuous local loop, not a batch modal. Manual terminal/project workflows remain available when it is disabled.
   304|
   305|## 12. CLI-first agent surface
   306|
   307|`src/cli/` and `src/main/cli_server/` implement the local `orbit` CLI:
   308|
   309|- `orbit search`
   310|- `orbit cat`
   311|- `orbit task list/get/update/propose/log`
   312|- `orbit project overview`
   313|- `orbit task related/transcript/propose-split/switch-runtime`
   314|- `orbit kanban list`
   315|- `orbit inbox ...`
   316|- `orbit activity ...`
   317|- `orbit approval ...`
   318|- `orbit auto-runner ...`
   319|- `orbit agent/run ...`
   320|- `orbit dev:scenarios`, `orbit dev:golden`, `orbit dev:lifecycle`
   321|
   322|The CLI talks to the Electron main process over the local vault socket. Missing backend domains return structured `unavailable` errors rather than pretending success.
   323|
   324|## 13. Capture
   325|
   326|Capture v2 is split into three domains under `src/main/capture/`:
   327|
   328|- **Feed**: RSS subscriptions, item de-duplication, refresh, fade-out/history.
   329|- **Library**: saved articles, reading state, promotion to Resource.
   330|- **Thoughts**: quick thought capture, edit/link/dismiss/promote lifecycle.
   331|
   332|`quickCapture` binds the global shortcut (`⌘⇧I` on macOS) and opens a Thought-only renderer modal. Capture writes Inbox items so triage happens in the same attention hub.
   333|
   334|## 14. Renderer workspace
   335|
   336|Renderer state is organized through Zustand stores under `src/renderer/src/store/`:
   337|
   338|- `workspace`, `files`, `para` for vault/project navigation.
   339|- `agent`, `worktrees`, `reviewQueue`, `taskDetails` for execution-facing UI.
   340|- Inbox, Capture, Project Room, Planner, Roles, Sessions, GitHub, Inspector, Developer Console,
   341|  Dashboard and Area Room are composed as React views.
   342|
   343|Project Room currently contains:
   344|
   345|- Kanban
   346|- Terminal
   347|- GitHub
   348|- Sessions
   349|- Planner
   350|- Roles
   351|
   352|The old Night Shift modal/history UI has been removed. Review Inbox now focuses on permission requests from Orbit-managed sessions.
   353|
   354|Task Detail's Chat tab is now presented as Activity. It renders conversation turns and live agent
   355|events through Timeline cards for user/system/assistant messages, thinking, tool use/result, cost,
   356|error and done states.
   357|
   358|The global Dashboard is now a five-quadrant command center backed by `src/main/dashboard/`:
   359|
   360|- pending user attention (Inbox, blocked and ready/waiting tasks).
   361|- active agent work (doing tasks, active runs, runtime online count, today cost).
   362|- knowledge growth (Feed, Library, Thoughts, promotion and project counts).
   363|- thinking trail (Daily Review, recent Activity, Vision review age, recent thinking-trail dirs).
   364|- system health (vault/worktree/orbit disk usage, dirty project count, runtime status, budget).
   365|
   366|## 15. Git and GitHub integration
   367|
   368|`src/main/git/` owns worktrees, status parsing, staging, diff, safety checks and merge operations. It also supports project Inspector Changes and GitHub publish/PR flows.
   369|
   370|`src/main/github/` wraps `gh` CLI integration:
   371|
   372|- connection/authentication state.
   373|- repository list/import/publish.
   374|- project details, issues, PRs, checks, reviews.
   375|- task issue binding.
   376|
   377|Project GitHub View is prompt-free and uses controlled forms for repository publishing and PR creation.
   378|
   379|## 16. Migrations
   380|
   381|Migrations live in `src/main/migrations/` and are triggered before indices are built in `openFsSession`.
   382|
   383|v2 schema migrations follow these rules:
   384|
   385|- Zod accepts old data first with optional/default fields.
   386|- migration scripts backfill once and record marker state.
   387|- vault safety snapshots are taken before destructive rewrites where applicable.
   388|- immutable task keys (`uid`, `type`, `created`) are never rewritten.
   389|
   390|## 17. Validation and observability
   391|
   392|Implementation gates for this codebase are:
   393|
   394|```bash
   395|npm run typecheck
   396|npm run lint -- --quiet
   397|npm test
   398|npm run build
   399|```
   400|
   401|E2E remains available through:
   402|
   403|```bash
   404|npm run e2e
   405|```
   406|
   407|Activity Log, Inbox records, agent event logs, terminal session history, and Git history are the primary observability surfaces for production debugging.

(End of file. Total 407 lines.)

---

## [Tool] 2026-04-28T04:01:53.025Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/
- CHANGELOG.phase-4.0-implementation.md (3.2KB)
- CHANGELOG.v2-implementation.md (5.2KB)
- DEVELOPMENT.md (3.4KB)
- MIGRATION.md (3.7KB)
- ROADMAP.md (10.7KB)
- USER_GUIDE.md (9.6KB)
- VISION.md (7.3KB)
- architecture.md (17.1KB)
- archive/
- archive/2026-04-22-orbit-terminal-session-awareness.md (18.5KB)
- archive/2026-04-23-capture-and-content-system.md (944B)
- archive/2026-04-23-contextual-right-sidebar-implementation.md (7.9KB)
- archive/2026-04-23-orbit-dot-orbit-agent-exposure-implementation.md (19.1KB)
- archive/2026-04-23-orbit-github-and-dot-orbit-implementation-report.md (4.6KB)
- archive/2026-04-23-orbit-github-integration-blueprint.md (17.5KB)
- archive/2026-04-23-orbit-project-session-orchestration.md (10.7KB)
- archive/architecture-v1.md (48.5KB)
- decisions/
- decisions/ADR-001-deprecate-night-shift.md (3.4KB)
- decisions/ADR-002-agent-autonomy-scope.md (3.9KB)
- decisions/ADR-003-execution-context-split.md (4.1KB)
- decisions/ADR-004-inbox-as-hub.md (5.1KB)
- decisions/ADR-005-plan-chat-reframing.md (4.0KB)
- decisions/ADR-006-task-authorization-model.md (6.2KB)
- decisions/ADR-007-task-dependency-model.md (4.9KB)
- decisions/ADR-008-ai-native-cli-first.md (7.1KB)
- decisions/ADR-009-activity-log-infrastructure.md (6.0KB)
- decisions/ADR-010-capture-tri-partition.md (7.0KB)
- decisions/ADR-011-runtime-abstraction-through-capabilities.md (4.3KB)
- decisions/ADR-012-task-session-binding-model.md (4.8KB)
- decisions/ADR-013-unified-event-replay-infrastructure.md (4.1KB)
- decisions/ADR-014-chat-decoupling-conversation-first-class.md (3.6KB)
- decisions/ADR-014-runtime-fallback-decision-rules.md (5.1KB)
- decisions/ADR-015-ask-anywhere-as-planner-proxy.md (3.5KB)
- decisions/ADR-015-task-session-state-decoupling.md (6.2KB)
- decisions/ADR-016-agent-onboarding-protocol.md (7.1KB)
- decisions/README.md (4.7KB)
- open-questions.md (13.5KB)
- overview.md (17.3KB)
- plans/
- plans/2026-04-22-orbit-agent-context-architecture.md (14.1KB)
- plans/2026-04-22-orbit-agent-context-scheme-a.md (10.0KB)
- plans/2026-04-22-orbit-agent-context-scheme-c.md (11.0KB)
- plans/2026-04-22-orbit-agent-context-scheme-d.md (38.0KB)
- plans/2026-04-23-area-room-vision-system-design.md (12.9KB)
- plans/2026-04-23-orbit-github-workspace-project-journey-redesign.md (12.2KB)
- plans/2026-04-23-orbit-github-workspace-project-journey-report.md (3.8KB)
- plans/2026-04-24-capture-knowledge-funnel.md (11.4KB)
- plans/2026-04-24-orbit-local-runtime-architecture.md (15.2KB)
- plans/2026-04-24-orbit-planner-agent-dispatch-design.md (11.8KB)
- plans/2026-04-24-orbit-workspace-inspector-files-changes.md (18.2KB)
- plans/2026-04-25-orbit-orchestration-ui-rollout.md (4.5KB)
- plans/2026-04-25-orbit-role-template-agent-design.md (14.0KB)
- plans/2026-04-25-task-conversation-ui.md (22.3KB)
- plans/2026-04-26-activity-log-infrastructure.md (9.5KB)
- plans/2026-04-26-auto-runner-dispatcher.md (8.8KB)
- plans/2026-04-26-capture-foundation.md (11.1KB)
- plans/2026-04-26-cli-migration.md (12.9KB)
- plans/2026-04-26-execution-model-migration.md (7.3KB)
- plans/2026-04-26-inbox-v2-architecture.md (12.6KB)
- plans/2026-04-26-quick-capture-mvp.md (5.8KB)
- plans/2026-04-26-task-dependency-system.md (8.4KB)
- plans/2026-04-27-activity-timeline-ui.md (7.3KB)
- plans/2026-04-27-agent-playground.md (7.6KB)
- plans/2026-04-27-event-replay-infrastructure.md (11.7KB)
- plans/2026-04-27-global-dashboard.md (8.9KB)
- plans/2026-04-27-phase-3-agent-observability-resilience.md (27.0KB)
- plans/2026-04-27-runtime-adapter-layer.md (13.6KB)
- plans/2026-04-27-runtime-fallback-rules.md (8.8KB)
- plans/2026-04-27-task-session-binding.md (7.2KB)
- plans/2026-04-28-task-execution-lifecycle-realignment.md (28.4KB)
- thinking-trail/
- thinking-trail/2026-04-26-v2-direction/
- thinking-trail/2026-04-29-chat-unification-decoupling/
- thinking-trail/2026-04-30-phase-2-knowledge-stack/

---

## [Assistant] 2026-04-28T04:02:02.580Z
关键发现：存在 **ADR-015-ask-anywhere-as-planner-proxy.md**，这是 Ask Anywhere 的核心决策文档。继续读取 ADR-015、布局优化记忆、以及现有 Ask Anywhere 的 UI 代码。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-015-ask-anywhere-as-planner-proxy.md","toolExplanation":"读取 Ask Anywhere ADR"})
- **memory_read**({"path":"兴趣爱好/Orbit-Ask-Anywhere/Skills分拆","toolExplanation":"读取 Skills 分拆记忆"})
- **memory_read**({"path":"兴趣爱好/Orbit-Ask-Anywhere/Vault-Context","toolExplanation":"读取 Vault Context 记忆"})
- **memory_read**({"path":"兴趣爱好/Orbit-Ask-Anywhere/布局优化","toolExplanation":"读取布局优化记忆"})
- **search_file**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer","pattern":"*AskAnywhere*","recursive":true,"caseSensitive":false,"toolExplanation":"查找 Ask Anywhere 相关源文件"})

---

## [Tool] 2026-04-28T04:02:02.591Z
     1|# ADR-015: Ask-Anywhere 作为规划者代理
     2|
     3|| 状态 | 日期 | 作者 |
     4||------|------|------|
     5|| **Proposed** | 2026-04-29 | Ryan / AI |
     6|
     7|## Context
     8|
     9|Orbit 的 agent 层级随着功能增长变得复杂：
    10|- Planner Agent：负责项目规划
    11|- Task Agent（按 role 绑定）：负责具体任务执行
    12|- Auto-runner：负责自动认领和调度
    13|- 未来的 Ask-Anywhere Agent：全应用 AI 助手
    14|- 未来的 Scheduled Task Agent：定时任务执行
    15|
    16|用户提出问题："channel 对接的到底是哪一层的 agent？现在 agent 有点多了。"
    17|
    18|同时，产品方向要求：
    19|- 用户应该只和一个 AI 入口打交道
    20|- 用户的认知负荷收敛到一点
    21|
    22|## Decision
    23|
    24|### D-1: 规划者 / 执行者二层结构
    25|
    26|建立清晰的 Agent 语义划分：
    27|
    28|```
    29|用户（规划者）  ←→  Ask-Anywhere（规划者代理）
    30|        ↓                      ↓
    31|        └──────────────────────┴──→ Role Agents（执行者）
    32|```
    33|
    34|**语义锚点**：
    35|> **用户是规划者，执行者是各个 Roles**
    36|
    37|### D-2: Ask-Anywhere 是用户的唯一 AI 入口
    38|
    39|- 用户日常只和 Ask-Anywhere 对话
    40|- Ask-Anywhere 代用户做**规划类工作**：创建项目、拆分任务、安排优先级
    41|- Role Agents 作为后台 worker 做**执行类工作**
    42|
    43|**形态**：
    44|- 左侧栏一级入口：全功能页面（对话列表 + chat + 产物预览）
    45|- 悬浮球：右下角极简对话框
    46|- 未来全屏模式
    47|
    48|### D-3: Planner Agent 作为独立实体退役
    49|
    50|规划能力由 Ask-Anywhere 承担。原 Planner Agent 的 system prompt 作为 Ask-Anywhere 的 skill 保留。
    51|
    52|`ProjectPlannerView` 冻结，不再新增功能。入口指向 Ask-Anywhere（带 project 上下文）。
    53|
    54|### D-4: 各业务模块自己配置 auto agent
    55|
    56|去中心化原则：
    57|- **Project**：配置自己的 Role Agents（已有）
    58|- **Area**：配置自己的 Reviewer Agent
    59|- **Scheduled Task**：每个定时任务声明自己用哪个 runtime
    60|- **Capture**：可配置自动 summarize agent
    61|
    62|模块间只通过 CLI / AppBus event 通信，不直接调用。
    63|
    64|### D-5: Channel 只对接 Ask-Anywhere
    65|
    66|所有外部 channel（Telegram / 未来其他）入站消息统一路由到 Ask-Anywhere。
    67|
    68|```
    69|Telegram → Gateway Daemon → AppBus → AskAnywhereOrchestrator
    70|```
    71|
    72|不需要 Intent Router——LLM（Ask-Anywhere 本身）就是最好的意图识别器。
    73|
    74|### D-6: Ask-Anywhere 通过 orbit CLI 操作 vault
    75|
    76|Ask-Anywhere 的能力完全通过 `orbit` CLI 工具集实现：
    77|- `orbit project list`
    78|- `orbit task propose`
    79|- `orbit capture create`
    80|- ...
    81|
    82|**这是 ADR-008（AI-Native + CLI-first）的第一次真正落地**：CLI 是给 AI 的接口，Ask-Anywhere 是第一个使用者。
    83|
    84|## Consequences
    85|
    86|### 正面
    87|
    88|1. **用户认知收敛**：只需记住"有事找 Ask-Anywhere"
    89|2. **Channel 路由简化**：不需要业务层路由逻辑
    90|3. **ADR-008 落地**：CLI-first 原则从理论变为现实
    91|4. **业务模块解耦**：每个模块自己管自己的 worker
    92|
    93|### 负面
    94|
    95|1. **Ask-Anywhere prompt 膨胀**：需要 skill 分拆 + context retrieval
    96|2. **Planner 代码迁移**：需要把精调 prompt 打包为 skill
    97|
    98|### 风险
    99|
   100|- Ask-Anywhere 规划质量可能不如原 Planner Agent（缓解：保留精调 skill）
   101|
   102|## Related
   103|
   104|- ADR-008（AI-Native + CLI-first）：本 ADR 是其第一次实践
   105|- ADR-014（Chat 解耦与 Conversation 一等公民）：Ask-Anywhere 依赖 Conversation 模型
   106|- ADR-004（Inbox 枢纽）：Ask-Anywhere 创建的 proposal 进 Inbox

(End of file. Total 106 lines.)

---

## [Tool] 2026-04-28T04:02:02.592Z
{"pagePath":"兴趣爱好/Orbit-Ask-Anywhere/Skills分拆.md","id":"兴趣爱好.skills分拆","slug":"Skills分拆","category":"兴趣爱好","title":"Skills 分拆","tags":["Ask-Anywhere","skills","context"],"related":[],"sources":[],"content":"","entries":[{"title":"Skills 分拆","content":"按意图维度：orbit-planning（规划/拆任务/立项目）、orbit-capture（记一下/捕获/想到）、orbit-distill（整理/总结/提炼）、orbit-express（帮我写/起草）、orbit-retrieve（我之前写过/看到过/讨论过）、orbit-review（周报/月报）、orbit-triage（Inbox/待办）、orbit-scheduling（每天/定时/提醒）。每个 skill 只加载需要的 context subset。选择机制：用户输入 → 轻量 LLM 判断意图 → 激活 1~3 个 skill → 加载对应 context → 组装 system prompt → 交给 runtime 执行。","metadata":{"recallCount":0,"mentions":1,"uniqueSessions":1,"lastRecalled":"-","confidence":0.9,"stability":"volatile","created":"2026-04-27"}}],"created":"2026-04-27T10:31:55.923Z","updated":"2026-04-27T10:31:55.923Z"}

---

## [Tool] 2026-04-28T04:02:02.592Z
{"pagePath":"兴趣爱好/Orbit-Ask-Anywhere/Vault-Context.md","id":"兴趣爱好.vault-context","slug":"Vault-Context","category":"兴趣爱好","title":"Vault Context 盘点","tags":["Ask-Anywhere","CODE+PARA","context"],"related":[],"sources":[],"content":"","entries":[{"title":"Vault Context 盘点","content":"基于 CODE+PARA 理论的第二大脑执行层。Vault Context 按意图按需 retrieval：身份层（user.profile/working_hours/active_focus）、PARA 层（projects/areas/resources/archives）、活动层（today/recent_7d/pending）、对话层（recent/anchored_to/thinking_trail）、产物层（writings/thoughts/captures/voice_logs）、素材层（library/feed/captured_but_unprocessed）、系统层（scheduled_tasks/inbox/skills/runtimes）、关系层（backlinks/forward_links/conversations）。","metadata":{"recallCount":0,"mentions":1,"uniqueSessions":1,"lastRecalled":"-","confidence":0.9,"stability":"volatile","created":"2026-04-27"}}],"created":"2026-04-27T10:31:55.909Z","updated":"2026-04-27T10:31:55.909Z"}

---

## [Tool] 2026-04-28T04:02:02.593Z
{"pagePath":"兴趣爱好/Orbit-Ask-Anywhere/布局优化.md","id":"兴趣爱好.布局优化","slug":"布局优化","category":"兴趣爱好","title":"体验优化方向","tags":["Ask-Anywhere","布局优化","体验优化"],"related":[],"sources":[],"content":"","entries":[{"title":"当前布局问题","content":"4 列布局：[Session列表 60px] | [Context面板 60px] | [ChatView flex-1] | [Stage面板 80px]。右侧还有 Focus / Inspector / Files 目录树渗入，在笔记本屏幕上完全不可用。ContextPanel 的 skills 是硬编码的，StagePanel 没内容时也占着一整列。","metadata":{"recallCount":0,"mentions":1,"uniqueSessions":1,"lastRecalled":"-","confidence":0.9,"stability":"volatile","created":"2026-04-28"}},{"title":"体验优化方向","content":"待确认方向：1) 产品形态：浮层瞬间唤起（Raycast AI/Spotlight）还是独立工作台页面？2) Context（Anchors/Skills/文件上下文）位置：折叠到对话内部还是侧边面板默认收起？3) Stage（产物画布）痛点：列太多信息过载、空面板占位、无合理收缩展开逻辑。","metadata":{"recallCount":0,"mentions":1,"uniqueSessions":1,"lastRecalled":"-","confidence":0.8,"stability":"volatile","created":"2026-04-28"}}],"created":"2026-04-28T03:59:52.304Z","updated":"2026-04-28T03:59:52.319Z"}

---

## [Tool] 2026-04-28T04:02:02.593Z
["src/views/AskAnywhereView.tsx"]

---

## [Assistant] 2026-04-28T04:02:16.004Z
高质量信息收集齐了。最后确认左侧导航结构、Ask Anywhere 视图代码、悬浮球是否已有实现。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/AskAnywhereView.tsx","toolExplanation":"读取 Ask Anywhere 主视图"})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer","pattern":"ask.?anywhere|AskAnywhere|FloatingOrb|floatingOrb|quickCapture|QuickCapture","outputMode":"files_with_matches","caseSensitive":false,"headLimit":40,"toolExplanation":"找 Ask Anywhere 入口/悬浮球相关代码"})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src","pattern":"Dashboard|Runtimes|Agents|Inbox|Notes|Library|Feeds|Resources|Knowledge|Timeline","outputMode":"files_with_matches","caseSensitive":true,"fileTypes":".tsx,.ts","headLimit":15,"toolExplanation":"找侧边导航定义位置"})

---

## [Tool] 2026-04-28T04:02:16.050Z
     1|/**
     2| * AskAnywhereView — Ask-Anywhere 主视图（M6 / P0）。
     3| *
     4| * 行为：
     5| *  - 通过 chat.listConversations 列出 ask_anywhere_session 会话
     6| *  - 选中会话后从持久化 turns 重建初始 RuntimeEvent 流，挂载 ChatView
     7| *  - 用户发送消息：
     8| *      a) 立刻追加一条本地 user RuntimeEvent（乐观渲染）
     9| *      b) 调用 chat.sendAction → main 端 AskAnywhereOrchestrator 调度 Claude
    10| *      c) 通过 onRuntimeEvent 接收 assistant 流式输出
    11| */
    12|
    13|import { useCallback, useEffect, useRef, useState } from 'react';
    14|import type { Conversation } from '@shared/conversation';
    15|import { ChatView } from '../components/chat/ChatView';
    16|import { DEFAULT_CHAT_HOST_CAPABILITIES } from '@shared/chat-protocol';
    17|import type { ChatAction, RuntimeEvent } from '@shared/chat-protocol';
    18|import type { ConversationStage } from '@shared/stage';
    19|import { StagePanel } from './ask-anywhere/StagePanel';
    20|import { ContextPanel } from './ask-anywhere/ContextPanel';
    21|
    22|function turnsToEvents(conv: Conversation): RuntimeEvent[] {
    23|  return conv.turns.map((t, idx) => ({
    24|    id: `turn-${t.id}`,
    25|    at: t.at,
    26|    kind: 'runtime.message',
    27|    conversationId: conv.id,
    28|    runId: `hist-${conv.id}`,
    29|    spanId: `hist-${idx}`,
    30|    payload: {
    31|      text: t.content,
    32|      role: t.role === 'user' ? 'user' : 'assistant',
    33|      isFinal: true
    34|    }
    35|  }));
    36|}
    37|
    38|export function AskAnywhereView(): JSX.Element {
    39|  const [sessions, setSessions] = useState<Conversation[]>([]);
    40|  const [activeId, setActiveId] = useState<string | null>(null);
    41|  const [events, setEvents] = useState<RuntimeEvent[]>([]);
    42|  const [stage, setStage] = useState<ConversationStage | null>(null);
    43|  const [isLoading, setIsLoading] = useState(false);
    44|  const activeIdRef = useRef<string | null>(null);
    45|  activeIdRef.current = activeId;
    46|
    47|  const reload = useCallback(async () => {
    48|    const list = await window.orbit.chat.listConversations();
    49|    const askOnly = list.filter((c) => c.anchors.some((a) => a.kind === 'ask_anywhere_session'));
    50|    // listConversations returns ConversationMeta; load full conversations for sidebar quickness
    51|    const full = await Promise.all(
    52|      askOnly.map((meta) => window.orbit.chat.getConversation(meta.id))
    53|    );
    54|    const conversations = full.filter((c): c is Conversation => c !== null);
    55|    setSessions(conversations);
    56|    if (!activeIdRef.current && conversations.length > 0) setActiveId(conversations[0].id);
    57|  }, []);
    58|
    59|  // hydrate selected conversation from persisted turns
    60|  useEffect(() => {
    61|    if (!activeId) {
    62|      setEvents([]);
    63|      return;
    64|    }
    65|    let cancelled = false;
    66|    void window.orbit.chat.getConversation(activeId).then((conv) => {
    67|      if (cancelled || !conv) return;
    68|      setEvents(turnsToEvents(conv));
    69|      setIsLoading(Boolean(conv.currentRunId));
    70|    });
    71|    void window.orbit.stage.get(activeId).then((next) => {
    72|      if (!cancelled) setStage(next);
    73|    });
    74|    return () => {
    75|      cancelled = true;
    76|    };
    77|  }, [activeId]);
    78|
    79|  useEffect(() => {
    80|    void reload();
    81|    const off = window.orbit.chat.onRuntimeEvent((event) => {
    82|      if (event.conversationId !== activeIdRef.current) return;
    83|      setEvents((current) => [...current, event]);
    84|      if (event.kind === 'runtime.done' || event.kind === 'runtime.error') {
    85|        setIsLoading(false);
    86|        if (activeIdRef.current) {
    87|          void window.orbit.stage.get(activeIdRef.current).then(setStage);
    88|        }
    89|      }
    90|    });
    91|    const offStage = window.orbit.stage.onEvent((next) => {
    92|      if (next.conversation_id === activeIdRef.current) setStage(next);
    93|    });
    94|    return () => {
    95|      off();
    96|      offStage();
    97|    };
    98|  }, [reload]);
    99|
   100|  async function handleNew(): Promise<void> {
   101|    const conv = await window.orbit.chat.createConversation({
   102|      anchor: {
   103|        kind: 'ask_anywhere_session',
   104|        refId: `ask-${Date.now()}`,
   105|        addedAt: new Date().toISOString()
   106|      },
   107|      title: 'Ask Anywhere',
   108|      runtimeHint: 'claude'
   109|    });
   110|    setActiveId(conv.id);
   111|    await reload();
   112|  }
   113|
   114|  async function handleArtifactAction(artifactId: string, actionId: string): Promise<void> {
   115|    if (!activeId) return;
   116|    await window.orbit.stage.execAction(activeId, artifactId, actionId);
   117|    setStage(await window.orbit.stage.get(activeId));
   118|  }
   119|
   120|  const activeConversation = sessions.find((conv) => conv.id === activeId) ?? null;
   121|
   122|  async function handleAction(action: ChatAction): Promise<void> {
   123|    if (!activeId) return;
   124|    if (action.kind === 'chat.send_message') {
   125|      const payload = action.payload as { text: string };
   126|      const text = payload.text.trim();
   127|      if (!text) return;
   128|      const localId = `local-user-${Date.now()}`;
   129|      // 乐观追加用户消息
   130|      setEvents((current) => [
   131|        ...current,
   132|        {
   133|          id: localId,
   134|          at: new Date().toISOString(),
   135|          kind: 'runtime.message',
   136|          conversationId: activeId,
   137|          runId: 'local',
   138|          spanId: localId,
   139|          payload: { text, role: 'user', isFinal: true }
   140|        }
   141|      ]);
   142|      setIsLoading(true);
   143|      try {
   144|        await window.orbit.chat.sendAction(action);
   145|      } catch (err) {
   146|        setIsLoading(false);
   147|        // 错误已由 main 端 emit synthetic runtime.error
   148|        console.warn('sendAction failed', err);
   149|      }
   150|      return;
   151|    }
   152|    if (action.kind === 'chat.stop') {
   153|      try {
   154|        await window.orbit.chat.sendAction(action);
   155|      } finally {
   156|        setIsLoading(false);
   157|      }
   158|      return;
   159|    }
   160|    // 其它 action 暂统一转交 main（main 会忽略未实现 kind）
   161|    await window.orbit.chat.sendAction(action).catch(() => undefined);
   162|  }
   163|
   164|  return (
   165|    <div className="flex h-full">
   166|      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
   167|        <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-neutral-500">
   168|          <span>Ask Anywhere</span>
   169|          <button
   170|            onClick={() => void handleNew()}
   171|            className="rounded bg-sky-600 px-2 py-1 text-[10px] text-white hover:bg-sky-500"
   172|          >
   173|            + New
   174|          </button>
   175|        </div>
   176|        <div className="flex-1 overflow-y-auto">
   177|          {sessions.length === 0 ? (
   178|            <p className="px-3 py-6 text-xs text-neutral-500">
   179|              No Ask sessions yet. Click “+ New”.
   180|            </p>
   181|          ) : (
   182|            sessions.map((conv) => (
   183|              <button
   184|                key={conv.id}
   185|                onClick={() => setActiveId(conv.id)}
   186|                className={`block w-full px-3 py-2 text-left text-sm ${
   187|                  activeId === conv.id
   188|                    ? 'bg-sky-50 dark:bg-sky-900/30'
   189|                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
   190|                }`}
   191|              >
   192|                <div className="truncate font-medium">{conv.title ?? 'Untitled'}</div>
   193|                <div className="truncate text-[11px] text-neutral-500">
   194|                  {new Date(conv.updatedAt).toLocaleString()}
   195|                </div>
   196|              </button>
   197|            ))
   198|          )}
   199|        </div>
   200|      </aside>
   201|      <ContextPanel conversation={activeConversation} />
   202|      <section className="flex min-w-0 flex-1 flex-col">
   203|        {activeId ? (
   204|          <ChatView
   205|            conversationId={activeId}
   206|            capabilities={DEFAULT_CHAT_HOST_CAPABILITIES}
   207|            events={events}
   208|            isLoading={isLoading}
   209|            onAction={(action) => void handleAction(action)}
   210|            welcomeMessage="Ask anything. Each session persists as a conversation."
   211|          />
   212|        ) : (
   213|          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
   214|            Select or create a session to start.
   215|          </div>
   216|        )}
   217|      </section>
   218|      {activeId ? <StagePanel stage={stage} onAction={(artifactId, actionId) => void handleArtifactAction(artifactId, actionId)} /> : null}
   219|    </div>
   220|  );
   221|}

(End of file. Total 221 lines.)

---

## [Tool] 2026-04-28T04:02:16.051Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/App.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Sidebar/WorkspaceSidebar.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/ask-anywhere/FloatingBall.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/quick-capture/QuickCaptureModal.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/quick-capture/QuickCaptureProvider.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/topbarModel.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/store/para.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/AskAnywhereView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/ConversationsView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/GatewayView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/ProjectPlannerView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/ScheduledTasksView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/VaultView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/vaultRightSidebarModel.ts

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-28T04:02:16.051Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/CloseProjectDialog.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Sidebar/ProjectsNav.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Sidebar/WorkspaceSidebar.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Tasks/TaskChatHost.tsx

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Assistant] 2026-04-28T04:02:36.680Z
关键：**已存在 `FloatingBall.tsx` 和 `WorkspaceSidebar.tsx`**。快速确认两者当前状态和 App.tsx 集成方式。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/ask-anywhere/FloatingBall.tsx","toolExplanation":"读取悬浮球实现"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Sidebar/WorkspaceSidebar.tsx","toolExplanation":"读取侧边导航"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/App.tsx","toolExplanation":"读取 App 根组件"})

---

## [Tool] 2026-04-28T04:02:36.687Z
     1|import { usePara } from '../../store/para';
     2|
     3|/**
     4| * 右下角悬浮球 — 一键打开 Ask-Anywhere 视图。
     5| * 设计参考：docs/thinking-trail/2026-04-29-chat-unification-decoupling D-3 入口要求
     6| */
     7|export function FloatingBall(): JSX.Element | null {
     8|  const view = usePara((s) => s.view);
     9|  const setView = usePara((s) => s.setView);
    10|
    11|  if (view.kind === 'askAnywhere') return null;
    12|
    13|  return (
    14|    <button
    15|      type="button"
    16|      onClick={() => setView({ kind: 'askAnywhere' })}
    17|      title="Ask Anywhere (规划者)"
    18|      aria-label="Open Ask Anywhere"
    19|      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl text-white shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 dark:from-indigo-400 dark:to-purple-500"
    20|    >
    21|      ✨
    22|    </button>
    23|  );
    24|}

(End of file. Total 24 lines.)

---

## [Tool] 2026-04-28T04:02:36.687Z
     1|import { usePara, type WorkspaceView } from '../../store/para';
     2|
     3|interface Item {
     4|  label: string;
     5|  view: WorkspaceView;
     6|  icon: string;
     7|}
     8|
     9|const ITEMS: Item[] = [
    10|  { label: 'Dashboard', view: { kind: 'dashboard' }, icon: '◎' },
    11|  { label: 'Runtimes', view: { kind: 'runtimes' }, icon: '◫' },
    12|  { label: 'Agents', view: { kind: 'agents' }, icon: '◌' },
    13|  { label: 'Inbox', view: { kind: 'inbox' }, icon: '📥' },
    14|  { label: 'Ask Anywhere', view: { kind: 'askAnywhere' }, icon: '✨' },
    15|  { label: 'Conversations', view: { kind: 'conversations' }, icon: '💬' },
    16|  { label: 'Today', view: { kind: 'today' }, icon: '☼' },
    17|  { label: 'Kanban', view: { kind: 'kanban', projectUid: null }, icon: '▦' }
    18|];
    19|
    20|export function WorkspaceSidebar(): JSX.Element {
    21|  const view = usePara((s) => s.view);
    22|  const setView = usePara((s) => s.setView);
    23|
    24|  return (
    25|    <div>
    26|      <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
    27|        Workspace
    28|      </h2>
    29|      <ul className="space-y-0.5 text-sm">
    30|        {ITEMS.map((it) => {
    31|          const active = it.view.kind === view.kind;
    32|          return (
    33|            <li key={it.label}>
    34|              <button
    35|                onClick={() => setView(it.view)}
    36|                className={
    37|                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
    38|                  (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
    39|                }
    40|              >
    41|                <span className="w-4 text-neutral-500">{it.icon}</span>
    42|                <span>{it.label}</span>
    43|              </button>
    44|            </li>
    45|          );
    46|        })}
    47|      </ul>
    48|    </div>
    49|  );
    50|}

(End of file. Total 50 lines.)

---

## [Tool] 2026-04-28T04:02:36.688Z
     1|import { useEffect } from 'react';
     2|import { useWorkspace } from './store/workspace';
     3|import { TopBar } from './components/TopBar';
     4|import { WelcomeView } from './views/WelcomeView';
     5|import { VaultView } from './views/VaultView';
     6|import { Toasts } from './components/Toasts';
     7|import { SettingsModal } from './components/SettingsModal';
     8|import { QuickCaptureProvider } from './components/quick-capture/QuickCaptureProvider';
     9|import { FloatingBall } from './components/ask-anywhere/FloatingBall';
    10|
    11|export function App(): JSX.Element {
    12|  const { init, loading, vault, error } = useWorkspace();
    13|
    14|  useEffect(() => {
    15|    void init();
    16|  }, [init]);
    17|
    18|  if (loading) {
    19|    return (
    20|      <div className="flex h-full items-center justify-center bg-neutral-50 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
    21|        Loading Orbit…
    22|      </div>
    23|    );
    24|  }
    25|
    26|  return (
    27|    <div className="flex h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    28|      <TopBar />
    29|      {error && (
    30|        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-300">
    31|          {error}
    32|        </div>
    33|      )}
    34|      <main className="flex flex-1 min-h-0">
    35|        {vault ? <VaultView /> : <WelcomeView />}
    36|      </main>
    37|      <Toasts />
    38|      <QuickCaptureProvider />
    39|      <SettingsModal />
    40|      {vault && <FloatingBall />}
    41|    </div>
    42|  );
    43|}

(End of file. Total 43 lines.)

---

## [Assistant] 2026-04-28T04:03:17.223Z
信息齐了。现在我已对项目全貌、ADR-015、现有实现状态有了完整画像，可以给出带观点的方案了。

⚠️ **和你截图/描述对得上也对不上的几处关键事实**：

1. **左侧导航实际上已经有 Ask Anywhere 入口**（`WorkspaceSidebar.tsx` 第 14 行：`{ label: 'Ask Anywhere', view: { kind: 'askAnywhere' }, icon: '✨' }`）。你截图里的侧栏显示的是 Dashboard/Runtimes/Agents/Inbox/Notes/Library/... 这套项，里面确实也有一项，但你说"没有 ask-anywhere 入口"——这里和代码不一致。**可能原因**：截图是另一个分支/旧版本，或者 "Ask Anywhere" 藏在顶部视觉识别度不高（`✨` 图标 + 普通字号，混在 8 个同级项里）。
2. **悬浮球代码已经存在**（`FloatingBall.tsx`），挂在 `App.tsx` 第 40 行；它目前的行为是 **"点击跳转到 AskAnywhereView 全屏页"**，而**不是**"右下角弹出一个对话框"。
3. 所以你说的"点击悬浮球出了这个页面"是准确的——**当前悬浮球 = 全屏跳转开关**，跟 ADR-015 D-2 说的「悬浮球：右下角极简对话框」形态不符。

也就是说，这不是"没做"的问题，而是**入口语义错位**：悬浮球被写成了侧栏项的重复触发器，而不是独立的轻量形态。

---

## 我对这次优化的判断（先说观点，再问你要的方向）

### 观点 1：ADR-015 已经把方向定了，但**只定到了"有这三种形态"**，没有定**"什么时候用哪个"**

ADR-015 D-2 明确列出了三种入口形态：

| 形态 | ADR 原文 | 当前实现 |
|------|----------|----------|
| 全功能页面 | "左侧栏一级入口：全功能页面（对话列表 + chat + 产物预览）" | ✅ `AskAnywhereView`（你截图的四列布局） |
| 悬浮球 | "悬浮球：右下角极简对话框" | ❌ 被写成了全屏跳转按钮 |
| 全屏 | "未来全屏模式" | 当前全功能页面就占全屏 |

**真正缺失的是"极简对话框形态"**。你的直觉完全对：悬浮球 ≠ 传送门，悬浮球 = 就地弹层。

### 观点 2：这里有一个**产品原则**要先拍板，再谈 UI

对话 box（popover 弹层）和全功能页（四列布局）的**关系是什么**？有三种可能，差别巨大：

**方案 A：弹层是"快速通道"，全页是"驾驶舱"（双形态互补）**
- 弹层：只做"来一句、走一句"——类似 Raycast AI，chat + 回答，关掉就没了；**不关联任何 conversation 持久化**（或自动命名存到全页的会话列表里）
- 全页：历史会话管理、多轮深度、stage 产物画布、anchor 管理
- 好处：两个形态各司其职，用户路径清晰
- 坏处：两边数据模型要打通（同一次对话能不能在弹层启动、在全页继续？）

**方案 B：弹层是全页的"迷你版投影"（单形态双尺寸）**
- 弹层里就是当前选中的那个 conversation，只是窗口更小、context/stage 面板隐藏
- 点开有个"在全页打开 ↗"按钮
- 好处：模型简单，共享一套数据
- 坏处：弹层必然承载过多状态，又回到你现在觉得"布局不对"的问题

**方案 C：弹层是"无状态入口"，每次都是新对话（Spotlight 模式）**
- 每次召唤弹层都是 fresh session，回车直接发；如果对话变重再升级成全页
- 好处：弹层极简，没有状态包袱
- 坏处：弹层里的对话是"一次性"还是能追问？要不要能翻历史？

📝 我的倾向：**方案 A**，并且**弹层有"升级到全页"的显式动作**（比如一个小箭头按钮），把对话从弹层"推到"全页继续。这符合 BASB 的 Capture→Distill 节奏——**弹层负责 Capture 一个想法/问题，需要深入时再开 Distill 场子**。

### 观点 3：全功能页现在的四列布局问题你已经诊断对了（记忆里有记录）

你之前的记忆 `兴趣爱好/Orbit-Ask-Anywhere/布局优化` 已经把问题写清楚：
- 4 列：Session 60 + Context 60 + Chat flex + Stage 80 = 在笔记本上不可用
- ContextPanel 的 skills 是硬编码的
- StagePanel 空时也占一列

从我刚读的代码验证——完全属实（`AskAnywhereView.tsx` 第 165-219 行就是这个结构）。

**我的建议**（如果我们确认要做全页重设计）：
- **两列为主**：左 Session 列表 + 右 Chat
- **Context 折进对话顶部**：作为一条可展开的"上下文条"（anchors + skills 徽章），默认收起
- **Stage 按需抽屉**：对话中出现产物时，从右侧滑出；空时完全不占位
- **Skills 动态**：对接 ADR-015 D-6 的意图识别，不是硬编码

---

## 我要问你两件事（这决定我们下一步走多深）

**Q1: 弹层和全页的关系怎么定？** (见上面方案 A/B/C)

**Q2: 本次优化的范围边界是什么？**
- 🅰️ **只修入口体验**：把悬浮球改成真正的弹层对话框 + 侧栏"Ask Anywhere"项的视觉强化（比如置顶、加分隔、配色区分）；全页布局本期不动
- 🅱️ **入口 + 全页布局重构**：以上 + 把四列压成"两列 + 顶部 context 条 + 抽屉 stage"
- 🅲️ **顺便把 ADR-015 其他未落地项一起推**：skill 意图路由（D-6）、planner 能力吸收（D-3 中 `ProjectPlannerView` 冻结入口指向 Ask-Anywhere）、channel 路由统一（D-5）

我的建议：**从 🅱️ 起步**。理由：你核心痛点是"布局不对"，仅改入口治标不治本；但 🅲️ 跨度太大，应该分批走。🅱️ 可以在 1-2 次对话里完整规划清楚。

📌 **等你回复 Q1 和 Q2 后**，我会：
1. 初始化 `.session.json` 到 `orbit/docs/thinking-trail/` 下新的 trail 目录
2. 按 Evolve 模式产出一份具体的 feature 文档（`features/ask-anywhere-ux.md` 或等价命名）
3. 起草一条 ADR（如果需要修订 ADR-015 的 D-2 入口定义）+ changelog 条目

你说怎么走？

---

## [User] 2026-04-28T05:46:08.099Z
弹层里就是一个conversation，可以直接复用chat的组件，保证应用内的chat交互和ui，渲染体验都一致，会话和全页是通的，点开默认是上次的会话，但可以新建会话，弹层顶部有个下拉框可以选择会话，弹层可以多轮对话，可以点击展开，就去到全页。
全页重设计按你说的来。
入口 + 全页布局重构

---

## [Assistant] 2026-04-28T05:46:22.690Z
很清楚了。开始落地规划流程。

## 我听到的方向确认（用你的原话组织）

**弹层形态**（方案 B 的变体——但关键升级是"强调 chat 组件复用 + 对话联通"）：
- 弹层 = 单个 conversation 的迷你容器
- **复用 ChatView 组件**，保证消息渲染、交互、键位、流式体验与全页完全一致
- **会话与全页打通**：默认恢复上次会话；可从弹层内新建；顶部下拉框切换历史会话
- 支持多轮对话
- **"展开 ↗"按钮**把当前会话推到全页继续
- Context / Stage 面板在弹层里**不出现**（空间不够 + 弹层定位是轻量）

**全页重设计**（按我上面的提法）：
- 两列为主：Session 列表 + Chat
- Context 折进对话顶部的可展开"上下文条"（anchors + skills），默认收起
- Stage 按需抽屉，空时不占位
- Skills 动态化（对接意图路由，非硬编码）

**本期范围**：🅱️ 入口 + 全页布局重构（不触碰 skill 意图路由 D-6、planner 吸收 D-3、channel 路由 D-5）

---

接下来我会初始化 session 并产出规划文档。先把工作目录和 session 建起来。

### Tool Calls:
- **execute_command**({"command":"mkdir -p /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-28-ask-anywhere-ux","toolExplanation":"创建 thinking-trail 目录"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/ask-anywhere/ContextPanel.tsx","toolExplanation":"读取 ContextPanel 实现细节"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/ask-anywhere/StagePanel.tsx","toolExplanation":"读取 StagePanel 实现细节"})
- **search_file**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/chat","pattern":"*.tsx","recursive":true,"caseSensitive":false,"toolExplanation":"列出 ChatView 组件族"})

---

## [Tool] 2026-04-28T05:46:22.717Z
(no output)

---

## [Tool] 2026-04-28T05:46:22.718Z
     1|import type { Conversation } from '@shared/conversation';
     2|
     3|export function ContextPanel({ conversation }: { conversation: Conversation | null }): JSX.Element {
     4|  return (
     5|    <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white/40 p-3 dark:border-neutral-800 dark:bg-neutral-950/30 xl:block">
     6|      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Context</h2>
     7|      <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
     8|        <div className="font-medium">Anchors</div>
     9|        <div className="mt-2 space-y-1 text-neutral-500">
    10|          {conversation?.anchors.map((anchor) => (
    11|            <div key={`${anchor.kind}:${anchor.refId}`} className="truncate">
    12|              {anchor.kind}: {anchor.refId}
    13|            </div>
    14|          )) ?? null}
    15|        </div>
    16|      </div>
    17|      <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
    18|        <div className="font-medium">Active skills</div>
    19|        <ul className="mt-2 list-disc space-y-1 pl-4 text-neutral-500">
    20|          <li>orbit-capture</li>
    21|          <li>orbit-retrieve</li>
    22|          <li>orbit-scheduling</li>
    23|          <li>orbit-welcome-analysis</li>
    24|        </ul>
    25|      </div>
    26|    </aside>
    27|  );
    28|}
    29|

(End of file. Total 29 lines.)

---

## [Tool] 2026-04-28T05:46:22.718Z
     1|import type { ConversationStage } from '@shared/stage';
     2|import { ArtifactCard } from './ArtifactCard';
     3|
     4|export function StagePanel({
     5|  stage,
     6|  onAction
     7|}: {
     8|  stage: ConversationStage | null;
     9|  onAction(artifactId: string, actionId: string): void;
    10|}): JSX.Element {
    11|  return (
    12|    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white/50 dark:border-neutral-800 dark:bg-neutral-950/30">
    13|      <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
    14|        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Stage</h2>
    15|        <p className="text-[11px] text-neutral-500">Artifacts created or referenced in this session.</p>
    16|      </div>
    17|      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
    18|        {!stage || stage.artifacts.length === 0 ? (
    19|          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-700">
    20|            No artifacts yet.
    21|          </div>
    22|        ) : (
    23|          stage.artifacts.map((artifact) => (
    24|            <ArtifactCard key={artifact.id} artifact={artifact} onAction={onAction} />
    25|          ))
    26|        )}
    27|      </div>
    28|    </aside>
    29|  );
    30|}
    31|

(End of file. Total 31 lines.)

---

## [Tool] 2026-04-28T05:46:22.719Z
["ActionBar.tsx","ChatView.tsx","InputArea.tsx","MessageBubble.tsx","ThinkingBlock.tsx","ToolCard.tsx"]

---

## [Assistant] 2026-04-28T05:49:27.500Z
信息够了。写规划文档。

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-28-ask-anywhere-ux/.session.json","content":"{\n  \"project_name\": \"ask-anywhere-ux\",\n  \"mode\": \"evolve\",\n  \"current_phase\": \"scope-confirmed\",\n  \"phases_covered\": [\"mode-detect\", \"context-gather\", \"direction-confirm\"],\n  \"checklist_status\": {\n    \"entry-semantics\": \"done\",\n    \"popover-behavior\": \"done\",\n    \"fullpage-layout\": \"done\",\n    \"scope-boundary\": \"done\",\n    \"skills-dynamic\": \"deferred\",\n    \"planner-absorb\": \"deferred\",\n    \"channel-route\": \"deferred\"\n  },\n  \"pending_questions\": [\n    \"悬浮球在全页视图是否隐藏（当前代码已隐藏，但 ADR-015 未明确）\",\n    \"弹层位置是否允许用户拖动/记忆位置\",\n    \"弹层默认尺寸（我倾向 w-[380px] h-[520px]）\",\n    \"全页 Stage 抽屉的触发方式：artifact 产出时自动打开还是手动\"\n  ],\n  \"features_identified\": [\"ask-anywhere-ux-revamp\"],\n  \"features_drafted\": [],\n  \"last_updated\": \"2026-04-28T00:00:00Z\",\n  \"notes\": \"Evolve 会话：重塑 Ask-Anywhere 的入口语义（悬浮球=弹层对话框）+ 全页布局从四列压成两列+顶部 context 条+按需 Stage 抽屉。不动 ADR-015 D-3/D-5/D-6。\"\n}\n","toolExplanation":"写入会话状态"})
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-28-ask-anywhere-ux-revamp.md","content":"# Ask-Anywhere UX Revamp — 入口语义 + 全页布局重构\n\n> **Status**: draft (2026-04-28)\n> **Scope**: 修正悬浮球语义、重设全页布局；不扩展 ADR-015 的 skill 路由 / planner 吸收 / channel 统一\n> **Related ADRs**: ADR-015 (Ask-Anywhere as Planner Proxy), ADR-014 (Chat Decoupling), ADR-005 (Plan Chat Reframing)\n> **Owner**: Ryan\n\n---\n\n## 1. 背景与问题\n\nADR-015 D-2 定义了 Ask-Anywhere 的三种入口形态：左侧栏一级入口（全功能页面）、右下角悬浮球（极简对话框）、未来全屏模式。当前代码落地状态：\n\n| 形态 | 应然 | 实然 | 偏差 |\n|------|------|------|------|\n| 左栏入口 | 一级菜单项，视觉上是\"唯一 AI 入口\" | `WorkspaceSidebar` 中与 8 个同级项并列，`✨` 小图标混在一起，无强化 | 视觉权重不足 |\n| 悬浮球 | **右下角弹出极简对话框**，就地对话 | `FloatingBall.tsx` 实际是\"全屏跳转按钮\" | **语义错位** |\n| 全功能页 | 对话列表 + chat + 产物预览 | 四列硬分：Session 60 + Context 60 + Chat flex + Stage 80 | 笔记本屏幕上不可用；Context skills 硬编码；Stage 空也占位 |\n\n**根因**：悬浮球当作了侧栏项的重复触发器（view 切换），没有独立的容器形态；全页布局一次性把所有维度铺平，没有按\"注意力密度\"分主次。\n\n---\n\n## 2. 目标\n\n本期交付两件事：\n\n1. **把悬浮球改造成真正的就地弹层对话框**（迷你 chat 容器，复用 ChatView 组件，和全页共享同一套 conversation）\n2. **把全页从四列压成两列为主 + 顶部 context 条 + 按需 Stage 抽屉**\n\n显式不在本期：\n- Skill 意图路由动态化（ADR-015 D-6）\n- Planner Agent 退役 / ProjectPlannerView 冻结（ADR-015 D-3）\n- Channel 统一路由到 Ask-Anywhere（ADR-015 D-5）\n- 全屏模式（ADR-015 D-2 第三形态）\n\n---\n\n## 3. 产品设计\n\n### 3.1 悬浮球 + 弹层对话框\n\n#### 行为契约\n\n| 场景 | 行为 |\n|------|------|\n| 启动 Orbit | 悬浮球显示在所有 vault view 的右下角（与当前一致） |\n| 当前在 Ask-Anywhere 全页 | 悬浮球隐藏（避免自指） |\n| 点击悬浮球 | **右下角弹出对话框**（不再跳转到全页） |\n| 弹层打开时点击悬浮球 | 关闭弹层 |\n| 弹层外点击 | **不关闭**（允许用户边看其他页面边对话） |\n| `Esc` | 关闭弹层（焦点在弹层时） |\n| 键盘快捷键 | 保留未来扩展（比如 `⌘\\`），本期先不绑 |\n\n#### 弹层结构（自上而下）\n\n```\n┌─ Popover (anchor: bottom-right, offset 24px, w-[380] h-[560]) ─┐\n│  ┌─ Header 36px ────────────────────────────────────────┐    │\n│  │ [▼ 会话下拉] [+] [↗ 展开]              [×]            │    │\n│  └───────────────────────────────────────────────────────┘    │\n│  ┌─ ChatView (flex-1, 复用) ──────────────────────────┐       │\n│  │                                                     │       │\n│  │  (消息流，与全页完全一致的渲染 / 交互 / 流式)       │       │\n│  │                                                     │       │\n│  └─────────────────────────────────────────────────────┘       │\n│  ┌─ InputArea (ChatView 内置) ─────────────────────────┐       │\n│  └─────────────────────────────────────────────────────┘       │\n└──────────────────────────────────────────────────────────────┘\n```\n\n- **会话下拉**：按 `updatedAt desc` 列出所有 `ask_anywhere_session` anchor 的 conversation；默认选中\"上次使用\"（localStorage 记忆最后 `activeId`，启动时校验 conversation 还存在）\n- **`+`**：新建一个 ask_anywhere_session conversation，直接设为 active\n- **`↗ 展开`**：`setView({ kind: 'askAnywhere' })` 并把当前 activeId 传过去，保证全页打开就是同一个会话；关闭弹层\n- **`×`**：关闭弹层（不销毁 conversation 状态）\n\n#### 为什么不要 Context / Stage 在弹层里\n\n- 弹层定位是**轻量入口**，塞 anchors / skills / artifacts 会回到用户当前觉得\"布局不对\"的问题\n- 需要看上下文或产物 → \"展开\"到全页就能看到\n- 这是\"Capture 强度\"和\"Distill 强度\"的分场子（对齐 BASB 的 CODE 节奏）\n\n#### 弹层尺寸与定位\n\n- 默认 `w-[380px] h-[560px]`，距右下角 `24px`（避开悬浮球本身）\n- 本期**固定尺寸**，不做拖拽/缩放/位置记忆（MVP 不值得）\n- 屏幕高度 < 640 时自动缩到 `h-[calc(100vh-80px)]`\n\n#### 状态与全页联通\n\n**唯一事实源**：`window.orbit.chat.*`（conversations 后端持久化）\n\n- 弹层和全页都通过 `chat.listConversations()` + `chat.getConversation(id)` 读同一套数据\n- 弹层的\"默认恢复上次\"通过 `localStorage['ask-anywhere.last-active-id']` 记住\n- 全页也使用同一个 key（弹层和全页切换时 activeId 自然同步）\n- `onRuntimeEvent` 只订阅当前 activeId 的事件（弹层和全页任一 open 时订阅，关闭取消）\n\n**并发打开处理**：理论上用户同时开弹层和全页可能（极罕见），两者订阅同一 conversationId 的 runtime events，乐观渲染各自走自己的 state——不做协调，消息落库后两侧都能看到最终一致结果。\n\n---\n\n### 3.2 左栏入口视觉强化\n\n保持\"一级菜单项\"的结构不变，但做三件事：\n\n1. **置顶 + 分组标题**：\"Ask Anywhere\" 从中间挪到 Workspace 组**第一位**，并在上方加一个极轻的 \"AI\" 分组标题（或者直接单独分一个 section）\n2. **图标升级**：`✨` 换成更有识别度的图标（考虑 `Sparkles` / `MessageCircleQuestion` lucide icon，和悬浮球保持视觉呼应）\n3. **样式区分**：轻微加强（比如浅紫色 hover / 选中时的 accent），提示这是\"不一样\"的入口\n\n---\n\n### 3.3 全页布局重构\n\n#### 目标结构\n\n```\n┌─ AskAnywhereView ─────────────────────────────────────────────┐\n│  ┌─ Session Sidebar 240 ─┐  ┌─ Main Pane (flex-1) ─────────┐  │\n│  │ [+ New]               │  │ ┌─ ContextBar (collapsed) ─┐ │  │\n│  │ Ask Anywhere  12:03   │  │ │ ▸ Context (3 anchors,    │ │  │\n│  │ 项目规划      昨天     │  │ │   4 skills)              │ │  │\n│  │ ...                   │  │ └──────────────────────────┘ │  │\n│  │                       │  │ ┌─ ChatView ───────────────┐ │  │\n│  │                       │  │ │                          │ │  │\n│  │                       │  │ │  messages                │ │  │\n│  │                       │  │ │                          │ │  │\n│  │                       │  │ │  input                   │ │  │\n│  │                       │  │ └──────────────────────────┘ │  │\n│  └───────────────────────┘  └──────────────────────────────┘  │\n│                                   ▲ Stage drawer (按需从右滑入)│\n└───────────────────────────────────────────────────────────────┘\n```\n\n#### Session Sidebar\n\n- 保留现有设计，微调：\n  - 宽度 `w-60`（当前已是）\n  - 列表项高度收紧（当前 2 行：title + time；保留）\n  - 置顶\"+ New\"按钮\n\n#### ContextBar（折叠式上下文条）\n\n- **默认收起**，只显示一行：\"▸ Context · 3 anchors · 4 skills\"（数量汇总）\n- **展开后**显示两个分区：\n  - **Anchors**：当前 conversation 的所有 anchor（kind + refId，带 icon）\n  - **Active Skills**：从 conversation 元数据读取（本期从 anchor 或硬编码默认集推断；动态化留给 ADR-015 D-6）\n- 展开态高度上限 `max-h-[180px]`，内部滚动\n\n**重要**：`ContextPanel.tsx` 的当前硬编码 skills（`orbit-capture / orbit-retrieve / orbit-scheduling / orbit-welcome-analysis`）本期**保留为默认集**但**不再常驻一整列**。动态化是下一步。\n\n#### ChatView 主体\n\n- 占主 pane 剩余空间\n- 复用 `components/chat/ChatView.tsx`（和弹层共用）\n\n#### Stage Drawer（按需抽屉）\n\n- **默认不显示**（当前是常驻 80px 宽第四列）\n- **触发方式**（本期选这条）：**conversation 的 stage 非空时，在 ChatView 顶部右侧出现一个小徽章 \"Stage · 2 artifacts ↗\"**；点击打开抽屉；有 artifact 产出时**徽章脉冲一次**提示用户\n- 抽屉宽度 `w-80`，从右侧叠加（不挤压 ChatView，ChatView 仍保持全宽，抽屉用 `absolute` 或 `overlay`）\n- 关闭抽屉通过 `×` 或点击徽章二次切换\n\n**为什么不做\"artifact 产出自动打开\"**：打断用户正在读的消息流，反模式。\n\n---\n\n## 4. 技术架构\n\n### 4.1 新增 / 修改组件\n\n| 文件 | 动作 | 说明 |\n|------|------|------|\n| `components/ask-anywhere/FloatingBall.tsx` | **重写** | 从 view 切换器改为弹层 open/close 开关 |\n| `components/ask-anywhere/AskAnywherePopover.tsx` | **新增** | 弹层容器，复用 ChatView；含 session dropdown / + / ↗ / × |\n| `components/ask-anywhere/AskAnywhereHost.tsx` | **新增** | 抽象出 conversation 状态管理 hook（`useAskAnywhereSession`），被 popover 和 view 共享 |\n| `views/AskAnywhereView.tsx` | **重写** | 两列布局；挂载 ContextBar / StageDrawer |\n| `views/ask-anywhere/ContextPanel.tsx` | **替换** | 改名为 `ContextBar.tsx`，改成顶部折叠条 |\n| `views/ask-anywhere/StagePanel.tsx` | **改造** | 改名为 `StageDrawer.tsx`，改成按需抽屉 |\n| `components/Sidebar/WorkspaceSidebar.tsx` | **微调** | Ask Anywhere 置顶 + 独立分组 + 图标升级 |\n| `store/askAnywhere.ts` | **新增（可选）** | 如果需要 Zustand 管理 popover open 状态 + lastActiveId（否则 useState + localStorage 够） |\n| `App.tsx` | **微调** | 挂载 AskAnywherePopover |\n\n### 4.2 `useAskAnywhereSession` Hook 抽取\n\n当前 `AskAnywhereView.tsx` 165-219 行的 conversation 加载 / 事件订阅 / send action 逻辑，**抽出到一个 hook 里**，让 popover 和 view 都用同一套：\n\n```ts\nfunction useAskAnywhereSession(activeId: string | null) {\n  // sessions list, events, isLoading, stage\n  // handleNew, handleAction, handleArtifactAction\n  // useEffect: hydrate conversation, subscribe runtime/stage events\n  return { sessions, events, isLoading, stage, handleNew, handleAction, ... };\n}\n```\n\n好处：\n- 双容器数据一致性靠复用同一个 hook 保证\n- 未来全屏模式接入也是同一 hook\n- 单元测试更容易\n\n### 4.3 弹层状态管理\n\n```ts\n// store/askAnywhere.ts（或直接 Zustand slice 挂在 usePara/useWorkspace）\ninterface AskAnywhereSlice {\n  popoverOpen: boolean;\n  lastActiveId: string | null;   // persist to localStorage\n  togglePopover: () => void;\n  setLastActiveId: (id: string) => void;\n}\n```\n\n或者更简单：popover open 状态用 React `useState` 挂在 App.tsx，lastActiveId 直接读写 `localStorage`（无需 store）。**本期选后者**，避免为了 MVP 引入新 store。\n\n### 4.4 Stage 触发徽章\n\n- ChatView 本期**不改**，徽章作为 `AskAnywhereView` 的一部分悬浮在 ChatView 右上角（absolute 定位）\n- `stage.artifacts.length > 0` → 显示徽章；为 0 → 隐藏\n- 新增 artifact 时（通过订阅 stage event 的 diff）→ 加 `animate-pulse` 1-2s\n- 抽屉用 `fixed right-0 top-[header-height] w-80 h-full` + `translate-x` 过渡\n\n### 4.5 悬浮球在全页的隐藏逻辑\n\n当前代码：\n\n```6:12:src/renderer/src/components/ask-anywhere/FloatingBall.tsx\nexport function FloatingBall(): JSX.Element | null {\n  const view = usePara((s) => s.view);\n  const setView = usePara((s) => s.setView);\n\n  if (view.kind === 'askAnywhere') return null;\n```\n\n**保留此逻辑**（全页时悬浮球消失避免自指）。新版本里 onClick 改为 `togglePopover()`。\n\n---\n\n## 5. 实施步骤（建议 PR 拆分）\n\n| 步骤 | 内容 | 可独立合并 |\n|------|------|------------|\n| 1 | 抽 `useAskAnywhereSession` hook，view 重构为使用它（**纯重构，不改 UI**） | ✅ |\n| 2 | 新增 `AskAnywherePopover` + 改造 `FloatingBall` onClick；App.tsx 挂载 | ✅ |\n| 3 | `WorkspaceSidebar` 视觉强化 | ✅ |\n| 4 | 全页两列布局（ContextBar 折叠 + 主 pane）；`ContextPanel → ContextBar` | ✅ |\n| 5 | Stage 徽章 + 抽屉（`StagePanel → StageDrawer`） | ✅ |\n\n每步之后跑：\n\n```bash\nnpm run typecheck\nnpm run lint -- --quiet\nnpm test\n```\n\n---\n\n## 6. 风险与缓解\n\n| 风险 | 影响 | 缓解 |\n|------|------|------|\n| 弹层和全页并发打开 runtime event 重复处理 | 低（极罕见） | 两侧各自订阅 + 乐观渲染；后端是唯一事实源，最终一致 |\n| localStorage `lastActiveId` 指向已删除 conversation | 中 | 打开弹层时 `getConversation(id)` 返回 null 则 fallback 到列表第一条或空态 |\n| ContextBar 收起后用户忘记有 Context 概念 | 低 | 数量徽章\"3 anchors · 4 skills\"做提示 |\n| Stage 抽屉叠在 ChatView 上阻挡阅读 | 中 | 抽屉打开时给 ChatView 加 `md:pr-80` 腾出空间（桌面端），小屏保持 overlay |\n| 硬编码 skills 继续误导用户 | 中 | ContextBar 展开时明确标注\"（默认集，动态化待实现）\" |\n\n---\n\n## 7. Checklist（实施完成前自查）\n\n**产品**：\n- [ ] 悬浮球点击 = 弹层开关（不再跳转）\n- [ ] 弹层顶部下拉能切换会话\n- [ ] 弹层\"+\"新建会话\n- [ ] 弹层\"↗\"推到全页，全页默认打开同一会话\n- [ ] 左栏 Ask Anywhere 视觉上独立突出\n- [ ] 全页默认两列（Session + Chat）\n- [ ] ContextBar 默认收起，展开显示 anchors/skills\n- [ ] Stage 徽章仅在非空时显示\n- [ ] Stage 抽屉按需打开/关闭\n\n**技术**：\n- [ ] `useAskAnywhereSession` hook 被弹层和全页共用\n- [ ] localStorage `ask-anywhere.last-active-id` 正确读写\n- [ ] 弹层和全页订阅同一 conversation 的 event 无冲突\n- [ ] `typecheck / lint / test` 全绿\n- [ ] `tests/chat_view.test.ts` 受影响时同步更新\n\n**观察**：\n- [ ] 实际 dog-food 1-2 天后评估是否需要弹层位置记忆\n- [ ] 记录 Stage 抽屉打开率（后续决定默认展开策略）\n","toolExplanation":"写入 plan 文档"})
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-28-ask-anywhere-ux/direction-confirmation.md","content":"# Ask-Anywhere UX — 方向确立对话记录\n\n**日期**：2026-04-28\n**参与方**：Ryan / AI (project-brainstorm)\n**产物**：`docs/plans/2026-04-28-ask-anywhere-ux-revamp.md`\n\n---\n\n## 起因\n\n用户打开当前 Ask-Anywhere 页面，判断布局\"肯定不对\"：\n\n1. 点击悬浮球出的是全屏页面，不是预期的\"右下角弹窗\"\n2. （用户以为）左栏没有 Ask Anywhere 入口\n\n---\n\n## AI 勘误与事实核对\n\n1. **左栏其实已经有 Ask Anywhere 入口**（`WorkspaceSidebar.tsx:14`），但视觉上和其他 8 个同级项完全并列，`✨` 图标识别度低——用户没注意到 ≈ 不存在\n2. **悬浮球代码已存在**（`FloatingBall.tsx`），但行为是 view 切换器（点击→跳转全页），不是弹层\n3. 对照 ADR-015 D-2：\"左侧栏一级入口：全功能页面 / 悬浮球：右下角极简对话框 / 未来全屏模式\"——**第二形态（弹层）从未被真正落地**\n\n记忆 `兴趣爱好/Orbit-Ask-Anywhere/布局优化` 已记录全页布局问题（4 列过密 + skills 硬编码 + stage 空也占位），与代码现状完全吻合。\n\n---\n\n## 三个关键决策\n\n### D-1: 弹层 = 单 conversation 的迷你容器（复用 ChatView）\n\n用户原话：\"弹层里就是一个conversation，可以直接复用chat的组件，保证应用内的chat交互和ui，渲染体验都一致\"\n\n**确立规则**：\n- 弹层不重新实现 chat UI，100% 复用 `components/chat/ChatView.tsx`\n- 会话和全页通过 `window.orbit.chat.*` 后端持久化 + `localStorage.last-active-id` 联通\n- 打开默认恢复上次会话；顶部下拉切换；`+` 新建；`↗` 推到全页\n\n### D-2: 弹层里不放 Context / Stage\n\nAI 提议 → 用户无异议通过。\n\n**理由**：弹层是\"Capture 强度\"的轻量入口；需要深入看上下文/产物就展开到全页（\"Distill 强度\"）。这和 BASB 的 CODE 节奏对齐，也直接解决用户\"布局不对\"的核心痛点——不要重复堆信息。\n\n### D-3: 全页从四列压成两列 + 顶部 Context 条 + 按需 Stage 抽屉\n\n用户原话：\"全页重设计按你说的来\"\n\n**关键拆解**：\n- Context 从常驻列 → 顶部可折叠条（默认收起，显示数量汇总）\n- Stage 从常驻列 → 按需抽屉（仅 artifact 非空时出现徽章；点击打开）\n- Stage 不自动弹出（避免打断阅读流）\n\n### 范围边界：🅱️（入口 + 全页布局重构）\n\n显式不在本期：\n- Skill 意图路由动态化（ADR-015 D-6）\n- Planner Agent 退役（ADR-015 D-3）\n- Channel 路由统一（ADR-015 D-5）\n\n---\n\n## 未定（open questions，进 plan checklist）\n\n1. 弹层位置是否允许拖动/记忆 → 本期 No，dog-food 后评估\n2. 弹层默认尺寸 → 暂定 380×560，小屏自适应\n3. Stage 徽章的\"脉冲提示\"用 `animate-pulse` 还是更克制的 dot indicator → 实施时定\n\n---\n\n## 下一步\n\n1. plan 文档 `2026-04-28-ask-anywhere-ux-revamp.md` 已写入\n2. 建议 PR 拆成 5 步（见 plan §5），步骤 1（hook 抽取）可先合入作为纯重构\n3. **不需要**新 ADR——本期是 ADR-015 D-2 的**落地**而非修订；如果 dog-food 后决定改变弹层语义（比如改为无状态 Spotlight 模式），再写 ADR 修订 D-2\n","toolExplanation":"记录本次对话的 thinking trail"})

---

## [Tool] 2026-04-28T05:49:27.511Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-28-ask-anywhere-ux/.session.json","size":1080,"append":false}

---

## [Tool] 2026-04-28T05:49:27.512Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-28-ask-anywhere-ux-revamp.md","size":15281,"append":false}

---

## [Tool] 2026-04-28T05:49:27.512Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-28-ask-anywhere-ux/direction-confirmation.md","size":3238,"append":false}

---

## [Assistant] 2026-04-28T05:49:33.039Z
最后追加 changelog + 更新 ROADMAP 条目，让这份计划能被后续 Evolve 会话/实施 agent 找到。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/CHANGELOG.md","limit":15,"toolExplanation":"检查 changelog 头部格式"})

---

## [Tool] 2026-04-28T05:49:33.047Z
     1|# Changelog
     2|
     3|> 倒序记录（最新在最前）。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
     4|
     5|## [Unreleased]
     6|
     7|### Added
     8|
     9|- **Gateway Telegram 可用化**：参照 openclaw 的 channel lifecycle 思路，把原本只会本地切状态的 Gateway 骨架升级为真实 Telegram Bot 长轮询运行时；支持 auto-start、关闭窗口后保持本地主进程运行、绑定码授权、未绑定用户拒绝、Telegram 回执、重连退避、channel 状态/错误/log 展示，并继续把 URL / `#thought` / 普通文本分别路由到 Library、Thoughts、Ask-Anywhere。
    10|- **Phase 2 Resource 主题工作站**：补充 `06-resource-workstation.md`，新增 Resource shared contract、main-process store/IPC、preload API、Resources 工作区入口、TraceableEvent/Timeline 投影和 Resource store 测试；支持创建主题工作站、六段目录、链接引用、手动 engagement、从 Notes tags 自下而上生成 Resource suggestions。
    11|- **Phase 2 Knowledge Stack 一次性落地**：新增 Notes 一级入口（Markdown frontmatter CRUD / 搜索 / 归档）、Library / Feeds / Knowledge Base / Scheduled / Timeline / Gateway 工作区入口；补齐 Notes、KB 导入/激活、定时任务、Daily Timeline、Ask-Anywhere Stage Artifact、Gateway channel 管理的 IPC/preload/renderer 闭环，并把 Phase 2 事件接入 TraceableEvent 与 Timeline 投影。
    12|- **Chat 解耦重构 P1-P5 落地差距收尾**：
    13|  - **P1 Conversation 一等公民**：TaskOrchestrator 在 `getOrCreateConversation` / `appendTurn` 同时双写到新 ConversationStore（anchor:task）；启动时一次性迁移旧 `.orbit/orchestration/conversations/<taskUid>.json` 到新格式（幂等）；新增 Conversations 中心视图（左侧统一对话列表 + 右侧只读 ChatView 历史回放），Sidebar 增加「Conversations」入口。
    14|  - **P3 AppBus 闭环**：ConversationOrchestrator 在 `createConversation` / `appendTurn` / `addAnchor` / `endConversation` 上发布 TraceableEvent（`conversation.started/turn.added/anchor.added/ended`），`TRACEABLE_EVENT_SOURCES` 增加 `'conversation'`。
    15|  - **P4 Planner 退役**：Ask-Anywhere system prompt 优先读取 vault 内 `.orbit/skills/ask-anywhere-planning.md`，找不到时回退到内置默认。

(Showing lines 1-15 of 194.)

---

## [Assistant] 2026-04-28T05:49:44.273Z
### Tool Calls:
- **replace_in_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/CHANGELOG.md","old_str":"## [Unreleased]\n\n### Added\n\n- **Gateway Telegram 可用化**","new_str":"## [Unreleased]\n\n### Planned\n\n- **Ask-Anywhere UX Revamp** (plan `2026-04-28-ask-anywhere-ux-revamp.md`)：把悬浮球从\"跳转开关\"改造成真正的就地弹层对话框（复用 ChatView，顶部会话下拉 + 新建 + 展开到全页），并把全页从四列（Session/Context/Chat/Stage）压成两列 + 顶部可折叠 Context 条 + 按需 Stage 抽屉。落地 ADR-015 D-2 的弹层形态，不扩展 D-3/D-5/D-6。\n\n### Added\n\n- **Gateway Telegram 可用化**","toolExplanation":"在 changelog 添加本次 planned 条目"})
- **replace_in_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/ROADMAP.md","old_str":"### Phase 4 后续方向\n\n| 方向 | 说明 | 原编号 |\n|------|------|--------|\n| **Sandbox ExecutionContext** | 非代码项目（research / writing）的执行环境，补齐功能断层 | 原 P2 |","new_str":"### Phase 4 后续方向\n\n| 方向 | 说明 | 原编号 |\n|------|------|--------|\n| **Ask-Anywhere UX Revamp** | 悬浮球→就地弹层（复用 ChatView）+ 全页两列布局重构（折叠 Context / 按需 Stage 抽屉）；落地 ADR-015 D-2。Plan: `2026-04-28-ask-anywhere-ux-revamp` | 新增 |\n| **Sandbox ExecutionContext** | 非代码项目（research / writing）的执行环境，补齐功能断层 | 原 P2 |","toolExplanation":"将本次方向纳入 ROADMAP"})

---

## [Tool] 2026-04-28T05:49:44.283Z
{"replaced":true,"matchCount":1}

---

## [Tool] 2026-04-28T05:49:44.284Z
{"replaced":true,"matchCount":1}

---

## [Assistant] 2026-04-28T05:50:05.025Z
规划落地完成。产出物：

| 文件 | 作用 |
|------|------|
| `docs/plans/2026-04-28-ask-anywhere-ux-revamp.md` | **主 plan**：产品契约 + 技术架构 + 5 步 PR 拆分 + checklist |
| `docs/thinking-trail/2026-04-28-ask-anywhere-ux/direction-confirmation.md` | 本次对话的决策留痕（D-1/D-2/D-3） |
| `docs/thinking-trail/2026-04-28-ask-anywhere-ux/.session.json` | 会话状态（给未来 Evolve 会话接续用） |
| `CHANGELOG.md` | 新增 "Planned" 小节记录本次计划 |
| `docs/ROADMAP.md` | "Phase 4 后续方向"表头位置添加条目 |

## Plan 要点速览

**弹层**（`AskAnywherePopover` 新组件，380×560 右下角）：
- 复用 `ChatView` 组件，保证渲染/交互一致
- Header: `[▼会话下拉] [+新建] [↗展开到全页] [×]`
- 默认恢复上次会话（`localStorage.ask-anywhere.last-active-id`）
- 弹层外点击不关闭；`Esc` 关闭；全页视图下悬浮球隐藏

**全页**（重写 `AskAnywhereView`）：
- 两列：Session Sidebar 240 + Main Pane
- `ContextPanel.tsx` → `ContextBar.tsx`：顶部折叠条，默认收起只显示 "Context · 3 anchors · 4 skills"
- `StagePanel.tsx` → `StageDrawer.tsx`：非空时 ChatView 右上角出现徽章，点击打开抽屉；不自动弹

**联通机制**：抽出 `useAskAnywhereSession(activeId)` hook，弹层和全页共享同一套 conversation 加载 / event 订阅 / sendAction 逻辑。

**左栏**：Ask Anywhere 置顶 + 独立分组 + 图标升级（比如换成 `MessageCircleQuestion` lucide icon 或保持 ✨ 但加底色强化）。

## 可独立合并的 5 步 PR

1. 纯重构：抽 `useAskAnywhereSession` hook，view 切换到使用它（不改 UI）
2. 新增 `AskAnywherePopover` + 改 `FloatingBall` onClick + `App.tsx` 挂载
3. `WorkspaceSidebar` 视觉强化
4. 全页两列布局 + `ContextBar`
5. `StageDrawer` + 徽章

---

## Checklist 自评

**已覆盖**：入口语义、弹层行为契约、全页布局结构、数据联通策略、组件抽取、实施步骤、风险识别。

**未覆盖/存疑**（已写进 `.session.json` 的 pending_questions，不阻塞实施）：
1. 弹层位置/尺寸是否允许记忆 → 本期 No，dog-food 后再议
2. Stage 徽章"脉冲提示"的视觉强度 → 实施时定
3. ContextBar 展开后的 skills 显示仍是硬编码默认集 → 明确标注"（动态化待实现）"

**建议**：可以直接进 PR 实施阶段。如果你想先把"悬浮球弹层"（步骤 2）单独做出来 dog-food 一两天再动全页，也完全支持——我按这份 plan 的步骤拆分做过可独立合并性设计。

你想现在就开始动手（我可以从步骤 1 的 hook 抽取开始），还是先消化方案，我等你下一次会话再接着做？

---

## [User] 2026-04-28T06:37:04.164Z
<attachments>
The user has attached the following files/resources. Process them as needed to fulfill the request:
- /Users/ryanbzhou/Developer/vibe-coding/boxai/.uploads/1777358224159-clipboard_1777357923760.png (image)
</attachments>

[使用Skills: project-brainstorm] 现在已经做完了上面说的ask-anywhere体验优化，下一阶段我想聊聊为整个应用增加一个快速LLM调用的能力，背景是现在应用有好多地方展示的内容都是语义化很差的原始内容，比如timeline里的event，只说了写了个笔记，创建了个对话，但用户真正想在这里看见的是事情的摘要，event是原始的内容没关系，但展示给用户应该过一层llm做语义化输出。再比如ask-anywhere的会话标题，也应该是会话的内容摘要。除了这些摘要以外，应用内肯定还有很多地方需要过一层llm来达到更好的体验的地方。所以我需要做一个轻量的LLM能力，不需要多轮对话，只需要输入一个prompt，输出一个结果。需要做一个通用的LLM提供商接入层，除了这里会用，以后做内置runtime 多轮对话agent，也会用到。还需要一个prompt组装层，给llm层提供prompt。除了这些想法，你可以再结合项目现状和未来展望，扩展一些对于这个能力还能做哪些事

---

## [Assistant] 2026-04-28T06:37:17.261Z
我先读当前截图 + 项目里已有的 runtime/agent 层代码，确认"轻量 LLM 调用"现在到底有没有雏形，再开始扩展。

### Tool Calls:
- **image**({"image":"/Users/ryanbzhou/Developer/vibe-coding/boxai/.uploads/1777358224159-clipboard_1777357923760.png","task":"general","prompt":"详细描述这个界面：左侧、中间、右侧分别展示什么？是否涉及 Timeline？event 条目的文本内容形态如何（是原始描述还是摘要）？","toolExplanation":"理解截图上下文"})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src","pattern":"generateTitle|summari[sz]e|\\bllm\\b|LlmProvider|LLMProvider|callLlm|callLLM|oneShot|one_shot|anthropic|openai|gemini|claude-cli|claudeCli","outputMode":"files_with_matches","caseSensitive":false,"headLimit":30,"toolExplanation":"找现有 LLM/摘要调用点"})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src","pattern":"distill|Distill|review.*generate|dailyReview|daily_review","outputMode":"files_with_matches","caseSensitive":false,"headLimit":30,"toolExplanation":"找 Distill/Review 生成文本的地方"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main","depth":2,"offset":0,"limit":200,"toolExplanation":"看 main 进程目录结构"})

---

## [Tool] 2026-04-28T06:37:26.408Z
好的，这是对您提供的图片的详细分析和描述。

---

### 1. 图片类型
这是一个用户界面（UI）截图，具体来说是一个名为“Daily Timeline”的日志或事件时间线视图。

### 2. 主要内容
这张图片展示了一个名为“Daily Timeline”的应用程序或工具的界面。该界面以时间顺序（从上到下）列出了一系列事件（events），每个事件都包含一个图标、一个标题、一个时间戳、一个事件类型标识符和一个描述性文本。整个列表被组织在“NIGHT”（夜晚）这个标题下，表明这些事件都发生在同一天的夜晚时段。

### 3. 文字内容
图片中的关键文字信息如下：
*   **页面标题**: `Daily Timeline`
*   **副标题**: `Layer 1/2 life log built from TraceableEvent.`
*   **时间选择器**: `2026/04/28`
*   **功能按钮**: `Summarize`, `Export`
*   **事件列表**:
    *   `kb welcome_analysis_completed`: `Knowledge base is ready`
    *   `Captured thought`: `New thought`
    *   `Scheduled task ran`: `Scheduled task executed: scheduled-ffe062be-fd86-4892-9069-cbc9d5051bde`
    *   `conversation started`: `Ask Anywhere`
    *   `conversation started`: `Ask Anywhere`
    *   `conversation started`: `Task file:01_Projects/twitter/.orbit/agent/tasks/20260428_task.md`
    *   `conversation started`: `11:35:15, conversation started` (部分可见)

### 4. 其他信息
*   **界面布局**: 界面布局清晰，顶部是标题和控制区域，下方是主要的事件列表。
*   **事件图标**: 每个事件条目左侧都有一个图标，用于直观地表示事件的类型。例如，大脑图标代表知识库分析，云朵图标代表捕捉想法，闹钟图标代表计划任务，对话气泡图标代表会话开始。
*   **事件结构**: 每个事件条目都遵循一个标准的结构：图标、事件标题、时间戳和事件类型、事件描述。
*   **时间线**: 这是一个典型的时间线（Timeline）界面，事件按时间顺序排列。

---

### 针对用户问题的详细回答

**1. 详细描述这个界面：左侧、中间、右侧分别展示什么？**

*   **左侧**: 主要展示事件的**图标**。这些图标是事件类型的视觉标识，例如大脑、云朵、闹钟和对话气泡。
*   **中间**: 这是界面的主体部分，展示了事件的**详细信息**。它包含事件的标题、时间戳、事件类型和描述性文本。
*   **右侧**: 界面的右侧是**功能按钮区**。它包含一个日期选择器（`2026/04/28`）、一个图层切换选项（`Layer 2`）以及两个操作按钮（`Summarize` 和 `Export`）。

**2. 是否涉及 Timeline？**

是的，这个界面的核心就是一个**Timeline**（时间线）。它将一系列事件按照时间顺序（从上到下）进行组织和展示，用户可以清晰地看到在特定日期（2026年4月28日）内，系统或用户活动的先后顺序。

**3. event 条目的文本内容形态如何（是原始描述还是摘要）？**

event 条目的文本内容形态是**摘要**。

*   **标题**: 每个事件都有一个简洁的标题，概括了事件的核心内容，例如 `kb welcome_analysis_completed` 或 `Scheduled task ran`。
*   **描述**: 在标题下方，有一行更详细的描述，但通常是对事件的总结或关键信息的提取，而不是原始的、完整的日志文本。例如，`Scheduled task ran` 的描述是 `Scheduled task executed: scheduled-ffe062be-fd86-4892-9069-cbc9d5051bde`，这只是一个执行成功的摘要，而不是任务执行过程中的所有原始日志。同样，`conversation started` 的描述是 `Ask Anywhere` 或具体的文件路径，这些都是会话的摘要信息。

---

## [Tool] 2026-04-28T06:37:26.409Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/agent/cost_report.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/agent/ipc.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/agent/runner.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/agent/tokens.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/ask-anywhere/ipc.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/ask-anywhere/orchestrator.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/git/checks.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/inbox/index.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/inbox/store.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/inbox/types.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/dispatch.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/planner_agent.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/runtime.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/switch_runtime.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/project_agent_context.ts

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-28T06:37:26.410Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/agent/ipc.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/capture/ipc.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/capture/library/service.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/dashboard/service.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/distill/distill.ts

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-28T06:37:26.410Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/
- __tests__/
- activity/
- activity/emitter.ts (3.0KB)
- activity/index.ts (618B)
- activity/ipc.ts (524B)
- activity/query.ts (4.7KB)
- activity/store.ts (2.6KB)
- activity/types.ts (257B)
- agent/
- agent/adapter/
- agent/budget_watch.ts (8.0KB)
- agent/claude_sessions.ts (10.6KB)
- agent/cli.ts (2.7KB)
- agent/codex_sessions.ts (3.5KB)
- agent/context.ts (4.8KB)
- agent/cost_report.ts (3.8KB)
- agent/eventRouter.ts (1.6KB)
- agent/fallback/
- agent/hooks/
- agent/ipc.ts (26.1KB)
- agent/onboarding.ts (1.8KB)
- agent/persona.ts (4.3KB)
- agent/pool.ts (2.6KB)
- agent/reattach.ts (2.0KB)
- agent/ringBuffer.ts (2.1KB)
- agent/runner.ts (26.9KB)
- agent/setup/
- agent/shell/
- agent/terminal_sessions.ts (9.0KB)
- agent/tokens.ts (9.5KB)
- approval/
- approval/actions.ts (1.5KB)
- approval/index.ts (1.3KB)
- approval/ipc.ts (1.3KB)
- approval/service.ts (6.7KB)
- approval/state.ts (1.1KB)
- approval/store.ts (6.3KB)
- approval/sync.ts (1.6KB)
- approval/types.ts (617B)
- area.ts (7.7KB)
- area_ipc.ts (4.1KB)
- ask-anywhere/
- ask-anywhere/ipc.ts (3.8KB)
- ask-anywhere/orchestrator.ts (10.8KB)
- ask-anywhere/stage-ipc.ts (2.5KB)
- ask-anywhere/stage-store.ts (3.9KB)
- auto_runner/
- auto_runner/dispatcher.ts (15.4KB)
- auto_runner/event_bridge.ts (4.4KB)
- auto_runner/index.ts (417B)
- auto_runner/ipc.ts (1.1KB)
- auto_runner/ready_set.ts (2.2KB)
- auto_runner/scheduler.ts (1.9KB)
- auto_runner/settings.ts (683B)
- capture/
- capture/common.ts (1.8KB)
- capture/feed/
- capture/index.ts (524B)
- capture/ipc.ts (6.7KB)
- capture/library/
- capture/shortcut.ts (179B)
- capture/thoughts/
- cli_server/
- cli_server/errors.ts (655B)
- cli_server/handlers.ts (23.6KB)
- cli_server/index.ts (2.3KB)
- cli_server/registry.ts (906B)
- cli_server/socket_path.ts (150B)
- content_hash.ts (906B)
- conversation/
- conversation/ipc.ts (2.0KB)
- conversation/migration.ts (2.7KB)
- conversation/orchestrator.ts (3.4KB)
- conversation/store.ts (6.1KB)
- crash.ts (3.9KB)
- dashboard/
- dashboard/ipc.ts (1.4KB)
- dashboard/service.ts (8.6KB)
- dependencies/
- dependencies/cascade.ts (4.9KB)
- dependencies/graph.ts (5.5KB)
- dependencies/index.ts (52B)
- dev/
- dev/lifecycle-runner.ts (14.7KB)
- distill/
- distill/distill.ts (9.1KB)
- distill/ipc.ts (6.0KB)
- distill/persona.ts (630B)
- distill/prompt.ts (5.4KB)
- distill/wakeup.ts (2.5KB)
- env/
- env/gh.ts (1.5KB)
- env/install_lock.ts (4.0KB)
- env/ipc.ts (1.5KB)
- env/ports.ts (2.4KB)
- events/
- events/bus.ts (3.3KB)
- events/ipc.ts (1.1KB)
- events/run-recorder.ts (2.2KB)
- events/store.ts (3.0KB)
- execution/
- execution/factory.ts (1.7KB)
- execution/index.ts (389B)
- execution/sandbox.ts (1.0KB)
- execution/types.ts (647B)
- execution/worktree.ts (947B)
- frontmatter.ts (3.0KB)
- fs.ts (38.5KB)
- gateway/
- gateway/ipc.ts (3.6KB)
- gateway/runtime.ts (7.6KB)
- gateway/store.ts (8.5KB)
- gateway/telegram.ts (7.3KB)
- git/
- git/check_cache.ts (1.9KB)
- git/checks.ts (5.9KB)
- git/diff.ts (7.3KB)
- git/ipc.ts (11.6KB)
- git/log.ts (791B)
- git/queue.ts (1.6KB)
- git/status.ts (8.2KB)
- git/worktree.ts (11.0KB)
- github/
- github/ipc.ts (3.4KB)
- github/service.ts (23.4KB)
- inbox/
- inbox/events.ts (612B)
- inbox/index.ts (1.6KB)
- inbox/ipc.ts (1.7KB)
- inbox/proposal.ts (3.2KB)
- inbox/proposal_sync.ts (2.7KB)
- inbox/service.ts (9.2KB)
- inbox/store.ts (10.5KB)
- inbox/types.ts (999B)
- index.ts (15.0KB)
- index_store.ts (4.8KB)
- knowledge-base/
- knowledge-base/ipc.ts (3.1KB)
- knowledge-base/store.ts (9.9KB)
- migrations/
- migrations/v2_task_authorization.ts (7.2KB)
- migrations.ts (15.9KB)
- note/
- note/ipc.ts (3.2KB)
- note/store.ts (12.0KB)
- orchestration/
- orchestration/conversation.ts (16.2KB)
- orchestration/dispatch.ts (20.3KB)
- orchestration/dispatch_completion.ts (3.7KB)
- orchestration/event_bridge.ts (2.3KB)
- orchestration/ipc.ts (6.4KB)
- orchestration/planner.ts (9.2KB)
- orchestration/planner_agent.ts (18.1KB)
- orchestration/roles.ts (7.6KB)
- orchestration/runtime.ts (6.2KB)
- orchestration/session.ts (1.3KB)
- orchestration/storage.ts (2.4KB)
- orchestration/switch_runtime.ts (6.4KB)
- orchestration/task_graph.ts (1.5KB)
- pathGuard.ts (723B)
- path_bootstrap.ts (1.5KB)
- path_bootstrap_init.ts (90B)
- project.ts (16.4KB)
- project_agent_context.ts (16.4KB)
- project_bridges.ts (2.9KB)
- project_config.ts (6.0KB)
- project_fs.ts (2.4KB)
- project_lifecycle.ts (2.5KB)
- project_session_history.ts (3.4KB)
- r6_ipc.ts (4.2KB)
- refmap.ts (7.1KB)
- resource/
- resource/ipc.ts (4.4KB)
- resource/store.ts (19.9KB)
- review/
- review/daily.ts (14.7KB)
- scheduled-task/
- scheduled-task/ipc.ts (3.6KB)
- scheduled-task/store.ts (10.5KB)
- search.ts (1.8KB)
- settings.ts (2.5KB)
- task-state/
- task-state/reducer.ts (4.1KB)
- task.ts (3.4KB)
- task_mutate.ts (1.8KB)
- task_relink.ts (4.7KB)
- task_sections.ts (5.4KB)
- tasks.ts (10.0KB)
- templates/
- templates/blank.ts (573B)
- templates/common.ts (2.2KB)
- templates/index.ts (3.2KB)
- templates/research.ts (622B)
- templates/vision-area.ts (37.2KB)
- templates/web-app.ts (625B)
- templates/writing.ts (621B)
- terminal/
- terminal/pty_manager.ts (12.3KB)
- timeline/
- timeline/ipc.ts (1.9KB)

... and 16 more files

---

## [Assistant] 2026-04-28T06:37:35.217Z
非常关键的发现：**项目已经在多处"偷偷地"调用 LLM 了**——但是**没有统一抽象**。我把核心几个都扫一眼，看看现状到底有多零散。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/distill/distill.ts"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/review/daily.ts","limit":100})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/ask-anywhere/orchestrator.ts"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/planner_agent.ts","limit":80})

---

## [Tool] 2026-04-28T06:37:35.228Z
     1|import { promises as fs } from 'node:fs';
     2|import path from 'node:path';
     3|import { nanoid } from 'nanoid';
     4|import { ORBIT_DIR, ORBIT_GIT_LOG, ORBIT_LOGS_DIR } from '@shared/constants';
     5|import * as frontmatter from '../frontmatter';
     6|import { toPosix, vaultRel } from '../pathGuard';
     7|import type { VaultSession } from '../fs';
     8|import type { TaskRecord } from '@shared/schemas';
     9|import type { AgentEvent, CostRecord } from '@shared/agent';
    10|import {
    11|  composeDistillPrompt,
    12|  parseDistillResponse,
    13|  renderDistillBody,
    14|  type GitLogEntry,
    15|  type RelatedFile
    16|} from './prompt';
    17|import { DISTILL_PERSONA } from './persona';
    18|import {
    19|  appendCostRecord,
    20|  buildCostRecord,
    21|  estimateTokens,
    22|  readCostRecords,
    23|  estimateUsd
    24|} from '../agent/tokens';
    25|
    26|export interface DistillResult {
    27|  resourcePath: string;
    28|  resourceRelPath: string;
    29|  resourceUid: string;
    30|  runId: string;
    31|}
    32|
    33|/**
    34| * Runner abstraction so tests can drive the distillation without
    35| * spawning `claude`. Returns the full final assistant text once the
    36| * run is complete.
    37| */
    38|export interface DistillRunner {
    39|  run(args: {
    40|    prompt: string;
    41|    cwd: string;
    42|    vaultPath: string;
    43|    title: string;
    44|  }): Promise<{ runId: string; finalText: string; events?: AgentEvent[] }>;
    45|  cancel?(runId: string): Promise<void>;
    46|}
    47|
    48|export interface DistillDeps {
    49|  session: VaultSession;
    50|  runner: DistillRunner;
    51|  now?: () => Date;
    52|  /** Injected so tests can bypass monthly cost file randomness. */
    53|  writeResource?: (abs: string, content: string) => Promise<void>;
    54|}
    55|
    56|const shortUid = (uid: string): string => (uid || '').slice(0, 8) || nanoid(8);
    57|
    58|function slugify(title: string): string {
    59|  return (
    60|    title
    61|      .toLowerCase()
    62|      .replace(/[^a-z0-9]+/g, '-')
    63|      .replace(/^-+|-+$/g, '')
    64|      .slice(0, 60) || 'project'
    65|  );
    66|}
    67|
    68|async function readGitLog(vault: string): Promise<GitLogEntry[]> {
    69|  const p = path.join(vault, ORBIT_DIR, ORBIT_LOGS_DIR, ORBIT_GIT_LOG);
    70|  try {
    71|    const raw = await fs.readFile(p, 'utf8');
    72|    const out: GitLogEntry[] = [];
    73|    for (const line of raw.split(/\r?\n/)) {
    74|      if (!line.trim()) continue;
    75|      try {
    76|        const obj = JSON.parse(line) as GitLogEntry;
    77|        if (obj && typeof obj === 'object' && typeof obj.at === 'string') {
    78|          out.push(obj);
    79|        }
    80|      } catch {
    81|        // ignore bad line
    82|      }
    83|    }
    84|    return out;
    85|  } catch {
    86|    return [];
    87|  }
    88|}
    89|
    90|async function collectRelatedFiles(
    91|  session: VaultSession,
    92|  projectUid: string
    93|): Promise<RelatedFile[]> {
    94|  const out: RelatedFile[] = [];
    95|  for (const entry of session.index.all()) {
    96|    if (entry.relPath.endsWith('.md') === false) continue;
    97|    try {
    98|      const abs = path.join(session.vault, entry.relPath);
    99|      const raw = await fs.readFile(abs, 'utf8');
   100|      const { data, body } = frontmatter.read(raw);
   101|      const pu =
   102|        typeof data['project_uid'] === 'string' ? data['project_uid'] : undefined;
   103|      const uid = typeof data['uid'] === 'string' ? data['uid'] : undefined;
   104|      // Skip the archived project itself; include everything tagged to it.
   105|      if (uid === projectUid) continue;
   106|      if (pu !== projectUid) continue;
   107|      const title =
   108|        typeof data['title'] === 'string'
   109|          ? data['title']
   110|          : path.basename(entry.relPath, '.md');
   111|      out.push({ relPath: entry.relPath, title, body });
   112|    } catch {
   113|      // skip unreadable
   114|    }
   115|  }
   116|  return out;
   117|}
   118|
   119|function collectClosedTasks(
   120|  session: VaultSession,
   121|  projectUid: string
   122|): TaskRecord[] {
   123|  return session.tasks
   124|    .allTasks()
   125|    .filter((t) => t.project_uid === projectUid && t.status === 'done');
   126|}
   127|
   128|function withinRange(at: string, from?: string, to?: string): boolean {
   129|  if (from && at < from) return false;
   130|  if (to && at > to) return false;
   131|  return true;
   132|}
   133|
   134|async function readCostLifecycle(
   135|  vault: string,
   136|  lifecycle: { from?: string; to?: string }
   137|): Promise<CostRecord[]> {
   138|  // Walk current + previous 3 months; sufficient for typical project scopes.
   139|  const out: CostRecord[] = [];
   140|  const seen = new Set<string>();
   141|  const now = new Date();
   142|  for (let i = 0; i < 4; i++) {
   143|    const at = new Date(now);
   144|    at.setUTCMonth(at.getUTCMonth() - i);
   145|    const recs = await readCostRecords(vault, at);
   146|    for (const r of recs) {
   147|      const key = `${r.runId}:${r.at}`;
   148|      if (seen.has(key)) continue;
   149|      seen.add(key);
   150|      if (withinRange(r.at, lifecycle.from, lifecycle.to)) out.push(r);
   151|    }
   152|  }
   153|  return out;
   154|}
   155|
   156|async function firstMentionAt(vault: string, projectUid: string): Promise<string | undefined> {
   157|  const gl = await readGitLog(vault);
   158|  // Git log entries may contain a `projectUid` marker when Orbit writes them;
   159|  // fall back to scanning for the uid as a substring in any field.
   160|  for (const entry of gl) {
   161|    if ((entry as Record<string, unknown>)['projectUid'] === projectUid) return entry.at;
   162|    const blob = JSON.stringify(entry);
   163|    if (blob.includes(projectUid)) return entry.at;
   164|  }
   165|  return undefined;
   166|}
   167|
   168|/**
   169| * Distill a closed project into a new resource file under
   170| * `03_Resources/distilled/`. Spawns the injected runner, parses the
   171| * response into the seven-section template, and logs a cost record
   172| * with reason `distilled`.
   173| */
   174|export async function distillProject(
   175|  args: { projectUid: string; archivedAbsPath: string },
   176|  deps: DistillDeps
   177|): Promise<DistillResult> {
   178|  const { session, runner } = deps;
   179|  const now = deps.now ?? (() => new Date());
   180|
   181|  // Read the archived project file to pull title + body.
   182|  const archivedRaw = await fs.readFile(args.archivedAbsPath, 'utf8');
   183|  const { data: archivedFm, body: archivedBody } = frontmatter.read(archivedRaw);
   184|  const projectTitle =
   185|    typeof archivedFm['title'] === 'string'
   186|      ? archivedFm['title']
   187|      : path.basename(args.archivedAbsPath, '.md');
   188|  const archivedRelPath = toPosix(vaultRel(session.vault, args.archivedAbsPath));
   189|  const archivedAt =
   190|    typeof archivedFm['archived_at'] === 'string' ? archivedFm['archived_at'] : undefined;
   191|
   192|  const relatedFiles = await collectRelatedFiles(session, args.projectUid);
   193|  const tasks = collectClosedTasks(session, args.projectUid);
   194|
   195|  const lifecycle = {
   196|    from: await firstMentionAt(session.vault, args.projectUid),
   197|    to: archivedAt
   198|  };
   199|  const gitLogAll = await readGitLog(session.vault);
   200|  const gitLog = gitLogAll.filter((g) => withinRange(g.at, lifecycle.from, lifecycle.to));
   201|  const costRecords = await readCostLifecycle(session.vault, lifecycle);
   202|
   203|  const prompt = composeDistillPrompt({
   204|    projectUid: args.projectUid,
   205|    projectTitle,
   206|    archivedRelPath,
   207|    projectBody: archivedBody,
   208|    relatedFiles,
   209|    tasks,
   210|    gitLog,
   211|    costRecords,
   212|    lifecycle
   213|  });
   214|
   215|  const runResult = await runner.run({
   216|    prompt,
   217|    cwd: session.vault,
   218|    vaultPath: session.vault,
   219|    title: `Distill: ${projectTitle}`
   220|  });
   221|
   222|  const sections = parseDistillResponse(runResult.finalText);
   223|  const body = renderDistillBody(sections);
   224|
   225|  const resourceUid = nanoid(12);
   226|  const resourceAt = now().toISOString();
   227|  const fm: Record<string, unknown> = {
   228|    uid: resourceUid,
   229|    type: 'resource',
   230|    title: `Distilled: ${projectTitle}`,
   231|    source_project_uid: args.projectUid,
   232|    tags: ['distilled'],
   233|    distilled_at: resourceAt
   234|  };
   235|  const written = frontmatter.write(fm, `\n${body}`);
   236|
   237|  const slug = slugify(projectTitle);
   238|  const filename = `${slug}-${shortUid(args.projectUid)}.md`;
   239|  const resourceAbs = path.join(session.vault, '03_Resources', 'distilled', filename);
   240|  const resourceRel = toPosix(vaultRel(session.vault, resourceAbs));
   241|  await fs.mkdir(path.dirname(resourceAbs), { recursive: true });
   242|  const writer =
   243|    deps.writeResource ??
   244|    (async (abs: string, content: string) => {
   245|      await fs.writeFile(abs, content, 'utf8');
   246|    });
   247|  await writer(resourceAbs, written);
   248|
   249|  // Update in-memory indices so the new file is immediately searchable.
   250|  session.index.upsert(resourceRel, written);
   251|  session.search.upsert(resourceRel);
   252|  session.tasks.upsert(resourceRel, written);
   253|
   254|  // Cost record for the distillation run.
   255|  const record = buildCostRecord({
   256|    runId: runResult.runId,
   257|    taskId: null,
   258|    promptText: prompt,
   259|    completionText: runResult.finalText,
   260|    at: resourceAt
   261|  });
   262|  record.reason = 'distilled';
   263|  // If the runner reported tokens via events, prefer them.
   264|  const events = runResult.events ?? [];
   265|  for (const ev of events) {
   266|    if (ev.kind === 'cost') {
   267|      if (typeof ev.input_tokens === 'number') record.input = ev.input_tokens;
   268|      if (typeof ev.output_tokens === 'number') record.output = ev.output_tokens;
   269|      if (typeof ev.total_cost_usd === 'number') {
   270|        record.estUSD = ev.total_cost_usd;
   271|        record.source = 'cli';
   272|      } else {
   273|        record.estUSD = estimateUsd(record.input, record.output);
   274|      }
   275|    }
   276|  }
   277|  await appendCostRecord(session.vault, record);
   278|
   279|  return {
   280|    resourcePath: resourceAbs,
   281|    resourceRelPath: resourceRel,
   282|    resourceUid,
   283|    runId: runResult.runId
   284|  };
   285|}
   286|
   287|/** Export for prompt tests: expose the persona string. */
   288|export { DISTILL_PERSONA };
   289|
   290|/** Estimate-only cost helper used by the budget gate in the IPC layer. */
   291|export function estimateDistillCost(promptText: string): {
   292|  tokens: number;
   293|  usd: number;
   294|} {
   295|  const tokens = estimateTokens(promptText);
   296|  return { tokens, usd: (tokens / 1_000_000) * 3 };
   297|}

(End of file. Total 297 lines.)

---

## [Tool] 2026-04-28T06:37:35.229Z
     1|import { promises as fs } from 'node:fs';
     2|import path from 'node:path';
     3|import { spawn as nodeSpawn } from 'node:child_process';
     4|import { nanoid } from 'nanoid';
     5|import * as frontmatter from '../frontmatter';
     6|import { listProjects, listProjectTaskPaths } from '../project';
     7|import { parseTaskSections } from '../task_sections';
     8|import { readCostRecords, summarize } from '../agent/tokens';
     9|import { updateTaskFrontmatter } from '../task';
    10|
    11|export interface DailyReviewResult {
    12|  date: string;
    13|  path: string;
    14|  relPath: string;
    15|  content: string;
    16|  recommendedTaskUids: string[];
    17|  usedLlm: boolean;
    18|}
    19|
    20|export interface DailyReviewDeps {
    21|  now?: () => Date;
    22|  /** Test hook — override git log invocation. */
    23|  runGit?: (args: string[], cwd: string) => Promise<string>;
    24|  /**
    25|   * If provided, called with persona + collected context and expected to
    26|   * return Markdown body. Omit for template-only generation.
    27|   */
    28|  runAgent?: (prompt: string, context: string) => Promise<string>;
    29|  /** Override how recommended tasks get flagged. */
    30|  markRecommended?: (uids: string[]) => Promise<void>;
    31|}
    32|
    33|interface DailyData {
    34|  date: string; // YYYY-MM-DD (local)
    35|  commits: {
    36|    project: string;
    37|    sha: string;
    38|    shortSha: string;
    39|    subject: string;
    40|    at: string;
    41|  }[];
    42|  newExecLogLines: { project: string; task: string; taskUid: string; line: string }[];
    43|  doneTasks: { project: string; title: string; uid: string }[];
    44|  newTasks: { project: string; title: string; uid: string }[];
    45|  blockedTasks: { project: string; title: string; uid: string }[];
    46|  openTasks: { project: string; title: string; uid: string; status: string }[];
    47|  cost: { usd: number; inTokens: number; outTokens: number; runs: number };
    48|}
    49|
    50|function pad(n: number): string {
    51|  return n.toString().padStart(2, '0');
    52|}
    53|
    54|function localDateStr(d: Date): string {
    55|  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    56|}
    57|
    58|function startOfDay(d: Date): Date {
    59|  const x = new Date(d);
    60|  x.setHours(0, 0, 0, 0);
    61|  return x;
    62|}
    63|
    64|function endOfDay(d: Date): Date {
    65|  const x = new Date(d);
    66|  x.setHours(23, 59, 59, 999);
    67|  return x;
    68|}
    69|
    70|async function defaultRunGit(args: string[], cwd: string): Promise<string> {
    71|  return new Promise<string>((resolve) => {
    72|    let buf = '';
    73|    const child = nodeSpawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    74|    child.stdout?.on('data', (c: Buffer) => {
    75|      buf += c.toString('utf8');
    76|    });
    77|    child.on('error', () => resolve(''));
    78|    child.on('close', () => resolve(buf));
    79|  });
    80|}
    81|
    82|/**
    83| * Collect the raw data that feeds both the template renderer and the
    84| * LLM prompt. Exported for tests.
    85| */
    86|export async function collectDailyData(
    87|  vaultPath: string,
    88|  dateInput: Date | string,
    89|  deps: DailyReviewDeps = {}
    90|): Promise<DailyData> {
    91|  const now =
    92|    deps.now?.() ??
    93|    (typeof dateInput === 'string' ? new Date(`${dateInput}T12:00:00`) : dateInput);
    94|  const date = typeof dateInput === 'string' ? dateInput : localDateStr(now);
    95|  const dayStart = startOfDay(now);
    96|  const dayEnd = endOfDay(now);
    97|  const runGit = deps.runGit ?? defaultRunGit;
    98|
    99|  const data: DailyData = {
   100|    date,

(Showing lines 1-100 of 484.)

---

## [Tool] 2026-04-28T06:37:35.229Z
     1|/**
     2| * Ask-Anywhere main 端 orchestrator（M6 / P0）。
     3| *
     4| * 职责：
     5| *  - 创建 / 列出 ad-hoc Ask conversation
     6| *  - 接收用户消息，调度 Claude runtime，把结果写回 Conversation
     7| *  - 通过 PoolEvent.conversationId 让 RuntimeEvent 正确路由到 ChatView
     8| *
     9| * 设计要点（参考 03-chat-runtime-protocol.md §7.1）：
    10| *  - 每条用户消息开一次新 run（per-message stateless），把历史 turns 拼进 prompt
    11| *  - currentRunId 作为并发哨兵：同一 conversation 不允许并发 run
    12| *  - 失败时 emit synthetic runtime.error，让 ChatView 看得见
    13| */
    14|
    15|import { randomUUID } from 'node:crypto';
    16|import path from 'node:path';
    17|import { promises as fs } from 'node:fs';
    18|import { BrowserWindow } from 'electron';
    19|import { IPC } from '@shared/ipc';
    20|import type { Conversation, ConversationAnchor, ConversationMeta } from '@shared/conversation';
    21|import type { RuntimeEvent } from '@shared/chat-protocol';
    22|import type { ConversationOrchestrator } from '../conversation/orchestrator';
    23|import type { RunnerPool } from '../agent/pool';
    24|import type { AgentEvent } from '@shared/agent';
    25|import type { AgentRunner } from '../agent/runner';
    26|import { createStageStore, extractArtifactFences } from './stage-store';
    27|
    28|export interface AskAnywhereDeps {
    29|  conversations: ConversationOrchestrator;
    30|  pool: RunnerPool;
    31|  /** 解析 Claude CLI 路径；失败时返回 null。 */
    32|  resolveClaudePath: () => Promise<string | null>;
    33|  /** 当前 vault 根目录；缺失时返回 null。 */
    34|  getVaultPath: () => string | null;
    35|  /** 可选：注入 hook 配置（与 startTask 复用）。 */
    36|  getHookConfig?: () => Promise<
    37|    | undefined
    38|    | {
    39|        port: number;
    40|        token: string;
    41|        version: number;
    42|        vendor?: 'claude' | 'codex' | 'generic';
    43|        worktreeId?: string;
    44|      }
    45|  >;
    46|  /** 可选：API key 注入。 */
    47|  getApiKey?: () => Promise<string | undefined>;
    48|}
    49|
    50|const ASK_ANYWHERE_SYSTEM_PROMPT = `You are Orbit's planning copilot ("Ask Anywhere").
    51|
    52|Your job:
    53|  - Help the user think through projects, tasks, and ideas.
    54|  - Use the Bash tool to invoke the local 'orbit' CLI when you need to inspect or modify Orbit data.
    55|    Common commands:
    56|      * orbit project list                         # list current projects
    57|      * orbit task list                            # list tasks (optionally --project <slug>)
    58|      * orbit task propose --project <slug> --title "..." --description "..."
    59|      * orbit thought create --content "..."       # capture a quick thought
    60|  - Always confirm destructive actions with the user before invoking the CLI.
    61|  - Keep responses concise and actionable.
    62|`;
    63|
    64|export class AskAnywhereOrchestrator {
    65|  constructor(private readonly deps: AskAnywhereDeps) {}
    66|
    67|  async createSession(opts: { title?: string } = {}): Promise<Conversation> {
    68|    const anchor: ConversationAnchor = {
    69|      kind: 'ask_anywhere_session',
    70|      refId: randomUUID(),
    71|      addedAt: new Date().toISOString()
    72|    };
    73|    return this.deps.conversations.createConversation({
    74|      title: opts.title ?? 'Ask Anywhere',
    75|      anchor,
    76|      runtimeHint: 'claude'
    77|    });
    78|  }
    79|
    80|  async listSessions(): Promise<ConversationMeta[]> {
    81|    const all = await this.deps.conversations.listConversations();
    82|    return all.filter((conv) => conv.anchors.some((a) => a.kind === 'ask_anywhere_session'));
    83|  }
    84|
    85|  /**
    86|   * Channel ingest stub（D-7 P5）：未来 SMS / IM / 邮件等外部入口的统一接入点。
    87|   *
    88|   * 当前行为：
    89|   *   - 找到/创建 anchor=channel_thread,refId=`${source}:${threadId}` 的 Conversation
    90|   *   - 把外部消息写为 user turn
    91|   *   - 暂不自动调度 LLM（等接入策略明确再开）
    92|   */
    93|  async ingestExternalMessage(input: {
    94|    source: string;
    95|    threadId: string;
    96|    text: string;
    97|    title?: string;
    98|  }): Promise<{ conversationId: string }> {
    99|    const refId = `${input.source}:${input.threadId}`;
   100|    const matched = await this.deps.conversations.findByAnchor('channel_thread', refId);
   101|    let conversationId: string;
   102|    if (matched.length > 0 && matched[0]) {
   103|      conversationId = matched[0].id;
   104|    } else {
   105|      const created = await this.deps.conversations.createConversation({
   106|        title: input.title ?? `Channel · ${input.source}`,
   107|        anchor: {
   108|          kind: 'channel_thread',
   109|          refId,
   110|          addedAt: new Date().toISOString()
   111|        },
   112|        runtimeHint: 'claude'
   113|      });
   114|      conversationId = created.id;
   115|    }
   116|    await this.deps.conversations.appendTurn({
   117|      conversationId,
   118|      role: 'user',
   119|      content: input.text
   120|    });
   121|    return { conversationId };
   122|  }
   123|
   124|  /**
   125|   * 用户在 Ask-Anywhere 里发消息：
   126|   *  1) 校验会话 + 并发
   127|   *  2) 取历史 turns 构造 prompt
   128|   *  3) spawn Claude run（带 conversationId）
   129|   *  4) 订阅 runner，聚合 assistant 文本 → on exit append assistant turn
   130|   */
   131|  async send(conversationId: string, text: string): Promise<{ runId: string }> {
   132|    const trimmed = text.trim();
   133|    if (!trimmed) throw new Error('empty_message');
   134|
   135|    const conv = await this.deps.conversations.getConversation(conversationId);
   136|    if (!conv) throw new Error(`conversation_not_found:${conversationId}`);
   137|    if (conv.anchors.every((a) => a.kind !== 'ask_anywhere_session')) {
   138|      throw new Error('not_ask_anywhere_session');
   139|    }
   140|    if (conv.currentRunId) {
   141|      // 并发哨兵：已有 run 在跑，拒绝
   142|      throw new Error('already_running');
   143|    }
   144|
   145|    const vault = this.deps.getVaultPath();
   146|    if (!vault) {
   147|      this.emitSyntheticError(conversationId, 'no_vault', 'No vault open.');
   148|      throw new Error('no_vault');
   149|    }
   150|
   151|    const claudePath = await this.deps.resolveClaudePath();
   152|    if (!claudePath) {
   153|      this.emitSyntheticError(
   154|        conversationId,
   155|        'cli_missing',
   156|        'Claude Code CLI not found. Install it from https://docs.claude.com/claude-code'
   157|      );
   158|      throw new Error('cli_missing');
   159|    }
   160|
   161|    // 先取历史构造 prompt（不含本条 user message），随后再 append user turn —— 避免重复
   162|    const history = renderHistory(conv.turns);
   163|    const systemPrompt = await loadAskAnywhereSystemPrompt(vault);
   164|    const prompt = buildPrompt({ systemPrompt, history, userText: trimmed });
   165|
   166|    // append user turn（必须在 spawn 前，让 UI 即便 reload 也能看到）
   167|    await this.deps.conversations.appendTurn({
   168|      conversationId,
   169|      role: 'user',
   170|      content: trimmed
   171|    });
   172|
   173|    let hookConfig: Awaited<ReturnType<NonNullable<AskAnywhereDeps['getHookConfig']>>> | undefined;
   174|    try {
   175|      hookConfig = await this.deps.getHookConfig?.();
   176|    } catch {
   177|      hookConfig = undefined;
   178|    }
   179|    const apiKey = await this.deps.getApiKey?.().catch(() => undefined);
   180|
   181|    let runner: AgentRunner;
   182|    try {
   183|      runner = await this.deps.pool.spawn({
   184|        claudePath,
   185|        prompt,
   186|        cwd: vault,
   187|        taskId: null,
   188|        title: 'Ask Anywhere',
   189|        vaultPath: vault,
   190|        runtimeProvider: 'claude',
   191|        conversationId,
   192|        ...(hookConfig ? { hookConfig } : {}),
   193|        ...(apiKey ? { apiKey } : {})
   194|      });
   195|    } catch (err) {
   196|      const e = err as Error & { code?: string };
   197|      this.emitSyntheticError(
   198|        conversationId,
   199|        e.code ?? 'spawn_failed',
   200|        e.message ?? 'failed to spawn runtime'
   201|      );
   202|      throw err;
   203|    }
   204|
   205|    await this.deps.conversations.bindRuntime(conversationId, {
   206|      currentRunId: runner.runId,
   207|      runtimeHint: 'claude'
   208|    });
   209|
   210|    // 聚合 assistant 文本：直接订阅 runner（同步、早于 broadcastPool）
   211|    const aggregator = new AssistantAggregator();
   212|    runner.on('event', (ev: AgentEvent) => aggregator.ingest(ev));
   213|    runner.once('exit', () => {
   214|      void this.finalizeRun(conversationId, runner.runId, aggregator);
   215|    });
   216|
   217|    return { runId: runner.runId };
   218|  }
   219|
   220|  async stop(conversationId: string): Promise<void> {
   221|    const conv = await this.deps.conversations.getConversation(conversationId);
   222|    if (!conv?.currentRunId) return;
   223|    await this.deps.pool.kill(conv.currentRunId, 'user_stop');
   224|  }
   225|
   226|  private async finalizeRun(
   227|    conversationId: string,
   228|    runId: string,
   229|    aggregator: AssistantAggregator
   230|  ): Promise<void> {
   231|    const text = aggregator.toFinalText();
   232|    try {
   233|      if (text) {
   234|        await this.deps.conversations.appendTurn({
   235|          conversationId,
   236|          role: 'assistant',
   237|          content: text,
   238|          runtimeEventIds: aggregator.eventIds()
   239|        });
   240|        const vault = this.deps.getVaultPath();
   241|        if (vault) {
   242|          const stage = createStageStore(vault);
   243|          for (const artifact of extractArtifactFences(text)) {
   244|            await stage.add(conversationId, artifact);
   245|          }
   246|        }
   247|      }
   248|    } finally {
   249|      await this.deps.conversations
   250|        .bindRuntime(conversationId, { currentRunId: null })
   251|        .catch(() => undefined);
   252|    }
   253|    void runId; // reserved for replay correlation
   254|  }
   255|
   256|  private emitSyntheticError(conversationId: string, code: string, message: string): void {
   257|    const ev: RuntimeEvent = {
   258|      id: `ask-error-${Date.now()}`,
   259|      at: new Date().toISOString(),
   260|      kind: 'runtime.error',
   261|      conversationId,
   262|      runId: '',
   263|      spanId: `ask-error-${Date.now()}`,
   264|      payload: { code, message }
   265|    };
   266|    for (const w of BrowserWindow.getAllWindows()) {
   267|      if (!w.isDestroyed()) w.webContents.send(IPC.chat.runtimeEvent, ev);
   268|    }
   269|  }
   270|}
   271|
   272|class AssistantAggregator {
   273|  private texts: string[] = [];
   274|  private ids: string[] = [];
   275|
   276|  ingest(ev: AgentEvent): void {
   277|    if ((ev.kind === 'message' || ev.kind === 'text') && typeof ev.text === 'string' && ev.text) {
   278|      this.texts.push(ev.text);
   279|      this.ids.push(`agent-event-${ev.idx}`);
   280|    }
   281|  }
   282|
   283|  toFinalText(): string {
   284|    return this.texts.join('').trim();
   285|  }
   286|
   287|  eventIds(): string[] {
   288|    return this.ids.slice();
   289|  }
   290|}
   291|
   292|function renderHistory(turns: Conversation['turns']): string {
   293|  if (turns.length === 0) return '';
   294|  return turns
   295|    .map((t) => {
   296|      const tag = t.role === 'user' ? 'User' : t.role === 'assistant' ? 'Assistant' : 'System';
   297|      return `${tag}: ${t.content}`;
   298|    })
   299|    .join('\n\n');
   300|}
   301|
   302|function buildPrompt({
   303|  systemPrompt,
   304|  history,
   305|  userText
   306|}: {
   307|  systemPrompt: string;
   308|  history: string;
   309|  userText: string;
   310|}): string {
   311|  const parts = [systemPrompt.trim()];
   312|  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
   313|  parts.push(`User: ${userText}`);
   314|  parts.push('Assistant:');
   315|  return parts.join('\n\n');
   316|}
   317|
   318|/**
   319| * 优先读取 vault 内 `.orbit/skills/ask-anywhere-planning.md`，
   320| * 失败则回退到内置 ASK_ANYWHERE_SYSTEM_PROMPT（D-7 P4.1 skill 化）。
   321| */
   322|async function loadAskAnywhereSystemPrompt(vaultPath: string): Promise<string> {
   323|  const skillFile = path.join(vaultPath, '.orbit', 'skills', 'ask-anywhere-planning.md');
   324|  try {
   325|    const raw = await fs.readFile(skillFile, 'utf8');
   326|    if (raw.trim().length > 0) return raw;
   327|  } catch {
   328|    /* fallback to default */
   329|  }
   330|  return ASK_ANYWHERE_SYSTEM_PROMPT;
   331|}

(End of file. Total 331 lines.)

---

## [Tool] 2026-04-28T06:37:35.230Z
     1|import { BrowserWindow } from 'electron';
     2|import { nanoid } from 'nanoid';
     3|import { IPC } from '@shared/ipc';
     4|import {
     5|  PLANNER_AGENT_IDS,
     6|  TASK_OWNER_TYPES,
     7|  type PlanProposal,
     8|  type PlanProposalEdge,
     9|  type PlanProposalNode,
    10|  type PlannerAgentId,
    11|  type PlannerChatMessage,
    12|  type PlannerChatReply,
    13|  type PlannerProposalReply,
    14|  type ProjectRoleBinding
    15|} from '@shared/orchestration';
    16|import type { TaskRecord } from '@shared/schemas';
    17|import { currentSession } from '../fs';
    18|import { detectClaude } from '../agent/cli';
    19|import { AgentRunner } from '../agent/runner';
    20|import { getSettings } from '../settings';
    21|import { listProjects, type ProjectSummary } from '../project';
    22|import { currentProjectTasks } from './session';
    23|import { listPlanProposals, savePlanProposal } from './planner';
    24|import { listProjectRoleBindings } from './roles';
    25|
    26|type PlannerMode = 'chat' | 'proposal';
    27|
    28|type NormalizedPlannerPayload = {
    29|  assistantMessage: string;
    30|  proposal: Pick<PlanProposal, 'title' | 'summary' | 'nodes' | 'edges' | 'inputSummary'>;
    31|};
    32|
    33|const NODE_STATUSES = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'] as const;
    34|const EXECUTION_STRATEGIES = ['manual', 'autonomous'] as const;
    35|const PRIORITIES = ['low', 'med', 'high'] as const;
    36|const EFFORTS = ['xs', 's', 'm', 'l', 'xl'] as const;
    37|const EDGE_KINDS = ['depends_on', 'blocks', 'parent_child'] as const;
    38|
    39|const AGENT_ROLE_PROMPTS: Record<PlannerAgentId, string> = {
    40|  'plan-agent':
    41|    'You are Orbit Plan Agent. Brainstorm requirements, uncover constraints, and converge on a clean task split.',
    42|  'architect-agent':
    43|    'You are Orbit Architect Agent. Challenge the structure, sequencing, dependencies, and system boundaries before implementation starts.',
    44|  'executor-agent':
    45|    'You are Orbit Executor Agent. Judge whether the plan is actionable, testable, and realistic for implementation agents.'
    46|};
    47|
    48|export async function plannerChat(
    49|  projectUid: string,
    50|  agentId: PlannerAgentId,
    51|  messages: PlannerChatMessage[]
    52|): Promise<PlannerChatReply> {
    53|  const context = await loadPlannerContext(projectUid);
    54|  const result = await runPlannerPrompt({
    55|    title: `Planner Chat · ${agentId}`,
    56|    prompt: buildPlannerPrompt({ mode: 'chat', agentId, context, messages }),
    57|    cwd: context.project.path,
    58|    vaultPath: context.vaultPath
    59|  });
    60|  return {
    61|    runId: result.runId,
    62|    agentId,
    63|    message: parseChatReply(result.finalText)
    64|  };
    65|}
    66|
    67|export async function plannerGenerateProposal(
    68|  projectUid: string,
    69|  agentId: PlannerAgentId,
    70|  messages: PlannerChatMessage[]
    71|): Promise<PlannerProposalReply> {
    72|  const context = await loadPlannerContext(projectUid);
    73|  const result = await runPlannerPrompt({
    74|    title: `Planner Proposal · ${agentId}`,
    75|    prompt: buildPlannerPrompt({ mode: 'proposal', agentId, context, messages }),
    76|    cwd: context.project.path,
    77|    vaultPath: context.vaultPath
    78|  });
    79|  const latestProposal = context.proposals[context.proposals.length - 1];
    80|  const parsed = normalizePlannerPayload(result.finalText, latestProposal);

(Showing lines 1-80 of 530.)

---

## [Assistant] 2026-04-28T06:37:58.332Z
已经完全看清楚现状了。再确认几个关键点：timeline 的当前渲染、runtime 层接口、settings schema。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/timeline/ipc.ts"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/runtime.ts"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/settings.ts"})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/planner_agent.ts","pattern":"runPlannerPrompt|AgentRunner|spawn","contextAround":3,"headLimit":40,"toolExplanation":"planner 底层怎么跑"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/timeline","depth":2,"offset":0,"limit":30,"toolExplanation":"timeline 视图"})

---

## [Tool] 2026-04-28T06:37:58.347Z
     1|import { BrowserWindow, ipcMain } from 'electron';
     2|import { IPC } from '@shared/ipc';
     3|import type { TimelineScope } from '@shared/timeline';
     4|import { createTimelineStore } from './store';
     5|import { eventReplayBus } from '../events/bus';
     6|
     7|export function registerTimelineIpc(getVaultPath: () => string | null): void {
     8|  const vaultPath = (): string => {
     9|    const value = getVaultPath();
    10|    if (!value) throw new Error('no vault open');
    11|    return value;
    12|  };
    13|  const store = () => createTimelineStore(vaultPath());
    14|
    15|  ipcMain.handle(IPC.timeline.getDay, (_event, date: string, options?: { developerMode?: boolean }) =>
    16|    store().getDay(date, Boolean(options?.developerMode))
    17|  );
    18|  ipcMain.handle(IPC.timeline.getWeek, (_event, isoWeek: string) => store().getWeek(isoWeek));
    19|  ipcMain.handle(IPC.timeline.getMonth, (_event, month: string) => store().getMonthlyIndex(month));
    20|  ipcMain.handle(IPC.timeline.getYear, (_event, year: number) => store().getYearlyIndex(year));
    21|  ipcMain.handle(IPC.timeline.getMonthlyIndex, (_event, month: string) => store().getMonthlyIndex(month));
    22|  ipcMain.handle(IPC.timeline.getYearlyIndex, (_event, year: number) => store().getYearlyIndex(year));
    23|  ipcMain.handle(IPC.timeline.generateDailySummary, (_event, date: string) => store().generateDailySummary(date));
    24|  ipcMain.handle(IPC.timeline.updateDailySummary, (_event, date: string, patch: { narrative?: string; headline?: string }) =>
    25|    store().updateDailySummary(date, patch)
    26|  );
    27|  ipcMain.handle(IPC.timeline.exportPDF, (_event, scope: TimelineScope) => store().exportMarkdown(scope));
    28|
    29|  eventReplayBus.on('event', async (event) => {
    30|    const vault = getVaultPath();
    31|    if (!vault) return;
    32|    const date = event.at.slice(0, 10);
    33|    const timeline = await createTimelineStore(vault).getDay(date).catch(() => null);
    34|    if (!timeline) return;
    35|    for (const win of BrowserWindow.getAllWindows()) {
    36|      if (!win.isDestroyed()) win.webContents.send(IPC.timeline.event, timeline);
    37|    }
    38|  });
    39|}
    40|

(End of file. Total 40 lines.)

---

## [Tool] 2026-04-28T06:37:58.348Z
     1|import { EventEmitter } from 'node:events';
     2|import { execFile, spawn } from 'node:child_process';
     3|import { promises as fs } from 'node:fs';
     4|import os from 'node:os';
     5|import path from 'node:path';
     6|import type { RuntimeDescriptor, RuntimeRegistrySnapshot } from '@shared/orchestration';
     7|import { getSettings } from '../settings';
     8|import { readJsonFile, vaultRuntimeRegistryFile, writeJsonFile } from './storage';
     9|
    10|function whichBinary(command: string): Promise<string | null> {
    11|  return new Promise((resolve) => {
    12|    const proc = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
    13|      env: process.env
    14|    });
    15|    let out = '';
    16|    proc.stdout?.on('data', (chunk: Buffer) => {
    17|      out += chunk.toString('utf8');
    18|    });
    19|    proc.on('error', () => resolve(null));
    20|    proc.on('close', () => {
    21|      const first = out
    22|        .split(/\r?\n/)
    23|        .map((line) => line.trim())
    24|        .find(Boolean);
    25|      resolve(first ?? null);
    26|    });
    27|  });
    28|}
    29|
    30|async function exists(filePath: string): Promise<boolean> {
    31|  try {
    32|    await fs.access(filePath);
    33|    return true;
    34|  } catch {
    35|    return false;
    36|  }
    37|}
    38|
    39|function probeVersion(binaryPath: string, args: string[] = ['--version']): Promise<string | null> {
    40|  return new Promise((resolve) => {
    41|    const child = execFile(binaryPath, args, { timeout: 3000 }, (error, stdout, stderr) => {
    42|      if (error) {
    43|        resolve((stderr || '').trim() || null);
    44|        return;
    45|      }
    46|      resolve((stdout || '').trim() || null);
    47|    });
    48|    child.on('error', () => resolve(null));
    49|  });
    50|}
    51|
    52|async function resolveBinary(
    53|  command: string,
    54|  fallbackPaths: string[] = [],
    55|  overridePath?: string
    56|): Promise<string | null> {
    57|  if (overridePath && (await exists(overridePath))) return overridePath;
    58|  const fromPath = await whichBinary(command);
    59|  if (fromPath) return fromPath;
    60|  for (const candidate of fallbackPaths) {
    61|    if (await exists(candidate)) return candidate;
    62|  }
    63|  return null;
    64|}
    65|
    66|async function probeRuntimes(): Promise<RuntimeDescriptor[]> {
    67|  const settings = await getSettings();
    68|  const home = os.homedir();
    69|  const providers: Array<{
    70|    provider: RuntimeDescriptor['provider'];
    71|    command: string;
    72|    overridePath?: string;
    73|    fallbackPaths?: string[];
    74|    capabilities: RuntimeDescriptor['capabilities'];
    75|    maxConcurrentRuns: number;
    76|  }> = [
    77|    {
    78|      provider: 'claude',
    79|      command: 'claude',
    80|      overridePath: settings.claudePath || undefined,
    81|      fallbackPaths: [
    82|        path.join(home, '.claude', 'local', 'claude'),
    83|        '/usr/local/bin/claude',
    84|        '/opt/homebrew/bin/claude'
    85|      ],
    86|      capabilities: {
    87|        supportsResume: true,
    88|        supportsHooks: true,
    89|        supportsWorktree: true,
    90|        supportsBackgroundRuns: true,
    91|        supportsLongContext: true
    92|      },
    93|      maxConcurrentRuns: 4
    94|    },
    95|    {
    96|      provider: 'codex',
    97|      command: 'codex',
    98|      fallbackPaths: [path.join(home, '.codex', 'local', 'codex')],
    99|      capabilities: {
   100|        supportsResume: true,
   101|        supportsHooks: false,
   102|        supportsWorktree: true,
   103|        supportsBackgroundRuns: false
   104|      },
   105|      maxConcurrentRuns: 1
   106|    },
   107|    {
   108|      provider: 'copilot',
   109|      command: 'copilot',
   110|      capabilities: {
   111|        supportsResume: false,
   112|        supportsHooks: false,
   113|        supportsWorktree: true,
   114|        supportsBackgroundRuns: false
   115|      },
   116|      maxConcurrentRuns: 1
   117|    },
   118|    {
   119|      provider: 'gemini',
   120|      command: 'gemini',
   121|      capabilities: {
   122|        supportsResume: false,
   123|        supportsHooks: false,
   124|        supportsWorktree: true,
   125|        supportsBackgroundRuns: false
   126|      },
   127|      maxConcurrentRuns: 1
   128|    },
   129|    {
   130|      provider: 'opencode',
   131|      command: 'opencode',
   132|      capabilities: {
   133|        supportsResume: false,
   134|        supportsHooks: false,
   135|        supportsWorktree: true,
   136|        supportsBackgroundRuns: false
   137|      },
   138|      maxConcurrentRuns: 1
   139|    }
   140|  ];
   141|
   142|  const now = new Date().toISOString();
   143|  const descriptors = await Promise.all(
   144|    providers.map(async (provider) => {
   145|      const binaryPath = await resolveBinary(
   146|        provider.command,
   147|        provider.fallbackPaths,
   148|        provider.overridePath
   149|      );
   150|      if (!binaryPath) return null;
   151|      const version = await probeVersion(binaryPath);
   152|      return {
   153|        runtimeId: `${provider.provider}:${binaryPath}`,
   154|        mode: 'local',
   155|        provider: provider.provider,
   156|        name: `${provider.provider} local runtime`,
   157|        binaryPath,
   158|        version,
   159|        status: 'online',
   160|        discoveredAt: now,
   161|        lastSeenAt: now,
   162|        capabilities: provider.capabilities,
   163|        limits: {
   164|          maxConcurrentRuns: provider.maxConcurrentRuns
   165|        }
   166|      } satisfies RuntimeDescriptor;
   167|    })
   168|  );
   169|  return descriptors.filter((descriptor) => descriptor !== null) as RuntimeDescriptor[];
   170|}
   171|
   172|export class LocalRuntimeManager extends EventEmitter {
   173|  private vaultPath: string | null = null;
   174|  private snapshot: RuntimeRegistrySnapshot = { refreshedAt: '', runtimes: [] };
   175|
   176|  async attach(vaultPath: string): Promise<void> {
   177|    this.vaultPath = vaultPath;
   178|    this.snapshot = await readJsonFile<RuntimeRegistrySnapshot>(vaultRuntimeRegistryFile(vaultPath), {
   179|      refreshedAt: '',
   180|      runtimes: []
   181|    });
   182|    if (this.snapshot.runtimes.length === 0) {
   183|      await this.refresh();
   184|    }
   185|  }
   186|
   187|  detach(): void {
   188|    this.vaultPath = null;
   189|    this.snapshot = { refreshedAt: '', runtimes: [] };
   190|  }
   191|
   192|  list(): RuntimeDescriptor[] {
   193|    return this.snapshot.runtimes;
   194|  }
   195|
   196|  get(runtimeId: string): RuntimeDescriptor | null {
   197|    return this.snapshot.runtimes.find((runtime) => runtime.runtimeId === runtimeId) ?? null;
   198|  }
   199|
   200|  async refresh(): Promise<RuntimeRegistrySnapshot> {
   201|    if (!this.vaultPath) return this.snapshot;
   202|    const runtimes = await probeRuntimes();
   203|    this.snapshot = {
   204|      refreshedAt: new Date().toISOString(),
   205|      runtimes
   206|    };
   207|    await writeJsonFile(vaultRuntimeRegistryFile(this.vaultPath), this.snapshot);
   208|    this.emit('event', {
   209|      at: this.snapshot.refreshedAt,
   210|      type: 'runtime:refreshed',
   211|      snapshot: this.snapshot
   212|    });
   213|    return this.snapshot;
   214|  }
   215|}
   216|
   217|let singleton: LocalRuntimeManager | null = null;
   218|
   219|export function getLocalRuntimeManager(): LocalRuntimeManager {
   220|  if (!singleton) singleton = new LocalRuntimeManager();
   221|  return singleton;
   222|}

(End of file. Total 222 lines.)

---

## [Tool] 2026-04-28T06:37:58.349Z
     1|import { app } from 'electron';
     2|import { promises as fs } from 'node:fs';
     3|import path from 'node:path';
     4|import type { AppSettings, Theme } from '@shared/types';
     5|import {
     6|  type AutoRunnerSettings,
     7|  type BudgetSettings,
     8|  DEFAULT_BUDGET,
     9|  parseAutoRunnerSettings,
    10|  parseAppSettings,
    11|  parseBudgetSettings
    12|} from '@shared/schemas';
    13|
    14|function settingsFile(): string {
    15|  return path.join(app.getPath('userData'), 'orbit-settings.json');
    16|}
    17|
    18|async function readRaw(): Promise<AppSettings> {
    19|  try {
    20|    const raw = await fs.readFile(settingsFile(), 'utf8');
    21|    const parsed = JSON.parse(raw);
    22|    return parseAppSettings(parsed) as AppSettings;
    23|  } catch {
    24|    return parseAppSettings({}) as AppSettings;
    25|  }
    26|}
    27|
    28|async function writeRaw(s: AppSettings): Promise<void> {
    29|  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
    30|  await fs.writeFile(settingsFile(), JSON.stringify(s, null, 2), 'utf8');
    31|}
    32|
    33|export async function getSettings(): Promise<AppSettings> {
    34|  return readRaw();
    35|}
    36|
    37|export async function setLastVaultPath(p: string | null): Promise<AppSettings> {
    38|  const s = await readRaw();
    39|  s.lastVaultPath = p;
    40|  await writeRaw(s);
    41|  return s;
    42|}
    43|
    44|export async function setTheme(theme: Theme): Promise<AppSettings> {
    45|  const s = await readRaw();
    46|  s.theme = theme;
    47|  await writeRaw(s);
    48|  return s;
    49|}
    50|
    51|export async function getBudget(): Promise<BudgetSettings> {
    52|  const s = await readRaw();
    53|  return s.budget;
    54|}
    55|
    56|export async function updateBudget(
    57|  partial: Partial<BudgetSettings>
    58|): Promise<BudgetSettings> {
    59|  const s = await readRaw();
    60|  s.budget = parseBudgetSettings({ ...s.budget, ...partial });
    61|  await writeRaw(s);
    62|  return s.budget;
    63|}
    64|
    65|export async function getAutoRunnerSettings(): Promise<AutoRunnerSettings> {
    66|  const s = await readRaw();
    67|  return parseAutoRunnerSettings(s.autoRunner);
    68|}
    69|
    70|export async function updateAutoRunnerSettings(
    71|  partial: Partial<AutoRunnerSettings>
    72|): Promise<AutoRunnerSettings> {
    73|  const s = await readRaw();
    74|  s.autoRunner = parseAutoRunnerSettings({ ...s.autoRunner, ...partial });
    75|  await writeRaw(s);
    76|  return s.autoRunner;
    77|}
    78|
    79|/**
    80| * Update an arbitrary subset of top-level AppSettings. Re-parses so
    81| * invalid values fall back to defaults rather than corrupting state.
    82| */
    83|export async function updateSettings(
    84|  partial: Partial<AppSettings>
    85|): Promise<AppSettings> {
    86|  const s = await readRaw();
    87|  const next = parseAppSettings({ ...s, ...partial }) as AppSettings;
    88|  await writeRaw(next);
    89|  return next;
    90|}
    91|
    92|// Re-export for tests/back-compat.
    93|export { DEFAULT_BUDGET };

(End of file. Total 93 lines.)

---

## [Tool] 2026-04-28T06:37:58.349Z
--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/planner_agent.ts ---
19: import { AgentRunner } from '../agent/runner';
54:   const result = await runPlannerPrompt({
73:   const result = await runPlannerPrompt({
242: async function runPlannerPrompt(args: {
257:   const runner = new AgentRunner({

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-28T06:37:58.350Z
Directory not found: /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/views/timeline

---

## [Assistant] 2026-04-28T06:38:13.033Z
### Tool Calls:
- **search_file**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src","pattern":"*Timeline*","recursive":true,"caseSensitive":false,"toolExplanation":"找 timeline 视图"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/timeline/store.ts","limit":80})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/orchestration/planner_agent.ts","offset":230,"limit":80})

---

## [Tool] 2026-04-28T06:38:13.045Z
["components/Timeline/TimelineCards.tsx","views/TimelineView.tsx"]

---

## [Tool] 2026-04-28T06:38:13.045Z
     1|import { promises as fs } from 'node:fs';
     2|import path from 'node:path';
     3|import type { TraceableEvent } from '@shared/events';
     4|import type { DailyStats, DailySummary, DailyTimeline, MonthlyIndex, TimelineEntry, YearlyIndex } from '@shared/timeline';
     5|import { shouldShowOnTimeline, TIMELINE_LAYER_1_KINDS } from '@shared/timeline';
     6|import { currentEventReplayStore } from '../events/bus';
     7|import { createNoteStore } from '../note/store';
     8|
     9|export class TimelineStore {
    10|  constructor(private readonly vaultPath: string) {}
    11|
    12|  async getDay(date: string, developerMode = false): Promise<DailyTimeline> {
    13|    const events = await this.eventsForDate(date, developerMode);
    14|    const entries = events
    15|      .map((event) => projectEvent(event, developerMode))
    16|      .filter((entry): entry is TimelineEntry => entry !== null)
    17|      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    18|    return {
    19|      date,
    20|      entries,
    21|      stats: buildStats(entries),
    22|      summary: await this.readDailySummary(date)
    23|    };
    24|  }
    25|
    26|  async getWeek(isoWeek: string): Promise<DailyTimeline[]> {
    27|    const dates = datesForIsoWeek(isoWeek);
    28|    return Promise.all(dates.map((date) => this.getDay(date)));
    29|  }
    30|
    31|  async getMonthlyIndex(month: string): Promise<MonthlyIndex> {
    32|    const days = daysInMonth(month);
    33|    const timelines = await Promise.all(days.map((date) => this.getDay(date)));
    34|    return {
    35|      month,
    36|      days: timelines.map((timeline) => ({
    37|        date: timeline.date,
    38|        entry_count: timeline.entries.length,
    39|        highlight_kinds: [...new Set(timeline.entries.slice(0, 5).map((entry) => entry.event_kind))],
    40|        ...(timeline.summary?.headline ? { summary_headline: timeline.summary.headline } : {})
    41|      }))
    42|    };
    43|  }
    44|
    45|  async getYearlyIndex(year: number): Promise<YearlyIndex> {
    46|    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    47|    const indexes = await Promise.all(months.map((month) => this.getMonthlyIndex(month)));
    48|    return {
    49|      year,
    50|      months: indexes.map((index) => ({
    51|        month: index.month,
    52|        total_events: index.days.reduce((sum, day) => sum + day.entry_count, 0),
    53|        days_active: index.days.filter((day) => day.entry_count > 0).length
    54|      }))
    55|    };
    56|  }
    57|
    58|  async generateDailySummary(date: string): Promise<DailySummary> {
    59|    const timeline = await this.getDay(date, false);
    60|    const headline = timeline.entries.length > 0 ? `${timeline.entries.length} meaningful events` : 'Quiet day';
    61|    const highlights = timeline.entries.slice(0, 5).map((entry) => `${entry.icon} ${entry.title}`);
    62|    const narrative =
    63|      timeline.entries.length > 0
    64|        ? `Orbit captured ${timeline.entries.length} timeline event(s). The main thread was: ${highlights.join(' / ')}.`
    65|        : 'No user-visible activity was captured today.';
    66|    const body = `# ${date} Daily Summary\n\n${narrative}\n\n## Highlights\n\n${highlights.map((item) => `- ${item}`).join('\n') || '- Rest / no captured events'}\n`;
    67|    const note = await createNoteStore(this.vaultPath).create({
    68|      type: 'daily_summary',
    69|      title: `${date} Daily Summary`,
    70|      body,
    71|      tags: ['daily-summary']
    72|    });
    73|    const summary: DailySummary = {
    74|      generated_at: new Date().toISOString(),
    75|      note_path: note.path,
    76|      headline,
    77|      narrative,
    78|      highlights
    79|    };
    80|    await this.writeSummary(date, summary);

(Showing lines 1-80 of 265.)

---

## [Tool] 2026-04-28T06:38:13.046Z
   230|    '',
   231|    '# Current project context',
   232|    contextBlock,
   233|    '',
   234|    '# Conversation so far',
   235|    conversation || '(no conversation yet)',
   236|    '',
   237|    '# Latest user request',
   238|    latestUserMessage || '(none)'
   239|  ].join('\n');
   240|}
   241|
   242|async function runPlannerPrompt(args: {
   243|  title: string;
   244|  prompt: string;
   245|  cwd: string;
   246|  vaultPath: string;
   247|}): Promise<{ runId: string; finalText: string }> {
   248|  const detect = await detectClaude();
   249|  const settings = await getSettings();
   250|  const claudePath = settings.claudePath || detect.path;
   251|  if (!claudePath) {
   252|    throw new Error(
   253|      detect.error ?? 'Claude Code CLI not found. Install it from https://docs.claude.com/claude-code'
   254|    );
   255|  }
   256|
   257|  const runner = new AgentRunner({
   258|    claudePath,
   259|    prompt: args.prompt,
   260|    cwd: args.cwd,
   261|    vaultPath: args.vaultPath,
   262|    taskId: null,
   263|    title: args.title,
   264|    ...(settings.anthropicApiKey ? { apiKey: settings.anthropicApiKey } : {})
   265|  });
   266|
   267|  runner.on('event', (event) => {
   268|    for (const window of BrowserWindow.getAllWindows()) {
   269|      if (!window.isDestroyed()) {
   270|        window.webContents.send(IPC.agent.event, { runId: runner.runId, event });
   271|      }
   272|    }
   273|  });
   274|
   275|  await runner.start();
   276|  await new Promise<void>((resolve) => runner.once('exit', () => resolve()));
   277|  const snapshot = runner.snapshot();
   278|  const finalText = snapshot.events
   279|    .filter((event) => event.kind === 'message' || event.kind === 'text')
   280|    .map((event) => event.text ?? '')
   281|    .join('\n')
   282|    .trim();
   283|  if (!finalText) throw new Error('planner agent returned an empty response');
   284|  return { runId: runner.runId, finalText };
   285|}
   286|
   287|function parseChatReply(finalText: string): string {
   288|  return finalText.trim();
   289|}
   290|
   291|export function normalizePlannerPayload(
   292|  finalText: string,
   293|  previousProposal?: PlanProposal
   294|): NormalizedPlannerPayload {
   295|  const parsed = extractJsonPayload(finalText);
   296|  const rawAssistantMessage =
   297|    getString((parsed as Record<string, unknown>)['assistantMessage']) ??
   298|    getString((parsed as Record<string, unknown>)['message']) ??
   299|    'Generated a new task split proposal.';
   300|  const proposalSource = getRecord((parsed as Record<string, unknown>)['proposal']) ?? parsed;
   301|  const rawNodes = getArray(proposalSource['nodes']);
   302|  if (rawNodes.length === 0) throw new Error('planner proposal did not contain any nodes');
   303|
   304|  const previousPositions = new Map(
   305|    (previousProposal?.nodes ?? []).map((node) => [node.taskUid, node.position])
   306|  );
   307|  const normalizedNodes = ensureUniqueTaskUids(
   308|    rawNodes
   309|      .map((entry, index) => normalizeNode(entry, index, previousPositions))

(Showing lines 230-309 of 530.)

---

## [Assistant] 2026-04-28T06:44:30.601Z
全貌已经清楚了。不继续读更多，信息够用。直接进入"带观点的脑暴"。

---

## 先汇报我摸到的现状（你要基于这个共识才能看清方案）

你描述的"需要一个轻量 LLM 调用"——**在 Orbit 里其实已经有三四个零散的实现了**，只是从来没被当作独立能力抽出来。清单：

| 已经在"偷偷用 LLM"的地方 | 实现方式 | 问题 |
|---|---|---|
| **Distill**（项目归档沉淀）`src/main/distill/distill.ts` | 通过 `DistillRunner` 抽象，本质还是起一个完整的 `AgentRunner`（spawn `claude` CLI） | 为了一次性生成一段文字动用了完整的 Claude Code 进程，20+ 秒起步 |
| **Daily Review** `src/main/review/daily.ts` | 可选的 `runAgent(prompt, context) => Promise<string>` 钩子，调用方自己实现 | 签名是对的但没人实现 |
| **Planner Agent** `src/main/orchestration/planner_agent.ts:257` | 直接 `new AgentRunner({...})` spawn Claude CLI，等 exit，聚合 text 事件 | 同 Distill，重 + 只能用 Claude |
| **Ask-Anywhere** `src/main/ask-anywhere/orchestrator.ts` | 同样 `pool.spawn(...)` Claude runner | 本来就是多轮 chat，这个合理 |
| **Timeline Daily Summary** `src/main/timeline/store.ts:58-66` | **硬编码模板字符串拼接**，完全没过 LLM | 你说的"`Scheduled task ran` / `conversation started` 毫无摘要" 原因就在这 |
| **Timeline Entry Title/Description** `store.ts` 的 `projectEvent(event)` | 从 `TraceableEvent` 直接映射字段 | 一样无摘要 |

**核心问题不是"缺能力"，而是"能力都用错了姿势"**：

1. 所有需要文本生成的地方都被迫启动一个完整的 Agent CLI 进程
2. 没有 "provider 切换" 概念——每个调用点自己去读 `settings.claudePath` / `settings.anthropicApiKey`
3. 没有 prompt 组装抽象——每处自己拼字符串
4. 没有结果缓存——生成一次的摘要，切走再回来重算
5. 最要命：**Claude Code CLI 的计费模式是按 session 启动的，20 次小调用 = 20 次进程启动成本**

所以你这个需求，用 project-brainstorm 的术语说，**不是 Evolve（加能力），是 Refactor + Consolidate（把散落的东西抽成一等公民）**。下面我会按这个定位来谈。

---

## 观点 1：这一层不是"轻量 LLM"，它是 **LLM Gateway**

你说的"输入 prompt，输出结果"听起来像 OpenAI `/completions`。但在 Orbit 语境里，它应该承担四层职责：

```
┌─ Callers: Timeline.summarize / Conversation.title / Capture.tag / Note.rewrite / ... ─┐
│                                                                                        │
│  ┌─ PromptKit（prompt 组装层）─────────────────────────────────────────┐              │
│  │   - Template registry: 'timeline.entry.summarize', 'conv.title', ... │              │
│  │   - Variable resolver: 从 vault/context 里提取变量                   │              │
│  │   - Schema-first output: 每个模板声明 Zod output schema             │              │
│  └─────────────────────────────────────────────────────────────────────┘              │
│                                   │                                                    │
│  ┌─ LLMGateway（调度层）───────────────────────────────────────────────┐              │
│  │   - invoke(templateId, vars, opts?) → Promise<T>                    │              │
│  │   - Strategy: model选择 / retry / timeout / cancel                   │              │
│  │   - Budget integration（复用现有 BudgetGate）                        │              │
│  │   - Cache（content-hash 输入 → 输出）                                │              │
│  │   - Observability: 每次调用写 TraceableEvent                         │              │
│  └─────────────────────────────────────────────────────────────────────┘              │
│                                   │                                                    │
│  ┌─ ProviderAdapter（接入层）─────────────────────────────────────────┐              │
│  │   - AnthropicAdapter (SDK, direct API)                              │              │
│  │   - OpenAIAdapter                                                   │              │
│  │   - OllamaAdapter（本地）                                            │              │
│  │   - ClaudeCliAdapter（fallback 到现有 CLI，兼容老路径）             │              │
│  │   - MockAdapter（测试 + dry-run）                                    │              │
│  └─────────────────────────────────────────────────────────────────────┘              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

为什么是四层不是两层（你说的 provider + prompt）：

- **ProviderAdapter vs LLMGateway 分离**：Provider 只管"怎么打 HTTP、怎么 parse SSE"；Gateway 管"选哪个 provider、怎么重试、算不算超预算、缓不缓存"。分开后加新 provider 是 PR-sized 任务，不是架构级。
- **PromptKit 单独一层**：这是"把 prompt 当代码管理"的前提。不分出来就会退化成每个 caller 自己拼字符串（现状）。

---

## 观点 2：**直接走 SDK / HTTP API，不要继续 spawn CLI**

目前所有"轻量"调用都在 spawn `claude` CLI，每次启动开销 1-3 秒，还要经过 hook server、worktree、cost tracking 一整套为"完整 agent 任务"设计的基础设施。对于"给 event 生成一句摘要"这种场景——**不对路**。

建议：

- **新的 LLMGateway 走 SDK / HTTP**：直接 `@anthropic-ai/sdk` 或 `openai` npm 包。延迟从"进程启动 + CLI overhead"的 2-3s 降到"纯网络 RTT"的 ~500ms。
- **现有 Agent/Ask-Anywhere/Planner 暂时保持 CLI 路径**：它们需要 Tool use、hook、worktree 隔离，CLI 是合理的。未来可以考虑 `agent runtime` 也切 SDK（开启 Anthropic SDK 的 tool-use），但这是另一个话题。
- **二者之间的桥梁**：ClaudeCliAdapter 作为 Gateway 的一个可选 provider，意义是**离线场景 / 用户已经用 CLI 登录 / 不想配 API key** 也能走轻量能力，但代价是慢。

---

## 观点 3：PromptKit 要做成"注册制"，不是"函数调用"

对比两种 API：

**❌ 方案 A（我不推荐）**：自由拼接
```ts
await llm.complete({
  prompt: `Summarize this timeline event: ${JSON.stringify(event)}`,
  model: 'claude-haiku'
});
```
问题：prompt 散落在代码里，无法 A/B 测试、无法版本管理、无法让用户改、无法让 agent 自己改自己。

**✅ 方案 B（推荐）**：模板注册 + schema 约束
```ts
// src/main/llm/templates/timeline.ts
export const timelineEntrySummarize = defineTemplate({
  id: 'timeline.entry.summarize',
  version: 1,
  model: { preferred: 'haiku', maxTokens: 60 },
  input: z.object({
    kind: z.string(),
    payload: z.record(z.unknown()),
    userContext: z.string().optional()
  }),
  output: z.object({
    headline: z.string().max(80),
    detail: z.string().max(200)
  }),
  render: (v) => `Summarize this Orbit event in Chinese...\n\nKind: ${v.kind}\nPayload: ${JSON.stringify(v.payload)}`
});

// caller
const summary = await llm.invoke(timelineEntrySummarize, { kind, payload });
// summary 是强类型的 { headline, detail }
```

好处：
- **强类型 I/O**：caller 直接拿到 TypeScript 类型，不用 parse
- **模板集中 / 可版本化**：改 prompt 不是改业务代码
- **用户可覆盖**：未来 vault 里 `.orbit/llm-templates/` 可以 override 内置模板（BYOP — Bring Your Own Prompt），完美对齐 Orbit 的 local-first 哲学
- **Agent 自己可读自己**：`orbit llm templates list` / `orbit llm template show xxx`，Ask-Anywhere 能介绍自己的能力

---

## 观点 4：**缓存是这个系统的一等公民**，不是后来加的 feature

Timeline 展示一天的 event 摘要，如果每次打开都重新调 LLM —— 账单爆炸 + 延迟难受。

缓存策略（多层）：

| 层级 | Key | TTL / 失效 | 存储 |
|---|---|---|---|
| **Memory LRU** | `sha256(templateId + version + inputJSON)` | 进程生命周期 | RAM |
| **Vault 持久化** | 同上 + model | 永久，手动 GC | `<vault>/.orbit/llm-cache/<templateId>/<hash>.json` |
| **语义"锚定"** | 比如 `event_id` 作为锚 → 输入变化自动失效 | event mutate 时 invalidate | 索引文件 |

关键洞察：**大部分摘要类调用的 input 是"稳定的过去数据"（已发生的 event、已固化的 conversation turn），天然适合永久缓存**。不是 "LLM 调用贵所以缓存"，是"输入是冷数据所以根本不应该重算"。

---

## 观点 5：哪些场景值得跑一遍 LLM？（除了你提的两个，我额外扩展）

你提了两个：Timeline entry 摘要 + Ask-Anywhere 会话标题。我帮你再列：

### 🟢 强推荐（命中现有痛点）

1. **Timeline entry 摘要**（你提的）—— 把 `conversation started` → "和 Ask-Anywhere 讨论了 Orbit 下一阶段 UX 重构"
2. **Timeline daily headline / narrative** —— 现在是模板拼接"X meaningful events"，应该是"今天你在 twitter 抓取项目推了 2 个 PR，与 Claude 讨论了 3 次架构决策"
3. **Conversation 标题自动生成**（你提的）—— 在 2-3 轮对话后自动生成，而不是一直叫 "Ask Anywhere"
4. **Notes / Thoughts 自动打标签 + 提取实体** —— 支撑未来的 knowledge graph；现在 Capture 写下的 thought 没有任何 enrichment
5. **Feed 文章摘要**（RSS 进来先过一层摘要，用户扫时看摘要决定 Save/Skip）—— 直接提升 Feed 的信号密度

### 🟡 可做

6. **Capture promote 时智能建议 Resource 归属** —— "这篇文章和你已有的 `03_Resources/ai-agents.md` 主题相近，要 merge 吗？"（结合 vector search）
7. **Kanban task 标题改写** —— 用户快速写的 task title 有时太糙，比如 "改下那个东西"；LLM 根据 description 生成更好的 title
8. **Commit message 辅助**（已有 `git commit`，但目前无 AI 辅助）—— 基于 diff 生成 message 草稿
9. **Inbox message triage 优先级预测** —— 看 inbox 条目内容判断"这个需要你现在处理 / 可以放到 Daily Review 批处理"
10. **Open Questions 自动升级建议** —— `docs/open-questions.md` 累积太多时，LLM 聚类 + 建议归档或转 ADR

### 🔴 先不做（诱人但应该克制）

- **AI 自动重写用户笔记内容** —— 破坏用户数据的不可逆风险
- **AI 自动执行破坏性动作** —— Orbit 的哲学是"破坏性 = 审批"，LLM 摘要层不该触碰
- **AI 代替 Agent 做复杂任务** —— 这一层是"无状态快速调用"，不是 agent 替身

---

## 观点 6：**这一层给 Agent runtime 用是真实的**

你提到"未来做内置 runtime 多轮对话 agent 也会用到"——方向正确，但要清晰分层：

- **LLMGateway = 原子能力层**（invoke → result）
- **Agent runtime = 编排层**（circular loop + tool use + memory + approvals）

未来的"内置 Orbit Agent runtime"（比方说用 Anthropic SDK 的 tool-use 直接嵌入 Orbit，取代 `claude` CLI 子进程）会在 LLMGateway 之上构建，**不是并列关系而是依赖关系**。这样设计的好处：

- 新 runtime 自动继承所有 provider / 预算 / 缓存 / observability
- Agent 里的"子步骤推理"（比如 agent 想总结一下自己目前的进度再决定下一步）可以复用同一批模板
- 一套 prompt template 系统，"给用户看的摘要"和"给 agent 读的上下文"共用基建

---

## 观点 7：配置界面 + cost attribution

用户心智：**"这能力要花我钱，我要知道花在哪"**。设计上：

- Settings 里一个 "**LLM Gateway**" 面板：provider 列表（Anthropic / OpenAI / Ollama / Use Claude CLI）、默认 model、daily budget cap
- 每个 template 都有 `preferredModel`（例如 summarize 默认用 haiku / mini）但用户可全局 override
- Dashboard 新增"LLM usage today"，分模板统计次数 + 成本
- 每次 invoke 写一条 TraceableEvent（kind: `llm.invoke`），让 Developer Console 可查

---

## 我要问你决定的事

下面这些问题决定方案的"形状"，回完我就能写 feature 文档。

**Q1. Provider 优先级**
在 "直接 SDK" vs "复用 CLI" 之间，你的偏好是？
- 🅰️ **SDK 先行（我推荐）**：Anthropic SDK + OpenAI SDK 作为 MVP 两个 provider。用户需要配 API key 才能用轻量能力（走 CLI 的 Agent/Ask-Anywhere 不受影响）。优点：快、便宜、可控。缺点：多一个配置门槛。
- 🅱️ **CLI 复用先行**：先做 ClaudeCliAdapter，用户不用额外配。优点：零配置。缺点：慢、贵、没脱离 CLI 的硬依赖。
- 🅲️ **两者同时 MVP，用户选一**：SDK 为首选，Fallback 到 CLI。

**Q2. Prompt 模板的"数据归属"**
- 🅰️ 内置在代码里（`src/main/llm/templates/*.ts`），TypeScript 强类型
- 🅱️ 外置为 Markdown/YAML 文件（`resources/llm-templates/*.md` + frontmatter），运行时加载
- 🅲️ 两者结合：内置模板在代码，vault 里 `.orbit/llm-templates/` 可覆盖

我倾向 🅲️，和 Orbit 的 local-first / skill 化传统对齐。但 🅰️ 更快。

**Q3. 本期范围**
- 🅰️ **基建先行**：LLMGateway + PromptKit + Anthropic provider + MemoryLRU 缓存 + Settings UI；不接入任何业务场景。下一期再做 Timeline/Conversation title。
- 🅱️ **基建 + 1-2 个杀手场景一起**：基建 + Timeline entry summarize + Conversation title 自动生成，端到端走通。
- 🅲️ **大而全**：基建 + 上面"🟢 强推荐"那 5 个全接入。

我强烈推荐 🅱️——基建 + 2 个场景一起能**压力测试**设计，避免基建做完了没人用 / 接入时发现抽象错。🅰️ 的风险是"架构美但没验证"，🅲️ 的风险是"摊子太大"。

**Q4. 缓存策略**
- 🅰️ MemoryLRU only（进程重启就没了）
- 🅱️ Memory + Vault 持久化（你切日期再回来不用重算）
- 🅲️ 加语义失效（event/turn mutate 自动 invalidate）

我推荐 🅱️ 起步。🅲️ 作为 roadmap。

**Q5. 这层叫什么？**
命名很重要（以后所有文档、CLI 命令、IPC namespace 都围绕它）。候选：
- `LLM Gateway` / `llm-gateway`（技术直接）
- `Distillery`（和 BASB 的 Distill 阶段呼应，但会和现有 `distill/` 模块混淆）
- `Lens`（强调"看得更清楚"的产品语义）
- `Whisper` / `Echo` / ...（品牌化，但可能太抽象）
- `LLMKit`（工具箱感）

我倾向 **`LLM Gateway`**（内部技术名）+ 对外场景文案各自用具体词（"AI 摘要"、"AI 标题"）。理由是它本质就是 gateway 模式，别为了"优雅"制造认知噪音。

---

等你回这 5 个问题（或者只回关键的 Q1/Q3，其他我按默认走也可以），我会：

1. 初始化 `.session.json` 到 `docs/thinking-trail/2026-04-28-llm-gateway/`
2. 起草 ADR（这次必须写，不是 D-2 那种"落地已定方向"，而是真立新方向）
3. 写 `docs/plans/2026-04-28-llm-gateway-foundation.md`（含分期 PR 拆分）
4. 更新 ROADMAP / CHANGELOG 的 "Planned"

你先拍板，我再动笔。

---

## [User] 2026-04-28T06:58:52.907Z
SDK 先行，先不管openai sdk，只接入Anthropic SDK，因为我有minimax和deepseek的apikey，他们都提供anthropic api： https://api-docs.deepseek.com/zh-cn/guides/anthropic_api 和 https://platform.minimaxi.com/docs/token-plan/quickstart。实现的时候也优先实现这两个让我使用。
两者结合：内置模板在代码，vault 里 .orbit/llm-templates/ 可覆盖
大而全：基建 + 上面"🟢 强推荐"那 5 个全接入。
缓存策略： Memory + Vault 持久化
命名 LLM Gateway（内部技术名）+ 对外场景文案各自用具体词（“AI 摘要”、“AI 标题”）
除了这些问题之外，我还想问一个问题，上面的这些场景提供的内容足够做分析吗？比如event看到的是创建了一个会话，那实际上要语义化，还得有这个会话的内容，或者直接使用这个会话的标题，各种event应该怎么设计，才能真正的在timeline给用户有用的信息展示，你阅读一下之前对timeline的愿景规划，这里是一个人生记录本，如果展示的是些机械的内容就没意义了。

---

## [Assistant] 2026-04-28T06:59:17.101Z
你的 Q 问得很关键——实际上是整个方案的核心**架构断层**，比 provider/cache 那些决定重要得多。先把 timeline 的愿景读清楚再回答。

### Tool Calls:
- **search_file**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs","pattern":"*timeline*","recursive":true,"caseSensitive":false,"toolExplanation":"找 timeline 相关文档"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/timeline/store.ts","offset":80,"limit":185})
- **search_content**({"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared","pattern":"TimelineEntry|TraceableEvent|event_kind|TIMELINE_LAYER","outputMode":"files_with_matches","caseSensitive":true,"headLimit":10,"toolExplanation":"找 timeline/event 的 shared 类型"})

---

## [Tool] 2026-04-28T06:59:17.120Z
["plans/2026-04-27-activity-timeline-ui.md","thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md"]

---

## [Tool] 2026-04-28T06:59:17.121Z
    80|    await this.writeSummary(date, summary);
    81|    return summary;
    82|  }
    83|
    84|  async updateDailySummary(date: string, patch: { narrative?: string; headline?: string }): Promise<DailySummary> {
    85|    const current = (await this.readDailySummary(date)) ?? (await this.generateDailySummary(date));
    86|    const next: DailySummary = { ...current, ...patch, generated_at: new Date().toISOString() };
    87|    await this.writeSummary(date, next);
    88|    return next;
    89|  }
    90|
    91|  async exportMarkdown(scope: { kind: string; value: string }): Promise<{ path: string }> {
    92|    const outPath = path.join(this.vaultPath, '.orbit', 'timeline', 'exports', `${scope.kind}-${scope.value}.md`);
    93|    await fs.mkdir(path.dirname(outPath), { recursive: true });
    94|    if (scope.kind === 'day') {
    95|      const timeline = await this.getDay(scope.value);
    96|      await fs.writeFile(outPath, renderTimelineMarkdown(timeline), 'utf8');
    97|    } else {
    98|      await fs.writeFile(outPath, `# Timeline export: ${scope.kind} ${scope.value}\n\nGenerated by Orbit.\n`, 'utf8');
    99|    }
   100|    return { path: outPath };
   101|  }
   102|
   103|  private async eventsForDate(date: string, developerMode: boolean): Promise<TraceableEvent[]> {
   104|    const store = currentEventReplayStore();
   105|    if (!store) return [];
   106|    const result = await store.query({ limit: 10_000 });
   107|    return result.events
   108|      .filter((event) => event.at.startsWith(date))
   109|      .filter((event) => shouldShowOnTimeline(event.kind ?? event.type, developerMode));
   110|  }
   111|
   112|  private summaryPath(date: string): string {
   113|    return path.join(this.vaultPath, '.orbit', 'timeline', 'summaries', `${date}.json`);
   114|  }
   115|
   116|  private async readDailySummary(date: string): Promise<DailySummary | undefined> {
   117|    try {
   118|      return JSON.parse(await fs.readFile(this.summaryPath(date), 'utf8')) as DailySummary;
   119|    } catch (error) {
   120|      if (isNotFound(error)) return undefined;
   121|      throw error;
   122|    }
   123|  }
   124|
   125|  private async writeSummary(date: string, summary: DailySummary): Promise<void> {
   126|    await fs.mkdir(path.dirname(this.summaryPath(date)), { recursive: true });
   127|    await fs.writeFile(this.summaryPath(date), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
   128|  }
   129|}
   130|
   131|export function createTimelineStore(vaultPath: string): TimelineStore {
   132|  return new TimelineStore(vaultPath);
   133|}
   134|
   135|function projectEvent(event: TraceableEvent, developerMode: boolean): TimelineEntry | null {
   136|  const kind = event.kind ?? event.type;
   137|  if (!shouldShowOnTimeline(kind, developerMode)) return null;
   138|  const layer: 1 | 2 = TIMELINE_LAYER_1_KINDS.has(kind) ? 1 : 2;
   139|  const payload = (event.payload ?? {}) as Record<string, unknown>;
   140|  const noteType = String(payload['type'] ?? '');
   141|  const special = payload['special_marker'] as { kind?: string; icon?: string } | undefined;
   142|  const base: TimelineEntry = {
   143|    event_id: event.id,
   144|    event_kind: kind,
   145|    trace_id: event.traceId,
   146|    occurred_at: event.at,
   147|    layer,
   148|    icon: iconFor(kind, noteType, special?.icon),
   149|    title: titleFor(kind, payload, special?.kind),
   150|    summary: String(payload['title'] ?? event.summary ?? '').slice(0, 180),
   151|    refs: refsFor(kind, payload),
   152|    aggregation_key: aggregationKeyFor(kind, payload)
   153|  };
   154|  return base;
   155|}
   156|
   157|function iconFor(kind: string, noteType: string, specialIcon?: string): string {
   158|  if (specialIcon) return specialIcon;
   159|  if (kind === 'note.created') {
   160|    if (noteType === 'thought') return '💭';
   161|    if (noteType === 'longform') return '✍️';
   162|    if (noteType === 'voice_log') return '🎤';
   163|    if (noteType === 'daily_summary') return '🌙';
   164|    return '📌';
   165|  }
   166|  if (kind.startsWith('library.')) return '📚';
   167|  if (kind.startsWith('feed.')) return '🛰️';
   168|  if (kind.startsWith('kb.')) return '🧠';
   169|  if (kind.startsWith('scheduled_task.')) return '⏰';
   170|  if (kind.startsWith('conversation.')) return '💬';
   171|  if (kind.startsWith('resource.')) return '🧩';
   172|  if (kind.startsWith('agent.')) return '🤖';
   173|  if (kind.startsWith('task.')) return '✅';
   174|  return '•';
   175|}
   176|
   177|function titleFor(kind: string, payload: Record<string, unknown>, specialKind?: string): string {
   178|  if (specialKind) return `${specialKind}: ${String(payload['title'] ?? 'special capture')}`;
   179|  if (kind === 'note.created') return `Captured ${String(payload['type'] ?? 'note')}`;
   180|  if (kind === 'note.updated') return `Updated ${String(payload['title'] ?? 'note')}`;
   181|  if (kind === 'note.archived') return `Archived ${String(payload['title'] ?? 'note')}`;
   182|  if (kind === 'library.item.added') return `Saved Library item ${String(payload['title'] ?? '')}`.trim();
   183|  if (kind === 'kb.imported') return `Imported KB ${String(payload['name'] ?? '')}`.trim();
   184|  if (kind === 'kb.activated') return 'Activated knowledge into note';
   185|  if (kind === 'scheduled_task.execution.completed') return 'Scheduled task ran';
   186|  if (kind === 'resource.created') return `Created Resource ${String(payload['title'] ?? '')}`.trim();
   187|  if (kind === 'resource.updated') return `Updated Resource ${String(payload['title'] ?? '')}`.trim();
   188|  if (kind === 'resource.ref.linked') return `Linked material to ${String(payload['title'] ?? 'Resource')}`;
   189|  if (kind === 'resource.engagement') return `Engaged Resource ${String(payload['title'] ?? '')}`.trim();
   190|  if (kind === 'resource.archived') return `Archived Resource ${String(payload['title'] ?? '')}`.trim();
   191|  return kind.replace(/\./g, ' ');
   192|}
   193|
   194|function refsFor(kind: string, payload: Record<string, unknown>): TimelineEntry['refs'] {
   195|  if (kind.startsWith('note.') && typeof payload['path'] === 'string') {
   196|    return [{ kind: 'note', ref: payload['path'], label: String(payload['title'] ?? payload['note_id'] ?? 'note') }];
   197|  }
   198|  if (kind.startsWith('kb.') && typeof payload['kb_id'] === 'string') {
   199|    return [{ kind: 'kb', ref: payload['kb_id'], label: String(payload['name'] ?? payload['kb_id']) }];
   200|  }
   201|  if (kind.startsWith('scheduled_task.') && typeof payload['task_id'] === 'string') {
   202|    return [{ kind: 'task', ref: payload['task_id'], label: String(payload['name'] ?? payload['task_id']) }];
   203|  }
   204|  if (kind.startsWith('resource.') && typeof payload['slug'] === 'string') {
   205|    return [{ kind: 'resource', ref: payload['slug'], label: String(payload['title'] ?? payload['slug']) }];
   206|  }
   207|  return undefined;
   208|}
   209|
   210|function aggregationKeyFor(kind: string, payload: Record<string, unknown>): string | undefined {
   211|  if (kind === 'note.updated' && payload['note_id']) return `note-update:${String(payload['note_id'])}`;
   212|  return undefined;
   213|}
   214|
   215|function buildStats(entries: TimelineEntry[]): DailyStats {
   216|  return {
   217|    total_events: entries.length,
   218|    thoughts_count: entries.filter((entry) => entry.event_kind === 'note.created' && entry.icon === '💭').length,
   219|    longforms_wrote: entries.filter((entry) => entry.event_kind.startsWith('note.') && entry.icon === '✍️').length,
   220|    longforms_words: 0,
   221|    library_added: entries.filter((entry) => entry.event_kind === 'library.item.added').length,
   222|    library_read: entries.filter((entry) => entry.event_kind === 'library.item.read').length,
   223|    tasks_completed: entries.filter((entry) => entry.event_kind === 'task.completed').length,
   224|    projects_touched: refsByKind(entries, 'project'),
   225|    areas_touched: refsByKind(entries, 'area'),
   226|    resources_touched: refsByKind(entries, 'resource'),
   227|    conversations_count: entries.filter((entry) => entry.event_kind.startsWith('conversation.')).length
   228|  };
   229|}
   230|
   231|function refsByKind(entries: TimelineEntry[], kind: 'project' | 'area' | 'resource'): string[] {
   232|  return [...new Set(entries.flatMap((entry) => entry.refs ?? []).filter((ref) => ref.kind === kind).map((ref) => ref.ref))];
   233|}
   234|
   235|function datesForIsoWeek(isoWeek: string): string[] {
   236|  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
   237|  if (!match) return [];
   238|  const year = Number(match[1]);
   239|  const week = Number(match[2]);
   240|  const jan4 = new Date(Date.UTC(year, 0, 4));
   241|  const monday = new Date(jan4);
   242|  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
   243|  return Array.from({ length: 7 }, (_, index) => {
   244|    const d = new Date(monday);
   245|    d.setUTCDate(monday.getUTCDate() + index);
   246|    return d.toISOString().slice(0, 10);
   247|  });
   248|}
   249|
   250|function daysInMonth(month: string): string[] {
   251|  const [yearValue, monthValue] = month.split('-').map(Number);
   252|  if (!yearValue || !monthValue) return [];
   253|  const count = new Date(yearValue, monthValue, 0).getDate();
   254|  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
   255|}
   256|
   257|function renderTimelineMarkdown(timeline: DailyTimeline): string {
   258|  return `# Timeline ${timeline.date}\n\n${timeline.summary?.narrative ?? ''}\n\n${timeline.entries
   259|    .map((entry) => `- ${entry.occurred_at.slice(11, 16)} ${entry.icon} **${entry.title}** ${entry.summary ?? ''}`)
   260|    .join('\n')}\n`;
   261|}
   262|
   263|function isNotFound(error: unknown): boolean {
   264|  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

(Showing lines 80-264 of 265.)

---

## [Tool] 2026-04-28T06:59:17.122Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared/events/kinds.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared/events/payloads.ts
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared/events.ts

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Assistant] 2026-04-28T06:59:36.255Z
### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared/events.ts"})

---

## [Tool] 2026-04-28T06:59:36.267Z
     1|# 文档 5：Daily Timeline —— 人生日记
     2|
     3|> **规模**：L（约 3~4 天 AI 实施）
     4|> **依赖**：文档 1（需要 Note/Library/KB 事件定义）；TraceableEvent 基础
     5|> **产物**：Timeline 一级入口 + 日/周/月/年四级视图 + AI 今日总结 + 特殊事件融入 Quick Capture + PDF 导出
     6|
     7|---
     8|
     9|## 1. 设计哲学
    10|
    11|### 1.1 野心声明
    12|
    13|> "这本日记就是我的一生"
    14|
    15|Orbit Daily Timeline 不是普通的 activity log，而是**基于语义聚合的人生 event sourcing**。每一天、每一周、每一年都能被唤回、被回顾、被打印成书、被传承。
    16|
    17|### 1.2 核心架构决策
    18|
    19|**复用 TraceableEvent 作为底层事件源**，Timeline 是视图层而非存储层。
    20|
    21|这意味着：
    22|- 不新增"timeline 事件表"
    23|- 所有业务事件（note/library/project/task/conversation/...）通过 `TraceableEvent` 天然流入
    24|- Timeline 只负责**选择、聚合、渲染**
    25|- 未来接入外部事件（GitHub/Calendar）只需让它们也产 TraceableEvent
    26|
    27|
    28|---
    29|
    30|## 2. 事件分层（P2-D8）
    31|
    32|### 2.1 Layer 1 — User-Visible（默认显示）
    33|
    34|用户会说"我今天做了..."的事件。这些**必定**出现在 Timeline：
    35|
    36|| 事件 kind | 渲染形态 |
    37||----------|---------|
    38|| `note.created (thought)` | 💭 `时间` 捕获想法："开头..." |
    39|| `note.created (longform)` | ✍️ `时间` 开始写长文《标题》 |
    40|| `note.updated (longform, +N words)` | ✍️ `时间` 长文《标题》新增 N 字 |
    41|| `note.created (capture)` | 📌 `时间` 捕获（来源：xxx） |
    42|| `note.created (voice_log)` | 🎤 `时间` 语音日志 N 分钟 |
    43|| `note.archived` | 📦 `时间` 归档笔记 |
    44|| `library.item.added` | 📚 `时间` 收藏《xxx》 |
    45|| `library.item.read` | 📖 `时间` 读完《xxx》 |
    46|| `library.item.annotated` | 🖍️ `时间` 标注了 N 处 |
    47|| `library.item.distilled` | 💎 `时间` 提炼为 note |
    48|| `feed.source.added` | 📡 `时间` 订阅 xxx |
    49|| `feed.item.saved_to_library` | 📌 `时间` 从 feed 收藏 |
    50|| `project.created` | 🎯 `时间` 立项《xxx》 |
    51|| `project.completed` | 🏆 `时间` 完成项目《xxx》 |
    52|| `task.completed` | ✅ `时间` 完成任务 "xxx" |
    53|| `area.review.completed` | 🔄 `时间` 完成 Area 评审 |
    54|| `resource.created` | 🗂️ `时间` 立题 Resource "xxx" |
    55|| `resource.engagement` | 🔁 `时间` 触及 Resource "xxx" |
    56|| `conversation.meaningful` | 💬 `时间` 和 AA 讨论 xxx |
    57|| `scheduled_task.execution.completed` | ⏰ `时间` 定时任务执行 |
    58|| `kb.imported` | 📥 `时间` 导入 KB |
    59|| `vision.milestone.reached` | 🌟 `时间` 里程碑达成（Vision Phase 后启用）|
    60|| `capture.special` | ⭐ 特殊事件（见 §4）|
    61|
    62|### 2.2 Layer 2 — Developer-Visible（默认折叠）
    63|
    64|- `agent.run.started / done`
    65|- `tool_use / tool_result`
    66|- IPC trace
    67|- runtime event
    68|
    69|Timeline 上**有**这些事件，但默认 collapse。设置里开"开发者模式"后展开。
    70|
    71|### 2.3 Layer 3 — System-Noise（不上 Timeline）
    72|
    73|按 P2-D8 **完全不上**：
    74|- `heartbeat`
    75|- `cost` 细粒度事件
    76|- 文件系统 watcher 内部事件
    77|- IPC 心跳
    78|- 其他系统 trace
    79|
    80|在 TraceableEventStore 里**保留**（用于调试和复盘），但 Timeline **不查询**。
    81|
    82|### 2.4 实现：Event Kind 白名单
    83|
    84|```typescript
    85|// src/shared/timeline/event-filter.ts
    86|
    87|export const TIMELINE_LAYER_1_KINDS = new Set([
    88|  'note.created',
    89|  'note.updated',              // 只有特定类型才要
    90|  'note.archived',
    91|  'library.item.added',
    92|  'library.item.read',
    93|  // ... 全部 Layer 1
    94|]);
    95|
    96|export const TIMELINE_LAYER_2_KINDS = new Set([
    97|  'agent.run.started',
    98|  'agent.run.completed',
    99|  // ... Layer 2
   100|]);
   101|
   102|export function shouldShowOnTimeline(
   103|  event: TraceableEvent,
   104|  developerMode: boolean,
   105|): boolean {
   106|  if (TIMELINE_LAYER_1_KINDS.has(event.kind)) return true;
   107|  if (developerMode && TIMELINE_LAYER_2_KINDS.has(event.kind)) return true;
   108|  return false;
   109|}
   110|```
   111|
   112|---
   113|
   114|## 3. 数据模型
   115|
   116|### 3.1 TimelineEntry（视图层的统一结构）
   117|
   118|```typescript
   119|// src/shared/timeline/types.ts
   120|
   121|export interface TimelineEntry {
   122|  // 来源
   123|  event_id: string;                 // TraceableEvent.id
   124|  event_kind: string;
   125|  trace_id?: string;
   126|  
   127|  // 时间
   128|  occurred_at: string;              // ISO
   129|  
   130|  // 分层
   131|  layer: 1 | 2;                     // Layer 3 不进
   132|  
   133|  // 显示
   134|  icon: string;                     // emoji 或 lucide icon 名
   135|  title: string;                    // "捕获想法"
   136|  summary?: string;                 // "开头第一段..."
   137|  
   138|  // 引用实体
   139|  refs?: Array<{
   140|    kind: 'note' | 'library' | 'project' | 'area' | 'resource' | 'task' | 'conversation' | 'kb';
   141|    ref: string;                    // 路径或 id
   142|    label?: string;
   143|  }>;
   144|  
   145|  // 聚合 hint（同类事件短时间内可合并）
   146|  aggregation_key?: string;         // e.g. "longform-update:<note-id>"
   147|  
   148|  // 关联事件（语义承接）
   149|  derived_from?: string[];          // 其他 entry 的 event_id
   150|}
   151|
   152|export interface DailyTimeline {
   153|  date: string;                     // YYYY-MM-DD
   154|  entries: TimelineEntry[];
   155|  stats: DailyStats;
   156|  summary?: DailySummary;
   157|}
   158|
   159|export interface DailyStats {
   160|  total_events: number;
   161|  thoughts_count: number;
   162|  longforms_wrote: number;          // 今天有写长文的数量
   163|  longforms_words: number;          // 今天新增字数
   164|  library_added: number;
   165|  library_read: number;
   166|  tasks_completed: number;
   167|  projects_touched: string[];       // 今天触及的 project paths
   168|  areas_touched: string[];
   169|  resources_touched: string[];
   170|  conversations_count: number;
   171|}
   172|
   173|export interface DailySummary {
   174|  generated_at: string;
   175|  note_path: string;                // notes/daily-summaries/YYYY-MM-DD.md
   176|  headline: string;                 // "深度工作日"
   177|  narrative: string;                // 150~300 字
   178|  highlights?: string[];
   179|}
   180|```
   181|
   182|### 3.2 TimelineIndex（缓存 + 性能）
   183|
   184|为了年/月视图快速加载，做一个索引：
   185|
   186|```typescript
   187|// .orbit/timeline/index/
   188|//   2026-04.json        # 月索引
   189|//   2026.json           # 年索引
   190|
   191|export interface MonthlyIndex {
   192|  month: string;                    // "2026-04"
   193|  days: Array<{
   194|    date: string;
   195|    entry_count: number;
   196|    highlight_kinds: string[];      // 当天出现的主要事件类型
   197|    summary_headline?: string;
   198|  }>;
   199|}
   200|
   201|export interface YearlyIndex {
   202|  year: number;                     // 2026
   203|  months: Array<{
   204|    month: string;
   205|    total_events: number;
   206|    days_active: number;            // 当月活跃天数
   207|  }>;
   208|}
   209|```
   210|
   211|增量更新：每次 Layer 1 事件产生时，异步 upsert 月/年索引。
   212|
   213|### 3.3 SpecialCapture（特殊事件，P2-D10）
   214|
   215|特殊事件融入 Quick Capture（不单独做新实体）。在 Note frontmatter 新增字段：
   216|
   217|```yaml
   218|---
   219|id: note-xxx
   220|type: capture
   221|special_marker:
   222|  kind: insight | breakthrough | setback | milestone | gratitude | reflection
   223|  icon: 🌟 | 💡 | 💔 | 🏁 | 🙏 | 🪞
   224|---
   225|```
   226|
   227|Timeline 渲染时对 `special_marker` 有的 note 做特殊高亮（大 icon + 更突出的卡片）。
   228|
   229|Quick Capture UI 里新增"标记为特殊"选项：
   230|```
   231|┌─ Quick Capture ──────────────────┐
   232|│ ┌────────────────────────────┐   │
   233|│ │ 今天想通了一件事...         │   │
   234|│ └────────────────────────────┘   │
   235|│                                  │
   236|│ 类型: [thought ▼]                │
   237|│ 特殊? [ ] 无                     │
   238|│        [x] 💡 灵感时刻           │
   239|│        [ ] 🌟 突破               │
   240|│        [ ] 💔 挫折               │
   241|│        [ ] 🏁 里程碑             │
   242|│        [ ] 🙏 感恩               │
   243|│        [ ] 🪞 反思               │
   244|│                                  │
   245|│ [取消]            [捕获]         │
   246|└──────────────────────────────────┘
   247|```
   248|
   249|---
   250|
   251|## 4. UI 设计（P2-D7 全套采纳）
   252|
   253|### 4.1 一级入口
   254|
   255|- 位置：左侧栏顶部区域（Daily 是核心体验），放在 Ask-Anywhere 之上或并列
   256|- icon: `Calendar` (lucide)
   257|- 文案: "Timeline"（或 "Daily"）
   258|- 路由: `/timeline`（默认 `/timeline/today`）
   259|
   260|### 4.2 日视图
   261|
   262|```
   263|┌──────────────────────────────────────────────────────────────────┐
   264|│ [← 2026-04-29]  2026-04-30 周三  [2026-05-01 →]  [日|周|月|年]   │
   265|│                                            [📄 导出PDF] [⚙️]      │
   266|│ ────────────────────────────────────────────────────────────── │
   267|│                                                                 │
   268|│  ╭─── 今日一瞥 ───────────────────────────────────────────╮   │
   269|│  │  📊 18 个事件    📝 7 个 thoughts    ✍️ 新增 1240 字       │   │
   270|│  │  ✅ 4 个任务     💬 2 次 AA 对话      📚 2 篇文章已读      │   │
   271|│  │  🎯 2 个项目有进展                                         │   │
   272|│  ╰────────────────────────────────────────────────────────╯   │
   273|│                                                                 │
   274|│  ── 早晨 (06:00 - 12:00) ──                                    │
   275|│                                                                 │
   276|│   09:10  📡  订阅了 Tiago Forte 的 newsletter                   │
   277|│                                                                 │
   278|│   09:30  📌  从 feed 收藏《Building a Second Brain 2025》      │
   279|│             ↳ 稍后阅读                                          │
   280|│                                                                 │
   281|│   10:15  📚  打开阅读 《Building a Second Brain 2025》          │
   282|│                                                                 │
   283|│   10:42  💡  灵感时刻: "渐进式总结对定时任务设计很有启发"        │
   284|│             ↳ 来自阅读《Building a Second Brain 2025》          │
   285|│             → 归入 resources/second-brain                       │
   286|│                                                                 │
   287|│  ── 上午 (12:00 - 14:00) ──                                    │
   288|│                                                                 │
   289|│   11:23  🎯  立项《orbit-resource-system》                      │
   290|│                                                                 │
   291|│   11:47  💬  和 Ask-Anywhere 讨论 Resource 设计 (45 min)       │
   292|│             ↳ 产出：ADR-016 草稿                                │
   293|│                                                                 │
   294|│  ── 下午 (14:00 - 18:00) ──                                    │
   295|│                                                                 │
   296|│   14:00  ✍️  开始写长文《第二大脑在工具里的实现》                │
   297|│                                                                 │
   298|│   15:40  ✍️  长文新增 1240 字  (聚合: 4 次保存)                  │
   299|│                                                                 │
   300|│   16:30  ✅  完成任务 "Stage View 原型"                         │
   301|│                                                                 │
   302|│  ── 夜晚 (18:00 - 24:00) ──                                    │
   303|│                                                                 │
   304|│   19:30  🎤  语音日志 (8 min)                                   │
   305|│             "今天想明白了 Resource 不是静态素材..."              │
   306|│                                                                 │
   307|│   20:15  📖  读完《Building a Second Brain 2025》               │
   308|│                                                                 │
   309|│   21:00  🔄  完成 Area "工程 team lead" 的周评审                │
   310|│                                                                 │
   311|│  ╭─── 🌙 今日总结 (AA 自动生成, 21:45) ─────────────────────╮   │
   312|│  │                                                          │   │
   313|│  │  主线: "Resource 系统设计" 贯穿全天。从 feed 收藏到立项    │   │
   314|│  │  到长文创作，形成完整的 Distill→Express 闭环。            │   │
   315|│  │  灵感时刻: 10:42 的渐进式总结联想让整个下午的写作顺流而下。 │   │
   316|│  │  这是典型的深度工作日。                                    │   │
   317|│  │                                                          │   │
   318|│  │  明日延续: 长文还差结尾；ADR-016 要和阶段 3 连接。        │   │
   319|│  │                                                          │   │
   320|│  │  [展开完整] [编辑] [发到邮箱] [加入 longform]               │   │
   321|│  ╰──────────────────────────────────────────────────────────╯   │
   322|│                                                                 │
   323|│ ──────────────────────────────────────────────────────────── │
   324|│  [⬇ 展开 3 条开发者事件（Layer 2）]                              │
   325|└──────────────────────────────────────────────────────────────────┘
   326|```
   327|
   328|### 4.3 时段分组算法
   329|
   330|```typescript
   331|function groupByTimeOfDay(entries: TimelineEntry[]): TimeSegmentGroup[] {
   332|  const segments = [
   333|    { id: 'dawn',    label: '清晨',  range: [5, 8] },
   334|    { id: 'morning', label: '早晨',  range: [8, 12] },
   335|    { id: 'noon',    label: '上午',  range: [12, 14] },
   336|    { id: 'afternoon', label: '下午', range: [14, 18] },
   337|    { id: 'evening', label: '夜晚',  range: [18, 24] },
   338|    { id: 'night',   label: '深夜',  range: [0, 5] },
   339|  ];
   340|  // 按 entry.occurred_at 的小时归到对应 segment
   341|}
   342|```
   343|
   344|### 4.4 事件聚合
   345|
   346|同类型事件短时间内合并成一行。规则：
   347|
   348|```typescript
   349|function aggregate(entries: TimelineEntry[]): TimelineEntry[] {
   350|  // 1. 长文多次保存 → 合并为一条 "新增 N 字"
   351|  //    aggregation_key: "longform-update:<note-id>"
   352|  //    合并窗口: 10 分钟
   353|  
   354|  // 2. 多次标注同一 library → "标注了 N 处"
   355|  
   356|  // 3. 多次 task 完成（同一 project）在 10 分钟内 → "完成 3 个任务 on <project>"
   357|  
   358|  // 4. 其他事件不聚合
   359|}
   360|```
   361|
   362|### 4.5 周视图
   363|
   364|```
   365|┌──────────────────────────────────────────────────────────────────┐
   366|│ [← 上周]  2026-04-27 ~ 2026-05-03  [下周 →]  [日|周|月|年]       │
   367|│ ────────────────────────────────────────────────────────────── │
   368|│                                                                 │
   369|│  ┌────────┬────────┬────────┬────────┬────────┬────────┬──────┐ │
   370|│  │   周一  │  周二  │  周三  │  周四  │  周五  │  周六  │ 周日 │ │
   371|│  │  04-27 │  04-28 │  04-29 │  04-30 │  05-01 │  05-02 │05-03│ │
   372|│  ├────────┼────────┼────────┼────────┼────────┼────────┼──────┤ │
   373|│  │  💭 3  │  💭 5  │  💭 7  │  ⛅️    │        │        │      │ │
   374|│  │  ✅ 2  │  ✅ 4  │  ✅ 4  │  Today │        │        │      │ │
   375|│  │  ✍️ 0  │  ✍️ 1  │  ✍️ 2  │        │        │        │      │ │
   376|│  │   ...  │   ...  │   ...  │        │        │        │      │ │
   377|│  │  [点开]│  [点开]│  [点开]│        │        │        │      │ │
   378|│  ├────────┴────────┴────────┴────────┴────────┴────────┴──────┤ │
   379|│  │  📅 本周一句话总结（AA 周总结，周日 22:00 生成）               │ │
   380|│  │  "围绕 Orbit Phase 2 的深度设计周。完成 6 份设计文档..."     │ │
   381|│  └──────────────────────────────────────────────────────────────┘ │
   382|│                                                                 │
   383|│  本周重点事件                                                    │
   384|│  · 立项 orbit-resource-system                                   │
   385|│  · 长文《第二大脑在工具里的实现》 完成初稿                        │
   386|│  · 💡 3 个灵感时刻                                              │
   387|└──────────────────────────────────────────────────────────────────┘
   388|```
   389|
   390|### 4.6 月视图
   391|
   392|```
   393|┌──────────────────────────────────────────────────────────────────┐
   394|│ [← 03]  2026 年 4 月  [05 →]              [日|周|月|年]         │
   395|│ ────────────────────────────────────────────────────────────── │
   396|│                                                                 │
   397|│  ┌───┬───┬───┬───┬───┬───┬───┐                                  │
   398|│  │周一│周二│周三│周四│周五│周六│周日│                                  │
   399|│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
   400|│  │ 30│ 31│ 1 │ 2 │ 3 │ 4 │ 5 │  (颜色深浅代表活跃度)             │
   401|│  │ ░ │ ░ │▒▒│▒▒▒│▓▓│▓▓▓│ ░ │                                  │
   402|│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
   403|│  │ 6 │ 7 │ 8 │ 9 │10 │11 │12 │                                  │
   404|│  │▒▒│▓▓▓│▒▒│▒▒▒│▓▓│ ░ │ ░ │                                  │
   405|│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
   406|│  │13 │14 │15 │16 │17 │18 │19 │                                  │
   407|│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
   408|│  │20 │21 │22 │23 │24 │25 │26 │                                  │
   409|│  ├───┼───┼───┼───┼───┼───┼───┤                                  │
   410|│  │27 │28 │29 │30 │   │   │   │                                  │
   411|│  │▓▓│▓▓▓│▓▓▓│█ │                                                │
   412|│  └───┴───┴───┴───┴───┴───┴───┘                                  │
   413|│                                                                 │
   414|│  月度亮点                                                        │
   415|│  · 立项 2 个，完成 1 个                                         │
   416|│  · 28 个 thoughts                                               │
   417|│  · 最活跃日: 4 月 29 日（32 事件）                               │
   418|│  · 💡 5 个灵感时刻                                              │
   419|│                                                                 │
   420|│  [月度 AA 总结（由 AA 生成）]                                    │
   421|│  "四月是 Orbit Phase 2 设计爆发期，围绕知识栈..."               │
   422|└──────────────────────────────────────────────────────────────────┘
   423|```
   424|
   425|### 4.7 年视图（热力图）
   426|
   427|```
   428|┌──────────────────────────────────────────────────────────────────┐
   429|│ [← 2025]  2026 年  [2027 →]              [日|周|月|年]          │
   430|│ ────────────────────────────────────────────────────────────── │
   431|│                                                                 │
   432|│  1月 ░░░▒▒▓▓▓▓▒▒░░░░▒▒▒▒▓▒▒░░░░░░░                              │
   433|│  2月 ▒▒▒▒▓▓▓▓▓▒▒▒░░░▒▒▓▓▒▒▒▒▒░                                  │
   434|│  3月 ▓▓▓▓▓▓▒▒▒▒▒▓▓▓▓▓▓▒▒▒░░▒▒▓▓▓▓▒▒░                           │
   435|│  4月 ▓▓▓▒▒▒▓▓▓▓▓▒▒▒▓▓▓█▓▒▒░░▓▓██▓▒                             │
   436|│  5月 ░░░░                                                        │
   437|│  ...                                                             │
   438|│                                                                 │
   439|│  ┌── 年度亮点 ──────────────────────────────────────────────┐   │
   440|│  │ · 最活跃月: 4 月 (487 事件)                                │   │
   441|│  │ · 连续活跃: 28 天                                          │   │
   442|│  │ · 新增长文: 12 篇                                          │   │
   443|│  │ · 立项: 7 个，完成: 4 个                                   │   │
   444|│  │ · 💡 灵感时刻: 23 次                                       │   │
   445|│  └─────────────────────────────────────────────────────────┘   │
   446|│                                                                 │
   447|│  [年度 AA 总结 · 本年主题演化 · 导出年鉴 PDF]                     │
   448|└──────────────────────────────────────────────────────────────────┘
   449|```
   450|
   451|### 4.8 PDF 导出
   452|
   453|- 单日 PDF：完整的日视图 + 今日总结 + 所有关联产物的摘要
   454|- 周 / 月 PDF：概览 + 每天简述
   455|- 年鉴 PDF：热力图 + 重点事件列表 + 年度总结
   456|
   457|技术选型：
   458|- `puppeteer` 或 `electron`'s `webContents.printToPDF()`
   459|- 模板用 React + 打印样式 `@media print`
   460|- 文件输出到 `vault/exports/timeline/`
   461|
   462|
   463|---
   464|
   465|## 5. AI 今日总结
   466|
   467|### 5.1 触发机制
   468|
   469|通过**系统预置定时任务**（见文档 2 第 4.1 节）：
   470|
   471|```typescript
   472|// 每晚 22:00 运行
   473|{
   474|  system_key: 'daily-summary',
   475|  schedule: { kind: 'daily', time: '22:00' },
   476|  action: {
   477|    kind: 'ask_anywhere',
   478|    prompt: DAILY_SUMMARY_PROMPT,
   479|  },
   480|}
   481|```
   482|
   483|### 5.2 Prompt 模板
   484|
   485|```
   486|你是 Orbit 的每日总结助手。请基于用户 {today} 的 Timeline 事件，生成一段总结。
   487|
   488|【今日事件列表】
   489|{events}
   490|
   491|【今日数据】
   492|- 事件总数: {stats.total_events}
   493|- 笔记产出: {stats.thoughts_count} 条 thought, {stats.longforms_words} 字长文
   494|- 完成任务: {stats.tasks_completed}
   495|- 触及的 Projects: {stats.projects_touched}
   496|- 触及的 Areas: {stats.areas_touched}
   497|- 触及的 Resources: {stats.resources_touched}
   498|- 对话次数: {stats.conversations_count}
   499|
   500|【要求】
   501|1. 150-300 字
   502|2. 第二人称"你"
   503|3. 温暖、精确、不鸡汤
   504|4. 包括 4 部分:
   505|   - headline: 10 字内概括（如"深度工作日"、"探索日"、"修复日"）
   506|   - 主线叙事: 今天最重要的 1-2 件事，以及它们之间的承接
   507|   - 隐藏关联: 看似无关但其实连贯的事件（如上午的 feed 收藏→下午的长文）
   508|   - 明日延续: 今天未完成/挖坑
   509|
   510|【输出格式】
   511|以 JSON 输出:
   512|{
   513|  "headline": "...",
   514|  "narrative": "...",
   515|  "highlights": ["...", "..."]
   516|}
   517|```
   518|
   519|### 5.3 产物
   520|
   521|- 生成一个 note：`notes/daily-summaries/YYYY-MM-DD.md`
   522|- frontmatter `type: daily_summary`
   523|- Timeline 底部卡片展示 summary
   524|- 同时 emit 事件 `daily_summary.generated`
   525|
   526|### 5.4 手动触发
   527|
   528|用户在 Timeline 日视图里，当天还没总结（比如 22:00 前）：
   529|
   530|```
   531|┌─ 今日尚未总结 ─────────────────────┐
   532|│  [立即生成总结]                     │
   533|│  将总结设为今晚 22:00 自动生成      │
   534|└────────────────────────────────────┘
   535|```
   536|
   537|---
   538|
   539|## 6. IPC / API
   540|
   541|```typescript
   542|IPC.timeline = {
   543|  // 获取指定日期的 timeline
   544|  getDay: (date: string, options?: { developerMode?: boolean }) => Promise<DailyTimeline> => {},
   545|  
   546|  // 周/月/年
   547|  getWeek: (isoWeek: string) => {},          // "2026-W17"
   548|  getMonth: (month: string) => {},           // "2026-04"
   549|  getYear: (year: number) => {},
   550|  
   551|  // 索引（用于日历热力图）
   552|  getMonthlyIndex: (month: string) => Promise<MonthlyIndex> => {},
   553|  getYearlyIndex: (year: number) => Promise<YearlyIndex> => {},
   554|  
   555|  // 手动触发今日总结
   556|  generateDailySummary: (date: string) => Promise<DailySummary> => {},
   557|  
   558|  // 编辑总结（用户可改）
   559|  updateDailySummary: (date: string, patch: { narrative?: string; headline?: string }) => {},
   560|  
   561|  // 导出 PDF
   562|  exportPDF: (scope: { kind: 'day' | 'week' | 'month' | 'year'; value: string }) => Promise<{ path: string }> => {},
   563|  
   564|  // 订阅变化（有新事件时）
   565|  subscribeDay: (date: string, cb: (timeline: DailyTimeline) => void) => () => void => {},
   566|};
   567|```
   568|
   569|---
   570|
   571|## 7. 事件投影机制
   572|
   573|### 7.1 TraceableEvent → TimelineEntry 映射
   574|
   575|每个 event kind 需要一个 projector：
   576|
   577|```typescript
   578|// src/main/timeline/projectors.ts
   579|
   580|type Projector = (event: TraceableEvent, context: ProjectorContext) => TimelineEntry | null;
   581|
   582|const projectors: Record<string, Projector> = {
   583|  'note.created': (event, ctx) => {
   584|    const { note_id, type, title, body } = event.payload;
   585|    const iconMap = {
   586|      thought: '💭',
   587|      longform: '✍️',
   588|      capture: '📌',
   589|      voice_log: '🎤',
   590|      daily_summary: '🌙',
   591|    };
   592|    return {
   593|      event_id: event.id,
   594|      event_kind: event.kind,
   595|      occurred_at: event.occurred_at,
   596|      layer: 1,
   597|      icon: iconMap[type],
   598|      title: type === 'thought' ? '捕获想法' : ...,
   599|      summary: truncate(body, 80),
   600|      refs: [{ kind: 'note', ref: event.payload.path, label: title }],
   601|    };
   602|  },
   603|  
   604|  'note.updated': (event, ctx) => {
   605|    // 只对 longform 且字数变化大 > 100 时投影
   606|    if (event.payload.type !== 'longform') return null;
   607|    if (Math.abs(event.payload.word_delta) < 100) return null;
   608|    return {
   609|      ...,
   610|      aggregation_key: `longform-update:${event.payload.note_id}`,
   611|    };
   612|  },
   613|  
   614|  'library.item.added': (event) => ({ /* ... */ }),
   615|  
   616|  // ... 所有 Layer 1 event kinds
   617|};
   618|```
   619|
   620|### 7.2 特殊事件投影
   621|
   622|```typescript
   623|'note.created': (event, ctx) => {
   624|  const entry = baseProjector(event, ctx);
   625|  if (event.payload.special_marker) {
   626|    entry.icon = event.payload.special_marker.icon;
   627|    entry.title = SPECIAL_TITLES[event.payload.special_marker.kind] + ": " + entry.summary;
   628|    entry.layer = 1;  // 特殊事件强制 Layer 1
   629|  }
   630|  return entry;
   631|},
   632|```
   633|
   634|### 7.3 关联推断（derived_from）
   635|
   636|两个事件之间的承接关系由 projector 推断：
   637|
   638|- `library.item.read` 之后 10 分钟内的 `note.created(capture)` → capture.derived_from = library.read
   639|- `feed.item.saved_to_library` → `library.item.added` 自动关联
   640|- `conversation.message_sent` 里提到某 library 名字 → 关联
   641|
   642|这些关联用**渲染时的`↳`**来展示。
   643|
   644|---
   645|
   646|## 8. 实施步骤
   647|
   648|### Step 1: 数据模型 + 事件白名单（半天）
   649|1. `src/shared/timeline/types.ts`
   650|2. `src/shared/timeline/event-filter.ts`
   651|3. 补齐所有 Phase 2 新增事件（note/library/feed/kb/para 等）的定义
   652|4. `src/main/timeline/projectors.ts`（每个 event kind 的 projector）
   653|
   654|### Step 2: Timeline Store（1 天）
   655|1. `src/main/timeline/store.ts`
   656|2. 从 TraceableEventStore 按日期范围读取 events → 投影成 TimelineEntry
   657|3. 聚合规则（长文、任务等）
   658|4. 索引生成（月/年）
   659|5. IPC 暴露
   660|
   661|### Step 3: 日视图 UI（1 天）
   662|1. `src/renderer/views/TimelineView.tsx`
   663|2. `src/renderer/components/timeline/DailyTimeline.tsx`
   664|3. `src/renderer/components/timeline/TimelineEntryCard.tsx`
   665|4. `src/renderer/components/timeline/TodaysGlanceCard.tsx`
   666|5. `src/renderer/components/timeline/DailySummaryCard.tsx`
   667|6. 时段分组渲染
   668|
   669|### Step 4: 周/月/年视图（1 天）
   670|1. `src/renderer/components/timeline/WeeklyView.tsx`
   671|2. `src/renderer/components/timeline/MonthlyCalendar.tsx`（热力色块）
   672|3. `src/renderer/components/timeline/YearlyHeatmap.tsx`
   673|4. 视图切换器
   674|
   675|### Step 5: 今日总结（半天）
   676|1. 系统定时任务 `daily-summary` 注册
   677|2. Prompt 模板实装
   678|3. 手动触发 API
   679|4. 总结编辑 UI
   680|
   681|### Step 6: 特殊事件 + Quick Capture（半天）
   682|1. Quick Capture UI 增加 "特殊标记" 选择
   683|2. Note frontmatter 新增 `special_marker`
   684|3. Projector 渲染特殊样式
   685|
   686|### Step 7: PDF 导出（半天）
   687|1. PDF 模板（React + print CSS）
   688|2. 日/周/月/年四种模板
   689|3. 导出 IPC
   690|
   691|### Step 8: 测试 + 打磨（半天）
   692|1. 跑过完整的 Phase 1+2 事件 → timeline 正确渲染
   693|2. 开发者模式切换（Layer 2 展开）
   694|3. 空日（没事件）的优雅降级
   695|4. 大日（几百个事件）的性能
   696|
   697|**总计：约 4~5 天 AI 实施**
   698|
   699|---
   700|
   701|## 9. 验收标准
   702|
   703|- [ ] Timeline 一级入口可见
   704|- [ ] 日视图：时段分组、今日一瞥、AI 总结卡片
   705|- [ ] 日视图 entry 渲染正确（所有 Layer 1 event kinds）
   706|- [ ] 事件聚合工作（长文、多次任务）
   707|- [ ] 承接关系 ↳ 渲染正确
   708|- [ ] 周视图：7 天卡片 + 本周总结
   709|- [ ] 月视图：日历 + 热力色块 + 月度亮点
   710|- [ ] 年视图：热力图 + 年度亮点
   711|- [ ] 视图切换流畅
   712|- [ ] AI 今日总结：定时任务自动生成 + 手动触发
   713|- [ ] 特殊事件融入 Quick Capture
   714|- [ ] PDF 导出（日/周/月/年）
   715|- [ ] Layer 2 折叠/展开（开发者模式）
   716|- [ ] Layer 3 绝对不出现在 Timeline
   717|
   718|---
   719|
   720|## 10. Future-Proof
   721|
   722|### 架构预留（现在不实现）
   723|
   724|1. **外部事件流入**
   725|   - GitHub commits (`external.github.commit`)
   726|   - Calendar events (`external.calendar.event`)
   727|   - Health data (`external.health.activity`)
   728|   - Email 重要事件 (`external.email.flagged`)
   729|   - 架构上：TraceableEvent 的 kind 前缀 `external.*`，projector 继续扩展
   730|
   731|2. **隐私层级**
   732|   - `TimelineEntry.visibility: 'normal' | 'private' | 'encrypted'`
   733|   - 某些事件可标记"**隐身**"：不进 AI 总结、不进年鉴 PDF
   734|   - 加密存储（未来加 SQLCipher 或 EncFS 包装）
   735|
   736|3. **Memory 可视化**
   737|   - 某个 entry 未来被引用/关联的次数
   738|   - "这段回忆被唤回 N 次"
   739|
   740|4. **年鉴成书**
   741|   - 未来可以把一年的 timeline 打印成一本书
   742|   - 精装封面、章节目录、索引
   743|
   744|### 数据字段预留
   745|
   746|```typescript
   747|interface TimelineEntry {
   748|  // ... 已有字段
   749|  
   750|  // Future-Proof 预留
   751|  visibility?: 'normal' | 'private' | 'encrypted';   // 隐私
   752|  external_source?: string;                           // 外部来源
   753|  engagement_count?: number;                          // 被回忆次数
   754|  emotional_tone?: 'positive' | 'neutral' | 'negative';  // AI 情感分析
   755|  location?: { lat: number; lng: number };             // 地理（如有）
   756|}
   757|```
   758|
   759|---
   760|
   761|## 11. 和其他文档的连接
   762|
   763|| 文档 | 本文档如何依赖 |
   764||------|---------------|
   765|| 文档 1（笔记系统） | Note 事件是 Timeline 的主要来源 |
   766|| 文档 2（定时任务） | daily-summary 作为系统定时任务 |
   767|| 文档 4（Stage View） | Timeline 的 entry 可以有 artifact 链接（跳转到当时的 stage） |
   768|| 文档 6（Resource） | Resource engagement 事件进 Timeline；Resource 页面的 timeline 视图是本文档的子集 |

(End of file. Total 768 lines.)

---

## [Tool] 2026-04-28T06:59:36.269Z
     1|import type { TraceableEventKind } from './events/kinds';
     2|import type { TraceableEventPayloadMap } from './events/payloads';
     3|
     4|export const TRACEABLE_EVENT_SOURCES = ['activity', 'agent', 'inbox', 'ipc', 'conversation'] as const;
     5|export type TraceableEventSource = (typeof TRACEABLE_EVENT_SOURCES)[number];
     6|
     7|/**
     8| * Phase 1 迁移期：`kind` 与 `type` 并存。
     9| * - 新代码应提供 `kind`（强类型枚举），bus 会自动镜像到 `type`。
    10| * - 旧 publisher 仅提供 `type`（任意字符串）；读取端可用
    11| *   `isTraceableEventKind(event.type)` 后归一化。
    12| *
    13| * 详见 docs/thinking-trail/2026-04-29-chat-unification-decoupling/02-app-bus-design.md §3.4。
    14| */
    15|export interface TraceableEvent {
    16|  id: string;
    17|  at: string;
    18|  source: TraceableEventSource;
    19|  type: string;
    20|  /** 迁移期可选；新 publisher 应提供。`payload` 强类型仅在 kind 存在时生效。 */
    21|  kind?: TraceableEventKind;
    22|  traceId: string;
    23|  spanId: string;
    24|  parentSpanId?: string;
    25|  runId?: string;
    26|  taskId?: string;
    27|  taskUid?: string;
    28|  conversationId?: string;
    29|  summary?: string;
    30|  payload?: unknown;
    31|}
    32|
    33|export type { TraceableEventKind } from './events/kinds';
    34|export { TRACEABLE_EVENT_KINDS, isTraceableEventKind } from './events/kinds';
    35|export type { TraceableEventPayloadMap } from './events/payloads';
    36|
    37|export interface TraceableEventFilter {
    38|  source?: TraceableEventSource;
    39|  type?: string;
    40|  traceId?: string;
    41|  runId?: string;
    42|  taskId?: string;
    43|  taskUid?: string;
    44|  limit?: number;
    45|}
    46|
    47|export interface TraceableEventQueryResult {
    48|  events: TraceableEvent[];
    49|  count: number;
    50|}

(End of file. Total 50 lines.)

---

## [Assistant] 2026-04-28T07:05:19.835Z
够了。你问题的答案非常清楚了——**现状和愿景之间有一个巨大的断层**，这个断层决定了 LLM Gateway 的设计边界。

---

## 你的 Q 的简短回答：**不够**。差得远。

现状是：`TraceableEvent.payload` **只带"操作元数据"，不带"内容"**。

以 `conversation.started` 为例，当前 payload 里只有：
- `conversationId`（一个 UUID）
- `title`（就是 "Ask Anywhere" 这种占位符）
- `anchor.kind / anchor.refId`

内容（turns）在哪？在 `.orbit/conversations/<id>.json` 里，**不在 event 里**。

你原来设计的 `docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md` 那份愿景，在 §7.1 projector 里假设 `event.payload.body` 直接可用（`truncate(body, 80)`）——**这和现在的 event schema 不一致**。代码实现里 `titleFor()` 硬编码为 "Captured thought"、"Scheduled task ran"，就是因为 event 里没东西可渲染。

所以问题不是"LLM 能力不够"，而是 **"LLM 没有素材可处理"**。

---

## 这个断层的三种解法（我会主推第三种）

### 解法 A — "让 event payload 带完整内容"（❌ 不推荐）

每个 publisher 都把完整 content 塞进 payload：
- `note.created` payload 里带完整 body
- `conversation.started` payload 里带初始 prompt
- `conversation.ended` payload 里带整段 transcript

**问题**：
1. Event store 是 NDJSON 追加，大 payload 会让文件几十 MB 起；索引和查询都变慢
2. 违反 event sourcing 的"事实最小化"原则
3. 内容后来被改了（比如用户编辑了 note），event 里的副本就是旧的
4. 隐私/加密场景下，event 里不该有原始内容

### 解法 B — "让 projector 临时去 vault 捞内容"（❌ 勉强能用但设计错了）

Timeline 的 projector 每次投影时，根据 event.refs 实时读文件/读 conversation store，拼出摘要素材给 LLM。

**问题**：
1. 每次打开 timeline 都 N 次 fs.readFile + 解析 frontmatter + 读 conversation JSON
2. Projector 和 Store 层耦合（projector 本该是纯函数）
3. LLM 调用发生在**渲染路径**上，用户打开 timeline 等半天才出文字
4. 缓存失效语义不清：内容变了、但 event 没变，怎么失效摘要？

### 解法 C — **"Enrichment Layer" 作为独立一等公民**（✅ 强推荐）

把"把 raw event 变成有语义的东西"提升为独立的子系统，和 Timeline、LLM Gateway 并列。

```
┌─ Raw Event (TraceableEvent) ──┐    ┌─ Enriched Event ──────────────┐
│ kind: conversation.ended      │    │ event_id: ...                  │
│ payload: { conversationId }   │─┐  │ kind: conversation.ended       │
└───────────────────────────────┘ │  │ raw_ref: <event_id>            │
                                  ├─▶│ content_snapshot: {            │
┌─ Source of Truth ─────────────┐ │  │   turns: [...],                │
│ conversations/<id>.json       │─┘  │   topics: ["UX 重构"]          │
│ (可变，持续更新)               │    │ }                              │
└───────────────────────────────┘    │ llm_summary: {                 │
                                     │   headline: "讨论 Orbit UX",   │
                                     │   detail: "2 轮对话围绕..."    │
                                     │ }                              │
                                     │ enriched_at: ...               │
                                     │ content_hash: <sha>            │
                                     └────────────────────────────────┘
                                                    │
                                                    ▼
                                         Timeline / Export / AI 总结
                                           全部消费 enriched view
```

**核心拆解**：

1. **Event Store 保持干净**（仍然只存 `conversationId`、操作元数据）
2. **Enrichment Projector 异步地**从 source of truth 拉内容，生成"**内容快照**"（content_snapshot）——**这一步不调 LLM**，是纯提取/裁剪
3. **内容快照驱动 LLM 摘要**（headline + detail），摘要写入 enriched event 持久化到 `<vault>/.orbit/timeline/enriched/<date>.ndjson`
4. Timeline / 导出 / 月度总结 / 年鉴 PDF **全部消费 enriched event**，不直接碰 raw event

**为什么这样设计好**：

| 关注点 | 现在 | Enrichment Layer |
|---|---|---|
| Event store 体积 | 已经小，保持 | 不变 |
| 打开 Timeline 速度 | 快但没内容 | 快且有语义（从 enriched 文件直接读） |
| 内容变了怎么办 | event payload 里的副本过时 | content_hash 变 → enrichment 自动重算 |
| LLM 调用在哪 | 渲染路径（慢） | 后台批处理（异步） |
| 失败/无网络 | timeline 崩 | 退化到"原始 title"，不阻塞 |
| 想换 LLM 模型重新生成 | 要遍历 event store 修改 | 删 `.orbit/timeline/enriched/`，一行命令重建 |
| Agent 能不能看到 timeline 语义 | 不能 | 能（enriched 就是可读格式，`orbit timeline day 2026-04-28` 直接输出语义化条目） |

---

## 具体到每类 event，content_snapshot 需要什么

这是关键决策点——每类 event 要采多少内容、裁多少、带多少上下文。下面是我建议的规格，你可以直接审（也可以改）。

### 高价值事件（必须做完整快照）

| Event kind | content_snapshot 内容 | 采集时机 |
|---|---|---|
| `conversation.started` | 初始 anchor kind/refId + 关联实体的 title（比如 task title）| 事件发生时 |
| `conversation.meaningful` **(新增 kind)** | 最近 N 轮 turn 文本（最多 2000 字，超长截断）+ user 发起时的 anchor | 对话"收敛"时（见下） |
| `conversation.ended` | 整段 transcript 的结构化摘要：首条 user msg + 最后一条 assistant msg + turn 总数 | conversation 结束时 |
| `note.created (thought)` | 完整 body（thought 很短，直接全量）| 事件时 |
| `note.created (longform)` | title + 首段 200 字 + 最终字数 | 事件时 |
| `note.updated (longform)` | 前后字数 diff + 当前首段预览 | 事件时 |
| `library.item.added` | 文章 title + url + 文章摘要（如果 Feed 已经抓了 → 直接复用；否则抓 + 存 meta）| 事件时 |
| `library.item.read` | 文章 title + 用户 annotations 数量 | 事件时 |
| `project.created` | project title + description 首段 | 事件时 |
| `task.completed` | task title + description + execution log 最后一段 | 事件时 |

### 低价值事件（轻量快照或直接不做 LLM 摘要）

| Event kind | 处理方式 |
|---|---|
| `scheduled_task.execution.completed` | 直接展示 task name（`${task.name} 执行完成`），**不调 LLM**；LLM 摘要浪费 token |
| `kb.imported` | 直接 KB name |
| `resource.engagement` | Resource title + 引用上下文一句话 |
| `feed.source.added` | Feed title |

**原则**：**不是每个 entry 都要过 LLM**。LLM 只处理"**内容密度高、操作元数据不足以表达**"的事件。Timeline 的 UI 层对没 `llm_summary` 的条目 fallback 到当前的 `titleFor()` 硬编码（所以向后兼容零成本）。

---

## 关于你提的"直接用会话标题"

对。这是正确直觉。**content_snapshot 应该优先尝试"无 LLM 的结构化摘要"**：

```ts
// conversation enrichment 的伪代码
async function enrichConversationEvent(event) {
  const conv = await conversationStore.get(event.conversationId);
  const snapshot = {
    turns_count: conv.turns.length,
    duration_min: calcDuration(conv),
    first_user_msg: truncate(conv.turns[0]?.content, 150),
    last_assistant_msg: truncate(conv.turns.at(-1)?.content, 150),
    anchor_label: resolveAnchorLabel(conv.anchors)  // "Task: UX 重构" / "Project: xxx"
  };

  // Tier 1: 如果会话已被 user 命名且不是默认标题，直接用
  if (conv.title && conv.title !== 'Ask Anywhere') {
    return { snapshot, display_headline: conv.title, used_llm: false };
  }

  // Tier 2: 如果是短会话（< 3 turns），直接用第一句 user msg 截断
  if (conv.turns.length <= 3) {
    return { snapshot, display_headline: snapshot.first_user_msg, used_llm: false };
  }

  // Tier 3: 长会话，调 LLM 生成 headline
  const headline = await llm.invoke(conversationHeadlineTemplate, { snapshot });
  return { snapshot, display_headline: headline, used_llm: true };
}
```

**三级退化**：user title → 截断 → LLM。**大部分条目根本不会走到 LLM**，既省钱又快。

---

## 新引入的概念 "meaningful conversation"

Timeline 愿景里有一条 `conversation.meaningful` —— 这个 kind **还不存在**。现在你的 timeline 里每次打开 Ask-Anywhere 都是 "conversation started"，就是因为 publisher 只在开始时 emit 了。

建议在 Enrichment Layer 的配套里定义：

> **Meaningful 的判定**（任一满足即为 meaningful）：
> - 对话 turn >= 4（两轮来回以上）
> - 总字数 >= 500
> - 产出了 artifact（Stage 有东西）
> - 手动标记

conversation.ended 时判定一次；非 meaningful 的对话**不上 Timeline**（Layer 2 开发者模式里仍可见）。这样 Timeline 只保留"真的聊出东西的对话"。这也把你最早说的"机械内容"这个痛点直接根治。

---

## 所以我的修订方案

LLM Gateway + Enrichment Layer **作为姐妹子系统并行设计**，一起是本阶段的"基建"。关系图：

```
             ┌─────────────────────┐
             │  LLM Gateway        │
             │  (provider / cache  │
             │   prompt / budget)  │
             └──────────▲──────────┘
                        │ invoke()
                        │
   ┌────────────────────┴────────────────────┐
   │                                         │
┌──┴──────────────┐                    ┌────┴──────────────┐
│ Enrichment Layer│ ◄─── fetch ───    │  Direct Callers   │
│ (timeline + ... │    source of truth│  (conv title等)    │
│  snapshot + sum)│                    └───────────────────┘
└────▲────────────┘
     │ reads
     │
┌────┴────────────────┐     ┌─────────────────────┐
│ TraceableEvent Store│     │ Sources of truth:   │
│ (unchanged)          │     │ conversations/,    │
└─────────────────────┘     │ notes/, library/  │
                            └─────────────────────┘
```

---

## 重新划定的本期范围（大而全变得更大了，但也更清晰）

原来的 Q3 你选"大而全"，现在要扩到包括 Enrichment Layer。我拆成两条线并行：

### 线 A：LLM Gateway 基建（你已经定好的）
- Provider Adapter（Anthropic SDK for DeepSeek + MiniMax）
- PromptKit（内置 + vault overlay）
- Cache（Memory + Vault）
- Settings UI + cost attribution
- `orbit llm invoke <template-id> --json '...'` CLI

### 线 B：Enrichment Layer（**新增的核心**）
- Content snapshot schema（per event kind）
- Snapshot extractors（每个 kind 一个纯函数：event → snapshot）
- Enrichment projector（异步跑批 + 新事件实时跑）
- Enriched event 持久化（`.orbit/timeline/enriched/<date>.ndjson`）
- Timeline 消费 enriched（原 `projectEvent` 重写）
- Conversation `meaningful` 判定 + 新 kind

### 线 C：端到端场景（你定的 5 个 🟢，每个都变得更具体）

| 场景 | 依赖线 | 实现形态 |
|---|---|---|
| Timeline entry 摘要 | A+B | 实装 enrichment + summarize template |
| Timeline daily headline/narrative | A+B | 基于 enriched 条目调 LLM，替换当前的模板拼接 |
| Conversation 标题自动生成 | A | `conv.title.generate` 模板；2-3 轮触发；支持用户锁定 |
| Notes/Thoughts 自动打标签 + 实体 | A | `note.tag` 模板；note.created 后异步跑 |
| Feed 文章摘要 | A | `feed.item.summarize`；订阅抓取后异步跑 |

---

## 还需要你拍板的事（Enrichment 专属）

**E1. Enrichment 的触发模式**
- 🅰️ **事件驱动**：TraceableEventBus 订阅，每个新 event → 立刻 enqueue → 异步处理（推荐）
- 🅱️ **定时批处理**：每 5 分钟扫一遍新 event（更简单但延迟 5 分钟）
- 🅲️ **懒加载**：Timeline 查询时才 enrichment（回到解法 B 的坑）

我推荐 🅰️。Bull / p-queue / 简单 setImmediate 队列都行，本期先用内存队列 + retry，不引新依赖。

**E2. Content snapshot 的深度**（跟你的隐私直觉有关）
- 🅰️ **浅快照**：只保留 title + 首段 + 数量等元信息
- 🅱️ **深快照**：保留完整 content（方便重新生成摘要，但 vault 里会多一份冗余数据）
- 🅲️ **元数据 + 回指**：快照里只保 title/counts/用到的 turns 的 id 列表，LLM 需要原文时现捞

我推荐 🅰️ 起步（够用且体积小），等看到"想重跑摘要"的场景再升级 🅲️。

**E3. 老数据怎么办**
- 🅰️ 只处理"本期上线后"的新 event；老 event 不回填
- 🅱️ 上线时跑一次性 backfill，把最近 30 天的 event 生成 enriched
- 🅲️ 提供 `orbit timeline enrich --from <date>` 按需回填

推荐 🅲️，上线即刻可用（每次打开 timeline 发现某天没 enriched，自动触发一次 backfill），但不在启动时阻塞。

**E4. `conversation.meaningful` 的判定阈值**
就是前面列的 "turn >= 4 或 字数 >= 500 或 有 artifact 或 手动"。这个你同意吗？还是想调？

---

## 额外补一个你可能还没想到的维度

既然有了 Enrichment Layer，未来还可以做：

1. **Timeline 跨日关联推断**：让 LLM 发现"上周六看的文章 → 今天的灵感"这种跨天连线
2. **"被回忆次数"**：某个 entry 被用户点开/被其他 enrichment 引用时 `engagement_count++`，Timeline 愿景里已经预埋字段
3. **情感基调分析**：愿景 `emotional_tone` 字段本来就有，Enrichment 可以做
4. **Agent 读自己的 Timeline**：`orbit timeline day --json` 变成 Agent 的"我昨天做了什么"上下文，不用 agent 再去翻 event store

这些都是 Enrichment Layer 建好之后"顺手做"的，但没有 Enrichment 它们全都做不成。

---

## 等你拍板

请回：
- **E1/E2/E3/E4** 四个问题
- 顺便确认：**是否同意把 Enrichment Layer 作为本期和 LLM Gateway 并列的基建**（原本你说"大而全"只包括 LLM Gateway + 5 个场景，现在我主张扩到包括 Enrichment Layer——这会让本期规模从 "~5-7 天" 拉到 "~10-12 天"，但**不做这层那 5 个场景都是半成品**）

回完我就动手：
1. `docs/thinking-trail/2026-04-28-llm-gateway-and-enrichment/` 初始化 session + 记录本次对话
2. `docs/decisions/ADR-017-llm-gateway.md`
3. `docs/decisions/ADR-018-event-enrichment-layer.md`（这个是**架构级新方向**，必须 ADR）
4. `docs/plans/2026-04-28-llm-gateway-foundation.md`
5. `docs/plans/2026-04-28-event-enrichment-layer.md`
6. 更新 ROADMAP / CHANGELOG

---

## [User] 2026-04-28T07:10:00.612Z
你这里提到的摘要层我认为不仅可以提供给timeline使用，摘要层应该是一个更通用的一层。
我认为思路可以扩展到需要一层AI生成内容的层，来为整个应用的所有数据提供一层AI生成分析，并提供索引，应用未来肯定会有非常多内容，如何做一个查询和索引是一个问题，我发两段关于llm wiki的思路，你看看能否借鉴，同时你需要重新读orbit项目的愿景和现有的所有功能设计，来和我讨论这一个问题，很重要，一定要掌握全面信息再聊：Andrej Karpathy
@karpathy
LLM Knowledge Bases

Something I'm finding very useful recently: using LLMs to build personal knowledge bases for various topics of research interest. In this way, a large fraction of my recent token throughput is going less into manipulating code, and more into manipulating knowledge (stored as markdown and images). The latest LLMs are quite good at it. So:

Data ingest:
I index source documents (articles, papers, repos, datasets, images, etc.) into a raw/ directory, then I use an LLM to incrementally "compile" a wiki, which is just a collection of .md files in a directory structure. The wiki includes summaries of all the data in raw/, backlinks, and then it categorizes data into concepts, writes articles for them, and links them all. To convert web articles into .md files I like to use the Obsidian Web Clipper extension, and then I also use a hotkey to download all the related images to local so that my LLM can easily reference them.

IDE:
I use Obsidian as the IDE "frontend" where I can view the raw data, the the compiled wiki, and the derived visualizations. Important to note that the LLM writes and maintains all of the data of the wiki, I rarely touch it directly. I've played with a few Obsidian plugins to render and view data in other ways (e.g. Marp for slides).

Q&A:
Where things get interesting is that once your wiki is big enough (e.g. mine on some recent research is ~100 articles and ~400K words), you can ask your LLM agent all kinds of complex questions against the wiki, and it will go off, research the answers, etc. I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files and brief summaries of all the documents and it reads all the important related data fairly easily at this ~small scale.

Output:
Instead of getting answers in text/terminal, I like to have it render markdown files for me, or slide shows (Marp format), or matplotlib images, all of which I then view again in Obsidian. You can imagine many other visual output formats depending on the query. Often, I end up "filing" the outputs back into the wiki to enhance it for further queries. So my own explorations and queries always "add up" in the knowledge base.

Linting:
I've run some LLM "health checks" over the wiki to e.g. find inconsistent data, impute missing data (with web searchers), find interesting connections for new article candidates, etc., to incrementally clean up the wiki and enhance its overall data integrity. The LLMs are quite good at suggesting further questions to ask and look into.

Extra tools:
I find myself developing additional tools to process the data, e.g. I vibe coded a small and naive search engine over the wiki, which I both use directly (in a web ui), but more often I want to hand it off to an LLM via CLI as a tool for larger queries. 

Further explorations:
As the repo grows, the natural desire is to also think about synthetic data generation + finetuning to have your LLM "know" the data in its weights instead of just context windows.

TLDR: raw data from a given number of sources is collected, then compiled by an LLM into a .md wiki, then operated on by various CLIs by the LLM to do Q&A and to incrementally enhance the wiki, and all of it viewable in Obsidian. You rarely ever write or edit the wiki manually, it's the domain of the LLM. I think there is room here for an incredible new product instead of a hacky collection of scripts. 


LLM Wiki
A pattern for building personal knowledge bases using LLMs.

This is an idea file, it is designed to be copy pasted to your own LLM Agent (e.g. OpenAI Codex, Claude Code, OpenCode / Pi, or etc.). Its goal is to communicate the high level idea, but your agent will build out the specifics in collaboration with you.

The core idea
Most people's experience with LLMs and documents looks like RAG: you upload a collection of files, the LLM retrieves relevant chunks at query time, and generates an answer. This works, but the LLM is rediscovering knowledge from scratch on every question. There's no accumulation. Ask a subtle question that requires synthesizing five documents, and the LLM has to find and piece together the relevant fragments every time. Nothing is built up. NotebookLM, ChatGPT file uploads, and most RAG systems work this way.

The idea here is different. Instead of just retrieving from raw documents at query time, the LLM incrementally builds and maintains a persistent wiki — a structured, interlinked collection of markdown files that sits between you and the raw sources. When you add a new source, the LLM doesn't just index it for later retrieval. It reads it, extracts the key information, and integrates it into the existing wiki — updating entity pages, revising topic summaries, noting where new data contradicts old claims, strengthening or challenging the evolving synthesis. The knowledge is compiled once and then kept current, not re-derived on every query.

This is the key difference: the wiki is a persistent, compounding artifact. The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read. The wiki keeps getting richer with every source you add and every question you ask.

You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You're in charge of sourcing, exploration, and asking the right questions. The LLM does all the grunt work — the summarizing, cross-referencing, filing, and bookkeeping that makes a knowledge base actually useful over time. In practice, I have the LLM agent open on one side and Obsidian open on the other. The LLM makes edits based on our conversation, and I browse the results in real time — following links, checking the graph view, reading the updated pages. Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.

This can apply to a lot of different contexts. A few examples:

Personal: tracking your own goals, health, psychology, self-improvement — filing journal entries, articles, podcast notes, and building up a structured picture of yourself over time.
Research: going deep on a topic over weeks or months — reading papers, articles, reports, and incrementally building a comprehensive wiki with an evolving thesis.
Reading a book: filing each chapter as you go, building out pages for characters, themes, plot threads, and how they connect. By the end you have a rich companion wiki. Think of fan wikis like Tolkien Gateway — thousands of interlinked pages covering characters, places, events, languages, built by a community of volunteers over years. You could build something like that personally as you read, with the LLM doing all the cross-referencing and maintenance.
Business/team: an internal wiki maintained by LLMs, fed by Slack threads, meeting transcripts, project documents, customer calls. Possibly with humans in the loop reviewing updates. The wiki stays current because the LLM does the maintenance that no one on the team wants to do.
Competitive analysis, due diligence, trip planning, course notes, hobby deep-dives — anything where you're accumulating knowledge over time and want it organized rather than scattered.
Architecture
There are three layers:

Raw sources — your curated collection of source documents. Articles, papers, images, data files. These are immutable — the LLM reads from them but never modifies them. This is your source of truth.

The wiki — a directory of LLM-generated markdown files. Summaries, entity pages, concept pages, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates pages, updates them when new sources arrive, maintains cross-references, and keeps everything consistent. You read it; the LLM writes it.

The schema — a document (e.g. CLAUDE.md for Claude Code or AGENTS.md for Codex) that tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the wiki. This is the key configuration file — it's what makes the LLM a disciplined wiki maintainer rather than a generic chatbot. You and the LLM co-evolve this over time as you figure out what works for your domain.

Operations
Ingest. You drop a new source into the raw collection and tell the LLM to process it. An example flow: the LLM reads the source, discusses key takeaways with you, writes a summary page in the wiki, updates the index, updates relevant entity and concept pages across the wiki, and appends an entry to the log. A single source might touch 10-15 wiki pages. Personally I prefer to ingest sources one at a time and stay involved — I read the summaries, check the updates, and guide the LLM on what to emphasize. But you could also batch-ingest many sources at once with less supervision. It's up to you to develop the workflow that fits your style and document it in the schema for future sessions.

Query. You ask questions against the wiki. The LLM searches for relevant pages, reads them, and synthesizes an answer with citations. Answers can take different forms depending on the question — a markdown page, a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas. The important insight: good answers can be filed back into the wiki as new pages. A comparison you asked for, an analysis, a connection you discovered — these are valuable and shouldn't disappear into chat history. This way your explorations compound in the knowledge base just like ingested sources do.

Lint. Periodically, ask the LLM to health-check the wiki. Look for: contradictions between pages, stale claims that newer sources have superseded, orphan pages with no inbound links, important concepts mentioned but lacking their own page, missing cross-references, data gaps that could be filled with a web search. The LLM is good at suggesting new questions to investigate and new sources to look for. This keeps the wiki healthy as it grows.

Indexing and logging
Two special files help the LLM (and you) navigate the wiki as it grows. They serve different purposes:

index.md is content-oriented. It's a catalog of everything in the wiki — each page listed with a link, a one-line summary, and optionally metadata like date or source count. Organized by category (entities, concepts, sources, etc.). The LLM updates it on every ingest. When answering a query, the LLM reads the index first to find relevant pages, then drills into them. This works surprisingly well at moderate scale (~100 sources, ~hundreds of pages) and avoids the need for embedding-based RAG infrastructure.

log.md is chronological. It's an append-only record of what happened and when — ingests, queries, lint passes. A useful tip: if each entry starts with a consistent prefix (e.g. ## [2026-04-02] ingest | Article Title), the log becomes parseable with simple unix tools — grep "^## \[" log.md | tail -5 gives you the last 5 entries. The log gives you a timeline of the wiki's evolution and helps the LLM understand what's been done recently.

Optional: CLI tools
At some point you may want to build small tools that help the LLM operate on the wiki more efficiently. A search engine over the wiki pages is the most obvious one — at small scale the index file is enough, but as the wiki grows you want proper search. qmd is a good option: it's a local search engine for markdown files with hybrid BM25/vector search and LLM re-ranking, all on-device. It has both a CLI (so the LLM can shell out to it) and an MCP server (so the LLM can use it as a native tool). You could also build something simpler yourself — the LLM can help you vibe-code a naive search script as the need arises.

Tips and tricks
Obsidian Web Clipper is a browser extension that converts web articles to markdown. Very useful for quickly getting sources into your raw collection.
Download images locally. In Obsidian Settings → Files and links, set "Attachment folder path" to a fixed directory (e.g. raw/assets/). Then in Settings → Hotkeys, search for "Download" to find "Download attachments for current file" and bind it to a hotkey (e.g. Ctrl+Shift+D). After clipping an article, hit the hotkey and all images get downloaded to local disk. This is optional but useful — it lets the LLM view and reference images directly instead of relying on URLs that may break. Note that LLMs can't natively read markdown with inline images in one pass — the workaround is to have the LLM read the text first, then view some or all of the referenced images separately to gain additional context. It's a bit clunky but works well enough.
Obsidian's graph view is the best way to see the shape of your wiki — what's connected to what, which pages are hubs, which are orphans.
Marp is a markdown-based slide deck format. Obsidian has a plugin for it. Useful for generating presentations directly from wiki content.
Dataview is an Obsidian plugin that runs queries over page frontmatter. If your LLM adds YAML frontmatter to wiki pages (tags, dates, source counts), Dataview can generate dynamic tables and lists.
The wiki is just a git repo of markdown files. You get version history, branching, and collaboration for free.
Why this works
The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping. Updating cross-references, keeping summaries current, noting when new data contradicts old claims, maintaining consistency across dozens of pages. Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero.

The human's job is to curate sources, direct the analysis, ask good questions, and think about what it all means. The LLM's job is everything else.

The idea is related in spirit to Vannevar Bush's Memex (1945) — a personal, curated knowledge store with associative trails between documents. Bush's vision was closer to this than to what the web became: private, actively curated, with the connections between documents as valuable as the documents themselves. The part he couldn't solve was who does the maintenance. The LLM handles that.

Note
This document is intentionally abstract. It describes the idea, not a specific implementation. The exact directory structure, the schema conventions, the page formats, the tooling — all of that will depend on your domain, your preferences, and your LLM of choice. Everything mentioned above is optional and modular — pick what's useful, ignore what isn't. For example: your sources might be text-only, so you don't need image handling at all. Your wiki might be small enough that the index file is all you need, no search engine required. You might not care about slide decks and just want markdown pages. You might want a completely different set of output formats. The right way to use this is to share it with your LLM agent and work together to instantiate a version that fits your needs. The document's only job is to communicate the pattern. Your LLM can figure out the rest.

---

## [Assistant] 2026-04-28T07:10:25.655Z
你这个方向让整个讨论**升格了一个层级**——从"补一个摘要层"变成"Orbit 从 event log + 笔记容器升格为 compounding knowledge base"。但在我回应之前，我需要按你说的"读全部再聊"，不能只凭之前的 overview 拍脑袋。

### Tool Calls:
- **todo_write**({"merge":false,"todos":[{"id":"1","status":"in_progress","content":"通读 Orbit 愿景/架构/开放问题的一手文档"},{"id":"2","status":"pending","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"},{"id":"3","status":"pending","content":"把 Karpathy LLM Wiki 模式和 Orbit 现状/愿景对位，找契合点与冲突点"},{"id":"4","status":"pending","content":"产出带观点的方案建议 + 待拍板问题"}],"toolExplanation":"规划全面阅读与讨论产出"})

---

## [Tool] 2026-04-28T07:10:25.663Z
{"todos":[{"id":"1","status":"in_progress","content":"通读 Orbit 愿景/架构/开放问题的一手文档"},{"id":"2","status":"pending","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"},{"id":"3","status":"pending","content":"把 Karpathy LLM Wiki 模式和 Orbit 现状/愿景对位，找契合点与冲突点"},{"id":"4","status":"pending","content":"产出带观点的方案建议 + 待拍板问题"}],"message":"Created new todo list with 4 items"}

---

## [Assistant] 2026-04-28T07:10:33.709Z
### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/VISION.md"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/open-questions.md"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail","depth":3,"offset":0,"limit":80,"toolExplanation":"看 thinking-trail 全部主题"})

---

## [Tool] 2026-04-28T07:10:33.720Z
     1|# Orbit — Product Vision
     2|
     3|> **Last rewritten**: 2026-04-26（随 v2 方向确立）
     4|> **Companion documents**: `docs/overview.md` / `docs/decisions/` / `docs/ROADMAP.md`
     5|
     6|---
     7|
     8|## 一句话定位
     9|
    10|**Orbit 是 Building a Second Brain (BASB) 方法论在本地 AI 协作形态下的完整实现。**
    11|
    12|它不是"一个带终端的笔记软件"，也不是"又一个 AI 聊天工具"。Orbit 的目标是让用户把自己的长期方向 (Vision)、项目 (Projects)、任务 (Tasks)、资源 (Resources) 和灵感 (Captures) 沉淀在本地 Markdown + Git vault 中，并通过 AI agent **替自己执行**——以可追踪、可审计、可恢复的方式。
    13|
    14|---
    15|
    16|## 为什么需要 Orbit
    17|
    18|个人知识与生产力工具在当下呈现出撕裂状态：
    19|
    20|- **笔记工具**（Obsidian / Notion / Logseq）擅长整理，但**不会执行**——你写完 Vision 和 Project，下一步还得切到另一个工具里手动干活
    21|- **AI 工具**（ChatGPT / Claude Desktop）擅长对话，但**没有持久的项目背景**——每次新对话都要重新告诉它"我在做什么"
    22|- **IDE**（Cursor / Windsurf）擅长在代码里和 AI 协作，但**不懂得你为什么做这个项目**——没有 Vision、没有 PARA、没有跨项目知识
    23|
    24|Orbit 的使命是把这三层**粘合起来**，让用户的思考、知识、执行在**同一个 vault 里闭环**。这个闭环就是 BASB 方法论里的 **CODE 四阶段**：
    25|
    26|| 阶段 | 含义 | Orbit 的实现 |
    27||------|------|-------------|
    28|| **Capture** | 捕获信息与灵感 | Inbox → Feed / Library / Thoughts |
    29|| **Organize** | 按可执行性整理 | PARA 目录结构（Projects / Areas / Resources / Archives） |
    30|| **Distill** | 逐步提炼为可复用知识 | 项目 Distillation + 向量 wake-up |
    31|| **Express** | 把知识转化为产出 | AI agent 在 Worktree / Sandbox 中真实执行 |
    32|
    33|---
    34|
    35|## 核心原则
    36|
    37|### 本地优先，数据主权属于用户
    38|
    39|所有内容存储在用户自己的文件夹（vault）里，用 plain Markdown + Git 管理版本。没有云同步锁定，没有专有格式。任何 Markdown 编辑器（包括 Obsidian）都可以读写同一套文件。
    40|
    41|Orbit 的应用状态集中在 `<vault>/.orbit/`，退出 Orbit 你的笔记依然是干净的 Markdown。
    42|
    43|### 愿景驱动 (Vision-Driven)
    44|
    45|用户的 `Vision.md` 是整个工作台的北极星。它被注入到每个 agent 的 system prompt 中，让 AI 知道"你到底想成为谁"，而不是只知道"这个任务要做什么"。
    46|
    47|Dashboard、Kanban、Inbox、Capture 都围绕 Vision 的方向收敛。系统里的碎片越多，Vision 的回拉力就越关键。
    48|
    49|### 人机对等 (AI-Native)
    50|
    51|> **用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口。**
    52|
    53|这是 v2 引入的新原则（详见 `docs/decisions/ADR-008`），它意味着：
    54|
    55|- Orbit 的所有业务能力（CRUD、查询、提议、审批触发）都通过 `orbit` CLI 暴露
    56|- UI 是人的界面，CLI 是 AI 的界面，两者背后走同一套 IPC 业务逻辑
    57|- 低频的"操作性"事情（清理文件、批量改 tag、重组目录）不做专门 UI，交给 AI 用文件系统能力完成
    58|
    59|AI-Native 不是"AI 代替决策"——**决策仍然在人**，AI 只是把执行门槛降到极低。
    60|
    61|### Agent 参与真实执行，而非只聊天
    62|
    63|Agent 不是附属功能，而是执行系统的一部分。Orbit 通过：
    64|
    65|- **ExecutionContext** 隔离（Worktree / Sandbox）——agent 的操作不会直接污染主 vault
    66|- **Ghost commit 流程**——agent 产出先落到 `ghost/*` 分支，人审通过才合并
    67|- **propose-approve 模式**——agent 提议新任务、扩大范围、破坏性操作都要人审
    68|- **Activity Log**——所有 agent 动作都留痕可审计
    69|
    70|的方式，让 agent 的产出**可以被审查、合并或拒绝**，留下完整的可追溯历史。
    71|
    72|### 人审执行，但要快
    73|
    74|因为 agent 的产出都要人审，审批流的**顺滑度**直接决定产品价值。Orbit 的 Inbox 架构围绕"**快速处理、原地合并、双通道兜底**"设计——chat 原地可审批、Inbox 同步为副本，任一处理完两处一起消失。
    75|
    76|---
    77|
    78|## Orbit 的工作流
    79|
    80|```
    81|用户：写 Vision + 开 Project → 提议任务或接受 agent 提议 → 审合并产出
    82|  ↑                                                              ↓
    83|  └──── 沉淀为 Resource ← Distill ←── Project 归档 ─────────────┘
    84|                                         ↑
    85|             Library 阅读 + Thought 记录 ←── Capture 入口
    86|                                         ↑
    87|                                   外部信息 / 手机 / 浏览器
    88|```
    89|
    90|---
    91|
    92|## 长期方向
    93|
    94|> v2 之后的演进方向，按优先级排列。详细条目见 `docs/ROADMAP.md` 和 `docs/open-questions.md`。
    95|
    96|### 1. Thinking Trail — AI 对话的结构化留痕
    97|
    98|记录用户和 AI 对话的全过程（不止结论），提取关键认知跃迁点，成为**"为什么这样想"**的长期档案。与 Activity Log 互补：Activity Log 记"做了什么"，Thinking Trail 记"为什么这样想"。
    99|
   100|### 2. Sandbox ExecutionContext
   101|
   102|为非代码项目（笔记、写作、研究、阅读）设计的轻量隔离容器，让 agent 可以在笔记项目里安全地实验、修改、合并。
   103|
   104|### 3. Capture 能力扩展
   105|
   106|Voice Log、手机 share、浏览器插件、Twitter / HN / GitHub Trending 等多来源 Feed、富文本/截图 capture。
   107|
   108|### 4. Orbit 自我进化
   109|
   110|基于 Activity Log + Thinking Trail + Distillation 的三向数据融合，让 agent 观察用户的工作模式，主动提出优化建议。
   111|
   112|### 5. 跨平台与多 provider
   113|
   114|- Linux / Windows 打包
   115|- 接入更多 agent runtime（Codex、Gemini、本地模型等）
   116|- CLI / MCP 接口的规范化（观察期后决定是否回补 MCP）
   117|
   118|---
   119|
   120|## 不做什么
   121|
   122|- **不做实时协作** —— Orbit 是个人工具，不是团队 Wiki
   123|- **不做专有云存储** —— vault 永远是用户本地的普通文件夹
   124|- **不做 AI 聊天界面封装** —— Orbit 不做另一个 ChatGPT UI；AI 通过 CLI 在终端/后台工作，产物进 Inbox
   125|- **不强制绑定特定 AI 提供商** —— 通过 CLI + 环境变量可接任何能识别命令行的 agent
   126|- **不做通知中心** —— Inbox 是用户主动来看的，不是系统推给人的
   127|- **不做团队看板** —— 看板是 **个人的认知地图**，不是多人协作面板
   128|
   129|---
   130|
   131|## 与 Orbit v1 的关系
   132|
   133|v1（本文 2026-04-26 之前的所有版本）以"Project-as-Folder + Terminal + MCP + Night Shift"为核心。v2 在**保留全部数据格式和存储契约**的基础上，对工作模式做了以下根本性调整：
   134|
   135|| v1 | v2 |
   136||---|---|
   137|| Night Shift（批量夜间执行） | Auto-runner（24×7 持续） |
   138|| Agent 可能自己创建 subtask 入看板 | Agent 自主步骤折叠进主任务 Execution Log |
   139|| `create_task` 直接入库 | `propose_new_task` 两阶段审批 |
   140|| Worktree 是唯一的执行隔离 | Worktree + Sandbox（双轨，ExecutionContext 抽象） |
   141|| 无显式任务依赖 | `depends_on` + 拓扑解锁 |
   142|| 审批分散在各个 view | Inbox 作为统一审批枢纽 |
   143|| Capture 只在计划中 | Capture 三分（Feed + Library + Thoughts）落地 |
   144|| MCP 是 agent 唯一能力接口 | CLI 是主通道，MCP 暂时废弃观察 |
   145|| 无系统级操作留痕 | Activity Log 基础设施 |
   146|
   147|见 `docs/decisions/` 下的 10 份 ADR 了解每项调整的理由。

(End of file. Total 147 lines.)

---

## [Tool] 2026-04-28T07:10:33.721Z
     1|# Open Questions
     2|
     3|> 本文记录 Orbit v2 方向确立过程中**被明确认识到但本期不做**的事项。它们是后续迭代的候选，同时也是"未定之事"的可见清单——避免这些想法被遗忘或重复讨论。
     4|
     5|> **Last updated**: 2026-04-28（追加 #17：task 生命周期状态机解耦相关待定项已收敛进 Phase 4.0 plan）
     6|
     7|每个条目给出：
     8|- **上下文**：为什么这事值得讨论
     9|- **当前状态**：为什么本期不做
    10|- **期望阶段**：什么时候应该讨论 / 落地
    11|- **相关**：关联的 ADR / plan / thinking trail
    12|
    13|---
    14|
    15|## 1. Sandbox ExecutionContext 的详细设计
    16|
    17|**上下文**：
    18|ADR-003 引入 ExecutionContext 抽象，本期落地 Worktree 实现适配新接口。但非代码项目（笔记/研究/写作）的 Sandbox 实现需要解决：
    19|
    20|- 如何隔离笔记项目的修改（轻量文件副本？硬链接？overlay 文件系统？）
    21|- 如何呈现"变更"让用户审查（diff view 的适配？版本比较？）
    22|- 是否允许 Sandbox 项目启用 git 做快照（正交开关）
    23|- Auto-runner 在 Sandbox 项目上的并发策略
    24|
    25|**当前状态**：
    26|本期只定抽象接口，Sandbox 代码不实施。Sandbox 项目（`execution_context: sandbox`）本期**无法运行 agent**，UI 显示"Sandbox 运行暂未实现"。
    27|
    28|**期望阶段**：
    29|v2 本期结束后的第一个迭代单独开一期设计 + 实施。建议 plan 名 `plans/sandbox-execution-context.md`。
    30|
    31|**相关**：
    32|- ADR-003
    33|- `plans/2026-04-26-execution-model-migration.md`
    34|
    35|---
    36|
    37|## 2. Thinking Trail 子系统（AI 对话结构化留痕）
    38|
    39|**上下文**：
    40|2026-04-26 的 v2 方向对话本身已经手动实践了一次 Thinking Trail（见 `docs/thinking-trail/2026-04-26-v2-direction/`）。这次实践验证了：
    41|
    42|- 原始对话（conversation.md）是不可压缩的黄金
    43|- 结构化提炼（key-pivots + decisions-traced）是面向回溯者的索引
    44|- 文档讲"是什么"，Thinking Trail 讲"为什么这样想"——两者互补
    45|
    46|未来需要把这个能力**自动化**，让 Orbit 内每次与 agent 的重要对话都能自动留痕。
    47|
    48|**涉及的设计问题**：
    49|
    50|- 在什么粒度留痕（每次 chat？每次 session？按用户明确标记？）
    51|- 存储在哪（`.orbit/thinking-trail/` ? `02_Areas/thinking/` ?）
    52|- 如何识别"关键认知跃迁"（agent 事后自动分析？用户主动标记？）
    53|- 与 Activity Log 的关系（互补还是合并？）
    54|- 搜索与检索入口
    55|
    56|**当前状态**：
    57|本期 v2 只做了"手动实践"，没有落地自动化能力。
    58|
    59|**期望阶段**：
    60|Activity Log 成熟（本期）之后，下一个大迭代考虑。建议时机：当用户积累了 5+ 次对话 trail 后，对格式和分层形成直觉再正式落地。
    61|
    62|**相关**：
    63|- `docs/thinking-trail/2026-04-26-v2-direction/` (手动实践)
    64|- ADR-009 Activity Log（互补关系）
    65|
    66|---
    67|
    68|## 3. Orbit 自我进化（基于 Activity Log + Thinking Trail + Distillation）
    69|
    70|**上下文**：
    71|三种数据源融合后，agent 可以观察用户的工作模式并主动给出建议：
    72|
    73|- Activity Log：用户/agent 做过什么行为
    74|- Thinking Trail：为什么这样想
    75|- Distillation：过往项目提炼的经验
    76|
    77|Agent 可以：
    78|- 发现"用户最近一直在做 X 但从没做 Y"的模式
    79|- 提出"是否把 Z 项目归档，数据显示已经 2 个月没动"
    80|- 在新项目启动时推送"根据过往类似项目，你可能会遇到这些问题"
    81|
    82|这是 Orbit 从"工具"升级到"思考伙伴"的关键能力。
    83|
    84|**当前状态**：
    85|数据基础的一部分（Activity Log）本期落地，另一部分（Thinking Trail）还是手动。全面能力的 agent 端没有开发。
    86|
    87|**期望阶段**：
    88|Activity Log 运行满 1-2 个月积累数据 + Thinking Trail 基础设施落地之后。建议作为一个大方向规划在 ROADMAP 的 P6。
    89|
    90|**相关**：
    91|- ADR-009 Activity Log
    92|- 本文 #2 Thinking Trail
    93|
    94|---
    95|
    96|## 4. Quick Capture 的扩展入口
    97|
    98|**上下文**：
    99|本期 Quick Capture MVP 只做 Thought（全局快捷键 + 轻量浮层）。完整的 Capture 能力应覆盖：
   100|
   101|- **Library Quick Capture**：浮层内切到 "Save URL" 模式 → 粘贴链接 → 后台抓取 → 存 Library
   102|- **Feed Quick Capture**：浮层切到 "Add Subscription" → 粘贴 RSS URL → 加订阅源
   103|- **剪贴板识别**：打开浮层时检测剪贴板，URL 自动切 Library，长文本切 Thought
   104|- **Voice Log**：按住某键录音 → Whisper 本地转写 → 存 Thought
   105|- **手机 share endpoint**：本地 HTTP server + iOS Share Sheet 配置
   106|- **浏览器插件**：一键把当前页面 save 到 Library
   107|
   108|**当前状态**：
   109|仅 Thought 入口落地。其他都是"扩展清单"。
   110|
   111|**期望阶段**：
   112|v2 本期结束后的第一轮迭代。建议按优先级：剪贴板识别 > Library 粘贴 > 浏览器插件 > 手机 share > Voice Log。
   113|
   114|**相关**：
   115|- ADR-010
   116|- `plans/2026-04-26-quick-capture-mvp.md` 的"后续扩展（下期）"章节
   117|
   118|---
   119|
   120|## 5. Feed 的多来源支持
   121|
   122|**上下文**：
   123|本期 Feed 只支持 RSS。用户提到的其他价值来源：
   124|
   125|- Twitter / X：需要 API 访问（可能是付费 + 复杂认证）
   126|- GitHub Trending：可通过 web scraping / GitHub API
   127|- Hacker News：有简单 API（https://github.com/HackerNews/API）
   128|- Substack：部分作者提供 RSS，部分需要 scrape
   129|- YouTube Feed：有 RSS（每个频道）
   130|- Reddit：有 RSS
   131|- Medium：RSS
   132|
   133|**当前状态**：
   134|RSS only，其他来源"后续"。
   135|
   136|**期望阶段**：
   137|Feed RSS 上线稳定后第一轮扩展。建议每个来源作为"插件"（Feed Source Plugin）接入，不要在核心系统里硬编码。
   138|
   139|**相关**：
   140|- ADR-010
   141|- `plans/2026-04-26-capture-foundation.md`
   142|
   143|---
   144|
   145|## 6. Inbox 历史检索
   146|
   147|**上下文**：
   148|归档的 Messages 和 Library / Library Promotes 值得跨时间搜索。例如：
   149|- "我上个月批准了什么 merge？"
   150|- "过去一年我在 Library 里读过哪些关于 LLM 的文章？"
   151|- "哪些 agent proposal 被我 reject 了，常见理由是什么？"
   152|
   153|这涉及全文索引、时间过滤、语义搜索。
   154|
   155|**当前状态**：
   156|UI 上没有历史检索入口。底层数据（NDJSON）存在，可以事后补索引。
   157|
   158|**期望阶段**：
   159|用户有过明确的"想查历史却找不到"的场景后。建议时机：积累半年数据量后再开发。
   160|
   161|**相关**：
   162|- ADR-004 Inbox
   163|
   164|---
   165|
   166|## 7. Inbox 批量处理
   167|
   168|**上下文**：
   169|Gmail 风格的"多选批量 approve / 批量 dismiss"能大幅降低处理成本，但对 Approval 类有"不看内容一键批"的风险。
   170|
   171|**当前状态**：
   172|本期不做。
   173|
   174|**期望阶段**：
   175|Inbox 基础版上线并用一段时间后，根据用户实际痛点决定。允许范围建议：
   176|- C / D 类可批量（警示/纪律类风险低）
   177|- A / B 类不允许（审批/求助要逐条看）
   178|
   179|**相关**：
   180|- ADR-004
   181|
   182|---
   183|
   184|## 8. Review 页面 UI
   185|
   186|**上下文**：
   187|Activity Log 本期落地基础设施，但用户看不到可视化。Review 页面应该提供：
   188|- 今日时间轴
   189|- 本周/本月汇总
   190|- 按 action / actor / project 分组筛选
   191|- 跨时间的"我做过什么"检索
   192|
   193|**当前状态**：
   194|数据已经在积累，UI 待建。
   195|
   196|**期望阶段**：
   197|v2 本期实施完毕 + Activity Log 运行 1-2 周后。建议 plan 名 `plans/review-page-ui.md`。
   198|
   199|**相关**：
   200|- ADR-009
   201|
   202|---
   203|
   204|## 9. MCP 观察期决策
   205|
   206|**上下文**：
   207|ADR-008 废弃 MCP 转向 CLI-first，但留了观察期。需要在观察期后决策：
   208|
   209|- 如果 agent CLI 错误率低 → 保持纯 CLI，删除 MCP 代码
   210|- 如果错误率高 → 重新引入 MCP 作为补充（全部还是部分？）
   211|- 中间情况 → 保留 CLI 主通道，MCP 作为"特别高可靠性要求场景"的补充
   212|
   213|**需要监控的指标**：
   214|- Agent 调用 CLI 命令的参数错误率（通过 Activity Log + exit code）
   215|- Agent 放弃任务的比例
   216|- Agent 重试次数
   217|
   218|**当前状态**：
   219|MCP 关闭但代码保留在 `src/mcp/`。观察期至少 1-2 个月。
   220|
   221|**期望阶段**：
   222|v2 本期上线后 2-3 个月做一次评估。
   223|
   224|**相关**：
   225|- ADR-008
   226|
   227|---
   228|
   229|## 10. 跨项目任务依赖
   230|
   231|**上下文**：
   232|ADR-007 的 v1 只支持 task-to-task 同项目依赖。如果用户真实场景有跨项目依赖（比如"Project X 完成后，Project Y 才能开始"），当前只能通过 Markdown wikilink 粗糙表达。
   233|
   234|**设计问题**：
   235|- 跨项目依赖的查询性能（需要扫描所有项目的 task 吗？）
   236|- UID 全局唯一性是否已保证
   237|- UI 如何呈现跨项目依赖
   238|
   239|**当前状态**：
   240|不支持，也没有明确的用户需求信号。
   241|
   242|**期望阶段**：
   243|有真实用户反馈后再考虑。可能永不实施（如果粗糙的 wikilink 就够用）。
   244|
   245|**相关**：
   246|- ADR-007
   247|
   248|---
   249|
   250|## 11. Feed History 的 GC 策略
   251|
   252|**上下文**：
   253|Feed History 本期永久保留，清理交给 AI 用文件系统做。未来如果磁盘占用问题显现：
   254|
   255|- 按月压缩？
   256|- Agent 自动生成月度摘要并归档？
   257|- 按重要性保留？
   258|
   259|**当前状态**：
   260|永久保留 + 手动 AI 清理。
   261|
   262|**期望阶段**：
   263|实际磁盘使用 > 500MB 或用户反馈影响性能时。
   264|
   265|**相关**：
   266|- ADR-010
   267|
   268|---
   269|
   270|## 12. Agent 主动创建 Thought 是否需要审批
   271|
   272|**上下文**：
   273|`plans/2026-04-26-capture-foundation.md` 的开放问题之一。本期默认允许 agent 直接 `orbit thought create`（不走 propose-approve），因为：
   274|- Thought 是原材料，不入看板
   275|- Agent 帮用户记录不算扩张系统状态
   276|- 用户可在 Inbox 随时 dismiss
   277|
   278|**可能的问题**：
   279|- Agent 滥用（每对话都记一堆无用 thought）
   280|- 干扰用户的 Thought 流（混入了非用户意图的记录）
   281|
   282|**当前状态**：
   283|本期允许，无限制。Activity Log 记录 actor 便于事后分析。
   284|
   285|**期望阶段**：
   286|上线后观察 3 个月，根据实际 agent 行为决定：
   287|- 如果滥用不明显 → 保持现状
   288|- 如果 agent 每次对话都创建 5+ Thought → 加频率限制（每 run 最多 N 次）或走 propose
   289|
   290|**相关**：
   291|- ADR-010
   292|
   293|---
   294|
   295|## 13. Stage View 抽象的完整化 + Planner 重构
   296|
   297|**上下文**：
   298|ADR-005 承认 "Stage View"（chat + 产物舞台）是通用模式，但本期**不重构** v1 的 Planner。新增的 Inbox / 未来的对话类 feature 都会采用 Stage View，但 Planner 还是独立实现。
   299|
   300|**等 Stage View 抽象在 Inbox 实施中稳定后**，可以考虑：
   301|- 回头把 Planner 的 "Plan Chat" 迁移到 Stage View
   302|- 抽取公共的 layout / IPC / state 管理
   303|- UI 一致性提升
   304|
   305|**当前状态**：
   306|Stage View 在 Inbox 实施中探索。Planner 保持 v1。
   307|
   308|**期望阶段**：
   309|Inbox v2 上线并稳定运行 1-2 个月后，根据抽象的实际可复用度决定。
   310|
   311|**相关**：
   312|- ADR-005
   313|
   314|---
   315|
   316|## 14. CLI 跨平台适配
   317|
   318|**上下文**：
   319|本期 Orbit 主要 mac-first。CLI 的几个跨平台问题：
   320|
   321|- Unix socket vs Named Pipe（macOS/Linux vs Windows）
   322|- 路径分隔符
   323|- Shell quoting 差异（bash vs PowerShell vs cmd）
   324|- `PATH` 前置方式
   325|- `bin/orbit` shim 脚本的执行权限
   326|
   327|**当前状态**：
   328|Unix socket 方案 + 仅 macOS/Linux 充分测试。Windows 需要单独打包 + 测试。
   329|
   330|**期望阶段**：
   331|Linux / Windows 打包时（见 ROADMAP P9）。
   332|
   333|**相关**：
   334|- ADR-008
   335|- `plans/2026-04-26-cli-migration.md`
   336|
   337|---
   338|
   339|## 15. 对话记录（Thinking Trail）与 Chat 内容的边界
   340|
   341|**上下文**：
   342|Thinking Trail 目标是记录 agent 与用户的对话推理过程。但 Orbit 里的 chat 有多种：
   343|- Task Conversation chat（和 agent 讨论单个 task）
   344|- Planner chat（planner agent 设计任务画布）
   345|- 未来可能的 Note chat、Reading chat
   346|
   347|不是所有 chat 都值得进 Thinking Trail（比如日常问 agent "这段代码什么意思"这种问答）。
   348|
   349|**设计问题**：
   350|- 什么标准决定"值得留痕"（用户手动标记？按消息数？按时长？）
   351|- 短对话（<10 条）是否记录
   352|- 隐私/大小控制
   353|
   354|**当前状态**：
   355|没有自动化，全靠用户选择是否 "Save as Thinking Trail"（未来）。
   356|
   357|**期望阶段**：
   358|Thinking Trail 子系统设计时（见 #2）一并考虑。
   359|
   360|**相关**：
   361|- 本文 #2
   362|
   363|---
   364|
   365|## 16. Agent Proposal 滥用防御
   366|
   367|**上下文**：
   368|如果 agent 在 Auto-runner 下过度 propose（每小时 10+ 次），会打扰用户。防御措施待设计：
   369|
   370|- Per-run proposal count limit
   371|- Agent 提议接受率统计 → 接受率持续低的 agent 要在 prompt 中收敛
   372|- Inbox 中 "mute this run's proposals" 功能
   373|- Agent-level / Role-level 的 propose quota
   374|
   375|**当前状态**：
   376|本期只靠 system prompt 引导边界，没有机制性限制。
   377|
   378|**期望阶段**：
   379|上线后观察 agent 行为，根据实际问题设计。
   380|
   381|**相关**：
   382|- ADR-002
   383|- ADR-006
   384|
   385|---
   386|
   387|---
   388|
   389|## 17. Task 状态机和 Agent 会话状态机的耦合（已收敛进 Phase 4.0）
   390|
   391|**上下文**：
   392|2026-04-27 Phase 3 完成代码后 dog-food 立刻暴露的根因——task 项目层状态和 agent 执行层会话状态被错误地耦合在一起，导致：
   393|
   394|- agent 求助补充信息 → task 直接被推到 `blocked`，单向门
   395|- 用户补充完信息 task 不会自动回 doing
   396|- 对话发消息没有自动续跑路径
   397|
   398|**当前状态**：
   399|已收敛进 Phase 4.0 plan：[`plans/2026-04-28-task-execution-lifecycle-realignment.md`](./plans/2026-04-28-task-execution-lifecycle-realignment.md)。
   400|
   401|**相关**：
   402|- ADR-015（待写）/ ADR-016（待写）
   403|- ADR-012（待修订）
   404|
   405|---
   406|
   407|## 如何更新本文
   408|
   409|- 新认识到的"应该做但本期不做"的事项 → 追加新条目
   410|- 已经开始实施的条目 → 标记 "in progress"，链接到实施 plan
   411|- 已经完成或决定不做的条目 → 移到文件底部的 `## 已解决 / 已决定不做` 区（未来可加）
   412|- 每次大迭代 review 时扫描本文，评估哪些条目可以提升到 ROADMAP 的 P1/P2
   413|
   414|本文件应当**长期演进**，不是一次性文档。

(End of file. Total 414 lines.)

---

## [Tool] 2026-04-28T07:10:33.721Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/
- 2026-04-26-v2-direction/
- 2026-04-26-v2-direction/README.md (3.5KB)
- 2026-04-26-v2-direction/conversation.md (23.7KB)
- 2026-04-26-v2-direction/decisions-traced.md (10.1KB)
- 2026-04-26-v2-direction/key-pivots.md (10.6KB)
- 2026-04-28-ask-anywhere-ux/
- 2026-04-28-ask-anywhere-ux/direction-confirmation.md (3.2KB)
- 2026-04-29-chat-unification-decoupling/
- 2026-04-29-chat-unification-decoupling/00-feature-landscape.md (26.1KB)
- 2026-04-29-chat-unification-decoupling/01-runtime-protocol-survey.md (10.1KB)
- 2026-04-29-chat-unification-decoupling/02-app-bus-design.md (12.5KB)
- 2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md (18.1KB)
- 2026-04-29-chat-unification-decoupling/04-architecture-stress-tests.md (34.8KB)
- 2026-04-29-chat-unification-decoupling/05-migration-plan.md (10.4KB)
- 2026-04-29-chat-unification-decoupling/IMPLEMENTATION_NOTES.md (149B)
- 2026-04-29-chat-unification-decoupling/IMPLEMENTATION_PROMPT.md (13.2KB)
- 2026-04-29-chat-unification-decoupling/README.md (4.1KB)
- 2026-04-29-chat-unification-decoupling/conversation.md (18.5KB)
- 2026-04-29-chat-unification-decoupling/decisions-anchor.md (7.6KB)
- 2026-04-30-phase-2-knowledge-stack/
- 2026-04-30-phase-2-knowledge-stack/01-note-system-and-para.md (39.5KB)
- 2026-04-30-phase-2-knowledge-stack/02-scheduled-tasks-ui.md (22.5KB)
- 2026-04-30-phase-2-knowledge-stack/03-gateway-telegram.md (27.1KB)
- 2026-04-30-phase-2-knowledge-stack/04-ask-anywhere-stage-view.md (15.6KB)
- 2026-04-30-phase-2-knowledge-stack/05-daily-timeline.md (32.9KB)
- 2026-04-30-phase-2-knowledge-stack/06-resource-workstation.md (8.0KB)
- 2026-04-30-phase-2-knowledge-stack/README.md (4.0KB)
- 2026-04-30-phase-2-knowledge-stack/history-001.md (337.2KB)
- 2026-04-30-phase-2-knowledge-stack/history-002.md (324.4KB)
- 2026-04-30-phase-2-knowledge-stack/history-003.md (227.1KB)

---

## [Assistant] 2026-04-28T07:11:08.323Z
继续读三个关键文档：Phase 2 的 README（理解知识栈整体）、Resource 工作站（和 wiki 最像的子系统）、Note system（wiki 的 artifact 层基础）。

### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"1","status":"completed","content":"通读 Orbit 愿景/架构/开放问题的一手文档"},{"id":"2","status":"in_progress","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"}],"toolExplanation":"更新进度"})

---

## [Tool] 2026-04-28T07:11:08.330Z
{"todos":[{"id":"1","status":"completed","content":"通读 Orbit 愿景/架构/开放问题的一手文档"},{"id":"2","status":"in_progress","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"},{"id":"3","status":"pending","content":"把 Karpathy LLM Wiki 模式和 Orbit 现状/愿景对位，找契合点与冲突点"},{"id":"4","status":"pending","content":"产出带观点的方案建议 + 待拍板问题"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-28T07:11:25.061Z
### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/README.md"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/06-resource-workstation.md"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/01-note-system-and-para.md"})

---

## [Tool] 2026-04-28T07:11:25.071Z
     1|# Phase 2 · 知识栈扩展
     2|
     3|> **Phase 1**（2026-04-29）聚焦 Chat 解耦和 Ask-Anywhere 基础。
     4|> **Phase 2**（本目录）聚焦笔记系统、PARA 扩展、Daily Timeline、Resource 主题工作站等"知识复利"核心能力。
     5|
     6|## 前置决策
     7|
     8|本 Phase 基于 Phase 1 的 8 个决策锚点（`docs/thinking-trail/2026-04-29-chat-unification-decoupling/decisions-anchor.md`），以及以下新增的 Phase 2 决策：
     9|
    10|### Phase 2 核心决策（P2-D1 ~ P2-D10）
    11|
    12|| # | 决策 |
    13||---|------|
    14|| **P2-D1** | 笔记 / Library / Feed 三分：Note 是用户产出（统一 primitive），Library 是素材，Feed 是流水 |
    15|| **P2-D2** | KB 导入采用"分层引用"路径 C：`notes/` 活跃区 + `knowledge-base/` 存量区（多 KB 并存）+ "激活"机制桥接 |
    16|| **P2-D3** | KB 默认权限可读写（Orbit 可加 frontmatter） |
    17|| **P2-D4** | `notes/` 按 type 分子目录（thoughts/longforms/captures/daily-summaries/voice_logs） |
    18|| **P2-D5** | Notes 一级入口页面采用"最小可用，可扩展"策略（列表+简单编辑+搜索优先） |
    19|| **P2-D6** | 欢迎分析作为初始化流程之一（与 Vision 初始化并列） |
    20|| **P2-D7** | Daily Timeline 全套采纳：时段分组 + 今日一瞥 + AI 总结卡片 + 年月视图 + 导出 PDF |
    21|| **P2-D8** | Timeline 仅上 Layer 1/2 事件，Layer 3（heartbeat/cost 细粒度）完全不上 |
    22|| **P2-D9** | Resource 采用主题工作站完整模型（6 子目录），支持"自下而上涌现"机制 |
    23|| **P2-D10** | Timeline 特殊事件（insight/breakthrough/setback）融合进 Quick Capture |
    24|
    25|### Phase 2 延后决策
    26|
    27|- **Vision 系统**：本 Phase 暂不展开，另找时间讨论。但**欢迎分析**里预留 Vision 初始化钩子
    28|- **Timeline 外部世界连接**（GitHub/Calendar/Health）：架构预留，本 Phase 不实现
    29|- **Timeline 隐私层级**（加密/隐身事件）：架构预留，本 Phase 不实现
    30|
    31|---
    32|
    33|## 文档清单（共 6 份，可独立实施）
    34|
    35|| # | 文档 | 大致规模 | 实施依赖 |
    36||---|------|---------|---------|
    37|| 1 | `01-note-system-and-para.md` — 笔记系统 + PARA 扩展 + KB 导入 | L | 无（最基础） |
    38|| 2 | `02-scheduled-tasks-ui.md` — 定时任务一级入口 | M | 无 |
    39|| 3 | `03-gateway-telegram.md` — Gateway Daemon + Telegram Channel | L | 依赖 Phase 1 Ask-Anywhere 完成 |
    40|| 4 | `04-ask-anywhere-stage-view.md` — Ask-Anywhere 产物舞台 | M | 依赖 Phase 1 Ask-Anywhere、文档 1（知道有哪些产物） |
    41|| 5 | `05-daily-timeline.md` — Daily Timeline 人生日记 | L | 依赖文档 1（需要 Note 事件定义） |
    42|| 6 | `06-resource-workstation.md` — Resource 主题工作站 | L | 依赖文档 1（Library/Note）、文档 5（Timeline 集成） |
    43|
    44|### 建议实施顺序
    45|
    46|```
    47|01 (笔记系统 + PARA)  ──┐
    48|                       ├──→ 05 (Daily Timeline)
    49|02 (定时任务)          ──┘           ↓
    50|                                    06 (Resource)
    51|03 (Gateway)          ──── 独立
    52|04 (Stage View)       ──── 依赖 01
    53|```
    54|
    55|P2-M1: 01（笔记系统）
    56|P2-M2: 02（定时任务）+ 03（Gateway）并行
    57|P2-M3: 05（Timeline）
    58|P2-M4: 06（Resource）
    59|P2-M5: 04（Stage View）
    60|
    61|---
    62|
    63|## 验收标准
    64|
    65|本 Phase 2 全部完成后，Orbit 应该能：
    66|
    67|1. ✅ 用户有一个独立的 Notes 一级入口，能查看 / 编辑 / 搜索所有笔记
    68|2. ✅ 用户能导入存量 Obsidian vault 到 `knowledge-base/`
    69|3. ✅ 初次使用时 Orbit 能"读懂"用户（欢迎分析）
    70|4. ✅ 用户能看到一个 Daily Timeline，一天一张页，一生积累
    71|5. ✅ 用户能在 Timeline 上看到 AI 生成的"今日总结"
    72|6. ✅ 用户能从多个 thoughts 涌现出 Resource 主题
    73|7. ✅ 用户能在 Resource 主题工作站里沉浸思考
    74|8. ✅ 用户能从 Telegram 远程和 Ask-Anywhere 对话
    75|9. ✅ 用户能设置定时任务并看执行历史
    76|10. ✅ Ask-Anywhere 对话能展示产物（stage view）
    77|
    78|---
    79|
    80|## 实施提示词
    81|
    82|所有文档完成后会生成 `IMPLEMENTATION_PROMPT.md`，可一次性交给 AI 实施。

(End of file. Total 82 lines.)

---

## [Tool] 2026-04-28T07:11:25.071Z
     1|# 文档 6：Resource 主题工作站
     2|
     3|> **规模**：L
     4|> **依赖**：文档 1（Note / Library / KB）、文档 5（Daily Timeline）
     5|> **产物**：Resource 一级入口 + `resources/<topic>/` 主题工作站 + 自下而上涌现机制 + Timeline 集成
     6|
     7|---
     8|
     9|## 1. 设计哲学
    10|
    11|Resource 不是收藏夹，也不是 tag。按 Tiago Forte PARA 的原意，Resource 是：
    12|
    13|> **A topic or theme of ongoing interest.**
    14|
    15|在 Orbit 里，Resource 是“时间复利的物化”：一个长期持续感兴趣、没有明确 deadline 的主题空间。它聚合用户自己的 Note、外部 Library、Feed 流入、KB 激活片段、相关项目和这个主题在 Timeline 上的演化。
    16|
    17|---
    18|
    19|## 2. Resource 与其他实体的边界
    20|
    21|| 实体 | 本质 | 与 Resource 的关系 |
    22|| ---- | ---- | ------------------ |
    23|| Note | 用户自己的输出 | 可归属 / 引用到某个 Resource |
    24|| LibraryItem | 外部素材 | 可作为 canonical 或 related material |
    25|| FeedItem | 信息流水 | save to Library 后才进入 Resource |
    26|| KB | 存量知识 | 激活后成为 Note，或作为外部引用被 Resource 索引 |
    27|| Project | 有目标和截止日期 | 可以由 Resource 孵化，也可反哺 Resource |
    28|| Area | 长期责任 | 可以引用 Resource，但 Area 有 commitment，Resource 没有 |
    29|| Archive | 已完成 / 失效 | dormant Resource 可归档或演化到新 Resource |
    30|
    31|---
    32|
    33|## 3. Vault 目录结构
    34|
    35|每个 Resource 是一个独立主题工作站：
    36|
    37|```text
    38|resources/
    39|  second-brain/
    40|    index.md
    41|    _canonical/
    42|      README.md
    43|    _distilled/
    44|      README.md
    45|    _related/
    46|      README.md
    47|    _people/
    48|      README.md
    49|    _projects-touched/
    50|      README.md
    51|    _timeline/
    52|      README.md
    53|    .orbit-resource.json
    54|```
    55|
    56|六个子目录的含义：
    57|
    58|| 目录 | 用途 |
    59|| ---- | ---- |
    60|| `_canonical/` | 这个主题最关键、最稳定、最值得反复引用的材料 |
    61|| `_distilled/` | 用户围绕该主题产生的提炼笔记 / 长文 |
    62|| `_related/` | 相关但还未成为 canonical 的素材、Note、KB 片段 |
    63|| `_people/` | 该主题关联的人物、作者、思想源头 |
    64|| `_projects-touched/` | 由该主题启发或反哺该主题的 Project |
    65|| `_timeline/` | 从 TraceableEvent 投影出的主题演化记录 |
    66|
    67|`.orbit-resource.json` 是 Orbit 的结构化索引缓存；`index.md` 和各 README 让 Obsidian 用户也能直接浏览。
    68|
    69|---
    70|
    71|## 4. 数据模型
    72|
    73|```typescript
    74|export type ResourceStatus = 'active' | 'dormant' | 'evolved' | 'archived';
    75|export type ResourceDepth = 'exploring' | 'practicing' | 'mastered' | 'teaching';
    76|
    77|export interface ResourceFrontmatter {
    78|  id: string;
    79|  type: 'resource';
    80|  title: string;
    81|  slug: string;
    82|  status: ResourceStatus;
    83|  depth: ResourceDepth;
    84|  created: string;
    85|  updated: string;
    86|  last_engaged?: string;
    87|  engagement_count: number;
    88|  tags: string[];
    89|  evolved_to?: string;
    90|}
    91|
    92|export interface ResourceRef {
    93|  id: string;
    94|  kind: 'note' | 'library_item' | 'feed_source' | 'kb_item' | 'project' | 'area' | 'person' | 'url';
    95|  ref: string;
    96|  title?: string;
    97|  summary?: string;
    98|  section: 'canonical' | 'distilled' | 'related' | 'people' | 'projects_touched';
    99|  added_at: string;
   100|}
   101|
   102|export interface Resource {
   103|  frontmatter: ResourceFrontmatter;
   104|  body: string;
   105|  path: string;
   106|  refs: ResourceRef[];
   107|  counts: Record<ResourceRef['section'] | 'timeline', number>;
   108|}
   109|```
   110|
   111|---
   112|
   113|## 5. 核心流转
   114|
   115|### 5.1 Feed → Library → Resource
   116|
   117|用户从 Feed 保存文章到 Library 后，可以把 LibraryItem link 到 Resource。Resource 的 `_related/` 增加引用；如果用户多次引用同一材料，可提升为 `_canonical/`。
   118|
   119|### 5.2 Note → Resource（自下而上涌现）
   120|
   121|Resource 不要求用户先建一个空壳。Orbit 会从 Notes 中扫描 tags / 标题 / 内容关键词：
   122|
   123|1. 某个 tag 或主题在多个 Note 里持续出现
   124|2. 达到阈值后生成 Resource suggestion
   125|3. 用户确认后创建 Resource，并把样本 Note link 到 `_distilled/` 或 `_related/`
   126|
   127|### 5.3 Resource → Project
   128|
   129|当某个 Resource 中累积足够多的 distilled notes 或 project hints，Ask-Anywhere 可以提议立项。项目完成后，它的产物再反哺 `_projects-touched/` 和 `_distilled/`。
   130|
   131|### 5.4 Resource → Timeline
   132|
   133|每次创建 Resource、link 引用、手动 engage、从 suggestion 创建 Resource，都写入 TraceableEvent：
   134|
   135|- `resource.created`
   136|- `resource.updated`
   137|- `resource.ref.linked`
   138|- `resource.engagement`
   139|- `resource.archived`
   140|
   141|Timeline 日视图展示这些事件；Resource 页面内的 `_timeline/` 是按 resource ref 过滤后的主题时间轴。
   142|
   143|### 5.5 Resource → Archive / Evolve
   144|
   145|dormant Resource 不直接删除。用户可以：
   146|
   147|- 归档：移动到 `archives/resources/<slug>/`
   148|- 演化：保留旧 Resource，设置 `status: evolved` 和 `evolved_to`
   149|- 保留：手动 engage，继续 active
   150|
   151|---
   152|
   153|## 6. IPC / API
   154|
   155|```typescript
   156|IPC.resources = {
   157|  list(filter?: ResourceFilter): Promise<ResourceSummary[]>;
   158|  get(resourceIdOrSlug: string): Promise<Resource | null>;
   159|  create(input: CreateResourceInput): Promise<Resource>;
   160|  update(resourceIdOrSlug: string, patch: UpdateResourceInput): Promise<Resource>;
   161|  archive(resourceIdOrSlug: string): Promise<Resource>;
   162|
   163|  linkRef(resourceIdOrSlug: string, input: LinkResourceRefInput): Promise<Resource>;
   164|  unlinkRef(resourceIdOrSlug: string, refId: string): Promise<Resource>;
   165|  engage(resourceIdOrSlug: string, input?: ResourceEngagementInput): Promise<ResourceEngagement>;
   166|
   167|  suggestFromNotes(options?: ResourceSuggestionOptions): Promise<ResourceSuggestion[]>;
   168|  createFromSuggestion(input: CreateResourceFromSuggestionInput): Promise<Resource>;
   169|};
   170|```
   171|
   172|---
   173|
   174|## 7. UI 设计
   175|
   176|Resource 一级入口采用三栏工作站：
   177|
   178|```text
   179|┌───────────────┬───────────────────────────────┬────────────────────┐
   180|│ Resource List │ index.md / section references │ Suggestions / Meta  │
   181|│ + suggestions │ canonical / distilled / ...   │ Timeline / Actions  │
   182|└───────────────┴───────────────────────────────┴────────────────────┘
   183|```
   184|
   185|MVP 必须支持：
   186|
   187|1. 查看所有 Resource
   188|2. 创建 Resource
   189|3. 查看 six-section 工作站
   190|4. link Note / Library / URL / Project 到 Resource
   191|5. 手动 engage
   192|6. 从 Note tags 生成 Resource suggestions，并一键创建
   193|
   194|---
   195|
   196|## 8. 实施步骤
   197|
   198|### Step 1：Shared contract
   199|
   200|1. `src/shared/resource.ts`
   201|2. `IPC.resources`
   202|3. `OrbitApi.resources`
   203|4. Resource 事件 payload 映射
   204|
   205|### Step 2：Main store + IPC
   206|
   207|1. `src/main/resource/store.ts`
   208|2. `src/main/resource/ipc.ts`
   209|3. 创建 Resource 时生成 6 子目录和 README
   210|4. `.orbit-resource.json` 保存 refs
   211|5. 从 `notes/` 扫描 tags 生成 suggestions
   212|6. 所有 mutation 发布 TraceableEvent
   213|
   214|### Step 3：Renderer workbench
   215|
   216|1. `src/renderer/src/views/ResourceView.tsx`
   217|2. 顶部导航增加 `Resources`
   218|3. `VaultView` 路由接入
   219|4. 右侧栏 surface 接入
   220|
   221|### Step 4：Timeline / Scheduled 集成
   222|
   223|1. Timeline Layer 1 纳入 Resource 事件
   224|2. Resource health scan 系统任务指向 Resource API
   225|3. Resource 页面展示最近 engagement
   226|
   227|---
   228|
   229|## 9. 验收标准
   230|
   231|- [ ] README 中声明的 `06-resource-workstation.md` 存在
   232|- [ ] `resources/<slug>/` 创建后包含 6 个子目录和 `index.md`
   233|- [ ] Resource 一级入口可见
   234|- [ ] 可以创建 / 查看 / 更新 / 归档 Resource
   235|- [ ] 可以 link Note / Library / URL / Project 到 Resource
   236|- [ ] 可以手动 engage，且 engagement_count / last_engaged 更新
   237|- [ ] Notes 中重复 tag 能生成 Resource suggestion
   238|- [ ] 从 suggestion 创建 Resource 后，样本 Note 被 link 到 Resource
   239|- [ ] Resource 事件进入 TraceableEvent，并能被 Timeline 消费
   240|
   241|---
   242|
   243|## 10. Future-Proof
   244|
   245|- Resource split / merge
   246|- canonical material promotion workflow
   247|- Resource-scoped Ask-Anywhere context
   248|- Resource monthly review Inbox item
   249|- Resource graph（Resource ↔ Project / Area / Person / Note）
   250|- Resource depth 自动评估（exploring → teaching）

(End of file. Total 250 lines.)

---

## [Tool] 2026-04-28T07:11:25.072Z
     1|# 文档 1：笔记系统 + PARA 扩展 + KB 导入
     2|
     3|> **规模**：L（约 3~5 天 AI 实施 + 数据模型改动）
     4|> **依赖**：Phase 1 完成（Chat 解耦、Conversation 一等公民、Ask-Anywhere MVP）
     5|> **产物**：Notes 一级入口 + KB 导入 + Area/Resource/Archive 基础 + 欢迎分析初始化流程
     6|
     7|---
     8|
     9|## 1. 设计哲学
    10|
    11|### 1.1 Forte CODE+PARA 在 Orbit 的落地
    12|
    13|| CODE 阶段 | Orbit 实现 |
    14||----------|-----------|
    15|| **Capture** | Quick Capture UI + `notes/captures/` 目录 + Feed → Library → 收藏 |
    16|| **Organize** | PARA 四象限（Projects / Areas / Resources / Archives） |
    17|| **Distill** | Library 的 annotation + Note 渐进总结 + Ask-Anywhere 的 `orbit-distill` skill |
    18|| **Express** | `notes/longforms/` + Ask-Anywhere 的 `orbit-express` skill |
    19|
    20|### 1.2 本体论划分（严格遵守，这是模型灵魂）
    21|
    22|```
    23|┌─────────────────────────────────────────────────────────────────┐
    24|│  Output（用户产出）          Input（外部素材）                    │
    25|│  ─────────────────          ─────────────────                  │
    26|│  Note                        LibraryItem（用户主动收藏的）        │
    27|│    type: thought             FeedItem（订阅流入，待筛选）         │
    28|│    type: longform                                               │
    29|│    type: capture             Knowledge Base（存量导入，分层引用） │
    30|│    type: voice_log                                              │
    31|│    type: daily_summary                                          │
    32|│                                                                 │
    33|│  全部是用户自己写的/说的       全部是外部信息                      │
    34|│  → 可进 PARA                  → 素材 → 激活 / distill → Note    │
    35|└─────────────────────────────────────────────────────────────────┘
    36|```
    37|
    38|**铁律**：
    39|- Note 是用户产出的统一 primitive
    40|- Library/Feed **不是** Note
    41|- Knowledge Base 的笔记**不是 Orbit 的活跃 Note**，但可以通过"激活"转换
    42|
    43|---
    44|
    45|## 2. 目录结构（Vault 内）
    46|
    47|### 2.1 完整目录树
    48|
    49|```
    50|<vault>/
    51|├── notes/                           # 活跃工作区（Output）
    52|│   ├── thoughts/                    # 短想法
    53|│   │   └── 2026-04-30T14-02-ab12.md
    54|│   ├── longforms/                   # 长文 / 文章
    55|│   │   └── building-second-brain.md
    56|│   ├── captures/                    # 捕获（有 source 字段）
    57|│   │   └── 2026-04-30T10-15-cd34.md
    58|│   ├── voice_logs/                  # 语音日志
    59|│   │   └── 2026-04-30T19-30-ef56.md
    60|│   └── daily-summaries/             # AI 生成的每日总结
    61|│       └── 2026-04-30.md
    62|│
    63|├── library/                         # 素材层（Input - 用户主动收藏）
    64|│   ├── articles/                    # 网页文章
    65|│   ├── pdfs/                        # PDF 文件
    66|│   ├── videos/                      # 视频（只存元信息 + 链接）
    67|│   └── bookmarks/                   # URL 书签
    68|│
    69|├── feeds/                           # Feed 订阅（流水，未筛选）
    70|│   ├── _sources.json                # 订阅源配置
    71|│   └── <source-id>/                 # 每个订阅源的 items
    72|│       └── 2026-04-30-<item>.json
    73|│
    74|├── knowledge-base/                  # 存量知识区（Input - 导入）
    75|│   ├── <kb-name>/                   # 每个 KB 独立目录，保持原结构
    76|│   │   └── ... 用户原始笔记结构 ...
    77|│   └── .orbit-kb-meta/              # Orbit 对 KB 的元信息（不污染原文）
    78|│       ├── registry.json            # KB 列表 + 配置
    79|│       ├── annotations/             # 对 KB 笔记的标注（Orbit 侧）
    80|│       └── indexes/                 # 检索索引
    81|│
    82|├── projects/                        # PARA - Projects
    83|├── areas/                           # PARA - Areas
    84|├── resources/                       # PARA - Resources（详见文档 6）
    85|├── archives/                        # PARA - Archives
    86|│
    87|└── .orbit/                          # 系统目录
    88|    ├── conversations/
    89|    ├── events/
    90|    └── config.json
    91|```
    92|
    93|### 2.2 路径约定
    94|
    95|| 目录 | 谁写入 | Obsidian 可见 | Ask-Anywhere 可操作 |
    96||------|--------|--------------|---------------------|
    97|| `notes/*` | 用户 + Orbit | ✅ | ✅ 读写 |
    98|| `library/*` | Orbit + 用户 | ✅ | ✅ 读写 |
    99|| `feeds/*` | Orbit 自动 | ✅ | ✅ 只读 |
   100|| `knowledge-base/<kb>/*` | 用户 + Orbit（可读写）| ✅ | ✅ 读写（默认） |
   101|| `knowledge-base/.orbit-kb-meta/*` | Orbit | ✅（但不建议用户改） | ✅ |
   102|| `projects / areas / resources / archives` | 用户 + Orbit | ✅ | ✅ 读写 |
   103|| `.orbit/*` | Orbit | ⚠️ 不建议暴露 | 内部使用 |
   104|
   105|---
   106|
   107|## 3. Note 数据模型
   108|
   109|### 3.1 TypeScript 类型
   110|
   111|```typescript
   112|// src/shared/note/types.ts
   113|
   114|export type NoteType = 
   115|  | 'thought'         // 短想法
   116|  | 'longform'        // 长文
   117|  | 'capture'         // 捕获（有来源）
   118|  | 'voice_log'       // 语音日志
   119|  | 'daily_summary';  // AI 生成的每日总结
   120|
   121|export type NotePARAKind = 
   122|  | 'floating'        // 尚未归属
   123|  | 'project'         // 归属某 project
   124|  | 'area'            // 归属某 area
   125|  | 'resource'        // 归属某 resource
   126|  | 'archive';        // 归档
   127|
   128|export interface NoteFrontmatter {
   129|  // 标识
   130|  id: string;
   131|  type: NoteType;
   132|  title?: string;
   133|  created: string;              // ISO timestamp
   134|  updated: string;
   135|  
   136|  // PARA 归属
   137|  para_kind: NotePARAKind;
   138|  para_ref?: string;            // e.g. "projects/orbit-v2"、"resources/second-brain"
   139|  
   140|  // 标签
   141|  tags: string[];
   142|  
   143|  // 来源（仅 type=capture 有）
   144|  source?: {
   145|    kind: 'library' | 'kb' | 'url' | 'conversation' | 'feed' | 'manual';
   146|    ref?: string;               // 指向来源的引用
   147|    excerpt?: string;           // 原文片段
   148|  };
   149|  
   150|  // Voice log 特有
   151|  audio?: {
   152|    path: string;               // 相对路径
   153|    duration_sec: number;
   154|    transcribed: boolean;
   155|  };
   156|  
   157|  // 双向链
   158|  links_out: string[];          // 出链（wikilink 目标）
   159|  backlinks: string[];          // 反向链（自动维护）
   160|  
   161|  // 元数据
   162|  word_count?: number;
   163|  author?: string;              // 默认用户自己
   164|  visibility?: 'normal' | 'private';  // future-proof 隐私
   165|}
   166|
   167|export interface Note {
   168|  frontmatter: NoteFrontmatter;
   169|  body: string;                 // Markdown 正文
   170|  path: string;                 // 相对 vault 的路径
   171|}
   172|```
   173|
   174|### 3.2 Frontmatter 示例
   175|
   176|**thought**:
   177|```yaml
   178|---
   179|id: note-2026-04-30T14-02-ab12
   180|type: thought
   181|created: 2026-04-30T14:02:33+08:00
   182|updated: 2026-04-30T14:02:33+08:00
   183|para_kind: resource
   184|para_ref: resources/second-brain
   185|tags: [second-brain, distill, insight]
   186|links_out: ["[[Tiago Forte]]"]
   187|backlinks: []
   188|---
   189|
   190|渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，
   191|而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。
   192|```
   193|
   194|**capture** (from library):
   195|```yaml
   196|---
   197|id: note-2026-04-30T10-42-cd34
   198|type: capture
   199|created: 2026-04-30T10:42:00+08:00
   200|updated: 2026-04-30T10:42:00+08:00
   201|para_kind: floating
   202|para_ref: null
   203|tags: [second-brain]
   204|source:
   205|  kind: library
   206|  ref: library/articles/building-a-second-brain-2025.md
   207|  excerpt: "Progressive summarization creates a multi-layer cake of insights..."
   208|links_out: []
   209|backlinks: []
   210|---
   211|
   212|这个比喻很有意思。我想记下来应用到 Orbit 的定时任务设计。
   213|```
   214|
   215|**longform**:
   216|```yaml
   217|---
   218|id: note-longform-orbit-philosophy
   219|type: longform
   220|title: Orbit 是第二大脑的执行层
   221|created: 2026-04-30T14:00:00+08:00
   222|updated: 2026-04-30T15:40:12+08:00
   223|para_kind: project
   224|para_ref: projects/orbit-v2
   225|tags: [orbit, second-brain, philosophy]
   226|word_count: 3421
   227|links_out: ["[[para-in-orbit]]", "[[code-in-orbit]]", "[[Tiago Forte]]"]
   228|backlinks: ["resources/second-brain/index.md"]
   229|---
   230|
   231|# Orbit 是第二大脑的执行层
   232|
   233|……正文……
   234|```
   235|
   236|---
   237|
   238|## 4. Library / Feed 数据模型
   239|
   240|### 4.1 LibraryItem
   241|
   242|```typescript
   243|// src/shared/library/types.ts
   244|
   245|export type LibraryItemKind = 
   246|  | 'article'         // Web 文章（纯文字）
   247|  | 'pdf'             // PDF
   248|  | 'video'           // 视频（只存链接 + 元信息）
   249|  | 'bookmark';       // URL 书签
   250|
   251|export type LibraryItemStatus = 
   252|  | 'unread'
   253|  | 'reading'
   254|  | 'read'
   255|  | 'distilled'       // 已提炼成 Note
   256|  | 'archived';
   257|
   258|export interface LibraryItemFrontmatter {
   259|  id: string;
   260|  kind: LibraryItemKind;
   261|  title: string;
   262|  url?: string;
   263|  author?: string;
   264|  published_at?: string;
   265|  added_at: string;
   266|  status: LibraryItemStatus;
   267|  
   268|  // PARA 关联
   269|  para_refs?: string[];           // 可属于多个 project/area/resource
   270|  
   271|  // 标签
   272|  tags: string[];
   273|  
   274|  // Distill 关联
   275|  distilled_into?: string[];      // 产生的 Note id 列表
   276|  annotations_count: number;
   277|  
   278|  // 文件位置（本地有副本时）
   279|  local_path?: string;            // e.g. "library/pdfs/xxx.pdf"
   280|}
   281|
   282|export interface LibraryItem {
   283|  frontmatter: LibraryItemFrontmatter;
   284|  body?: string;                  // markdown 正文（article 类型）
   285|  annotations: LibraryAnnotation[];
   286|}
   287|
   288|export interface LibraryAnnotation {
   289|  id: string;
   290|  at: string;                     // 时间
   291|  range: { start: number; end: number };
   292|  type: 'highlight' | 'underline' | 'bold' | 'comment';
   293|  text: string;                   // 标注的原文
   294|  comment?: string;               // 用户评论
   295|  color?: string;
   296|  note_id?: string;               // 如果这条 annotation 转成了 note
   297|}
   298|```
   299|
   300|### 4.2 FeedItem & FeedSource
   301|
   302|```typescript
   303|// src/shared/feed/types.ts
   304|
   305|export type FeedSourceKind = 'rss' | 'newsletter' | 'youtube' | 'twitter' | 'manual';
   306|
   307|export interface FeedSource {
   308|  id: string;
   309|  kind: FeedSourceKind;
   310|  name: string;
   311|  url: string;
   312|  last_fetched_at?: string;
   313|  fetch_interval_minutes: number;
   314|  active: boolean;
   315|  tags?: string[];
   316|}
   317|
   318|export type FeedItemStatus = 
   319|  | 'new'
   320|  | 'seen'
   321|  | 'saved_to_library'   // 用户 save 进 library 了
   322|  | 'dismissed';
   323|
   324|export interface FeedItem {
   325|  id: string;
   326|  source_id: string;
   327|  title: string;
   328|  url: string;
   329|  summary?: string;
   330|  published_at: string;
   331|  fetched_at: string;
   332|  status: FeedItemStatus;
   333|  saved_to_library_ref?: string;  // library item path
   334|}
   335|```
   336|
   337|### 4.3 存储
   338|
   339|**LibraryItem**：每个是一个目录（因为可能有大文件 + annotation）
   340|```
   341|library/articles/<id>/
   342|  index.md          # frontmatter + body
   343|  annotations.json  # 标注列表（或嵌入 frontmatter）
   344|  assets/           # 图片等资源
   345|```
   346|
   347|或简化为单文件（MVP 推荐）：
   348|```
   349|library/articles/<slug>.md   # frontmatter + body + annotations 嵌入
   350|```
   351|
   352|**FeedSource**：单个配置文件 `feeds/_sources.json`
   353|**FeedItem**：单 JSON 文件，按 source 分子目录 `feeds/<source-id>/<item-id>.json`
   354|
   355|---
   356|
   357|## 5. Knowledge Base（KB）数据模型
   358|
   359|### 5.1 KB Registry
   360|
   361|```typescript
   362|// src/shared/knowledge-base/types.ts
   363|
   364|export interface KnowledgeBase {
   365|  id: string;                      // 内部 id
   366|  name: string;                    // 用户起的名
   367|  path: string;                    // 相对 vault 的路径，如 "knowledge-base/obsidian-2023"
   368|  source_type: 'obsidian' | 'markdown-folder' | 'notion-export' | 'generic';
   369|  imported_at: string;
   370|  last_scanned_at?: string;
   371|  
   372|  // 权限（P2-D3 默认可读写）
   373|  writable: boolean;
   374|  
   375|  // 索引状态
   376|  index_status: 'pending' | 'indexing' | 'ready' | 'error';
   377|  item_count: number;
   378|  
   379|  // 元数据
   380|  description?: string;
   381|  welcome_analysis_done: boolean;
   382|}
   383|```
   384|
   385|### 5.2 Registry 文件
   386|
   387|```
   388|knowledge-base/.orbit-kb-meta/registry.json
   389|```
   390|
   391|```json
   392|{
   393|  "kbs": [
   394|    {
   395|      "id": "kb-obsidian-2023",
   396|      "name": "Obsidian 2023 Archive",
   397|      "path": "knowledge-base/obsidian-2023",
   398|      "source_type": "obsidian",
   399|      "imported_at": "2026-04-30T09:00:00+08:00",
   400|      "writable": true,
   401|      "index_status": "ready",
   402|      "item_count": 1247,
   403|      "welcome_analysis_done": true
   404|    }
   405|  ]
   406|}
   407|```
   408|
   409|### 5.3 激活机制的数据关系
   410|
   411|当用户从 KB 激活一段到活跃区：
   412|
   413|```yaml
   414|# 在 notes/thoughts/xxx.md 新建：
   415|---
   416|id: note-2026-04-30T14-02-activated
   417|type: capture
   418|source:
   419|  kind: kb
   420|  ref: kb-obsidian-2023/folder/original.md
   421|  excerpt: "原始段落内容..."
   422|para_kind: floating
   423|---
   424|
   425|（用户可编辑）我对这段的新理解...
   426|```
   427|
   428|**原 KB 文件不动**。只是在 `.orbit-kb-meta/annotations/` 里记录一条 activation：
   429|
   430|```json
   431|// knowledge-base/.orbit-kb-meta/annotations/<kb-id>/<original-file>.json
   432|{
   433|  "activations": [
   434|    {
   435|      "at": "2026-04-30T14:02:00+08:00",
   436|      "source_range": { "start": 120, "end": 280 },
   437|      "activated_to": "notes/thoughts/note-2026-04-30T14-02-activated.md"
   438|    }
   439|  ]
   440|}
   441|```
   442|
   443|这样 KB 原文保持纯净，但 Orbit 知道"这段被激活过"。
   444|
   445|---
   446|
   447|## 6. PARA 扩展（Area / Resource / Archive 基础能力）
   448|
   449|> **说明**：Resource 详细设计见文档 6。本节只给 Area / Archive / Resource 的基础数据模型和目录结构。
   450|
   451|### 6.1 Project（已有，本次不改）
   452|
   453|现有 `projects/<slug>/` 目录结构保持不变。本次新增的是**让 Note/Library 能 link 到 Project**（通过 `para_ref`）。
   454|
   455|### 6.2 Area
   456|
   457|```
   458|areas/
   459|  engineering-lead/
   460|    index.md                  # Area 主页：职责/承诺/评审频率
   461|    _commitments.md           # 具体承诺（e.g. "每周写一篇技术周报"）
   462|    _reviews/                 # 周/月评审记录
   463|      2026-04-week-17.md
   464|      2026-04.md
   465|    _projects-active.md       # 当前活跃 projects（自动生成的 link 列表）
   466|    _notes-linked.md          # 关联 notes（自动生成）
   467|```
   468|
   469|**Area frontmatter**:
   470|```yaml
   471|---
   472|type: area
   473|title: Engineering Lead
   474|created: 2026-01-01
   475|review_cadence: weekly       # weekly | monthly | quarterly | none
   476|last_reviewed_at: 2026-04-24
   477|health: active               # active | stagnant | dormant
   478|commitments: 
   479|  - "每周写一篇技术周报"
   480|  - "每月做一次团队 1on1"
   481|tags: [engineering, leadership]
   482|---
   483|```
   484|
   485|### 6.3 Resource（见文档 6，此处略）
   486|
   487|目录预留 `resources/`。
   488|
   489|### 6.4 Archive
   490|
   491|```
   492|archives/
   493|  projects/
   494|    2025-10-rewrite-auth-system/    # 完整搬迁过来
   495|  areas/
   496|  notes/                             # 归档的长文（很少见）
   497|  resources/
   498|```
   499|
   500|**归档操作**：
   501|```
   502|archive(entity) {
   503|  from = entity.path
   504|  to = "archives/" + entity.type + "/" + entity.slug
   505|  move file(s)
   506|  update links (wikilink 不变但 Orbit 记录重定向)
   507|  emit event: para.archived
   508|}
   509|```
   510|
   511|---
   512|
   513|## 7. Notes 一级入口 UI（最小可用 + 扩展路径）
   514|
   515|### 7.1 路由
   516|
   517|- 左侧栏新增一级入口：`Notes`（icon: `NotebookPen` from lucide-react）
   518|- 位置：Ask-Anywhere 之下，Projects 之上
   519|- 路由：`/notes`
   520|
   521|### 7.2 MVP UI 布局
   522|
   523|```
   524|┌──────────────────────────────────────────────────────────────────┐
   525|│  Notes                                       [+ 新建] [🔍] [⚙️]   │
   526|│  ────────────────────────────────────────────────────────────── │
   527|│                                                                  │
   528|│  ┌─── 筛选栏 ────────────────────────────────────────────────┐   │
   529|│  │ 类型: [全部] [thought] [longform] [capture] [voice] [daily]│   │
   530|│  │ PARA: [全部] [project] [area] [resource] [floating]        │   │
   531|│  │ 标签: [#second-brain] [#orbit] [+]                         │   │
   532|│  │ 排序: [最近更新 ▼]                                          │   │
   533|│  └──────────────────────────────────────────────────────────┘   │
   534|│                                                                  │
   535|│  ┌── 列表 ────────────────────────────────────────────────────┐ │
   536|│  │ 💭 渐进式总结对定时任务设计很有启发                         │ │
   537|│  │    thought · resources/second-brain · 10 分钟前              │ │
   538|│  ├────────────────────────────────────────────────────────────┤ │
   539|│  │ ✍️  Orbit 是第二大脑的执行层                                │ │
   540|│  │    longform · 3421 字 · projects/orbit-v2 · 40 分钟前       │ │
   541|│  ├────────────────────────────────────────────────────────────┤ │
   542|│  │ 📌 这个比喻很有意思                                          │ │
   543|│  │    capture · 来自 library · 3 小时前                        │ │
   544|│  └────────────────────────────────────────────────────────────┘ │
   545|│                                                                  │
   546|│  [← 上一页]  [1 / 5]  [下一页 →]                                  │
   547|└──────────────────────────────────────────────────────────────────┘
   548|```
   549|
   550|### 7.3 笔记详情 / 编辑视图
   551|
   552|点击进入单笔记：
   553|
   554|```
   555|┌──────────────────────────────────────────────────────────────────┐
   556|│  ← 返回   [保存] [删除] [归档] [...]                              │
   557|│                                                                  │
   558|│  💭 渐进式总结对定时任务设计很有启发                              │
   559|│  ────────────────────────────────────────────────────────────── │
   560|│  thought · resources/second-brain · 2026-04-30 14:02             │
   561|│                                                                  │
   562|│  ┌── frontmatter (可折叠) ──────────────────────────────────┐    │
   563|│  │ para_kind: resource                                     │    │
   564|│  │ para_ref: resources/second-brain                        │    │
   565|│  │ tags: [second-brain, distill, insight]                  │    │
   566|│  └───────────────────────────────────────────────────────┘    │
   567|│                                                                  │
   568|│  ┌── 正文 (markdown 编辑器) ────────────────────────────────┐    │
   569|│  │ 渐进式总结对定时任务设计很有启发 —— 每次评审不是从头读，      │    │
   570|│  │ 而是在前一次的基础上再薄一层墨。这本身就是一种时间复利。     │    │
   571|│  │                                                         │    │
   572|│  │ [[Tiago Forte]]                                         │    │
   573|│  └───────────────────────────────────────────────────────┘    │
   574|│                                                                  │
   575|│  ┌── 反向链 (backlinks) ─────────────────────────────────┐       │
   576|│  │ · resources/second-brain/index.md                     │       │
   577|│  │ · projects/orbit-v2/notes/distill-explorations.md     │       │
   578|│  └───────────────────────────────────────────────────────┘       │
   579|│                                                                  │
   580|│  [💬 和 Ask-Anywhere 讨论这条笔记]                                │
   581|└──────────────────────────────────────────────────────────────────┘
   582|```
   583|
   584|### 7.4 编辑器技术选型
   585|
   586|- 用现有 markdown editor（项目应该已有，如 `react-markdown` + 简单 textarea，或 `codemirror`）
   587|- **不引入** Monaco / Tiptap 等重型编辑器
   588|- 支持：frontmatter 折叠、wikilink 自动补全（输入 `[[` 弹出笔记列表）、tag 自动补全（`#`）
   589|
   590|### 7.5 MVP 不做但要预留的扩展点
   591|
   592|在文档中**明确标记这些是后续迭代方向**，现在不做但架构不要挡路：
   593|
   594|- 🔮 **图谱视图**（双链可视化）
   595|- 🔮 **日历视图**（按时间看笔记创建分布）
   596|- 🔮 **Tag 云**
   597|- 🔮 **全文搜索增强**（向量检索、语义搜索）
   598|- 🔮 **协作编辑 / 分享**
   599|- 🔮 **版本历史**（git-like）
   600|- 🔮 **Templates**（笔记模板）
   601|- 🔮 **Diagrams**（Mermaid / Excalidraw 嵌入）
   602|
   603|---
   604|
   605|## 8. 欢迎分析 + 初始化流程
   606|
   607|### 8.1 触发条件
   608|
   609|- 用户首次打开 Orbit（没有 vault 或 vault 是空的）
   610|- 用户主动点击"重新分析"（设置里）
   611|
   612|### 8.2 初始化流程（5 步）
   613|
   614|```
   615|┌─ Step 1: 欢迎 ───────────────────────────────────────────┐
   616|│  "欢迎使用 Orbit。我是你的规划者代理 Ask-Anywhere。       │
   617|│   在开始前，我想了解一下你。"                             │
   618|│                                                         │
   619|│  [开始] [跳过初始化]                                     │
   620|└─────────────────────────────────────────────────────────┘
   621|
   622|┌─ Step 2: Vault 位置 ─────────────────────────────────────┐
   623|│  "你的 Orbit vault 放在哪里？"                            │
   624|│                                                         │
   625|│  ○ 新建一个 vault                                        │
   626|│  ○ 使用已有的 Obsidian vault                             │
   627|│  ○ 稍后设置                                              │
   628|└─────────────────────────────────────────────────────────┘
   629|
   630|┌─ Step 3: 存量笔记导入 ───────────────────────────────────┐
   631|│  "你有存量的笔记 / 知识库想导入吗？                        │
   632|│   我会读它们来了解你，并给你建议 PARA 初始结构。"          │
   633|│                                                         │
   634|│  [导入文件夹]  [添加更多]  [跳过]                         │
   635|│                                                         │
   636|│  已添加:                                                 │
   637|│  ┌─────────────────────────────────────────────────┐    │
   638|│  │ 📂 Obsidian 2023 Archive                         │    │
   639|│  │    /Users/.../obsidian-vault                     │    │
   640|│  │    ✓ 1247 个笔记                                  │    │
   641|│  │    权限: ⦿ 可读写  ○ 只读                         │    │
   642|│  │    [移除]                                        │    │
   643|│  └─────────────────────────────────────────────────┘    │
   644|└─────────────────────────────────────────────────────────┘
   645|
   646|┌─ Step 4: 欢迎分析（进行中）──────────────────────────────┐
   647|│  "我在读你的笔记..."                                     │
   648|│  [████████████░░░░░░░░]  62%                            │
   649|│                                                         │
   650|│  扫描中: obsidian-2023/projects/...                      │
   651|│  已发现: 47 个主题、12 个人物、3 个活跃项目               │
   652|└─────────────────────────────────────────────────────────┘
   653|
   654|┌─ Step 5: 分析结果 + 初始化建议 ──────────────────────────┐
   655|│  "我读完了。以下是我的观察："                             │
   656|│                                                         │
   657|│  📚 核心主题（可立为 Resource）:                          │
   658|│    ⦿ Second Brain / 知识管理 (42 次提及)                 │
   659|│    ⦿ 工程领导力 (28 次)                                   │
   660|│    ⦿ 创业与商业洞察 (19 次)                              │
   661|│    ○ AI 与 Agent (14 次)                                  │
   662|│    [手动调整]                                            │
   663|│                                                         │
   664|│  🎯 看起来在做的项目（可立为 Project）:                   │
   665|│    ⦿ Orbit 应用开发 (最近活跃)                           │
   666|│    ⦿ 个人知识库迁移                                       │
   667|│    [手动调整]                                            │
   668|│                                                         │
   669|│  🗺️ 责任领域（可立为 Area）:                              │
   670|│    ⦿ 工程 team lead                                       │
   671|│    ⦿ 家庭与健康                                           │
   672|│    [手动调整]                                            │
   673|│                                                         │
   674|│  📅 下一步建议:                                          │
   675|│    "你的愿景还没设置。完成 PARA 初始化后，                │
   676|│     我建议你花 10 分钟和我对话，一起梳理愿景。"           │
   677|│                                                         │
   678|│  [应用以上建议]  [逐项确认]  [全部跳过]                   │
   679|└─────────────────────────────────────────────────────────┘
   680|```
   681|
   682|### 8.3 欢迎分析的实现（Ask-Anywhere Skill）
   683|
   684|在 Phase 1 的 Skill 清单里我们标记过：`orbit-welcome-analysis`。
   685|
   686|实现要点：
   687|
   688|```typescript
   689|// src/main/ask-anywhere/skills/welcome-analysis.ts
   690|
   691|export const welcomeAnalysisSkill: Skill = {
   692|  id: 'orbit-welcome-analysis',
   693|  name: '欢迎分析',
   694|  trigger: 'explicit',  // 不是自动激活，由初始化流程显式调用
   695|  
   696|  async analyze(kbPaths: string[]): Promise<WelcomeAnalysisResult> {
   697|    // 1. 扫描所有 KB，提取 markdown 文件
   698|    // 2. 用 LLM 批量处理（分批避免 context 爆炸），提取:
   699|    //    - 高频主题（标签 / 关键词 tf-idf）
   700|    //    - 活跃项目（最近修改 + 有明确目标的笔记）
   701|    //    - 责任领域（长期出现但无具体项目）
   702|    //    - 人物（@提及、[[人名]] 链接）
   703|    // 3. 返回结构化结果
   704|  }
   705|};
   706|
   707|interface WelcomeAnalysisResult {
   708|  topics: Array<{ name: string; mentions: number; sample_notes: string[]; suggested_as: 'resource' }>;
   709|  projects: Array<{ name: string; recent_activity: string; suggested_as: 'project' }>;
   710|  areas: Array<{ name: string; commitment_hints: string[]; suggested_as: 'area' }>;
   711|  people: Array<{ name: string; context: string }>;
   712|}
   713|```
   714|
   715|### 8.4 Vision 初始化钩子（本 Phase 不实现，但预留）
   716|
   717|在 Step 5 之后，初始化流程**建议**用户继续做 Vision 初始化：
   718|
   719|```
   720|"你的愿景还没设置。这对 Orbit 很重要——它决定了我帮你怎么规划。
   721| 花 10 分钟和我对话设置？"
   722|
   723|[去设置愿景]  [稍后]
   724|```
   725|
   726|点击"去设置愿景"跳转到 Vision 初始化界面（本 Phase 不实现，返回 "Coming Soon"）。
   727|
   728|代码里保留这个路由和跳转逻辑，待 Vision Phase 填充。
   729|
   730|---
   731|
   732|## 9. Ask-Anywhere 相关 Skill 接入
   733|
   734|本文档涉及 3 个 skill 的 stub 实现（skill 完整设计见未来单独讨论）：
   735|
   736|### 9.1 `orbit-capture`（捕获）
   737|- 触发：用户说"记一下"、"捕获"、"想到"、"保存"
   738|- 行为：创建 `notes/captures/` 或 `notes/thoughts/` 笔记
   739|- 自动判断 PARA 归属：基于当前 active focus + 近期笔记主题相似度
   740|
   741|### 9.2 `orbit-retrieve`（检索）
   742|- 触发：用户说"我之前写过"、"有没有笔记关于"、"查一下"
   743|- 行为：跨 notes / library / kb 语义搜索
   744|- 返回：Note/Library 列表 + 相关度
   745|
   746|### 9.3 `orbit-welcome-analysis`（首次导入后分析）
   747|- 触发：初始化流程 / 用户手动
   748|- 行为：如 8.3 节
   749|
   750|**skill 完整清单**：Phase 1 定义 10 个，本 Phase 实装上面 3 个 stub，其余后续。
   751|
   752|---
   753|
   754|## 10. IPC / API 接口
   755|
   756|### 10.1 Main Process
   757|
   758|```typescript
   759|// src/main/note/ipc.ts
   760|
   761|IPC.notes = {
   762|  // 列表
   763|  list: (filter?: NoteFilter): Promise<Note[]> => {},
   764|  
   765|  // 单个
   766|  get: (noteId: string): Promise<Note | null> => {},
   767|  getByPath: (path: string): Promise<Note | null> => {},
   768|  
   769|  // 创建/更新/删除
   770|  create: (input: CreateNoteInput): Promise<Note> => {},
   771|  update: (noteId: string, patch: Partial<NoteFrontmatter> & { body?: string }): Promise<Note> => {},
   772|  delete: (noteId: string): Promise<void> => {},
   773|  archive: (noteId: string): Promise<void> => {},
   774|  
   775|  // 搜索
   776|  search: (query: string, options?: SearchOptions): Promise<Note[]> => {},
   777|  
   778|  // 订阅变化（双工：Orbit UI 改动 + Obsidian 外部改动）
   779|  subscribe: (cb: (event: NoteChangeEvent) => void): () => void => {},
   780|};
   781|
   782|IPC.library = {
   783|  list: (filter?: LibraryFilter) => {},
   784|  get: (id: string) => {},
   785|  addUrl: (url: string) => {},                   // 从 URL 抓取文章
   786|  addFile: (path: string) => {},                 // 导入本地文件
   787|  addBookmark: (url: string, metadata?: {...}) => {},
   788|  annotate: (itemId: string, annotation: LibraryAnnotation) => {},
   789|  distillToNote: (itemId: string, annotationId?: string) => Promise<Note> => {},
   790|};
   791|
   792|IPC.feeds = {
   793|  sources: {
   794|    list: () => {},
   795|    add: (source: FeedSource) => {},
   796|    remove: (sourceId: string) => {},
   797|    update: (sourceId: string, patch: Partial<FeedSource>) => {},
   798|  },
   799|  items: {
   800|    list: (filter?: FeedFilter) => {},
   801|    saveToLibrary: (itemId: string) => {},
   802|    dismiss: (itemId: string) => {},
   803|  },
   804|  refresh: (sourceId?: string) => {},             // 立即拉取
   805|};
   806|
   807|IPC.knowledgeBase = {
   808|  list: () => {},                                 // 所有 KB
   809|  import: (input: {
   810|    name: string;
   811|    sourcePath: string;
   812|    sourceType: KnowledgeBase['source_type'];
   813|    writable?: boolean;
   814|  }) => Promise<KnowledgeBase> => {},
   815|  remove: (kbId: string, deleteFiles?: boolean) => {},
   816|  rescan: (kbId: string) => {},
   817|  search: (kbId: string | 'all', query: string) => {},
   818|  
   819|  // 激活机制
   820|  activate: (input: {
   821|    kbId: string;
   822|    sourceFile: string;
   823|    excerpt: string;
   824|    targetType?: 'thought' | 'capture';
   825|    userText?: string;                             // 用户追加的文字
   826|  }) => Promise<Note> => {},
   827|};
   828|
   829|IPC.para = {
   830|  archive: (entityRef: string) => {},
   831|  unarchive: (archiveRef: string) => {},
   832|  move: (entityRef: string, newParaKind: NotePARAKind, newParaRef?: string) => {},
   833|};
   834|
   835|IPC.onboarding = {
   836|  status: () => Promise<OnboardingStatus> => {},   // 初始化到了哪一步
   837|  skip: () => {},
   838|  runWelcomeAnalysis: (kbIds: string[]) => Promise<WelcomeAnalysisResult> => {},
   839|  applySuggestions: (suggestions: WelcomeAnalysisResult) => {},
   840|};
   841|```
   842|
   843|### 10.2 事件发布（进 TraceableEvent）
   844|
   845|```typescript
   846|// 在 src/shared/events/kinds.ts 新增
   847|export const NOTE_EVENT_KINDS = [
   848|  'note.created',
   849|  'note.updated',
   850|  'note.deleted',
   851|  'note.archived',
   852|] as const;
   853|
   854|export const LIBRARY_EVENT_KINDS = [
   855|  'library.item.added',
   856|  'library.item.annotated',
   857|  'library.item.status_changed',
   858|  'library.item.distilled',
   859|] as const;
   860|
   861|export const FEED_EVENT_KINDS = [
   862|  'feed.source.added',
   863|  'feed.source.removed',
   864|  'feed.items.fetched',
   865|  'feed.item.saved_to_library',
   866|  'feed.item.dismissed',
   867|] as const;
   868|
   869|export const KB_EVENT_KINDS = [
   870|  'kb.imported',
   871|  'kb.removed',
   872|  'kb.scanned',
   873|  'kb.activated',                    // 激活一段到 notes
   874|  'kb.welcome_analysis_completed',
   875|] as const;
   876|
   877|export const PARA_EVENT_KINDS = [
   878|  'para.archived',
   879|  'para.unarchived',
   880|  'para.moved',
   881|] as const;
   882|```
   883|
   884|这些事件会被 Daily Timeline 消费（见文档 5）。
   885|
   886|---
   887|
   888|## 11. 迁移 / 兼容策略
   889|
   890|### 11.1 现有数据处理
   891|
   892|| 现有内容 | 迁移策略 |
   893||---------|---------|
   894|| 现有的 thoughts（如果有散落的） | 扫描 + 移动到 `notes/thoughts/`，补齐 frontmatter |
   895|| 现有的 library（Phase 1 之前有的话）| 原结构保留，迁移到 `library/` 顶层 |
   896|| projects / areas（Phase 1 已有）| 不动 |
   897|
   898|迁移脚本：`src/main/migrations/phase2-note-system.ts`
   899|- 启动时检查 vault 里是否有"旧结构"
   900|- 有则提示用户"发现旧数据，自动迁移？"
   901|- 用户同意后执行（原子操作，失败回滚）
   902|- 迁移完成后写入 `.orbit/migrations.json` 标记
   903|
   904|### 11.2 Obsidian vault 兼容
   905|
   906|- 如果用户的 vault 原本就是 Obsidian vault，导入时**识别 `.obsidian/`** 目录，不破坏
   907|- 用户在 Obsidian 里改动笔记（外部修改）→ Orbit 文件系统 watcher 感知 → 更新内存索引 → UI 刷新
   908|- Orbit 写入的 frontmatter 对 Obsidian **完全兼容**（YAML 格式、标准字段名）
   909|
   910|### 11.3 冲突处理
   911|
   912|- 文件系统 win：Orbit 内存状态以磁盘为准
   913|- 用户同时在 Orbit 和 Obsidian 编辑同一文件：**磁盘最后写入的胜出**，Orbit 收到文件变化事件后丢弃内存未保存的改动（但弹出提示）
   914|
   915|---
   916|
   917|## 12. 实施步骤（AI 执行顺序）
   918|
   919|**每一步完成后必须 build 通过，可独立 commit。**
   920|
   921|### Step 1: 数据模型 + 存储基础（半天）
   922|1. 新建 `src/shared/note/types.ts`
   923|2. 新建 `src/shared/library/types.ts`
   924|3. 新建 `src/shared/feed/types.ts`
   925|4. 新建 `src/shared/knowledge-base/types.ts`
   926|5. 新建 `src/main/note/store.ts`（CRUD + frontmatter 解析）
   927|6. 新建 `src/main/library/store.ts`
   928|7. 新建 `src/main/feed/store.ts`
   929|8. 新建 `src/main/knowledge-base/store.ts`
   930|9. 补齐 `src/shared/events/kinds.ts` 新增事件
   931|
   932|### Step 2: IPC + 事件发布（半天）
   933|1. `src/main/note/ipc.ts`
   934|2. `src/main/library/ipc.ts`
   935|3. `src/main/feed/ipc.ts`
   936|4. `src/main/knowledge-base/ipc.ts`
   937|5. `src/main/para/ipc.ts`
   938|6. `src/main/onboarding/ipc.ts`
   939|7. preload 暴露
   940|8. 所有 CUD 操作发布 TraceableEvent
   941|
   942|### Step 3: Notes 一级入口 UI MVP（1 天）
   943|1. 新建 `src/renderer/views/NotesView.tsx`
   944|2. 新建 `src/renderer/components/NoteList.tsx`
   945|3. 新建 `src/renderer/components/NoteEditor.tsx`（基础 markdown 编辑）
   946|4. 新建 `src/renderer/components/NoteFilters.tsx`
   947|5. 左侧栏添加入口
   948|6. 路由 `/notes`、`/notes/:noteId`
   949|
   950|### Step 4: Library 基础 UI（半天）
   951|1. 新建 `src/renderer/views/LibraryView.tsx`
   952|2. LibraryItem 列表 + 详情
   953|3. "Add from URL" / "Add PDF" / "Add Bookmark" 入口
   954|4. 集成到 Ask-Anywhere（用户说"我保存一下这个链接..."）
   955|
   956|### Step 5: Feed 基础 UI（半天）
   957|1. `src/renderer/views/FeedView.tsx`
   958|2. 订阅源管理
   959|3. Feed items 浏览 + save/dismiss
   960|4. 定时拉取机制（与定时任务系统协同，详见文档 2）
   961|
   962|### Step 6: Knowledge Base 导入 + 激活（1 天）
   963|1. KB 导入向导（文件夹选择 + 类型检测）
   964|2. KB 扫描 + 索引（全文 + 简单向量）
   965|3. 激活机制 UI（在 KB 笔记里选中段落 → 激活按钮）
   966|4. 激活后创建 Note 并跳转编辑
   967|
   968|### Step 7: 欢迎分析 + 初始化流程（1 天）
   969|1. 初始化检测逻辑（`src/main/onboarding/manager.ts`）
   970|2. 初始化向导 UI（5 步流程）
   971|3. `orbit-welcome-analysis` skill stub 实现
   972|4. 应用建议的 Project/Area/Resource 初始化
   973|5. Vision 初始化钩子（跳转占位）
   974|
   975|### Step 8: Obsidian 兼容（文件系统 watcher，半天）
   976|1. `chokidar` 或 Node `fs.watch` 监听 `notes/` 和 `knowledge-base/`
   977|2. 外部变化 → 重新加载 → 发事件到 UI
   978|3. 冲突处理（磁盘 win + UI 提示）
   979|
   980|### Step 9: 迁移脚本（半天）
   981|1. 扫描旧数据
   982|2. 迁移 UI + 进度条
   983|3. 回滚机制
   984|
   985|### Step 10: 测试 + 收尾（半天）
   986|1. 集成测试：完整流程走一遍（导入 KB → 欢迎分析 → 创建 note → 编辑 → 激活）
   987|2. Obsidian 兼容验证（在 Obsidian 里改，Orbit 能同步）
   988|3. CHANGELOG + ADR-016（本文档定稿为 ADR）
   989|
   990|**总计：约 6~7 天 AI 实施**
   991|
   992|---
   993|
   994|## 13. 验收标准
   995|
   996|### 功能
   997|- [ ] Notes 一级入口可见，能看到所有笔记
   998|- [ ] 能创建 4 种类型的 note（thought/longform/capture/voice_log），frontmatter 正确
   999|- [ ] 能编辑、删除、归档
  1000|- [ ] wikilink 自动补全工作（输入 `[[` 弹出列表）
  1001|- [ ] 反向链自动计算
  1002|- [ ] Library 能添加 URL 文章、PDF、书签
  1003|- [ ] Feed 能订阅 RSS / Newsletter
  1004|- [ ] KB 能导入（至少 obsidian 类型）
  1005|- [ ] 激活机制工作（从 KB 选段 → 生成 note，原 KB 文件不变）
  1006|- [ ] 欢迎分析初始化流程走通
  1007|- [ ] PARA 归属能正确设置
  1008|- [ ] 归档能正常移动文件
  1009|
  1010|### 数据
  1011|- [ ] 所有写入 `notes/` 的文件是标准 markdown + YAML frontmatter
  1012|- [ ] Obsidian 能打开 vault 并正常显示
  1013|- [ ] 在 Obsidian 里编辑笔记，Orbit 能感知并刷新
  1014|- [ ] 删除文件的原子性保证（失败不留半截）
  1015|
  1016|### 事件
  1017|- [ ] CRUD 操作都发布对应 TraceableEvent
  1018|- [ ] 事件能在 DeveloperConsoleView 看到
  1019|
  1020|### 兼容
  1021|- [ ] 旧数据迁移工作（如果有）
  1022|- [ ] Phase 1 的 Task / Conversation / Ask-Anywhere 功能不受影响
  1023|
  1024|---
  1025|
  1026|## 14. Future-Proof 预留
  1027|
  1028|架构上预留但本 Phase 不实现：
  1029|
  1030|- **笔记加密**：`NoteFrontmatter.visibility: 'private'` 字段已定义，未来可扩展为加密存储
  1031|- **笔记版本历史**：考虑在 `.orbit/note-history/<id>/<version>.md` 存历史
  1032|- **协作/同步**：frontmatter 已有 `author` 字段，未来扩展多人
  1033|- **Templates**：`notes/_templates/` 目录预留
  1034|- **AI 增强编辑**：编辑器组件设计时预留 plugin 接口
  1035|
  1036|---
  1037|
  1038|## 附录：和既有决策的映射
  1039|
  1040|| Phase 1 决策 | 本文档如何承接 |
  1041||------------|---------------|
  1042|| D-5 Conversation 一等公民 | Note 也可作为 Conversation 的 anchor（讨论某条笔记） |
  1043|| D-6 各地方自己配置 auto agent | Note / Library 也可以配置自动 agent（如自动打标签） |
  1044|| ADR-014 Chat 解耦 | Notes 页面里的"💬 和 Ask-Anywhere 讨论" 按钮复用 ChatView |
  1045|| ADR-015 Ask-Anywhere 规划者 | 欢迎分析是 Ask-Anywhere 的第一个 skill 实战 |

(End of file. Total 1045 lines.)

---

## [Assistant] 2026-04-28T07:11:52.480Z
现在我对 Orbit 的全貌掌握完整了。最后再扫一眼 2 个关键的现状文件（Area/Vision 现状 + KB 现在怎么用），然后给出完整方案。

### Tool Calls:
- **todo_write**({"merge":true,"todos":[{"id":"2","status":"completed","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"},{"id":"3","status":"in_progress","content":"把 Karpathy LLM Wiki 模式和 Orbit 现状/愿景对位，找契合点与冲突点"}],"toolExplanation":"更新进度"})

---

## [Tool] 2026-04-28T07:11:52.487Z
{"todos":[{"id":"1","status":"completed","content":"通读 Orbit 愿景/架构/开放问题的一手文档"},{"id":"2","status":"completed","content":"摸清现有子系统全貌（capture/inbox/resource/distill/kb/note/timeline）"},{"id":"3","status":"in_progress","content":"把 Karpathy LLM Wiki 模式和 Orbit 现状/愿景对位，找契合点与冲突点"},{"id":"4","status":"pending","content":"产出带观点的方案建议 + 待拍板问题"}],"message":"Merged 2 todos with existing list"}

---

## [Assistant] 2026-04-28T07:13:51.862Z
我有足够信息了，不需要再读。开始产出方案。

---

# 核心判断：你发的 Karpathy/LLM Wiki 模式，**Orbit 已经长出了 80% 的骨架，但长错了方向**

在回答你的问题之前，我必须先指出一个**令人意外的发现**：你读完 Phase 2 的文档会发现，**Orbit 的现状离 Karpathy 的 LLM Wiki 模式只有一步之遥**——甚至**比 Karpathy 的 idea 更完整**。但有一个关键的**哲学错位**让这 80% 的骨架无法串联成 LLM Wiki 的形态。下面是对位：

| Karpathy LLM Wiki | Orbit 已经有的 | 错位 |
|---|---|---|
| `raw/` 原始素材，**immutable** | `feeds/` + `library/` + `knowledge-base/` | ✅ 几乎完全对应 |
| `wiki/` LLM 维护的 markdown 知识库 | `notes/` + `resources/` + `distilled/` | ❌ **Orbit 把这一层定义为"用户产出"**（"铁律：Note 是用户产出"）——**LLM 不是 owner** |
| `CLAUDE.md` 维护工作流 schema | `AGENT.md` + skill 文件 | ✅ 已有 |
| 增量"编译"：新 source → LLM 更新多份 wiki 页面 | Phase 2 文档里规划的"suggestFromNotes → 立 Resource"是**手动触发一次性**的 | ❌ 不是"每次新素材自动增量扩展" |
| `index.md` + `log.md`（LLM 自维护） | 无 | ❌ 彻底没有 |
| LLM 跨 wiki 页面做 Q&A | Ask-Anywhere 可以调 CLI 读文件，但没有**"wiki 视角"**的索引 | ⚠️ 能力在，缺组织 |
| Lint: 健康检查/矛盾识别/孤立页 | 无 | ❌ 没有 |
| 一切 compounding，**时间复利** | Resource 文档里第一句就是"时间复利的物化" | ✅ **哲学完全一致** |

---

## 所以真正的问题不是"加一层 LLM 摘要层"

你之前说的"语义化很差"、"机械内容"、"timeline 没意义"、"未来内容会非常多"——**这些不是 5 个独立问题**，这是**同一个根因的 5 种症状**：

> **Orbit 积累了大量结构化数据（event / note / library / resource / conversation / feed），但从来没有一个子系统的职责是"把这些数据编译成 LLM 和人都能快速消费的、持续演化的语义层"。**

你原本提的"LLM Gateway + Enrichment"是想补救这件事。但你转发的这两篇文章让你意识到：**这不该只是 Timeline 的补丁，而应该是 Orbit 升级为 LLM Wiki 的核心一跳**。

我完全同意这个升格。下面是我的设计。

---

# 提议：把 Orbit 从 "BASB 执行层" 演进为 "BASB 执行层 + 活的知识图谱"

## 核心架构：三层重新定义

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Layer 1 — RAW (immutable sources of truth)                          │
│    ├── feeds/           外部订阅流水                                  │
│    ├── library/         主动收藏的素材（文章/PDF/视频）               │
│    ├── knowledge-base/  存量知识导入                                  │
│    ├── conversations/   每次对话的完整 turn 记录                      │
│    ├── .orbit/events/   TraceableEvent 事件流                         │
│    └── notes/*, tasks/*, projects/*  **用户直接编辑的产出**           │
│                                                                      │
│  ───────────────── 素材无变更则本层不动 ─────────────────              │
│                                                                      │
│  Layer 2 — SYNTHESIS (LLM-maintained, append + update)  ✨ 新子系统   │
│    .orbit/synthesis/                                                 │
│    ├── index.md                wiki 总入口，LLM 维护的 catalog        │
│    ├── log.md                  "编译"日志，chronological              │
│    ├── entities/               人物/概念/工具等实体页                 │
│    │   └── {entity}.md                                               │
│    ├── concepts/               提炼出的概念页                          │
│    │   └── {concept}.md                                              │
│    ├── views/                  "视图"：timeline/topic/period/...      │
│    │   ├── timeline/{date}.md  当日语义化 timeline（替换现硬编码）    │
│    │   ├── weekly/{iso}.md                                           │
│    │   └── topic/{slug}.md     跨素材的主题视图                       │
│    ├── summaries/              各 primitive 的摘要（替换 Enrichment） │
│    │   ├── event/{id}.json     event 摘要（驱动 timeline）            │
│    │   ├── conversation/{id}.json  对话摘要/标题                      │
│    │   └── note/{id}.json      note 摘要/标签                         │
│    └── health/                 lint 报告、矛盾列表、孤立页列表        │
│                                                                      │
│  ──────────────── 新素材/编辑触发 LLM 重编译 ────────────────          │
│                                                                      │
│  Layer 3 — EXPRESSION (user-facing views, agent-queryable)           │
│    UI: Timeline / Notes / Resource / Ask-Anywhere 全部消费 Layer 2   │
│    CLI: orbit synth query / orbit synth health / ...                 │
│    Agent: 读 Layer 2 当作"已编译过的知识索引"                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 关键澄清：这不是"LLM Wiki 替换 Obsidian"，而是"Layer 2 是 LLM 负责维护的 wiki 版本的自己"

和现有 Orbit 的相处方式：

- **`notes/`** 仍然是用户产出（保持原 Phase 2 铁律），这是 "Output"。用户可以不看 synthesis 层、只活在 notes 层，完全不违和。
- **`.orbit/synthesis/`** 是 LLM 的地盘，**默认不展示给 Obsidian 用户**（在 `.orbit/` 下符合现有 "系统目录" 约定），但在 Orbit UI 内是一等公民。
- 用户对 synthesis 的修改会被 LLM **记住并尊重**（在 log.md 里记录 "user overrode X on ..."）但 LLM 仍然拥有改回的权限——用户的修改是"signal"而非"lock"。这是 Karpathy 那篇的核心：**bookkeeping 归 LLM，curation 归人**。

## 这个设计怎么"一次性解决"你提的所有症状

| 症状 | 解法 |
|---|---|
| Timeline "conversation started" 没内容 | Timeline 不再直接渲染 event，而是渲染 `synthesis/views/timeline/{date}.md`；这个文件是 LLM 从 event + 对应 raw data 编译出来的 |
| 对话标题是 "Ask Anywhere" | `synthesis/summaries/conversation/{id}.json.title` 由 LLM 维护，两三轮后自动更新，UI 优先读它 |
| Feed 文章标题堆砌、信号密度低 | 新 feed 进来 → LLM 在 synthesis 里写 feed item 的摘要和"和现有 interests 的匹配度"→ Feed UI 按这个排序 |
| Note 没自动打标签 | `synthesis/summaries/note/{id}` 里带 tags / entities / linked_concepts |
| "未来内容非常多，怎么查询" | `synthesis/index.md` + `synthesis/entities/*.md` 天然是个索引层，Agent 和 Ask-Anywhere 第一步都读 index；大规模时再加 qmd 或向量 |
| Resource 只是"目录框架" | `resources/{slug}/index.md` 的内容由 LLM 从 synthesis 编译而来：相关 notes / canonical library / 时间线一把汇总 |
| Daily Summary 模板拼接没灵魂 | Daily Summary 不再是模板，是 `synthesis/views/timeline/{date}.md` 的一部分，天然有上下文关联 |
| Welcome Analysis 只跑一次 | Welcome Analysis 就是 "initial synthesis"；以后每次新 source 增量更新同一批 synthesis 页 |
| Distill 只在项目归档时触发 | Distill 变成 synthesis 的一个特殊路径（project → entity → concept 的链路） |

---

## LLM Gateway 在这个新框架下的位置

你之前想的 "Provider + PromptKit + Cache" 仍然 100% 保留且必要，但它是**这个知识图谱的发动机**，不是"一个通用能力"：

```
                                    Synthesis Engine（新）
                                            │
                              调用           │         写入
                                            ▼
                                    LLM Gateway（你要的）
                                   - Anthropic SDK
                                   - DeepSeek/MiniMax endpoints
                                   - PromptKit templates
                                   - Cache / Budget
                                            │
                                            ▼
                                      DeepSeek / MiniMax

另外直接消费者：
  - Conversation 标题生成
  - Note tag 建议
  - Ask-Anywhere 里临时的"一次性调用"
```

LLM Gateway 是底层能力，Synthesis Engine 是第一个也是最重的 user。两者都是 well-defined 的模块，但**Synthesis Engine 才是这次升级的灵魂**。

---

## "增量编译"的触发机制（回应你对"如何处理海量内容"的担忧）

Karpathy 文章说一条 source 可能触及 wiki 里 10-15 页，这里我具体化到 Orbit：

```
事件发生 → Synthesis Engine 接收 → 分析影响面 → 产出一批 compilation job
──────────────────────────────────────────────────────────────────
feed.item.saved_to_library
   → job 1: update summaries/library/{id}.json
   → job 2: update entities/{author}.md（如果提到新人物）
   → job 3: update concepts/{tag}.md（如果匹配已有 concept）
   → job 4: update views/timeline/{date}.md 追加此事件

conversation.ended (meaningful)
   → job 1: update summaries/conversation/{id}.json（title + summary）
   → job 2: update views/timeline/{date}.md
   → job 3: update entities/* 如果对话里提到实体
   → job 4: possibly update index.md（如果诞生了新 entity/concept）

note.created
   → job 1: update summaries/note/{id}.json
   → job 2: update entities/concepts（提到的实体）
   → job 3: update views/timeline/{date}.md
   → job 4: possibly update resources/{slug}/index.md（如果归属 resource）

user manually edits notes/xxx.md
   → ... 同上，加一个 "user edit noted" 痕迹到 log.md
```

**关键实现点**：

- **Job queue 是 compounding 的核心**：用 `.orbit/synthesis/jobs.ndjson` 持久化，异步消费，失败重试。Layer 2 的质量不阻塞 Layer 1 的写入。
- **每个 job 都是幂等 + 局部**：一个 job 最多写一两个文件，冲突时后写赢 + 记 log。
- **成本可控**：每个 job 用最小模型（Haiku / DeepSeek Chat）；只有"高影响"job（如生成 entity 页）才用大模型。都走 LLM Gateway 的 PromptKit templates 里声明的 `preferredModel`。
- **回填策略**：用户手动 `orbit synth rebuild --scope <x>` 可以强制重跑；启动时扫 `raw` 层的 mtime，发现 synthesis 过期的会自动排入 job queue 背后跑。

---

## 为什么这个设计和 Orbit 现有哲学对齐（而不是打架）

我特意核对了 Orbit 每条核心哲学：

| Orbit 原则 | 新设计的兼容性 |
|---|---|
| **本地优先 / plain Markdown** | ✅ synthesis 全是 markdown，Obsidian 可读（虽然在 `.orbit/` 下，属"系统目录"但不是二进制） |
| **愿景驱动** | ✅ Vision.md 注入到 synthesis 的 system prompt，LLM 会把 vision 作为"这个 wiki 的北极星"，重要性判断围绕 vision 收敛 |
| **人机对等（CLI 暴露）** | ✅ 新增 `orbit synth *` 命令集（search/query/health/rebuild）；agent 可以和人用同一套接口读同一份 synthesis |
| **Agent 参与真实执行** | ✅ Synthesis compilation 是典型的"agent 做 bookkeeping"场景；人审只在"LLM 修改 user 手写过的 notes" 时触发 |
| **人审执行，但要快** | ✅ synthesis 写的是 `.orbit/synthesis/`，不碰 `notes/`，无需审批；只在影响 notes/ 时走 propose-approve |
| **不做实时协作** | ✅ synthesis 是单用户 / 单 vault 的 |
| **不做 AI 聊天界面封装** | ✅ synthesis 是**数据**不是聊天，Ask-Anywhere 仍然是唯一对话界面 |

## 和现有开放问题的关系

这个方向**同时吃掉/推进了** open-questions.md 里的多条：
- #2 Thinking Trail 自动化 → synthesis 天然覆盖，conversation.ended 的 compilation job 就是 Thinking Trail
- #3 Orbit 自我进化 → synthesis/health/ 就是自我进化的基建
- #6 Inbox 历史检索 → synthesis/index.md + CLI 查询直接解决
- Resource 自下而上涌现 → synthesis 里 concept 页累积到阈值自动触发 resource suggestion
- Welcome Analysis → 从"一次性"升级为"持续增量编译的 day 1 启动"

这不是"额外做一件事"，这是**把原本散落在 4-5 个未来子系统里的能力合并为一个**。

---

## 范围与分期（这次讨论必须拍板的核心）

我不再用 "🅰️🅱️🅲️" 三选一，因为这次**方向是二选一**：

### Path A：克制版 —— 做一个 Synthesis Engine MVP（我强烈推荐）

**本期范围**：
1. LLM Gateway（provider=Anthropic SDK / DeepSeek / MiniMax；PromptKit；Memory+Vault cache；Settings UI）
2. Synthesis Engine 核心：job queue + 3 种编译器（`summary.event`, `summary.conversation`, `view.timeline.daily`）
3. 替换 Timeline 的渲染：从 event projection 切到读 `synthesis/views/timeline/{date}.md`
4. Conversation 标题自动生成（`summary.conversation`）
5. 写 ADR：LLM Gateway 是 ADR-017；**Synthesis Engine 必须单独开 ADR-018（这是 v3 级别的新方向，不是 v2 的补丁）**
6. 暂不做：entities/concepts/views/topic/health/index.md（留到下一期）

**时间估算**：10-14 天 AI 实施

**取舍**：
- 用户能**立刻**感受到"timeline 有意义了、对话有标题了、摘要有语义了"
- Synthesis 的 wiki 形态（index + entity + concept）留到看到 MVP 跑顺再展开
- 避免一次性摊子太大

### Path B：完全版 —— 一次性实现完整 LLM Wiki 升格

**本期范围**：Path A 的 6 点 + entities/concepts/views/topic/health/index.md 全做 + 触发 Welcome Analysis 重做。

**时间估算**：25-35 天

**取舍**：架构一气呵成，但第一次就要做对 schema，风险高；且在用户实际数据量不够大（比如 <200 notes）时 entity/concept 页反而显得空洞。

---

## 我必须问你拍板的事

**Q1（方向）**：Path A vs Path B？  
我的强推荐：**Path A**。理由：
- 你刚做完 Ask-Anywhere UX，现在应该是"端到端验证"而不是"地基再翻一层"
- Path A 已经足够让你感受到质变
- entities/concepts 在 notes 少时价值未兑现，先让数据长一会儿

**Q2（synthesis 所有权）**：  
LLM 对 `notes/` 直接修改，是否需要走 propose-approve（和 task propose 对齐），还是默认允许？
- 🅰️ **全部 propose-approve**（安全但慢）
- 🅱️ **只读 notes，synthesis 全写在 `.orbit/synthesis/`**（我推荐）——LLM 对 notes 的"建议"以"未采纳 suggestion"形式放在 `synthesis/suggestions/` 里，用户主动采纳才写 notes
- 🅲️ **允许 LLM 写 notes，但 commit 标记 `llm-maintained`，git 可审计**

**Q3（synthesis 层更新策略）**：  
- 🅰️ **Live 增量**：事件触发立刻入队 → 后台异步处理（秒级延迟）
- 🅱️ **定时批处理**：每 15 分钟一次（简单但延迟）
- 🅲️ **混合**：高价值事件（conversation.ended / note.created）live；低价值事件（library.item.added）批处理

我推荐 🅲️。

**Q4（你之前已选的东西要不要重新确认）**：以下继续有效吗？
- Provider：DeepSeek + MiniMax（Anthropic SDK 协议）✅
- Template：内置 + vault overlay ✅
- Cache：Memory + Vault ✅
- 命名：LLM Gateway（内部）+ 场景文案具体化；**Synthesis Engine** 作为姐妹子系统正式命名

**Q5（格式哲学）**：`.orbit/synthesis/` 是否允许暴露给 Obsidian？
- 🅰️ 藏起来（归为系统目录，用户用 Orbit 才看得到）
- 🅱️ 暴露（Obsidian 里也能 graph view 看 synthesis，但可能让用户困惑）
- 🅲️ 藏起来 + 一键"导出为 vault 内 `synthesis/` 目录"（随时可选择暴露）

我推荐 🅲️——默认藏，但不锁。

---

你回完这 5 个，我会：

1. `docs/thinking-trail/2026-04-28-synthesis-engine/` 初始化 session + 记录这次完整对话（从一开始 LLM Gateway 讨论到这里的升格）
2. `docs/decisions/ADR-017-llm-gateway.md`
3. `docs/decisions/ADR-018-synthesis-engine-as-living-wiki.md`（**这是 v3 级别的架构决策**）
4. `docs/plans/2026-04-28-llm-gateway-foundation.md`
5. `docs/plans/2026-04-28-synthesis-engine-mvp.md`
6. 更新 ROADMAP（新建 Phase 5 章节）+ CHANGELOG
7. 更新 open-questions.md：把被吸收的条目标注 "superseded by synthesis-engine"

---
