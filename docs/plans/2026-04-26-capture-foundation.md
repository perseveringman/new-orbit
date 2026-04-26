---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-010
supersedes: 2026-04-24-capture-knowledge-funnel.md
---

# Capture Foundation — Feed / Library / Thoughts

> BASB 的 Capture 阶段在 Orbit 的落地。本 plan 覆盖 Feed（RSS）、Library（主动阅读）、Thoughts（自产灵感）三子系统的基础能力。

---

## Scope

- Feed：RSS 订阅源管理 + 自动刷新 + 淡出归档（Feed History）
- Library：单篇文章保存 + 沉浸阅读器 + scroll position + Promote to Resource
- Thoughts：灵感笔记的数据模型 + 列表展示
- Quick Capture 的 Thought 入口（详细见 `quick-capture-mvp.md`）
- 三者与 Inbox v2 的集成

---

## 1. Feed 子系统

### 数据模型

**订阅源（subscriptions.json）**：

```typescript
interface FeedSubscription {
  id: string
  kind: 'rss'                // v1 only
  url: string
  title: string              // 从 RSS feed 自动抓取
  category?: string          // 用户自定义分类（optional）
  added_at: string
  last_fetched_at?: string
  fetch_interval_seconds: number   // 默认 1800 (30min)
  last_fetch_error?: string
}
```

**Feed 条目**：

```typescript
interface FeedItem extends InboxItemBase {
  category: 'capture'
  subtype: 'feed_item'
  payload: {
    subscription_id: string
    article_url: string
    article_title: string
    article_excerpt: string       // RSS 描述的前 500 字
    published_at: string
    source: string                // feed title
    image_url?: string
  }
}
```

### 订阅源管理

UI 入口：Feed tab 内右上角齿轮 → `FeedSubscriptionSettings.tsx`

- List 所有订阅源
- Add / Remove / Edit title
- Manual refresh
- 显示 `last_fetched_at` / `last_fetch_error`

CLI 等价（供 agent 调用）：

```bash
orbit feed add <url>
orbit feed list-subscriptions
orbit feed remove <id>
orbit feed refresh [id]     # id 省略 = 全部刷新
```

### RSS 抓取器

`src/main/capture/feed/fetcher.ts`：

- 使用成熟库 `rss-parser` 或 `feedparser`
- 30min 定时自动刷新（可配置）
- 手动触发刷新
- 去重：用 `guid` 或 `article_url` 作为唯一键
- 失败不 retry（下次定时刷新自然重试）

### 淡出到 Feed History

见 `inbox-v2-architecture.md` 的 Feed History 章节。

**触发规则**：
- Item 进入视口 ≥ 2 秒，或
- 用户 scroll past（视口离开且从未点击），或
- Item 创建 ≥ 7 天且用户没交互过

**批量淡出**：每天 0 点后扫描 pending，满足条件的迁移到 history。

---

## 2. Library 子系统

### 数据模型

```typescript
interface LibraryArticle extends InboxItemBase {
  category: 'capture'
  subtype: 'library_article'
  payload: {
    url: string
    title: string
    author?: string
    published_at?: string

    // 来源
    source: 'manual' | 'feed_upgrade' | 'quick_capture' | 'share'
    source_note?: string        // 用户 Save 时的简短备注（"为什么觉得值得存"）
    origin_feed_subscription_id?: string
    origin_feed_item_id?: string

    // 内容
    content_path: string        // 相对路径到 articles/<id>.md（本地缓存）
    estimated_reading_minutes: number

    // 阅读进度
    scroll_position?: number
    reading_started_at?: string
    total_reading_seconds: number
    last_read_at?: string
  }
}
```

### 状态流转

```
unread → reading → read → processed
         └──→ dismissed → archived
```

- `unread`：保存后还没点开
- `reading`：点开过但 scroll position < 100%
- `read`：scroll 到底部 or 用户点 "Mark as read"
- `processed`：用户完成"Promote to Resource" or 标记"Processed"
- `dismissed`：用户主动放弃

### 保存路径

