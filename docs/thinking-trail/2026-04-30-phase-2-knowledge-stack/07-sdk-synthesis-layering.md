# 文档 7：SDK 接入 · Synthesis 层 · 三层数据架构 · Feeds/Resource/Area 流转

> **规模**：XL（跨越 3 个彼此相关的决策域，单独立文以承载它们的共识）
> **依赖**：本 phase 其他文档（01 笔记 / 03 Gateway / 05 Timeline / 06 Resource）
> **产物**：Anthropic SDK 接入方案 · 全局 Synthesis Layer · 数据三层模型 · Feeds → Library → Resource → Area 的完整流转图
> **状态**：thinking-trail，最后一次对话（2026-04-30 尾段）后汇总，下一步会被提炼成 ADR 与 plan

---

## 0. 背景

Phase 2 前六份文档（01–06）定稿后，对话进一步深入到三件事：

1. **运行时第二条路线** —— 除了 Claude Code CLI / Codex CLI 这些外部 agent 进程，还要原生接入 SDK，用来跑 Ask-Anywhere、Synthesis、Daily Summary 等"短任务 / 程序化调用"。
2. **"Timeline 的摘要"是一个更普遍的东西** —— Timeline 需要 AI 摘要，Resource 需要 AI 涌现，Daily 需要 AI 总结，Library 需要 AI 提炼，未来的 Memory / Search / Review 都需要。它们不应该各自为政，应该有一层统一的 **Synthesis Layer**。
3. **Feeds / Resource / Area 在三层架构里位置不对** —— 之前的分层草案把 Feeds 放进了真相层，这与 Orbit 的核心哲学（"Library 才是你的数据"）冲突；Resource / Area 怎么流转也没讲清楚。本文给出修正。

这三件事合起来，等价于把 Orbit 的**数据结构与 AI 参与方式**从"功能点状"升级为"体系化"。下一轮 Phase 落地前必须先对齐。

---

## 1. SDK 接入：双轨 Runtime 路线

### 1.1 决策

**Orbit 的 runtime 正式分成两轨，并列存在、互不替代：**

| 轨道 | 对象 | 用途 | 本 phase 范围 |
|---|---|---|---|
| **A · 外部 Agent CLI** | Claude Code / Codex / Gemini CLI | 长时间执行任务、有工具使用、要跑在 worktree / sandbox 里 | 已落地（Phase 3 / 4） |
| **B · 原生 SDK** | Anthropic SDK（含兼容端点：MiniMax / DeepSeek 等） | Ask-Anywhere、Synthesis（摘要/涌现/总结）、Daily Summary、轻量回答 | **本轮新增** |

**先行接入 Anthropic SDK**（官方 `@anthropic-ai/sdk`），不接入 OpenAI SDK。原因：

- 用户手头的 API Key 池：MiniMax、DeepSeek 都提供 **Anthropic 兼容 API**。只接一套，全覆盖。
- Claude Code 生态本身就是 Anthropic 协议，现有 event 投影器、UI render、trace 都已经围绕它建成，SDK 路线可以直接复用。
- OpenAI 系（codex, gpt-4 via OpenAI SDK）不缺，留给 runtime-adapter 把 Codex CLI 接住就够了。

### 1.2 协议统一原则

**Runtime A 与 B 在 AgentEvent 协议层必须是同一个**。向上游（UI / timeline projectors / trace viewer）看不出区别。

具体实现：

- **Runtime A（CLI）**：继续沿用 `runtime-adapter-layer` 的 raw vendor event → abstract AgentEvent 映射
- **Runtime B（SDK）**：在 `src/main/runtime/sdk/` 下新增 `anthropic-sdk-adapter.ts`，把 SDK 的 stream（`client.messages.stream(...)`）的事件（`content_block_start / delta / stop`、`message_start / delta / stop`、`tool_use / tool_result` 等）映射成和 A 同样的 `AgentEvent`。

### 1.3 目录结构

```
src/main/runtime/
  index.ts                      # Runtime registry / 选择
  capabilities.ts               # capability flags
  cli/                          # 轨道 A
    claude-adapter.ts
    codex-adapter.ts
    gemini-adapter.ts
  sdk/                          # 轨道 B（本轮新增）
    anthropic-sdk-adapter.ts    # 使用官方 @anthropic-ai/sdk
    endpoint-registry.ts        # 兼容端点（MiniMax / DeepSeek）映射
    key-vault.ts                # key 管理（系统 Keychain）
```

### 1.4 Endpoint Registry

兼容端点的 `baseURL` 和 API Key 分别存：

