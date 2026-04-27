# Conversation History Archive

- **Session**: bf5891dd-d541-4e41-a43c-68a06b30bba8
- **Exported at**: 2026-04-27T08:45:15.994Z
- **Messages**: 60 (2026-04-27T03:28:05.537Z ~ 2026-04-27T04:21:59.947Z)
- **Rounds**: 4 user turns

---

## [User] 2026-04-27T03:28:05.537Z
[使用Skills: project-brainstorm] 和我讨论/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit 下一阶段的需求，先读存量的文档，了解项目全貌，我想做应用内chat的统一规划

---

## [Assistant] 2026-04-27T03:28:16.940Z
我先加载 `project-brainstorm` 技能，然后读取你的 orbit 项目文档。

### Tool Calls:
- **use_skill**({"command":"project-brainstorm","toolExplanation":"加载项目头脑风暴技能"})
- **_set_read_intent_dirs**({"dirs":["/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit"],"toolExplanation":"授权读取 orbit 项目目录"})

---

## [Tool] 2026-04-27T03:28:17.222Z
{"action":"executed","skillName":"project-brainstorm","location":"user","content":"---\nname: project-brainstorm\ncn_name: 项目脑暴伙伴\ndescription: >-\n  Long-lived project thinking partner for the full project lifecycle. Five modes —\n  (1) Bootstrap, brainstorm new project from scratch;\n  (2) Onboard, reverse-engineer existing codebase into docs;\n  (3) Evolve, iterate with new features or pivots;\n  (4) Review, audit docs for gaps;\n  (5) Reference, deep-analyze another project/product to find borrowable patterns.\n  Reference mode supports local code paths, GitHub URLs, product names (web search),\n  and doc/RFC files. Analyzes product design, tech architecture, core abstractions,\n  trade-offs, anti-patterns, and evolution history, then outputs opinionated\n  recommendations with borrowing difficulty. Can also be invoked inline during\n  other modes. Trigger phrases include 从零开始做项目, 帮我规划项目, 梳理 XX 项目,\n  给 XX 加功能, review 文档, 参考/对比 XX 项目, XX 项目这块怎么做的,\n  借鉴 Linear/Things, analyze this codebase for reference.\n---\n\n**📁 SKILL DIRECTORY PATH**\n\n`/Users/ryanbzhou/Library/Application Support/Box/engine/skills/user/project-brainstorm`\n\nAll relative file paths mentioned in this skill are relative to the above directory.\n\n**📂 DIRECTORY CONFIGURATION**\n\n**Working Directory**: `/Users/ryanbzhou/Developer/vibe-coding/boxai`\n- This is the user's project root directory\n- Final deliverables should be saved to `/Users/ryanbzhou/Developer/vibe-coding/boxai/output/bf5891dd-d541-4e41-a43c-68a06b30bba8`\n\n**Session Temp Directory**: `/Users/ryanbzhou/Developer/vibe-coding/boxai/.session_tmps/bf5891dd-d541-4e41-a43c-68a06b30bba8`\n- This is a dedicated temp directory for this session\n\n**⚠️ CRITICAL FILE OPERATION RULES**:\n1. All intermediate/temporary files (HTML, JS scripts, images, thumbnails, cache, etc.) MUST be written to the Session Temp Directory\n2. Do NOT create \"workspace/\", \"temp/\", or other directories under Working Directory for intermediate files\n3. Final deliverables (e.g., output.pptx, result.pdf) should be saved to `/Users/ryanbzhou/Developer/vibe-coding/boxai/output/bf5891dd-d541-4e41-a43c-68a06b30bba8` or user-specified location\n\n---\n\n# 项目脑暴伙伴 (Project Brainstorm)\n\n一个陪你把项目想清楚、写下来、持续迭代的长周期思考伙伴。不是一次性生成文档，而是通过**结构化多轮对话**把模糊想法磨成可执行蓝图，并在项目演进中持续对话、持续沉淀。\n\n## 核心理念\n\n好的项目文档不是写出来的，是**问出来的**。用户脑子里有大量隐性认知没表达出来，你的工作是通过有节奏的追问把它挖出来并结构化。\n\n三个原则：\n\n1. **checklist 驱动完整性** — 每个阶段有明确维度要覆盖，不要凭感觉结束\n2. **主动评估 + 用户拍板** — 你负责基于 checklist 评估并汇报剩余疑点，用户最终决定是否收尾\n3. **文档随对话增长** — 每轮对话后增量更新文档，不要憋到最后一次性生成\n\n## 五种模式\n\n这个 skill 支持五种工作模式。**启动时必须先判定模式**，再走对应流程。\n\n| 模式 | 何时使用 | 详细流程 |\n|------|----------|----------|\n| **Bootstrap** | 全新项目，零起点 | `references/phases.md` |\n| **Onboard** | 已有代码/项目但无规范文档，需要考古+对齐 | `references/onboard-workflow.md` |\n| **Evolve** | 已有标准文档，要加功能/调方向/深化某模块 | 见下文\"Evolve 模式\" |\n| **Review** | 已有标准文档，想体检找断点 | 见下文\"Review 模式\" |\n| **Reference** | 分析另一个项目/产品，找可借鉴的设计 | `references/reference-workflow.md` |\n\n模式判定规则在 `references/modes.md`，启动时必读。\n\n**Reference 模式特殊性**：既可作为独立模式（系统性对比分析），也可在 Bootstrap/Evolve/Review 中**灰度调用**（聊到某模块时临时参考另一个项目的做法）。\n\n## 启动流程（每次对话第一步）\n\n### Step 1：判定模式\n\n读取 `references/modes.md`，根据用户消息和目录状态判定模式：\n\n- 用户提到\"参考/对比/借鉴 XX 项目\"或给出参照项目路径/URL/产品名 → **Reference**\n- 用户指向代码路径 / GitHub URL / 现有项目文件夹（且意图是梳理该项目本身） → **Onboard**\n- 目标项目文件夹不存在 → **Bootstrap**\n- 目标项目文件夹存在且含 `overview.md` + `.session.json` → 根据用户意图选 **Evolve** 或 **Review**\n- 目标项目文件夹存在但无 `overview.md` → **Onboard**\n\n### Step 2：确认项目名与工作目录\n\n从 `<user_info>` 读取 Output Directory（如 `/Users/xxx/output/SESSION_ID`）。\n\n项目工作目录统一为：`{OutputDir}/{project-name}/`\n\n**项目名规则**：kebab-case 英文。从用户描述中智能提取，不让用户手动起名。例如用户说\"AI native 个人工作台\"→ 提议 `ai-native-workspace`，给用户一次修改机会。\n\n### Step 3：加载/初始化 session\n\n`{project-dir}/.session.json` 维护对话状态：\n\n```json\n{\n  \"project_name\": \"ai-native-workspace\",\n  \"mode\": \"bootstrap\",\n  \"current_phase\": \"vision\",\n  \"phases_covered\": [],\n  \"checklist_status\": {},\n  \"pending_questions\": [],\n  \"features_identified\": [],\n  \"features_drafted\": [],\n  \"last_updated\": \"2026-04-25T10:00:00Z\"\n}\n```\n\n- 不存在 → 初始化\n- 存在 → 读取并向用户确认：\"上次我们聊到 {current_phase}，继续吗？还是切换话题？\"\n\n### Step 4：根据模式进入对应流程\n\n---\n\n## Bootstrap 模式 — 从零脑暴\n\n完整流程详见 `references/phases.md`。核心是**结构化分阶段 + 阶段内苏格拉底式深挖**：\n\n1. **愿景与动机**（为什么做这个、解决什么问题、你个人为什么在乎）\n2. **用户与场景**（谁用、典型场景、不服务谁）\n3. **核心价值主张与差异化**（跟现有方案比凭什么选你）\n4. **核心用户流程**（端到端走一遍，不是功能清单）\n5. **模块拆分**（从核心流程中识别出独立模块/功能）\n6. **逐模块深入**（每个模块一份 `features/{name}.md`，含产品设计 + 技术架构）\n7. **跨模块关切**（数据模型、权限、状态管理、可扩展性等）\n8. **MVP 边界与 roadmap**（明确砍什么、留什么）\n9. **风险与开放问题**（沉淀到 `open-questions.md`）\n\n每阶段结束前，基于 `references/checklists.md` 的该阶段 checklist 自评：\n- 全部覆盖 → 汇报\"本阶段 checklist 全部覆盖，建议进入下一阶段，你觉得呢？\"\n- 有未覆盖项 → 汇报\"还剩 X 个点没聊透：A、B、C，要继续还是先跳过标记 open question？\"\n\n**关键纪律**：用户说\"就这样吧\"不等于真的想好了。如果 checklist 明显未覆盖，要**明确指出**剩余疑点再让用户拍板。用户说\"先跳过\"是可以的，但必须写入 `open-questions.md`，不能假装没这回事。\n\n---\n\n## Onboard 模式 — 已有项目接入\n\n详见 `references/onboard-workflow.md`。核心是**考古 → 草稿 → 对齐 → 固化**：\n\n1. **考古分析**（扫代码结构、README、依赖、commit history）\n2. **推断草稿**（写到 `.onboard-draft/`，每份文档顶部标注\"⚠️ AI 推断，待确认\"）\n3. **逐份对齐对话**（带具体问题过每份草稿，发现方向偏差时明确指出）\n4. **固化收编**（对齐后转正为标准文档，删除 `.onboard-draft/`，切到 Evolve 模式）\n\n---\n\n## Evolve 模式 — 项目演进\n\n启动时先问用户本次想聊什么：\n\n- **加新功能** → 识别受影响模块，走小型 Bootstrap 流程只针对这个功能\n- **调整方向** → 讨论影响范围，更新 overview 相关章节，写 ADR\n- **深化某模块** → 针对该 feature 文档走苏格拉底式深挖\n- **技术选型重选** → 对比新旧方案 trade-off，写 ADR，更新技术架构章节\n\n**每次 Evolve 会话必须：**\n1. 识别受影响的文档（可能多份）\n2. 明确变更前后对比\n3. 追加一条 `changelog.md` 记录\n4. 重大变更（架构/方向/核心技术栈）追加一份 `decisions/ADR-NNN-*.md`\n\nADR 模板见 `references/doc-templates.md`。\n\n---\n\n## Review 模式 — 文档体检\n\n1. 通读所有已有文档\n2. 基于 `references/checklists.md` 的完整性 checklist 扫一遍\n3. 输出**诊断报告**：\n   - 缺失维度（比如 feature X 只有产品设计没写技术架构）\n   - 不一致（overview 说 A，features/xxx.md 说 B）\n   - 过时嫌疑（某段落跟最新 ADR 冲突）\n   - 过度含糊（\"支持高并发\"这种没量化的描述）\n4. 和用户逐项讨论要怎么处理，修复完更新文档\n\n---\n\n## Reference 模式 — 参照项目对比分析\n\n详见 `references/reference-workflow.md`。核心是**深度分析另一个项目，找到可借鉴的设计并给出带观点的推荐**。\n\n### 支持的输入类型\n\n| 输入类型 | 示例 | 处理方式 |\n|----------|------|----------|\n| 本地代码路径 | `/path/to/project` | 直接扫描分析 |\n| GitHub URL | `https://github.com/org/repo` | clone 到 session temp 后分析 |\n| 产品名/网站 | \"Linear\"、\"Things\"、\"Superhuman\" | 联网搜索 + 官网/文档分析（无源码时） |\n| 文档/RFC 路径 | `/path/to/rfc.md` | 直接阅读并提取设计思想 |\n\n### 分析维度（六维深挖）\n\n1. **产品设计思路** — 交互模式、用户流程、状态模型\n2. **技术架构** — 技术栈、数据模型、模块拆分、通信机制\n3. **核心抽象** — 有什么独特的概念或设计模式值得学习\n4. **权衡识别** — 他们为什么选 A 不选 B，付出了什么代价\n5. **反面素材** — 什么地方做得不好，我们避免踩坑\n6. **演进线索** — Roadmap / commit history 看他们的发展路径\n\n### 输出产物\n\n- `references/{ref-project-name}.md` — 完整分析报告\n- 每个借鉴点标注推荐级别：**🟢 强烈建议借鉴** / **🟡 可参考** / **🔴 不适合你的项目**\n- 给出搬过来的具体修改建议\n\n### 两种调用方式\n\n**独立模式**：用户明确说\"帮我分析/参考/对比 XX 项目\"\n- 进入完整 Reference 流程\n- 产出完整的 `references/{name}.md`\n\n**灰度调用**：在 Bootstrap/Evolve/Review 中临时触发\n- 用户说\"XX 项目这块怎么做的？参考一下\"\n- 只针对当前讨论的模块做定向分析\n- 结果直接融入当前对话，不单独写 reference 文档\n- 重要借鉴点记入当前 feature 文档的\"参照来源\"章节\n\n---\n\n## 主动行为（跨所有模式）\n\n详见 `references/proactive-patterns.md`。核心触发时机：\n\n- **挑战想法**：用户描述含糊 / 逻辑有漏洞 / 忽略明显边界 → 用具体反例追问\n- **引用参照**：用户描述的功能有成熟参照物 → 主动提及并说明借鉴/差异点\n- **技术 trade-off**：用户提到技术需求 → 给 2-3 个方案对比，不只推荐一个\n- **范围蔓延预警**：用户在 MVP 阶段加\"而且还要...\" → 提醒这会让工期翻倍，建议划入 v2\n- **用户故事转化**：用户给出抽象描述 → 转成具体场景走查\"假设一个新用户周一早上打开应用...\"\n\n**不要等用户问才做这些**。用户付你对话费不是让你记录，是让你贡献思考密度。\n\n## 输出文档结构\n\n```\n{OutputDir}/{project-name}/\n├── overview.md           # 蓝图总览（愿景/用户/核心流程/模块列表/MVP 边界）\n├── features/\n│   ├── {feature-1}.md    # 每个功能一份，含「产品设计」+「技术架构」两部分\n│   └── {feature-2}.md\n├── references/           # 参照项目分析（Reference 模式产出）\n│   └── {ref-project}.md  # 每个参照项目一份完整分析\n├── decisions/\n│   └── ADR-001-{title}.md  # 架构/产品决策记录，按编号递增\n├── open-questions.md     # 悬而未决的问题清单\n├── changelog.md          # 项目演进历史（每次 Evolve 追加）\n├── .session.json         # 会话状态（隐藏文件，不给用户看）\n└── .onboard-draft/       # 仅 Onboard 模式临时用，确认后删除\n```\n\n所有文档模板见 `references/doc-templates.md`。\n\n## 收尾判定（Checklist + 主动汇报）\n\n每个阶段/会话结束前，必须做这件事：\n\n1. 基于 `references/checklists.md` 对应阶段 checklist 自评\n2. 明确汇报：\"**已覆盖**：X、Y、Z。**未覆盖/存疑**：A、B。**建议**：继续聊 A，或先跳过标记 open question。\"\n3. **等用户拍板**，不自己决定结束\n\n**严禁的结束方式**：\n- ❌ 用户说\"差不多了\"你就停，不汇报 checklist 状态\n- ❌ 自己觉得聊够了就生成最终文档不征求意见\n- ❌ 无限追问同一个点不推进（用户说跳过就跳过，记到 open-questions）\n\n## 文档写入纪律\n\n- **每轮对话后增量更新相关文档**，不要憋到最后\n- 每次写入前先读当前版本，避免覆盖\n- 对关键段落保留修改历史的语义（通过 changelog + ADR，不是在文档里堆删除线）\n- 用户明确拍板的内容才进正式文档，未定的进 `open-questions.md`\n\n## 参考文件索引（按需加载）\n\n- `references/modes.md` — **启动时必读**，模式判定与切换逻辑\n- `references/phases.md` — Bootstrap 九阶段详细流程与每阶段提问模板\n- `references/onboard-workflow.md` — Onboard 模式完整工作流\n- `references/reference-workflow.md` — Reference 模式完整工作流（深度分析 + 借鉴推荐）\n- `references/checklists.md` — 各阶段/各维度完整性 checklist\n- `references/doc-templates.md` — overview / feature / ADR / changelog / reference 模板\n- `references/proactive-patterns.md` — 主动挑战/引用/预警的触发时机与话术模板\n\n不要一次性全读，按当前所处模式和阶段加载对应文件即可。\n\n\n---\n\n## ⚠️ Known Issues & Solutions (from past experience)\n\nThe following issues have been encountered before when using this skill. **Check these FIRST if you hit an error.**\n\n### Issue 1\n\n**Error:** 在 Review 模式分析项目实施情况时，若项目根目录不是 git 仓库（git 仓库在子目录如 orbit/ 下），会误判为'未按规范提交语义化 commit'，导致实施完整性分析错误\n\n**Solution:** 在 Review 模式开始分析前，先递归探测 git 仓库位置（检查项目根目录及常见子目录如 orbit/、src/、app/ 等）；若根目录无 git 但子目录有，应以子目录 git 为准进行 commit 历史分析，并在诊断报告中记录此路径偏差\n\n### Issue 2\n\n**Error:** 在 Reference 模式分析本地项目时，若项目目录仅包含 `.onboard-draft` 等隐藏子目录，默认的目录扫描会过滤隐藏文件，导致误判目录为空或项目无实质内容。\n\n**Solution:** 在使用 project-brainstorm 分析本地项目路径前，先执行显示隐藏目录的扫描（如 `ls -la` 或带 `show_hidden` 的 list_files），特别检查是否存在 `.onboard-draft` 目录，避免遗漏 Onboard 模式的草稿内容。\n\n### Issue 3\n\n**Error:** 在梳理已有项目时，若代码中存在“人工触发批次执行”（如 Night Shift）与“系统自动流式执行”（如 Orchestration 自动认领）两种机制并存，容易直接固化现状描述，导致文档与产品真实意图产生方向偏差。\n\n**Solution:** 在生成功能模块文档前，先询问用户关于 Agent 执行模式的核心假设（24小时自动流式执行 vs 人工调度批次），若发现代码实现与假设不符，在 overview 中明确标注“方向偏差”并记录意图态，而非直接描述现状。\n\n### Issue 4\n\n**Error:** 在 Onboard 模式中，当考古阶段发现代码走向与文档叙述存在方向偏差嫌疑（如 README 与 ROADMAP 语气不一致、功能实现与产品定位不符）时，直接基于代码现状生成推断草稿，可能导致草稿包含用户实际上已抛弃的功能方向或错误的产品定位。\n\n**Solution:** 在生成推断草稿前，如果发现代码走向与文档叙述存在方向偏差嫌疑，必须先按照方向偏差处理模式与用户确认真实产品方向，得到明确反馈后再基于确认后的方向生成草稿，避免固化错误的方向假设。\n","skillDir":"/Users/ryanbzhou/Library/Application Support/Box/engine/skills/user/project-brainstorm","message":"Loaded skill: project-brainstorm"}

---

## [Tool] 2026-04-27T03:28:17.223Z
Read intent directories registered.

---

## [Assistant] 2026-04-27T03:28:36.395Z
读取技能关键参考文件，同时扫描 orbit 项目目录结构。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Library/Application Support/Box/engine/skills/user/project-brainstorm/references/modes.md","toolExplanation":"读取模式判定参考"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit","depth":2,"offset":0,"limit":200,"toolExplanation":"扫描 orbit 项目结构"})

---

## [Tool] 2026-04-27T03:28:36.409Z
     1|# 模式判定与切换
     2|
     3|五种模式的完整判定逻辑、切换规则、启动话术。
     4|
     5|## 判定决策树
     6|
     7|每次 skill 被触发，**按此顺序**判定：
     8|
     9|```
    10|0. 用户消息中是否包含"参考/对比/借鉴 XX 项目"、"看看 XX 怎么做的"、"分析一下 XX"？
    11|   → YES: Reference 模式（独立模式，系统性对比分析）
    12|   注意：如果是在讨论中临时说"参考一下 XX 这块"，走灰度调用而非切换模式
    13|
    14|1. 用户消息中是否包含代码路径 / GitHub URL / "帮我梳理" / "接手了老项目" / "没有文档"？
    15|   → 关键判断：用户意图是"梳理这个项目本身"还是"参考这个项目给我的项目"？
    16|   → 梳理本身: Onboard 模式
    17|   → 参考借鉴: Reference 模式
    18|
    19|2. 能否从用户消息推断出一个项目名（新或已存在）？
    20|   → 推断项目名 → 检查 {OutputDir}/{project-name}/ 是否存在
    21|
    22|3. 目标文件夹不存在？
    23|   → Bootstrap 模式（全新项目）
    24|
    25|4. 目标文件夹存在，且含 overview.md + .session.json？
    26|   → 读取 .session.json，向用户确认：
    27|     - "上次我们在 {current_phase} 聊到 {last_topic}。这次是：
    28|        A. 继续上次的脑暴
    29|        B. 讨论调整/加功能（Evolve）
    30|        C. 体检文档找断点（Review）
    31|        D. 参考另一个项目看看有什么借鉴（Reference）"
    32|
    33|5. 目标文件夹存在，但缺少 overview.md 或文档不规范？
    34|   → Onboard 模式（把已有散乱文档整理成标准结构）
    35|```
    36|
    37|### Onboard vs Reference 判定技巧
    38|
    39|两者都可能涉及代码路径，区分关键：
    40|
    41|| 信号 | Onboard | Reference |
    42||------|---------|-----------|
    43|| "帮我**梳理/整理**这个项目" | ✅ | |
    44|| "帮我**参考/对比/分析**这个项目" | | ✅ |
    45|| "这是**我的**项目，没什么文档" | ✅ | |
    46|| "看看**他们/Linear/XX**怎么做的" | | ✅ |
    47|| "**接手**了一个老项目" | ✅ | |
    48|| "我想**借鉴**这个项目的设计" | | ✅ |
    49|
    50|**拿不准就问**："你是想让我帮你梳理这个项目本身，还是参考它的设计给你另一个项目用？"
    51|
    52|## 各模式启动话术
    53|
    54|### Bootstrap 启动
    55|
    56|```
    57|好的，从零开始聊一个新项目！在深入之前我想先确认几件事：
    58|
    59|1. 项目工作目录我建议放在 {OutputDir}/{project-name-suggestion}/，这个名字你改一下还是就这样？
    60|2. 你现在对这个项目的想法处于什么阶段？
    61|   A. 完全早期，只有一个模糊念头
    62|   B. 有一些想法但没系统化
    63|   C. 心里有大致蓝图，想梳理到文档
    64|3. 你能连续聊（预计 30 分钟+），还是我们会分多次慢慢聊？
    65|
    66|（选项 3 影响我如何使用 session state，多次聊我会更谨慎地存进度。）
    67|
    68|确认后我们进入第一阶段：愿景与动机。
    69|```
    70|
    71|### Onboard 启动
    72|
    73|```
    74|好的，这是一个已有项目的梳理任务。在考古之前我需要：
    75|
    76|1. 项目代码/文档位置：{path or GitHub URL}
    77|2. 你对这次梳理的预期是哪种？
    78|   A. 纯客观整理：我推断什么写什么，不评价方向
    79|   B. 整理 + 对齐意图：我写草稿，你逐份确认是不是你想要的方向
    80|   C. 整理 + 主动挑战：发现方向偏差我会明确指出并建议调整
    81|3. 这个项目你打算继续做还是只想留档？（继续做会走后续 Evolve；留档可以轻量化处理）
    82|
    83|我默认按 B 走。确认后我开始扫代码。
    84|```
    85|
    86|### Evolve 启动
    87|
    88|```
    89|好，我看到 {project-name} 已经有完整文档了。上次会话在 {current_phase}，覆盖了 {features_drafted}。
    90|这次你想聊什么？
    91|
    92|A. 加一个新功能（哪个？）
    93|B. 调整某个方向/策略
    94|C. 深化某个已有模块的细节
    95|D. 重选某块的技术方案
    96|E. 其他（请描述）
    97|
    98|告诉我后我会先定位受影响的文档，再开始讨论。每次 Evolve 都会自动在 changelog 追加记录，重大变更会写 ADR。
    99|```
   100|
   101|### Review 启动
   102|
   103|```
   104|好，来给 {project-name} 做一次文档体检。我会先通读所有文档，然后基于 checklist 扫一遍，输出一份诊断报告，再和你逐条讨论怎么修。
   105|
   106|在开始前：
   107|1. 你是希望全面体检，还是只关注某几个文档/模块？
   108|2. 有没有最近心里觉得"这块好像没写清楚/不对了"的地方？先告诉我可以重点扫。
   109|
   110|不急的话我就全面扫一遍，预计扫完会给你一份"缺失/不一致/过时/含糊"四类问题清单。
   111|```
   112|
   113|### Reference 启动（独立模式）
   114|
   115|```
   116|好，来分析一下 {ref-project} 看看有什么值得借鉴的。
   117|
   118|首先确认几个事：
   119|1. 你想重点参考哪方面？
   120|   A. 全面分析（产品 + 技术 + 抽象 + 演进）
   121|   B. 只看产品设计（交互、流程、状态）
   122|   C. 只看技术架构（选型、数据模型、通信）
   123|   D. 针对特定模块（哪个？）
   124|
   125|2. 你的项目当前到哪个阶段了？（影响我怎么给建议）
   126|   A. 还在脑暴，什么都没定
   127|   B. 有蓝图但没开始写代码
   128|   C. 已经在 build，想优化某块
   129|   D. 已经上线，想重构某块
   130|
   131|3. 参照项目的来源？
   132|   - 本地路径：{path}
   133|   - GitHub：{url}
   134|   - 产品名：{name}（无源码我会搜官网/技术博客分析）
   135|   - 文档/RFC：{path or url}
   136|
   137|默认我按 1A 全面分析走。告诉我要不要调整。
   138|```
   139|
   140|### Reference 灰度调用（在其他模式中）
   141|
   142|不切换模式，只针对当前话题做定向分析：
   143|
   144|```
   145|你说想参考 {ref-project} 的 {模块}。我来快速扫一下...
   146|
   147|[定向分析结果]
   148|
   149|和你现在讨论的 {当前模块} 对比：
   150|- 相似：{...}
   151|- 差异：{...}
   152|- 建议：{借鉴/不借鉴，理由}
   153|
   154|继续聊你的项目？还是这个分析要展开或存档？
   155|```
   156|
   157|## 模式切换
   158|
   159|一次会话中可以切换模式，但必须**显式告知用户并更新 session.json**：
   160|
   161|- Onboard → Evolve：固化完草稿后自动切
   162|- Bootstrap → Evolve：MVP 模块文档齐全后自动提议切
   163|- Evolve ↔ Review：用户明确说"先别加新的，帮我看看现有的"时切
   164|- 任何模式 → Bootstrap：不允许。如果用户想重启，建议改项目名创建新项目
   165|- **任何模式 ↔ Reference**：
   166|  - 独立 Reference：用户明确说"帮我分析 XX 项目"时切入，分析完自动切回原模式
   167|  - 灰度调用：不切换模式，在当前模式中内联处理
   168|
   169|切换话术示例：
   170|
   171|```
   172|Onboard 阶段已完成，所有文档已经对齐并转正。从下次会话开始，我们默认按 Evolve 模式走：你提调整/加功能，我负责识别受影响文档并追问到位。要继续聊点什么吗？
   173|```
   174|
   175|**Reference 模式特殊处理**：
   176|
   177|Reference 完成后自动切回之前的模式（如果有的话）：
   178|
   179|```
   180|{ref-project} 的分析已完成，借鉴建议见 references/{ref-project}.md。
   181|
   182|回到你的项目 {project-name}：
   183|- 我建议把 {借鉴点 1} 写入 features/{xxx}.md
   184|- {借鉴点 2} 先放 open-questions
   185|
   186|继续之前的 {Bootstrap/Evolve/Review} 吗？还是先落实这些借鉴？
   187|```
   188|
   189|## 判定失败时的兜底
   190|
   191|如果用户消息模糊到无法判定模式，**直接问**，不要瞎猜：
   192|
   193|```
   194|我想先确认一下这次我们是在做哪种事：
   195|
   196|A. 全新项目，从零开始脑暴（Bootstrap）
   197|B. 已有代码/项目，帮你整理成规范文档（Onboard）
   198|C. 已经有文档了，要加功能/调方向（Evolve）
   199|D. 已经有文档了，想体检找断点（Review）
   200|E. 分析另一个项目/产品，找可借鉴的设计（Reference）
   201|
   202|选一个就好。
   203|```

(End of file. Total 203 lines.)

---

## [Tool] 2026-04-27T03:28:36.410Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/
- AGENTS.md (1.6KB)
- CHANGELOG.md (27.2KB)
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
- out/main/
- out/mcp/
- out/preload/
- out/renderer/
- package-lock.json (424.1KB)
- package.json (3.2KB)
- playwright.config.ts (509B)
- pnpm-lock.yaml (205.3KB)
- postcss.config.cjs (81B)
- src/
- src/cli/
- src/main/
- src/preload/
- src/renderer/
- src/shared/
- tailwind.config.cjs (1.2KB)
- tests/
- tests/activity_concurrency.test.ts (2.5KB)
- tests/activity_emitter.test.ts (2.9KB)
- tests/activity_query.test.ts (3.1KB)
- tests/agent_cost_log.test.ts (1.5KB)
- tests/agent_hydration.test.ts (2.4KB)
- tests/agent_persona.test.ts (3.2KB)
- tests/agent_playground_scenarios.test.ts (1.9KB)
- tests/agent_runner.test.ts (13.0KB)
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
- tests/check_cache.test.ts (1.7KB)
- tests/claude_sessions.test.ts (2.4KB)
- tests/cli/
- tests/content_hash.test.ts (2.8KB)
- tests/conversation_resume.test.ts (2.3KB)
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
- tests/event_replay_store.test.ts (1.9KB)
- tests/execution_context.test.ts (3.9KB)
- tests/experience_wakeup.test.ts (4.4KB)
- tests/feed_fade_out.test.ts (1.7KB)
- tests/feed_fetcher.test.ts (2.2KB)
- tests/file_tree_navigation.test.ts (2.0KB)
- tests/files_store_project_tree.test.ts (7.4KB)
- tests/fixtures/
- tests/frontmatter.test.ts (1.7KB)
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
- tests/inbox_shell.test.ts (4.0KB)
- tests/inbox_store.test.ts (4.4KB)
- tests/install_lock.test.ts (3.6KB)
- tests/ipc.test.ts (7.9KB)
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
- tests/project_session_action.test.ts (2.1KB)
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
- tests/review_daily.test.ts (5.5KB)
- tests/review_queue.test.ts (4.2KB)
- tests/review_queue_presentation.test.ts (1.4KB)
- tests/ring_buffer.test.ts (1.6KB)
- tests/run_recorder.test.ts (1.2KB)
- tests/runtime_fallback_engine.test.ts (1.9KB)
- tests/safety_gate.test.ts (1.1KB)
- tests/schemas.test.ts (792B)
- tests/secret_scan.test.ts (1.9KB)
- tests/settings.test.ts (1.3KB)
- tests/sidebar_store.test.ts (3.2KB)
- tests/switch_runtime.test.ts (1.6KB)
- tests/task_authorization_migration.test.ts (6.5KB)
- tests/task_conversation_completion.test.ts (5.1KB)
- tests/task_conversation_inbox_lifecycle.test.ts (3.7KB)
- tests/task_conversation_store.test.ts (1.9KB)
- tests/task_conversation_tab.test.ts (4.3KB)
- tests/task_dependency_cycle.test.ts (1.9KB)
- tests/task_detail_panel.test.ts (948B)
- tests/task_details_modal.test.ts (1.1KB)
- tests/task_editor_dependency_picker.test.ts (2.0KB)
- tests/task_get_update.test.ts (4.8KB)
- tests/task_graph.test.ts (1.8KB)
- tests/task_index_folders.test.ts (4.9KB)
- tests/task_ipc_events.test.ts (2.6KB)
- tests/task_relink.test.ts (3.7KB)
- tests/task_schema_extended.test.ts (3.7KB)
- tests/task_sections.test.ts (3.3KB)
- tests/task_state_reducer.test.ts (4.3KB)
- tests/tasks.test.ts (3.2KB)
- tests/terminal_agent_detail_transcripts.test.ts (7.6KB)

... and 38 more files

---

## [Assistant] 2026-04-27T03:29:04.922Z
我看到这是一个已有完整文档的项目（有 `overview.md`、`ROADMAP.md`、`VISION.md`、`architecture.md`、`decisions/`、`features/`、`open-questions.md` 等）。你的需求"应用内 chat 的统一规划"明显是 **Evolve 模式**（在已有项目中做某个横切模块的深化/统一规划）。

