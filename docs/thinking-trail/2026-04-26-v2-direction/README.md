# Thinking Trail — Orbit v2 方向确立

> **日期**：2026-04-26
> **类型**：Onboard 对话（Project Brainstorm 的 Onboard 模式）
> **状态**：已 accepted，方向确立完成
> **产出**：10 份 ADR + 8 份 plans + 1 份 overview + 本 Thinking Trail

---

## 这是什么

这个目录保存了 2026-04-26 那天 Orbit v2 方向确立的**完整对话记录和结构化提炼**。

你正在看的 Orbit v2 的所有 ADR、plans、overview 都源自那次对话。文档只保留了结论（**是什么 + 为什么**），但**决策过程的全部推理链、被放弃的选项、关键认知跃迁**都只存在于对话原文里。

这份 Thinking Trail 的作用：

- **文档告诉你 v2 是什么**，Thinking Trail **告诉你 v2 为什么会变成这个样子**
- 未来回看某个 ADR 有疑问时，可以追溯到对话里那一轮的原始讨论
- 未来做重大决策前，可以借鉴这次对话里"哪些方向被放弃、为什么放弃"
- 这是 Orbit 未来 "Thinking Trail" 子系统的**第一次手动实践**——未来自动化后会变成工具做的事

## 对话的元信息

| 项 | 值 |
|---|---|
| 参与者 | 项目拥有者 + AI Onboard agent（project-brainstorm skill） |
| 触发场景 | 用户请求梳理 Orbit 项目现状、确立未来迭代方向 |
| 对话轮数 | ~50 轮 |
| 产出 | 10 份 ADR / 8 份 plans / 1 份 overview / VISION + ROADMAP 重写 |
| 关键突破 | 6 次重大认知跃迁（见 `key-pivots.md`） |

## 本目录的文件

| 文件 | 用途 |
|------|------|
| [`README.md`](./README.md) | 本文件：索引和导读 |
| [`conversation.md`](./conversation.md) | 完整对话原文，按轮次组织 |
| [`key-pivots.md`](./key-pivots.md) | 6 个关键认知跃迁点的结构化提炼 |
| [`decisions-traced.md`](./decisions-traced.md) | 10 份 ADR 的对话溯源表 |

## 读者指引

根据你的目的不同，有几种阅读路径：

### 想快速理解方向

→ 读 `docs/overview.md`（不需要读本目录）

### 想理解某条决策的推理

→ 读对应 ADR 正文
→ 如仍有疑问，查 `decisions-traced.md` 找到该决策在对话中的讨论位置
→ 回到 `conversation.md` 读原文

### 想理解"当时走过的弯路"

→ 读 `key-pivots.md` 的 6 个跃迁点，每个都讲了"跃迁前的错误认知"

### 想学习这种"Onboard 对话"的方法论

→ 从 `conversation.md` 开头读，观察 AI 如何通过提问、假设、推翻、再提议的循环，逐步帮用户把模糊的方向固化为可执行计划

### 未来做类似重大决策参考

→ 读 `key-pivots.md`（模式复用）
→ 观察哪些洞察最终让决策成立

---

## 对 "Thinking Trail" 子系统的启发

这次手动实践验证了 Thinking Trail 的核心价值：

1. **原始对话**（conversation.md）是不可压缩的黄金——任何"提炼"都会损失信息
2. **结构化提炼**（key-pivots.md / decisions-traced.md）是**面向回溯者**的压缩——不代替原文，只是索引
3. **关键转折点**（key-pivots）的识别是人/AI 合作的高价值动作——自动化时需要 agent 能识别"这一轮发生了认知跃迁"
4. **溯源映射**（decisions-traced）需要 ADR 写作者本身做——因为只有他知道哪些决策哪一轮形成

**未来 Thinking Trail 子系统设计时**，应该按"原始层 + 提炼层 + 溯源层"三层来组织，不要把所有内容糅在一起。

详细方案将在 `open-questions.md` 的 Thinking Trail 条目中展开，由未来某次迭代正式落地。