```typescript
// src/main/runtime/sdk/endpoint-registry.ts

export interface SDKEndpoint {
  id: string;                      // 'anthropic' | 'minimax' | 'deepseek' | <custom>
  label: string;                   // UI 显示
  baseURL: string;                 // Anthropic 兼容端点 URL
  keyRef: string;                  // key vault 的引用 id
  defaultModel: string;            // 'claude-3-5-sonnet-latest' | 'minimax-m1' | ...
  modelAlias?: Record<string, string>;  // 把 Orbit 统一 model 名映射成 vendor 名
  costProfile?: {
    inputPerMTok: number;
    outputPerMTok: number;
    cacheReadPerMTok?: number;
  };
}
```

默认注入三个内置 endpoint（Anthropic 官方 / MiniMax / DeepSeek），用户可在 Settings 里新增。

### 1.5 调度策略

谁用 A 谁用 B，交给**调用方声明 + 全局 Router 决定**：

```typescript
interface InvokeOptions {
  mode: 'task' | 'ask' | 'synthesis' | 'background';
  // task → 默认 A，外部 CLI
  // ask → 默认 B（Ask-Anywhere 弹层）
  // synthesis → 默认 B（摘要/涌现/总结，下文）
  // background → 默认 B，低优先级队列
  
  endpointHint?: string;     // 指定 endpoint id
  modelHint?: string;        // 指定 model 名
  budgetHint?: number;       // 单次 USD 上限
}
```

Router 逻辑：

1. 读 `mode` 取默认 runtime
2. 叠加用户在 Settings 里的覆盖（"Ask-Anywhere 用 DeepSeek"）
3. 叠加调用方 hint
4. 做 budget pre-check（本次调用 cost estimate > 剩余预算则拒绝）
5. Launch，事件走 Unified AgentEvent 协议

### 1.6 关键边界

- **SDK 路线不绑定 worktree / sandbox** —— 因为它通常是"问一下 / 算一下"，不产生文件 mutation
- **SDK 路线也要进 Activity Log / TraceableEvent** —— 和 CLI 路线平权，Timeline Layer 2 能看到
- **本地模型预留** —— endpoint-registry 可以接本地 Ollama（Anthropic 兼容 proxy 或直连 OpenAI 兼容），下一阶段开放
- **Key 不进 prompt、不进日志** —— 统一走 system keychain，日志里只记录 endpoint.id

### 1.7 本轮落地范围

做：

- [x] 架构定稿（本文）
- [ ] `anthropic-sdk-adapter.ts` 基础实现（non-streaming + streaming）
- [ ] endpoint-registry 内置三家（Anthropic / MiniMax / DeepSeek）
- [ ] Settings UI 里添加 SDK Endpoints 管理页
- [ ] Ask-Anywhere 的默认 runtime 切到 SDK（B 轨）
- [ ] Daily Summary 改走 SDK（替代原先 Ask-Anywhere CLI 走法）
- [ ] Cost 统计接入

留给后续：

- 本地模型 / Ollama / vLLM
- OpenAI SDK 直连（非 Anthropic 兼容）
- Vertex / Bedrock 这类云家企业端点

---

## 2. Synthesis Layer：通用 AI 生成层

### 2.1 决策

**Orbit 引入一层"应用范围内所有 AI 生成内容的统一层"，命名为 Synthesis Layer。**

> Synthesis = 合成 / 提炼 / 凝聚。它既覆盖"摘要"，也覆盖"涌现"、"关联"、"总结"、"索引"。

之前各自为政的能力（Daily Summary、Library distill、Resource suggestion、Timeline 事件解释、未来的 Memory、Semantic Search 等）**全部收归到 Synthesis Layer**，作为它产生的不同形态产物。

### 2.2 为什么这是一层而不是一堆功能

四条理由：

1. **一致的 provenance** —— 所有 AI 生成产物都要能说清"是谁在什么时候、用什么 runtime、输入是谁、模型是什么、多少 token、cost 多少"。分散实现意味着每个功能都要再造一遍 provenance。
2. **一致的更新语义** —— AI 产物天然会过期（用户编辑了原 note、加了新 library）。需要统一的失效 / 重算机制。
3. **一致的消费接口** —— 消费层（UI / Timeline / Ask-Anywhere 上下文 / Search）看到的是一份 `SynthesisArtifact`，不关心它是 summary 还是 suggestion。
4. **一致的预算与限速** —— 全局预算、每日限额、失败退避，写一次。

### 2.3 Artifact 数据模型

