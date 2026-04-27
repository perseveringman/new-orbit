# Orbit Chat 解耦重构 · 一次性实施提示词

> 粘贴此文件的**全部内容**给另一个 AI agent 即可启动实施。
> 无需额外说明，它会自主读取所有文档并推进。

---

## 你的任务

你是 Orbit 项目的高级工程师，现在需要一次性完成一次重大架构重构。这次重构的设计文档已经齐全，你不需要做任何架构决策——你的唯一任务是**严格按照既定设计实施代码**，不偏离、不发明、不跳步。

**项目路径**：`/Users/ryanbzhou/Developer/vibe-coding/freedom/orbit-app/orbit`

**重构主题**：Chat 解耦 + Conversation 一等公民 + Ask-Anywhere 规划者代理

**预计工作量**：约 10 人日的代码工作（Phase M1-M7），你需要一次性完成全部。

---

## 第一步：必须先读的文档（按顺序，全部读完再开始写代码）

严禁在没读完以下文档前写任何代码。

### 战略决策层（理解"为什么"）
1. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/decisions-anchor.md` — **8 个核心决策（D-1~D-8），这是宪法，不可违背**
2. `docs/decisions/ADR-014-chat-decoupling-conversation-first-class.md` — 正式 ADR
3. `docs/decisions/ADR-015-ask-anywhere-as-planner-proxy.md` — 正式 ADR

### 设计规范层（理解"是什么"）
4. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/00-feature-landscape.md` — 全功能盘点（§E 硬约束必读）
5. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/01-runtime-protocol-survey.md` — Runtime 协议三层结构
6. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/02-app-bus-design.md` — AppBus 升级方案
7. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/03-chat-runtime-protocol.md` — **Chat↔Runtime 协议，核心规范**
8. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/04-architecture-stress-tests.md` — 5 个压测场景（实施时用作验证）

### 执行计划层（理解"怎么做"）
9. `docs/thinking-trail/2026-04-29-chat-unification-decoupling/05-migration-plan.md` — **Phase M1~M7 分解，严格按此顺序执行**

### 既有项目上下文（理解现状）
10. `docs/architecture.md` — 当前架构
11. `docs/decisions/ADR-008-ai-native-cli-first.md`
12. `docs/decisions/ADR-011-runtime-abstraction-through-capabilities.md`
13. `docs/decisions/ADR-013-unified-event-replay-infrastructure.md`
14. `CHANGELOG.md` — 了解最近的代码变更

### 确认读完
在开始写代码前，必须用自己的话输出以下信息作为"理解确认"：
- 8 个决策锚点各是什么（一句话各一个）
- RuntimeEvent 三层结构的每一层包含哪些 kind
- M1~M7 每个 Phase 的产物和依赖关系
- Chat 组件的 grep 验证标准是什么

**如果你发现任何文档互相矛盾，停下来标记出来，等用户回答后再继续。不要自己做决定调和矛盾。**

---

## 执行纪律（严格遵守）

### 铁律 1：按 Phase 顺序推进，不跳步、不并行

严格按 `05-migration-plan.md` 的 M1 → M2 → M3 → M4 → M5 → M6 → M7 顺序执行。M8（Gateway Daemon）**不在本次实施范围**，跳过。

每完成一个 Phase：
1. 自检该 Phase 的"验证"条目是否全部通过
2. 运行 `npm run build` 确保没有编译错误
3. 运行 `npm test`（如果有）
4. 在 `CHANGELOG.md` 里加一条记录
5. 然后才能进入下一个 Phase

**严禁同时跨 Phase 修改代码**——一次只推进一个 Phase。

### 铁律 2：不偏离设计

如果在实施中发现设计问题（例如某个类型定义不够用、某个数据流走不通）：

1. **不要自己修正设计**
2. **不要"顺便优化"**
3. 在 `docs/thinking-trail/2026-04-29-chat-unification-decoupling/IMPLEMENTATION_NOTES.md` 里记录"发现的问题 + 你的临时处理方案"
4. 选择**最保守**的方案继续（通常是加兼容层、TODO 注释、@deprecated 标记）
5. 继续推进

用户会在事后 review 这些笔记，决定是否修正设计。

### 铁律 3：保持可部署性

每个 Phase 完成后，主分支必须：
- 能编译通过
- 现有功能（Task 执行、Inbox、Planner、Project View）**不退化**
- 即使新功能未完成，旧功能的用户体验不变

这意味着：
- M1-M5 期间，旧的 TaskConversation / Planner 代码保留并能工作
- M6 完成后 Ask-Anywhere 才是"可用"的
- M7 才正式退役 Planner

### 铁律 4：业务无关的 Chat 组件

**这是本次重构的核心目标，必须死守**。

M4 完成后，以下命令必须返回**空结果**：

```bash
grep -rE 'task|inbox|proposal|planner|vault|project' src/renderer/components/Chat/
```

（排除注释中的说明、ADR 引用、测试数据。仅指代码实际引用。）

