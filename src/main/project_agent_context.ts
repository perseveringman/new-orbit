import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as frontmatter from './frontmatter';
import {
  PROJECT_AGENT_MD,
  PROJECT_LOG_ARCHIVE_DIR,
  PROJECT_OPERATION_LOG,
  PROJECT_ORBIT_AGENT_DIR,
  PROJECT_ORBIT_DIR,
  PROJECT_ORBIT_LOGS_DIR,
  PROJECT_ORBIT_SKILLS_DIR,
  PROJECT_SESSION_HISTORY,
  PROJECT_TIMELINE
} from '@shared/constants';
import { syncProjectBridges } from './project_bridges';
import { defaultAgentExposureSettings, readProjectConfig } from './project_config';

export interface ProjectAgentContextMeta {
  name: string;
  slug: string;
  uid: string;
  template: string;
  description?: string;
}

type EntryTarget = 'claude' | 'codex' | 'gemini';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readPackageScripts(
  projectDir: string
): Promise<Record<string, string> | null> {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    const raw = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return raw.scripts ?? {};
  } catch {
    return null;
  }
}

function buildIndex(hasCommunityConventions: boolean): string {
  const communityRow = hasCommunityConventions
    ? '| 社区约定 | `community-conventions.md` | 已吸收的社区 AGENT / AGENTS / .agent 约定 |'
    : '';
  return `# Orbit Agent Skills

以下是在 Orbit 工作台中工作时可用的技能指南。根据当前任务按需阅读。

| Skill | 文件 | 说明 |
|---|---|---|
| Orbit 世界模型 | \`orbit-world.md\` | Orbit 是什么、PARA / Project / Task / Worktree 等概念 |
| 任务工作流 | \`task-workflow.md\` | 如何创建、管理、推进任务 |
| 项目理解 | \`project-understanding.md\` | 如何理解当前项目目标、约束和最近进展 |
| 工具与命令 | \`tooling-commands.md\` | 本项目的构建 / 测试 / 运行命令与发现方式 |
| Worktree 工作流 | \`worktree-workflow.md\` | 何时以及如何使用 worktree |
| 安全规则 | \`safety-rules.md\` | 操作边界与安全约束 |
| MCP 工具指南 | \`mcp-tools.md\` | 可用的 Orbit MCP 工具及推荐用法 |
${communityRow}

## 操作记录
\`.orbit/agent/logs/TIMELINE.md\` 包含本项目的历史操作记录，可用于恢复上下文。
\`.orbit/agent/logs/${PROJECT_SESSION_HISTORY}\` 汇总了项目级 agent 会话历史，可用于恢复近期协作脉络。
`;
}

function buildOrbitWorld(): string {
  return `# Orbit 世界模型

Orbit 是一个个人愿景驱动的 AI 协作工作台。核心原则是：**一切尽量以 Markdown、Git 和本地文件存在**，让项目状态透明、可追踪、可恢复。

## 核心概念
- **Vault**：整个知识与项目的根目录，采用 PARA 结构组织。
- **Project**：位于 \`01_Projects/\` 下的文件夹型项目，内部有 README、AGENT、任务与记忆目录。
- **Task**：位于 \`.orbit/agent/tasks/\` 的 Markdown 任务文件，是执行过程的最小管理单元。
- **Worktree**：用于大改动、实验或并行任务的隔离工作副本。
- **Distill / Night Shift**：Orbit 中用于总结、回顾和持续推进工作的机制。

## Agent 在 Orbit 中的角色
你不是纯聊天助手，而是 Orbit 工作流中的执行参与者。你需要理解项目目标、维护任务状态、记录思考与执行轨迹，并保持改动可逆、可审计。
`;
}