```typescript
// src/shared/synthesis/types.ts

export type SynthesisKind =
  | 'summary.daily'              // 今日总结
  | 'summary.weekly'             // 本周总结
  | 'summary.monthly'            // 月度总结
  | 'summary.yearly'             // 年度总结
  | 'summary.entity'             // 任意实体的摘要（note / resource / project / area）
  | 'distill.library'            // library item → 提炼 note
  | 'emerge.resource'            // notes 涌现 → resource suggestion
  | 'relate.notes'               // note 之间的语义关联
  | 'classify.area'              // note / project 归属哪个 area 的建议
  | 'timeline.narrative'         // timeline 段落叙事
  | 'memory.digest'              // Memory 层快照摘要（未来）
  | 'search.answer'              // 语义搜索的综合回答（未来）
  | 'review.weekly'              // PARA weekly review（未来）
  ;

export interface SynthesisSource {
  kind: 'note' | 'library' | 'feed' | 'resource' | 'project' | 'area' |
        'task' | 'conversation' | 'event' | 'timeline_range' | 'raw';
  ref?: string;                  // 实体路径或 id
  range?: { from: string; to: string };  // 时间范围（YYYY-MM-DD 或 ISO）
  weight?: number;               // 参与权重（可选）
}

export interface SynthesisProvenance {
  runtime: 'cli:claude' | 'cli:codex' | 'sdk:anthropic' | 'sdk:minimax' | string;
  model: string;
  prompt_version: string;        // 和 prompt 模板版本号绑定
  generated_at: string;
  cost_usd?: number;
  tokens?: { input: number; output: number; cache_read?: number };
  trace_id?: string;             // 关联的 AgentEvent trace
}

export interface SynthesisArtifact {
  id: string;                    // 'synth-<nanoid>'
  kind: SynthesisKind;
  scope_key: string;             // 幂等键：同一 scope 重算时会覆盖旧 artifact
  sources: SynthesisSource[];
  provenance: SynthesisProvenance;
  payload: unknown;              // kind-specific 结构，各 kind 在 shared/synthesis/payloads.ts 定义
  status: 'fresh' | 'stale' | 'superseded' | 'failed';
  created_at: string;
  invalidated_at?: string;
  superseded_by?: string;        // 新 artifact 的 id
  user_edited?: boolean;         // 用户直接改过
  user_edit_patch?: unknown;     // 用户的修改 diff
}
```

### 2.4 幂等键（scope_key）设计

每个 kind 定义一个确定性的 key，保证"同样的输入 + 同样的 kind → 同一个 artifact 位置"。

| kind | scope_key 示例 |
|---|---|
| `summary.daily` | `daily:2026-04-30` |
| `summary.weekly` | `weekly:2026-W17` |
| `summary.entity` | `entity:note:<id>` 或 `entity:resource:<slug>` |
| `distill.library` | `library:<library-item-id>` |
| `emerge.resource` | `emerge:tag:<tag>` 或 `emerge:cluster:<clusterId>` |
| `relate.notes` | `relate:<note-id-sorted-pair>` |
| `timeline.narrative` | `timeline-narrative:<date>:<segment>` |

重算只会**追加一个新 artifact 并 mark 旧的 superseded**，不原地覆盖（保留历史可审计）。

### 2.5 存储位置

```
<vault>/.orbit/synthesis/
├── index.json                   # scope_key → latest artifact id
├── artifacts/
│   └── <artifact-id>.json       # 完整 artifact（payload 可能很大）
└── dlq/                         # 失败重试队列
```

另外，**部分 artifact 同时"物化"为 vault 内的可读文件**，方便 Obsidian 和 diff 工具访问：

- `summary.daily` → `notes/daily-summaries/2026-04-30.md`（同时也存 artifact）
- `summary.weekly` → `notes/weekly-summaries/2026-W17.md`
- `emerge.resource` 被用户采纳 → 实体化成真实 Resource（artifact 保留作为 seed）
- `distill.library` 被用户采纳 → 实体化成真实 Note

artifact 始终是 source of truth for synthesis metadata，物化文件是 surfacing/editing 的便捷通道。

### 2.6 失效机制

每个 kind 的 artifact 依赖一组 sources，sources 发生变化时 artifact 被标 stale：

```typescript
// src/main/synthesis/invalidator.ts

// 订阅 TraceableEvent：
//  - note.updated / note.archived / library.item.* / ... 都可能触发
// 对每个 artifact 检查 sources，命中则标 stale 并入 recompute queue
```

失效后的重算由 **Synthesis Scheduler** 负责：

- 低优先（summary.entity）：延迟批次重算，节省 token
- 高优先（summary.daily）：到期即算（22:00 定时任务）
- 用户点击 artifact 上的"刷新"：立即

### 2.7 消费接口

消费方（UI / Ask-Anywhere / Search / Timeline）统一调 IPC：

```typescript
IPC.synthesis = {
  // 查询某个 scope 的最新 artifact
  get(scope_key: string): Promise<SynthesisArtifact | null>;
  
  // 批量查询（Resource 页面一次拿多个）
  getMany(scope_keys: string[]): Promise<Record<string, SynthesisArtifact>>;
  
  // 请求生成（如果不存在或 stale）
  ensure(scope_key: string, kind: SynthesisKind, sources: SynthesisSource[], opts?: EnsureOptions): Promise<SynthesisArtifact>;
  
  // 手动触发重算
  recompute(scope_key: string, opts?: { force?: boolean }): Promise<SynthesisArtifact>;
  
  // 用户编辑 artifact payload
  applyUserEdit(artifact_id: string, patch: unknown): Promise<SynthesisArtifact>;
  
  // 订阅某 scope 的变化
  subscribe(scope_key: string, cb: (a: SynthesisArtifact) => void): () => void;
  
  // 列出 kind / 时间范围的所有 artifact（Review / Debug）
  list(filter: SynthesisFilter): Promise<SynthesisArtifact[]>;
};
```

