# 2026-06 — Memory Eval System

## Status

Implemented foundation. Added HY Memory comparison profile.

## Goal

为 Orbit 当前记忆系统沉淀一套可随时重跑的评测工作流，并用独立 Web 应用展示 LongMemEval 与 PersonaMem 的运行结果。

## Alignment

这套系统服务于 Orbit 的 PMIL 方向：记忆、证据、上下文注入必须可解释、可回归、可审计。评测结果是 Layer 3 开发者 surface，不写入用户 vault，也不替代 Layer 1 truth。

## Architecture

```text
eval/
  runner/     dataset sync, ingest, profile calls, scoring
  web/        independent Vite/React report app
  data/       downloaded benchmark files, ignored
  runs/       immutable run outputs, ignored
```

Runner 的 `orbit-current` profile 直接调用当前仓库实现：

- ConversationStore 写入 benchmark 会话
- extractMemoryCandidates 抽取当前启发式 MemoryNode
- EvidenceChunkIndexStore 建 evidence chunks
- buildContextPacket 组装 PMIL 上下文
- recallContext 召回 MemoryNode
- deterministic answer selector 产出可评分答案

Runner 的 `hy-memory` profile 连接 HY Memory 服务：

- 每个 benchmark case 使用独立 user namespace，避免题目间串扰
- 将会话写入 `/api/v1/add`
- 通过 `/api/v1/search` 召回 HY Memory 记忆
- 转换为统一的 evidence / memoryRefs 报表结构
- 复用本地答案选择与评分逻辑，确保与 `orbit-current` 横向可比
- 无外部凭证时可通过 `--hy-local-embed` 启动本地 deterministic OpenAI-compatible model endpoint，驱动 HY Memory `pro` 模式做 workflow 回归

## Default Datasets

- LongMemEval: `longmemeval_oracle.json`
- PersonaMem: `questions_32k.csv` + `shared_contexts_32k.jsonl`

LongMemEval 的 `s_cleaned` / `m_cleaned` 文件更大，runner 已支持通过 `--longmemeval-split s_cleaned` 或 `m_cleaned` 扩展。

## Metrics

LongMemEval:

- exact match
- token F1
- answer-in-context
- session recall@5

PersonaMem:

- exact multiple-choice accuracy
- evidence count
- memory count
- latency

## Commands

```bash
npm run eval:sync
npm run eval:run -- --suite both
npm run eval:run -- --mode hy-memory --suite both --longmemeval-split s_cleaned --personamem-split 32k
npm run eval:web
```

## Known Limits

- LongMemEval 暂未接官方 LLM judge；当前结果是本地可重跑的工程基线，不是 leaderboard 分数。
- `hy-memory` profile 对齐的是记忆后端召回，不包含 Hunyuan 官方页面使用的 Kimi answer model 与 DeepSeek judge。
- `--hy-local-embed` 结果不代表 HY Memory Pro，只证明 HY 后端接入与报表工作流可本地重跑。
- 当前 Memory extractor 只使用最近 30 turns 且偏关键词规则，因此 PersonaMem 长上下文里的 MemoryNode 数量可能偏低。这是评测需要暴露的问题，不在 runner 里绕过。
- Web app 只读静态结果文件；没有修改数据或触发后台运行的权限。