function buildTaskWorkflow(): string {
  return `# 任务工作流

## Task 结构
Orbit 任务文件位于 \`.orbit/agent/tasks/\`，采用四段式结构：
1. \`# Description\`
2. \`# Agent Thinking\`
3. \`# Execution Log\`
4. \`# Summary\`

## 状态流转
\`backlog -> waiting -> todo -> doing -> blocked -> done\`

## 推荐工作流
1. 先判断当前工作是否值得沉淀为 task。
2. 需要持续跟踪或多步执行时，优先使用 \`create_task\`。
3. 先读任务正文、README、AGENT 和近期日志，判断信息是否充分。
4. 如果信息不足，先提出澄清问题，并把任务保持在 \`waiting\` 或 \`blocked\`，不要直接宣布完成。
5. 开始执行后用 \`update_task_status\` 进入 \`doing\`。
6. 关键决策写入 \`# Agent Thinking\`，执行进展写入 \`# Execution Log\`。
7. 结束时补充 \`# Summary\`，并仅在真正完成后更新为 \`done\`。

## 常用 MCP 工具
- \`create_task\`
- \`list_tasks\`
- \`update_task_status\`
- \`append_execution_log\`
- \`log_thinking\`
`;
}

function buildProjectUnderstanding(meta: ProjectAgentContextMeta): string {
  return `# 项目理解

当前项目：**${meta.name}**（slug: \`${meta.slug}\`，uid: \`${meta.uid}\`）

## 如何建立项目认知
- 读 \`README.md\`：理解项目目标、frontmatter、状态与正文说明。
- 读 \`AGENT.md\`：理解项目工作人格与协作方式。
- 读 \`.orbit/config.json\`：了解项目基础配置。
- 读 \`.orbit/agent/logs/TIMELINE.md\`：恢复近期进展和历史操作。
- 调用 \`get_vision\`：获取 vault 级长期方向。

## 建议顺序
1. 先读 \`README.md\`
2. 再读 \`AGENT.md\`
3. 需要长期方向时调用 \`get_vision\`
4. 需要最近进展时读 \`.orbit/agent/logs/TIMELINE.md\`
`;
}

function buildWorktreeWorkflow(): string {
  return `# Worktree 工作流

## 何时使用 worktree
- 需要并行推进多个任务
- 需要做实验性改动但不想污染当前工作区
- 需要在保持主分支稳定的同时尝试大改动

## 基本原则
- 一个 worktree 尽量服务一个明确目标
- 复杂任务优先绑定到 task，再进入 worktree
- 完成后及时合并、归档或清理，避免长期漂移
`;
}

function buildSafetyRules(): string {
  return `# 安全规则

- 小步提交，保持可逆。
- 不越过当前项目边界修改其他项目文件。
- 不编造事实；不确定时显式说明。
- 涉及任务推进时同步更新 task markdown。
- 不把临时状态、草稿记录或运行时垃圾写入源码目录。
- 对 vault 外路径或破坏性命令，先获得明确确认。
`;
}

function buildMcpTools(): string {
  return `# MCP 工具指南

## 当前可用工具
- \`create_task\`：创建任务
- \`list_tasks\`：列出当前项目任务
- \`update_task_status\`：更新任务状态
- \`append_execution_log\`：为任务追加执行日志
- \`log_thinking\`：记录任务思考
- \`get_vision\`：读取 vault 级 Vision
- \`search_global_context\`：搜索全局知识上下文
- \`checkpoint_commit\`：提交当前项目代码检查点
- \`get_project_state\`：查看 git 状态与活跃任务摘要
- \`read_operation_log\`：读取近期操作日志
- \`query_operation_log\`：按条件查询操作日志

## 推荐协作模式
1. 创建或确认 task
2. 先确认任务信息是否充分；不足时先用对话提出澄清
3. 真正开始执行时切换 task 状态到 \`doing\`
4. 边执行边追加日志和思考
5. 完成后提交检查点，并只在结果真实落地后更新为 \`done\`
`;
}