### 2.8 Prompt Registry

Prompt 模板也要集中管理（而不是散落在各业务模块里），方便**版本化**和**A/B 实验**：

```
src/main/synthesis/prompts/
├── registry.ts                  # kind → { version, template }
├── summary.daily.v1.ts
├── summary.weekly.v1.ts
├── distill.library.v1.ts
├── emerge.resource.v1.ts
├── relate.notes.v1.ts
└── ...
```

每个 template 导出：

```typescript
export interface PromptTemplate<Input, Output> {
  kind: SynthesisKind;
  version: string;
  render(input: Input): { system: string; user: string; tools?: unknown[] };
  parse(response: unknown): Output;
  outputSchema: unknown;         // JSON Schema / zod schema
  defaultBudget: { input_tokens: number; output_tokens: number; usd?: number };
}
```

升级 template 要 bump version，旧 artifact 保留，新产物挂新 version，必要时可以 re-run 旧 kind 测试 prompt 迭代效果。

### 2.9 Layer 2 的完整图

```
┌───────────────────── Synthesis Layer (Layer 2) ──────────────────────┐
│                                                                       │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│   │  Prompt         │    │  Scheduler      │    │  Invalidator    │  │
│   │  Registry       │    │  (queue/budget) │    │  (event sub)    │  │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                      ↓                 ↓                 ↓            │
│                    ┌─────────────────────────────────────┐            │
│                    │     Synthesis Runner                │            │
│                    │  (calls Runtime B / rarely A)       │            │
│                    └─────────────────────────────────────┘            │
│                                       ↓                               │
│                    ┌─────────────────────────────────────┐            │
│                    │     Artifact Store                  │            │
│                    │  (.orbit/synthesis/*)               │            │
│                    └─────────────────────────────────────┘            │
│                                       ↓                               │
│                    ┌─────────────────────────────────────┐            │
│                    │     Materialization                 │            │
│                    │  (写进 vault 的可读 md 文件)          │            │
│                    └─────────────────────────────────────┘            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
         ↑                                             ↓
   Layer 1 真相数据                              Layer 3 消费层
   (notes/library/resource/area/...)            (UI/Timeline/Ask-Anywhere/Search)
```

### 2.10 本轮落地范围

做：

- [ ] Shared contract（`src/shared/synthesis/`）
- [ ] Artifact store（`.orbit/synthesis/`）
- [ ] Prompt Registry + 最初三个 kind（`summary.daily` / `distill.library` / `emerge.resource`）
- [ ] Scheduler（简单 queue + 每日 budget）
- [ ] Invalidator 订阅 TraceableEvent
- [ ] IPC 暴露
- [ ] Timeline / Library / Resource 页面改走 Synthesis artifact 渲染（替代本地内联实现）

留给后续：

- `summary.weekly / monthly / yearly`
- `relate.notes` / `classify.area` / `timeline.narrative`
- `memory.digest`（Memory 层，Phase 7+）
- `search.answer`（语义搜索，Phase 7+）
- Prompt A/B 与 eval harness

---

## 3. 三层数据架构（修正版）

### 3.1 核心论断

之前我把 Feeds 塞进了 Layer 1，这是错的。严谨的分层是：

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 0 · Signal Sources                                       │
│  外部订阅（Feeds: RSS / YouTube / Twitter / ...）               │
│  原始 Capture（剪贴 / 分享 / Voice / Quick Input）               │
│  外部触发（Gateway 收到的 message / webhook / shortcut）          │
│                                                                 │
│  特征：低信号密度、只读、可过期、用户没确权                        │
└────────────────────────┬──────────────────────────────────────┘
                         │  「纳入闸门」（人工 / 人机协作）
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ Layer 1 · Ground Truth（Library / 用户真相数据）                 │
│  Notes (thoughts / longforms / captures / voice_logs /         │
│         daily-summaries)                                       │
│  LibraryItems (articles / pdfs / videos / bookmarks)           │
│  Knowledge Base（导入的存量 vault，分层引用）                    │
│  Resources (主题工作站)                                         │
│  Projects (有目标 + 截止)                                        │
│  Areas (长期责任坐标系)                                           │
│  People                                                        │
│  Tasks + Runs                                                  │
│  Conversations + Messages                                      │
│  Activity / TraceableEvent                                     │
│                                                                 │
│  特征：用户已付出筛选成本、归属明确、可编辑、长期存在               │
└────────────────────────┬──────────────────────────────────────┘
                         │  Synthesis Layer 消费
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ Layer 2 · Synthesis（AI 生成层）                                │
│  SynthesisArtifact（见 §2）                                     │
│  Timeline Projection（TraceableEvent → TimelineEntry）          │
│  Memory Digest / Embedding Index（Phase 7+）                    │
│  Relation Graph / Cluster                                      │
│                                                                 │
│  特征：可重算、带 provenance、可失效、可被用户编辑后固化           │
└────────────────────────┬──────────────────────────────────────┘
                         │  消费
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ Layer 3 · Surfaces（消费层 / UI & Interaction）                  │
│  Today Dashboard · Timeline 日/周/月/年 · Notes · Library       │
│  Resources · Areas · Projects · Ask-Anywhere · Search           │
│  Canvas · Weekly Review · Memory Explorer                      │
│  Telegram / Gateway Channels                                   │
│                                                                 │
│  特征：以上三层的组合渲染 + 用户输入回流                           │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 层间关系的铁律

