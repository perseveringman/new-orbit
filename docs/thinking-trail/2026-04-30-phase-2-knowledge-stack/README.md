# Phase 2 · 知识栈扩展

> **Phase 1**（2026-04-29）聚焦 Chat 解耦和 Ask-Anywhere 基础。
> **Phase 2**（本目录）聚焦笔记系统、PARA 扩展、Daily Timeline、Resource 主题工作站等"知识复利"核心能力。

## 前置决策

本 Phase 基于 Phase 1 的 8 个决策锚点（`docs/thinking-trail/2026-04-29-chat-unification-decoupling/decisions-anchor.md`），以及以下新增的 Phase 2 决策：

### Phase 2 核心决策（P2-D1 ~ P2-D10）

| # | 决策 |
|---|------|
| **P2-D1** | 笔记 / Library / Feed 三分：Note 是用户产出（统一 primitive），Library 是素材，Feed 是流水 |
| **P2-D2** | KB 导入采用"分层引用"路径 C：`notes/` 活跃区 + `knowledge-base/` 存量区（多 KB 并存）+ "激活"机制桥接 |
| **P2-D3** | KB 默认权限可读写（Orbit 可加 frontmatter） |
| **P2-D4** | `notes/` 按 type 分子目录（thoughts/longforms/captures/daily-summaries/voice_logs） |
| **P2-D5** | Notes 一级入口页面采用"最小可用，可扩展"策略（列表+简单编辑+搜索优先） |
| **P2-D6** | 欢迎分析作为初始化流程之一（与 Vision 初始化并列） |
| **P2-D7** | Daily Timeline 全套采纳：时段分组 + 今日一瞥 + AI 总结卡片 + 年月视图 + 导出 PDF |
| **P2-D8** | Timeline 仅上 Layer 1/2 事件，Layer 3（heartbeat/cost 细粒度）完全不上 |
| **P2-D9** | Resource 采用主题工作站完整模型（6 子目录），支持"自下而上涌现"机制 |
| **P2-D10** | Timeline 特殊事件（insight/breakthrough/setback）融合进 Quick Capture |

### Phase 2 延后决策

- **Vision 系统**：本 Phase 暂不展开，另找时间讨论。但**欢迎分析**里预留 Vision 初始化钩子
- **Timeline 外部世界连接**（GitHub/Calendar/Health）：架构预留，本 Phase 不实现
- **Timeline 隐私层级**（加密/隐身事件）：架构预留，本 Phase 不实现

---

## 文档清单（共 6 份，可独立实施）

| # | 文档 | 大致规模 | 实施依赖 |
|---|------|---------|---------|
| 1 | `01-note-system-and-para.md` — 笔记系统 + PARA 扩展 + KB 导入 | L | 无（最基础） |
| 2 | `02-scheduled-tasks-ui.md` — 定时任务一级入口 | M | 无 |
| 3 | `03-gateway-telegram.md` — Gateway Daemon + Telegram Channel | L | 依赖 Phase 1 Ask-Anywhere 完成 |
| 4 | `04-ask-anywhere-stage-view.md` — Ask-Anywhere 产物舞台 | M | 依赖 Phase 1 Ask-Anywhere、文档 1（知道有哪些产物） |
| 5 | `05-daily-timeline.md` — Daily Timeline 人生日记 | L | 依赖文档 1（需要 Note 事件定义） |
| 6 | `06-resource-workstation.md` — Resource 主题工作站 | L | 依赖文档 1（Library/Note）、文档 5（Timeline 集成） |

### 建议实施顺序

```
01 (笔记系统 + PARA)  ──┐
                       ├──→ 05 (Daily Timeline)
02 (定时任务)          ──┘           ↓
                                    06 (Resource)
03 (Gateway)          ──── 独立
04 (Stage View)       ──── 依赖 01
```

P2-M1: 01（笔记系统）
P2-M2: 02（定时任务）+ 03（Gateway）并行
P2-M3: 05（Timeline）
P2-M4: 06（Resource）
P2-M5: 04（Stage View）

---

## 验收标准

本 Phase 2 全部完成后，Orbit 应该能：

1. ✅ 用户有一个独立的 Notes 一级入口，能查看 / 编辑 / 搜索所有笔记
2. ✅ 用户能导入存量 Obsidian vault 到 `knowledge-base/`
3. ✅ 初次使用时 Orbit 能"读懂"用户（欢迎分析）
4. ✅ 用户能看到一个 Daily Timeline，一天一张页，一生积累
5. ✅ 用户能在 Timeline 上看到 AI 生成的"今日总结"
6. ✅ 用户能从多个 thoughts 涌现出 Resource 主题
7. ✅ 用户能在 Resource 主题工作站里沉浸思考
8. ✅ 用户能从 Telegram 远程和 Ask-Anywhere 对话
9. ✅ 用户能设置定时任务并看执行历史
10. ✅ Ask-Anywhere 对话能展示产物（stage view）

---

## 实施提示词

所有文档完成后会生成 `IMPLEMENTATION_PROMPT.md`，可一次性交给 AI 实施。
