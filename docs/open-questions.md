# Open Questions

> 本文记录 Orbit v2 方向确立过程中**被明确认识到但本期不做**的事项。它们是后续迭代的候选，同时也是"未定之事"的可见清单——避免这些想法被遗忘或重复讨论。

> **Last updated**: 2026-04-26（随 v2 方向确立新建）

每个条目给出：
- **上下文**：为什么这事值得讨论
- **当前状态**：为什么本期不做
- **期望阶段**：什么时候应该讨论 / 落地
- **相关**：关联的 ADR / plan / thinking trail

---

## 1. Sandbox ExecutionContext 的详细设计

**上下文**：
ADR-003 引入 ExecutionContext 抽象，本期落地 Worktree 实现适配新接口。但非代码项目（笔记/研究/写作）的 Sandbox 实现需要解决：

- 如何隔离笔记项目的修改（轻量文件副本？硬链接？overlay 文件系统？）
- 如何呈现"变更"让用户审查（diff view 的适配？版本比较？）
- 是否允许 Sandbox 项目启用 git 做快照（正交开关）
- Auto-runner 在 Sandbox 项目上的并发策略

**当前状态**：
本期只定抽象接口，Sandbox 代码不实施。Sandbox 项目（`execution_context: sandbox`）本期**无法运行 agent**，UI 显示"Sandbox 运行暂未实现"。

**期望阶段**：
v2 本期结束后的第一个迭代单独开一期设计 + 实施。建议 plan 名 `plans/sandbox-execution-context.md`。

**相关**：
- ADR-003
- `plans/2026-04-26-execution-model-migration.md`

---

## 2. Thinking Trail 子系统（AI 对话结构化留痕）

**上下文**：
2026-04-26 的 v2 方向对话本身已经手动实践了一次 Thinking Trail（见 `docs/thinking-trail/2026-04-26-v2-direction/`）。这次实践验证了：

- 原始对话（conversation.md）是不可压缩的黄金
- 结构化提炼（key-pivots + decisions-traced）是面向回溯者的索引
- 文档讲"是什么"，Thinking Trail 讲"为什么这样想"——两者互补

未来需要把这个能力**自动化**，让 Orbit 内每次与 agent 的重要对话都能自动留痕。

**涉及的设计问题**：

- 在什么粒度留痕（每次 chat？每次 session？按用户明确标记？）
- 存储在哪（`.orbit/thinking-trail/` ? `02_Areas/thinking/` ?）
- 如何识别"关键认知跃迁"（agent 事后自动分析？用户主动标记？）
- 与 Activity Log 的关系（互补还是合并？）
- 搜索与检索入口

**当前状态**：
本期 v2 只做了"手动实践"，没有落地自动化能力。

**期望阶段**：
Activity Log 成熟（本期）之后，下一个大迭代考虑。建议时机：当用户积累了 5+ 次对话 trail 后，对格式和分层形成直觉再正式落地。

**相关**：
- `docs/thinking-trail/2026-04-26-v2-direction/` (手动实践)
- ADR-009 Activity Log（互补关系）

---

## 3. Orbit 自我进化（基于 Activity Log + Thinking Trail + Distillation）

**上下文**：
三种数据源融合后，agent 可以观察用户的工作模式并主动给出建议：

- Activity Log：用户/agent 做过什么行为
- Thinking Trail：为什么这样想
- Distillation：过往项目提炼的经验

Agent 可以：
- 发现"用户最近一直在做 X 但从没做 Y"的模式
- 提出"是否把 Z 项目归档，数据显示已经 2 个月没动"
- 在新项目启动时推送"根据过往类似项目，你可能会遇到这些问题"

这是 Orbit 从"工具"升级到"思考伙伴"的关键能力。

**当前状态**：
数据基础的一部分（Activity Log）本期落地，另一部分（Thinking Trail）还是手动。全面能力的 agent 端没有开发。

**期望阶段**：
Activity Log 运行满 1-2 个月积累数据 + Thinking Trail 基础设施落地之后。建议作为一个大方向规划在 ROADMAP 的 P6。

**相关**：
- ADR-009 Activity Log
- 本文 #2 Thinking Trail

---

## 4. Quick Capture 的扩展入口

**上下文**：
本期 Quick Capture MVP 只做 Thought（全局快捷键 + 轻量浮层）。完整的 Capture 能力应覆盖：

- **Library Quick Capture**：浮层内切到 "Save URL" 模式 → 粘贴链接 → 后台抓取 → 存 Library
- **Feed Quick Capture**：浮层切到 "Add Subscription" → 粘贴 RSS URL → 加订阅源
- **剪贴板识别**：打开浮层时检测剪贴板，URL 自动切 Library，长文本切 Thought
- **Voice Log**：按住某键录音 → Whisper 本地转写 → 存 Thought
- **手机 share endpoint**：本地 HTTP server + iOS Share Sheet 配置
- **浏览器插件**：一键把当前页面 save 到 Library

