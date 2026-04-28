# Ask-Anywhere UX — 方向确立对话记录

**日期**：2026-04-28
**参与方**：Ryan / AI (project-brainstorm)
**产物**：`docs/plans/2026-04-28-ask-anywhere-ux-revamp.md`

---

## 起因

用户打开当前 Ask-Anywhere 页面，判断布局"肯定不对"：

1. 点击悬浮球出的是全屏页面，不是预期的"右下角弹窗"
2. （用户以为）左栏没有 Ask Anywhere 入口

---

## AI 勘误与事实核对

1. **左栏其实已经有 Ask Anywhere 入口**（`WorkspaceSidebar.tsx:14`），但视觉上和其他 8 个同级项完全并列，`✨` 图标识别度低——用户没注意到 ≈ 不存在
2. **悬浮球代码已存在**（`FloatingBall.tsx`），但行为是 view 切换器（点击→跳转全页），不是弹层
3. 对照 ADR-015 D-2："左侧栏一级入口：全功能页面 / 悬浮球：右下角极简对话框 / 未来全屏模式"——**第二形态（弹层）从未被真正落地**

记忆 `兴趣爱好/Orbit-Ask-Anywhere/布局优化` 已记录全页布局问题（4 列过密 + skills 硬编码 + stage 空也占位），与代码现状完全吻合。

---

## 三个关键决策

### D-1: 弹层 = 单 conversation 的迷你容器（复用 ChatView）

用户原话："弹层里就是一个conversation，可以直接复用chat的组件，保证应用内的chat交互和ui，渲染体验都一致"

**确立规则**：
- 弹层不重新实现 chat UI，100% 复用 `components/chat/ChatView.tsx`
- 会话和全页通过 `window.orbit.chat.*` 后端持久化 + `localStorage.last-active-id` 联通
- 打开默认恢复上次会话；顶部下拉切换；`+` 新建；`↗` 推到全页

### D-2: 弹层里不放 Context / Stage

AI 提议 → 用户无异议通过。

**理由**：弹层是"Capture 强度"的轻量入口；需要深入看上下文/产物就展开到全页（"Distill 强度"）。这和 BASB 的 CODE 节奏对齐，也直接解决用户"布局不对"的核心痛点——不要重复堆信息。

### D-3: 全页从四列压成两列 + 顶部 Context 条 + 按需 Stage 抽屉

用户原话："全页重设计按你说的来"

**关键拆解**：
- Context 从常驻列 → 顶部可折叠条（默认收起，显示数量汇总）
- Stage 从常驻列 → 按需抽屉（仅 artifact 非空时出现徽章；点击打开）
- Stage 不自动弹出（避免打断阅读流）

### 范围边界：🅱️（入口 + 全页布局重构）

显式不在本期：
- Skill 意图路由动态化（ADR-015 D-6）
- Planner Agent 退役（ADR-015 D-3）
- Channel 路由统一（ADR-015 D-5）

---

## 未定（open questions，进 plan checklist）

1. 弹层位置是否允许拖动/记忆 → 本期 No，dog-food 后评估
2. 弹层默认尺寸 → 暂定 380×560，小屏自适应
3. Stage 徽章的"脉冲提示"用 `animate-pulse` 还是更克制的 dot indicator → 实施时定

---

## 下一步

1. plan 文档 `2026-04-28-ask-anywhere-ux-revamp.md` 已写入
2. 建议 PR 拆成 5 步（见 plan §5），步骤 1（hook 抽取）可先合入作为纯重构
3. **不需要**新 ADR——本期是 ADR-015 D-2 的**落地**而非修订；如果 dog-food 后决定改变弹层语义（比如改为无状态 Spotlight 模式），再写 ADR 修订 D-2