1. **Layer 0 → Layer 1 必过闸门。** 没有闸门（显式的"保存 / 纳入 / 创建 note"）动作，信号不会进 Library。
2. **Layer 2 只读 Layer 1（及必要的 Layer 0 统计）。** Synthesis 不写 Layer 1 的实体字段，只产出 artifact。Artifact 被用户"固化"（Accept Suggestion）时，由用户代理（UI 或 skill）写入 Layer 1。
3. **Layer 3 不直接写 Layer 1 业务字段，必须走 IPC。** 不绕过存储契约。
4. **跨层引用只能向下。** Layer 2 的 artifact 引用 Layer 1 的实体 ref；Layer 3 引用 Layer 1/2；Layer 1 不回引 Layer 2（否则失效后会产生孤悬引用）。

### 3.3 Feeds 的特殊地位（P2-D11）

**Feeds 默认永远不进 Layer 1。** 它有一个专属的小型 AI 闭环：

```
RSS/Youtube/Twitter 源
    ↓ fetcher（Phase 2 已有）
feeds/<source>/<item>.json            ← Layer 0（流水存储）
    ↓
Feed-scoped Synthesis（Synthesis Layer 的子集，但产物不进主索引）
    · feed.daily-digest                 "你今天订阅的 40 条里这 3 条值得看"
    · feed.cluster                      "这 20 篇讲 MCP 的合并一条"
    · feed.relate-library               "这条和你 Library 里的 X 强相关"
    ↓
Feed Reader UI（Layer 3 专属 surface）
    ↓ 用户按"保存到 Library"
library/<item>                        ← 闸门，item 被固化为 Library snapshot
```

**Feed-scoped Synthesis 的 artifact 存在独立的 `scope_key` 命名空间**：`feed.<source>.<date>` / `feed.cluster.<hash>`。它们**不进**主 timeline 索引、**不进**主 search 索引、**不参与**全局 Resource/Area 涌现。

但它们**可以反向关联**主 Library——"这条 feed 和你 resource:mcp 有关"；反过来主 Library 不会引用 feed item（因为 feed item 会过期）。

### 3.4 闸门动作清单

所有把 Layer 0 提升到 Layer 1 的动作都叫"**纳入（promote）**"，必须显式：

| 闸门 | 方向 | 前置 | 产生的 Layer 1 实体 |
|---|---|---|---|
| Feed → Library | 用户 Save / AI 建议 + 用户确认 | 单条 feed item | `library/<item>` |
| Library → Note（distill） | 用户"提炼"按钮 / Synthesis 建议 + 确认 | library item | `notes/captures/<id>` 或 `notes/longforms/<id>` |
| Library → Resource.canonical | 用户 Link | library + resource | `resources/<slug>/_canonical/` ref |
| Inbox Capture → Note | 用户 Promote | capture 原文 | `notes/thoughts/<id>` |
| Feed Item → Resource | 用户 Link（先必须保存到 Library） | **先入 Library** | resource ref |
| KB → Note（活化） | 用户 Activate | KB 笔记 | `notes/<type>/<id>`（frontmatter 带 origin） |
| Conversation → Note | 用户 "保存为 note" | conversation 片段 | `notes/thoughts/<id>` |
| Voice Log → Note | 录音+转写完成后确认 | voice asset | `notes/voice_logs/<id>` |

每个闸门都写一条 `promote.*` TraceableEvent，Timeline 记账。

---

## 4. Resource 流转（完整版）

### 4.1 生命周期状态机

Resource 的状态不是线性，而是两条正交的轴：

- **status 轴**：`active` ↔ `dormant` ↔ `evolved` ↔ `archived`
- **depth 轴**：`exploring` → `practicing` → `mastered` → `teaching`

状态由 engagement + 规则驱动：