如果你发现 Chat 组件必须知道某个业务概念才能工作——**那说明你走错了**，是 Host 应该处理，不是 Chat。回去重读 `03-chat-runtime-protocol.md` §5。

### 铁律 5：数据迁移必须兼容读旧格式

任何现有存储格式的变更（TaskConversation → Conversation、AgentEvent → RuntimeEvent、TraceableEvent type→kind）必须：
- 新写入用新格式
- 读取时兼容旧格式
- 提供一次性数据迁移工具（或在启动时自动迁移）
- **不允许**让用户已有的 vault 数据丢失或损坏

### 铁律 6：不引入新依赖（除非 package.json 里已有）

不要 `npm install` 新包。所有实现用现有依赖完成。如果确实缺某个能力（如 wildcard event emitter），先查 `package.json` 看能不能用现有的，再不行就手写简单实现。

### 铁律 7：代码风格遵循既有规范

- TypeScript 严格模式（已配置）
- 禁止 `any` 逃逸——如果真需要用 `unknown` + type guard
- 所有 public API 加 JSDoc
- 文件头部不加版权声明（项目没这习惯）
- import 顺序：node 内置 → 第三方 → `@shared/*` → 相对路径
- 命名：文件 kebab-case，类型 PascalCase，函数 camelCase

---

## 推进节奏

你需要一次性跑完全部。不要问用户"是否继续"。不要停下等确认。

唯一可以停下的情况：
1. **发现文档明显矛盾**（见铁律 2）
2. **发现现有代码严重破损**导致无法继续（先修复再继续，不要跳过）
3. **所有 Phase 完成**（M1~M7 全绿）

除此之外，持续推进。遇到小问题就在 IMPLEMENTATION_NOTES.md 里记录然后绕过。

---

## 每个 Phase 的完成标准

### M1: 基础设施升级
- `src/shared/events/kinds.ts` 存在，定义了 `TRACEABLE_EVENT_KINDS`
- `src/shared/events/payloads.ts` 存在
- `src/shared/events.ts` 的 `TraceableEvent` 有 `kind` 字段（兼容 `type`）
- `publishTraceableEvent` 支持传 `kind`
- 现有 DeveloperConsoleView 仍能显示事件
- `npm run build` 通过

### M2: RuntimeEvent 协议
- `src/shared/chat-protocol/events.ts` — RuntimeEvent 17 种 kind
- `src/shared/chat-protocol/actions.ts` — ChatAction 9 种 kind
- `src/shared/chat-protocol/host.ts` — ChatHost 接口
- Claude/Codex adapter 输出 RuntimeEvent
- 现有 Task 执行功能不变
- `npm run build` 通过

### M3: Conversation 数据模型
- `src/shared/conversation/types.ts`
- `src/main/conversation/store.ts` — NDJSON 存储
- `src/main/conversation/orchestrator.ts` — 生命周期管理
- `src/main/conversation/ipc.ts` — IPC 接口
- 能创建 Conversation，能 append turn，能持久化和读取
- 压测：手动创建一个 Conversation，写 3 个 turn，重启后能读出来

### M4: Chat 组件（纯渲染器）
- `src/renderer/components/Chat/ChatView.tsx` 实现完整
- grep 验证通过（见铁律 4）
- 用 Storybook / mock data 能渲染所有事件类型
- 支持 streaming 渲染

### M5: Host 适配层
- `TaskChatHost`、`InboxChatHost`、`AskAnywhereChatHost`（stub 也可，M6 完善）
- `TaskDetailView.tsx` 重构为使用 TaskChatHost + ChatView
- Task chat 功能回归通过（能发消息、能看到 agent 流式输出、能停止）
- UI 看起来和迁移前一致

### M6: Ask-Anywhere 实现
- `src/main/ask-anywhere/orchestrator.ts`
- `src/main/ask-anywhere/ipc.ts`
- `src/renderer/views/AskAnywhereView.tsx` — 左栏一级入口
- 悬浮球组件（右下角极简对话框）
- 左侧栏导航添加 Ask-Anywhere 入口
- 能完成基本对话：用户发消息 → Claude 响应 → 流式显示
- 能调用 `orbit` CLI 工具集（基础集：list projects、propose task、create thought 三个就够验证）

### M7: Planner 退役
- `ProjectPlannerView.tsx` 顶部加 deprecation banner（"Planner 已整合进 Ask-Anywhere"）
- Planner prompt 提取为 Ask-Anywhere skill（放在 `skills/ask-anywhere-planning/` 目录）
- 导航里 Planner 入口指向 Ask-Anywhere
- **不删除** ProjectPlannerView 代码，只冻结
- 手动测试：用 Ask-Anywhere 规划一个小项目，看产出是否合理

---

## 输出格式要求

### 每次修改文件后
用简短的中文报告："已修改 `path/to/file.ts`：<一句话说明>"

### 每个 Phase 完成后
输出结构化汇报：