我先快速梳理项目全貌。并行读取核心文档：

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/overview.md","toolExplanation":"读取项目总览"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/VISION.md","toolExplanation":"读取项目愿景"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/ROADMAP.md","toolExplanation":"读取路线图"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/architecture.md","toolExplanation":"读取架构文档"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs","depth":3,"offset":0,"limit":200,"toolExplanation":"查看 docs 完整结构"})

---

## [Tool] 2026-04-27T03:29:04.935Z
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

## [Tool] 2026-04-27T03:29:04.936Z
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

## [Tool] 2026-04-27T03:29:04.937Z
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

## [Tool] 2026-04-27T03:29:04.937Z
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

## [Tool] 2026-04-27T03:29:04.939Z
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
- decisions/ADR-014-runtime-fallback-decision-rules.md (5.1KB)
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
- thinking-trail/2026-04-26-v2-direction/README.md (3.5KB)
- thinking-trail/2026-04-26-v2-direction/conversation.md (23.7KB)
- thinking-trail/2026-04-26-v2-direction/decisions-traced.md (10.1KB)
- thinking-trail/2026-04-26-v2-direction/key-pivots.md (10.6KB)

---

## [Assistant] 2026-04-27T03:29:13.284Z
已建立全局认知。现在聚焦到你想讨论的"应用内 chat 的统一规划"——先盘一遍项目里"chat"出现的所有位置和已有的设计思路。

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-005-plan-chat-reframing.md","toolExplanation":"读取 Plan Chat ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-004-inbox-as-hub.md","toolExplanation":"读取 Inbox hub ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-25-task-conversation-ui.md","toolExplanation":"读取 task conversation UI 设计"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/open-questions.md","toolExplanation":"读取悬而未决问题"})

---

## [Tool] 2026-04-27T03:29:13.295Z
     1|---
     2|id: ADR-005
     3|title: Plan Chat 定位修正 — 通用 chat + 产物舞台
     4|status: accepted
     5|date: 2026-04-26
     6|related: ADR-004
     7|implementation: (合入 inbox-v2-architecture)
     8|---
     9|
    10|## Context
    11|
    12|v1 中 "Plan Chat" 是 Planner View 的一个组成部分：左边是和 Planner agent 的对话，右边是 React Flow 的 proposal canvas。v1 的实现把它当作 **Planner 专属的特殊组件**处理。
    13|
    14|v2 对话中发现这个定位是错的——Plan Chat 的模式其实是**"对话面板 + 产物"这个通用模式的具体实例**。类似的地方在 Orbit 里还有：
    15|
    16|- Inbox 右侧舞台（左事件列表 + 右对应组件，ADR-004）
    17|- Task Conversation Tab（左 task chat + 右 diff view）
    18|- 未来的长文档协作（左编辑对话 + 右文档）
    19|- 未来的数据探索（左查询对话 + 右可视化）
    20|
    21|把 Plan Chat 单独当作特殊物种，就会：
    22|
    23|1. 每出现一个类似模式就重新实现一次，代码重复严重
    24|2. UI 一致性差，不同场景下的"chat + 产物"交互不统一
    25|3. 错过抽象升级的机会
    26|
    27|## Decision
    28|
    29|**Plan Chat 不是独立物种，而是 `通用 chat + 产物画布` 这个抽象模式的一个实例。**
    30|
    31|Orbit 承认并抽出一套通用的 **"Stage View"** 模式：
    32|
    33|```
    34|┌────────────────┬─────────────────────────────────┐
    35|│                │                                 │
    36|│  Chat 面板     │  产物舞台 (Stage)               │
    37|│  (对话历史)    │  (可渲染任意 React 组件)        │
    38|│                │                                 │
    39|│  用户/AI 对话  │  依据对话上下文渲染：            │
    40|│                │    - Planner proposal canvas    │
    41|│                │    - Diff view                  │
    42|│                │    - Article reader             │
    43|│                │    - Note editor                │
    44|│                │    - Future: doc, viz, 3D...    │
    45|└────────────────┴─────────────────────────────────┘
    46|```
    47|
    48|"Stage View" 是 Orbit 的一个**UI 级别的通用抽象**，而不是某个 feature 的专有实现。
    49|
    50|### 具体应用
    51|
    52|- **Planner View** = Stage View（产物 = proposal canvas）
    53|- **Inbox 右侧** = Stage View（产物 = per-event renderer）
    54|- **Task Conversation Tab** = Stage View（产物 = diff view / execution log）
    55|
    56|### 不做
    57|
    58|- 不在本期重构现有 Planner 代码去 "adopt Stage View 抽象"——重构成本不成比例
    59|- **但**新增的 Inbox v2 / 未来新出现的"对话 + 产物"场景都按 Stage View 模式实现
    60|- Stage View 的共用 hook / layout / 通信契约在 Inbox 实施时顺带抽出来
    61|
    62|## Rationale
    63|
    64|**为什么承认是通用模式**：
    65|
    66|- 已经出现 3+ 个类似场景（Planner、Task Conversation、Inbox 设想）
    67|- 用户在对话中明确指出 "chat 其实就可以直接放在内容区"——用户心智里就是通用模式
    68|- 通用抽象后 UI 一致性和实施速度都显著提升
    69|
    70|**为什么不彻底重构 v1 的 Planner**：
    71|
    72|- v1 Planner 已经相对稳定，重构风险大于收益
    73|- Stage View 作为新增抽象先在 Inbox / 新 feature 里实践，等验证成熟后再回头重构 Planner
    74|
    75|## Consequences
    76|
    77|**正面**：
    78|- Inbox 的右侧实现直接受益于 "Stage View" 模式
    79|- 新增"对话 + 产物"场景的成本大幅下降
    80|- UI 一致性提升
    81|
    82|**负面 / 待处理**：
    83|- 现有 Planner 的 "Plan Chat" 暂时仍是独立实现，和 Stage View 不统一
    84|- 抽象层的具体 API（如何注册 per-event renderer、如何从 chat 触发产物切换）需要在 Inbox 实施中探索
    85|- 未来如果 Stage View 抽象方向偏了，需要回调
    86|
    87|## Implementation
    88|
    89|- 本 ADR 不产生独立的 plan 文档
    90|- 相关实施在 [`plans/2026-04-26-inbox-v2-architecture.md`](../plans/2026-04-26-inbox-v2-architecture.md) 中一并落地
    91|- 后续如果 Stage View 抽象稳定且要回头重构 Planner，会开新的 plan

(End of file. Total 91 lines.)

---

## [Tool] 2026-04-27T03:29:13.296Z
     1|---
     2|id: ADR-004
     3|title: Inbox 作为人机协作的统一枢纽
     4|status: accepted
     5|date: 2026-04-26
     6|related: ADR-005, ADR-006, ADR-010
     7|implementation: plans/2026-04-26-inbox-v2-architecture.md
     8|---
     9|
    10|## Context
    11|
    12|v1 的 Orbit 里，"待用户处理的事件"散落在多处：
    13|
    14|- Agent 合并审批在 Project Room 的某个抽屉
    15|- Daily Review 要去 Journal 页面看
    16|- Budget 超支提示是顶部 banner
    17|- Agent 遇到问题直接中断 agent run
    18|- Capture 还只是 plan，没有落地入口
    19|
    20|这导致用户必须在**多个页面间切换**才能理清"我现在需要处理什么"。更深层的问题是：
    21|
    22|- 没有统一的审批枢纽 → v2 的 Auto-runner + propose-approve 模式（见 ADR-001, ADR-006）没法落地
    23|- 没有 Capture 入口 → BASB 的 C 阶段（见 ADR-010）无处承载
    24|
    25|同时，v2 对话中用户对 Inbox 架构有了清晰构想：**左列表 + 右通用内容舞台**。右侧可以渲染 chat / diff / 阅读器 / 编辑器等任何组件，本质是"Inbox = 通用事件列表 + 通用详情舞台"。
    26|
    27|## Decision
    28|
    29|**Inbox 成为 Orbit 里"用户注意力在场时的统一入口"**，承载所有需要用户看/处理的事件。
    30|
    31|### 一级分层（按处理模式）
    32|
    33|```
    34|Inbox
    35|├── 📥 Capture     # 原材料（沉浸式处理）
    36|│   ├── 🌊 Feed     # 低信号扫描（RSS）
    37|│   ├── 📚 Library  # 高信号深度阅读
    38|│   └── ✨ Thoughts  # 自产灵感
    39|├── 💬 Messages    # 操作决策（扫描式处理）
    40|│   ├── A 审批类   # 合并 / 新任务 / proposal / 扩范围
    41|│   ├── B 求助类   # 信息不足 / 方案选择 / 执行失败
    42|│   ├── C 警示类   # 依赖连锁 / 预算告警 / agent 主动发现
    43|│   └── D 纪律类   # Daily Review / 项目待归档 / GC 报告
    44|└── 📦 Archive    # 统一归档视图（Messages + Library）
    45|```
    46|
    47|外加 **Feed History**：Feed 淡出的内容独立归档区，不进 Archive 视图，永久保留作为 agent 检索池。
    48|
    49|### 右侧通用内容舞台
    50|
    51|- 点击左侧条目，右侧渲染对应组件
    52|- A1（合并审批）→ DiffView + action bar
    53|- A2/A3（proposal）→ Proposal 预览 + 授权链路
    54|- B 类（求助）→ TaskConversationTab（chat 原地）
    55|- C3（agent 主动汇报）→ AgentInsightCard
    56|- D1（Daily Review）→ JournalView
    57|- Library → ArticleReader + 笔记工具
    58|- Thoughts → NoteEditor
    59|
    60|### 双通道同步
    61|
    62|审批类事件同一 `proposal_id` 在 chat 原地卡片和 Inbox 条目之间同步。任一处处理 → 两处一起 resolved。
    63|
    64|### 未读计数分级
    65|
    66|- **左侧栏红点** 仅显示 Messages 未读数（Capture 不参与，避免催促）
    67|- **Capture tab** 仅显示 Library 未读数（Feed / Thoughts 不参与）
    68|- **Feed** 完全不计数（扫过即忘的哲学）
    69|
    70|### 状态模型
    71|
    72|- **Messages**: `pending → resolved | dismissed → archived`
    73|- **Library**: `unread → reading → read → processed | dismissed → archived`
    74|  - `reading` 是中间态，支持"读了一半"
    75|- **Feed**: 扫过即淡出到 Feed History，无状态机
    76|
    77|## Rationale
    78|
    79|**为什么不做"通知中心"**：
    80|
    81|- 通知中心的心智是"系统推给人看的"——违背 Orbit 的克制哲学
    82|- Inbox 的定位是**用户主动来看**，不是**系统强行推送**
    83|- 因此：红点克制显示、不做桌面通知、不做声音/闪灯
    84|
    85|**为什么分 Capture 和 Messages**：
    86|
    87|- 两类事件的处理节奏不同（沉浸 vs 扫描），混在一起会注意力污染
    88|- Capture 本身是 BASB 的一阶段，需要独立尊严，不是"Inbox 的附属"
    89|
    90|**为什么右侧做成"通用舞台"**：
    91|
    92|- Orbit 的多处都有"列表 + 详情"模式（Inbox、Planner、未来长文协作）
    93|- 把右侧做成可渲染任意组件的容器，让 Plan Chat、阅读器、diff view 都变成同一抽象的实例（见 ADR-005）
    94|- chat 直接放进右侧 → 用户点左侧消息，右侧就是审批所在的 chat 上下文，无需页面跳转
    95|
    96|**双通道同步而不是"只在 Inbox 处理"**：
    97|
    98|- Agent 和用户在 chat 里对话时，审批请求**原地出现**是最自然的（不需要切到 Inbox）
    99|- Inbox 作为**副本**存在，保证用户不在 chat 时不丢事件
   100|- 通过 `proposal_id` 的共享状态让两处一致，避免"在 chat 批了 Inbox 还显示未处理"
   101|
   102|## Consequences
   103|
   104|**正面**：
   105|- 用户有了单一的"待处理事件"入口
   106|- 审批、Capture、系统事件有了统一承载
   107|- 右侧舞台架构为未来扩展（更多事件类型、更多阅读/编辑组件）留足空间
   108|
   109|**负面 / 待处理**：
   110|- 需要设计一套 Inbox 事件的 schema、emitter、双通道同步机制
   111|- UI 工作量不小（left list + right stage + per-type renderer）
   112|- 现有分散在各处的审批/提醒入口需要统一迁移
   113|
   114|### 本期不做
   115|
   116|- 推送通知（桌面弹窗、声音）
   117|- 批量处理（多选批准 / 一键清空）
   118|- Inbox 历史检索
   119|
   120|## Implementation
   121|
   122|见 [`plans/2026-04-26-inbox-v2-architecture.md`](../plans/2026-04-26-inbox-v2-architecture.md)。
   123|
   124|Capture 子系统的详细落地见 ADR-010 和 [`plans/2026-04-26-capture-foundation.md`](../plans/2026-04-26-capture-foundation.md)。

(End of file. Total 124 lines.)

---

## [Tool] 2026-04-27T03:29:13.296Z
     1|---
     2|status: completed
     3|created: 2026-04-25
     4|updated: 2026-04-25
     5|---
     6|
     7|# Task Conversation UI — 详细实施方案
     8|
     9|> 日期：2026-04-25
    10|> 状态：Completed
    11|> 范围：任务详情页、对话流 UI、Conversation 数据模型、IPC 通道、Agent 执行对话记录
    12|
    13|---
    14|
    15|## 一、目标
    16|
    17|在看板点击任务卡片 → 打开任务详情页 → 包含两个 Tab：
    18|
    19|1. **Detail**：结构化 task.md 展示（现有 TaskEditor）
    20|2. **Chat**：该任务的完整对话流 + 底部输入框
    21|
    22|对话流统一承载两类交互：
    23|- **Agent 自动执行**：DispatchService 认领并执行任务时，执行过程的 events 自动写入对话流
    24|- **人工对话**：用户随时打开任务，在输入框发消息，触发 agent run，结果同样写入对话流
    25|
    26|---
    27|
    28|## 二、数据模型
    29|
    30|### 2.1 核心类型
    31|
    32|```ts
    33|// src/shared/orchestration.ts 新增
    34|
    35|/** 对话流中的一条消息 */
    36|interface ConversationTurn {
    37|  id: string;                          // nanoid
    38|  role: 'user' | 'assistant' | 'system';
    39|  content: string;                     // 主文本（可含 markdown）
    40|  segmentId?: string;                  // 关联到哪个 RunSegment
    41|  createdAt: string;                   // ISO timestamp
    42|}
    43|
    44|/** 一次 Agent 执行在对话流中的片段 */
    45|interface RunSegment {
    46|  id: string;                          // nanoid
    47|  taskId: string;                      // orbit task id
    48|  runId: string;                       // orbit runner runId
    49|  leaseId?: string;                    // 关联 TaskLease
    50|  bindingId?: string;                  // 执行者 binding
    51|  vendorSessionId?: string;            // Claude session id（为 resume 预留）
    52|  trigger: 'dispatch' | 'manual';      // 自动调度 or 人工触发
    53|  status: 'running' | 'completed' | 'failed' | 'cancelled';
    54|  summary?: string;                    // 最终摘要
    55|  startedAt: string;
    56|  endedAt?: string;
    57|}
    58|
    59|/** 任务对话（per task 1:1） */
    60|interface TaskConversation {
    61|  taskId: string;                      // orbit task id（= file path hash）
    62|  taskUid: string;                     // frontmatter uid
    63|  projectUid?: string;
    64|  segments: RunSegment[];              // 所有执行片段
    65|  turns: ConversationTurn[];           // 有序消息列表
    66|  createdAt: string;
    67|  updatedAt: string;
    68|}
    69|```
    70|
    71|### 2.2 存储位置
    72|
    73|```
    74|.orbit/orchestration/conversations/<taskUid>.json
    75|```
    76|
    77|- 不进 Git（高频变化的 runtime state）
    78|- 与 leases.json、reports.json 同级
    79|- 使用现有 `readJsonFile / writeJsonFile` 工具函数
    80|
    81|### 2.3 与现有模型的关系
    82|
    83|```
    84|TaskLease (已有)           → RunSegment.leaseId
    85|ImplementationReport (已有) → RunSegment.runId 对齐
    86|AgentEvent (已有)          → 聚合后写入 ConversationTurn.content
    87|ProjectRoleBinding (已有)  → RunSegment.bindingId
    88|```
    89|
    90|不修改现有 TaskLease / ImplementationReport 结构，Conversation 是它们的**展示层聚合**。
    91|
    92|---
    93|
    94|## 三、Main Process 逻辑
    95|
    96|### 3.1 新模块：`src/main/orchestration/conversation.ts`
    97|
    98|```ts
    99|// 核心 API
   100|
   101|/** 获取或创建任务对话 */
   102|export async function getOrCreateConversation(
   103|  vaultPath: string,
   104|  task: { id: string; uid: string; project_uid?: string }
   105|): Promise<TaskConversation>;
   106|
   107|/** 追加 turn */
   108|export async function appendTurn(
   109|  vaultPath: string,
   110|  taskUid: string,
   111|  turn: Omit<ConversationTurn, 'id' | 'createdAt'>
   112|): Promise<ConversationTurn>;
   113|
   114|/** 开始一个 RunSegment */
   115|export async function startSegment(
   116|  vaultPath: string,
   117|  taskUid: string,
   118|  segment: Omit<RunSegment, 'id' | 'startedAt'>
   119|): Promise<RunSegment>;
   120|
   121|/** 完成一个 RunSegment */
   122|export async function completeSegment(
   123|  vaultPath: string,
   124|  taskUid: string,
   125|  segmentId: string,
   126|  result: { status: RunSegment['status']; summary?: string }
   127|): Promise<void>;
   128|
   129|/** 人工发送消息并触发 agent run */
   130|export async function sendAndRun(
   131|  vaultPath: string,
   132|  task: TaskRecord,
   133|  message: string
   134|): Promise<{ turnId: string; runId: string; segmentId: string }>;
   135|```
   136|
   137|### 3.2 DispatchService 集成（自动执行）
   138|
   139|修改点集中在 `dispatch.ts` 的两个位置：
   140|
   141|#### `tryDispatchTask` — 认领成功后
   142|
   143|```ts
   144|// 现有代码之后追加：
   145|const conversation = await getOrCreateConversation(vaultPath, task);
   146|const segment = await startSegment(vaultPath, task.uid!, {
   147|  taskId: task.id,
   148|  runId: startResult.runId,
   149|  leaseId,
   150|  bindingId: binding.id,
   151|  trigger: 'dispatch',
   152|  status: 'running'
   153|});
   154|await appendTurn(vaultPath, task.uid!, {
   155|  role: 'system',
   156|  content: `🤖 ${binding.id} 认领了任务，开始执行...`,
   157|  segmentId: segment.id
   158|});
   159|```
   160|
   161|#### `handlePoolEvent` — run 完成后
   162|
   163|```ts
   164|// 现有代码之后追加：
   165|const events = snapshot?.events ?? [event.event];
   166|const assistantContent = events
   167|  .filter(e => e.kind === 'message' || e.kind === 'text')
   168|  .map(e => e.text ?? '')
   169|  .filter(Boolean)
   170|  .join('\n\n');
   171|
   172|if (assistantContent) {
   173|  await appendTurn(vaultPath, task.uid!, {
   174|    role: 'assistant',
   175|    content: assistantContent,
   176|    segmentId: segment.id  // 通过 lease.reportId 或 runId 关联
   177|  });
   178|}
   179|await completeSegment(vaultPath, task.uid!, segmentId, {
   180|  status: event.event.kind === 'done' ? 'completed' : 'failed',
   181|  summary: timeline.summary
   182|});
   183|```
   184|
   185|### 3.3 人工对话流程（`sendAndRun`）
   186|
   187|```ts
   188|export async function sendAndRun(vaultPath, task, message) {
   189|  // 1. 写入 user turn
   190|  const userTurn = await appendTurn(vaultPath, task.uid!, {
   191|    role: 'user',
   192|    content: message
   193|  });
   194|
   195|  // 2. 创建 segment
   196|  const segment = await startSegment(vaultPath, task.uid!, {
   197|    taskId: task.id,
   198|    runId: '',  // 待填
   199|    trigger: 'manual',
   200|    status: 'running'
   201|  });
   202|
   203|  // 3. 追加 system turn
   204|  await appendTurn(vaultPath, task.uid!, {
   205|    role: 'system',
   206|    content: '⏳ 正在执行...',
   207|    segmentId: segment.id
   208|  });
   209|
   210|  // 4. 调用现有 startTask，把 message 作为 instructions
   211|  const result = await startTask({
   212|    taskId: task.id,
   213|    instructions: message
   214|  });
   215|
   216|  if (result.kind !== 'ok') {
   217|    await completeSegment(vaultPath, task.uid!, segment.id, {
   218|      status: 'failed',
   219|      summary: result.message
   220|    });
   221|    await appendTurn(vaultPath, task.uid!, {
   222|      role: 'system',
   223|      content: `❌ 执行失败: ${result.message}`,
   224|      segmentId: segment.id
   225|    });
   226|    return { turnId: userTurn.id, runId: '', segmentId: segment.id };
   227|  }
   228|
   229|  // 5. 更新 segment 的 runId
   230|  // segment.runId = result.runId (持久化)
   231|
   232|  // 6. run 完成后由 handlePoolEvent → completeSegment 闭环
   233|  return { turnId: userTurn.id, runId: result.runId, segmentId: segment.id };
   234|}
   235|```
   236|
   237|### 3.4 实时事件推送
   238|
   239|**不新增 IPC channel**，复用现有 `agent:event`。
   240|
   241|Renderer 端已经通过 `useAgent` store 监听 `agent:event`，Chat tab 只需根据 `taskId` 过滤当前任务的 events，实时显示正在执行的 agent 输出。
   242|
   243|Run 完成后 reload conversation 即可获得聚合后的完整对话。
   244|
   245|---
   246|
   247|## 四、IPC 新增
   248|
   249|```ts
   250|// src/shared/ipc.ts — IPC 定义新增
   251|conversation: {
   252|  get: 'conversation:get',           // (taskId) → TaskConversation | null
   253|  send: 'conversation:send',         // (taskId, message) → { turnId, runId, segmentId }
   254|  event: 'conversation:event'        // 广播 turn 新增事件
   255|}
   256|```
   257|
   258|```ts
   259|// src/shared/ipc.ts — OrbitAPI 类型新增
   260|conversation: {
   261|  get(taskId: string): Promise<TaskConversation | null>;
   262|  send(taskId: string, message: string): Promise<{
   263|    turnId: string;
   264|    runId: string;
   265|    segmentId: string;
   266|  }>;
   267|  onEvent(cb: (ev: { taskId: string; turn: ConversationTurn }) => void): () => void;
   268|};
   269|```
   270|
   271|总共 **3 个 IPC 通道**：1 个查询、1 个写入、1 个广播。
   272|
   273|---
   274|
   275|## 五、前端 UI
   276|
   277|### 5.1 入口变更：看板卡片点击行为
   278|
   279|**当前**：点击 TaskRow → `openPath(task.filePath)` → 跳转编辑器。
   280|
   281|**改为**：点击 TaskRow → 打开 `TaskDetailsModal`（已有组件）。
   282|
   283|修改 `TaskRow.tsx` 中 `jump()` 函数：
   284|
   285|```ts
   286|// 之前
   287|async function jump() {
   288|  await openPath(task.filePath);
   289|  setView({ kind: 'editor' });
   290|}
   291|
   292|// 之后
   293|function jump() {
   294|  setTaskDetailOpen(task);  // 打开 modal，传入 task
   295|}
   296|```
   297|
   298|### 5.2 TaskDetailsModal 内部结构
   299|
   300|```
   301|┌─────────────────────────────────────────────────┐
   302|│ header: task.title + status badge + close        │
   303|├─────────────────────────────────────────────────┤
   304|│ [Detail]  [Chat]                    ← tab bar   │
   305|├─────────────────────────────────────────────────┤
   306|│                                                  │
   307|│   Detail tab:                                    │
   308|│     现有 TaskEditor 原封不动嵌入                   │
   309|│                                                  │
   310|│   Chat tab:                                      │
   311|│   ┌─────────────────────────────────────────┐    │
   312|│   │ system: 任务已创建                       │    │
   313|│   │ system: 🤖 executor 认领了任务           │    │
   314|│   │ assistant: 分析了代码结构...              │    │
   315|│   │ system: ✅ 执行完成                      │    │
   316|│   │ user: 换个思路，先看测试覆盖率            │    │
   317|│   │ system: ⏳ 正在执行...                   │    │
   318|│   │ assistant: 测试覆盖率为 78%...            │    │
   319|│   │                          ← 消息列表      │    │
   320|│   ├─────────────────────────────────────────┤    │
   321|│   │ [输入框..................] [Send] [▶ Run] │    │
   322|│   └─────────────────────────────────────────┘    │
   323|│                                                  │
   324|└─────────────────────────────────────────────────┘
   325|```
   326|
   327|### 5.3 Chat Tab 组件树
   328|
   329|```
   330|TaskChatTab
   331|├── SegmentDivider          // "── RunSegment #1 · executor · dispatch ──"
   332|├── ChatBubble (system)     // "🤖 executor 认领了任务"
   333|├── ChatBubble (assistant)  // agent 输出（markdown 渲染）
   334|├── ChatBubble (system)     // "✅ 执行完成"
   335|├── SegmentDivider          // "── RunSegment #2 · manual ──"
   336|├── ChatBubble (user)       // 人的消息
   337|├── ChatBubble (assistant)  // agent 回复
   338|├── LiveEventStream         // 如果当前有 running segment，实时显示 events
   339|└── ChatComposer            // 输入框 + Send 按钮
   340|```
   341|
   342|### 5.4 ChatBubble 样式
   343|
   344|复用 `ProjectPlannerView.tsx` 中 `PlannerChatMessage` 的气泡样式：
   345|- user: 右对齐，深色背景
   346|- assistant: 左对齐，浅色边框背景，顶部有 agent label
   347|- system: 居中，小字，neutral 色，无气泡
   348|
   349|### 5.5 LiveEventStream
   350|
   351|当任务有正在执行的 run 时（通过 `useAgent` store 匹配 `runId`），实时展示 agent events：
   352|
   353|```tsx
   354|function LiveEventStream({ runId }: { runId: string }) {
   355|  const run = useAgent(s => s.runs[runId]);
   356|  if (!run || run.summary.status !== 'running') return null;
   357|
   358|  return (
   359|    <div className="border-l-2 border-sky-400 pl-3 space-y-1">
   360|      {run.events.filter(e => e.kind === 'message' || e.kind === 'text').map(event => (
   361|        <p key={event.idx} className="text-xs text-neutral-600 dark:text-neutral-400">
   362|          {event.text}
   363|        </p>
   364|      ))}
   365|      <div className="flex items-center gap-2 text-xs text-sky-500">
   366|        <span className="animate-pulse">●</span> Agent is working...
   367|      </div>
   368|    </div>
   369|  );
   370|}
   371|```
   372|
   373|### 5.6 ChatComposer
   374|
   375|```tsx
   376|function ChatComposer({ taskId, disabled }: { taskId: string; disabled: boolean }) {
   377|  const [text, setText] = useState('');
   378|  const [sending, setSending] = useState(false);
   379|
   380|  async function send() {
   381|    if (!text.trim() || sending) return;
   382|    setSending(true);
   383|    try {
   384|      await window.orbit.conversation.send(taskId, text.trim());
   385|      setText('');
   386|    } finally {
   387|      setSending(false);
   388|    }
   389|  }
   390|
   391|  return (
   392|    <div className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
   393|      <textarea
   394|        value={text}
   395|        onChange={e => setText(e.target.value)}
   396|        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
   397|        placeholder="Send a message to the agent..."
   398|        disabled={disabled || sending}
   399|        className="flex-1 resize-none rounded border border-neutral-300 px-3 py-2 text-sm ..."
   400|        rows={2}
   401|      />
   402|      <button onClick={send} disabled={disabled || sending || !text.trim()}>
   403|        {sending ? '⏳' : '▶ Send'}
   404|      </button>
   405|    </div>
   406|  );
   407|}
   408|```
   409|
   410|### 5.7 SegmentDivider
   411|
   412|用于在对话流中标记不同的执行段落：
   413|
   414|```tsx
   415|function SegmentDivider({ segment }: { segment: RunSegment }) {
   416|  const label = segment.trigger === 'dispatch' ? '🤖 Auto' : '👤 Manual';
   417|  const statusIcon = {
   418|    running: '⏳',
   419|    completed: '✅',
   420|    failed: '❌',
   421|    cancelled: '⚫'
   422|  }[segment.status];
   423|
   424|  return (
   425|    <div className="flex items-center gap-2 py-2 text-[11px] text-neutral-400">
   426|      <hr className="flex-1 border-neutral-200 dark:border-neutral-800" />
   427|      <span>{statusIcon} {label} · {segment.bindingId ?? 'agent'} · {timeAgo(segment.startedAt)}</span>
   428|      <hr className="flex-1 border-neutral-200 dark:border-neutral-800" />
   429|    </div>
   430|  );
   431|}
   432|```
   433|
   434|### 5.8 Zustand Store
   435|
   436|```ts
   437|// src/renderer/src/store/conversation.ts
   438|
   439|interface ConversationStore {
   440|  /** 当前打开的 task conversation */
   441|  conversation: TaskConversation | null;
   442|  loading: boolean;
   443|
   444|  /** 加载指定任务的对话 */
   445|  load(taskId: string): Promise<void>;
   446|
   447|  /** 清空（关闭 modal 时） */
   448|  clear(): void;
   449|}
   450|```
   451|
   452|不缓存多个 conversation——同时只打开一个任务详情，切换时重新 load。
   453|
   454|---
   455|
   456|## 六、Prompt 层任务边界约束
   457|
   458|在 `composePrompt` 中追加硬性指令：
   459|
   460|```
   461|# Boundary
   462|
   463|你当前负责的任务是：「${task.title}」(uid: ${task.uid})。
   464|
   465|- 只执行这个任务范围内的工作
   466|- 如果发现需要额外工作，使用 create_task 创建新任务，不要在本次执行中越界
   467|- 不要修改其他任务的状态
   468|- 完成后明确输出完成摘要
   469|```
   470|
   471|---
   472|
   473|## 七、用户旅程
   474|
   475|### 旅程 1：Agent 自动执行任务
   476|
   477|```
   478|1. 用户在 Planner 画布中规划任务图并 Publish
   479|   → 任务进入看板 waiting/todo 列
   480|
   481|2. DispatchService 每 15s tick
   482|   → 发现 Task A 满足条件（todo + autonomous + 无 owner）
   483|   → 原子认领：status→doing, owner→binding
   484|   → 创建 RunSegment + system turn "🤖 executor 认领了任务"
   485|   → spawn claude 子进程
   486|
   487|3. 用户打开看板，看到 Task A 在 doing 列，owner badge 显示 executor
   488|   → 点击 Task A → 弹出 TaskDetailsModal
   489|   → 默认进入 Chat tab（因为有正在执行的 run）
   490|   → 看到:
   491|     - system: "🤖 executor 认领了任务，开始执行..."
   492|     - LiveEventStream: agent 实时输出（tool_use, message...）
   493|     - 底部 composer 可用（可以随时介入）
   494|
   495|4. Agent 执行完成
   496|   → handlePoolEvent 触发
   497|   → agent 输出聚合为 assistant turn 写入 conversation
   498|   → system turn "✅ 执行完成: 已实现 XX 功能"
   499|   → RunSegment 标记 completed
   500|   → task status → done
   501|   → 用户在 Chat tab 看到完整对话历史
   502|
   503|5. Agent 执行失败
   504|   → system turn "❌ 执行失败: ..."
   505|   → RunSegment 标记 failed
   506|   → task status → blocked
   507|   → 用户可以在 composer 里输入修正指令，触发新一轮 run
   508|```
   509|
   510|### 旅程 2：人工主动对话执行任务
   511|
   512|```
   513|1. 用户在看板看到一个 todo 任务，不想等自动调度
   514|   → 点击 Task B → TaskDetailsModal
   515|   → 切换到 Chat tab
   516|
   517|2. 用户在 composer 输入："先分析一下这个模块的依赖关系，给我建议"
   518|   → 点击 Send
   519|   → user turn 写入 conversation
   520|   → startTask({ taskId, instructions: message }) 触发
   521|   → system turn "⏳ 正在执行..."
   522|   → agent 开始执行
   523|
   524|3. 实时看到 agent 输出
   525|   → LiveEventStream 显示 agent 正在分析...
   526|   → agent 完成 → assistant turn 写入
   527|
   528|4. 用户看了结果，继续追问："方案 B 更好，按这个思路实现"
   529|   → 再次 Send → 新的 RunSegment
   530|   → agent 再次执行（当前是新 spawn；未来可 resume）
   531|
   532|5. 满意后，用户可以手动将 task 标记为 done
   533|```
   534|
   535|### 旅程 3：Agent 执行中途人工介入
   536|
   537|```
   538|1. Agent 自动执行 Task C，进入 doing
   539|   → 用户在 Chat tab 看到 LiveEventStream
   540|
   541|2. 用户发现 agent 方向不对
   542|   → 先 Stop（通过 agent store 的 stop 能力）
   543|   → agent run 被 kill → RunSegment 标记 cancelled
   544|
   545|3. 用户在 composer 输入修正指令
   546|   → 触发新的 RunSegment（manual trigger）
   547|   → agent 按新指令执行
   548|
   549|4. 或者，用户不 Stop，直接在 composer 发消息
   550|   → 当前 run 仍在执行（不中断）
   551|   → 消息先记录为 user turn
   552|   → 当前 run 完成后，下一次 send 会触发新 run
   553|```
   554|
   555|### 旅程 4：换 Agent 继续执行
   556|
   557|```
   558|1. Agent 执行 Task D 失败，binding 降级为 degraded
   559|   → Chat tab 显示:
   560|     ── RunSegment #1 · 🤖 Auto · executor · 2min ago ──
   561|     system: "🤖 executor 认领了任务"
   562|     assistant: "尝试实现但遇到了 type error..."
   563|     system: "❌ 执行失败: type check failed"
   564|
   565|2. 用户 release 任务（通过 dispatch:releaseTask）
   566|   → task owner 清空，status 回到 todo
   567|   → system turn: "🔄 任务已释放"
   568|
   569|3. 用户手动修改 task 的 recommended_role 或 role_binding_id
   570|   → 或者由 DispatchService 自动匹配到另一个 binding
   571|
   572|4. 新 binding 认领
   573|   → Chat tab 继续追加:
   574|     ── RunSegment #2 · 🤖 Auto · reviewer · just now ──
   575|     system: "🤖 reviewer 认领了任务"
   576|     assistant: "重新分析问题..."
   577|   → 同一个 conversation，不同的 segment
   578|```
   579|
   580|---
   581|
   582|## 八、验证清单
   583|
   584|### Phase 1：数据层验证
   585|
   586|- [ ] `conversation.ts` 模块的 CRUD 单元测试
   587|  - 创建 conversation → 文件写入 `.orbit/orchestration/conversations/<uid>.json`
   588|  - appendTurn → turns 有序追加
   589|  - startSegment / completeSegment → segments 正确记录
   590|
   591|### Phase 2：DispatchService 集成验证
   592|
   593|- [ ] 自动执行一个 todo + autonomous 任务
   594|  - 验证 conversation 文件被创建
   595|  - 验证 system turn "认领" 被写入
   596|  - 验证 run 完成后 assistant turn 被写入
   597|  - 验证 segment 状态为 completed
   598|
   599|- [ ] 执行失败场景
   600|  - 验证 segment 状态为 failed
   601|  - 验证 system turn 包含失败原因
   602|
   603|### Phase 3：IPC 验证
   604|
   605|- [ ] `conversation:get` 返回正确的 conversation
   606|- [ ] `conversation:send` 写入 user turn + 触发 run
   607|- [ ] `conversation:event` 广播 turn 新增
   608|
   609|### Phase 4：UI 验证
   610|
   611|- [ ] 看板点击任务 → 弹出 TaskDetailsModal
   612|- [ ] Detail tab 展示 TaskEditor（与现有行为一致）
   613|- [ ] Chat tab 展示 conversation turns
   614|- [ ] SegmentDivider 正确显示
   615|- [ ] LiveEventStream 在 run 进行时实时更新
   616|- [ ] Composer 发送消息 → 触发 agent run
   617|- [ ] Run 完成后 → 对话流更新
   618|
   619|### Phase 5：端到端验证
   620|
   621|手动执行完整用户旅程 1-4，确认：
   622|
   623|- [ ] Planner publish → task 进入 todo → agent 自动认领 → 对话流记录完整
   624|- [ ] 人工 send → agent 执行 → 结果显示 → 追问 → 第二轮执行
   625|- [ ] 执行失败 → release → 换 agent → 同一 conversation 继续
   626|- [ ] 多个 segment 在同一 conversation 中正确显示分隔
   627|
   628|---
   629|
   630|## 九、不在本方案范围内
   631|
   632|- `--resume` vendor session（预留字段，不实现）
   633|- 对话历史搜索
   634|- 对话导出
   635|- 多任务并排对话
   636|- Conversation 的 Git 版本化
   637|
   638|---
   639|
   640|## 十、文件清单
   641|
   642|### 新增文件
   643|
   644|| 文件 | 说明 |
   645||------|------|
   646|| `src/main/orchestration/conversation.ts` | Conversation CRUD + sendAndRun |
   647|| `src/renderer/src/components/TaskChat/TaskChatTab.tsx` | Chat tab 主组件 |
   648|| `src/renderer/src/components/TaskChat/ChatBubble.tsx` | 消息气泡 |
   649|| `src/renderer/src/components/TaskChat/ChatComposer.tsx` | 输入框 |
   650|| `src/renderer/src/components/TaskChat/SegmentDivider.tsx` | 执行段落分隔 |
   651|| `src/renderer/src/components/TaskChat/LiveEventStream.tsx` | 实时事件流 |
   652|| `src/renderer/src/store/conversation.ts` | Zustand store |
   653|
   654|### 修改文件
   655|
   656|| 文件 | 修改内容 |
   657||------|----------|
   658|| `src/shared/orchestration.ts` | 新增 ConversationTurn / RunSegment / TaskConversation 类型 |
   659|| `src/shared/ipc.ts` | 新增 `conversation:*` IPC 定义 + OrbitAPI 类型 |
   660|| `src/main/orchestration/ipc.ts` | 注册 conversation IPC handlers |
   661|| `src/main/orchestration/dispatch.ts` | tryDispatchTask / handlePoolEvent 追加 conversation 写入 |
   662|| `src/main/orchestration/storage.ts` | 新增 `vaultConversationsDir` 路径函数 |
   663|| `src/main/agent/persona.ts` | composePrompt 追加任务边界约束 |
   664|| `src/renderer/src/components/TaskRow.tsx` | 点击行为改为打开 TaskDetailsModal |
   665|| `src/renderer/src/components/Modals/TaskDetailsModal.tsx` | 内部增加 tab (Detail / Chat) |
   666|| `src/preload/index.ts` | 暴露 `conversation.*` API 到 renderer |
   667|
   668|### 不修改
   669|
   670|| 文件 | 原因 |
   671||------|------|
   672|| `src/main/agent/runner.ts` | 执行链路不变 |
   673|| `src/main/agent/pool.ts` | Pool 事件机制不变 |
   674|| `src/main/agent/ipc.ts` | startTask 接口不变 |
   675|| `src/shared/agent.ts` | AgentEvent 类型不变 |
   676|
   677|---
   678|
   679|## 十一、落地顺序
   680|
   681|### Step 1：数据层（~1 天）
   682|
   683|1. `shared/orchestration.ts` 新增类型
   684|2. `orchestration/storage.ts` 新增路径函数
   685|3. `orchestration/conversation.ts` 实现 CRUD
   686|4. 单元测试
   687|
   688|### Step 2：DispatchService 集成（~0.5 天）
   689|
   690|1. `dispatch.ts` 中 tryDispatchTask 追加 conversation 写入
   691|2. `dispatch.ts` 中 handlePoolEvent 追加 conversation 写入
   692|3. 集成测试：自动执行一个任务，检查 conversation 文件
   693|
   694|### Step 3：IPC + Preload（~0.5 天）
   695|
   696|1. `shared/ipc.ts` 新增定义
   697|2. `orchestration/ipc.ts` 注册 handlers
   698|3. `preload/index.ts` 暴露 API
   699|
   700|### Step 4：UI（~1.5 天）
   701|
   702|1. `TaskDetailsModal` 增加 tab
   703|2. `TaskChatTab` + 子组件
   704|3. `conversation.ts` store
   705|4. `TaskRow.tsx` 点击行为修改
   706|5. `ChatComposer` → `conversation:send` → agent run
   707|
   708|### Step 5：Prompt 边界 + 验证（~0.5 天）
   709|
   710|1. `persona.ts` 追加边界约束
   711|2. 手动走完旅程 1-4
   712|3. 修复边界问题