```
创建
  │
  ▼
active (exploring)
  │
  │ engagement_count 持续上升、有 distilled notes 产出
  ▼
active (practicing)
  │
  │ 产出长文 / 项目 / 公开输出
  ▼
active (mastered)
  │
  │ 开始教授 / 写教程 / 帮别人解决
  ▼
active (teaching)
  │
  │ N 个月无 engagement
  ▼
dormant ───→ evolved (用户声明：主题重构、拆分) ───→ 新 Resource
         └→ archived (用户声明：不再关心) ───→ archives/resources/<slug>/
```

**自动规则**（Synthesis 建议，不自动执行）：

- 30 天无 engagement → 建议标 dormant
- dormant 90 天 → 建议归档
- 单月 engagement_count >= 20 & 有 >=3 distilled → 建议 depth 升级
- 引用该 resource 的 note 数突破阈值 → 建议升 canonical

### 4.2 完整流入通道

```
                         ┌─── Feed（用户 Save） ───→ Library ────┐
                         │                                        │
                         ├─── 手动 URL / 书签 ───→ Library ──────┤
                         │                                        │
   外部世界              ├─── Inbox Capture ───→ Note ────────┐  │
                         │                                     │  │
                         ├─── Voice Log ───→ Note ─────────────┤  │
                         │                                     │  │
                         ├─── KB 激活 ───→ Note ───────────────┤  │
                         │                                     │  │
                         └─── Conversation 保存 ───→ Note ─────┤  │
                                                               │  │
                                                               ▼  ▼
                                                  ┌─────────────────────┐
                                                  │  Resource 主题工作站  │
                                                  │  _canonical / _distilled / _related / │
                                                  │  _people / _projects-touched / _timeline  │
                                                  └─────────────────────┘
                                                               │
                                                               ├─► 反哺 Project（立项建议）
                                                               │
                                                               └─► 沉淀 Archive / Evolve
```

### 4.3 涌现路径（Resource 怎么"凭空出现"）

**Resource 必须可以自下而上涌现，而不是用户先建空壳。**

Synthesis 的 `emerge.resource` kind 定期扫描：

1. **Tag 聚类**：多个 note 共享同一 tag 且总字数 > 阈值
2. **语义聚类**：embedding 聚类（Phase 7+）
3. **Conversation 聚类**：反复在 Ask-Anywhere 里问的主题
4. **Feed 长期关注**：同一关键词在 Feed cluster 里持续出现 N 周

达到阈值 → 生成 `emerge.resource` artifact → 在 Inbox / Resource 页面顶部以"候选主题"卡片展示：

```
┌─ 🫧 可能浮现的主题 ──────────────────────┐
│  "MCP 生态"                              │
│  基于：17 个 note, 5 篇 library article, │
│       3 周的 feed 关注                    │
│  [创建 Resource]   [暂不]   [更多样本]    │
└──────────────────────────────────────────┘
```

用户确认后：

1. 创建 `resources/<slug>/`
2. 样本实体按类别 link 进 `_canonical / _distilled / _related`
3. Resource engagement_count 从 0 起
4. TraceableEvent `resource.emerged_from_synthesis`

### 4.4 Engagement 定义

engagement 是推进 Resource 状态的"能量输入"：

| 动作 | 权重 |
|---|---|
| 打开 Resource 页面 | 1 |
| 在 Resource 上停留 > 2 分钟 | 2 |
| link 一个 ref 到 Resource | 3 |
| 在 Ask-Anywhere 里引用 Resource 上下文 | 3 |
| 基于 Resource 产出 longform note | 10 |
| 基于 Resource 立项一个 Project | 15 |
| Project 完成后反哺 Resource | 15 |

累积的 `engagement_count` 进 frontmatter，`last_engaged` 更新时间戳。权重会影响"最近活跃 Resource"排序。

### 4.5 双向链接一致性

Note ↔ Resource 是双向的：

- Note 内写 `[[resource:mcp]]` → **Resource 侧的 `.orbit-resource.json` 自动记录 incoming ref**
- Resource 的 `_distilled/` link Note → **Note frontmatter 自动追加 `resource_refs: [mcp]`**

一致性由 **Resource Store + Note Store 协作 + TraceableEvent 驱动的 reconciliation 后台任务**维护。Synthesis 层不负责这个（这是 Layer 1 自己的数据完整性）。

---

## 5. Area 流转（完整版）

### 5.1 Area 不是实体，是坐标系

**Area 不"流转"，只"归属"。** 这是 Area 和其他 PARA 条目最大的区别。

Area 是预先存在的长期责任坐标（由用户在 Vision 规划阶段建立），其他一切实体都向它**归属（belongs_to）**：

```
                       Area ("写作" / "Orbit 项目" / "健康")
                          ↑
            ┌───┬────────┼────────┬─────┬─────┐
            │   │        │        │     │     │
          Projects Resources Notes Feeds People
                          │
                      Daily entries 可以多标（一个 note 多个 area）
```