function buildToolingCommandsContent(
  template: string,
  scripts: Record<string, string> | null,
  markers: {
    hasMakefile: boolean;
    hasCargoToml: boolean;
    hasPyproject: boolean;
    hasRequirements: boolean;
  }
): string {
  const sections: string[] = ['# 工具与命令', '', '优先读取项目内真实配置文件来确认命令，不要凭空假设。'];

  if (scripts && Object.keys(scripts).length > 0) {
    sections.push('', '## package.json scripts', '');
    for (const [name, cmd] of Object.entries(scripts)) {
      sections.push(`- \`npm run ${name}\` — ${cmd}`);
    }
  } else if (template === 'web-app') {
    sections.push(
      '',
      '## Node / Web 项目提示',
      '',
      '- 优先检查 `package.json` 的 `scripts` 字段。',
      '- 常见入口命令：`npm run dev` / `npm run build` / `npm run test` / `npm run lint`。',
      '- 若同时存在 `pnpm-lock.yaml`，优先考虑使用 `pnpm`。'
    );
  }

  if (markers.hasMakefile) {
    sections.push('', '## Makefile', '', '- 发现 `Makefile` 时，先运行 `make help` 或直接阅读目标。');
  }
  if (markers.hasCargoToml) {
    sections.push('', '## Rust', '', '- 常见命令：`cargo build` / `cargo test` / `cargo fmt` / `cargo clippy`。');
  }
  if (markers.hasPyproject || markers.hasRequirements) {
    sections.push(
      '',
      '## Python',
      '',
      '- 优先阅读 `pyproject.toml`、`requirements.txt` 或虚拟环境说明。',
      '- 常见命令：`python -m pytest`、`ruff check`、`python -m build`。'
    );
  }

  sections.push(
    '',
    '## 执行原则',
    '',
    '- 先发现，再执行；不要假设命令存在。',
    '- 执行高风险修改前，用 `checkpoint_commit` 保存可恢复节点。',
    '- 危险命令（删除、重置、批量覆盖）需要额外谨慎。'
  );

  return sections.join('\n') + '\n';
}

function buildEntry(target: EntryTarget): string {
  const label =
    target === 'claude' ? 'Claude' : target === 'codex' ? 'Codex' : 'Gemini';
  return `# Orbit Project

你正在 Orbit 工作台的一个项目中工作。Orbit 是个人愿景驱动的 AI 协作工作台，所有项目数据都以 Markdown + Git 形式存储在本地 vault 中。

## 安全规则（必须遵守）
- 小步提交，保持可逆
- 不越过项目边界修改文件
- 不确定时显式说明，不要编造
- 修改任务相关内容时更新对应 task markdown

## 技能指南
\`.orbit/agent/skills/_index.md\` 列出了所有可用的 Orbit 工作技能，根据当前任务按需阅读。

## 操作记录
\`.orbit/agent/logs/TIMELINE.md\` 包含本项目的历史操作记录，可用于恢复上下文和了解近期进展。
\`.orbit/agent/logs/${PROJECT_SESSION_HISTORY}\` 汇总了近期项目级 agent 会话，是恢复项目上下文的首选入口之一。

## MCP 工具
本项目已配置 Orbit MCP server，提供任务管理、代码提交、知识检索等工具。详见 \`.orbit/agent/skills/mcp-tools.md\`。

> 此文件面向 ${label} 入口。若需要更深入认知，请从 skills 索引继续阅读。
`;
}

function buildBridgeAgentMd(): string {
  return `# Orbit Bridge

This repository is managed in Orbit. When working manually, start from:

- \`.orbit/agent/skills/_index.md\`
- \`.orbit/agent/logs/${PROJECT_SESSION_HISTORY}\`
- \`.orbit/agent/logs/${PROJECT_TIMELINE}\`
`;
}

function buildBridgeAgentsMd(): string {
  return `# Orbit Agent Bridge

If you are an agent started manually from the project root, Orbit context lives under:

- \`.orbit/agent/skills/_index.md\`
- \`.orbit/agent/skills/project-understanding.md\`
- \`.orbit/agent/logs/${PROJECT_SESSION_HISTORY}\`

Use those files as the Orbit source of truth instead of treating root bridge files as canonical.
`;
}

async function readCommunityConventions(projectDir: string): Promise<string | null> {
  const config = await readProjectConfig(projectDir);
  const exposure = config?.agent_exposure ?? defaultAgentExposureSettings();
  const sections: string[] = [];

  if (exposure.consumeCommunityAgentMd) {
    try {
      const raw = await fs.readFile(path.join(projectDir, PROJECT_AGENT_MD), 'utf8');
      const { body } = frontmatter.read(raw);
      const content = body.trim();
      if (content) sections.push(`# Imported from AGENT.md\n\n${content}`);
    } catch {
      // ignore
    }
  }

  if (exposure.consumeCommunityAgentsMd) {
    try {
      const raw = (await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8')).trim();
      if (raw) sections.push(`# Imported from AGENTS.md\n\n${raw}`);
    } catch {
      // ignore
    }
  }

  if (exposure.consumeCommunityDotAgent) {
    try {
      const dirents = await fs.readdir(path.join(projectDir, '.agent'), { withFileTypes: true });
      const entries = dirents
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => `- ${entry.name}`);
      if (entries.length > 0) {
        sections.push(`# Imported from .agent\n\n${entries.join('\n')}`);
      }
    } catch {
      // ignore
    }
  }

  return sections.length > 0 ? `${sections.join('\n\n')}\n` : null;
}

