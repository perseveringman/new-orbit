---
title: "Dashboard Widget Registry foundation"
status: implemented
date: 2026-05-20
phase: "Dashboard / PMIL surface"
inspired_by: "Kepo store component model"
---

# Dashboard Widget Registry foundation

## 1. Strategy

Kepo 的可借鉴点不是第三方插件市场，而是把高频关注面拆成小组件：每个组件有清晰能力边界、尺寸、风险说明和可预期的展示目标。

Orbit 的实现选择更保守：

- Dashboard widget 是 **Layer 3 projection**，不拥有真相数据。
- 第一版只支持 **内置受控组件**，不执行第三方 HTML/JS。
- 组件可以展示 Layer 0 信号，但写入 Layer 1 必须继续走 Save / Accept / Approve 等 promotion gate。
- 布局是应用状态，保存到 `<vault>/.orbit/dashboard/layout.json`，不进入用户 Markdown truth。
- 每个组件声明 data layer 与 permission，让用户知道它只是只读、可触发 synthesis，还是写入必须确认。

## 2. Implemented

- 新增 `DashboardWidgetDefinition` / `DashboardLayout` / `DashboardWidgetRegistry` shared contracts。
- 新增内置 widget registry，覆盖北极星、执行、知识闭环、Feed radar、Library digest、Resource momentum、Area balance、系统脉搏和近期活动。
- 新增主进程 dashboard layout store，负责默认布局、规范化、保存与重置。
- 扩展 dashboard IPC / preload：`registry`、`layout`、`saveLayout`、`resetLayout`。
- 重构 `DashboardView` 为组件化网格：
  - 组件库抽屉
  - 启用 / 隐藏
  - 上移 / 下移
  - 尺寸轮换
  - 恢复默认
  - 每个组件展示 Layer / permission badge
- 新增 `tests/dashboard_layout.test.ts` 覆盖未知组件过滤、重复去重、非法尺寸回退和 `.orbit/dashboard/layout.json` 持久化。

## 3. Current widgets

| Widget | Layer | Notes |
| --- | --- | --- |
| 北极星 | Layer 1 + 2 | Vision 摘要、每日复盘入口 |
| 决策队列 / 可开始工作 / 阻塞 / Agent 通道 | Layer 1 + system | 保留执行压力入口 |
| 执行队列 | Layer 1 | 项目压力和下一批任务 |
| 知识闭环 | Layer 1 + 2 | Capture → Library / Resource / Project |
| 信息流雷达 | Layer 0 + 2 | 明确标注 Feed 不是用户数据 |
| 资料消化 | Layer 1 + 2 | 待读、阅读中、已读待蒸馏 |
| 资源动量 | Layer 1 + 2 | Resource 活跃度、休眠、depth |
| 领域平衡 | Layer 1 + 2 | Area 分布和动量 |
| 系统脉搏 | system | Git / Runtime / Budget / Worktree |
| 近期活动 | Layer 1 + 2 + system | Activity Log projection |

## 4. Deliberate non-goals

- 不做公开 widget store。
- 不运行第三方 widget 代码。
- 不允许 widget 绕过 Layer 0 → Layer 1 promotion gate。
- 不把 dashboard layout 写入 Notes / Library / Resource。
- 不让 AI 直接生成可执行 UI 代码；后续若做自定义，优先做“自然语言生成查询型 widget”。

## 5. Follow-up

1. 给 widget registry 增加 CLI / agent-readable snapshot，补齐 AI-native parity。
2. 支持 dashboard preset：战略驾驶舱、今日执行、阅读消化、系统维护。
3. 把 widget data resolver 从 renderer 内联逻辑下沉到 main process，便于缓存和测试。
4. 允许用户用自然语言创建只读查询型 widget，但只绑定 Orbit API 和 Synthesis，不执行任意代码。