### 5.2 Area 自己的变化

Area 自身极少变。能发生的变化只有：

- **创建** `area.created` —— 用户新增一个长期责任领域
- **更新 meta** `area.updated` —— 改名、描述、Vision 绑定
- **合并** `area.merged_into` —— 两个 area 合一（比如"写作"+"研究"→"思考输出"）
- **拆分** `area.split_from` —— 一个 area 分两个
- **休眠** `area.dormant` —— 暂时不在本阶段关注（不删除，保留所有归属）
- **归档** `area.archived` —— 生命阶段切换（e.g. 离开某公司，那个 team area 归档）

**绝对不会**有"进 Area"和"出 Area"的动作（那是 Project 的生命周期）。

### 5.3 Area 归属规则

```typescript
// 所有 Layer 1 实体都可以有 areas 字段（0..N）
interface AreaRef {
  area_slug: string;
  assigned_at: string;
  assigned_by: 'user' | 'synthesis';     // AI 建议 + 用户确认 / 用户手工
  primary?: boolean;                      // 是否是主 Area（排序/渲染用）
}
```

归属动作：

- **用户手工**：note / project 创建时选择 area，或后续在详情页改
- **Synthesis 建议**：`classify.area` kind，基于内容 / tags / 关联实体建议归属；用户一键 accept

未归属的 note 会在 "Unassigned" 筐里，Synthesis 会提示。

### 5.4 Area Dashboard（Layer 3 的特殊 surface）

Area 在 UI 里天然就是一个 Dashboard 入口：

```
┌─ Area: 写作 ─────────────────────────────────────────────┐
│  健康度: ●●●●○  最近活跃: 2 天前                          │
│                                                          │
│  ╭─ 当前 Projects (2) ─────────────────────────────╮    │
│  │  · 《第二大脑在工具里的实现》长文  (doing, 65%)   │    │
│  │  · 写作训练营           (todo)                   │    │
│  ╰──────────────────────────────────────────────────╯    │
│                                                          │
│  ╭─ Resources (5) ─────────────────────────────────╮    │
│  │  · 第二大脑   · 结构化写作   · 非虚构           │    │
│  │  · 读者模型   · 写作工具链                       │    │
│  ╰──────────────────────────────────────────────────╯    │
│                                                          │
│  ╭─ 本月产出 ──────────────────────────────────────╮    │
│  │  · 14 个 thoughts    · 新增 4200 字长文          │    │
│  │  · 保存 8 篇 library · 归档 2 个 project         │    │
│  ╰──────────────────────────────────────────────────╯    │
│                                                          │
│  ╭─ Feed 雷达 (属于本 Area 的订阅) ─────────────────╮    │
│  │  · Paul Graham essays   · Morgan Housel         │    │
│  ╰──────────────────────────────────────────────────╯    │
│                                                          │
│  ╭─ Synthesis: 月度评估（AI）──────────────────────╮    │
│  │  "这个月写作 Area 重心在 BASB 长文上，3 个       │    │
│  │   Resource 被持续滋养。Project 停滞 12 天，       │    │
│  │   建议做一次 review..."                          │    │
│  │   [接受建议] [忽略]                              │    │
│  ╰──────────────────────────────────────────────────╯    │
└──────────────────────────────────────────────────────────┘
```

这个页面完全由 Synthesis + Layer 1 聚合而成，**Area 本身不需要存储这些**。

### 5.5 Area-scoped 子世界

**每个 Area 目录下带 `.orbit/` 子世界**（现状 `AREA_ORBIT_DIR` 已是这个设计）：

```
areas/<slug>/
├── README.md
├── index.md
├── .orbit/
│   ├── config.json
│   └── agent/
│       ├── sessions/
│       ├── tasks/
│       └── memories/           # Area-scoped agent 记忆
```

语义：

- 在 Area 页面触发的 Ask-Anywhere，默认把 Area context 注入（本 area 的 resources + 最近 notes + projects）
- Area 专属的 agent memory 独立（这 Area 上聊过什么不污染别的 Area）
- Area 的 scheduled tasks 也独立（如 "周日 20:00 做写作 Area 复盘"）

### 5.6 和 Vision 的关系

Area 是 Vision 的具象化坐标。Vision 说"我想成为一个能写清楚思考的人" → Area "写作" 承接。Vision Phase 落地后（未来）：

- Vision goal → 对应 area
- Area 的健康度 → 回填 Vision 仪表盘
- 长期偏离 Vision 的 area 会被提示"和你的 Vision 还匹配吗？"

这部分留给 Vision Phase（Phase 7+ / 未定时间）。

---

## 6. 最终的三层图（包含所有实体）