```markdown
## ✅ Phase M<N> 完成

**修改的文件**：
- path/to/file1.ts: xxx
- path/to/file2.ts: xxx

**新建的文件**：
- path/to/new1.ts: xxx

**验证结果**：
- [x] npm run build 通过
- [x] 验收标准 1
- [x] 验收标准 2

**遇到的问题**：
- 无 / 已记录到 IMPLEMENTATION_NOTES.md 第 N 条

**进入 Phase M<N+1>**
```

### 全部完成后
输出最终汇报，包含：
- 总共修改的文件数和新建的文件数
- 每个 Phase 的完成时间点（粗略即可）
- IMPLEMENTATION_NOTES.md 里记录的问题数量和分类
- 用户需要手动验证的清单（用户重启 Orbit 后需要走的测试路径）

---

## 一些实施细节提示

### 关于 Ask-Anywhere 的 Claude runtime 选择
M6 实现时默认用 Claude（`claude -p` + stream-json）。理由：现有 `ClaudeRuntimeAdapter` 已支持双向通道，Ask-Anywhere 需要持久对话，Claude 更合适。

### 关于 orbit CLI 给 Ask-Anywhere 用
不需要新增 CLI 命令。Ask-Anywhere 直接调用现有 `orbit` 命令（`orbit project list`、`orbit task propose` 等）即可。如果现有 CLI 不够用，在 IMPLEMENTATION_NOTES.md 记录"Ask-Anywhere 用到但 CLI 缺失的命令"清单，供后续扩展。

### 关于 Gateway Daemon（M8）
**不做。** 本次实施只到 M7。M8 是独立 milestone，需要额外规划（涉及 launchd/systemd、WebSocket 协议、Telegram bot 注册等），不在本次范围。

### 关于测试
优先级：不破坏现有测试 > 给新组件写基本单测 > 写集成测试。

新组件至少保证：
- `ConversationStore` 有读写单测
- `ChatView` 有基础渲染单测（mock events 喂进去能渲染）
- 其他可选

### 关于 IPC channel 命名
遵循现有约定：`<module>:<action>`，例如 `conversation:get`、`conversation:list`、`askAnywhere:send`、`askAnywhere:subscribe`。

### 关于 Conversation 存储路径
按 ADR-014 的规范：`<vault>/.orbit/conversations/<conversation-id>.ndjson` + `<conversation-id>.meta.json`。`.orbit` 目录已有，直接新建 `conversations/` 子目录。

### 关于向后兼容
现有 TaskConversation 数据（如果有）在启动时自动转换为 Conversation（加 anchor kind: 'task'）。转换逻辑放在 `src/main/conversation/migrations.ts`。若失败，保留原文件，在 IMPLEMENTATION_NOTES.md 记录。

### 关于悬浮球
右下角，固定位置，z-index 高。点击展开右下角浮层（不是全屏）。浮层里就是一个 ChatView，用 AskAnywhereChatHost 驱动。关闭后保留对话状态（因为 Conversation 是持久化的）。

### 关于左侧栏 Ask-Anywhere 入口
放在最顶部（一级入口地位）。Icon 可选 Sparkles / Wand / MessageCircleQuestion（用 lucide-react 现有图标）。

### 关于用户认知连续性
旧 Planner 的入口**不要立刻移除**——保留 Planner 导航项一段时间，但点击后显示迁移提示并跳转到 Ask-Anywhere。用户需要时间适应。

---

## 最终检查清单（M7 完成后必过）

- [ ] `npm run build` 通过
- [ ] `npm run lint`（如果有）通过
- [ ] `npm test`（如果有）通过
- [ ] `grep -rE 'task|inbox|proposal|planner|vault|project' src/renderer/components/Chat/` 空结果
- [ ] 手动测试：创建 Task → 执行 → 看 chat 流式输出 → 完成（不退化）
- [ ] 手动测试：打开 Ask-Anywhere（左栏）→ 发消息 → 收到响应
- [ ] 手动测试：悬浮球 → 展开 → 发消息 → 收到响应
- [ ] 手动测试：Ask-Anywhere 里说"创建一个测试 task"→ orbit CLI 被调用 → Inbox 有新 proposal
- [ ] 手动测试：重启 Orbit → 之前的 Conversation 都还在
- [ ] CHANGELOG.md 有 M1~M7 的记录
- [ ] IMPLEMENTATION_NOTES.md 存在并完整

---

## 最后

这次重构的核心价值是**把"对话"这件事从业务里解耦出来成为一等公民**，以及**把"AI 前台"收敛到 Ask-Anywhere 一个入口**。

实施过程中如果你觉得"这么改好像有点啰嗦"或"直接把旧代码删了更干净"，请回头重读决策锚点 D-1 ~ D-8。那些看似啰嗦的设计（兼容层、anchor 数组、capability flag）都是为了未来的扩展性（Channel/iOS/内置 Runtime）服务的。

**不要为了"干净"牺牲"可迁移"。**

现在开始——先读所有文档，输出理解确认，然后启动 M1。

---

**祝顺利。完成后用户会手动 review。**