**从 Feed 升级（Save）**：
- Feed item 的 "Save" 按钮 → 内容抓取 → 写入 `articles/<library_id>.md` → 状态 `unread`

**手动粘贴 URL**：
- Library tab 顶部 "Add URL" 输入框 → 内容抓取 → 同上

**来源可选**：Quick Capture（本期最小版不做）、手机 share（下期）、浏览器插件（下期）。

### 内容抓取

`src/main/capture/library/extractor.ts`：

- 使用 `@mozilla/readability` + `jsdom` 做 article extraction
- 输出干净的 Markdown 存到 `articles/<id>.md`
- 抓取失败时保留 URL，内容写 "抓取失败，可手动粘贴"

### 沉浸阅读器

`src/renderer/src/components/capture/library/ArticleReader.tsx`：

- 纯 Markdown 渲染（复用现有 CodeMirror MD 渲染或 Markdown-it）
- 可调字号 / 行宽 / 暗色模式
- Scroll position 节流 200ms 持久化（IPC 调 `library:updateScrollPosition`）
- 停留计时器记录 `total_reading_seconds`（每分钟写一次）
- 读到底部自动标记 `read`

### Promote to Resource

阅读器底部 action bar "🔥 Promote to Resource" 按钮：

流程：
1. 用户点 Promote
2. UI 弹出轻量对话框：确认目标路径 `03_Resources/<kebab-title>.md`（可编辑）+ 是否让 agent 摘要（默认是）
3. 触发 `orbit library promote <id>` CLI，背后：
   - 读取 `articles/<id>.md`
   - 若启用 AI 摘要：调用后台 agent run（复用 distillation infra）生成摘要
   - 写入 `03_Resources/<target>.md`，frontmatter 包含 `source_library_id` / `promoted_at`
   - Library item 状态 → `processed`
   - Activity Log: `library.article_promoted`

Agent 摘要失败不阻塞——文章原文仍然写入，摘要段留空。

---

## 3. Thoughts 子系统

### 数据模型

```typescript
interface Thought extends InboxItemBase {
  category: 'capture'
  subtype: 'thought'
  payload: {
    content: string          // Markdown 原文
    tags: string[]
    created_from: 'quick_capture' | 'manual' | 'voice'    // voice 下期
  }
}
```

### UI

Thoughts tab 极简：

- 列表：每条显示前 100 字 + tags + 时间
- 点击进入右侧舞台 → 全屏 Markdown 编辑器（可改内容/tags）
- 处理按钮：
  - "Promote to Resource"
  - "Link to Project"（选一个 project，在该 project 的 `README.md` 底部追加引用）
  - "Promote to Task Proposal"（打开 propose_new_task 表单，预填内容）
  - "Dismiss"

### 数据存储

Thoughts 条目的 payload 直接存在 `pending.ndjson` 的 `payload.content` 字段（不另开 articles 目录——thoughts 一般较短）。

---

## 4. 数据流

```
外部 RSS ──→ Feed pending
              │
   Save ─────→ Library pending ←── Quick Capture / URL paste / 未来 share
   (scan past)│                      │
              │                      │ Promote
              ↓                      ↓
          Feed History          03_Resources/*.md
          (agent 检索池)              │
                                    │
Thoughts (Quick Capture) ────────────┘ Promote / Link / Propose
```

---

## 5. CLI 命令

```bash
# Feed
orbit feed add <rss-url> [--category X]
orbit feed list-subscriptions [--json]
orbit feed remove <subscription-id>
orbit feed refresh [subscription-id]
orbit feed list [--unread]               # 列未扫过的 feed item
orbit feed save <feed-item-id> [--note "..."]
orbit feed history search <query>
orbit feed history purge --before YYYY-MM-DD

# Library
orbit library save <url> [--note "..."]
orbit library list [--status unread]
orbit library get <id>
orbit library mark-read <id>
orbit library promote <id> [--target-path ...] [--no-ai-summary]
orbit library dismiss <id>

# Thoughts
orbit thought create [--content-file F] [--tags a,b]
orbit thought list [--tag X]
orbit thought get <id>
orbit thought promote <id> [--target-path ...]
orbit thought link <id> --project <uid>
orbit thought dismiss <id>
```