```
┌─────────────────────── Layer 0 · Signals ────────────────────────┐
│  RSS/YT/Twitter Feeds  ·  Webhook/Shortcut/Telegram inbound      │
│  Clipboard/Share/Voice/Quick Input raw captures                   │
│  External calendar/github/health events (future)                  │
└───────────────────────────────┬───────────────────────────────────┘
                                │  Gates: Save / Promote / Capture
                                ▼
┌─────────────────────── Layer 1 · Library ────────────────────────┐
│                                                                   │
│  Notes  ─────┐                                                    │
│  LibraryItems  ├── belongs_to ──►  Areas (长期责任坐标系)          │
│  Resources   ┘     (multi)                                        │
│  Projects  ──► area + resources (当期执行单元)                      │
│  Tasks + Runs (project/area 下)                                   │
│  People                                                           │
│  KB (存量存储)                                                     │
│  Conversations + Messages                                         │
│  TraceableEvent / Activity Log  (所有 Layer 1 变更的事件流)         │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │  Synthesis 订阅 + 投影
                                ▼
┌────────────────── Layer 2 · Synthesis (AI) ───────────────────────┐
│                                                                   │
│  SynthesisArtifact (summary / distill / emerge / relate / ...)    │
│  Timeline Projection (TraceableEvent → TimelineEntry)             │
│  Embedding Index / Memory Digest (future)                         │
│  Feed-scoped mini-synthesis (daily-digest / cluster, 不进主索引)    │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │  IPC / subscribe
                                ▼
┌────────────────── Layer 3 · Surfaces (UI) ────────────────────────┐
│                                                                   │
│  Today · Timeline 日/周/月/年 · Notes · Library · Feed Reader     │
│  Resources · Areas · Projects · Ask-Anywhere · Search · Canvas    │
│  Weekly Review · Memory Explorer · Telegram Channel (Gateway)     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 6.1 新增决策清单（P2-D11 ~ P2-D18）

| # | 决策 |
|---|---|
| **P2-D11** | Feeds 不进 Layer 1，仅作为 Layer 0 信号源，有专属 mini-synthesis 和独立 UI |
| **P2-D12** | 引入 Runtime B（SDK 轨），Anthropic SDK 先行，兼容端点走 endpoint-registry |
| **P2-D13** | 引入 Synthesis Layer 作为所有 AI 生成内容的统一层，artifact + prompt 版本化 + 幂等键 + 失效机制 |
| **P2-D14** | Resource 支持自下而上涌现（`emerge.resource`），不要求用户先建空壳 |
| **P2-D15** | Area 是坐标系而非实体，所有 Layer 1 实体都可 `areas: string[]` 归属 |
| **P2-D16** | 每个 Area 带 `.orbit/` 子世界（配置/memory/session/scheduled），Ask-Anywhere 可注入 area context |
| **P2-D17** | 所有闸门动作产 `promote.*` TraceableEvent；未经过闸门，Layer 0 不入 Layer 1 |
| **P2-D18** | Layer 2 不写 Layer 1 业务字段，只产 artifact；用户 accept 时由 UI/skill 代理写入 |

---

## 7. 下一步：从 thinking-trail 变成真正落地

本文定稿后，下一轮要拆出：

1. **ADR（决策记录）**：每条 P2-D11..P2-D18 产一份 ADR。
2. **Plan（实施方案）**：至少 3 份新 plan —— `runtime-sdk-track.md`、`synthesis-layer.md`、`layer-promotion-gates.md`。
3. **ROADMAP 更新**：Phase 5 / 6 重编排（见下一份 ROADMAP）。
4. **Architecture 定稿文档**：把 §3 / §6 的图和规则提升到 `docs/architecture/` 下的稳定文档（不再放 thinking-trail）。

本文是 thinking-trail，会和 Phase 2 其他 6 份一样在 ADR/plan 出来后被"引用而不再被修改"。

---

## 8. 与其他文档的关系

| 本文小节 | 更新 / 补充了谁 |
|---|---|
| §1 SDK 双轨 | 扩展 `decisions/ADR-011-runtime-abstraction-through-capabilities.md`，需要新 ADR |
| §2 Synthesis | 升级 `05-daily-timeline.md` §5（AI 今日总结）、`06-resource-workstation.md` §5.2（emerge 机制），需要新 ADR + plan |
| §3 三层架构 | 修正之前在 `README.md` 里的分层叙述；`overview.md` §3 需要补一节 |
| §3.3 Feeds | 覆盖 `decisions/ADR-010-capture-tri-partition.md` 中 Feed 的定位（Feed 从 Capture 子类升格为独立的 Layer 0） |
| §4 Resource 流转 | 补完 `06-resource-workstation.md` 里 §5 没展开的 emerge / engagement / 一致性 |
| §5 Area 流转 | 扩展 `plans/2026-04-23-area-room-vision-system-design.md`，明确 Area = 坐标系 |

**本文是 Phase 2 thinking-trail 的第 7 份文档，之前的 6 份不受影响，只被它们所引用的决策点需要同步更新。**