**当前状态**：
仅 Thought 入口落地。其他都是"扩展清单"。

**期望阶段**：
v2 本期结束后的第一轮迭代。建议按优先级：剪贴板识别 > Library 粘贴 > 浏览器插件 > 手机 share > Voice Log。

**相关**：
- ADR-010
- `plans/2026-04-26-quick-capture-mvp.md` 的"后续扩展（下期）"章节

---

## 5. Feed 的多来源支持

**上下文**：
本期 Feed 只支持 RSS。用户提到的其他价值来源：

- Twitter / X：需要 API 访问（可能是付费 + 复杂认证）
- GitHub Trending：可通过 web scraping / GitHub API
- Hacker News：有简单 API（https://github.com/HackerNews/API）
- Substack：部分作者提供 RSS，部分需要 scrape
- YouTube Feed：有 RSS（每个频道）
- Reddit：有 RSS
- Medium：RSS

**当前状态**：
RSS only，其他来源"后续"。

**期望阶段**：
Feed RSS 上线稳定后第一轮扩展。建议每个来源作为"插件"（Feed Source Plugin）接入，不要在核心系统里硬编码。

**相关**：
- ADR-010
- `plans/2026-04-26-capture-foundation.md`

---

## 6. Inbox 历史检索

**上下文**：
归档的 Messages 和 Library / Library Promotes 值得跨时间搜索。例如：
- "我上个月批准了什么 merge？"
- "过去一年我在 Library 里读过哪些关于 LLM 的文章？"
- "哪些 agent proposal 被我 reject 了，常见理由是什么？"

这涉及全文索引、时间过滤、语义搜索。

**当前状态**：
UI 上没有历史检索入口。底层数据（NDJSON）存在，可以事后补索引。

**期望阶段**：
用户有过明确的"想查历史却找不到"的场景后。建议时机：积累半年数据量后再开发。

**相关**：
- ADR-004 Inbox

---

## 7. Inbox 批量处理

**上下文**：
Gmail 风格的"多选批量 approve / 批量 dismiss"能大幅降低处理成本，但对 Approval 类有"不看内容一键批"的风险。

**当前状态**：
本期不做。

**期望阶段**：
Inbox 基础版上线并用一段时间后，根据用户实际痛点决定。允许范围建议：
- C / D 类可批量（警示/纪律类风险低）
- A / B 类不允许（审批/求助要逐条看）

**相关**：
- ADR-004

---

## 8. Review 页面 UI

**上下文**：
Activity Log 本期落地基础设施，但用户看不到可视化。Review 页面应该提供：
- 今日时间轴
- 本周/本月汇总
- 按 action / actor / project 分组筛选
- 跨时间的"我做过什么"检索

**当前状态**：
数据已经在积累，UI 待建。

**期望阶段**：
v2 本期实施完毕 + Activity Log 运行 1-2 周后。建议 plan 名 `plans/review-page-ui.md`。

**相关**：
- ADR-009

---

## 9. MCP 观察期决策

**上下文**：
ADR-008 废弃 MCP 转向 CLI-first，但留了观察期。需要在观察期后决策：

- 如果 agent CLI 错误率低 → 保持纯 CLI，删除 MCP 代码
- 如果错误率高 → 重新引入 MCP 作为补充（全部还是部分？）
- 中间情况 → 保留 CLI 主通道，MCP 作为"特别高可靠性要求场景"的补充

**需要监控的指标**：
- Agent 调用 CLI 命令的参数错误率（通过 Activity Log + exit code）
- Agent 放弃任务的比例
- Agent 重试次数

**当前状态**：
MCP 关闭但代码保留在 `src/mcp/`。观察期至少 1-2 个月。

**期望阶段**：
v2 本期上线后 2-3 个月做一次评估。

**相关**：
- ADR-008

---

## 10. 跨项目任务依赖

**上下文**：
ADR-007 的 v1 只支持 task-to-task 同项目依赖。如果用户真实场景有跨项目依赖（比如"Project X 完成后，Project Y 才能开始"），当前只能通过 Markdown wikilink 粗糙表达。

**设计问题**：
- 跨项目依赖的查询性能（需要扫描所有项目的 task 吗？）
- UID 全局唯一性是否已保证
- UI 如何呈现跨项目依赖

**当前状态**：
不支持，也没有明确的用户需求信号。

**期望阶段**：
有真实用户反馈后再考虑。可能永不实施（如果粗糙的 wikilink 就够用）。

**相关**：
- ADR-007

---

## 11. Feed History 的 GC 策略

