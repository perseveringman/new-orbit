# Orbit Memory Eval

独立评测系统，用来反复跑 Orbit 当前 PMIL / Memory pipeline，以及外部记忆后端 profile，并在 Web 报表里查看结果。

默认评测：

- LongMemEval：`longmemeval_oracle.json`
- PersonaMem：`questions_32k.csv` + `shared_contexts_32k.jsonl`

## 运行

```bash
npm run eval:sync
npm run eval:run -- --suite both
npm run eval:web
```

打开 `http://127.0.0.1:5177` 查看结果。

常用参数：

```bash
npm run eval:run -- --suite longmemeval --longmemeval-split oracle --limit 50
npm run eval:run -- --suite personamem --personamem-split 32k
npm run eval:run -- --mode hy-memory --suite both --longmemeval-split s_cleaned --personamem-split 32k
```

## Profile

- `orbit-current`：当前仓库内的 PMIL / Memory pipeline。
- `hy-memory`：把每个 benchmark case 的会话写入 HY Memory 服务，再用 `/api/v1/search` 召回记忆，并复用本地答案选择与评分逻辑。

`hy-memory` 会优先连接 `--hy-server-url`，默认 `http://127.0.0.1:19527`。如果服务未运行，会尝试在 `~/.openclaw/hy-memory-venv` 安装并启动 `hy-mem-internal`。服务配置优先读取当前环境变量里的 `MEMORY_*`，其次读取 `~/.openclaw/openclaw.json` 里 `openclaw-hy-memory` 的配置。

常用参数：

```bash
npm run eval:run -- --mode hy-memory --suite personamem --limit 20
npm run eval:run -- --mode hy-memory --hy-local-embed --suite personamem --limit 20
npm run eval:run -- --mode hy-memory --hy-no-auto-start --hy-server-url http://127.0.0.1:19527
npm run eval:run -- --mode hy-memory --hy-top-k 20 --hy-min-score 0
```

没有外部 embedding / LLM 凭证时，可以加 `--hy-local-embed`。它会启动一个本地 OpenAI-compatible deterministic model endpoint，并让 HY Memory 以 `pro` 模式运行。这个模式适合本地连通性与 workflow 回归，不等价于 Hunyuan 官网 Pro 配置。

## 结果目录

- `eval/data/`：下载的数据集，已 gitignore
- `eval/runs/`：完整运行产物，已 gitignore
- `eval/web/public/results/`：Web 可读的最近运行结果，已 gitignore

每次运行都会保存：

- `summary.json`
- `{suite}-{split}.jsonl`
- Web 用的 `{suite}-{split}.json`

## 当前评分说明

`orbit-current` 使用当前仓库内的：

- `ConversationStore`
- `extractMemoryCandidates`
- `MemoryStore`
- `EvidenceChunkIndexStore`
- `buildContextPacket`
- `recallContext`

LongMemEval 当前先用本地 exact / token-F1 / answer-in-context 指标，不调用官方 LLM judge。PersonaMem 使用多选题 exact accuracy。这个设计优先保证本地可重跑和低成本，后续可以增加 `llm-judge` profile。
