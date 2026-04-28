# Ask-Anywhere UX Revamp — 入口语义 + 全页布局重构

> **Status**: draft (2026-04-28)
> **Scope**: 修正悬浮球语义、重设全页布局；不扩展 ADR-015 的 skill 路由 / planner 吸收 / channel 统一
> **Related ADRs**: ADR-015 (Ask-Anywhere as Planner Proxy), ADR-014 (Chat Decoupling), ADR-005 (Plan Chat Reframing)
> **Owner**: Ryan

---

## 1. 背景与问题

ADR-015 D-2 定义了 Ask-Anywhere 的三种入口形态：左侧栏一级入口（全功能页面）、右下角悬浮球（极简对话框）、未来全屏模式。当前代码落地状态：

| 形态 | 应然 | 实然 | 偏差 |
|------|------|------|------|
| 左栏入口 | 一级菜单项，视觉上是"唯一 AI 入口" | `WorkspaceSidebar` 中与 8 个同级项并列，`✨` 小图标混在一起，无强化 | 视觉权重不足 |
| 悬浮球 | **右下角弹出极简对话框**，就地对话 | `FloatingBall.tsx` 实际是"全屏跳转按钮" | **语义错位** |
| 全功能页 | 对话列表 + chat + 产物预览 | 四列硬分：Session 60 + Context 60 + Chat flex + Stage 80 | 笔记本屏幕上不可用；Context skills 硬编码；Stage 空也占位 |

**根因**：悬浮球当作了侧栏项的重复触发器（view 切换），没有独立的容器形态；全页布局一次性把所有维度铺平，没有按"注意力密度"分主次。

---

## 2. 目标

本期交付两件事：

1. **把悬浮球改造成真正的就地弹层对话框**（迷你 chat 容器，复用 ChatView 组件，和全页共享同一套 conversation）
2. **把全页从四列压成两列为主 + 顶部 context 条 + 按需 Stage 抽屉**

显式不在本期：
- Skill 意图路由动态化（ADR-015 D-6）
- Planner Agent 退役 / ProjectPlannerView 冻结（ADR-015 D-3）
- Channel 统一路由到 Ask-Anywhere（ADR-015 D-5）
- 全屏模式（ADR-015 D-2 第三形态）

---

## 3. 产品设计

### 3.1 悬浮球 + 弹层对话框

#### 行为契约

| 场景 | 行为 |
|------|------|
| 启动 Orbit | 悬浮球显示在所有 vault view 的右下角（与当前一致） |
| 当前在 Ask-Anywhere 全页 | 悬浮球隐藏（避免自指） |
| 点击悬浮球 | **右下角弹出对话框**（不再跳转到全页） |
| 弹层打开时点击悬浮球 | 关闭弹层 |
| 弹层外点击 | **不关闭**（允许用户边看其他页面边对话） |
| `Esc` | 关闭弹层（焦点在弹层时） |
| 键盘快捷键 | 保留未来扩展（比如 `⌘\`），本期先不绑 |

#### 弹层结构（自上而下）

```
┌─ Popover (anchor: bottom-right, offset 24px, w-[380] h-[560]) ─┐
│  ┌─ Header 36px ────────────────────────────────────────┐    │
│  │ [▼ 会话下拉] [+] [↗ 展开]              [×]            │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌─ ChatView (flex-1, 复用) ──────────────────────────┐       │
│  │                                                     │       │
│  │  (消息流，与全页完全一致的渲染 / 交互 / 流式)       │       │
│  │                                                     │       │
│  └─────────────────────────────────────────────────────┘       │
│  ┌─ InputArea (ChatView 内置) ─────────────────────────┐       │
│  └─────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

