# Migration Guide — legacy single-file projects → v3 project folders

自 Orbit 1.0 起，每个项目都是一个文件夹（`01_Projects/<slug>/`），而不是一份 `.md`。本文讲怎么把旧 vault 迁过来，以及怎么回滚。

## What changes

**Before (legacy):**

```
01_Projects/my-project.md      # frontmatter + Plan + Agent section all inline
```

**After (v3):**

```
01_Projects/my-project/
├── README.md            # frontmatter + project body (no Agent section)
├── AGENT.md             # extracted or template-rendered persona
├── .orbit/config.json   # project-level Orbit config
├── .gitignore
├── .git/                # per-project repo
└── .orbit/agent/
    ├── tasks/.gitkeep
    └── memories/.gitkeep
```

## How to migrate

1. Launch Orbit on the vault you want to upgrade.
2. 顶栏会出现黄色提示条：**"发现 N 个旧格式项目，点击迁移"**。
3. 点击进入 Migration Dialog。它会：
   - 跑一次 dryRun 预览 "将要迁移的 slug 列表"
   - 如果 vault 根已是 git repo，**自动 `git add -A && git commit -m "orbit: pre-v3 migration snapshot"`**，并把 commit SHA 显示给你（用作回滚锚点）
4. 确认 **Migrate N projects**；Orbit 开始逐个迁移：
   - 读旧 `.md` 的 frontmatter + body
   - 提取 `## Agent` 章节（如有）变成 `AGENT.md`
   - 其余 body 写入新的 `README.md`（保留/补齐 frontmatter 必要字段）
   - 创建 `.orbit/` project config 与 agent 结构
   - `git init` 新项目仓库
   - 删掉旧 `.md`
5. 结束后 Dashboard 会自动刷新项目列表。

## Partial success

每个项目的迁移是**独立事务**：其中一个失败不会终止整批。

- 失败的项目会在结果弹窗的 **Failed (N)** 列出，含错误信息
- 失败项目的半成品文件夹会被 `fs.rm -rf` 清掉，保留原 `.md`，方便你修复后再跑一次
- 你随时可以再次触发 Migration Dialog；已迁移的会被 **Skipped** 略过（幂等）

## Rollback

迁移前的那个 snapshot commit 就是你的回滚锚点：

```bash
cd <vault-root>
git log --oneline | head -5
# 找到 "orbit: pre-v3 migration snapshot" 那一行，记它的 sha

git reset --hard <sha>
```

这会把 vault 根 repo 回到迁移前的状态。注意：
- 如果 vault 根**本来就不是 git repo**，Orbit 无法生成 snapshot，这种情况下建议先 `git init` 一次再迁移
- 新建的 per-project `.git` 目录**不会**被 vault 根 repo 跟踪（项目根有自己的 `.git`），回滚 vault 根不会影响到它们的历史
- 如需完全撤销，`rm -rf 01_Projects/<slug>/` 然后 `git checkout -- 01_Projects/<slug>.md`

## Safety checklist

迁移前建议自己再加一层保险：

```bash
cp -R <vault> <vault>.backup.$(date +%Y%m%d)
# 或
cd <vault> && git bundle create /tmp/vault-backup-$(date +%Y%m%d).bundle --all
```

## Edge cases

- **老 project 的 `## Agent` 章节**会被整段提进 `AGENT.md`；如果没有该章节，Orbit 用 `blank` 模板生成一个默认 persona
- **老 project 没有 `uid` 字段**：迁移时 `ensureUid` 会补一个稳定 UID；任何引用它的 `[[wikilink]]` 若按 slug 解析的照常工作
- **Task 文件**如果原先就在 `01_Projects` 顶层，请手动把它挪进对应的项目文件夹 `<slug>/.orbit/agent/tasks/`（或在 Orbit 里打开、点 **Try rescue → Relink**）
- **`04_Archives/` 里的旧单文件项目**不会被本迁移触碰——它们已经归档，不影响使用

## After migration

- 打开每个项目，检查 `README.md` + `AGENT.md` 是否内容正确
- 可以选择手动 `cd` 进每个项目 `git log` 看看初始 commit
- 清理完毕后可以把 snapshot commit 正常 push 或删除
