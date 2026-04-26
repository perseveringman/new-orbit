# Orbit — Agent Guidelines

## 核心原则：先读愿景，再动代码

**任何任务开始前，必须先阅读以下两份文档，确保改动方向与产品愿景一致：**

1. [`docs/VISION.md`](./docs/VISION.md) — 产品愿景与长期方向
2. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — 当前阶段目标与待办项

**严禁脱离愿景方向乱改代码。** 如果用户的需求与愿景冲突，先指出冲突并与用户确认，不要擅自决定。

## 文档查阅策略

按需查阅，不要一次性读完所有文档：

| 场景 | 查阅文档 |
| ---- | -------- |
| 了解产品愿景与方向 | `docs/VISION.md` |
| 了解当前进度与待办 | `docs/ROADMAP.md` |
| 涉及系统架构、模块边界、IPC 设计 | `docs/architecture.md` |
| 涉及环境搭建、调试、测试方式 | `docs/DEVELOPMENT.md` |
| 涉及具体功能实现 | `docs/plans/` 下对应的方案文档（用到时再读） |
| 涉及历史决策背景 | `docs/decisions/` 下对应的 ADR（用到时再读） |

## Workflow

1. **读愿景** —— 先读 `VISION.md` 和 `ROADMAP.md`，确认任务方向对齐
2. **读上下文** —— 按需查阅相关 plan / ADR / 模块代码
3. **最小改动** —— 只改需要改的，不做额外重构
4. **验证** —— 运行 `npm run typecheck`
5. **提交** —— 语义化 commit（格式见下）

## Commit 规范

- 格式：`<type>(<scope>): <中文描述>`，例：`fix(sidebar): 修复列表溢出`
- 只暂存当前任务相关文件，禁止 `git add -A` / `git add .`
- 一个 commit 对应一个逻辑变更
- 完成大需求后，按需更新 `CHANGELOG.md` 或对应 plan 的 status