(End of file. Total 712 lines.)

---

## [Tool] 2026-04-27T03:29:13.297Z
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

## [Assistant] 2026-04-27T03:29:34.933Z
我已经吃透了项目的全貌和 chat 相关的所有现存设计。再扫一眼代码侧 chat 的实际形态和最新动向：

### Tool Calls:
- **search_content**({"pattern":"chat|Chat|Conversation|conversation","path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components","outputMode":"files_with_matches","headLimit":50,"toolExplanation":"盘点 renderer 里 chat 相关组件"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components","depth":2,"offset":0,"limit":200,"toolExplanation":"查看 renderer 组件结构"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-015-task-session-state-decoupling.md","toolExplanation":"读取最新 task/session 解耦 ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-28-task-execution-lifecycle-realignment.md","toolExplanation":"读取 Phase 4.0 lifecycle plan","limit":200})

---

## [Tool] 2026-04-27T03:29:34.965Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Tasks/TaskConversationTab.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Tasks/TaskDetailsHost.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/Timeline/TimelineCards.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/inbox/stage/StageView.tsx
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/inbox/stage/renderers/HelpRequestRenderer.tsx

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-27T03:29:34.965Z
/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/renderer/src/components/
- AboutModal.tsx (3.3KB)
- CloseProjectDialog.tsx (2.5KB)
- CommandPalette.tsx (2.8KB)
- DiffPane.tsx (8.3KB)
- DiffWorkspacePane.tsx (1.9KB)
- Editor/
- Editor/MarkdownEditor.tsx (3.2KB)
- Editor/MiniMarkdownEditor.tsx (3.7KB)
- Editor/wikilinkExt.ts (2.4KB)
- ErrorBoundary.tsx (3.2KB)
- Inspector/
- Inspector/WorkspaceInspectorPane.tsx (1.4KB)
- Inspector/changes/
- Inspector/files/
- Inspector/inspectorTheme.ts (1.5KB)
- KanbanBoard.tsx (2.6KB)
- Modals/
- Modals/MigrationDialog.tsx (7.9KB)
- Modals/NewAreaModal.tsx (9.8KB)
- Modals/NewProjectModal.tsx (16.5KB)
- Modals/NewTaskModal.tsx (9.2KB)
- Modals/TaskDetailsModal.tsx (2.8KB)
- Modals/VisionEditorModal.tsx (3.5KB)
- RunLogPane.tsx (2.8KB)
- SettingsModal.tsx (17.9KB)
- Sidebar/
- Sidebar/AgentPanel.tsx (8.8KB)
- Sidebar/AreaConfigPanel.tsx (3.5KB)
- Sidebar/AreasNav.tsx (5.2KB)
- Sidebar/BacklinksPanel.tsx (896B)
- Sidebar/FileTree.tsx (6.4KB)
- Sidebar/ProjectTaskTreePanel.tsx (4.2KB)
- Sidebar/ProjectsNav.tsx (7.6KB)
- Sidebar/TaskDetailPanel.tsx (894B)
- Sidebar/TerminalSessionsPanel.tsx (9.5KB)
- Sidebar/WorkspaceSidebar.tsx (1.6KB)
- Sidebar/WorktreesPanel.tsx (7.0KB)
- Sidebar/fileTreeNavigation.ts (1.0KB)
- Sidebar/terminalSessionAction.ts (1.4KB)
- TaskEditor/
- TaskEditor/TaskEditor.tsx (25.2KB)
- TaskRow.tsx (9.1KB)
- Tasks/
- Tasks/TaskConversationTab.tsx (10.0KB)
- Tasks/TaskDetailSurface.tsx (3.4KB)
- Tasks/TaskDetailsHost.tsx (1.3KB)
- Terminal/
- Terminal/TerminalManager.tsx (27.9KB)
- Terminal/TerminalPane.tsx (7.6KB)
- Terminal/sessionRegistry.ts (1.3KB)
- Terminal/terminalAgentStatus.ts (799B)
- Terminal/terminalHotkeys.ts (1.6KB)
- Terminal/terminalLayout.ts (838B)
- Terminal/terminalManagerState.ts (2.2KB)
- Terminal/terminalNavigationIntent.ts (1.0KB)
- Terminal/terminalPaneStatusRegistry.ts (2.0KB)
- Terminal/terminalResources.ts (843B)
- Terminal/terminalRuntime.ts (2.9KB)
- Terminal/terminalRuntimeRegistry.ts (7.4KB)
- Terminal/terminalSizing.ts (1.0KB)
- Terminal/terminalTheme.ts (2.0KB)
- Terminal/terminalTree.ts (2.7KB)
- Timeline/
- Timeline/StreamingMarkdown.tsx (1.6KB)
- Timeline/TimelineCards.tsx (4.7KB)
- Timeline/index.ts (217B)
- Toasts.tsx (658B)
- TopBar.tsx (6.0KB)
- chat/
- chat/approvalCardModel.ts (1.1KB)
- inbox/
- inbox/InboxShell.tsx (7.9KB)
- inbox/list/
- inbox/stage/
- inbox/tabs/
- quick-capture/
- quick-capture/QuickCaptureModal.tsx (3.5KB)
- quick-capture/QuickCaptureProvider.tsx (1.5KB)
- topbarModel.ts (5.2KB)

---

## [Tool] 2026-04-27T03:29:34.966Z
     1|---
     2|id: ADR-015
     3|title: Task 状态机与 Agent 会话状态机解耦
     4|status: accepted
     5|date: 2026-04-28
     6|related: ADR-006, ADR-007, ADR-012, ADR-014
     7|implementation: plans/2026-04-28-task-execution-lifecycle-realignment.md
     8|---
     9|
    10|# ADR-015: Task 状态机与 Agent 会话状态机解耦
    11|
    12|## Context
    13|
    14|Phase 3 完成代码后第一次真实 dog-food 立刻暴露根因故障：
    15|
    16|1. 用户在看板新建 task（`to do` + `autonomous`）
    17|2. Auto-runner 拾取派发，agent 启动
    18|3. **Agent 第一句话就说**："我需要补充 X、Y、Z" → 进程退出
    19|4. Orbit 把 task 状态从 `doing` 改成 `blocked`
    20|5. 用户在 task chat 补充信息 → **task 不会自动回 `doing`**
    21|6. 链路死在这里
    22|
    23|根因：Orbit 把两层完全不同的概念混在一个状态字段里：
    24|
    25|| 层 | 关心的事 | 时间尺度 |
    26||---|---|---|
    27|| **Task 状态**（项目层） | 这件事做完了没？人审过没？依赖就绪没？ | 跨 session、跨次会话、长期持有 |
    28|| **Agent 会话状态**（执行层） | 进程活着吗？等用户回信吗？哪个 runtime 在跑？ | 跨多次启动、跨 runtime 切换 |
    29|
    30|混在一起后：
    31|- agent 进程"软退出"（求助补充信息）被当成 task 阶段终结
    32|- ADR-007 定义的 `blocked`（依赖未就绪）被复用来表达"等用户回信"，语义重叠导致 unblock 路径都没接通
    33|- ADR-012 已经把"vendor session 不死"做了，但 task 状态机还在按"agent 进程退出 = task 阶段结束"的旧模型运转
    34|
    35|ADR-006 引入的 `propose-approve` 也没有覆盖这一类情形——agent 求助是"我没法继续"而不是"我要扩张状态"，没有合适的 propose 类型来匹配。
    36|
    37|## Decision
    38|
    39|把 task 状态和 agent 会话状态**显式拆成两台独立的状态机**，互不直接耦合：
    40|
    41|### Task 状态机（项目层 / 持久 / 跨 session）
    42|
    43|```
    44|to do → ready → doing → review → done
    45|                  │                  │
    46|                  │                  ▼
    47|                  │              archived
    48|                  ▼
    49|                blocked  ← 仅用于 ADR-007 depends_on 未就绪
    50|                  │
    51|                  ▼
    52|                ready
    53|```
    54|
    55|**`blocked` 严格收敛为"依赖未就绪"语义**，不再表达任何"等用户"或"agent 失败"语义。
    56|
    57|### Agent 会话状态机（执行层 / per RunSegment）
    58|
    59|```
    60|idle → launching → running ⇄ awaiting_user
    61|                       │
    62|                       ├→ completed
    63|                       ├→ failed_retryable    （runtime 内部已处理）
    64|                       └→ failed_terminal     （触发 fallback / Inbox）
    65|```
    66|
    67|`awaiting_user` 是新引入的会话子状态，专门表达"agent 求助等用户回信"。
    68|
    69|### 关键迁移规则
    70|
    71|| 触发 | task 当前 | task 迁移 | agent 会话迁移 |
    72||---|---|---|---|
    73|| Auto-runner 派发 | ready | doing | idle → running |
    74|| Agent 主动求助 | doing | **不变** | running → awaiting_user |
    75|| 用户在 chat 发消息 | doing/awaiting | doing | awaiting → running |
    76|| Agent 完成 | doing | review | running → completed |
    77|| Agent 不可重试错 | doing | **不变** | running → failed_terminal |
    78|| 全 runtime 失败 | doing | **不变** | failed_terminal + Inbox B3 |
    79|| 依赖未就绪 | ready | blocked | — |
    80|| 依赖就绪 | blocked | ready | — |
    81|
    82|**关键约束**：agent 会话事件 **不直接修改 task 状态**，必须经过 `task state reducer` 决定是否影响 task 状态。所有 task 状态变更点统一走这个 reducer。
    83|
    84|## Rationale
    85|
    86|**为什么不用一个状态机统揽**：
    87|
    88|混在一起的代价（dog-food 已经验证）：单向门、状态语义重叠、unblock 路径漏接、用户体验断裂。
    89|
    90|**为什么 `awaiting_user` 是会话子状态而不是 task 状态**：
    91|
    92|- "等用户回信"是会话内部事件，不是项目阶段——一个 task 可能在生命周期里反复进入 `awaiting_user` 多次
    93|- 看板视觉上仍然是 `doing` 列里的卡片（仅加图标提示）——避免用户误认为 task 死了
    94|- 不需要新一个 task 状态来表达，避免状态空间膨胀
    95|
    96|**为什么 reducer 必须统一**：
    97|
    98|事件来源多（user/agent/dispatcher/system），如果每个调用点直接改 status，状态机无法单元测试，无法回放，无法演进。Reducer 模式让所有迁移路径有单一入口、可测试、可观察。
    99|
   100|**替代方案**：
   101|
   102|- **新增 `awaiting_user` 作为独立 task 状态**：拒绝。看板呈现复杂化、用户认知负担；本质是会话事件不该上升到项目层。
   103|- **保留 `blocked` 双语义，加 sub-reason 字段**：拒绝。等同于把语义模糊性藏到深处，状态机推理仍然受影响。
   104|- **不解耦，靠 dispatcher 自动重新派发解决"agent 求助→blocked"**：拒绝。dispatcher 不知道 agent 求助是不是已被回应；语义在错的层。
   105|
   106|## Consequences
   107|
   108|**正面**：
   109|
   110|- 5 个 dog-food 症状（blocked 单向门 / 求助即死亡 / 续跑不连通 / 切 runtime 怕丢历史 / 故障无恢复入口）一起松动
   111|- 状态机可单元测试 + 边覆盖
   112|- ADR-007 `blocked` 语义被还原干净
   113|- 与 ADR-012 task-session 绑定能完整协同（resume 不再被 task 状态破坏）
   114|
   115|**负面 / 待处理**：
   116|
   117|- 现有所有直接改 `task.status` 的代码点都需要重写为走 reducer——一次性工作量
   118|- 测试需要同步覆盖两个状态机的协同（在 plan 的 lifecycle scenario 里覆盖）
   119|- 看板需要新增 `awaiting_user` 子状态的视觉表达
   120|
   121|**回退计划**：
   122|
   123|如果 reducer 模式被发现性能或调试问题，可以局部退回直接调用，但状态机解耦本身不可逆——`blocked` 的语义已经被还原，agent 会话事件不再写 task 状态。
   124|
   125|## Implementation
   126|
   127|详见 [`plans/2026-04-28-task-execution-lifecycle-realignment.md`](../plans/2026-04-28-task-execution-lifecycle-realignment.md) 的 §3.1 和 §5 实施顺序。
   128|
   129|关键实施点：
   130|
   131|- 新模块：`src/main/task-state/reducer.ts`
   132|- 字段扩展：`RunSegment.sessionStatus` (`idle` / `launching` / `running` / `awaiting_user` / `completed` / `failed_retryable` / `failed_terminal`)
   133|- 现有 `task.status = ...` 调用点全部改为 `dispatch(reducer, input)`
   134|- 看板组件读取 `task.status === 'doing' && activeRunSegment.sessionStatus === 'awaiting_user'` 决定是否显示等待图标

(End of file. Total 134 lines.)

---

## [Tool] 2026-04-27T03:29:34.966Z
     1|---
     2|title: "Task Execution Lifecycle Realignment"
     3|status: in_progress
     4|date: 2026-04-28
     5|adr: ADR-015 (待写), ADR-016 (待写), ADR-012 (扩展)
     6|supersedes: null
     7|phase: 4
     8|---
     9|
    10|# Task Execution Lifecycle Realignment
    11|
    12|> **代号**：Phase 4.0 — "让 task 真的能从头跑到尾"
    13|>
    14|> **核心命题**：Phase 3 把 agent 执行链路升级成可观察、可恢复、可回放，但**真实 dog-food 暴露了一个更上层的问题——task 生命周期状态机和 agent 会话状态机被错误地耦合在了一起**。本期把它们解耦，并把"agent 启动协议"和"切 runtime 时的 session 承接"一并修正，让 task 真正能"开了走开睡觉，醒来都有终态"。
    15|>
    16|> **前置条件**：v2 + Phase 3 全部 completed
    17|>
    18|> **预期产出**：2 份新 ADR (015, 016) + ADR-012 修订 + 三块设计 + 端到端真实自动化测试 + 代码改造
    19|
    20|---
    21|
    22|## 1. 问题陈述
    23|
    24|### 1.1 真实 dog-food 故障复盘
    25|
    26|Phase 3 完成代码后立刻 dog-food，第一个稍复杂的任务（多工具/长 thinking）就跑不下来。具体复现路径：
    27|
    28|1. 在看板新建 task，状态 `to do`，授权 `autonomous`
    29|2. Auto-runner 拾取，dispatch claude runtime
    30|3. **Agent 第一句话就说**："我需要补充 X、Y、Z 才能开始" → agent 进程退出
    31|4. Orbit 把 task 状态从 `doing` 改成 `blocked`
    32|5. 用户在 task chat 里补充信息
    33|6. **task 不会自动回 `doing`**，agent 进程不会自动重启，整条链路死在这里
    34|
    35|同时观察到的次生问题：
    36|
    37|- **Agent 不知道项目全貌就开工**——项目里还有十几个相关 task、几份 plan、roadmap 上的阶段定位它都不掌握，决策"我需要更多信息"是在记忆缺失下做出的
    38|- **没有"切 agent"通道**——即使知道 claude 状态不好想换 codex 试试，找不到入口，且担心切换后历史对话丢失
    39|
    40|### 1.2 五个症状一个根因
    41|
    42|把上面拆成 5 个独立症状：
    43|
    44|| # | 症状 | 用户感受 |
    45||---|------|---------|
    46|| 1 | Task `blocked` 是单向门：进得来出不去 | 补充完信息也不知道下一步怎么办 |
    47|| 2 | Agent 求助 → task 死亡 | 像"员工有疑问就辞职"的错配 |
    48|| 3 | Agent 认领时项目级上下文不足 | agent 张口要"补充信息"，因为它真的什么都不知道 |
    49|| 4 | task chat 发消息不会自动续跑 | 不知道续跑入口在哪 |
    50|| 5 | 切 runtime 时 session 历史丢失没人保证 | 不敢切 |
    51|
    52|**共同根因**：Orbit 把 **"task 项目层状态"** 和 **"agent 执行层会话状态"** 混为一谈。
    53|
    54|- task 状态是项目层概念（事情做完了没？人审过没？）
    55|- agent 会话状态是执行层概念（进程活着吗？session 健在吗？等不等用户回信？）
    56|- Phase 3 的 ADR-012 已经把"vendor session 不死"做了，但 task 状态机仍按"agent 进程退出 = task 阶段终结"的旧模型运转
    57|- 两层耦合在一起，导致 agent 一次软退出（求助）就把 task 推进死状态，再也回不去
    58|
    59|修这个根因，5 个症状一起松动。
    60|
    61|### 1.3 与 Phase 3 的关系
    62|
    63|Phase 3 解决的是**执行层内部**的可观察 / 可恢复 / 可回放问题，但**没有重新审视 task 状态机**。本期是 Phase 3 的逻辑延续，把"执行链路稳定"的成果延伸到"端到端 task 生命周期稳定"。
    64|
    65|---
    66|
    67|## 2. 核心目标
    68|
    69|**用户表述**：
    70|
    71|> 我可以随时开各种各样的 task，agent 也对这些 task 都了解上下文，他认领了一个 task 之后，他在执行这个 task 的时候，他能知道这个项目在干什么，他才能规划他自己的下一步。然后，他需要补充信息的时候，我补充信息以后，他还能接着去跑。他即使报错了，我也有能够手动去让它继续的办法，或者是切换到别的 agent 的办法。
    72|
    73|落到可验证的标准：
    74|
    75|| # | 标准 | 验证方式 |
    76||---|------|---------|
    77|| G1 | task 生命周期没有"单向门"，每个 task 都能从任意状态走到终态（done / archived / 主动 reject） | 状态迁移图全闭合 + 端到端测试覆盖每条边 |
    78|| G2 | Agent 认领时**强制**先了解项目全貌再动手 | 启动协议 + agent 行为审查（看真实 transcript） |
    79|| G3 | 用户在 task chat 发消息一定能让 task 流动 | 自动化测试模拟用户介入 |
    80|| G4 | Switch Runtime 不丢历史，新 agent 能完整接手 | 真实跨 runtime 切换 + transcript 完整性断言 |
    81|| G5 | 任何故障路径都有"手动让它继续"的入口，而且入口符合直觉 | UI / CLI 双通道审查 |
    82|
    83|---
    84|
    85|## 3. 三大设计动作
    86|
    87|### 3.1 动作 1：Task 状态机 ⊥ Agent 会话状态机（ADR-015）
    88|
    89|#### 解耦
    90|
    91|```
    92|┌──────────── Task 状态机（项目层 / 持久 / 跨 session）────────────┐
    93|│                                                                  │
    94|│   to do                                                          │
    95|│     │                                                            │
    96|│     ▼                                                            │
    97|│   ready ──────► doing ──────► review ──────► done                │
    98|│     │            ▲                              │                │
    99|│     │            │                              ▼                │
   100|│     ▼            │                          archived             │
   101|│   blocked ───────┘                                               │
   102|│     (仅用于 ADR-007 depends_on 未就绪)                           │
   103|│                                                                  │
   104|└──────────────────────────────────────────────────────────────────┘
   105|                            ⊥（不直接耦合）
   106|┌──────────── Agent 会话状态机（执行层 / per RunSegment）──────────┐
   107|│                                                                  │
   108|│   idle ──► launching ──► running ◄──────► awaiting_user          │
   109|│                              │                                   │
   110|│                              ├──► completed                      │
   111|│                              ├──► failed_retryable               │
   112|│                              └──► failed_terminal                │
   113|│                                                                  │
   114|└──────────────────────────────────────────────────────────────────┘
   115|```
   116|
   117|#### 关键约束
   118|
   119|- **`blocked` 仅用于 ADR-007 定义的 `depends_on` 未就绪**，不再表达"等用户回信"
   120|- **`awaiting_user` 是 agent 会话子状态**，task 主状态保持 `doing`
   121|- 看板视觉提示：`doing` 列内的卡片如果会话子状态是 `awaiting_user`，加图标（💬 待回复）
   122|- task 状态迁移由 **task state machine service** 统一发起，agent 会话事件**不直接修改 task 状态**，而是经过 reducer 决定是否影响 task 状态
   123|
   124|#### 状态迁移规则（关键边）
   125|
   126|| 触发事件 | task 当前 | task 迁移 | agent 会话迁移 |
   127||---|---|---|---|
   128|| Auto-runner 派发开始 | ready | doing | idle → launching → running |
   129|| Agent 主动求助补充信息 | doing | **不变（仍 doing）** | running → awaiting_user |
   130|| 用户在 task chat 发消息 | doing/awaiting_user/blocked* | doing | awaiting_user/idle → launching → running |
   131|| Agent 完成 + ghost commit ok | doing | review | running → completed |
   132|| Agent 进程死 + 不可重试 | doing | **不变（仍 doing）** | running → failed_terminal |
   133|| Agent 进程死 + fallback 可用 | doing | **不变** | failed_* → idle → 切 runtime → running |
   134|| 所有 runtime 都失败 | doing | **不变** | failed_terminal | + emit Inbox B3 |
   135|| 用户在 review 列拖回 doing | review | doing | idle |
   136|| 用户主动 reject merge | review | done (with rejected outcome) | — |
   137|| 依赖未就绪 | ready | blocked | — |
   138|| 依赖就绪 | blocked | ready | — |
   139|
   140|`blocked*`：从 blocked 接收消息时，agent 会话先开起来，但**只有依赖真就绪了** task 才回 doing；否则 agent 在 awaiting_user / 解释为什么进展不了。
   141|
   142|#### Reducer 设计
   143|
   144|```typescript
   145|// src/main/task-state/reducer.ts (新增)
   146|
   147|interface TaskStateContext {
   148|  task: Task
   149|  activeRunSegment: RunSegment | null
   150|  pendingDependencies: TaskUid[]
   151|}
   152|
   153|interface TaskStateInput {
   154|  source: 'user' | 'agent' | 'dispatcher' | 'system'
   155|  kind:
   156|    | 'user_message_in_chat'
   157|    | 'agent_session_started'
   158|    | 'agent_awaiting_user'
   159|    | 'agent_completed'
   160|    | 'agent_failed'
   161|    | 'dispatcher_dispatch_failed'
   162|    | 'dependency_resolved'
   163|    | 'dependency_blocked'
   164|    | 'user_review_action'
   165|  payload: unknown
   166|}
   167|
   168|function reduceTaskState(
   169|  ctx: TaskStateContext,
   170|  input: TaskStateInput,
   171|): TaskStateTransition {
   172|  // 返回 { newTaskStatus, newSessionStatus, sideEffects[] }
   173|}
   174|```
   175|
   176|所有 task 状态变更走这个 reducer，事件原子化、可测试、可回放。
   177|
   178|### 3.2 动作 2：Agent 启动协议（ADR-016）
   179|
   180|#### 强约束启动 prompt
   181|
   182|dispatch 时所有 agent runtime 的 system prompt 前置一段强约束启动协议（可以在每个 runtime adapter 的 `buildSystemPrompt()` 中拼装）：
   183|
   184|```
   185|# 启动协议（必须遵守）
   186|
   187|你即将处理 task: <title> (uid: <task-uid>)。
   188|这个 task 是项目 <project-name> 的一小部分，**不是孤立任务**。
   189|
   190|## 第一阶段：理解（必须在第一轮完成）
   191|
   192|在做任何修改文件 / 创建文件 / 调用工具修改状态的操作之前，
   193|你必须先用以下命令至少**完整运行一次**了解项目全貌：
   194|
   195|  orbit project overview <project-slug>     # 项目愿景 / 当前阶段 / 关键文档
   196|  orbit kanban list <project-slug>          # 项目所有 task 当前状态
   197|  orbit task related <task-uid>             # 与当前 task 相关的其他 task / docs
   198|  orbit search "<keyword>" --project <slug> # 全 vault 搜索（如有具体关键词）
   199|
   200|读完后，你的第一条输出**必须**包含一个明确段落：

(Showing lines 1-200 of 631.)

---

## [Assistant] 2026-04-27T03:30:31.376Z
我已经掌握完整的图景了。先停在这里，把我的理解汇总后跟你对齐，再往下推。

---

## 我对 Orbit 现状的理解（chat 维度）

### 项目当前坐标
- **阶段**：Phase 4.0 代码实施完成，进入 lifecycle dog-food 观察期
- **刚落地的关键动作**：task 状态机 ⊥ agent 会话状态机解耦（ADR-015）、agent 启动协议（ADR-016）、switch runtime 承接（ADR-012 修订）
- **v2 的核心隐喻**：Inbox 是"人类注意力在场"的统一入口，chat 是人机协作的核心介质

### Chat 在系统里的所有出现位置（我盘到的）

| # | 场景 | 当前形态 | 状态 |
|---|------|---------|------|
| 1 | **Task Conversation** | `components/Tasks/TaskConversationTab.tsx` + `orchestration/conversation.ts` + per-task JSON store。Phase 4.0 后 Chat tab 已被改名为 Activity，用 Timeline cards 渲染 | 活跃 |
| 2 | **Planner Chat**（和 Planner agent 聊规划） | `ProjectPlannerView` 里的独立实现（v1 遗留） | ADR-005 明确"不重构、保 v1" |
| 3 | **Inbox 右侧 Stage** | `components/inbox/stage/StageView.tsx` + `HelpRequestRenderer.tsx`。B 类求助事件点开后内联 chat | 活跃（Stage View 抽象的首个落地） |
| 4 | **Chat 原地审批卡片** | `components/chat/approvalCardModel.ts` + 双通道同步（`proposal_id`） | 活跃 |
| 5 | **Terminal Agent**（用户直接跟 Claude CLI 交互） | TerminalManager + terminalAgent IPC | 独立通路 |
| 6 | **Quick Capture Thought**（理论上不是 chat，但底部输入框的交互接近） | QuickCaptureModal | 独立 |
| 7 | **Thinking Trail**（手动）/ 未来自动化 | 只有手动示例 `thinking-trail/2026-04-26-v2-direction/` | open-questions #2 |

### 我观察到的几条张力（接下来值得讨论的重点）

1. **"Stage View"抽象只在 Inbox 落地，Planner 还是独立实现，Task Conversation 也是自己一套** —— ADR-005 承认通用模式但本期不重构；现在多了 Phase 3/4.0 又多一版（Timeline cards）。chat 实现已经三套并行。
2. **Chat 的"数据模型"三份**：`TaskConversation`（turns + segments）、Planner 自己的 chat message、Inbox HelpRequest renderer 自己构造的消息。Unified Agent Event 只统一了执行层，没统一"对话层"。
3. **"原地 chat 审批"和"Inbox 里也 chat"双通道**在理论上顺滑，实现上跨多套 store / 多套渲染组件。
4. **Phase 4.0 引入的 `awaiting_user` 子状态**需要 chat 作为"继续执行"的入口——但这个入口在三处 chat 里行为是否一致、UI 怎么提示等待中，未见统一规范。
5. **Thinking Trail、对话导出、跨 session 搜索** 全悬在 open-questions，底层数据如何存决定了未来能不能省力做。
6. **没有一份"应用内 Chat 统一规划"的文档** —— ADR-005 只是"承认模式"，没给出统一架构。

### 为什么这事值得现在做
你问的"应用内 chat 的统一规划"，时机上刚好踩在：
- Phase 4.0 刚把 task/session 状态机解耦，chat 作为状态机之间的"消息通道"地位更核心
- Stage View 在 Inbox 已经跑过一轮，抽象可行性被验证了
- Planner 的 v1 实现再拖就会形成永久技术债
- Thinking Trail 自动化、chat 历史检索等都在等一个统一数据模型

---

## 进入 Evolve 模式前我需要先跟你对齐几件事

按 skill 纪律，开工前先确认意图边界。下面几个问题会决定我们讨论的方向：

### Tool Calls:
- **ask_followup_question**({"title":"Chat 统一规划 —— 方向对齐","questions":[{"id":"scope","prompt":"这次\"统一规划\"你想聊到多深？","options":[{"id":"a","label":"A. 只聊产品层（chat 在 Orbit 里应有的形态、心智、入口统一）"},{"id":"b","label":"B. 产品 + 架构（Chat 通用抽象/数据模型/Stage View 完整化）"},{"id":"c","label":"C. 完整方案（产品 + 架构 + 迁移路径，产出 ADR 候选 + plan 草稿）"},{"id":"d","label":"D. 先盘清楚我脑子里已有的想法，你提问驱动我表达"}]},{"id":"target_scenes","prompt":"这次规划要覆盖哪几类 chat？（可多选）","allow_multiple":true,"options":[{"id":"task","label":"Task Conversation（任务详情的 Activity/Chat）"},{"id":"planner","label":"Planner Chat（和 planner agent 对话生成 proposal）"},{"id":"inbox","label":"Inbox 内联 chat（Help request / 审批卡片双通道）"},{"id":"terminal","label":"Terminal Agent（直接跟 CLI 对话）"},{"id":"global","label":"全局 Ask-Anywhere chat（面向整个 vault 的对话入口，目前尚无）"},{"id":"reading","label":"阅读/笔记场景的 chat（Library 文章讨论、Note 讨论，尚无）"}]},{"id":"pain","prompt":"当前最让你觉得\"必须统一\"的那个痛点是哪个？","options":[{"id":"p1","label":"三套 chat 实现难维护，每加一个场景要重做一次"},{"id":"p2","label":"Phase 4.0 的 awaiting_user 恢复路径在不同 chat 行为不一致，用户心智断裂"},{"id":"p3","label":"没有全局 ask-anywhere 入口，想跟 Orbit 本身聊事都没地方"},{"id":"p4","label":"Thinking Trail / chat 历史检索做不了，因数据模型没统一"},{"id":"p5","label":"Planner chat 是孤岛，v2 产物舞台抽象没真正打通"},{"id":"p6","label":"其它（下条消息告诉我）"}]},{"id":"format","prompt":"你希望我怎么推进？","options":[{"id":"f1","label":"苏格拉底式多轮追问，每轮我只抛 2-3 个关键问题让你拍板"},{"id":"f2","label":"我先基于现有文档出一版 chat 全景分析 + 统一方案草稿，你基于它挑刺"},{"id":"f3","label":"先分析一个参照项目（Linear/Cursor/Claude Desktop 等）的 chat 架构再回来聊"}]}],"toolExplanation":"对齐 chat 统一规划的方向和深度"})

---

## [Tool] 2026-04-27T03:30:31.384Z
{"pending":true,"questions":[{"id":"scope","prompt":"这次\"统一规划\"你想聊到多深？","options":[{"id":"a","label":"A. 只聊产品层（chat 在 Orbit 里应有的形态、心智、入口统一）"},{"id":"b","label":"B. 产品 + 架构（Chat 通用抽象/数据模型/Stage View 完整化）"},{"id":"c","label":"C. 完整方案（产品 + 架构 + 迁移路径，产出 ADR 候选 + plan 草稿）"},{"id":"d","label":"D. 先盘清楚我脑子里已有的想法，你提问驱动我表达"}]},{"id":"target_scenes","prompt":"这次规划要覆盖哪几类 chat？（可多选）","options":[{"id":"task","label":"Task Conversation（任务详情的 Activity/Chat）"},{"id":"planner","label":"Planner Chat（和 planner agent 对话生成 proposal）"},{"id":"inbox","label":"Inbox 内联 chat（Help request / 审批卡片双通道）"},{"id":"terminal","label":"Terminal Agent（直接跟 CLI 对话）"},{"id":"global","label":"全局 Ask-Anywhere chat（面向整个 vault 的对话入口，目前尚无）"},{"id":"reading","label":"阅读/笔记场景的 chat（Library 文章讨论、Note 讨论，尚无）"}],"allow_multiple":true},{"id":"pain","prompt":"当前最让你觉得\"必须统一\"的那个痛点是哪个？","options":[{"id":"p1","label":"三套 chat 实现难维护，每加一个场景要重做一次"},{"id":"p2","label":"Phase 4.0 的 awaiting_user 恢复路径在不同 chat 行为不一致，用户心智断裂"},{"id":"p3","label":"没有全局 ask-anywhere 入口，想跟 Orbit 本身聊事都没地方"},{"id":"p4","label":"Thinking Trail / chat 历史检索做不了，因数据模型没统一"},{"id":"p5","label":"Planner chat 是孤岛，v2 产物舞台抽象没真正打通"},{"id":"p6","label":"其它（下条消息告诉我）"}]},{"id":"format","prompt":"你希望我怎么推进？","options":[{"id":"f1","label":"苏格拉底式多轮追问，每轮我只抛 2-3 个关键问题让你拍板"},{"id":"f2","label":"我先基于现有文档出一版 chat 全景分析 + 统一方案草稿，你基于它挑刺"},{"id":"f3","label":"先分析一个参照项目（Linear/Cursor/Claude Desktop 等）的 chat 架构再回来聊"}]}],"title":"Chat 统一规划 —— 方向对齐"}

---

## [Assistant] 2026-04-27T03:31:11.751Z
正在等你拍板这四个问题。收到回答我会：

1. **按 Evolve 模式启动 session**（写入 `docs/.session.json`，记录本次讨论的 scope 和 phase）
2. **如果选 f1（苏格拉底）**：进入 chat 统一规划的第 1 个维度深挖（我倾向从"Chat 在 Orbit 里到底是什么"这个定位问题起手，因为它决定后面所有架构选择）
3. **如果选 f2（我先出草稿）**：我会深扫一遍 `TaskConversationTab.tsx` / `StageView.tsx` / `ProjectPlannerView` / `conversation.ts` 的真实实现，产出一份 `plans/2026-04-29-chat-unification-blueprint.md` 的草稿给你挑刺
4. **如果选 f3（先参考项目）**：我需要你指一下参考什么——我的直觉候选是 **Cursor**（chat + 产物舞台最成熟）、**Linear**（Inbox 和 issue 内联 comment 的双通道）、**Claude Projects/Claude Code**（task-scoped 对话 + vendor session 续跑）

同时提一个我个人的观察作为引子，不等你回答也可以先放着：

> **我怀疑真正的核心命题不是"统一三套 chat 实现"，而是"Orbit 需要一个 First-Class 的 Conversation 域模型"**。现在 `TaskConversation` 是 orchestration 下的一个子数据，Inbox HelpRequest 的 chat 是临时构造，Planner 的 chat 是 UI state——三者都不是"conversation 这个概念本身"。如果把 Conversation 升格为和 Task/Project 同级的一等公民（有自己的存储路径、生命周期、CLI 接口、可被 agent 检索和引用），Stage View 的统一就会变成自然结论，Thinking Trail 的数据源也会自动到位。
>
> 这是我进场前的预设，你可以一会儿直接告诉我这想法对不对。

等你回复。

---

## [User] 2026-04-27T03:47:19.642Z
我认为很重要的一点是，需要抽象出chat和runtime agent之间的逻辑，消息协议等等，需要业务无关，才能让这套逻辑在任何应用内的其他业务跑起来，且后面还有可能做应用内的runtime，但没关系，应用内的runtime也是一种runtime，抽象在runtimeagent内就可以。任务页的chat，要处理对话等待用户审批，对话完成，通知inbox，这些其实都和chat本身无关，chat不应该感知，chat只负责渲染出agent的对话，用户的对话，中间的各种时机抛出各种事件，业务应该由每一个业务的地方去完成，就像inbox也是如此，他只负责定义接收哪些消息，业务负责去发送这些消息类型出去到应用总线。所有模块都解耦，这样才能长期稳定的迭代。这个阶段必须借助chat这个契机，把应用当前的架构给解耦到一个干净的地步。

---

## [Assistant] 2026-04-27T03:56:47.246Z
非常关键的表态。你这段话本身已经把核心命题讲得很清楚了，我先把它"翻译"成架构语言跟你对齐，确保我理解到位，然后我们再往下推。

---

## 我听到的核心命题

你在说的不是"统一三套 chat UI"，而是一次**以 chat 为契机的应用级解耦**。具体拆成四层主张：

### 主张 1：Chat ⊥ Runtime Agent 的协议是业务无关的
```
Chat  ◄──── 消息协议（业务无关）────►  Runtime Agent
 │                                            │
 │                                            ├─ Claude runtime
 │                                            ├─ Codex runtime
 │                                            ├─ Copilot runtime
 │                                            └─ In-app runtime（未来）