- **会话下拉**：按 `updatedAt desc` 列出所有 `ask_anywhere_session` anchor 的 conversation；默认选中"上次使用"（localStorage 记忆最后 `activeId`，启动时校验 conversation 还存在）
- **`+`**：新建一个 ask_anywhere_session conversation，直接设为 active
- **`↗ 展开`**：`setView({ kind: 'askAnywhere' })` 并把当前 activeId 传过去，保证全页打开就是同一个会话；关闭弹层
- **`×`**：关闭弹层（不销毁 conversation 状态）

#### 为什么不要 Context / Stage 在弹层里

- 弹层定位是**轻量入口**，塞 anchors / skills / artifacts 会回到用户当前觉得"布局不对"的问题
- 需要看上下文或产物 → "展开"到全页就能看到
- 这是"Capture 强度"和"Distill 强度"的分场子（对齐 BASB 的 CODE 节奏）

#### 弹层尺寸与定位

- 默认 `w-[380px] h-[560px]`，距右下角 `24px`（避开悬浮球本身）
- 本期**固定尺寸**，不做拖拽/缩放/位置记忆（MVP 不值得）
- 屏幕高度 < 640 时自动缩到 `h-[calc(100vh-80px)]`

#### 状态与全页联通

**唯一事实源**：`window.orbit.chat.*`（conversations 后端持久化）

- 弹层和全页都通过 `chat.listConversations()` + `chat.getConversation(id)` 读同一套数据
- 弹层的"默认恢复上次"通过 `localStorage['ask-anywhere.last-active-id']` 记住
- 全页也使用同一个 key（弹层和全页切换时 activeId 自然同步）
- `onRuntimeEvent` 只订阅当前 activeId 的事件（弹层和全页任一 open 时订阅，关闭取消）

**并发打开处理**：理论上用户同时开弹层和全页可能（极罕见），两者订阅同一 conversationId 的 runtime events，乐观渲染各自走自己的 state——不做协调，消息落库后两侧都能看到最终一致结果。

---

### 3.2 左栏入口视觉强化

保持"一级菜单项"的结构不变，但做三件事：

1. **置顶 + 分组标题**："Ask Anywhere" 从中间挪到 Workspace 组**第一位**，并在上方加一个极轻的 "AI" 分组标题（或者直接单独分一个 section）
2. **图标升级**：`✨` 换成更有识别度的图标（考虑 `Sparkles` / `MessageCircleQuestion` lucide icon，和悬浮球保持视觉呼应）
3. **样式区分**：轻微加强（比如浅紫色 hover / 选中时的 accent），提示这是"不一样"的入口

---

### 3.3 全页布局重构

#### 目标结构

```
┌─ AskAnywhereView ─────────────────────────────────────────────┐
│  ┌─ Session Sidebar 240 ─┐  ┌─ Main Pane (flex-1) ─────────┐  │
│  │ [+ New]               │  │ ┌─ ContextBar (collapsed) ─┐ │  │
│  │ Ask Anywhere  12:03   │  │ │ ▸ Context (3 anchors,    │ │  │
│  │ 项目规划      昨天     │  │ │   4 skills)              │ │  │
│  │ ...                   │  │ └──────────────────────────┘ │  │
│  │                       │  │ ┌─ ChatView ───────────────┐ │  │
│  │                       │  │ │                          │ │  │
│  │                       │  │ │  messages                │ │  │
│  │                       │  │ │                          │ │  │
│  │                       │  │ │  input                   │ │  │
│  │                       │  │ └──────────────────────────┘ │  │
│  └───────────────────────┘  └──────────────────────────────┘  │
│                                   ▲ Stage drawer (按需从右滑入)│
└───────────────────────────────────────────────────────────────┘
```

#### Session Sidebar

- 保留现有设计，微调：
  - 宽度 `w-60`（当前已是）
  - 列表项高度收紧（当前 2 行：title + time；保留）
  - 置顶"+ New"按钮

#### ContextBar（折叠式上下文条）

