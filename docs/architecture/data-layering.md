# Orbit Data Layering Architecture

> **Status**: accepted draft
> **Purpose**: 定义 Orbit 的数据分层、层间边界、Feeds / Library / Synthesis / Surface 的职责。本文是后续 Synthesis、Timeline、Feeds、Resource、Area 设计的最高优先级前提。

---

## 1. 总览

Orbit 的数据体系分成四层：

```text
Layer 0  Signal Sources      外部与原始信号
Layer 1  Ground Truth        用户确认后的真相数据 / Library
Layer 2  Synthesis           AI 生成、投影、索引、关系、摘要
Layer 3  Consumption         UI / Chat / Timeline / Dashboard 等消费层
```

核心原则：**只有进入 Library 才算用户的数据。** Feeds、原始 capture、外部 webhook 都只是信号源，默认不进入用户的真相数据。

---

## 2. Layer 0：Signal Sources

Layer 0 是低信号、未确权、可过期的信息入口。

包括：

- Feeds：RSS / YouTube / Twitter / newsletter / 未来的其他订阅流
- Raw Capture：剪贴板、网页分享、语音、Quick Input 的原始输入
- Gateway Inbound：Telegram / webhook / Shortcut / Email 等外部触发
- Future External Events：Calendar、GitHub、Health、Location 等外部事件

Layer 0 的特征：

- 用户还没有表达“这是我的资料”的意愿
- 可丢弃、可过期、可被压缩
- 默认不进主 search / resource / timeline 主索引
- 可以被 Feed-scoped 或 Capture-scoped AI 做分析，但分析结果不能污染 Library

---

## 3. Layer 1：Ground Truth / Library

Layer 1 是 Orbit 真正保存、编辑、索引和长期维护的用户数据。

包括：

- `notes/`：thoughts、longforms、captures、voice_logs、daily-summaries
- `library/`：用户主动保存的 articles、pdfs、videos、bookmarks
- `knowledge-base/`：导入的存量知识库，分层引用，可激活为 Note
- `resources/`：长期主题工作站
- `projects/`：有目标、有截止、有执行状态的项目
- `areas/`：长期责任坐标系
- `people/`：人、作者、协作者、思想来源
- Tasks、Runs、Conversations、Messages
- TraceableEvent / Activity Log

Layer 1 的特征：

- 用户已经付出筛选成本，或明确授权 AI 写入
- 可编辑、可版本化、可被 Obsidian/Markdown 工具读取
- 是 Synthesis Layer 的主要输入源
- 所有 mutation 必须经过 store / IPC / CLI，不允许 UI 直接改业务文件

---

## 4. Layer 2：Synthesis

Layer 2 是所有 AI 生成内容的统一层。

包括：

- Daily / Weekly / Monthly / Yearly summaries
- Library distillation
- Resource emergence suggestions
- Note / Resource / Area / Project summaries
- Relation graph、semantic clusters
- Timeline projection and narrative
- Embedding index / memory digest（未来）
- Search answer synthesis（未来）

Layer 2 的产物不是 Layer 1 真相，只是可重算的 `SynthesisArtifact`。它必须带：

- sources
- provenance
- prompt version
- runtime / model
- generated_at
- token / cost
- stale / superseded 状态

Layer 2 **不直接修改 Layer 1**。当用户接受一个 AI suggestion 时，由 UI / CLI / skill 作为用户代理执行 Layer 1 mutation。

---

## 5. Layer 3：Consumption Surfaces

Layer 3 是用户和系统消费数据的界面。

包括：

- Today Dashboard
- Timeline（日 / 周 / 月 / 年）
- Notes / Library / Feed Reader
- Resource Workstation
- Area Dashboard
- Project Room
- Ask-Anywhere / Chat Overlay
- Search
- Canvas / Stage View
- Weekly Review / Memory Explorer
- Gateway channels（Telegram 等）

Layer 3 不拥有数据。它只组合 Layer 1 + Layer 2 的结果，并把用户操作通过正式 API 回写到 Layer 1 或触发 Layer 2 重算。

---

## 6. Promotion Gates

Layer 0 进入 Layer 1 必须经过明确的 promotion gate。

| Gate | Source | Target | Who approves |
|---|---|---|---|
| Feed → Library | `feeds/<source>/<item>.json` | `library/articles|videos|bookmarks` | user |
| Raw Capture → Note | raw capture | `notes/thoughts` or `notes/captures` | user or explicit quick-capture action |
| Library → Note | library item | `notes/captures` or `notes/longforms` | user accepts distillation |
| KB → Note | imported KB doc | `notes/*` with origin metadata | user activates |
| Conversation → Note | selected conversation span | `notes/thoughts` or `notes/captures` | user |
| Library/Note → Resource | existing Layer 1 entity | resource ref | user |
| Synthesis → Layer 1 | `SynthesisArtifact` | concrete Note / Resource / Task / Area assignment | user accepts |

Every gate emits a `promote.*` TraceableEvent.

Forbidden shortcuts:

- Feed item must not directly become Resource ref. It must first be saved into Library.
- Synthesis suggestion must not silently create Resource / Project / Task without user approval.
- Feed daily digest must not be indexed as user knowledge unless the user saves it.

---

## 7. Feeds as Layer 0

Feeds are low-signal external streams. They are not Library.

Correct flow:

```text
External feed source
  → feed fetcher
  → feeds/<source>/<item>.json        # Layer 0
  → feed-scoped synthesis             # daily digest / clusters / recommendations
  → Feed Reader UI
  → user saves item
  → library/<item>                    # Layer 1
```

Feed-scoped synthesis may read Layer 1 to say “this feed item is related to your Resource X”, but Layer 1 must not depend on feed items.

Feed artifacts use isolated scope keys:

```text
feed.digest:<date>
feed.cluster:<source>:<hash>
feed.recommendation:<item-id>
```

They do not participate in:

- main Timeline by default
- Resource emergence by default
- global search by default
- Area health by default

Only after Save/Promote do they become user data.

---

## 8. Layer ownership rules

| Operation | Owner |
|---|---|
| Fetch RSS item | Layer 0 feed service |
| Save feed item | Promotion gate service |
| Edit note | Note store |
| Link note to resource | Resource + Note stores with reconciliation |
| Generate daily summary | Synthesis scheduler |
| Show daily timeline | Timeline surface consuming Layer 1 + Layer 2 |
| Suggest area assignment | Synthesis artifact |
| Accept area assignment | Area assignment mutation in Layer 1 |
| Ask-Anywhere answer | Consumption surface + Runtime B, optionally materialized |

---

## 9. Design consequences

1. **Inbox should not be flooded by feeds.** Feed has its own reader; only saved / promoted feed items enter Inbox or Library flows.
2. **Timeline is not the event store.** Timeline is a Layer 3 projection over Layer 1 events plus selected Layer 2 summaries.
3. **Synthesis is not truth.** AI output is useful but always provenance-bound and stale-able.
4. **Resource and Area must not be tag dumps.** They are Layer 1 structures with explicit lifecycle and ownership.
5. **Search must distinguish truth vs synthesis.** Results should label whether a hit is source data, AI summary, or feed-only signal.

---

## 10. Related documents

- `docs/architecture/synthesis-layer.md`
- `docs/architecture/entity-flow.md`
- `docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/07-sdk-synthesis-layering.md`
- `docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/01-note-system-and-para.md`
- `docs/thinking-trail/2026-04-30-phase-2-knowledge-stack/06-resource-workstation.md`