```
- 这套协议里只有"对话"的抽象：消息、流、中断、resume、工具使用、cost
- **不关心任务、不关心 inbox、不关心 proposal、不关心 vault**
- 应用内 runtime 也是 runtime 的一种实现，天然装得进

> 对应到 Orbit 现状：Phase 3 的 `UnifiedAgentEvent` 已经在做执行层统一，但它本质是"runtime 上行事件的规范"，**还不是一套"chat ↔ runtime 的双向消息协议"**。比如：用户发消息走的是 `agent:sendMessage` 或 `conversation:send`，跟 UnifiedAgentEvent 不是同一层抽象。

### 主张 2：Chat 组件是纯粹的"对话渲染器"
- Chat 只负责：显示用户消息、显示 agent 消息、输入、流式渲染、滚动、选择、复制
- Chat **不知道**自己嵌在哪个业务里、不知道什么叫"task"、不知道什么叫"awaiting_user"
- Chat 在关键时机**对外 emit 事件**（消息发送、agent 完成、agent 求助、停止、resume…），由宿主业务决定怎么处理

### 主张 3：业务逻辑通过"应用总线"解耦
```
┌─────────────────────────────────────────────┐
│              Application Event Bus           │
│  ┌──────────────────────────────────────┐   │
│  │ chat.message.sent                    │   │
│  │ chat.agent.awaiting_user             │   │
│  │ chat.agent.completed                 │   │
│  │ chat.agent.proposal_emitted          │   │
│  │ inbox.item.resolved                  │   │
│  │ task.state.changed                   │   │
│  │ ...                                  │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
      ▲                 ▲                 ▲
      │                 │                 │
   Task 业务         Inbox 业务       Planner 业务
  （订阅消息）      （订阅消息）      （订阅消息）
  （发出消息）      （发出消息）      （发出消息）