- **默认收起**，只显示一行："▸ Context · 3 anchors · 4 skills"（数量汇总）
- **展开后**显示两个分区：
  - **Anchors**：当前 conversation 的所有 anchor（kind + refId，带 icon）
  - **Active Skills**：从 conversation 元数据读取（本期从 anchor 或硬编码默认集推断；动态化留给 ADR-015 D-6）
- 展开态高度上限 `max-h-[180px]`，内部滚动

**重要**：`ContextPanel.tsx` 的当前硬编码 skills（`orbit-capture / orbit-retrieve / orbit-scheduling / orbit-welcome-analysis`）本期**保留为默认集**但**不再常驻一整列**。动态化是下一步。

#### ChatView 主体

- 占主 pane 剩余空间
- 复用 `components/chat/ChatView.tsx`（和弹层共用）

#### Stage Drawer（按需抽屉）

- **默认不显示**（当前是常驻 80px 宽第四列）
- **触发方式**（本期选这条）：**conversation 的 stage 非空时，在 ChatView 顶部右侧出现一个小徽章 "Stage · 2 artifacts ↗"**；点击打开抽屉；有 artifact 产出时**徽章脉冲一次**提示用户
- 抽屉宽度 `w-80`，从右侧叠加（不挤压 ChatView，ChatView 仍保持全宽，抽屉用 `absolute` 或 `overlay`）
- 关闭抽屉通过 `×` 或点击徽章二次切换

**为什么不做"artifact 产出自动打开"**：打断用户正在读的消息流，反模式。

---

## 4. 技术架构

### 4.1 新增 / 修改组件

| 文件 | 动作 | 说明 |
|------|------|------|
| `components/ask-anywhere/FloatingBall.tsx` | **重写** | 从 view 切换器改为弹层 open/close 开关 |
| `components/ask-anywhere/AskAnywherePopover.tsx` | **新增** | 弹层容器，复用 ChatView；含 session dropdown / + / ↗ / × |
| `components/ask-anywhere/AskAnywhereHost.tsx` | **新增** | 抽象出 conversation 状态管理 hook（`useAskAnywhereSession`），被 popover 和 view 共享 |
| `views/AskAnywhereView.tsx` | **重写** | 两列布局；挂载 ContextBar / StageDrawer |
| `views/ask-anywhere/ContextPanel.tsx` | **替换** | 改名为 `ContextBar.tsx`，改成顶部折叠条 |
| `views/ask-anywhere/StagePanel.tsx` | **改造** | 改名为 `StageDrawer.tsx`，改成按需抽屉 |
| `components/Sidebar/WorkspaceSidebar.tsx` | **微调** | Ask Anywhere 置顶 + 独立分组 + 图标升级 |
| `store/askAnywhere.ts` | **新增（可选）** | 如果需要 Zustand 管理 popover open 状态 + lastActiveId（否则 useState + localStorage 够） |
| `App.tsx` | **微调** | 挂载 AskAnywherePopover |

### 4.2 `useAskAnywhereSession` Hook 抽取

当前 `AskAnywhereView.tsx` 165-219 行的 conversation 加载 / 事件订阅 / send action 逻辑，**抽出到一个 hook 里**，让 popover 和 view 都用同一套：

```ts
function useAskAnywhereSession(activeId: string | null) {
  // sessions list, events, isLoading, stage
  // handleNew, handleAction, handleArtifactAction
  // useEffect: hydrate conversation, subscribe runtime/stage events
  return { sessions, events, isLoading, stage, handleNew, handleAction, ... };
}
```

好处：
- 双容器数据一致性靠复用同一个 hook 保证
- 未来全屏模式接入也是同一 hook
- 单元测试更容易

### 4.3 弹层状态管理

```ts
// store/askAnywhere.ts（或直接 Zustand slice 挂在 usePara/useWorkspace）
interface AskAnywhereSlice {
  popoverOpen: boolean;
  lastActiveId: string | null;   // persist to localStorage
  togglePopover: () => void;
  setLastActiveId: (id: string) => void;
}
```