export async function buildProjectAgentContextFiles(
  projectDir: string,
  meta: ProjectAgentContextMeta
): Promise<Record<string, string>> {
  const scripts = await readPackageScripts(projectDir);
  const communityConventions = await readCommunityConventions(projectDir);
  const markers = {
    hasMakefile: await exists(path.join(projectDir, 'Makefile')),
    hasCargoToml: await exists(path.join(projectDir, 'Cargo.toml')),
    hasPyproject: await exists(path.join(projectDir, 'pyproject.toml')),
    hasRequirements: await exists(path.join(projectDir, 'requirements.txt'))
  };

  return {
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, '_index.md')]:
      buildIndex(!!communityConventions),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'orbit-world.md')]:
      buildOrbitWorld(),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'task-workflow.md')]:
      buildTaskWorkflow(),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'project-understanding.md')]:
      buildProjectUnderstanding(meta),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'tooling-commands.md')]:
      buildToolingCommandsContent(meta.template, scripts, markers),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'worktree-workflow.md')]:
      buildWorktreeWorkflow(),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'safety-rules.md')]:
      buildSafetyRules(),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_SKILLS_DIR, 'mcp-tools.md')]:
      buildMcpTools(),
    ...(communityConventions
      ? {
          [path.posix.join(
            PROJECT_ORBIT_DIR,
            PROJECT_ORBIT_AGENT_DIR,
            PROJECT_ORBIT_SKILLS_DIR,
            'community-conventions.md'
          )]: communityConventions
        }
      : {}),
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_LOGS_DIR, PROJECT_OPERATION_LOG)]:
      '',
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_LOGS_DIR, PROJECT_TIMELINE)]:
      '# 操作时间线\n\n_尚无记录。_\n',
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_LOGS_DIR, PROJECT_SESSION_HISTORY)]:
      '# 项目会话历史\n\n_尚无记录。_\n',
    [path.posix.join(PROJECT_ORBIT_DIR, PROJECT_ORBIT_AGENT_DIR, PROJECT_ORBIT_LOGS_DIR, PROJECT_LOG_ARCHIVE_DIR, '.gitkeep')]:
      '',
    'CLAUDE.md': buildEntry('claude'),
    'CODEX.md': buildEntry('codex'),
    'GEMINI.md': buildEntry('gemini')
  };
}

export async function ensureProjectAgentContext(
  projectDir: string,
  meta: ProjectAgentContextMeta,
  opts: { overwrite?: boolean } = {}
): Promise<void> {
  const files = await buildProjectAgentContextFiles(projectDir, meta);
  const config = await readProjectConfig(projectDir);
  const exposure = config?.agent_exposure ?? defaultAgentExposureSettings();
  const overwrite = opts.overwrite ?? false;

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(projectDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (!overwrite && (await exists(abs))) continue;
    await fs.writeFile(abs, content, 'utf8');
  }

  await syncProjectBridges(projectDir, exposure, {
    [PROJECT_AGENT_MD]: buildBridgeAgentMd(),
    'AGENTS.md': buildBridgeAgentsMd()
  });
}

export async function readProjectAgentContextMeta(
  projectDir: string
): Promise<ProjectAgentContextMeta | null> {
  try {
    const readme = await fs.readFile(path.join(projectDir, 'README.md'), 'utf8');
    const { data, body } = frontmatter.read(readme);
    const desc = body.trim().split('\n').find((line) => line.trim().length > 0) ?? '';
    return {
      name:
        typeof data['title'] === 'string'
          ? (data['title'] as string)
          : path.basename(projectDir),
      slug:
        typeof data['slug'] === 'string'
          ? (data['slug'] as string)
          : path.basename(projectDir),
      uid: typeof data['uid'] === 'string' ? (data['uid'] as string) : '',
      template:
        typeof data['template'] === 'string' ? (data['template'] as string) : 'blank',
      description: desc
    };
  } catch {
    return null;
  }
}