（长内容一律从 stdin / `--file` 传入，见 ADR-008 的 CLI 规范）

---

## 6. 集成

### 与 Inbox v2 的集成

- Capture 条目都是 `InboxItem` 的子类型（`category: 'capture'`）
- 写入 `inbox/capture/<kind>/pending.ndjson`
- Inbox UI 的 Capture tab 从这些 pending 文件读取数据
- 状态变更通过统一 Inbox emitter

### 与 Activity Log 的集成

每个动作产生对应 Activity Event：

| 动作 | Activity |
|------|---------|
| 订阅源添加 | `feed.subscription_added` |
| 订阅源删除 | `feed.subscription_removed` |
| Feed 条目抓取（批量） | 不记录（数据量大） |
| Feed 条目 Save | `library.article_saved` |
| Library 条目直接创建 | `library.article_saved` |
| Library 标 read | `library.article_read` |
| Library promote | `library.article_promoted` |
| Thought 创建 | `thought.created` |
| Thought promote | `thought.promoted` |

### 与 agent 的集成

Agent 可以：
- `orbit feed history search` 查用户过往兴趣
- `orbit library list --status unread` 查用户囤积的待读
- `orbit thought create` 在对话中主动记录用户想法（需要用户 approve？⚠️ 开放问题，见下）

---

## 7. 开放问题

### Agent 能否主动创建 Thought？

如果 agent 在对话中判断"这个想法值得记录"，直接 `orbit thought create` 是否需要 approve？

**建议**：本期**允许** agent 直接创建 thought（不走 propose-approve），理由：
- Thought 是用户的"原材料"，本就是低摩擦 capture
- Agent 帮用户记录不算"扩张系统状态"（不入看板、不改项目）
- 用户可在 Inbox Thoughts 里随时 dismiss

**但需要**：
- Thought payload 里标 `created_from: 'agent'`（扩展现有枚举）
- Activity Log 明确记录 agent 作为 actor
- 未来如果发现 agent 滥用（每对话都记一堆），再考虑加限制

---

## 8. 测试

- `tests/feed_fetcher.test.ts` — RSS 抓取 + 去重
- `tests/feed_fade_out.test.ts` — 淡出到 history
- `tests/library_extractor.test.ts` — readability 抓取
- `tests/library_scroll_position.test.ts` — 持久化
- `tests/library_promote.test.ts` — 生成 Resource
- `tests/thought_lifecycle.test.ts`
- `e2e/capture_full_flow.spec.ts` — 订阅 RSS → 刷到条目 → Save 到 Library → 读完 → Promote

---

## 9. 风险

### 内容抓取失败率

Readability 对某些网站解析效果差。

**缓解**：
- 失败时保留 URL，用户可手动粘贴 Markdown
- 未来可加 fallback：调用 headless browser（playwright）全屏渲染后再 extract

### Feed polling 对网络的压力

订阅 20 个 RSS 每 30 min 刷一次 = 每小时 40 次请求，不算多但需要错峰。

**缓解**：
- 抖动：每个订阅的 next_fetch 时间随机 +/- 5min
- 指数退避：连续失败 → 下次间隔翻倍

### 隐私

Capture 抓取的内容存在本地，但抓取过程会访问外部 URL。

**缓解**：
- 默认不注入 cookie / referrer
- Settings 可开关 "在 Capture 请求中带 User-Agent"
- 文档明确说明：Orbit 不主动上传任何 capture 数据

---

## 10. 验收

- [ ] 添加一个 RSS 订阅源，30 分钟后看到新条目
- [ ] Feed 条目扫过后淡出到 history，可通过命令行搜索到
- [ ] Save 一个 feed 条目到 Library，阅读器能渲染文章
- [ ] 读到一半关闭 Inbox，重开后从原位置继续
- [ ] Library Promote 生成 `03_Resources/*.md`，标记 processed
- [ ] Quick Capture 快捷键创建 Thought，在 Inbox 可见可编辑
- [ ] 所有动作产生对应 Activity Log
- [ ] CLI 命令覆盖 UI 能做的所有动作