**上下文**：
Feed History 本期永久保留，清理交给 AI 用文件系统做。未来如果磁盘占用问题显现：

- 按月压缩？
- Agent 自动生成月度摘要并归档？
- 按重要性保留？

**当前状态**：
永久保留 + 手动 AI 清理。

**期望阶段**：
实际磁盘使用 > 500MB 或用户反馈影响性能时。

**相关**：
- ADR-010

---

## 12. Agent 主动创建 Thought 是否需要审批

**上下文**：
`plans/2026-04-26-capture-foundation.md` 的开放问题之一。本期默认允许 agent 直接 `orbit thought create`（不走 propose-approve），因为：
- Thought 是原材料，不入看板
- Agent 帮用户记录不算扩张系统状态
- 用户可在 Inbox 随时 dismiss

**可能的问题**：
- Agent 滥用（每对话都记一堆无用 thought）
- 干扰用户的 Thought 流（混入了非用户意图的记录）

**当前状态**：
本期允许，无限制。Activity Log 记录 actor 便于事后分析。

**期望阶段**：
上线后观察 3 个月，根据实际 agent 行为决定：
- 如果滥用不明显 → 保持现状
- 如果 agent 每次对话都创建 5+ Thought → 加频率限制（每 run 最多 N 次）或走 propose

**相关**：
- ADR-010

---

## 13. Stage View 抽象的完整化 + Planner 重构

**上下文**：
ADR-005 承认 "Stage View"（chat + 产物舞台）是通用模式，但本期**不重构** v1 的 Planner。新增的 Inbox / 未来的对话类 feature 都会采用 Stage View，但 Planner 还是独立实现。

**等 Stage View 抽象在 Inbox 实施中稳定后**，可以考虑：
- 回头把 Planner 的 "Plan Chat" 迁移到 Stage View
- 抽取公共的 layout / IPC / state 管理
- UI 一致性提升

**当前状态**：
Stage View 在 Inbox 实施中探索。Planner 保持 v1。

**期望阶段**：
Inbox v2 上线并稳定运行 1-2 个月后，根据抽象的实际可复用度决定。

**相关**：
- ADR-005

---

## 14. CLI 跨平台适配

**上下文**：
本期 Orbit 主要 mac-first。CLI 的几个跨平台问题：

- Unix socket vs Named Pipe（macOS/Linux vs Windows）
- 路径分隔符
- Shell quoting 差异（bash vs PowerShell vs cmd）
- `PATH` 前置方式
- `bin/orbit` shim 脚本的执行权限

**当前状态**：
Unix socket 方案 + 仅 macOS/Linux 充分测试。Windows 需要单独打包 + 测试。

**期望阶段**：
Linux / Windows 打包时（见 ROADMAP P9）。

**相关**：
- ADR-008
- `plans/2026-04-26-cli-migration.md`

---

## 15. 对话记录（Thinking Trail）与 Chat 内容的边界

**上下文**：
Thinking Trail 目标是记录 agent 与用户的对话推理过程。但 Orbit 里的 chat 有多种：
- Task Conversation chat（和 agent 讨论单个 task）
- Planner chat（planner agent 设计任务画布）
- 未来可能的 Note chat、Reading chat

不是所有 chat 都值得进 Thinking Trail（比如日常问 agent "这段代码什么意思"这种问答）。

**设计问题**：
- 什么标准决定"值得留痕"（用户手动标记？按消息数？按时长？）
- 短对话（<10 条）是否记录
- 隐私/大小控制

**当前状态**：
没有自动化，全靠用户选择是否 "Save as Thinking Trail"（未来）。

**期望阶段**：
Thinking Trail 子系统设计时（见 #2）一并考虑。

**相关**：
- 本文 #2

---

## 16. Agent Proposal 滥用防御

**上下文**：
如果 agent 在 Auto-runner 下过度 propose（每小时 10+ 次），会打扰用户。防御措施待设计：

- Per-run proposal count limit
- Agent 提议接受率统计 → 接受率持续低的 agent 要在 prompt 中收敛
- Inbox 中 "mute this run's proposals" 功能
- Agent-level / Role-level 的 propose quota

**当前状态**：
本期只靠 system prompt 引导边界，没有机制性限制。

**期望阶段**：
上线后观察 agent 行为，根据实际问题设计。

**相关**：
- ADR-002
- ADR-006

---

## 如何更新本文

- 新认识到的"应该做但本期不做"的事项 → 追加新条目
- 已经开始实施的条目 → 标记 "in progress"，链接到实施 plan
- 已经完成或决定不做的条目 → 移到文件底部的 `## 已解决 / 已决定不做` 区（未来可加）
- 每次大迭代 review 时扫描本文，评估哪些条目可以提升到 ROADMAP 的 P1/P2

本文件应当**长期演进**，不是一次性文档。