```
- Chat 抛事件、Inbox 订阅它关心的类型、Task 订阅它关心的类型
- "通知 Inbox"这件事在 chat 看来是无感的——某个订阅者自发响应
- **每个模块只声明"我消费什么、我产出什么"，不直接调用彼此**

### 主张 4：这次是一次应用级架构治理，不只是 chat feature
> 原话：**"这个阶段必须借助 chat 这个契机，把应用当前的架构给解耦到一个干净的地步。"**

这是本次讨论的**真正目标**。Chat 是切入点，不是终点。交付物应该是一套可以支撑 5 年迭代的解耦骨架。

---

## 我的初步反应（三个正向 + 三个要一起想清楚的）

### 🟢 正向——这条路是对的

1. **方向与 Orbit 的哲学一致**。ADR-005（Stage View 通用抽象）、ADR-011（Runtime 抽象贯通）、ADR-015（状态机解耦）都是在"减耦合"的方向上走，这次是把思路延伸到 **chat 通信层** 和 **应用级事件流** 两个还没治理的部分。
2. **时机刚好**。Phase 4.0 刚把 task/session 状态机解耦，如果不顺势把 chat 的业务耦合一起拆掉，后面每新加一个 chat 场景（Library/Note/Ask-Anywhere）都是给现有耦合加一块补丁。
3. **UnifiedAgentEvent 为 Runtime 侧铺过路**。Phase 3 已经让 ClaudeAdapter / Codex / Copilot 都产出同构事件，chat 协议复用这个能力的增量成本低。

### 🟡 要一起想清楚的三件事

这些不是质疑你，是"**这条路要真落地必须先答的问题**"，我们接下来的讨论可以围绕它们展开：

#### Q1. "业务无关的 chat ↔ runtime 协议"边界在哪里？

纯粹"对话"的信息很少，实际 chat 还需要承载这些东西，它们是不是业务？
- **Resume / Session 绑定**：chat 要不要知道"这条消息要续到哪个 vendor session"？（这好像是业务，但又不可能完全不知道）
- **工具调用展示**：Claude 调 Read/Bash 之类工具在 chat 里渲染成卡片——tool 列表本身是运行时能力声明，但"哪些工具算内置、哪些渲染方式"是不是业务？
- **Proposal / Approval 卡片**：Agent 产出的消息里嵌了审批卡片——卡片类型注册在哪一层？
- **附件 / 引用 / @mention**：用户 @了某个 task、附了某个文件——chat 是不是需要"引用类型"的抽象，但不知道引用目标的具体业务语义？

**我的直觉切法**：chat ↔ runtime 协议只包含 `message / stream / tool_use / tool_result / thinking / cost / done / error / interrupt / resume`。"卡片"是渲染层的插件机制，由宿主注册 **content renderer**；"引用"是 message 的一个字段（`refs: [{kind, uri}]`），chat 只负责透传给宿主去解析。但这是我的直觉，不一定对。

#### Q2. "应用总线"是新造轮子，还是复用现有？

Orbit 现在已经有几套近似总线的东西：
- `activity:*`（Activity Log NDJSON）
- `events:*`（Phase 3 的 TraceableEvent store + replay）
- `inbox:*`（Inbox item store）
- Zustand 各 store 之间实际上靠 hook 订阅做隐式联动

问题：
- 是把 TraceableEvent 升格成"应用总线"还是并行新造一套？
- 总线是"日志式"（append-only，订阅者事后响应）还是"消息式"（实时派发，有 handler 契约）？
- 跨 main/renderer 的消息怎么走——走现有 IPC，还是总线自己抽象一层？

**我的直觉切法**：**复用 + 正名**。TraceableEvent 已经在记录"发生了什么"，缺的是"让订阅者声明式响应"的上层。可以在 main 进程抽一个 `AppBus`，对内路由 TraceableEvent，对外提供 `subscribe(pattern, handler)` API，renderer 用统一的 `window.orbit.bus.on(...)` 订阅。但具体怎么落地值得讨论。

#### Q3. "解耦到干净的地步"——干净的验收标准是什么？

我见过很多"解耦项目"最后变成另一种耦合（比如事件泛滥 / 命名混乱 / 循环订阅）。必须提前定义**什么叫干净**，否则很难判断何时收工。

候选标准（我建议前期就对齐）：
- **依赖方向**：chat 包对 business 包是 **0 import**（可 lint 强制）
- **事件命名**：强制 `<domain>.<entity>.<action>` 三段式（e.g. `chat.message.sent`，不允许 `chat_msg_sent` / `onChatMsgSent`）
- **消息 schema**：每个事件类型有 Zod schema + version 字段，破坏性变更走版本升级
- **"业务无关"的可测量**：chat 包跑在一个 mock runtime + 零业务订阅者的 storybook 里能完整工作（发消息、接收 agent 消息、展示工具调用）
- **零 leaky abstraction**：chat 代码里 grep 不到 `task`/`inbox`/`proposal`/`vault` 关键词

我担心的反例：`chat.message.sent` 里为了让 Inbox 知道是不是求助，塞了一个 `metadata.kind === 'help_request'` —— 这种"表面上解耦、实际上在 payload 里夹带业务"的模式要提前防范。

---

## 我建议的下一步

你抛的是一块"架构命题大石头"，我想我们先不急着画方案图，而是**按一个自然的思考顺序把每层讨论透**，每层聊清楚了再往下走。我提议的顺序是：

1. **Chat 的能力边界**（Q1）—— chat 包到底管哪些事，不管哪些事
2. **Chat ↔ Runtime 消息协议**（Q1 延伸）—— 协议的 message kind、双向控制面、tool use / thinking / proposal 的处理方式
3. **应用总线的形态**（Q2）—— 复用 TraceableEvent 还是新造，总线契约怎么写
4. **现有三个 chat 场景如何迁移**（Task / Inbox / Planner）—— 以它们作为"业务订阅者"的样本
5. **干净的验收标准 + 迁移路径**（Q3）—— 落到 ADR + plan

每一层我会先给一个有观点的草稿，你修，不满意我改。你认可了才进下一层。

---

## 动手前的两个问题

我需要先把 session 存下来、开始按你的主张推进，但有两点想先和你拍一下：

### Tool Calls:
- **ask_followup_question**({"title":"进入 Chat 统一规划的工作模式","questions":[{"id":"order","prompt":"我提议的\"五层讨论顺序\"（Chat边界 → 协议 → 总线 → 迁移样本 → 验收标准），你觉得合理吗？","options":[{"id":"ok","label":"A. 合理，就按这个顺序走，从第 1 层开始"},{"id":"reorder","label":"B. 合理，但我想先聊第 3 层（应用总线）——因为它是最根本的"},{"id":"samples_first","label":"C. 合理，但我想先聊第 4 层（拿现有三个 chat 场景做解剖样本），有具体案例再抽象"},{"id":"adjust","label":"D. 我有自己的顺序想法（下一条消息告诉你）"}]},{"id":"doc","prompt":"产出形态——这次讨论的沉淀落在哪里？","options":[{"id":"new_plan","label":"A. 新开一份 plan：docs/plans/2026-04-29-chat-runtime-decoupling.md，每层讨论完就追加一章"},{"id":"adr_first","label":"B. 先不写 plan，讨论到第 2 层（协议稳定）后先出一份 ADR（\"Chat-Runtime Protocol 作为一等抽象\"），再写 plan"},{"id":"thinking_trail","label":"C. 用 thinking-trail 的格式沉淀这次对话（conversation.md + key-pivots.md），最后再转 ADR + plan"},{"id":"minimal","label":"D. 先不沉淀，纯对话推进，达成共识后一次性产出文档"}]}],"toolExplanation":"确认工作模式后进入第一层讨论"})

---

## [Tool] 2026-04-27T03:56:47.258Z
{"pending":true,"questions":[{"id":"order","prompt":"我提议的\"五层讨论顺序\"（Chat边界 → 协议 → 总线 → 迁移样本 → 验收标准），你觉得合理吗？","options":[{"id":"ok","label":"A. 合理，就按这个顺序走，从第 1 层开始"},{"id":"reorder","label":"B. 合理，但我想先聊第 3 层（应用总线）——因为它是最根本的"},{"id":"samples_first","label":"C. 合理，但我想先聊第 4 层（拿现有三个 chat 场景做解剖样本），有具体案例再抽象"},{"id":"adjust","label":"D. 我有自己的顺序想法（下一条消息告诉你）"}]},{"id":"doc","prompt":"产出形态——这次讨论的沉淀落在哪里？","options":[{"id":"new_plan","label":"A. 新开一份 plan：docs/plans/2026-04-29-chat-runtime-decoupling.md，每层讨论完就追加一章"},{"id":"adr_first","label":"B. 先不写 plan，讨论到第 2 层（协议稳定）后先出一份 ADR（\"Chat-Runtime Protocol 作为一等抽象\"），再写 plan"},{"id":"thinking_trail","label":"C. 用 thinking-trail 的格式沉淀这次对话（conversation.md + key-pivots.md），最后再转 ADR + plan"},{"id":"minimal","label":"D. 先不沉淀，纯对话推进，达成共识后一次性产出文档"}]}],"title":"进入 Chat 统一规划的工作模式"}

---

## [Assistant] 2026-04-27T03:57:08.538Z
等你拍这两个问题。

与此同时我可以同步做的准备工作（**不影响你现在的回答**，我自己后台把底盘摸清）：深扫 `orchestration/conversation.ts`、`TaskConversationTab.tsx`、`StageView.tsx`、`HelpRequestRenderer.tsx`、`agent/adapter/` 这 5 处代码的真实耦合现状，以便第 4 层讨论迁移样本时有实锤。要不要我现在先去做这个扫描（读代码不改代码）？如果你嫌慢就先回答上面问题，我等你回答再一并行动。

---

## [User] 2026-04-27T04:04:09.580Z
我认为chat ↔ runtime 协议"边界需要先调研下claude，codex 这两个最多用户的runtime内有哪些协议需要被对应，chat不应该是凭空想出的协议，毕竟是针对runtime做的
TraceableEvent 升格为应用总线，这样整个应用的replay就更强大了，更好发现应用的bug
总线是"日志式"还是"消息式"需要讨论下优缺点
究竟怎么解耦才干净，要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观，只有详细分析了所有功能，（包含现在已知要做但还没做的功能，比如sandbox， 阅读器， 阅读订阅， 笔记的各种功能， 全局ai助手，定时任务agent，可以通过telegram等 channel 控制应用，参考openclaw。 任务执行打通全流程从创建到执行，到worktree，到pr，到合入。 sandbox是另一套，又该怎么做）想清楚这些，可以不做，但是就能知道架构应该先打成什么样



---

## [Assistant] 2026-04-27T04:08:04.481Z
收到。你这段话把方向推得更深了——我把它翻译成"这次讨论的真正 scope"确认一下，再给出我的推进计划。

---

## 我重新理解的命题（比上次更完整）

你把"Chat 统一规划"升级成了**一次产品-架构双轨的 Onboard 式重做**：

### 命题的四根支柱

**支柱 1：协议必须从 runtime 反向推导，不能凭空**
- 先彻底调研 Claude Code / Codex 的实际协议（事件、控制面、session、tool use、resume、中断……）
- 凡是两家都有的 → 抽象进统一协议
- 一家有一家没的 → 看是能力声明还是 adapter 兼容
- **chat 协议是"runtime 协议的最大公约数再加上 UI 需求"**，不是拍脑袋设计

**支柱 2：TraceableEvent 升格为应用总线**
- 整个应用的事件流全部走总线
- Replay 能力从"单次 run 回放"升级到"整个应用状态回放"
- 任何 bug 都能通过事件流复现 → 这是 dog-food 阶段的救命能力
- （但"日志式 vs 消息式"的 trade-off 要讨论清楚再定）

**支柱 3：解耦的前提是全局盘点**
> 原话："究竟怎么解耦才干净，要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观"

这是最关键的一点。你在说：**不能局部优化**。必须先画一张图，把现有的 + 未来要做的所有功能都摆上去，然后问"为了让这些功能都能接得进来，骨架应该长什么样"。

这张图至少要包含：
- ✅ 已落地：Task/Project、Inbox、Capture（Feed/Library/Thoughts）、Planner、Auto-runner、Worktree、Activity Log、Event Replay、CLI、Terminal
- 🔜 明确要做：Sandbox ExecutionContext、阅读器、Feed 多来源、Note 功能全套、全局 AI 助手、定时任务 agent、Telegram/外部 channel（参考 openclaw）、任务执行全流程打通（create → execute → worktree → PR → merge）、Thinking Trail 自动化
- 🤔 还在探索：对话沉淀到 project、Orbit 自我进化、Review UI

**支柱 4："可以不做，但必须想清楚"**

这句话是本次讨论的纪律线。**目标不是扩大实施范围，而是把骨架想到位**——即使 sandbox、telegram、阅读器这些本期不做，也要确认现在打的架构能自然装下它们。

---

## 我赞同和担心的地方

### 🟢 完全赞同
- **从 runtime 反推协议** —— 避免"为了抽象而抽象"，业界 chat 标准化基本都是这么做（MCP、LSP、DAP 都是协议驱动）
- **TraceableEvent 升格总线** —— 它已经在记录"发生了什么"，距离"让订阅者响应"只差一层 API。顺势做比新造一套阻力小得多
- **全局功能盘点** —— 这是避免"Phase 5 又发现新耦合"的唯一方法

### 🟡 需要特别小心的地方
- **全局盘点的深度** —— 要足够深到能发现架构压力，但不能深到变成"未来十个功能的详细设计"。我建议每个功能只画"它会和总线/chat/runtime 产生什么交互"，不画内部实现
- **"日志式 vs 消息式"不是二选一** —— 可能是**同一条事件既入日志也进消息总线**，但我们要想清楚订阅者契约（同步 / 异步 / 幂等 / 失败重试），这部分 TraceableEvent 现在**完全没有**
- **openclaw 我不熟**，需要你给点线索或我去搜一下再来讨论。控制应用的外部 channel 是一个对架构压力很大的维度

---

## 我提议的推进顺序（更新版）

基于你的表态，我把之前的五层顺序调整为：

### 阶段 0：功能全景盘点（先做，奠定上帝视角）
- 产出：`plans/2026-04-29-chat-unification/00-feature-landscape.md`
- 内容：所有已做 + 要做的功能一张表，每条含"核心数据""总线上的事件""需要的 chat 能力""需要的 runtime 能力""对解耦的压力测试点"
- **这份文档是后面所有讨论的参照物**

### 阶段 1：Runtime 协议调研（从 claude / codex 反推）
- 产出：`01-runtime-protocol-survey.md`
- 内容：两家的完整协议矩阵（stream-json 的所有 event kind、控制面、session、tool use、resume、中断、cost、error、attachment……）
- 标出"两家都有的 / 只有一家有的 / 都没有但我们想要的"
- 这决定 chat ↔ runtime 协议的骨架

### 阶段 2：应用总线形态决策（日志式 vs 消息式 vs 混合）
- 产出：`02-app-bus-design.md` + ADR 候选
- 关键问题：
  - 事件是不是都强制有 schema？版本化怎么做？
  - 订阅者契约：同步 / 异步 / 能否 ack / 失败怎么办？
  - 跨 main/renderer 的边界在哪（哪些事件可跨、哪些只在 main）？
  - Replay 是"重放事件重建状态"还是"只看历史快照"？
  - 如何防止"事件泛滥"和"隐式耦合"（订阅者命名 / 事件命名纪律）

### 阶段 3：Chat ↔ Runtime 协议定稿
- 产出：`03-chat-runtime-protocol.md` + ADR 候选
- 基于阶段 1 调研 + 阶段 2 总线能力，确定 chat 和 runtime 之间的消息协议
- 明确 chat 的"不知道什么"清单

### 阶段 4：把阶段 0 的功能逐一压测架构
- 产出：`04-architecture-stress-tests.md`
- 拿"sandbox / 阅读器 / Telegram channel / 定时任务 agent / 任务执行全流程"等难点，一个一个走一遍："在我们的新架构上，这个功能怎么接入？卡不卡？"
- **卡就回头改架构**，不卡就通过
- 这是验证骨架是否"够干净"的唯一方法

### 阶段 5：现有代码迁移路径
- 产出：`05-migration-plan.md`
- Task Conversation / Planner Chat / Inbox Help Request / Terminal —— 分别怎么搬到新架构
- 不搬的部分（比如 v1 Planner）明确冻结理由

### 阶段 6：验收标准 + ADR 定稿
- 产出：正式 ADR 几份 + 最终 plan
- 可以 lint 的解耦约束、可以跑的 mock chat 测试、grep 不到的关键词清单

---

## 我准备接下来做的事

按你的"不能只盯着解耦"原则，我认为现在应该**先做阶段 0 的功能盘点**。理由是：

- 阶段 1（runtime 调研）和阶段 2（总线）如果没有全景作参照，很容易做着做着发现某个功能不适配又要回头
- 阶段 0 产出后，我们就有了"架构压力清单"，后面所有讨论都可以拿着这个清单做 sanity check
- 这也是你说的"**可以不做，但要想清楚**"的具体落地方式

阶段 0 我会做：
1. **读全**：扫 `docs/overview.md` + `ROADMAP.md` + `open-questions.md` + 所有 `plans/` 的标题和状态 + `VISION.md`（已读）
2. **盘全**：把已知功能和你今天提到的未做功能列一张表
3. **补缺**：你今天提到的一些功能在现有文档里还没出现（比如 Telegram channel / openclaw 参考 / 定时任务 agent / 任务全流程打通到 PR 合入）——这些我会单独列出来问你

---

## 动手前几个问题要你定

### Tool Calls:
- **ask_followup_question**({"title":"确认推进顺序和几个关键输入","questions":[{"id":"order","prompt":"我提议的六阶段顺序（功能盘点 → Runtime 调研 → 总线 → Chat协议 → 架构压测 → 迁移）和此刻先做阶段 0 的建议，理解得对吗？","options":[{"id":"ok","label":"A. 理解得对，就这么走，先做阶段 0 功能全景盘点"},{"id":"runtime_first","label":"B. 顺序基本对，但我想用 runtime 调研开场（阶段 1 先做），因为它最客观"},{"id":"parallel","label":"C. 阶段 0 和阶段 1 并行做（功能盘点 + runtime 调研同时开干）"},{"id":"adjust","label":"D. 我有其它顺序想法（下一条消息说）"}]},{"id":"openclaw","prompt":"openclaw 的“通过 Telegram 控制应用”这个参照，我怎么获取其架构信息？","options":[{"id":"a","label":"A. 我自己去网上搜 openclaw，你不用管"},{"id":"b","label":"B. 我只需知道“有一个外部 channel 可以双向控制应用\"这个抽象就够干活，具体不用深查"},{"id":"c","label":"C. 你去网上找一下 openclaw（web_search），念对名字或给我正确拼写就行"}]},{"id":"future_features","prompt":"除了你今天提到的（sandbox/阅读器/feed多来源/note/全局AI助手/定时agent/Telegram/任务全流程），还有没有我现有文档没有、你心里却已经在想的功能？","options":[{"id":"none","label":"A. 就这些，别的我现在没想清楚先不拉进来"},{"id":"more","label":"B. 有，我下条消息补充你"},{"id":"rely_on_docs","label":"C. 文档里全记了，你自己扫文档盘点就行"}]},{"id":"session","prompt":"本次讨论的沉淀纠结：","options":[{"id":"a","label":"A. 每个阶段一份文档建在 docs/plans/2026-04-29-chat-unification/ 下，讨论完一阶段出一份"},{"id":"b","label":"B. 合起来写成一份大 plan（分章），避免文件太磎"},{"id":"c","label":"C. 用 thinking-trail 格式先留对话原本（conversation.md），结束后再提炼 ADR + plan"}]}],"toolExplanation":"确认推进顺序、openclaw 处理方式、产物形态"})

---

## [Tool] 2026-04-27T04:08:04.495Z
{"pending":true,"questions":[{"id":"order","prompt":"我提议的六阶段顺序（功能盘点 → Runtime 调研 → 总线 → Chat协议 → 架构压测 → 迁移）和此刻先做阶段 0 的建议，理解得对吗？","options":[{"id":"ok","label":"A. 理解得对，就这么走，先做阶段 0 功能全景盘点"},{"id":"runtime_first","label":"B. 顺序基本对，但我想用 runtime 调研开场（阶段 1 先做），因为它最客观"},{"id":"parallel","label":"C. 阶段 0 和阶段 1 并行做（功能盘点 + runtime 调研同时开干）"},{"id":"adjust","label":"D. 我有其它顺序想法（下一条消息说）"}]},{"id":"openclaw","prompt":"openclaw 的“通过 Telegram 控制应用”这个参照，我怎么获取其架构信息？","options":[{"id":"a","label":"A. 我自己去网上搜 openclaw，你不用管"},{"id":"b","label":"B. 我只需知道“有一个外部 channel 可以双向控制应用\"这个抽象就够干活，具体不用深查"},{"id":"c","label":"C. 你去网上找一下 openclaw（web_search），念对名字或给我正确拼写就行"}]},{"id":"future_features","prompt":"除了你今天提到的（sandbox/阅读器/feed多来源/note/全局AI助手/定时agent/Telegram/任务全流程），还有没有我现有文档没有、你心里却已经在想的功能？","options":[{"id":"none","label":"A. 就这些，别的我现在没想清楚先不拉进来"},{"id":"more","label":"B. 有，我下条消息补充你"},{"id":"rely_on_docs","label":"C. 文档里全记了，你自己扫文档盘点就行"}]},{"id":"session","prompt":"本次讨论的沉淀纠结：","options":[{"id":"a","label":"A. 每个阶段一份文档建在 docs/plans/2026-04-29-chat-unification/ 下，讨论完一阶段出一份"},{"id":"b","label":"B. 合起来写成一份大 plan（分章），避免文件太磎"},{"id":"c","label":"C. 用 thinking-trail 格式先留对话原本（conversation.md），结束后再提炼 ADR + plan"}]}],"title":"确认推进顺序和几个关键输入"}

---

## [Assistant] 2026-04-27T04:10:30.061Z
等你拍板。

---

**在你回答前，我想先把自己的倾向说出来免得你觉得我在甩锅**：

- **Q1 顺序**：我倾向 **C（并行）**。阶段 0 功能盘点我可以快速扫文档 + 你补口述就出来，阶段 1 runtime 调研是读代码/读官方文档的工作——两件事互不阻塞，并行最省时间
- **Q2 openclaw**：我倾向 **C（我帮你搜）**。你说的名字我不确定是 OpenClaude / OpenClaw / 某个 GitHub 项目，我搜一下确认一下比你记错名字后我们按错误方向设计划算
- **Q3 未补充功能**：没倾向，你说啥算啥
- **Q4 沉淀形态**：我倾向 **C（thinking-trail 先行）**。理由：
  - 这次讨论本质是一次"方向确立"，类似 2026-04-26 那次 v2 方向讨论，完全符合 thinking-trail 的使用场景
  - 原话留下来，未来接手的人（包括你自己三个月后）能看到"为什么这样想"，不只是"最终决定"
  - 讨论中反复会变，直接写 plan 会写废好几稿；thinking-trail 是"思考过程"，写 ADR/plan 是"共识结晶"
  - 你们项目已经有 `docs/thinking-trail/2026-04-26-v2-direction/` 这个先例，格式直接复用

所以我的整体建议是：**C+C+?+C**。你定一下，我就开工。

---

## [User] 2026-04-27T04:12:13.632Z
六阶段顺序没问题， openclaw是这个: https://github.com/openclaw/openclaw 

---

## [Assistant] 2026-04-27T04:12:21.840Z
收到。顺序定了六阶段，openclaw 我去扒一下。并行开干：

### Tool Calls:
- **todo_write**({"merge":false,"todos":[{"id":"s0","status":"in_progress","content":"阶段 0：全功能盘点（已有+未来）"},{"id":"s1","status":"pending","content":"阶段 1：Claude/Codex Runtime 协议调研"},{"id":"s2","status":"pending","content":"阶段 2：应用总线形态决策（TraceableEvent 升格）"},{"id":"s3","status":"pending","content":"阶段 3：Chat ↔ Runtime 协议定稿"},{"id":"s4","status":"pending","content":"阶段 4：用未来功能压测架构"},{"id":"s5","status":"pending","content":"阶段 5：现有代码迁移路径"},{"id":"s6","status":"pending","content":"阶段 6：验收标准 + ADR/plan 定稿"}],"toolExplanation":"建立六阶段任务列表"})

---

## [Tool] 2026-04-27T04:12:21.852Z
{"todos":[{"id":"s0","status":"in_progress","content":"阶段 0：全功能盘点（已有+未来）"},{"id":"s1","status":"pending","content":"阶段 1：Claude/Codex Runtime 协议调研"},{"id":"s2","status":"pending","content":"阶段 2：应用总线形态决策（TraceableEvent 升格）"},{"id":"s3","status":"pending","content":"阶段 3：Chat ↔ Runtime 协议定稿"},{"id":"s4","status":"pending","content":"阶段 4：用未来功能压测架构"},{"id":"s5","status":"pending","content":"阶段 5：现有代码迁移路径"},{"id":"s6","status":"pending","content":"阶段 6：验收标准 + ADR/plan 定稿"}],"message":"Created new todo list with 7 items"}

---

## [Assistant] 2026-04-27T04:12:33.962Z
按你选的 thinking-trail 格式先起骨架。我需要先:
1. 建 session 和 thinking-trail 目录
2. 开始做阶段 0（扫文档全面盘点） + 并行把 openclaw 扒一下
3. Sandbox / Telegram / Ask-anywhere 之类未来功能的细节我需要补问你

并行动作：

### Tool Calls:
- **web_fetch**({"url":"https://github.com/openclaw/openclaw","toolExplanation":"获取 openclaw 项目架构信息"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-011-runtime-abstraction-through-capabilities.md","toolExplanation":"读取 runtime 抽象 ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-013-unified-event-replay-infrastructure.md","toolExplanation":"读取 event replay ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-009-activity-log-infrastructure.md","toolExplanation":"读取 activity log ADR"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/decisions/ADR-008-ai-native-cli-first.md","toolExplanation":"读取 CLI-first ADR"})
- **list_files**({"target_directory":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main","depth":2,"offset":0,"limit":200,"toolExplanation":"看 main 进程模块清单了解现有能力"})

---

## [Tool] 2026-04-27T04:12:35.436Z
<tool_output_filed>
Tool: web_fetch | 20024 chars, 255 lines
File: /Users/ryanbzhou/.box/ctx/bf5891dd-d541-4e41-a43c-68a06b30bba8/tool-outputs/b5iXNDvt.txt

--- Preview (first 30 lines / 800 chars) ---
# GitHub - openclaw/openclaw: Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞

![OpenClaw](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.svg)

**EXFOLIATE! EXFOLIATE!**

[![CI status](https://camo.githubusercontent.com/1ddb1ef286e297deafb2a4372b7c65516ae65368fd22878a7454dabc2fc4738b/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f616374696f6e732f776f726b666c6f772f7374617475732f6f70656e636c61772f6f70656e636c61772f63692e796d6c3f6272616e63683d6d61696e267374796c653d666f722d7468652d6261646765)](https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main) [![GitHub release](https://camo.githubusercontent.com/9fcbb4c3c5cf1f8657a73e45b9c76a0074008d658c07f5558e474191c7aef8fb/68747470733a2f2f696d672e7368696...

--- End preview (last 10 lines / 200 chars) ---
....com/0xRaini) [![robbyczgw-cla](https://avatars.githubusercontent.com/u/239660374?v=4&s=48)](https://github.com/robbyczgw-cla) [![joelnishanth](https://avatars.githubuserconten

[Content truncated...]

Use search_content to find specific info, or read_file with offset/limit to read sections.
</tool_output_filed>

---

## [Tool] 2026-04-27T04:12:35.436Z
     1|---
     2|id: ADR-011
     3|title: Runtime 抽象贯通 — 通用 Agent Event 协议
     4|status: accepted
     5|date: 2026-04-27
     6|related: ADR-008
     7|implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
     8|---
     9|
    10|# ADR-011: Runtime 抽象贯通 — 通用 Agent Event 协议
    11|
    12|## Context
    13|
    14|v2 的 ADR-008 确立了 CLI-first 原则——Orbit 对外暴露给 agent 的接口是 `orbit` CLI。但 ADR-008 **没讲** Orbit **对内调用** agent 的接口。
    15|
    16|v2 实施后，`LocalRuntimeManager` 已有 `RuntimeDescriptor` + `capabilities` 模型，支持 claude/codex/gemini/opencode 四种 runtime 的发现和注册。每个 runtime 声明了 `supportsResume`、`supportsHooks`、`supportsBackgroundRuns`、`maxConcurrent` 等能力。
    17|
    18|但下游模块（runner / dispatch / conversation / UI）**没有基于这个抽象编程**，硬编码了 Claude 的行为：
    19|- `runner.ts` 直接解析 Claude 的 stream-json 格式
    20|- `dispatch.ts` 使用 Claude 特定的命令行参数
    21|- `conversation.ts` 的 `summarizeEvents` 只提取文本，丢弃了 tool_use/tool_result/thinking 事件
    22|- UI 渲染层只认识"对话消息"，不认识执行事件
    23|
    24|这导致：
    25|1. 接入 Codex / Copilot 需要在每个下游模块加分支判断
    26|2. agent 执行对用户是黑盒——看不到工具调用、思考过程
    27|3. 不同 runtime 的行为差异无法在统一接口上处理
    28|
    29|## Decision
    30|
    31|**把现有 `RuntimeDescriptor` + `capabilities` 贯通到执行链路每一层**，而非新建抽象层：
    32|
    33|1. 定义**通用 Agent Event 协议**——统一事件类型（thinking / tool_use / tool_result / message / cost / done / error / heartbeat）
    34|2. 每个 runtime 提供 **RuntimeAdapter**，负责把 vendor 原生事件翻译成通用协议
    35|3. 前端（renderer + Activity tab）只认通用协议，不知道底下是哪个 vendor
    36|4. Resume / Stream / Fallback 都在通用接口上定义
    37|5. 每个 RuntimeAdapter 声明自己的可重试和不可重试错误列表
    38|
    39|## Rationale
    40|
    41|**为什么是"贯通现有抽象"而不是"新建一层"**：
    42|
    43|- `LocalRuntimeManager` 已有完整的发现-注册-元数据模型，新建一层会产生两套平行的 runtime 概念
    44|- 需要改的是"让下游模块读 capabilities 而不是硬编码"，这是贯通而非新增
    45|- 代码量预计比新建少一半
    46|
    47|**为什么 event 协议要在 Orbit 层定义而不是直接转发 vendor 原生格式**：
    48|
    49|- 不同 vendor 的事件格式完全不同（Claude stream-json / Codex SSE / Copilot WebSocket）
    50|- 前端如果要处理所有格式，复杂度爆炸
    51|- 统一协议还能加 `trace_id` / `span_id`，为全链路事件回放打基础（见 ADR-013）
    52|
    53|**通用事件类型的选择**：
    54|
    55|| 事件类型 | 语义 | Claude 映射 | Codex 映射 |
    56||---------|------|------------|------------|
    57|| thinking | 内部推理 | thinking block | N/A（Codex 不暴露 thinking） |
    58|| tool_use | 调用工具 | tool_use event | function_call |
    59|| tool_result | 工具返回 | tool_result event | function_result |
    60|| message | 文本输出 | text delta | text delta |
    61|| cost | 费用 | cost event | billing callback |
    62|| done | 完成 | result event (exit 0) | stream end |
    63|| error | 错误 | error event / exit ≠ 0 | error event |
    64|| heartbeat | 心跳 | 周期性注入 | 周期性注入 |
    65|
    66|heartbeat 由 Orbit adapter 层注入（vendor 不一定提供），用于卡死检测。
    67|
    68|## Consequences
    69|
    70|**正面**：
    71|- 前端代码可以只写一遍，覆盖所有 runtime
    72|- agent 执行从黑盒变成可观察的事件流
    73|- 为 ADR-012（resume）、ADR-013（事件回放）、ADR-014（fallback）提供统一基础
    74|- 新 runtime 接入只需写一个 adapter
    75|
    76|**负面/trade-off**：
    77|- 不同 vendor 的事件粒度不同——Codex 不暴露 thinking，通用协议中这个字段为空
    78|- adapter 翻译层可能丢失 vendor 特有信息——raw 事件录像可以弥补
    79|- 通用协议设计需要前瞻性，改动成本较高——但 v2 的实践表明 schema 扩展 + 兼容性处理是可行的
    80|
    81|**回退计划**：
    82|如果通用协议无法覆盖某个 vendor 的关键特性，允许在 AgentEvent 中加 `vendor_specific: Record<string, unknown>` 透传字段，前端在需要时降级到 vendor 特定渲染。
    83|
    84|## Implementation
    85|
    86|- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
    87|- 子 plan：`plans/2026-04-27-runtime-adapter-layer.md`（待写）

(End of file. Total 87 lines.)

---

## [Tool] 2026-04-27T04:12:35.437Z
     1|---
     2|id: ADR-013
     3|title: 统一事件回放基础设施
     4|status: accepted
     5|date: 2026-04-27
     6|related: ADR-009, ADR-011
     7|implementation: plans/2026-04-27-phase-3-agent-observability-resilience.md
     8|---
     9|
    10|# ADR-013: 统一事件回放基础设施
    11|
    12|## Context
    13|
    14|Orbit 当前有三套独立的事件系统：
    15|
    16|1. **Activity Log**（`.orbit/activity/*.ndjson`，ADR-009）—— 业务事件（task lifecycle / project lifecycle / inbox / capture / agent run）
    17|2. **Agent Events**（runner ring buffer）—— agent 执行事件（stream-json 解析产物）
    18|3. **Inbox Events** —— Inbox 消息事件
    19|
    20|三者格式各异、存储独立、无法跨层关联。当一个问题发生时（比如用户点了审批按钮但 agent 没收到通知）：
    21|- Activity Log 只记录"用户批准了 proposal X"
    22|- Agent Events 只记录"agent 开始了 run Y"
    23|- Inbox Events 只记录"消息 Z 从 pending 变成 resolved"
    24|- **没有办法看到 X → Y → Z 这条因果链**
    25|
    26|这对于一个功能越来越多、链路越来越长的应用来说是致命的调试障碍。尤其是 Phase 3 要加入 Runtime adapter、fallback、双向 stream 等新链路，不建立统一的事件追踪，调试成本会指数增长。
    27|
    28|## Decision
    29|
    30|**建立全链路统一事件回放基础设施**：
    31|
    32|1. **统一事件 Schema**：所有事件源写入同一 NDJSON 格式，每条事件包含 `trace_id` / `span_id` / `parent_span_id` 用于跨层关联
    33|2. **三层事件录像**：agent 执行链路记录三份平行 NDJSON（raw-vendor / abstract / ui-render），精确定位问题层
    34|3. **统一事件总线**：Activity Log / Agent Events / Inbox Events / IPC Events 全部接入同一条总线
    35|4. **Developer Console**：新增全局页面，展示完整事件流时间轴，支持按 trace_id / 事件类型 / 来源过滤，支持 Playback mode 回放历史
    36|5. **Golden Files 回归基线**：常见场景的"好状态"事件快照，每次代码变更前自动比对
    37|
    38|Phase 3 做完整版，不做最小版。理由：AI 实施可以处理这个量级的工作，且统一基础设施越早建立，后续所有功能（Phase 4 的 Sandbox / Thinking Trail / 对话沉淀等）都能受益。
    39|
    40|## Rationale
    41|
    42|**为什么不只做 agent 子链路、要做全链路**：
    43|
    44|- 很多 bug 跨越多个子系统（用户操作 → IPC → main 处理 → agent 启动 → 文件变更 → Activity Log → Inbox）
    45|- 子链路事件回放只能排查 agent 内部问题，**跨子系统的因果链是更常见的排查场景**
    46|- 统一 schema + trace_id 是一次性工程，后续接新事件源的边际成本很低
    47|
    48|**为什么三层录像**：
    49|
    50|出问题时的排查路径：
    51|- raw 缺 tool_use → vendor 根本没发（不是 Orbit 的 bug）
    52|- raw 有但 abstract 没有 → adapter 翻译丢了
    53|- abstract 有但 ui 没有 → 渲染链路问题
    54|
    55|三层录像把"问题在哪一层"的定位从"猜"变成"看"。
    56|
    57|**为什么 Developer Console 而不是命令行工具**：
    58|
    59|- 时间轴可视化对人类更直观
    60|- 事件流量大时命令行不可读
    61|- Playback mode 需要 UI 交互
    62|- 但**同时提供 CLI 入口**（`orbit dev:events` 命令），让 agent 也能查
    63|
    64|## Consequences
    65|
    66|**正面**：
    67|- 任何链路的 bug 都可以通过 trace_id 一路追到底
    68|- 新功能接入只需 emit 事件到统一总线，自动获得回放和调试能力
    69|- Golden Files 让回归测试从"跑测试看 pass/fail"变成"比对事件序列看行为差异"
    70|- Developer Console 成为 Orbit 的"X-Ray"——开发者（包括 AI 开发者）的第一排查入口
    71|
    72|**负面/trade-off**：
    73|- 全链路事件量很大，需要考虑存储和性能（建议 NDJSON 按天轮转 + 可配置保留天数）
    74|- trace_id 注入需要改动多处代码（IPC 层、event emitter、store 层）
    75|- Developer Console 是新页面，有 UI 开发工作量
    76|
    77|**回退计划**：
    78|如果事件量影响性能，可以加采样率控制（production mode 只录 10%，debug mode 全录）。Developer Console 可以先不做 Playback mode，只做实时流 + 过滤。
    79|
    80|## Implementation
    81|
    82|- 总纲：`plans/2026-04-27-phase-3-agent-observability-resilience.md`
    83|- 子 plan：`plans/2026-04-27-event-replay-infrastructure.md`（待写）

(End of file. Total 83 lines.)

---

## [Tool] 2026-04-27T04:12:35.437Z
     1|---
     2|id: ADR-009
     3|title: Activity Log — 系统级用户行为留痕
     4|status: accepted
     5|date: 2026-04-26
     6|related: ADR-004, ADR-006, ADR-010
     7|implementation: plans/2026-04-26-activity-log-infrastructure.md
     8|---
     9|
    10|## Context
    11|
    12|v1 Orbit 里已有一些"留痕"机制，但是**碎片化**的：
    13|
    14|- `<vault>/.orbit/logs/git.log` —— 只记 git 操作
    15|- `<vault>/.orbit/cost/YYYY-MM.json` —— 只记 agent cost
    16|- `02_Areas/Journal/YYYY-MM-DD.md` —— LLM 生成的每日总结
    17|- Task frontmatter 有 `created` / `updated` —— 只是字段，不是事件流
    18|
    19|**缺失的是"统一的用户行为事件流"**——用户/agent 做的每一件有意义的事都应该有一条独立事件记录。
    20|
    21|v2 对话中用户明确了这个需求：
    22|
    23|> "现在有设计一个操作记录的功能，这个操作记录实际上我是希望能够作为用户每天的留痕，也就是我其实希望有一个 review 页面，能看到每天用户做的那些事儿。"
    24|>
    25|> "后面做阅读和笔记的时候，也需要做操作记录，比如用户新增了什么订阅源，用户增加了一个 library 的新文档，用户新增了一条笔记，都需要记录。"
    26|
    27|这不只是"review 页面的数据源"，更深层的是**BASB 的 Progressive Summarization 依赖可追溯的行为流**——没有留痕，"这一周做了什么"就只能靠记忆；有留痕，可以 AI 辅助回顾 + 跨时间搜索 + 提炼模式。
    28|
    29|## Decision
    30|
    31|### 1. 引入 Activity Log 基础设施
    32|
    33|**所有"有意义的状态改变"都产生一条 Activity Event，统一写入文件流。**
    34|
    35|### 2. 存储
    36|
    37|```
    38|<vault>/.orbit/activity/
    39|├── 2026-04-26.ndjson       # 按日分片
    40|├── 2026-04-27.ndjson
    41|├── ...
    42|└── schema.json             # 事件 schema 版本
    43|```
    44|
    45|NDJSON（每行一个 JSON 事件）便于追加写 + 流式读取。
    46|
    47|### 3. 事件 schema
    48|
    49|```typescript
    50|interface ActivityEvent {
    51|  id: string                    // uuid
    52|  at: string                    // ISO timestamp
    53|  actor: 'user' | 'agent'
    54|  actor_id?: string             // agent 时填 run_id
    55|
    56|  action: string                // 动作类型（见下）
    57|
    58|  context: {
    59|    project_uid?: string
    60|    task_uid?: string
    61|    run_id?: string
    62|    area_uid?: string
    63|    resource_uid?: string
    64|    inbox_item_id?: string
    65|    proposal_id?: string
    66|    // ...
    67|  }
    68|
    69|  payload?: unknown             // 动作相关附加数据
    70|
    71|  summary: string               // 人类可读摘要（Review 页面展示）
    72|}
    73|```
    74|
    75|### 4. 动作类别（v2 首期）
    76|
    77|| 类别 | Actions |
    78||------|---------|
    79|| **Task lifecycle** | `task.created` / `task.status_changed` / `task.deleted` / `task.approved` / `task.dependency_changed` |
    80|| **Project lifecycle** | `project.created` / `project.archived` |
    81|| **Inbox** | `inbox.message_resolved` / `inbox.message_dismissed` / `inbox.capture_saved` / `inbox.capture_processed` |
    82|| **Capture** | `feed.subscription_added` / `feed.subscription_removed` / `library.article_saved` / `library.article_read` / `library.article_promoted` / `thought.created` |
    83|| **Agent execution** | `agent.run_started` / `agent.run_completed` / `agent.run_failed` / `agent.proposal_submitted` / `agent.proposal_approved` / `agent.merge_approved` |
    84|| **Planner** | `planner.proposal_published` / `planner.proposal_revised` |
    85|| **Settings** | `settings.changed` |
    86|
    87|### 5. 统一 emitter 接口
    88|
    89|```typescript
    90|// src/main/activity/emitter.ts
    91|export function emitActivity(event: ActivityEventInput): void
    92|```
    93|
    94|所有产生状态改变的模块（task store、inbox store、capture store、agent runner、planner 等）统一调用此接口。
    95|
    96|### 6. 本期先做基础设施，UI 下期
    97|
    98|- 本期落地：schema / emitter / 存储 / 各模块接入
    99|- 本期**不**做 Review 页面 UI
   100|- 但本期所有事件已经记录——等 UI 上线时有完整数据可回放
   101|
   102|### 7. Daily Review 未来以 Activity Log 为输入源
   103|
   104|v1 Daily Review (Journal) 主要基于 task 状态和 git 活动。v2 后续迭代时改为以 Activity Log 为主要输入，生成质量会显著提升。
   105|
   106|## Rationale
   107|
   108|**为什么要统一事件流而不是依赖各模块自己的日志**：
   109|
   110|- 现有碎片化日志（git.log / cost/ / journal/）**没法做跨维度查询**（"今天做了什么" 要看多个文件）
   111|- 未来 Review 页面、Orbit 自我进化、Thinking Trail 都需要统一事件源
   112|- 早期建立基础设施，后续新能力接入零成本
   113|
   114|**为什么用 NDJSON 按日分片**：
   115|
   116|- 追加写友好（现代存储核心模式）
   117|- 按日分片便于 GC 和检索（不需要整个文件加载）
   118|- 纯文本，和 Orbit 的 "plain format" 哲学一致
   119|- 手动可读，方便调试
   120|
   121|**为什么区分 actor=user / agent**：
   122|
   123|- 事后需要分析"哪些事是人做的、哪些是 agent 做的"
   124|- 配合 `actor_id`（agent run_id）可以追溯到具体的执行实例
   125|
   126|**为什么 context 是 flat object 而不是嵌套**：
   127|
   128|- 便于查询和索引（未来可能引入 sqlite 索引）
   129|- 避免 schema 演化中嵌套结构的破坏性变更
   130|- 需要哪个 context 字段填哪个，字段名固定
   131|
   132|**替代方案**：
   133|
   134|- **只做 SQLite 数据库**：查询性能好但违背"plain format"，增加依赖
   135|- **只在 Daily Review 时才统计**：会丢失细粒度事件，且无法回放
   136|- **沿用现有碎片日志**：跨维度查询不可行
   137|
   138|## Consequences
   139|
   140|**正面**：
   141|- 所有系统级行为有完整留痕
   142|- Review 页面（下期）实现时数据已就绪
   143|- 未来 Thinking Trail / 自我进化的数据基础就位
   144|- Daily Review 质量可显著提升
   145|
   146|**负面 / 待处理**：
   147|- 所有产生状态改变的模块都要改造成调用 `emitActivity()`（改动面大）
   148|- 对磁盘写入增加（但 NDJSON 很轻，每条事件 < 1KB）
   149|- 本期不做 UI——意味着用户暂时看不到价值，但数据在积累
   150|
   151|### 隐私与安全
   152|
   153|- Activity Log 存在用户 vault 内（本地），不外传
   154|- 不记录敏感 payload（比如 agent 的完整产出、用户输入的长文本）——只记摘要 + 引用（`task_uid`、`proposal_id`）
   155|
   156|## Implementation
   157|
   158|见 [`plans/2026-04-26-activity-log-infrastructure.md`](../plans/2026-04-26-activity-log-infrastructure.md)。

(End of file. Total 158 lines.)

---

## [Tool] 2026-04-27T04:12:35.438Z
     1|---
     2|id: ADR-008
     3|title: AI-Native 原则与 CLI-first 迁移（废弃 MCP）
     4|status: accepted
     5|date: 2026-04-26
     6|supersedes: plans/2026-04-22-orbit-agent-context-architecture.md, plans/2026-04-22-orbit-agent-context-scheme-a.md, plans/2026-04-22-orbit-agent-context-scheme-c.md, plans/2026-04-22-orbit-agent-context-scheme-d.md
     7|implementation: plans/2026-04-26-cli-migration.md
     8|---
     9|
    10|## Context
    11|
    12|v1 Orbit 的 agent 能力通过 MCP Server 暴露：`src/mcp/server.ts` 注册 7 个工具（search_vault / get_file / create_task / update_task / search_memories / save_memory / query_project_graph），agent 启动时 MCP 客户端连接并读取工具清单。
    13|
    14|v2 对话中识别出两个更根本的问题：
    15|
    16|### 1. AI-Native 原则
    17|
    18|用户明确提出：
    19|
    20|> "这个应用里面尽量所有的能力都可以让 AI 去做，这样子才是一个 AI native 的应用。"
    21|
    22|具体含义：**用户能做的（新增订阅源、保存文章、归档项目、移动任务状态），AI 都应该能做**。这意味着现有的 7 个 MCP 工具远远不够——随着 Inbox / Capture / Activity Log 等 v2 能力加入，能力清单要膨胀到 30+。
    23|
    24|### 2. MCP 的 Token 开销
    25|
    26|30+ 个 MCP 工具 × 每个 150-300 tokens 的工具定义 = **~6000 tokens 的永久 context 占用**。这是每次 agent 对话都要消耗的固定开销。
    27|
    28|### 3. 用户对 MCP/CLI 的纯技术视角澄清
    29|
    30|> "MCP 和 CLI 实际上都是针对 Agent 来说的，不太需要考虑用户去调用的情况，因为用户不需要了解这一层认知，他只和 AI 聊天。所以，你的取舍应该只考虑 Agent。"
    31|
    32|这排除了"CLI 让用户也能用"这种软性价值，取舍纯粹基于 agent 的表现：
    33|
    34|- **MCP 的真实优势**：schema 强约束（参数错误率低）+ 结构化返回
    35|- **CLI 的真实优势**：token 开销小 + 可按需发现（`orbit --help`）+ 可组合 + 单一业务入口
    36|
    37|用户最终拍板：
    38|
    39|> "完全废弃，能力全部迁移到 CLI。后续观察一下 Agent 对任务执行的准确度，来考虑要不要把 MCP 接回来。"
    40|
    41|## Decision
    42|
    43|### 1. AI-Native 原则确立为元原则
    44|
    45|**用户能做的，AI 都能做；AI 能做的，都有清晰的能力接口。**
    46|
    47|推论：
    48|- 所有用户动作都应有对应的 IPC handler + CLI 命令
    49|- 所有 CLI 命令都应该对等映射到 UI 里的某个操作（或者低频动作不出现在 UI，纯 AI 操作）
    50|- 破坏性 / 扩大范围动作走 approval flow（见 ADR-006），不依赖具体接口（CLI 或 UI 都 OK）
    51|
    52|### 2. 废弃 MCP，转向 CLI-first
    53|
    54|**所有 agent 能力通过 `orbit` CLI 暴露**。MCP Server (`src/mcp/`) 在本期废弃。
    55|
    56|架构：
    57|
    58|```
    59|┌─────────────┐
    60|│ main process│
    61|│ IPC handlers│ ← UI (IPC)
    62|└──────┬──────┘
    63|       │
    64|       └─── orbit CLI ← Agent (CLI + stdin pipe events)
    65|```
    66|
    67|- CLI 是薄层，通过本地 IPC 调用 main process 的同一套 handler
    68|- 不单独为 agent 写业务逻辑——和 UI 共享
    69|
    70|### 3. CLI 设计规范
    71|
    72|- **所有命令支持 `--json`**：agent 消费结构化返回
    73|- **所有命令支持 `--help`**：agent 按需发现能力
    74|- **长内容通过 stdin / `--file`**：规避 shell quoting 问题
    75|  - 不推荐：`orbit thought create --content "带引号的\"内容\""`
    76|  - 推荐：`echo "..." | orbit thought create` 或 `orbit thought create --file /tmp/x.md`
    77|- **统一退出码**：0=成功 / 1=业务错误 / 2=参数错误
    78|- **命令结构**：`orbit <domain> <action> [args]`（如 `orbit task update`）
    79|
    80|### 4. 事件推送复用 stdin pipe
    81|
    82|Agent 需要接收 Orbit 主动推送的事件（依赖满足、审批通过）时，复用现有 hydration 机制（`parseHydrationLine`），通过向 agent stdin 发送事件行实现。不需要 MCP 的 notification 能力。
    83|
    84|### 5. MCP 废弃策略
    85|
    86|- `src/mcp/` 标记为废弃，源码保留在 git history
    87|- 当前 MCP server 的启动流程（`out/mcp/server.cjs` 生成、项目 `.mcp.json` 注入）在实施 CLI 后移除
    88|- 现有 7 个 MCP 工具全部改为 CLI 命令（对应关系见实施方案）
    89|
    90|### 6. 观察期策略
    91|
    92|- 上线后监控 agent 对 CLI 的调用准确度（通过 Activity Log + 错误日志）
    93|- 若错误率过高（阈值待定），重新引入 MCP 作为高准确度场景的补充
    94|- MCP 代码留在 git history，随时可复活
    95|
    96|## Rationale
    97|
    98|**为什么纯 CLI 而不是混合**：
    99|
   100|- 混合方案需要为每个能力做"走 CLI 还是走 MCP"的决策——增加设计复杂度
   101|- 两套接入通道维护成本翻倍
   102|- Agent 的能力心智要理解两种不同交互风格
   103|
   104|**MCP 的 schema 强约束风险通过 CLI 规范缓解**：
   105|- 长内容走 stdin / `--file` → 避免 quoting 错误
   106|- `--json` 输出 → 返回结构化数据
   107|- `--help` 自文档化 → 参数错误时 LLM 能自主修正
   108|
   109|**Orbit 的 agent 是 Claude Code CLI，它是 shell-native 的**：
   110|- Anthropic 对 Claude 的 shell 命令生成已经做了优化
   111|- CLI 错误率并不会显著高于 MCP
   112|
   113|**替代方案**：
   114|
   115|- **继续用 MCP + 加载时裁剪工具清单**：MCP 协议不支持按 agent 角色动态裁剪工具；需要在 server 层 hack；复杂度高。
   116|- **MCP + CLI 混合**：增加设计决策摩擦；没必要（见上）。
   117|- **完全不暴露能力给 agent，只靠 prompt**：违背 AI-Native 原则；agent 无法实际操作系统。
   118|
   119|## Consequences
   120|
   121|**正面**：
   122|- Agent context 占用大幅降低（~6000 → ~200 tokens）
   123|- Orbit 只维护一条业务接入通道
   124|- Agent Context System（原 scheme A/C/D 系列 plan）大幅简化——不需要复杂的 context wrapper，只需要 `PATH` 前置 `<vault>/.orbit/bin`，agent 自己 `orbit --help` 发现能力
   125|- 低频运维动作（清理 Feed 历史、批量改 tag）不用做专门 UI，让 AI 用文件系统能力做
   126|
   127|**负面 / 待处理**：
   128|- Agent 对 CLI 的生成准确度**有不确定性**——需要观察期验证
   129|- 现有 MCP 相关代码（`src/mcp/`、测试、`.mcp.json` 注入、项目创建流程）需要迁移
   130|- CLI 的 `--json` 输出契约需要规范化，避免解析歧义
   131|
   132|### 迁移表
   133|
   134|| v1 MCP 工具 | v2 CLI 命令 | 备注 |
   135||------------|-------------|------|
   136|| `search_vault(query)` | `orbit search <query>` | 纯查询 |
   137|| `get_file(path)` | `orbit cat <path-or-uid>` | 纯读取 |
   138|| `create_task(draft)` | `orbit task propose` | 改为 propose-approve（见 ADR-006） |
   139|| `update_task(uid, patch)` | `orbit task update <uid>` | 直接 CRUD |
   140|| `search_memories(query)` | `orbit memory search <query>` | 纯查询 |
   141|| `save_memory(content)` | `orbit memory save` | 直接写入 |
   142|| `query_project_graph()` | `orbit project graph` | 纯查询 |
   143|
   144|v2 新增的大批命令（inbox / capture / activity / feed / library / thought 等）见实施方案。
   145|
   146|### 被本 ADR 废弃的 plans
   147|
   148|以下 plan 已被本 ADR 取代（标记 superseded 并保留原文供历史参考）：
   149|
   150|- `plans/2026-04-22-orbit-agent-context-architecture.md`
   151|- `plans/2026-04-22-orbit-agent-context-scheme-a.md`
   152|- `plans/2026-04-22-orbit-agent-context-scheme-c.md`
   153|- `plans/2026-04-22-orbit-agent-context-scheme-d.md`
   154|
   155|## Implementation
   156|
   157|见 [`plans/2026-04-26-cli-migration.md`](../plans/2026-04-26-cli-migration.md)。

(End of file. Total 157 lines.)

---

## [Tool] 2026-04-27T04:12:35.438Z
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
- agent/ipc.ts (25.3KB)
- agent/onboarding.ts (1.8KB)
- agent/persona.ts (4.3KB)
- agent/pool.ts (2.3KB)
- agent/reattach.ts (2.0KB)
- agent/ringBuffer.ts (2.1KB)
- agent/runner.ts (26.5KB)
- agent/setup/
- agent/shell/
- agent/terminal_sessions.ts (8.7KB)
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
- capture/ipc.ts (5.4KB)
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
- events/bus.ts (2.0KB)
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
- index.ts (13.1KB)
- index_store.ts (4.8KB)
- migrations/
- migrations/v2_task_authorization.ts (7.2KB)
- migrations.ts (15.9KB)
- orchestration/
- orchestration/conversation.ts (14.6KB)
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
- review/
- review/daily.ts (14.7KB)
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
- uid.ts (1.7KB)
- util/
- util/phase.ts (1.5KB)
- vault.ts (4.1KB)
- vault_config.ts (2.0KB)
- vault_notes.ts (2.3KB)
- vector/
- vector/embed.ts (2.5KB)
- vector/index.ts (5.4KB)
- vector/indexer.ts (6.5KB)
- vision.ts (2.7KB)
- walk.ts (1.6KB)
- watcher.ts (4.6KB)
- wikilink.ts (1.8KB)
- worktree_gc.ts (7.3KB)

---

## [Assistant] 2026-04-27T04:14:20.144Z
openclaw 的完整 README 我已经扒下来了，现在把 README 关键信息和 events/bus.ts 看一下：

### Tool Calls:
- **read_file**({"filePath":"/Users/ryanbzhou/.box/ctx/bf5891dd-d541-4e41-a43c-68a06b30bba8/tool-outputs/b5iXNDvt.txt","toolExplanation":"读取 openclaw README 完整内容"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/events/bus.ts","toolExplanation":"看现有总线实现"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/main/events/store.ts","toolExplanation":"看事件存储实现"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/src/shared/events.ts","toolExplanation":"看 TraceableEvent schema"})

---

## [Tool] 2026-04-27T04:14:20.156Z
     1|# GitHub - openclaw/openclaw: Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞
     2|
     3|![OpenClaw](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.svg)
     4|
     5|**EXFOLIATE! EXFOLIATE!**
     6|
     7|[![CI status](https://camo.githubusercontent.com/1ddb1ef286e297deafb2a4372b7c65516ae65368fd22878a7454dabc2fc4738b/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f616374696f6e732f776f726b666c6f772f7374617475732f6f70656e636c61772f6f70656e636c61772f63692e796d6c3f6272616e63683d6d61696e267374796c653d666f722d7468652d6261646765)](https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main) [![GitHub release](https://camo.githubusercontent.com/9fcbb4c3c5cf1f8657a73e45b9c76a0074008d658c07f5558e474191c7aef8fb/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f762f72656c656173652f6f70656e636c61772f6f70656e636c61773f696e636c7564655f70726572656c6561736573267374796c653d666f722d7468652d6261646765)](https://github.com/openclaw/openclaw/releases) [![Discord](https://camo.githubusercontent.com/1860c01c5ab9a20c37ea5a09fcf7ea1471eb95ed7095bb99d3c5a7331061ccda/68747470733a2f2f696d672e736869656c64732e696f2f646973636f72642f313435363335303036343036353930343836373f6c6162656c3d446973636f7264266c6f676f3d646973636f7264266c6f676f436f6c6f723d776869746526636f6c6f723d353836354632267374796c653d666f722d7468652d6261646765)](https://discord.gg/clawd) [![MIT License](https://camo.githubusercontent.com/608c8dfda488178950ce502d7697514db3a6a712579327ed90b9b594260f6355/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4c6963656e73652d4d49542d626c75652e7376673f7374796c653d666f722d7468652d6261646765)](/openclaw/openclaw/blob/main/LICENSE)
     8|
     9|**OpenClaw** is a *personal AI assistant* you run on your own devices. It answers you on the channels you already use. It can speak and listen on macOS/iOS/Android, and can render a live Canvas you control. The Gateway is just the control plane — the product is the assistant.
    10|
    11|If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.
    12|
    13|Supported channels include: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, Zalo Personal, WeChat, QQ, WebChat.
    14|
    15|[Website](https://openclaw.ai) · [Docs](https://docs.openclaw.ai) · [Vision](/openclaw/openclaw/blob/main/VISION.md) · [DeepWiki](https://deepwiki.com/openclaw/openclaw) · [Getting Started](https://docs.openclaw.ai/start/getting-started) · [Updating](https://docs.openclaw.ai/install/updating) · [Showcase](https://docs.openclaw.ai/start/showcase) · [FAQ](https://docs.openclaw.ai/help/faq) · [Onboarding](https://docs.openclaw.ai/start/wizard) · [Nix](https://github.com/openclaw/nix-openclaw) · [Docker](https://docs.openclaw.ai/install/docker) · [Discord](https://discord.gg/clawd)
    16|
    17|New install? Start here: [Getting started](https://docs.openclaw.ai/start/getting-started)
    18|
    19|Preferred setup: run `openclaw onboard` in your terminal. OpenClaw Onboard guides you step by step through setting up the gateway, workspace, channels, and skills. It is the recommended CLI setup path and works on **macOS, Linux, and Windows (via WSL2; strongly recommended)**. Works with npm, pnpm, or bun.
    20|
    21|## Sponsors
    22|
    23|[](#sponsors)
    24|
    25|**Subscriptions (OAuth):**
    26|
    27|-   **[OpenAI](https://openai.com/)** (ChatGPT/Codex)
    28|
    29|Model note: while many providers and models are supported, prefer a current flagship model from the provider you trust and already use. See [Onboarding](https://docs.openclaw.ai/start/onboarding).
    30|
    31|## Install (recommended)
    32|
    33|[](#install-recommended)
    34|
    35|Runtime: **Node 24 (recommended) or Node 22.14+**.
    36|
    37|npm install -g openclaw@latest
    38|# or: pnpm add -g openclaw@latest
    39|
    40|openclaw onboard --install-daemon
    41|
    42|OpenClaw Onboard installs the Gateway daemon (launchd/systemd user service) so it stays running.
    43|
    44|## Quick start (TL;DR)
    45|
    46|[](#quick-start-tldr)
    47|
    48|Runtime: **Node 24 (recommended) or Node 22.14+**.
    49|
    50|Full beginner guide (auth, pairing, channels): [Getting started](https://docs.openclaw.ai/start/getting-started)
    51|
    52|openclaw onboard --install-daemon
    53|
    54|openclaw gateway --port 18789 --verbose
    55|
    56|# Send a message
    57|openclaw message send --target +1234567890 --message "Hello from OpenClaw"
    58|
    59|# Talk to the assistant (optionally deliver back to any connected channel: WhatsApp/Telegram/Slack/Discord/Google Chat/Signal/iMessage/BlueBubbles/IRC/Microsoft Teams/Matrix/Feishu/LINE/Mattermost/Nextcloud Talk/Nostr/Synology Chat/Tlon/Twitch/Zalo/Zalo Personal/WeChat/QQ/WebChat)
    60|openclaw agent --message "Ship checklist" --thinking high
    61|
    62|Upgrading? [Updating guide](https://docs.openclaw.ai/install/updating) (and run `openclaw doctor`).
    63|
    64|Models config + CLI: [Models](https://docs.openclaw.ai/concepts/models). Auth profile rotation + fallbacks: [Model failover](https://docs.openclaw.ai/concepts/model-failover).
    65|
    66|## Security defaults (DM access)
    67|
    68|[](#security-defaults-dm-access)
    69|
    70|OpenClaw connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.
    71|
    72|Full security guide: [Security](https://docs.openclaw.ai/gateway/security)
    73|
    74|Default behavior on Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack:
    75|
    76|-   **DM pairing** (`dmPolicy="pairing"` / `channels.discord.dmPolicy="pairing"` / `channels.slack.dmPolicy="pairing"`; legacy: `channels.discord.dm.policy`, `channels.slack.dm.policy`): unknown senders receive a short pairing code and the bot does not process their message.
    77|-   Approve with: `openclaw pairing approve <channel> <code>` (then the sender is added to a local allowlist store).
    78|-   Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the channel allowlist (`allowFrom` / `channels.discord.allowFrom` / `channels.slack.allowFrom`; legacy: `channels.discord.dm.allowFrom`, `channels.slack.dm.allowFrom`).
    79|
    80|Run `openclaw doctor` to surface risky/misconfigured DM policies.
    81|
    82|## Highlights
    83|
    84|[](#highlights)
    85|
    86|-   **[Local-first Gateway](https://docs.openclaw.ai/gateway)** — single control plane for sessions, channels, tools, and events.
    87|-   **[Multi-channel inbox](https://docs.openclaw.ai/channels)** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, BlueBubbles (iMessage), iMessage (legacy), IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, Zalo Personal, WeChat, QQ, WebChat, macOS, iOS/Android.
    88|-   **[Multi-agent routing](https://docs.openclaw.ai/gateway/configuration)** — route inbound channels/accounts/peers to isolated agents (workspaces + per-agent sessions).
    89|-   **[Voice Wake](https://docs.openclaw.ai/nodes/voicewake) + [Talk Mode](https://docs.openclaw.ai/nodes/talk)** — wake words on macOS/iOS and continuous voice on Android (ElevenLabs + system TTS fallback).
    90|-   **[Live Canvas](https://docs.openclaw.ai/platforms/mac/canvas)** — agent-driven visual workspace with [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui).
    91|-   **[First-class tools](https://docs.openclaw.ai/tools)** — browser, canvas, nodes, cron, sessions, and Discord/Slack actions.
    92|-   **[Companion apps](https://docs.openclaw.ai/platforms/macos)** — macOS menu bar app + iOS/Android [nodes](https://docs.openclaw.ai/nodes).
    93|-   **[Onboarding](https://docs.openclaw.ai/start/wizard) + [skills](https://docs.openclaw.ai/tools/skills)** — onboarding-driven setup with bundled/managed/workspace skills.
    94|
    95|## Security model (important)
    96|
    97|[](#security-model-important)
    98|
    99|-   Default: tools run on the host for the `main` session, so the agent has full access when it is just you.
   100|-   Group/channel safety: set `agents.defaults.sandbox.mode: "non-main"` to run non-`main` sessions inside sandboxes. Docker is the default sandbox backend; SSH and OpenShell backends are also available.
   101|-   Typical sandbox default: allow `bash`, `process`, `read`, `write`, `edit`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`; deny `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`.
   102|-   Before exposing anything remotely, read [Security](https://docs.openclaw.ai/gateway/security), [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing), and [Configuration](https://docs.openclaw.ai/gateway/configuration).
   103|
   104|## Operator quick refs
   105|
   106|[](#operator-quick-refs)
   107|
   108|-   Chat commands: `/status`, `/new`, `/reset`, `/compact`, `/think <level>`, `/verbose on|off`, `/trace on|off`, `/usage off|tokens|full`, `/restart`, `/activation mention|always`
   109|-   Session tools: `sessions_list`, `sessions_history`, `sessions_send`
   110|-   Skills registry: [ClawHub](https://clawhub.ai)
   111|-   Architecture overview: [Architecture](https://docs.openclaw.ai/concepts/architecture)
   112|
   113|## Docs by goal
   114|
   115|[](#docs-by-goal)
   116|
   117|-   New here: [Getting started](https://docs.openclaw.ai/start/getting-started), [Onboarding](https://docs.openclaw.ai/start/wizard), [Updating](https://docs.openclaw.ai/install/updating)
   118|-   Channel setup: [Channels index](https://docs.openclaw.ai/channels), [WhatsApp](https://docs.openclaw.ai/channels/whatsapp), [Telegram](https://docs.openclaw.ai/channels/telegram), [Discord](https://docs.openclaw.ai/channels/discord), [Slack](https://docs.openclaw.ai/channels/slack)
   119|-   Apps + nodes: [macOS](https://docs.openclaw.ai/platforms/macos), [iOS](https://docs.openclaw.ai/platforms/ios), [Android](https://docs.openclaw.ai/platforms/android), [Nodes](https://docs.openclaw.ai/nodes)
   120|-   Config + security: [Configuration](https://docs.openclaw.ai/gateway/configuration), [Security](https://docs.openclaw.ai/gateway/security), [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
   121|-   Remote + web: [Gateway](https://docs.openclaw.ai/gateway), [Remote access](https://docs.openclaw.ai/gateway/remote), [Tailscale](https://docs.openclaw.ai/gateway/tailscale), [Web surfaces](https://docs.openclaw.ai/web)
   122|-   Tools + automation: [Tools](https://docs.openclaw.ai/tools), [Skills](https://docs.openclaw.ai/tools/skills), [Cron jobs](https://docs.openclaw.ai/automation/cron-jobs), [Webhooks](https://docs.openclaw.ai/automation/webhook), [Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub)
   123|-   Internals: [Architecture](https://docs.openclaw.ai/concepts/architecture), [Agent](https://docs.openclaw.ai/concepts/agent), [Session model](https://docs.openclaw.ai/concepts/session), [Gateway protocol](https://docs.openclaw.ai/reference/rpc)
   124|-   Troubleshooting: [Channel troubleshooting](https://docs.openclaw.ai/channels/troubleshooting), [Logging](https://docs.openclaw.ai/logging), [Docs home](https://docs.openclaw.ai)
   125|
   126|## Apps (optional)
   127|
   128|[](#apps-optional)
   129|
   130|The Gateway alone delivers a great experience. All apps are optional and add extra features.
   131|
   132|If you plan to build/run companion apps, follow the platform runbooks below.
   133|
   134|### macOS (OpenClaw.app) (optional)
   135|
   136|[](#macos-openclawapp-optional)
   137|
   138|-   Menu bar control for the Gateway and health.
   139|-   Voice Wake + push-to-talk overlay.
   140|-   WebChat + debug tools.
   141|-   Remote gateway control over SSH.
   142|
   143|Note: signed builds required for macOS permissions to stick across rebuilds (see [macOS Permissions](https://docs.openclaw.ai/platforms/mac/permissions)).
   144|
   145|### iOS node (optional)
   146|
   147|[](#ios-node-optional)
   148|
   149|-   Pairs as a node over the Gateway WebSocket (device pairing).
   150|-   Voice trigger forwarding + Canvas surface.
   151|-   Controlled via `openclaw nodes …`.
   152|
   153|Runbook: [iOS connect](https://docs.openclaw.ai/platforms/ios).
   154|
   155|### Android node (optional)
   156|
   157|[](#android-node-optional)
   158|
   159|-   Pairs as a WS node via device pairing (`openclaw devices ...`).
   160|-   Exposes Connect/Chat/Voice tabs plus Canvas, Camera, Screen capture, and Android device command families.
   161|-   Runbook: [Android connect](https://docs.openclaw.ai/platforms/android).
   162|
   163|## From source (development)
   164|
   165|[](#from-source-development)
   166|
   167|Prefer `pnpm` for builds from source. Bun is optional for running TypeScript directly.
   168|
   169|For the dev loop:
   170|
   171|git clone https://github.com/openclaw/openclaw.git
   172|cd openclaw
   173|
   174|pnpm install
   175|
   176|# First run only (or after resetting local OpenClaw config/workspace)
   177|pnpm openclaw setup
   178|
   179|# Optional: prebuild Control UI before first startup
   180|pnpm ui:build
   181|
   182|# Dev loop (auto-reload on source/config changes)
   183|pnpm gateway:watch
   184|
   185|If you need a built `dist/` from the checkout (for Node, packaging, or release validation), run:
   186|
   187|pnpm build
   188|pnpm ui:build
   189|
   190|`pnpm openclaw setup` writes the local config/workspace needed for `pnpm gateway:watch`. It is safe to re-run, but you normally only need it on first setup or after resetting local state. `pnpm gateway:watch` does not rebuild `dist/control-ui`, so rerun `pnpm ui:build` after `ui/` changes or use `pnpm ui:dev` when iterating on the Control UI. If you want this checkout to run onboarding directly, use `pnpm openclaw onboard --install-daemon`.
   191|
   192|Note: `pnpm openclaw ...` runs TypeScript directly (via `tsx`). `pnpm build` produces `dist/` for running via Node / the packaged `openclaw` binary, while `pnpm gateway:watch` rebuilds the runtime on demand during the dev loop.
   193|
   194|## Development channels
   195|
   196|[](#development-channels)
   197|
   198|-   **stable**: tagged releases (`vYYYY.M.D` or `vYYYY.M.D-<patch>`), npm dist-tag `latest`.
   199|-   **beta**: prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta` (macOS app may be missing).
   200|-   **dev**: moving head of `main`, npm dist-tag `dev` (when published).
   201|
   202|Switch channels (git + npm): `openclaw update --channel stable|beta|dev`. Details: [Development channels](https://docs.openclaw.ai/install/development-channels).
   203|
   204|## Agent workspace + skills
   205|
   206|[](#agent-workspace--skills)
   207|
   208|-   Workspace root: `~/.openclaw/workspace` (configurable via `agents.defaults.workspace`).
   209|-   Injected prompt files: `AGENTS.md`, `SOUL.md`, `TOOLS.md`.
   210|-   Skills: `~/.openclaw/workspace/skills/<skill>/SKILL.md`.
   211|
   212|## Configuration
   213|
   214|[](#configuration)
   215|
   216|Minimal `~/.openclaw/openclaw.json` (model + defaults):
   217|
   218|{
   219|  agent: {
   220|    model: "<provider>/<model-id>",
   221|  },
   222|}
   223|
   224|[Full configuration reference (all keys + examples).](https://docs.openclaw.ai/gateway/configuration)
   225|
   226|## Star History
   227|
   228|[](#star-history)
   229|
   230|[![Star History Chart](https://camo.githubusercontent.com/10b2eee0e3170cb0012af3e2ed7165483789fe846be75907fa61fab6aee419d0/68747470733a2f2f6170692e737461722d686973746f72792e636f6d2f7376673f7265706f733d6f70656e636c61772f6f70656e636c617726747970653d64617465266c6567656e643d746f702d6c656674)](https://www.star-history.com/#openclaw/openclaw&type=date&legend=top-left)
   231|
   232|## Molty
   233|
   234|[](#molty)
   235|
   236|OpenClaw was built for **Molty**, a space lobster AI assistant. 🦞 by Peter Steinberger and the community.
   237|
   238|-   [openclaw.ai](https://openclaw.ai)
   239|-   [soul.md](https://soul.md)
   240|-   [steipete.me](https://steipete.me)
   241|-   [@openclaw](https://x.com/openclaw)
   242|
   243|## Community
   244|
   245|[](#community)
   246|
   247|See [CONTRIBUTING.md](/openclaw/openclaw/blob/main/CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs. AI/vibe-coded PRs welcome! 🤖
   248|
   249|Special thanks to [Mario Zechner](https://mariozechner.at/) for his support and for [pi-mono](https://github.com/badlogic/pi-mono). Special thanks to Adam Doppelt for the lobster.bot domain.
   250|
   251|Thanks to all clawtributors:
   252|
   253|[![steipete](https://avatars.githubusercontent.com/u/58493?v=4&s=48)](https://github.com/steipete) [![vincentkoc](https://avatars.githubusercontent.com/u/25068?v=4&s=48)](https://github.com/vincentkoc) [![Takhoffman](https://avatars.githubusercontent.com/u/781889?v=4&s=48)](https://github.com/Takhoffman) [![obviyus](https://avatars.githubusercontent.com/u/22031114?v=4&s=48)](https://github.com/obviyus) [![gumadeiras](https://avatars.githubusercontent.com/u/5599352?v=4&s=48)](https://github.com/gumadeiras) [![Mariano Belinky](https://avatars.githubusercontent.com/u/132747814?v=4&s=48)](https://github.com/mbelinky) [![vignesh07](https://avatars.githubusercontent.com/u/1436853?v=4&s=48)](https://github.com/vignesh07) [![joshavant](https://avatars.githubusercontent.com/u/830519?v=4&s=48)](https://github.com/joshavant) [![scoootscooob](https://avatars.githubusercontent.com/u/167050519?v=4&s=48)](https://github.com/scoootscooob) [![jacobtomlinson](https://avatars.githubusercontent.com/u/1610850?v=4&s=48)](https://github.com/jacobtomlinson) [![shakkernerd](https://avatars.githubusercontent.com/u/165377636?v=4&s=48)](https://github.com/shakkernerd) [![sebslight](https://avatars.githubusercontent.com/u/19554889?v=4&s=48)](https://github.com/sebslight) [![tyler6204](https://avatars.githubusercontent.com/u/64381258?v=4&s=48)](https://github.com/tyler6204) [![ngutman](https://avatars.githubusercontent.com/u/1540134?v=4&s=48)](https://github.com/ngutman) [![thewilloftheshadow](https://avatars.githubusercontent.com/u/35580099?v=4&s=48)](https://github.com/thewilloftheshadow) [![Sid-Qin](https://avatars.githubusercontent.com/u/201593046?v=4&s=48)](https://github.com/Sid-Qin) [![mcaxtr](https://avatars.githubusercontent.com/u/7562095?v=4&s=48)](https://github.com/mcaxtr) [![eleqtrizit](https://avatars.githubusercontent.com/u/31522568?v=4&s=48)](https://github.com/eleqtrizit) [![BunsDev](https://avatars.githubusercontent.com/u/68980965?v=4&s=48)](https://github.com/BunsDev) [![cpoje... (line truncated)
   254|
   255|[Content truncated...]

(End of file. Total 255 lines.)

---

## [Tool] 2026-04-27T04:14:20.157Z
     1|import { EventEmitter } from 'node:events';
     2|import { randomUUID } from 'node:crypto';
     3|import path from 'node:path';
     4|import { ORBIT_DIR } from '@shared/constants';
     5|import type { TraceableEvent, TraceableEventSource } from '@shared/events';
     6|import { TraceableEventStore } from './store';
     7|import { RunRecorder } from './run-recorder';
     8|
     9|export const eventReplayBus = new EventEmitter();
    10|
    11|let store: TraceableEventStore | null = null;
    12|let recorder: RunRecorder | null = null;
    13|
    14|export function configureEventReplay(vaultPath: string | null): void {
    15|  store = vaultPath ? new TraceableEventStore(vaultPath) : null;
    16|  recorder = vaultPath ? new RunRecorder(path.join(vaultPath, ORBIT_DIR, 'events', 'runs')) : null;
    17|}
    18|
    19|export function currentEventReplayStore(): TraceableEventStore | null {
    20|  return store;
    21|}
    22|
    23|export function currentRunRecorder(): RunRecorder | null {
    24|  return recorder;
    25|}
    26|
    27|export function publishTraceableEvent(
    28|  input: Omit<Partial<TraceableEvent>, 'source' | 'type'> & {
    29|    source: TraceableEventSource;
    30|    type: string;
    31|  }
    32|): TraceableEvent {
    33|  const at = input.at ?? new Date().toISOString();
    34|  const traceId = input.traceId ?? input.runId ?? input.taskUid ?? input.taskId ?? `trace-${randomUUID()}`;
    35|  const spanId = input.spanId ?? randomUUID();
    36|  const event: TraceableEvent = {
    37|    id: input.id ?? randomUUID(),
    38|    at,
    39|    source: input.source,
    40|    type: input.type,
    41|    traceId,
    42|    spanId,
    43|    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
    44|    ...(input.runId ? { runId: input.runId } : {}),
    45|    ...(input.taskId ? { taskId: input.taskId } : {}),
    46|    ...(input.taskUid ? { taskUid: input.taskUid } : {}),
    47|    ...(input.summary ? { summary: input.summary } : {}),
    48|    ...(input.payload !== undefined ? { payload: input.payload } : {})
    49|  };
    50|  eventReplayBus.emit('event', event);
    51|  void store?.append(event).catch((error: unknown) => {
    52|    console.error('[events] failed to persist traceable event', {
    53|      error,
    54|      eventId: event.id,
    55|      source: event.source,
    56|      type: event.type
    57|    });
    58|  });
    59|  return event;
    60|}

(End of file. Total 60 lines.)

---

## [Tool] 2026-04-27T04:14:20.157Z
     1|import { promises as fs } from 'node:fs';
     2|import path from 'node:path';
     3|import { ORBIT_DIR } from '@shared/constants';
     4|import type { TraceableEvent, TraceableEventFilter, TraceableEventQueryResult } from '@shared/events';
     5|
     6|export function eventStoreDir(vaultPath: string): string {
     7|  return path.join(vaultPath, ORBIT_DIR, 'events');
     8|}
     9|
    10|export function eventStoreFile(vaultPath: string, dateKey: string): string {
    11|  return path.join(eventStoreDir(vaultPath), `${dateKey}.ndjson`);
    12|}
    13|
    14|export function dateKeyFromEvent(event: Pick<TraceableEvent, 'at'>): string {
    15|  return event.at.slice(0, 10);
    16|}
    17|
    18|export class TraceableEventStore {
    19|  constructor(private readonly vaultPath: string) {}
    20|
    21|  async append(event: TraceableEvent): Promise<void> {
    22|    const filePath = eventStoreFile(this.vaultPath, dateKeyFromEvent(event));
    23|    await fs.mkdir(path.dirname(filePath), { recursive: true });
    24|    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    25|  }
    26|
    27|  async query(filter: TraceableEventFilter = {}): Promise<TraceableEventQueryResult> {
    28|    const dir = eventStoreDir(this.vaultPath);
    29|    let entries: string[] = [];
    30|    try {
    31|      entries = await fs.readdir(dir);
    32|    } catch (error) {
    33|      if (!isNotFoundError(error)) throw error;
    34|      return { events: [], count: 0 };
    35|    }
    36|    const files = entries.filter((entry) => entry.endsWith('.ndjson')).sort().reverse();
    37|    const events: TraceableEvent[] = [];
    38|    for (const file of files) {
    39|      const raw = await fs.readFile(path.join(dir, file), 'utf8');
    40|      for (const line of raw.split('\n')) {
    41|        if (!line.trim()) continue;
    42|        const event = JSON.parse(line) as TraceableEvent;
    43|        if (matchesFilter(event, filter)) events.push(event);
    44|      }
    45|    }
    46|    events.sort((a, b) => b.at.localeCompare(a.at));
    47|    const limit = filter.limit ?? 200;
    48|    return { events: events.slice(0, limit), count: events.length };
    49|  }
    50|
    51|  async gc(maxFiles = 14): Promise<number> {
    52|    const dir = eventStoreDir(this.vaultPath);
    53|    let entries: string[] = [];
    54|    try {
    55|      entries = await fs.readdir(dir);
    56|    } catch (error) {
    57|      if (!isNotFoundError(error)) throw error;
    58|      return 0;
    59|    }
    60|    const files = entries.filter((entry) => entry.endsWith('.ndjson')).sort().reverse();
    61|    const stale = files.slice(maxFiles);
    62|    await Promise.all(stale.map((file) => fs.rm(path.join(dir, file), { force: true })));
    63|    return stale.length;
    64|  }
    65|}
    66|
    67|function isNotFoundError(error: unknown): boolean {
    68|  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
    69|}
    70|
    71|function matchesFilter(event: TraceableEvent, filter: TraceableEventFilter): boolean {
    72|  if (filter.source && event.source !== filter.source) return false;
    73|  if (filter.type && event.type !== filter.type) return false;
    74|  if (filter.traceId && event.traceId !== filter.traceId) return false;
    75|  if (filter.runId && event.runId !== filter.runId) return false;
    76|  if (filter.taskId && event.taskId !== filter.taskId) return false;
    77|  if (filter.taskUid && event.taskUid !== filter.taskUid) return false;
    78|  return true;
    79|}

(End of file. Total 79 lines.)

---

## [Tool] 2026-04-27T04:14:20.158Z
     1|export const TRACEABLE_EVENT_SOURCES = ['activity', 'agent', 'inbox', 'ipc'] as const;
     2|export type TraceableEventSource = (typeof TRACEABLE_EVENT_SOURCES)[number];
     3|
     4|export interface TraceableEvent {
     5|  id: string;
     6|  at: string;
     7|  source: TraceableEventSource;
     8|  type: string;
     9|  traceId: string;
    10|  spanId: string;
    11|  parentSpanId?: string;
    12|  runId?: string;
    13|  taskId?: string;
    14|  taskUid?: string;
    15|  summary?: string;
    16|  payload?: unknown;
    17|}
    18|
    19|export interface TraceableEventFilter {
    20|  source?: TraceableEventSource;
    21|  type?: string;
    22|  traceId?: string;
    23|  runId?: string;
    24|  taskId?: string;
    25|  taskUid?: string;
    26|  limit?: number;
    27|}
    28|
    29|export interface TraceableEventQueryResult {
    30|  events: TraceableEvent[];
    31|  count: number;
    32|}

(End of file. Total 32 lines.)

---

## [Assistant] 2026-04-27T04:15:43.748Z
完整信息已到手。关键观察：

**现有 TraceableEvent 基础设施现状**：
- 已有 `eventReplayBus` EventEmitter + `publishTraceableEvent` + NDJSON 存储
- Source 已枚举成 4 类（activity / agent / inbox / ipc）
- 有 `traceId` / `spanId` / `parentSpanId` 骨架
- 但 **type 是 string**（没有 schema 约束）、**subscribe 是单一 'event' 通道**（没有按 pattern 订阅）、**没有 handler 契约**（只是 EventEmitter，没 ack/retry/order）
- → 升格为应用总线的基础已经铺好 80%，剩下的 20% 是"订阅契约 + schema 纪律 + renderer 接入"

**openclaw 的核心架构参考价值**：
1. **Gateway 作为单一控制面**：sessions / channels / tools / events 统一入口 ← 这就是你说的"应用总线"的物理形态
2. **Channel 抽象**：WhatsApp/Telegram/Slack/Discord/iMessage/macOS/iOS/Android 全部是 channel，agent 逻辑和 channel 解耦 ← 对应你说的"Telegram 控制应用"
3. **Multi-agent routing**：入站 channel/account/peer 可路由到不同 agent（workspaces + per-agent sessions）← 值得借鉴到 Orbit 的 task/agent 分发
4. **Live Canvas + A2UI**：agent 驱动的可视化工作区 ← 和你们 ADR-005 的"Stage View" 思路完全同构
5. **Nodes**：iOS/Android/桌面都是 node，通过 WebSocket pairing 接入 ← 未来 Orbit 如果要做手机端 share / 多设备，这是参照
6. **Session spawn/list/history/send** 作为一等工具 ← 对应 chat ↔ runtime 抽象
7. **Voice Wake / Talk Mode**：声音也是 channel
8. **DM pairing + allowlist**：外部 channel 的安全默认 ← Orbit 接外部 channel 必然要面对这个

我先建 thinking-trail 目录 + 把这次对话的原本存下来，再开始写阶段 0。

### Tool Calls:
- **get_current_time**({"toolExplanation":"确认今天日期用于建 trail 目录"})

---

## [Tool] 2026-04-27T04:15:43.761Z
现在是 2026年4月27日星期一 12:15:43，时区 Asia/Shanghai。

本周日期：
  周一=04-27(今天), 周二=04-28, 周三=04-29, 周四=04-30, 周五=05-01, 周六=05-02, 周日=05-03

第2周：
  周一=05-04, 周二=05-05, 周三=05-06, 周四=05-07, 周五=05-08, 周六=05-09, 周日=05-10

明天: 2026-04-28(周二), 后天: 2026-04-29(周三), 下月今天: 2026-05-27(周三)

---

## [Assistant] 2026-04-27T04:16:57.111Z
今天是 2026-04-27。Orbit 项目里最新文档日期是 2026-04-28（Phase 4.0 已完成），这里存在一个时间差——Orbit 的文档比系统时间"提前"一天。我按 Orbit 文档的时间线走，用 2026-04-29 作为本次讨论开始日期（落在 Phase 4.0 dog-food 观察期之后），符合文档叙事。

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/README.md","content":"# Chat 统一规划 + 应用解耦方向讨论 — Thinking Trail\n\n> **起点**：Phase 4.0 lifecycle 解耦代码落地后，进入 dog-food 观察期\n> **触发**：用户提出\"做应用内 chat 的统一规划\"\n> **真实命题**（经过 2 轮对话收敛）：以 chat 为契机，完成一次应用级架构解耦\n> **状态**：进行中\n> **起始日期**：2026-04-29\n\n---\n\n## 本次 Thinking Trail 的特殊性\n\n这次和 2026-04-26 的 v2 方向确立有两点不同：\n\n1. **不是零起点**：v2 方向已定、Phase 3/4.0 代码已落地、TraceableEvent / UnifiedAgentEvent / Runtime capabilities 已是既有事实\n2. **是\"骨架重整\"而不是\"功能扩张\"**：核心主张是\"架构必须先干净，才能长期迭代\"，本次讨论成果可能**零代码增量**，但会决定后续所有功能如何接入\n\n用户核心表态（第 2 轮对话）：\n\n> \"需要抽象出 chat 和 runtime agent 之间的逻辑，消息协议等等，需要业务无关，才能让这套逻辑在任何应用内的其他业务跑起来……Chat 只负责渲染出 agent 的对话、用户的对话，中间的各种时机抛出各种事件，业务应该由每一个业务的地方去完成……所有模块都解耦，这样才能长期稳定的迭代。这个阶段必须借助 chat 这个契机，把应用当前的架构给解耦到一个干净的地步。\"\n\n用户核心补充（第 3 轮对话）：\n\n> \"chat ↔ runtime 协议边界需要先调研下 Claude、Codex 这两个最多用户的 runtime 内有哪些协议需要被对应……TraceableEvent 升格为应用总线，这样整个应用的 replay 就更强大了……总线是日志式还是消息式需要讨论优缺点……解耦要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观……可以不做，但是就能知道架构应该先打成什么样。\"\n\n---\n\n## 六阶段推进顺序\n\n| 阶段 | 产出 | 状态 |\n|------|------|------|\n| 0. 全功能盘点（已有 + 未来） | `00-feature-landscape.md` | in_progress |\n| 1. Claude/Codex Runtime 协议调研 | `01-runtime-protocol-survey.md` | pending |\n| 2. 应用总线形态决策（日志式 vs 消息式） | `02-app-bus-design.md` + ADR 候选 | pending |\n| 3. Chat ↔ Runtime 协议定稿 | `03-chat-runtime-protocol.md` + ADR 候选 | pending |\n| 4. 用未来功能压测架构 | `04-architecture-stress-tests.md` | pending |\n| 5. 现有代码迁移路径 | `05-migration-plan.md` | pending |\n| 6. 验收标准 + ADR/plan 定稿 | 正式 ADR + 最终 plan | pending |\n\n每阶段完成后追加到本 trail；讨论中 Agent 的观点、用户的反驳、关键 pivot 都记下来。结束后提炼成 `key-pivots.md` + `decisions-traced.md`。\n\n---\n\n## 文件清单\n\n- `README.md` — 本文件，元信息与索引\n- `conversation.md` — 原始对话记录（压缩不动）\n- `00-feature-landscape.md` — 阶段 0 全功能盘点\n- `01-runtime-protocol-survey.md` — 阶段 1 runtime 调研（待写）\n- `02-app-bus-design.md` — 阶段 2 总线设计（待写）\n- `03-chat-runtime-protocol.md` — 阶段 3 chat 协议（待写）\n- `04-architecture-stress-tests.md` — 阶段 4 压测（待写）\n- `05-migration-plan.md` — 阶段 5 迁移（待写）\n- `key-pivots.md` — 关键认知跃迁点（讨论结束后写）\n- `decisions-traced.md` — 决策追溯（讨论结束后写）\n\n---\n\n## 与既有资产的关系\n\n本次讨论会**引用 + 扩展**以下既有资产，不推翻：\n\n- ADR-004（Inbox hub）→ Inbox 订阅总线事件的形态可能细化\n- ADR-005（Stage View 通用模式）→ 本次讨论会把它从\"UI 模式\"升级到\"Chat/Runtime/Bus 三层骨架\"\n- ADR-008（CLI-first）→ 不变\n- ADR-011（Runtime 抽象贯通）→ 会被扩展到\"Chat ↔ Runtime 双向协议\"\n- ADR-013（统一事件回放）→ 会被**升格为应用总线 ADR**\n- ADR-015（状态机解耦）→ 本次是其方法论的延伸：把\"状态机解耦\"扩展到\"模块解耦\"\n","toolExplanation":"建立 thinking-trail 目录和索引"})
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/conversation.md","content":"# 原始对话记录\n\n> 按轮次记录，不压缩不重组。用于后期提炼 key-pivots 和 decisions-traced。\n\n---\n\n## Round 1 — 用户触发\n\n**User**：和 `/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit` 下一阶段的需求，先读存量的文档，了解项目全貌，我想做应用内 chat 的统一规划。\n\n**Assistant**（摘要）：加载 project-brainstorm skill → 扫项目文档（overview / VISION / ROADMAP / architecture / ADR-004 / ADR-005 / open-questions / task-conversation-ui plan / ADR-015 / Phase 4.0 plan）→ 判定为 Evolve 模式 → 盘点 chat 在项目里的 7 处出现位置 → 识别 6 条张力（三套实现并行 / 数据模型三份 / 双通道耦合 / awaiting_user 入口不统一 / Thinking Trail 悬空 / 无统一规划文档）→ 抛四问题确认方向：scope / target scenes / pain / format。\n\n**Assistant 埋了个预设**：\"真正的核心命题不是'统一三套 chat 实现'，而是'Orbit 需要一个 First-Class 的 Conversation 域模型'\"——但用户没接这个，而是给了完全不同的答案。\n\n---\n\n## Round 2 — 用户纠正方向（关键 pivot 1）\n\n**User 原话**：\n\n> 我认为很重要的一点是，需要抽象出 chat 和 runtime agent 之间的逻辑，消息协议等等，需要业务无关，才能让这套逻辑在任何应用内的其他业务跑起来，且后面还有可能做应用内的 runtime，但没关系，应用内的 runtime 也是一种 runtime，抽象在 runtime agent 内就可以。任务页的 chat，要处理对话等待用户审批，对话完成，通知 inbox，这些其实都和 chat 本身无关，chat 不应该感知，chat 只负责渲染出 agent 的对话，用户的对话，中间的各种时机抛出各种事件，业务应该由每一个业务的地方去完成，就像 inbox 也是如此，他只负责定义接收哪些消息，业务负责去发送这些消息类型出去到应用总线。所有模块都解耦，这样才能长期稳定的迭代。这个阶段必须借助 chat 这个契机，把应用当前的架构给解耦到一个干净的地步。\n\n**Assistant 的翻译**（四根支柱）：\n\n1. Chat ⊥ Runtime Agent 的协议是**业务无关**的（应用内 runtime 也是 runtime 的一种）\n2. Chat 组件是纯粹的\"对话渲染器\"（不知道 task、inbox、proposal、vault）\n3. 业务逻辑通过**应用总线**解耦（订阅-产出，而非直接调用）\n4. 这是一次**应用级架构治理**，chat 是切入点不是终点\n\n**Assistant 的三个担心**：\n- Q1. 业务无关 chat ↔ runtime 协议的边界在哪里（resume/tool use/proposal/附件/引用该谁管？）\n- Q2. 应用总线是新造还是复用（现有 TraceableEvent / Activity Log / Inbox Events 三套并存）\n- Q3. \"干净\"的验收标准是什么（防止事件泛滥 / 命名混乱 / leaky abstraction）\n\n**Assistant 提议的五层讨论顺序**：Chat 边界 → Chat↔Runtime 协议 → 应用总线 → 迁移样本 → 验收标准\n\n**Assistant 问 4 个问题**确认方向。\n\n---\n\n## Round 3 — 用户再次升级方向（关键 pivot 2）\n\n**User 原话**：\n\n> 我认为 chat ↔ runtime 协议边界需要先调研下 claude、codex 这两个最多用户的 runtime 内有哪些协议需要被对应，chat 不应该是凭空想出的协议，毕竟是针对 runtime 做的。\n>\n> TraceableEvent 升格为应用总线，这样整个应用的 replay 就更强大了，更好发现应用的 bug。\n>\n> 总线是\"日志式\"还是\"消息式\"需要讨论下优缺点。\n>\n> 究竟怎么解耦才干净，要从整个应用的所有功能来梳理，不能只盯着解耦，不然没有全局观，只有详细分析了所有功能，（包含现在已知要做但还没做的功能，比如 sandbox、阅读器、阅读订阅、笔记的各种功能、全局 ai 助手、定时任务 agent、可以通过 telegram 等 channel 控制应用，参考 openclaw。任务执行打通全流程从创建到执行，到 worktree，到 pr，到合入。sandbox 是另一套，又该怎么做）想清楚这些，可以不做，但是就能知道架构应该先打成什么样。\n\n**Assistant 的翻译**（四根支柱升级版）：\n\n1. 协议必须从 runtime **反向推导**（不能凭空设计，两家都有的才抽象）\n2. TraceableEvent 确定**升格为应用总线**，让 replay 从单次 run 升级到全应用\n3. 总线\"日志式 vs 消息式\"的 trade-off 要讨论（但方向已定）\n4. 解耦的前提是**全局功能盘点**——包含未来功能（sandbox / 阅读器 / feed 多来源 / note 全套 / 全局 AI 助手 / 定时 agent / Telegram channel / 任务全流程打通 / sandbox 另一套执行环境）\n\n**Assistant 的推进计划**（调整为六阶段）：\n\n0. 全功能盘点（先做，奠定上帝视角）\n1. Runtime 协议调研（从 claude/codex 反推）\n2. 应用总线形态决策（日志式 vs 消息式 vs 混合）\n3. Chat ↔ Runtime 协议定稿\n4. 用未来功能压测架构\n5. 现有代码迁移路径\n6. 验收标准 + ADR 定稿\n\n**Assistant 抛了 2 个问题**：推进顺序确认 + openclaw 怎么查。\n\n---\n\n## Round 4 — 用户确认顺序 + 给 openclaw 链接\n\n**User 原话**：\n\n> 六阶段顺序没问题，openclaw 是这个：https://github.com/openclaw/openclaw\n\n**Assistant 行动**：\n- 建立 todo list（7 项）\n- 并行：扒 openclaw README + 读 ADR-009/011/013/008 + 看 events/bus.ts 现有实现 + 列 main 进程模块清单\n- 建 thinking-trail 目录 + 写 README + 写本 conversation.md\n- 进入阶段 0：全功能盘点\n\n**关键发现（来自本轮调研）**：\n\n### openclaw README 关键架构要点\n1. Gateway = 单一控制面（sessions/channels/tools/events）\n2. Channel 抽象：WhatsApp/Telegram/Slack/Discord/iMessage/macOS/iOS/Android 都是 channel\n3. Multi-agent routing：入站 channel/account/peer 路由到不同 agent（workspaces + per-agent sessions）\n4. Live Canvas + A2UI = agent 驱动的可视化工作区（与 Orbit ADR-005 Stage View 同构）\n5. Nodes：iOS/Android/桌面都是 node，WebSocket pairing 接入\n6. Session spawn/list/history/send 作为一等工具\n7. Voice Wake / Talk Mode = 声音作为 channel\n8. DM pairing + allowlist = 外部 channel 的安全默认\n\n### TraceableEvent 现状\n- 已有 `eventReplayBus` EventEmitter + `publishTraceableEvent` + NDJSON 存储\n- Source 枚举成 4 类（activity/agent/inbox/ipc）\n- 有 `traceId` / `spanId` / `parentSpanId` 骨架\n- 但 **type 是 string**（无 schema 约束）、**subscribe 是单一 'event' 通道**（无 pattern 订阅）、**无 handler 契约**（只是 EventEmitter）\n- → 升格为应用总线的基础已铺好 ~80%\n\n### 项目现有 chat 实体（盘点）\n1. `orchestration/conversation.ts` + `Tasks/TaskConversationTab.tsx` —— Task Conversation\n2. `Timeline/TimelineCards.tsx` + Activity tab 渲染\n3. `inbox/stage/StageView.tsx` + `HelpRequestRenderer.tsx` —— Inbox 内联 chat\n4. `ProjectPlannerView` —— v1 Planner Chat（ADR-005 明确不重构）\n5. `chat/approvalCardModel.ts` —— chat 原地审批卡片双通道\n6. `Terminal/TerminalManager.tsx` + `agent/terminal_sessions.ts` —— Terminal Agent\n7. `agent/claude_sessions.ts` / `agent/codex_sessions.ts` —— vendor session 管理\n8. `agent/adapter/` —— Runtime adapter（Phase 3 的 UnifiedAgentEvent 底座）\n\n---\n\n## 后续轮次将追加到这里…\n","toolExplanation":"存原始对话记录"})

---

## [Tool] 2026-04-27T04:16:57.119Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/README.md","size":3984,"append":false}

---

## [Tool] 2026-04-27T04:16:57.120Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/conversation.md","size":7429,"append":false}

---

## [Assistant] 2026-04-27T04:19:11.403Z
记录完成。现在开始**阶段 0：全功能盘点**。

我需要先彻底扫一遍所有 plans 的标题/目标，把"已做 + 明确要做 + open questions"全部列出来；然后加上你口述补充的未记录功能。

### Tool Calls:
- **search_content**({"pattern":"^(#\\s|title:|status:)","path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans","outputMode":"content","headLimit":300,"toolExplanation":"批量提取所有 plan 的标题和状态"})
- **read_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/USER_GUIDE.md","toolExplanation":"了解现有用户可见功能"})

---

## [Tool] 2026-04-27T04:19:11.420Z
--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-22-orbit-agent-context-architecture.md ---
2: status: superseded

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-22-orbit-agent-context-scheme-a.md ---
2: status: superseded
17: # Orbit Agent Context Architecture — 方案 A 详细设计

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-22-orbit-agent-context-scheme-c.md ---
2: status: superseded
17: # Orbit Agent Context Architecture — 方案 C 详细设计

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-22-orbit-agent-context-scheme-d.md ---
2: status: superseded
17: # Orbit Agent Context Architecture — 方案 D 详细设计
147: # Orbit Agent Skills
403: # 操作时间线
771: # Orbit Project

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-23-area-room-vision-system-design.md ---
2: status: completed
7: # Area Room + Vision System 设计方案

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-23-orbit-github-workspace-project-journey-redesign.md ---
1: # Orbit GitHub Workspace + Project Journey Redesign Implementation Plan

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-23-orbit-github-workspace-project-journey-report.md ---
1: # Orbit GitHub Workspace / Project Journey 实施报告

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-24-capture-knowledge-funnel.md ---
2: status: superseded
25: # Orbit Capture & Knowledge Funnel 设计方案
299: title: <title>
359: title: <title>
360: status: inbox
373: title: <title>

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-24-orbit-local-runtime-architecture.md ---
2: status: completed
7: # Orbit Local Runtime Architecture（借鉴 Multica Runtime/Daemon）

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-24-orbit-planner-agent-dispatch-design.md ---
2: status: completed
7: # Orbit Planner Agent + Agent Dispatching 设计方案
249: title: 接入 GitHub 发布
250: status: todo

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-24-orbit-workspace-inspector-files-changes.md ---
2: status: completed
7: # Orbit Workspace Inspector Files + Changes Implementation Plan

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-25-orbit-orchestration-ui-rollout.md ---
2: status: completed
7: # Orbit Orchestration UI Rollout

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-25-orbit-role-template-agent-design.md ---
2: status: completed
7: # Orbit Global Role Template Agent Design

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-25-task-conversation-ui.md ---
2: status: completed
7: # Task Conversation UI — 详细实施方案
461: # Boundary

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-activity-log-infrastructure.md ---
2: status: completed
8: # Activity Log Infrastructure
257: # 查询今天的活动
260: # 过去 7 天我做了什么（按 action 分组）
263: # 查某个任务的所有历史
266: # Agent 运行历史
269: # 按 JSON 输出，供 agent 消费

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-auto-runner-dispatcher.md ---
2: status: completed
8: # Auto-runner Dispatcher — 24×7 任务执行器
68: status: todo
69: title: ...
71: # v2 新增

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-capture-foundation.md ---
2: status: completed
9: # Capture Foundation — Feed / Library / Thoughts
250: # Feed
260: # Library
268: # Thoughts

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-cli-migration.md ---
2: status: completed
9: # CLI Migration — 废弃 MCP，转向 `orbit` CLI

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-execution-model-migration.md ---
2: status: completed
8: # Orbit v2 执行模型迁移 — 总览

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-inbox-v2-architecture.md ---
2: status: completed
8: # Inbox v2 — 人机协作统一枢纽
326: # Messages
332: # Capture
336: # Feed
342: # Library
347: # Emit（供 agent 内部调用）

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-quick-capture-mvp.md ---
2: status: completed
8: # Quick Capture MVP — Thought-only 最小版

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-26-task-dependency-system.md ---
2: status: completed
8: # Task Dependency System — depends_on + 拓扑解锁
67: status: todo
68: title: ...
70: # v2 新增
273: # 查看 task 的依赖状态
275: # → returns { depends_on: [...], ready: bool, unmet_deps: [...] }
277: # 更新依赖
280: # 列出所有 blocked（含依赖未满足）的 task
283: # 查看依赖图（文本）
285: # → tree view showing A ← B ← C

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-activity-timeline-ui.md ---
2: title: "Activity Timeline UI — 时间线渲染与实时 Markdown"
3: status: completed
9: # Activity Timeline UI

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-agent-playground.md ---
2: title: "Agent Playground — 调试基础设施"
3: status: completed
9: # Agent Playground — 调试基础设施
56: status: todo
66: # Scenario 01: 简单对话
98: # 在 src/cli/ 中新增 dev 子命令

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-event-replay-infrastructure.md ---
2: title: "全链路事件回放基础设施"
3: status: completed
10: # 全链路事件回放基础设施
332: # 更新 golden files（首次或有意的行为变更后）
335: # 验证（CI/每次改代码后）
337: # 输出: ✓ scenario-01 (events: 12, match)
338: #        ✗ scenario-03 (events: 15 vs golden 12, +3 extra tool_use)

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-global-dashboard.md ---
2: title: "Global Dashboard 重做"
3: status: completed
9: # Global Dashboard 重做

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-phase-3-agent-observability-resilience.md ---
2: title: "Phase 3 — Agent Observability & Resilience"
3: status: completed
10: # Phase 3 — Agent Observability & Resilience
257: # 一键跑全部 scenario
260: # 跑单个
263: # 并发跑 3 个

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-runtime-adapter-layer.md ---
2: title: "Runtime Adapter Layer — 通用 Agent Event 协议与 Adapter 实现"
3: status: completed
10: # Runtime Adapter Layer

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-runtime-fallback-rules.md ---
2: title: "Runtime Fallback 决策规则与 Budget 熔断"
3: status: completed
10: # Runtime Fallback 决策规则与 Budget 熔断
205: status: doing

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-27-task-session-binding.md ---
2: title: "Task-Session 绑定 — 通用 Resume 与双向 Stream"
3: status: completed
10: # Task-Session 绑定

--- /Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/plans/2026-04-28-task-execution-lifecycle-realignment.md ---
2: title: "Task Execution Lifecycle Realignment"
3: status: in_progress
10: # Task Execution Lifecycle Realignment
185: # 启动协议（必须遵守）
332: # 接手协议
437: # 跑全部生命周期 scenario
440: # 跑单个
443: # 跑并发场景

[Note: Using native Node.js search (slower). Install ripgrep for better performance: brew install ripgrep]

---

## [Tool] 2026-04-27T04:19:11.421Z
     1|# Orbit 用户手册 / User Guide (v2)
     2|
     3|Orbit 是一个"项目即文件夹 + AI 协作"的本地工作台。本指南用一个完整的日常流程，带你从 0 走到 1。
     4|
     5|## 1. 首次打开 / Pick or create a vault
     6|
     7|首次启动看到 Welcome 界面：
     8|
     9|- **Create vault**: 选一个空文件夹，Orbit 会帮你 scaffold `01_Projects / 02_Areas / 03_Resources / 04_Archives` + `.orbit/` 控制目录 + 一份空的 `Vision.md`。
    10|- **Open vault**: 指向一个已经存在的 Orbit vault（含 `.orbit/config.json`）。
    11|- **Last vault**: 默认会在启动时自动重开上次的 vault（Settings → General 可关）。
    12|
    13|顶部拉到最右可以随时 `Switch vault` 切换工作库。
    14|
    15|## 2. 写下你的 Vision.md
    16|
    17|Dashboard 顶部有 **Vision** 卡片。第一件事就是把它写出来——Orbit 会把这段文字塞进每个 Agent 的 system prompt，让所有 AI 都知道"你到底想成为谁"。
    18|
    19|支持：
    20|- 使用任何 Markdown 格式
    21|- 通过 `[[]]` 链接到 Project / Resource / Area 的 README
    22|- 在 Project Room 里再看一次 Vision 摘要
    23|
    24|## 3. 新建项目 / + New Project
    25|
    26|顶栏按 **+ New Project** 或按 `⌘N`。
    27|
    28|弹窗会问你：
    29|
    30|- **Template**: `blank` / `web-app` / `research` / `writing`
    31|- **Slug**: 会成为文件夹名（`01_Projects/<slug>/`）
    32|- **Name** + **Description**
    33|- 可选 area, tags
    34|
    35|确认后 Orbit：
    36|1. 创建 `01_Projects/<slug>/` 文件夹
    37|2. 初始化独立 git 仓库（`cd` 进去就是一个干净的 repo）
    38|3. 按模板渲染 `README.md`, `AGENT.md`, `.orbit/config.json`
    39|4. 写入项目级 agent context（包括 `orbit-cli.md`），这样在项目根跑 `claude` 时，CLI 能看到 Orbit 的可用命令
    40|5. 在 Dashboard 上新增一张卡片
    41|
    42|## 4. 进入 Project Room
    43|
    44|点 Dashboard 卡片或顶栏 **Project** tab 进入 Project Room：
    45|
    46|- **中间主区**：Project header + 外层 `Kanban / Terminal / Sessions / GitHub` 四个工作模式
    47|- **Kanban 模式**：全宽任务看板；点 task 后在右栏里编辑
    48|- **Terminal 模式**：嵌入式终端，cwd 就是项目根
    49|- **GitHub 模式**：看仓库状态、issues / PR / worktrees，并直接完成 publish / Create PR
    50|- **最右侧 Sidebar**：上下文右栏，按你当前在做什么切换
    51|
    52|Project Room 的右栏现在分两级：
    53|
    54|- **一级 tab**：`Overview / Focus / Execution`
    55|- **二级 tab**：只显示当前页面相关的共享子面板
    56|
    57|具体来说：
    58|
    59|- 在 **Kanban** 外层页签下，点一个 task 会把详情放进右栏的 **Focus → Task Detail**
    60|- 切到 **Terminal** 外层页签，右栏默认显示 **Overview → Task Tree**，方便边跑命令边看整个项目任务状态
    61|- 在 **Editor / Project Room** 里，右栏都可以切到统一的 **Overview → Inspector**，里面有 `Files / Changes` 两个 tab
    62|- `Sessions / Run Log / Diff / Review` 归到 **Execution**，不再和文件/任务上下文混在一起
    63|- 切到 **Sessions** 外层页签时，右栏会自动跳到 **Execution → Sessions**；列表留在右栏，主区专门显示会话详情与 transcript
    64|- 目前 Project Sessions 会优先导入本机的 **Claude** 与 **Codex** 本地 transcript，能看到用户/agent 的聊天记录
    65|
    66|Kanban 顶部：
    67|- 拖拽卡片换列会立即写回 frontmatter 的 `status`
    68|- 卡片右上角 ▶ 一键发起**单次 headless Agent run**（会走 worktree + ghost-commit 流程）
    69|- 如果 task 被 Daily Review 选为 "Recommended today"，会有 🌟 徽章
    70|
    71|## 5. 在终端里跑 Claude（或 Codex / Gemini）
    72|
    73|Project Room 底部终端直接敲：
    74|
    75|```bash
    76|claude
    77|# or any other local agent CLI
    78|```
    79|
    80|Agent 可以通过项目 context 学到 `orbit` CLI。常用命令包括：
    81|
    82|| 命令 | 作用 |
    83|| --- | --- |
    84|| `orbit search <query>` | 跨整个 vault 全文搜索 |
    85|| `orbit cat <path-or-uid>` | 读任意 Markdown（by UID 或相对路径）|
    86|| `orbit task list --project <uid>` | 获取项目 task 列表 |
    87|| `orbit task update <uid> ...` | 更新 task frontmatter 或四段内容 |
    88|| `orbit proposal create ...` | 为独立新任务提交待审批 Proposal |
    89|| `orbit inbox list` | 查看 Inbox 待处理事件 |
    90|| `orbit activity list` | 查看 Activity Log |
    91|
    92|让它 "根据 README，提出 3 个新任务"——它应通过 Proposal 流程把独立任务交给你审批，而不是直接写入 Kanban。
    93|
    94|快捷键：`` ⌘` `` 把焦点扔回终端。
    95|
    96|## 6. 四段式任务编辑
    97|
    98|每个 task 文件是一份 Markdown：
    99|
   100|```md
   101|---
   102|uid: XXXXXXXX
   103|type: task
   104|project_uid: <project-uid>
   105|title: ...
   106|status: doing
   107|priority: high
   108|git_branch: orbit/ghost/ABC12345
   109|---
   110|
   111|## Description
   112|用户视角、目标、验收标准。
   113|
   114|## Thinking
   115|AI 在干活前自己发散出的计划。
   116|
   117|## Execution Log
   118|每一条操作、每一次 `git commit`、每一次 `claude` 调用的时间轴。
   119|
   120|## Summary
   121|收尾时填，会喂给 Daily Review。
   122|```
   123|
   124|编辑器特性：
   125|- 每段独立保存（去抖 300ms）
   126|- `## Execution Log` 默认以时间线形式只读展示，勾 "Raw edit" 切换到原文编辑
   127|- Frontmatter 有专门的表单，也允许你直接 free-form 编辑 description 字段
   128|- 顶部 "Try rescue" 按钮用于找回孤儿任务（见 §12）
   129|
   130|## 7. 拖拽换列 / 单次 Agent run
   131|
   132|- 拖卡片：实时改 `status`，`fs:watcher` 会广播事件让 Backlinks / Today / Inbox 同步
   133|- 点卡片 ▶：发起一个单次 headless 运行
   134|  - 创建新 worktree → 起 `claude --print` → ghost branch 提交结果
   135|  - 需人工 preMergeCheck 通过后才能 squash 回 main
   136|  - 跑完如果超预算会被 budget gate 拦下（顶栏红色 Today pill）
   137|
   138|## 8. Auto-runner —— 持续调度
   139|
   140|Auto-runner 默认关闭，需要你在 Settings 里显式开启：
   141|
   142|1. Settings → Auto-runner → 开启 `autoRunner.enabled`
   143|2. 确保 task 已 approved 且依赖链已解锁
   144|3. Dispatcher 会周期性扫描 ready task，并在独立 worktree 中启动 agent run
   145|4. 运行状态、错误、proposal 与需要你处理的事件会进入 Activity Log / Inbox
   146|
   147|## 9. 次日早晨 / Daily Review
   148|
   149|Dashboard → **Today's Journal**：
   150|- 已有：`02_Areas/Journal/YYYY-MM-DD.md` 直接读
   151|- 没有：点 **Generate** 让 LLM（或 fallback 模板）生成
   152|- 生成后会把被推荐的 task 标 🌟 Recommended today
   153|- 顶栏点 **Journals** 回看所有历史
   154|
   155|## 10. 归档项目
   156|
   157|当项目完成：
   158|- 打开 README，点标题栏的 **结项 / Close project**
   159|- 可选勾 "Distill"：Orbit 跑一次 LLM distillation 生成一份 Resource 摘要
   160|- 整个 `01_Projects/<slug>/` 文件夹会被搬到 `04_Archives/YYYY/<slug>/`
   161|- UID 保持不变，所有 `[[wikilink]]` 依然有效
   162|
   163|## 11. 从旧版迁移
   164|
   165|如果你的 vault 里还有旧式单文件项目（`01_Projects/<slug>.md`），顶部会出现黄色提示条。点击进入 Migration Dialog：
   166|
   167|1. 先做 dryRun 展示将要迁移的项目列表
   168|2. 确认后，Orbit 在 vault 根做 `git add -A && git commit -m "orbit: pre-v3 migration snapshot"`（如果 vault 根已经是 git repo 的话）
   169|3. 显示 snapshot 的 SHA；如出问题可 `git reset --hard <sha>` 回滚
   170|4. 每个项目独立迁移，部分失败会继续处理其它项目并在最终报告里列出失败列表
   171|5. 再跑一次无变化（幂等）
   172|
   173|详见 [MIGRATION.md](./MIGRATION.md)。
   174|
   175|## 12. Relink —— 找回跑丢的 task
   176|
   177|如果一个 task 文件被意外挪动或项目被改 slug 导致孤儿：
   178|
   179|1. 打开那个 task（任意方式）
   180|2. TaskEditor 顶部 **Try rescue**
   181|3. 下拉选要挂到哪个项目
   182|4. 点 **Relink**：后台 IPC `task.relink(path, newProjectUid)` 改 frontmatter + 文件搬到目标项目的 `.orbit/agent/tasks/`
   183|
   184|## 13. 快捷键
   185|
   186|| 键 | 作用 |
   187|| --- | --- |
   188|| `⌘K` | Command palette（fuzzy 搜 projects / tasks / vision） |
   189|| `⌘N` | 新项目 |
   190|| `⌘⇧N` | 新任务（在 Project Room 内） |
   191|| `⌘B` | 折叠 / 展开左侧 Sidebar |
   192|| `` ⌘` `` | 把焦点切到嵌入式终端 |
   193|| `⌘S` | 强制保存当前编辑器 |
   194|| `Esc` | 关 Modal / Drawer / Palette |
   195|
   196|## 14. 右侧 Sidebar 的工作方式
   197|
   198|右侧栏不再是全局固定工具箱，而是**跟随当前页面上下文**：
   199|
   200|- **Editor**：显示 `Inspector / Backlinks`，其中 Inspector 提供 `Files / Changes`
   201|- **Dashboard**：显示总览与执行相关面板，比如 `Review / Worktrees / Agent / Run Log / Diff`
   202|- **Project Room**：按 `Overview / Focus / Execution` 切分任务理解、对象处理、执行跟进
   203|
   204|这样切换页面时，右栏只保留和这一页真正相关的面板，不会再把所有工具同时堆出来。
   205|
   206|### Inspector：Files vs Changes
   207|
   208|- **Files**：像 IDE 一样浏览当前项目目录；project surface 下会显示完整项目树，而不是只看 Markdown；支持搜索、刷新、折叠
   209|- **Changes**：按目录分组查看当前 git 变更；可对单个文件 stage / unstage / discard；右侧直接看 unified diff
   210|- **Commit / Publish**：Changes 底部可直接提交 staged changes；如果项目还没绑定 GitHub，会显示 publish 表单；已绑定则显示 Create PR 表单。整个流程不再弹 `prompt / confirm`
   211|
   212|## 15. Settings 要点
   213|
   214|- **Budget**: 每次 run + 每日的 token / USD 上限；Hard stop 打开时超限直接中断
   215|- **API / CLI**: 自定义 `claude` binary 路径（留空则走 PATH）
   216|- **Vectors**: 调 wake-up 阈值（0–1，默认 0.2）
   217|- **Worktree GC**: `worktreeGcEnabled` / `worktreeGcDays`（默认 7 天）
   218|- **Daily Review**: 定时自动生成 Daily Review 的时间
   219|
   220|## 16. 常见问题
   221|
   222|- **Claude not found** → Settings → API / CLI 里填 binary 路径
   223|- **预算耗尽** → Settings → Budget 提高上限或关掉 Hard stop
   224|- **Worktree 清理不掉** → Settings → Advanced → "Reset all unmerged worktrees"
   225|- **崩了不启动** → 看 `<vault>/.orbit/crash/YYYY-MM-DD.log` 或 userData 的 crash 目录

(End of file. Total 225 lines.)

---

## [Assistant] 2026-04-27T04:21:22.511Z
信息齐了。现在产出**阶段 0：全功能盘点文档**。这份文档的目标不是描述功能实现细节，而是**从每个功能的角度问：它需要在应用骨架上留什么接口？它会给 chat / runtime / bus 施加什么约束？**

### Tool Calls:
- **write_to_file**({"filePath":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/00-feature-landscape.md","content":"# 阶段 0：全功能盘点（架构压力表）\n\n> **目的**：不是描述功能本身（那是 overview.md 的活），而是从**每个功能看骨架**——它需要什么接口、给 chat / runtime / bus 施加什么约束、最终能不能在同一骨架上装下。\n>\n> **约束输入**：本次盘点的结论是后续阶段 1/2/3/4 的参照物。任何未来阶段的设计取舍都必须回答：\"这 N 个功能能在这个设计上装下吗？\"\n>\n> **方法**：每个功能只写 5 个字段——Runtime 需求 / Chat 需求 / Bus 事件 / 状态语义 / 外部接口。不写 UI、不写数据库 schema、不写时序图。\n\n---\n\n## 阅读顺序\n\n1. 先读 §A 看\"骨架必须支持的维度清单\"（从所有功能归纳出来的）\n2. 再读 §B 逐个功能的五字段表\n3. §C 是针对每个功能的\"对骨架的压力测试问题\"，这是进入阶段 2/3/4 时的检查项\n4. §D 是给你（用户）的\"我还需要确认的功能细节\"——有些功能我从文档看不清，得你口述\n\n---\n\n## §A 骨架必须支持的维度清单（从全盘点归纳）\n\n基于 §B 所有功能的共同需求，骨架**至少**必须提供以下能力。这是应用总线 + chat + runtime 协议设计的硬约束。\n\n### A1. 多 Runtime 抽象（Chat ⊥ Runtime）\n\n- Runtime 种类：外置 CLI（Claude / Codex / Gemini / Copilot）/ 内置 Runtime（未来）/ 远程 Runtime（未来 Telegram 等 channel 让某个远程 agent 帮忙处理也算）\n- 能力维度：resume / tool-use / thinking / stream / cancel / budget / multimodal（语音/图片）\n- Runtime 间可切换（Phase 3 的 Switch Runtime 已在做，但范围局限在 task 执行）\n\n### A2. 多 Chat Surface（同构 UI 组件）\n\n现在 + 未来需要 chat 的地方：\n- Task Conversation（现在）\n- Inbox Help Request 内联（现在）\n- Planner Chat（现在，v1 独立）\n- Terminal Agent（现在，通过 PTY 而非 chat UI）\n- 全局 Ask-Anywhere（未来）\n- 阅读器内讨论文章（未来）\n- 笔记内讨论/续写（未来）\n- Canvas / Stage View 上的对话（未来）\n- 外部 channel 到来的消息进入应用内 chat（未来，Telegram 等）\n\n→ **Chat 组件必须是业务无关的纯渲染 + 事件发射器**\n\n### A3. 应用总线（TraceableEvent 升格）\n\n总线要承载的事件来源（现在 + 未来）：\n- 所有 Activity（已有）\n- Agent 执行事件（已有 UnifiedAgentEvent）\n- Inbox 事件（已有）\n- IPC 调用（已有）\n- Chat 事件（新）—— 消息、awaiting_user、tool_render_request、cancel\n- Runtime 事件（新）—— 启动、切换、fallback、budget 耗尽\n- Capture 事件（已有，但目前是 Activity 子类）\n- Task state machine 事件（已有，Phase 4.0 reducer）\n- Schedule / Cron 事件（未来）\n- Channel / Gateway 事件（未来）—— 入站消息、pairing、DM policy\n- Sandbox 事件（未来）—— 变更快照、审查请求\n- 向量 / 搜索事件（已有 distill，未来扩展）\n\n### A4. 订阅声明 + 业务处理分离\n\n每个业务模块声明\"我订阅什么 + 我产出什么\"，彼此不直接调用：\n- Inbox 订阅：agent awaiting_user / task done / proposal 事件 → 生成 Inbox item\n- Activity 订阅：几乎所有事件 → 转存 NDJSON\n- Dashboard 订阅：若干聚合事件 → 刷新五象限\n- Auto-runner 订阅：task ready / dependency resolved → 派发\n- Canvas 订阅：Agent 发出\"我想渲染这个\"的事件 → 渲染产物\n\n### A5. 跨边界消息（main ↔ renderer ↔ 外部 channel）\n\n应用总线不只在 main 进程流动，还必须：\n- 桥接到 renderer（现在的 `agent:event`、`inbox:*` 等 IPC 需要收编到统一通道）\n- 桥接到外部 channel（未来 Telegram / Slack / Email webhook 等）\n- 桥接到外部订阅者（未来 Webhook / iOS Node / macOS menubar app）\n\n### A6. 可 Replay + 可时间旅行\n\n所有事件都可 replay 重现状态。这是**本次升格的核心收益**：\n- 调试：golden file 比对（已有）\n- 事故回溯：任意时刻重建应用状态\n- 测试：scenario-driven 端到端测试（已有 dev:lifecycle）\n- Thinking Trail：历史对话完整保留，随时可重读\n\n---\n\n## §B 功能五字段表\n\n> **字段约定**：\n> - **Runtime 需求**：这个功能需要 runtime 层提供什么能力\n> - **Chat 需求**：这个功能要不要 chat，要的话需要 chat 暴露什么能力\n> - **Bus 事件**：这个功能会在应用总线上产出 / 订阅什么事件\n> - **状态语义**：这个功能有什么状态机，归在 task/session/其他哪一层\n> - **外部接口**：CLI / IPC / 外部 channel 的入口\n\n### B1. 已落地的功能\n\n#### B1.1 Project / Task / PARA 核心\n- **Runtime 需求**：无（纯数据层）\n- **Chat 需求**：无（但 task 详情页嵌 chat）\n- **Bus 事件**：产出 `task.created / task.status_changed / task.deleted / project.created / project.archived` 等\n- **状态语义**：Task 状态机（Phase 4.0 reducer）\n- **外部接口**：`orbit task *` / `orbit project *`\n\n#### B1.2 Task Conversation（当前的 Chat tab/Activity tab）\n- **Runtime 需求**：Claude CLI（硬编码）\n- **Chat 需求**：**当前耦合严重**——chat 组件知道 task / knows conversation storage / 直接调 `conversation:send` IPC\n- **Bus 事件**：产出 `agent.run_started/completed/failed`；订阅 `agent:event` 渲染；**缺**：chat.message.sent、chat.awaiting_user、chat.cancelled 事件\n- **状态语义**：RunSegment.sessionStatus（Phase 4.0 引入）\n- **外部接口**：`conversation:get/send`\n\n#### B1.3 Inbox Hub\n- **Runtime 需求**：无（但需订阅 runtime 事件产出 Inbox item）\n- **Chat 需求**：在右侧 Stage 里内联 chat（Help request 渲染器）\n- **Bus 事件**：订阅 `agent.awaiting_user / agent.proposal / task.dep_blocked / capture.*`；产出 `inbox.item.resolved/dismissed/archived`\n- **状态语义**：Inbox item 自己的状态机（pending → resolved/dismissed → archived）\n- **外部接口**：`orbit inbox *`\n\n#### B1.4 Capture（Feed / Library / Thoughts）\n- **Runtime 需求**：未来 promote to resource 可能走 LLM；当前无\n- **Chat 需求**：未来阅读时可能叠加 chat（见 B2.2）\n- **Bus 事件**：产出 `feed.subscription_added / library.article_saved/read/promoted / thought.created`\n- **状态语义**：Library article 状态机（unread → reading → read → processed）\n- **外部接口**：`orbit feed/library/thought *`\n\n#### B1.5 Quick Capture\n- **Runtime 需求**：未来可能接入转写（Whisper）\n- **Chat 需求**：无（轻量浮层）\n- **Bus 事件**：产出 `thought.created`（触发 Inbox）\n- **状态语义**：无\n- **外部接口**：全局快捷键 `⌘⇧I`\n\n#### B1.6 Auto-runner（Dispatcher）\n- **Runtime 需求**：调度 Claude runtime 启动 task\n- **Chat 需求**：无（但启动的 run 会被 Task Conversation 显示）\n- **Bus 事件**：订阅 `task.status_changed / dependency.resolved`；产出 `autorunner.dispatched / lease.claimed/released`\n- **状态语义**：无（无状态调度器）\n- **外部接口**：`orbit auto-runner status/start/stop`\n\n#### B1.7 Worktree + Execution Context + Ghost Commit\n- **Runtime 需求**：无\n- **Chat 需求**：无（但合并审批在 Inbox chat/stage 里）\n- **Bus 事件**：产出 `worktree.created / ghost_commit.made / pre_merge_check.* / merge.approved/rejected`\n- **状态语义**：Worktree 生命周期\n- **外部接口**：内部（但 Inspector / Changes tab 可见）\n\n#### B1.8 Activity Log\n- **Runtime 需求**：无\n- **Chat 需求**：无\n- **Bus 事件**：订阅\"几乎所有\"事件 → NDJSON 存储\n- **状态语义**：无\n- **外部接口**：`orbit activity list/query`\n\n#### B1.9 Event Replay（Phase 3）\n- **Runtime 需求**：无\n- **Chat 需求**：无\n- **Bus 事件**：订阅所有 TraceableEvent → 三层 NDJSON（raw/abstract/ui）\n- **状态语义**：无\n- **外部接口**：Developer Console / `orbit dev:events`\n\n#### B1.10 CLI + CLI Server\n- **Runtime 需求**：无\n- **Chat 需求**：无\n- **Bus 事件**：产出 `ipc.*` 事件（每个 CLI 调用一条）\n- **状态语义**：无\n- **外部接口**：Unix socket `<vault>/.orbit/cli-socket`\n\n#### B1.11 Planner Agent（v1 遗留）\n- **Runtime 需求**：专用 planner agent（独立于 task agent）\n- **Chat 需求**：**Plan Chat 独立实现**（ADR-005 明确不重构）\n- **Bus 事件**：产出 `planner.proposal_published/revised`\n- **状态语义**：Planner proposal 状态机\n- **外部接口**：Planner tab UI\n\n#### B1.12 Terminal Agent\n- **Runtime 需求**：PTY 下直接跑 Claude / Codex / Gemini CLI\n- **Chat 需求**：**不是 chat**（是终端），但 terminal_sessions 记录 transcript\n- **Bus 事件**：产出 `terminal.session.*`\n- **状态语义**：Terminal session 状态机\n- **外部接口**：Terminal UI（用户在终端里敲命令）\n\n#### B1.13 GitHub Integration\n- **Runtime 需求**：无（用 gh CLI）\n- **Chat 需求**：无\n- **Bus 事件**：产出 `github.pr.created/merged/commented`\n- **状态语义**：PR 状态\n- **外部接口**：Project GitHub View\n\n#### B1.14 Role Templates + Bindings\n- **Runtime 需求**：每个 role 绑定到某个 runtime + prompt 模板\n- **Chat 需求**：无\n- **Bus 事件**：产出 `role.binding.*`\n- **状态语义**：无\n- **外部接口**：Roles tab\n\n#### B1.15 Daily Review / Journal / Distill\n- **Runtime 需求**：每日调度一次 LLM 生成 journal\n- **Chat 需求**：无（单次生成，不是对话）\n- **Bus 事件**：产出 `review.generated / distill.completed`\n- **状态语义**：无\n- **外部接口**：`orbit review daily`\n\n#### B1.16 Runtime Adapter（Phase 3）\n- **Runtime 需求**：Claude / Codex / Copilot adapter，声明能力，翻译 vendor 事件 → UnifiedAgentEvent\n- **Chat 需求**：向 chat 提供标准化事件（当前已部分做到）\n- **Bus 事件**：产出 UnifiedAgentEvent 流\n- **状态语义**：无\n- **外部接口**：内部\n\n#### B1.17 Runtime Fallback + Budget（Phase 3）\n- **Runtime 需求**：所有 adapter 声明错误分类\n- **Chat 需求**：chat 里要能看到\"切了 runtime\"的提示\n- **Bus 事件**：产出 `runtime.switched / budget.exceeded / budget.warning`\n- **状态语义**：无（无状态规则）\n- **外部接口**：Settings / Inbox 警示\n\n#### B1.18 Switch Runtime（Phase 4.0 扩展）\n- **Runtime 需求**：能在运行中切换 runtime，transcript 能续过去\n- **Chat 需求**：chat 要能在\"切 runtime\"时保持历史连续性\n- **Bus 事件**：产出 `runtime.switched`\n- **状态语义**：会话级（不改 task 状态）\n- **外部接口**：`orbit task switch-runtime`\n\n#### B1.19 Task Lifecycle Reducer（Phase 4.0）\n- **Runtime 需求**：无\n- **Chat 需求**：chat 里发消息 → 某种事件进总线 → reducer 判断要不要改 task status\n- **Bus 事件**：订阅 `user.message.in_chat / agent.awaiting_user / agent.completed / dependency.*`；产出 `task.status_changed / session.status_changed`\n- **状态语义**：就是它本身\n- **外部接口**：`orbit dev:lifecycle`\n\n---\n\n### B2. 明确要做但尚未动工的功能\n\n#### B2.1 Sandbox ExecutionContext（open-question #1）\n- **Runtime 需求**：非代码项目的执行容器，可能不是 git worktree 而是快照 + 副本\n- **Chat 需求**：和代码项目的 chat 外观一致\n- **Bus 事件**：产出 `sandbox.snapshot.* / sandbox.change.proposed`；审查流复用 Inbox\n- **状态语义**：新一套 Sandbox 内部状态机，但**对外 task 状态机保持一致**\n- **外部接口**：`orbit sandbox *`（新）\n- **压力测试**：**ExecutionContext 抽象的真实考验**。如果 Sandbox 接不上 ADR-003 的抽象，说明抽象要改\n\n#### B2.2 阅读器 + 订阅源扩展（open-question #4/#5）\n- **Runtime 需求**：阅读中叠加\"和文章对话\"的能力（未来）；订阅源抓取本身可能需要调 LLM 做摘要\n- **Chat 需求**：**阅读器 + 文章讨论 chat** 作为 Stage View 的一个新实例\n- **Bus 事件**：产出 `library.read_progress / library.annotation.created`；订阅 `feed.new_items / chat.message.sent`（如果文章上叠 chat）\n- **状态语义**：阅读进度 / 标注生命周期\n- **外部接口**：`orbit library *` / 浏览器插件 / 手机 share endpoint\n\n#### B2.3 Note 功能全套（目前只有底层 markdown 编辑）\n- **Runtime 需求**：笔记上叠 agent（问 / 续写 / 提炼）\n- **Chat 需求**：Note + Chat 的 Stage View 实例\n- **Bus 事件**：产出 `note.* / annotation.*`；订阅 chat 事件（如果有）\n- **状态语义**：待定\n- **外部接口**：`orbit note *`（新）\n- **压力测试**：**笔记和 chat 谁主谁次？** 是\"笔记上叠 chat（chat 辅助）\"还是\"chat 产出笔记（chat 主，笔记是产物）\"？\n\n#### B2.4 全局 Ask-Anywhere / AI 助手\n- **Runtime 需求**：全局启动一个 agent，访问整个 vault\n- **Chat 需求**：**典型的 Chat 作为一等公民**的场景——没有 task 上下文\n- **Bus 事件**：产出 `ask.query.* / ask.answer.*`；订阅几乎所有只读事件（作为 context）\n- **状态语义**：每次会话独立，或持久的单一\"助手对话\"\n- **外部接口**：全局快捷键 / 桌面 widget / 未来 iOS Node\n\n#### B2.5 定时任务 Agent / Cron\n- **Runtime 需求**：调度器触发 → agent 跑 → 结果入 Inbox\n- **Chat 需求**：定时跑的 agent 产生的对话历史要落在某个地方（Thinking Trail？新 entity？）\n- **Bus 事件**：产出 `cron.tick / scheduled_task.started/completed`；订阅 cron 配置变更\n- **状态语义**：Scheduled task 生命周期（enabled / running / history）\n- **外部接口**：`orbit scheduled-task *`（新）/ Settings 界面\n\n#### B2.6 外部 Channel 控制（Telegram / WhatsApp / Email webhook / ...）\n- **Runtime 需求**：**Runtime 也可以是\"入站 channel 后面的 agent\"**（openclaw 模型）\n- **Chat 需求**：**入站消息 → 进入应用内某个 chat 会话**；**应用内 agent 产出 → 出站到 channel**\n- **Bus 事件**：产出 `channel.inbound.message / channel.outbound.message / channel.paired / channel.dm_policy.*`\n- **状态语义**：Channel pairing + allowlist 状态\n- **外部接口**：Gateway 式的 WebSocket / HTTP endpoint\n- **压力测试**：**最关键的压力点**。现在 Orbit 是 Electron 桌面应用，没有 Gateway。要不要建 Gateway？是应用内内置还是独立进程？\n\n#### B2.7 任务执行全流程打通（create → execute → worktree → PR → merge）\n- **Runtime 需求**：runtime 产出的代码走 ghost → pre-merge → PR 一条线\n- **Chat 需求**：chat 里能看到每一步进展（\"正在 pre-merge check…\"、\"已创建 PR #42…\"）\n- **Bus 事件**：订阅 task / runtime / worktree / github 全链路事件，pipeline 式串起来\n- **状态语义**：**这其实是 task 状态机的完整呈现**\n- **外部接口**：复用现有\n- **压力测试**：**现状已经\"基本打通\"但细节碎（比如 PR 合入后 task 自动 done 的闭环还不顺滑）**。这是验收 task lifecycle 是否真正干净的试金石\n\n#### B2.8 Thinking Trail 自动化（open-question #2）\n- **Runtime 需求**：事后 LLM 分析对话识别关键跃迁点\n- **Chat 需求**：任意 chat 都可以\"保存为 Thinking Trail\"\n- **Bus 事件**：订阅 chat 历史、agent 事件；产出 `thinking_trail.created/pivot_identified`\n- **状态语义**：Thinking Trail 生命周期\n- **外部接口**：`orbit thinking-trail *`\n\n#### B2.9 对话沉淀 → Project（ROADMAP Phase 4 后续）\n- **Runtime 需求**：LLM 分析 Thoughts / Chat 主题聚集\n- **Chat 需求**：如果是从 Ask-Anywhere 聊着聊着就\"立项\"——chat 必须能输出一个 \"propose_new_project\" 事件\n- **Bus 事件**：产出 `chat.propose_project`\n- **状态语义**：Propose → Approve 走 ADR-006 propose-approve\n- **外部接口**：复用 propose-approve 流\n\n#### B2.10 Review 页面 UI\n- **Runtime 需求**：无\n- **Chat 需求**：无\n- **Bus 事件**：订阅历史 Activity → 时间轴渲染\n- **状态语义**：无\n- **外部接口**：Review view\n\n---\n\n### B3. 隐约要做但还没想透的（可能的未来）\n\n#### B3.1 多设备 / iOS Node / macOS menubar app（类似 openclaw）\n- 一台机器上的 Orbit 作为 Gateway，手机 / 平板作为 node 接入\n- 压力点：应用总线必须可跨设备（WebSocket 桥接？）\n\n#### B3.2 Voice Log / Voice Wake（open-question #4）\n- 声音作为 channel，转写为文本消息进入 chat / Thought\n\n#### B3.3 浏览器插件 / 手机 share endpoint\n- 外部来源直接往应用总线投递 Capture 事件\n\n#### B3.4 Orbit 自我进化（open-question #3）\n- Agent 读 Activity + Thinking Trail + Distillation → 主动 propose\n\n#### B3.5 跨 Vault / 多 Vault\n- 一个用户多个 vault？Vault 间引用？（open-question 里隐约提及）\n\n#### B3.6 跨项目任务依赖（open-question #10）\n- 只支持同项目依赖的局限\n\n#### B3.7 批量处理 Inbox（open-question #7）\n- Gmail 式多选操作\n\n---\n\n## §C 压力测试问题（给后续阶段当检查项）\n\n每个问题都是\"新骨架能不能装下\"的 sanity check。任何阶段 2/3/4 的设计如果不能回答 Yes，就是设计有缺陷。\n\n### C1. 关于 Chat 的压力\n\n1. Chat 组件能否在**没有任何业务订阅者**的情况下，挂一个 mock runtime 就能跑（只发消息、接收回复、展示工具调用）？—— 这是 Chat 业务无关的验证\n2. Ask-Anywhere / 阅读器 chat / 笔记 chat 是**同一个 Chat 组件**的不同 host，还是不同组件？\n3. 外部 channel（Telegram）的消息进来后**是否使用同一套 Chat 组件**？还是只是数据同构？\n4. Chat 的\"tool_use 卡片渲染\"该谁注册？（runtime 声明 tool kind，chat 渲染框架提供插槽，宿主业务注册渲染器——这是我的直觉切法）\n5. 如果 chat 不知道 task / proposal 的存在，**审批卡片**怎么渲染？（\"渲染器插件\"机制？chat 提供 `renderInline({kind, payload})`，业务模块提前注册 kind 对应的渲染器？）\n\n### C2. 关于 Runtime 协议的压力\n\n1. **内置 runtime**（未来如果 Orbit 内置一个不需要外部 CLI 的 agent）是否天然符合 UnifiedAgentEvent？\n2. **外部 channel 后面的 agent**（Telegram 用户在对话）是否能被抽象成 runtime？（感觉不完全能——它们更像\"另一个 chat surface\"而非 runtime）\n3. 未来如果要接 **OpenAI Assistants API / Anthropic Claude Agent SDK / Google ADK**（都是 API 形态，非 CLI）——现有 adapter 层能装下吗？\n4. Sandbox 的 runtime 会不会和 Worktree runtime 完全一样？还是 runtime 需要声明\"我支持哪种 ExecutionContext\"？\n5. 定时任务 runtime 和交互式任务 runtime 用**同一个 runtime adapter**，还是不同？\n\n### C3. 关于应用总线的压力\n\n1. Telegram 消息进来 → 总线上派发 → 某个 agent 捕获并回复 → 出站回 Telegram：**这条链路的事件如何不泄漏业务**？（用户不是关心\"谁发的\"，关心\"什么问题\"）\n2. Cron 定时触发 → 总线上派发 → auto-runner 捕获 → 派发给某个 runtime：**如何避免 cron 模块知道 auto-runner 的存在**？\n3. 全局 Ask-Anywhere 用户问\"我最近在做什么\"：总线如何提供\"只读查询\"能力？是纯事件流（让助手翻历史）还是可以 `bus.query(source=activity, filter=last-7d)`？\n4. Replay 一整天的事件：能否精确重现那天的 UI 状态？（这是升格后的杀手级价值）\n5. 日志式 vs 消息式：如果某个业务错过了事件（订阅者崩了），能不能靠重放恢复？如果可以，这就是日志式；如果订阅者失败就丢，这就是消息式\n\n### C4. 关于架构干净度的压力\n\n1. `grep 'task' src/components/chat/**` 能否返回 **0 行**？\n2. `grep 'inbox' src/runtime/**` 能否返回 **0 行**？\n3. Inbox 模块能否整体替换（比如换成 Plan B 视觉）**不需要动 chat/runtime/bus 一行代码**？\n4. 新增一个 channel（比如 Slack）能否**只加一个 channel adapter + 在配置里声明订阅规则**，零侵入其他模块？\n5. 关掉 Auto-runner 功能，其他功能是否**完全不受影响**（包括手动触发的 agent run）？\n\n---\n\n## §D 我需要你口述确认的功能细节\n\n以下是我从现有文档**看不出来**但会影响本次架构的细节，请你补充：\n\n### D1. 全局 Ask-Anywhere 的形态\n- 它是\"像 Raycast/Spotlight 的浮层\"还是\"一个独立的 chat view\"？\n- 它有持久会话（一个\"和 Orbit 本体的对话\"）还是每次新开？\n- 它能直接操作 vault 内容吗（下发 CLI 命令）？还是只读?\n\n### D2. Telegram / 外部 channel 的深度\n- 你想做到\"用 Telegram 发一条消息 → Orbit 里某个 agent 处理 → 结果回 Telegram\"这种完整闭环？\n- 还是只做\"Orbit 能往 Telegram 推通知\"这种单向？\n- 你倾向自建 Gateway（像 openclaw）还是让 Orbit Electron 主进程直接当 Gateway？\n\n### D3. 定时任务 agent\n- 定时任务跑完后，结果进 Inbox 还是进某个新 view？\n- 定时任务是**某个项目下的定时**（跟 project 绑定）还是**全局**？\n- 用户交互面是 Settings 下的一个列表，还是 CLI first？\n\n### D4. 任务全流程打通的\"卡点\"\n- 你现在觉得 create → execute → worktree → PR → merge 这条线**具体哪一步最不顺**？\n- 当前\"PR merge 后 task 自动 done\"这个闭环是断的吗（我记得现状是 merge 人审后 task 才转 done，没有全自动路径）？\n\n### D5. Sandbox 的严肃性\n- Sandbox 对你是\"必须要做\"还是\"可能做\"？\n- 你脑子里 Sandbox 和代码项目的差异大吗（只是\"没有 worktree\"还是\"连执行方式都不同\"）？\n\n### D6. 笔记的野心边界\n- 你说的\"笔记各种功能\"具体是什么？是 Obsidian 式的（双向链、tag、graph）还是更多（AI 续写、讨论、折叠为 outline）？\n- 笔记和 Thought 的边界在哪？Thought 升格成笔记后还是同一个东西吗？\n\n### D7. 应用内 Runtime\n- 你提到\"未来可能做应用内的 runtime\"——指什么？是\"不依赖外部 CLI 的内置 agent\"（比如直接调 Anthropic API）？还是更轻量的\"快速回答、不用 spawn 进程\"的 runtime？\n- 它和外部 CLI runtime 在**能力声明**上是否要有区分？\n\n### D8. 参考 openclaw 的深度\n- 你的意图是\"借鉴它的 channel/gateway 思路\"还是\"某种程度复用它的架构\"？\n- 你对\"让 Orbit 变成一个 Gateway + 多 channel 接入\"的接受度如何？\n- 还是说你只想要其中\"channel 抽象让外部能双向控制应用\"这一点？\n\n---\n\n## 对后续阶段的输出\n\n本阶段结束后，§A 的\"骨架必须支持的维度清单\"和 §C 的\"压力测试问题\"将成为后续所有阶段的**强制检查项**。\n\n- 阶段 1（Runtime 调研）必须对齐 §A.A1\n- 阶段 2（应用总线）必须回答 §C.C3 的所有问题\n- 阶段 3（Chat 协议）必须通过 §C.C1 / C.C2 的检查\n- 阶段 4（架构压测）按 §B 逐个功能走一遍并验 §C.C4\n- 阶段 5（迁移）以 §B.B1 的现有实现为起点\n","toolExplanation":"写阶段 0 全功能盘点文档"})

---

## [Tool] 2026-04-27T04:21:22.522Z
{"path":"/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit/docs/thinking-trail/2026-04-29-chat-unification-decoupling/00-feature-landscape.md","size":23295,"append":false}

---

## [Assistant] 2026-04-27T04:21:59.947Z
阶段 0 全功能盘点的草稿写完了（20KB）。这份文档是后续所有讨论的参照物。

---

## 阶段 0 汇报

### 产物结构
- `docs/thinking-trail/2026-04-29-chat-unification-decoupling/README.md` — 索引 + 六阶段进度
- `docs/thinking-trail/2026-04-29-chat-unification-decoupling/conversation.md` — 原始对话记录（会随推进追加）
- `docs/thinking-trail/2026-04-29-chat-unification-decoupling/00-feature-landscape.md` — **本阶段主产物**

### 00-feature-landscape.md 的三个核心章节

**§A 骨架必须支持的 6 个维度**（从所有功能归纳）：
- A1 多 Runtime 抽象（Chat ⊥ Runtime）
- A2 多 Chat Surface（同构 UI 组件）
- A3 应用总线（TraceableEvent 升格）
- A4 订阅声明 + 业务处理分离
- A5 跨边界消息（main ↔ renderer ↔ 外部 channel）
- A6 可 Replay + 可时间旅行

**§B 五字段功能盘点**（Runtime / Chat / Bus / 状态 / 外部接口）：
- B1：已落地 19 个子系统
- B2：明确要做 10 个
- B3：隐约要做 7 个

**§C 压力测试问题**（后续阶段的硬检查项）：
- C1 chat 业务无关性 5 问
- C2 runtime 协议覆盖 5 问
- C3 应用总线边界 5 问
- C4 架构干净度 5 问

### 我识别出的几个**关键架构压力点**（阶段 0 的副产物）

1. **Sandbox 是 ExecutionContext 抽象的真实考验**——如果它接不上 ADR-003 现有抽象，说明抽象要重新切
2. **外部 Channel（Telegram 等）是最大的压力源**——它逼着 Orbit 从"Electron 单体应用"演化成"Gateway + Multi-client"架构，这是**本次讨论里最需要你拍板的战略选择**
3. **全局 Ask-Anywhere = 典型的"chat 作为一等公民"场景**——它没有 task context，完美验证 Chat 业务无关
4. **"任务全流程打通"(create→PR→merge) 现状断点在 merge 后 task 闭环**——这是 task state reducer 的延伸工作
5. **Note vs Thought vs Library 的边界模糊**——笔记野心越大，对 chat / stage view 的压力越大
6. **定时任务 Agent 是 Runtime 概念的扩展**——非交互式 runtime 要不要走同一套抽象？

### §D 我需要你口述补充的 8 个功能细节

这些从文档里看不出来，得你告诉我：

1. **D1** 全局 Ask-Anywhere 的形态（浮层 or 独立 view？持久会话 or 每次新开？读写 or 只读？）
2. **D2** Telegram/channel 深度（双向闭环 or 单向通知？自建 Gateway or Orbit 直接承担？）
3. **D3** 定时任务 agent 的范围（项目级 or 全局？结果去哪？）
4. **D4** 任务全流程哪一步最卡（merge 后 task 闭环是否断？）
5. **D5** Sandbox 的严肃性（必须做 or 可能做？差异多大？）
6. **D6** 笔记野心边界（Obsidian 式 or 更多 AI 能力？Thought 怎么升格？）
7. **D7** 应用内 Runtime 是什么（内置 agent？API 直连？轻量 runtime？）
8. **D8** 参考 openclaw 的深度（借鉴 channel 抽象 or 更激进？）

---

## 下一步

按你选的六阶段顺序，下一步是**阶段 1：Claude / Codex Runtime 协议调研**。但我想先等你：

1. **审阅阶段 0 文档**（尤其是 §A 骨架维度清单、§C 压力测试问题）——有没有漏的维度、有没有问错的问题
2. **回答 §D 的 8 个问题**——这些答案会严重影响阶段 2（总线）和阶段 4（压测）的设计
3. **告诉我阶段 1 是否现在就开始**，还是你想先把 §D 聊透再并行 runtime 调研

如果你现在就想让我开干阶段 1，我会去：
- 扒 Claude Code stream-json 协议官方文档
- 扒 Codex CLI / OpenAI Responses API 协议
- 读你们现有的 `src/main/agent/adapter/` 里 ClaudeAdapter 的实际实现
- 产出 `01-runtime-protocol-survey.md`：两家协议的完整矩阵 + 两家都有 / 只有一家 / 都没有但我们想要 的三分表

等你回复。§D 的答案不着急，我不阻塞——你可以先让我开阶段 1，§D 你慢慢来随时补。

---