或者更简单：popover open 状态用 React `useState` 挂在 App.tsx，lastActiveId 直接读写 `localStorage`（无需 store）。**本期选后者**，避免为了 MVP 引入新 store。

### 4.4 Stage 触发徽章

- ChatView 本期**不改**，徽章作为 `AskAnywhereView` 的一部分悬浮在 ChatView 右上角（absolute 定位）
- `stage.artifacts.length > 0` → 显示徽章；为 0 → 隐藏
- 新增 artifact 时（通过订阅 stage event 的 diff）→ 加 `animate-pulse` 1-2s
- 抽屉用 `fixed right-0 top-[header-height] w-80 h-full` + `translate-x` 过渡

### 4.5 悬浮球在全页的隐藏逻辑

当前代码：

```6:12:src/renderer/src/components/ask-anywhere/FloatingBall.tsx
export function FloatingBall(): JSX.Element | null {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);

  if (view.kind === 'askAnywhere') return null;
```

**保留此逻辑**（全页时悬浮球消失避免自指）。新版本里 onClick 改为 `togglePopover()`。

---

## 5. 实施步骤（建议 PR 拆分）

| 步骤 | 内容 | 可独立合并 |
|------|------|------------|
| 1 | 抽 `useAskAnywhereSession` hook，view 重构为使用它（**纯重构，不改 UI**） | ✅ |
| 2 | 新增 `AskAnywherePopover` + 改造 `FloatingBall` onClick；App.tsx 挂载 | ✅ |
| 3 | `WorkspaceSidebar` 视觉强化 | ✅ |
| 4 | 全页两列布局（ContextBar 折叠 + 主 pane）；`ContextPanel → ContextBar` | ✅ |
| 5 | Stage 徽章 + 抽屉（`StagePanel → StageDrawer`） | ✅ |

每步之后跑：

```bash
npm run typecheck
npm run lint -- --quiet
npm test
```

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 弹层和全页并发打开 runtime event 重复处理 | 低（极罕见） | 两侧各自订阅 + 乐观渲染；后端是唯一事实源，最终一致 |
| localStorage `lastActiveId` 指向已删除 conversation | 中 | 打开弹层时 `getConversation(id)` 返回 null 则 fallback 到列表第一条或空态 |
| ContextBar 收起后用户忘记有 Context 概念 | 低 | 数量徽章"3 anchors · 4 skills"做提示 |
| Stage 抽屉叠在 ChatView 上阻挡阅读 | 中 | 抽屉打开时给 ChatView 加 `md:pr-80` 腾出空间（桌面端），小屏保持 overlay |
| 硬编码 skills 继续误导用户 | 中 | ContextBar 展开时明确标注"（默认集，动态化待实现）" |

---

## 7. Checklist（实施完成前自查）

**产品**：
- [ ] 悬浮球点击 = 弹层开关（不再跳转）
- [ ] 弹层顶部下拉能切换会话
- [ ] 弹层"+"新建会话
- [ ] 弹层"↗"推到全页，全页默认打开同一会话
- [ ] 左栏 Ask Anywhere 视觉上独立突出
- [ ] 全页默认两列（Session + Chat）
- [ ] ContextBar 默认收起，展开显示 anchors/skills
- [ ] Stage 徽章仅在非空时显示
- [ ] Stage 抽屉按需打开/关闭

**技术**：
- [ ] `useAskAnywhereSession` hook 被弹层和全页共用
- [ ] localStorage `ask-anywhere.last-active-id` 正确读写
- [ ] 弹层和全页订阅同一 conversation 的 event 无冲突
- [ ] `typecheck / lint / test` 全绿
- [ ] `tests/chat_view.test.ts` 受影响时同步更新

**观察**：
- [ ] 实际 dog-food 1-2 天后评估是否需要弹层位置记忆
- [ ] 记录 Stage 抽屉打开率（后续决定默认展开策略）
