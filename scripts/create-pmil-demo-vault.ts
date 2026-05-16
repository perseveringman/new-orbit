import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { createVault } from '../src/main/vault';
import { createArea } from '../src/main/area';
import { createProject, createTask } from '../src/main/project';
import { createNoteStore } from '../src/main/note/store';
import { createLibraryStore } from '../src/main/library/store';
import { createResourceStore } from '../src/main/resource/store';
import { ConversationStore } from '../src/main/conversation/store';
import { createStageStore } from '../src/main/ask-anywhere/stage-store';
import { createMemoryStore } from '../src/main/memory/store';
import { createSynthesisStore } from '../src/main/synthesis/store';
import { syncOrbitEvidenceSources, syncExternalAISessionEvidenceSources } from '../src/main/evidence/providers';
import { updateExternalAISessionSettings } from '../src/main/evidence/external-ai-session-settings';
import { createEvidenceStore } from '../src/main/evidence/store';
import { createEvidenceChunkIndexStore } from '../src/main/evidence/chunk-index';
import { createEvidenceGraphStore } from '../src/main/evidence/graph-store';
import { evidenceSourceId, wholeSourceSelector, type EvidenceSelector, type EvidenceSource } from '../src/shared/evidence';
import { buildContextPacket } from '../src/main/context';
import { configureEventReplay, publishTraceableEvent } from '../src/main/events/bus';
import type { NoteAreaRef } from '../src/shared/note';
import type { SynthesisProvenance, SynthesisSource } from '../src/shared/synthesis';

const DEMO_VERSION = 1;
const DEFAULT_TARGET = path.resolve(process.cwd(), '..', 'orbit-pmil-demo-vault');
const BASE_TIME = '2026-05-16T09:00:00.000Z';

interface SeedResult {
  target: string;
  notes: number;
  libraryItems: number;
  resources: number;
  projects: number;
  tasks: number;
  externalSessions: number;
  evidenceSources: number;
  chunks: number;
  graphNodes: number;
  graphEdges: number;
  synthesisArtifacts: number;
  memories: number;
  conversations: number;
}

type DemoAreaRef = NoteAreaRef & { uid: string };

async function main(): Promise<void> {
  const target = parseTarget(process.argv.slice(2));
  await ensureSafeTarget(target);
  await createVault(target);
  await writeDemoMarker(target);
  configureEventReplay(target);

  await writeVaultGuide(target);
  const areas = await seedAreas(target);
  const project = await seedProject(target, areas.product);
  const tasks = await seedTasks(target, project.uid);
  const notes = await seedNotes(target, areas);
  const libraryItems = await seedLibrary(target, areas, notes);
  const resources = await seedResources(target, areas, notes, libraryItems, project);
  const externalRoots = await seedExternalSessions(target);
  await updateExternalAISessionSettings(target, {
    enabled: true,
    limit: 60,
    roots: externalRoots,
    includeAgents: [],
    excludeAgents: [],
    includeProjects: [],
    excludeProjects: [],
    includePathSubstrings: [],
    excludePathSubstrings: [],
    indexLevel: 'safe_projection',
    includeToolOutputs: false
  });

  const externalSources = await syncExternalAISessionEvidenceSources(target, {
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  });
  await syncOrbitEvidenceSources(target, {
    includeActivities: true,
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  });
  const evidenceSources = await createEvidenceStore(target).list({ include_unavailable: true, limit: 10000 });
  const sourceIndex = Object.fromEntries(evidenceSources.map((source) => [source.id, source]));

  await seedConversations(target, externalSources, notes, project);
  await syncOrbitEvidenceSources(target, {
    includeActivities: true,
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  });
  const chunkIndex = await createEvidenceChunkIndexStore(target, {
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  }).rebuild({
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  });
  const graph = await createEvidenceGraphStore(target, {
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  }).rebuild({
    includeExternalAISessions: true,
    externalAISessionLimit: 60,
    externalAISessionRoots: externalRoots
  });

  const synthesisArtifacts = await seedSynthesis(target, {
    notes,
    libraryItems,
    resources,
    project,
    externalSources,
    evidenceSources: Object.values(sourceIndex)
  });
  const memories = await seedMemories(target, { notes, externalSources, project });
  await seedAskStage(target, project.uid);
  await publishDemoEvents(target, { notes, libraryItems, resources, project, tasks, externalSources });
  await syncOrbitEvidenceSources(target, {
    includeActivities: true,
    includeExternalAISessions: true,
    externalAISessionRoots: externalRoots,
    externalAISessionLimit: 60
  });
  const actualNoteCount = (await createNoteStore(target).list({ include_archived: true })).length;
  const actualLibraryCount = (await createLibraryStore(target).list({ include_archived: true })).length;
  const actualResourceCount = (await createResourceStore(target).list({ include_archived: true })).length;
  const actualEvidenceCount = (await createEvidenceStore(target).list({ include_unavailable: true, limit: 10000 })).length;
  const actualConversationCount = (await new ConversationStore(target).list()).length;
  await writeFinalGuide(target, {
    target,
    notes: actualNoteCount,
    libraryItems: actualLibraryCount,
    resources: actualResourceCount,
    projects: 1,
    tasks: tasks.length,
    externalSessions: externalSources.length,
    evidenceSources: actualEvidenceCount,
    chunks: Object.keys(chunkIndex.chunks).length,
    graphNodes: Object.keys(graph.nodes).length,
    graphEdges: Object.keys(graph.edges).length,
    synthesisArtifacts,
    memories,
    conversations: actualConversationCount
  });
  await commitVault(target);

  const summary: SeedResult = {
    target,
    notes: actualNoteCount,
    libraryItems: actualLibraryCount,
    resources: actualResourceCount,
    projects: 1,
    tasks: tasks.length,
    externalSessions: externalSources.length,
    evidenceSources: actualEvidenceCount,
    chunks: Object.keys(chunkIndex.chunks).length,
    graphNodes: Object.keys(graph.nodes).length,
    graphEdges: Object.keys(graph.edges).length,
    synthesisArtifacts,
    memories,
    conversations: actualConversationCount
  };
  console.log(JSON.stringify(summary, null, 2));
}

function parseTarget(args: string[]): string {
  const targetArg = args.find((arg) => arg.startsWith('--target='));
  const fromArg = targetArg?.slice('--target='.length);
  const fromEnv = process.env['ORBIT_PMIL_DEMO_VAULT'];
  return path.resolve(fromArg || fromEnv || DEFAULT_TARGET);
}

async function ensureSafeTarget(target: string): Promise<void> {
  if (target === '/' || target.length < 12) throw new Error(`unsafe target: ${target}`);
  const marker = path.join(target, '.orbit', 'pmil-demo-vault.json');
  const exists = await fileExists(target);
  if (!exists) return;
  if (!(await fileExists(marker))) {
    throw new Error(`Refusing to replace non-demo directory: ${target}`);
  }
  await fs.rm(target, { recursive: true, force: true });
}

async function writeDemoMarker(target: string): Promise<void> {
  await writeJson(path.join(target, '.orbit', 'pmil-demo-vault.json'), {
    version: DEMO_VERSION,
    created_at: BASE_TIME,
    purpose: 'PMIL feature showcase vault',
    safe_to_regenerate: true
  });
}

async function writeVaultGuide(target: string): Promise<void> {
  await writeText(path.join(target, 'README.md'), `# Orbit PMIL Demo Vault

这个 vault 是 PMIL 展示用数据集，不是用户引导模板。

它故意包含几类互相交叉的数据：

- Layer 1 真相源：Notes、Library、Resources、Project、Task、Conversation、Activity、外部 Agent 会话
- Layer 2 提炼：Personal QA、外部会话摘要、实体画像、Work Context、Open Loops
- 可展示路径：Memory Explorer、Search PMIL context、Ask Anywhere context packet、Project Room PMIL tab、Evidence drill-down

推荐演示问题：

- PMIL 为什么要把外部 AI 会话当作真相源？
- Orbit PMIL 下一步最应该补什么？
- ContextPacket、实体画像、Agent Session 三者之间是什么关系？
- 本地 Agent 会话如何保存为 Note 或转为 Orbit Conversation？
`);
  await writeText(path.join(target, 'Vision.md'), `---
uid: vision-pmil-demo
type: vision
title: PMIL Demo Vision
---
# Vision

把 Orbit 打造成一个能理解长期上下文的本地 AI 工作台。系统应该先尊重真相源，再用关系图、索引、摘要和记忆层帮助用户看清自己正在推进什么。

## 北极星

- Evidence-first：原始 Notes、Library、Conversation、外部 Agent 会话是真相层。
- Perception-driven：PMIL 不替用户下最终判断，而是把上下文带到 Ask、Search、Review、Project Room。
- Local-first：所有展示数据都在这个 vault 里，能够被 Obsidian 和 Git 检查。
`);
}

async function seedAreas(target: string): Promise<{ product: DemoAreaRef; research: DemoAreaRef }> {
  const product = await createArea(target, {
    uid: 'area-product-strategy',
    slug: 'product-strategy',
    name: '产品策略',
    description: 'Orbit、PMIL、Memory Explorer 的产品判断与演示路径。',
    template: 'blank',
    tags: ['pmil', 'product']
  });
  const research = await createArea(target, {
    uid: 'area-ai-research',
    slug: 'ai-research',
    name: 'AI 记忆研究',
    description: 'RAG、知识图谱、会话记忆和上下文工程。',
    template: 'blank',
    tags: ['research', 'memory']
  });
  return {
    product: { uid: product.uid, area_slug: product.slug, primary: true, assigned_at: BASE_TIME, assigned_by: 'user' },
    research: { uid: research.uid, area_slug: research.slug, primary: true, assigned_at: BASE_TIME, assigned_by: 'user' }
  };
}

async function seedProject(target: string, area: DemoAreaRef): Promise<{ uid: string; slug: string; relPath: string }> {
  const project = await createProject(target, {
    uid: 'project-pmil-rollout',
    slug: 'orbit-pmil-rollout',
    name: 'Orbit PMIL Rollout',
    template: 'blank',
    description: '把 Personal Memory Intelligence Layer 从基础设施推进到可演示、可理解、可持续迭代的产品体验。',
    area_uid: area.uid,
    tags: ['pmil', 'memory', 'demo']
  });
  await removeNestedProjectGit(target, project.relPath);
  await writeText(path.join(target, project.relPath, 'README.md'), `---
uid: ${project.uid}
type: project
title: Orbit PMIL Rollout
status: active
area_uid: ${area.uid}
tags:
  - pmil
  - memory
  - demo
---
# Orbit PMIL Rollout

目标：让海量本地数据通过证据索引、关系图、摘要、实体画像和记忆召回形成可解释上下文。

## 当前判断

- 外部 Agent 会话是 reference-truth，不默认复制进 Orbit Conversation。
- 摘要、QA、实体画像属于 Layer 2，必须带 evidence selector。
- Memory Explorer 是短期展示入口，Project Room / Ask Anywhere 是真实消费入口。

## 演示成功标准

- 用户能看到 PMIL 为什么知道“我在做什么”。
- 用户能从原始会话一路下钻到摘要、实体画像、ContextPacket。
- 用户能把重要外部会话保存为 Note 或转为 Orbit Conversation。
`);
  return project;
}

async function removeNestedProjectGit(target: string, relPath: string): Promise<void> {
  const projectPath = path.join(target, relPath);
  await fs.rm(path.join(projectPath, '.git'), { recursive: true, force: true });
  const configPath = path.join(projectPath, '.orbit', 'config.json');
  const raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
  raw['git'] = { is_repo: false };
  delete raw['github'];
  await writeJson(configPath, raw);
}

async function seedTasks(target: string, projectUid: string): Promise<Array<{ uid: string; relPath: string }>> {
  const taskSpecs = [
    {
      uid: 'task-pmil-message-range',
      title: '实现 message-range evidence selector',
      status: 'todo',
      priority: 'high',
      description: '让外部 Agent 会话可以精确引用某几轮消息，而不是只能 whole-source 引用。'
    },
    {
      uid: 'task-pmil-snapshot-store',
      title: '设计 first-class snapshot store',
      status: 'backlog',
      priority: 'medium',
      description: '把外部会话快照保存为可审计对象，支撑离线阅读和长期引用。'
    },
    {
      uid: 'task-pmil-demo-script',
      title: '准备 PMIL demo vault 展示脚本',
      status: 'doing',
      priority: 'high',
      description: '围绕 Memory Explorer、Search、Ask、Project Room 整理一条 5 分钟演示路径。'
    }
  ];
  const out: Array<{ uid: string; relPath: string }> = [];
  for (const spec of taskSpecs) {
    const created = await createTask(target, {
      project_uid: projectUid,
      uid: spec.uid,
      title: spec.title,
      description: spec.description,
      frontmatter: {
        status: spec.status,
        priority: spec.priority,
        tags: ['pmil', 'demo']
      }
    });
    out.push({ uid: created.uid, relPath: created.relPath });
  }
  return out;
}

async function seedNotes(target: string, areas: { product: DemoAreaRef; research: DemoAreaRef }) {
  const store = createNoteStore(target);
  return [
    await store.create({
      id: 'note-pmil-evidence-first',
      type: 'longform',
      title: 'PMIL evidence-first 架构判断',
      areas: [areas.product, areas.research],
      tags: ['pmil', 'evidence', 'contextpacket'],
      body: `# PMIL evidence-first 架构判断

AI 会话源是真相层，摘要属于 AI 提炼。Orbit 应该能按需拿到原始会话，但默认只把安全投影、索引、关系和摘要放进上下文。

核心目标不是“多塞材料进 prompt”，而是把海量数据变成可召回的结构：

- EvidenceSource 保留来源、fingerprint、scope_refs 和 privacy policy。
- EvidenceChunkIndex 负责把 Notes、Library、Resources、Projects、Conversations、ExternalAISession 切成可召回 chunks。
- KnowledgeGraph 用 entity mentions、co-occurs、scoped_to 构建关系视角。
- ContextPacket 把 evidence、graph neighbors、Personal QA、MemoryNode、session summary、entity profile 组合成 Agent 当下能用的上下文。

如果只做摘要，系统会忘记证据；如果只做向量，海量数据会召回不稳。PMIL 要把 truth、index、graph、synthesis、memory 连起来。`
    }),
    await store.create({
      id: 'note-user-preferences',
      type: 'thought',
      title: '用户偏好：先看真相源，再看摘要',
      areas: [areas.product],
      tags: ['preference', 'pmil', 'source-first'],
      body: `# 用户偏好：先看真相源，再看摘要

用户明确说过：AI 会话源是真相层，而摘要属于 AI 提炼。可以不直接引入会话的所有内容，但要能够拿到。

这意味着产品体验要强调：

- 任何摘要都应该能回到 evidence selector。
- Memory Explorer 不能只展示“AI 总结”，还要有“查看证据”。
- 保存为 Note 或转为 Orbit Conversation 必须是用户主动动作。
- UI 文案默认中文，普通用户要能理解 PMIL 在帮他“知道我在做什么”。`
    }),
    await store.create({
      id: 'note-memory-explorer-demo-path',
      type: 'capture',
      title: 'Memory Explorer 演示路线',
      areas: [areas.product],
      tags: ['demo', 'memory-explorer', 'pmil'],
      body: `# Memory Explorer 演示路线

1. 打开 Memory Explorer，先看 Memory graph 和本地 Agent 会话中心。
2. 用“PMIL”筛选实体画像，展示系统如何把反复出现的主题变成主页。
3. 打开外部会话安全投影，说明它是 reference-truth，不默认复制。
4. 点击生成摘要，展示 open loops 与 next actions。
5. 点击保存为笔记或转为 Orbit Conversation，说明这是从 reference-truth 主动沉淀到 Orbit-owned Layer 1。

用户要看到的不是“一个聊天工具”，而是一个会把长期上下文组织起来的认知工作台。`
    }),
    await store.create({
      id: 'note-open-loops',
      type: 'thought',
      title: 'PMIL 未闭合问题',
      areas: [areas.research],
      tags: ['open-loop', 'pmil', 'snapshot'],
      body: `# PMIL 未闭合问题

- message-range selector 还没有真正落地，外部会话现在主要是 whole-source selector。
- snapshot store 还不是 first-class artifact，离线保真和长期引用需要更清楚。
- Work Context / Open Loops 目前是 deterministic first-pass，后续需要 LLM refinement 和反馈回路。
- 项目页和 Timeline 还需要更专门的 Agent session browsing。`
    })
  ];
}

async function seedLibrary(target: string, areas: { product: DemoAreaRef; research: DemoAreaRef }, notes: Awaited<ReturnType<typeof seedNotes>>) {
  const store = createLibraryStore(target);
  const graphRag = await store.save({
    kind: 'article',
    title: 'Graph RAG and Personal Context Retrieval',
    url: 'https://example.local/graph-rag-personal-context',
    tags: ['rag', 'knowledge-graph', 'pmil'],
    areas: [areas.research],
    resource_refs: ['pmil-architecture'],
    body: `# Graph RAG and Personal Context Retrieval

Graph retrieval helps when dense vectors alone cannot explain why a result was selected. A personal memory system should use entities, co-occurrence, scope, and explicit citations.

In Orbit PMIL, graph retrieval should not replace search. It should add a second view: what is near this entity, what sources mention it, and which open loops are attached.`
  });
  await store.annotate(graphRag.frontmatter.id, {
    type: 'highlight',
    text: 'Graph retrieval should add a second view over dense retrieval.',
    comment: 'Use this to explain why PMIL needs graph + index + synthesis.'
  });
  await store.markRead(graphRag.frontmatter.id, { markRead: true, readingSecondsDelta: 920 });

  const basb = await store.save({
    kind: 'bookmark',
    title: 'BASB CODE workflow as local-first AI context',
    url: 'https://example.local/basb-code-local-ai',
    tags: ['basb', 'local-first', 'orbit'],
    areas: [areas.product],
    body: `# BASB CODE workflow as local-first AI context

Capture, Organize, Distill, Express becomes more powerful when Distill artifacts keep references to original evidence. Orbit can use this to bridge notes, projects, resources, and agent execution.`
  });
  await store.markRead(basb.frontmatter.id, { progress: 0.65, readingSecondsDelta: 420 });

  const sessionMemory = await store.save({
    kind: 'article',
    title: 'Agent session memory is reference truth',
    url: 'https://example.local/agent-session-memory-reference-truth',
    tags: ['agent-session', 'truth-source', 'memory'],
    areas: [areas.product, areas.research],
    resource_refs: ['agent-session-intelligence'],
    body: `# Agent session memory is reference truth

Agent session transcripts contain user intent, failed branches, decisions, and implicit constraints. Summaries should be generated from them, but never replace them.`
  });

  return [graphRag, basb, sessionMemory].map((item) => ({
    id: item.frontmatter.id,
    title: item.frontmatter.title,
    path: item.path,
    noteRef: notes[0]?.frontmatter.id
  }));
}

async function seedResources(
  target: string,
  areas: { product: DemoAreaRef; research: DemoAreaRef },
  notes: Awaited<ReturnType<typeof seedNotes>>,
  libraryItems: Awaited<ReturnType<typeof seedLibrary>>,
  project: { uid: string; slug: string; relPath: string }
) {
  const store = createResourceStore(target);
  const architecture = await store.create({
    title: 'PMIL Architecture',
    slug: 'pmil-architecture',
    depth: 'practicing',
    areas: [areas.product, areas.research],
    tags: ['pmil', 'architecture', 'memory'],
    body: `# PMIL Architecture

PMIL 的核心是把 truth source、chunk index、knowledge graph、synthesis artifacts、MemoryNode 和 ContextPacket 连成一条可解释链路。`
  });
  await store.linkRef(architecture.frontmatter.slug, {
    kind: 'note',
    ref: notes[0].frontmatter.id,
    title: notes[0].frontmatter.title,
    section: 'canonical'
  });
  await store.linkRef(architecture.frontmatter.slug, {
    kind: 'library_item',
    ref: libraryItems[0].id,
    title: libraryItems[0].title,
    section: 'related'
  });
  await store.linkRef(architecture.frontmatter.slug, {
    kind: 'project',
    ref: project.uid,
    title: 'Orbit PMIL Rollout',
    section: 'projects_touched'
  });
  await store.engage(architecture.frontmatter.slug, {
    title: 'Demo rehearsal',
    summary: 'Use this resource as the conceptual home for graph/index/summary recall.'
  });

  const sessionIntel = await store.create({
    title: 'Agent Session Intelligence',
    slug: 'agent-session-intelligence',
    depth: 'exploring',
    areas: [areas.product],
    tags: ['agent-session', 'external-ai-session', 'truth-source'],
    body: `# Agent Session Intelligence

外部 Agent 会话记录了用户真实工作过程。Orbit 应该先把它作为 reference-truth evidence，再允许用户主动保存为 Note 或转为 Conversation。`
  });
  await store.linkRef(sessionIntel.frontmatter.slug, {
    kind: 'note',
    ref: notes[1].frontmatter.id,
    title: notes[1].frontmatter.title,
    section: 'canonical'
  });
  await store.linkRef(sessionIntel.frontmatter.slug, {
    kind: 'library_item',
    ref: libraryItems[2].id,
    title: libraryItems[2].title,
    section: 'related'
  });

  return [architecture, sessionIntel].map((resource) => ({
    id: resource.frontmatter.id,
    slug: resource.frontmatter.slug,
    title: resource.frontmatter.title,
    path: resource.path
  }));
}

async function seedExternalSessions(target: string) {
  const root = path.join(target, '00_External_Agent_Sessions');
  const codexRoot = path.join(root, 'codex');
  const claudeRoot = path.join(root, 'claude');
  const ampRoot = path.join(root, 'amp');
  await writeJsonl(path.join(codexRoot, 'sessions', '2026', '05', '16', 'pmil-memory-layer.jsonl'), [
    rec('2026-05-16T08:10:00.000Z', 'user', '重新分析 PMIL，核心目标是海量数据通过关系图、索引、摘要让召回更好。'),
    rec('2026-05-16T08:11:12.000Z', 'assistant', '当前策略应坚持 evidence-first：ExternalAISession 保留为 reference truth，distill.external_session 和 entity.profile 作为 synthesis。'),
    rec('2026-05-16T08:18:00.000Z', 'user', '继续实施，先把 Agent session 设置/过滤、session-specific synthesis、entity profile 做出来。'),
    rec('2026-05-16T08:21:00.000Z', 'assistant', '已规划 Memory Explorer 的本地 Agent 会话中心：sync sessions、inspect safe projection、generate summary、save as Note、materialize as Conversation。'),
    toolRec('2026-05-16T08:22:00.000Z', 'npm test -- tests/external_ai_sessions_evidence.test.ts tests/pmil_recall_foundation.test.ts'),
    rec('2026-05-16T08:31:00.000Z', 'assistant', '下一步最关键是 message-range selector 和 first-class snapshot store。')
  ]);
  await writeJsonl(path.join(claudeRoot, '-Users-ryan-Developer-new-orbit', 'pmil-contextpacket-design.jsonl'), [
    rec('2026-05-15T22:05:00.000Z', 'user', 'ContextPacket 应该服务 Ask、Review、Project Room，不只是搜索结果。'),
    rec('2026-05-15T22:06:00.000Z', 'assistant', 'ContextPacket 可以包含 relevant evidence、graph neighbors、Personal QA、MemoryNode recall、Agent Session Summaries、Entity Profiles。'),
    rec('2026-05-15T22:20:00.000Z', 'user', '普通用户需要知道这个系统为什么懂我在做什么。'),
    rec('2026-05-15T22:24:00.000Z', 'assistant', '产品解释：它不是记住所有文字，而是把真相源变成可引用的上下文地图。')
  ]);
  await writeJsonl(path.join(ampRoot, 'threads', 'pmil-demo-review.jsonl'), [
    rec('2026-05-14T18:30:00.000Z', 'user', '给 PMIL demo vault 准备一组能看出功能的测试数据。'),
    rec('2026-05-14T18:32:00.000Z', 'assistant', '数据应覆盖 Notes、Library、Resources、Project、Conversation、ExternalAISession、Synthesis、Memory、Stage artifact。'),
    rec('2026-05-14T18:41:00.000Z', 'assistant', '演示路线先展示 Memory Explorer，再展示 Search/Ask 使用 ContextPacket，最后展示原始证据下钻。')
  ]);
  return [
    { agent: 'codex', source: 'codex-demo', dir: codexRoot, enabled: true },
    { agent: 'claude', source: 'claude-code-demo', dir: claudeRoot, enabled: true },
    { agent: 'amp', source: 'amp-demo', dir: ampRoot, enabled: true }
  ];
}

async function seedConversations(
  target: string,
  externalSources: EvidenceSource[],
  notes: Awaited<ReturnType<typeof seedNotes>>,
  project: { uid: string }
): Promise<void> {
  const store = new ConversationStore(target);
  const ask = await store.create({
    id: 'conv-pmil-demo-ask',
    anchors: [{ kind: 'ask_anywhere_session', refId: 'pmil-demo-ask', addedAt: BASE_TIME }],
    scope: { kind: 'project', project_id: project.uid },
    title: 'Ask：PMIL 下一步判断',
    tags: ['pmil', 'contextpacket', 'demo']
  });
  await store.appendTurn(ask.id, {
    id: 'turn-user-pmil-next',
    at: '2026-05-16T10:00:00.000Z',
    role: 'user',
    content: 'PMIL 现在最该补什么，才能让海量 Agent 会话真的可用？'
  });
  await store.appendTurn(ask.id, {
    id: 'turn-assistant-pmil-next',
    at: '2026-05-16T10:00:18.000Z',
    role: 'assistant',
    content: '短期最该补 message-range selector 和 first-class snapshot store。当前系统已经能把外部会话作为 reference-truth evidence，同步、索引、摘要、保存为 Note、转为 Orbit Conversation；下一步要把“整段会话”细化为“具体几轮证据”。'
  });

  const external = preferredExternalSource(externalSources);
  if (external) {
    const imported = await store.create({
      id: 'conv-external-session-materialized',
      anchors: [{ kind: 'external_session', refId: external.id, addedAt: BASE_TIME }],
      scope: { kind: 'external', platform: 'codex', user_id: 'orbit-pmil-rollout', session_id: external.id },
      title: '外部会话转入：PMIL memory layer',
      tags: ['external-session', 'pmil']
    });
    await store.appendTurn(imported.id, {
      id: 'turn-system-external-origin',
      at: '2026-05-16T10:15:00.000Z',
      role: 'system',
      content: `从本地 Agent 会话主动转入。Source ID: ${external.id}\nOriginal path: ${external.canonical_ref}`
    });
    await store.appendTurn(imported.id, {
      id: 'turn-assistant-external-summary',
      at: '2026-05-16T10:15:30.000Z',
      role: 'assistant',
      content: '这段外部会话围绕 PMIL 的 evidence-first、session-specific synthesis、entity profile、Memory Explorer 展示入口展开。它被转为 Orbit Conversation 后可以继续在 Conversations 中浏览和组织。'
    });
  }

  await createNoteStore(target).create({
    id: 'note-saved-external-session-span',
    type: 'capture',
    title: '保存的外部会话摘录：PMIL 下一步',
    tags: ['pmil', 'agent-session', 'saved-span'],
    source: {
      kind: 'external_ai_session',
      ref: external?.id,
      excerpt: '下一步最关键是 message-range selector 和 first-class snapshot store。'
    },
    body: `# 保存的外部会话摘录：PMIL 下一步

这条 Note 模拟用户在 Memory Explorer 里点击“保存为笔记”的结果。

原始会话仍是 reference-truth evidence；这条 Note 是用户确认值得沉淀的 Orbit-owned Layer 1。

关键判断：下一步要把 whole-source selector 细化为 message-range selector，并补 first-class snapshot store。`
  });
  await createNoteStore(target).update(notes[2].frontmatter.id, {
    body: `${notes[2].body}\n\n## 已验证动作\n\n- 已有示例外部会话转为 Orbit Conversation。\n- 已有示例外部会话摘录保存为 Note。\n`
  });
}

async function seedSynthesis(
  target: string,
  input: {
    notes: Awaited<ReturnType<typeof seedNotes>>;
    libraryItems: Awaited<ReturnType<typeof seedLibrary>>;
    resources: Awaited<ReturnType<typeof seedResources>>;
    project: { uid: string };
    externalSources: EvidenceSource[];
    evidenceSources: EvidenceSource[];
  }
): Promise<number> {
  const store = createSynthesisStore(target);
  const provenance = demoProvenance('seeded-pmil-demo');
  let count = 0;
  const external = preferredExternalSource(input.externalSources);
  if (external) {
    const selector = wholeSourceSelector(external.id, 'safe_projection', 'demo seeded external session distill');
    await store.writeFresh({
      kind: 'distill.external_session',
      scope_key: `distill.external_session:${external.id}`,
      sources: [synthesisSource('external_ai_session', external.id, external.title, external.summary, selector, external.fingerprint.value)],
      provenance,
      payload: {
        source_id: external.id,
        title: external.title,
        agent: 'codex',
        project_ref: input.project.uid,
        period: external.time_range,
        summary: '这段 Codex 会话确定了 PMIL 的主策略：外部 AI 会话是 reference-truth，摘要和实体画像是可引用的 Layer 2，Memory Explorer 是短期展示入口。',
        key_points: [
          '海量数据不能只靠向量召回，需要 evidence chunk index、knowledge graph、session distill 和 entity profile 配合。',
          '外部会话不默认导入 Orbit Conversation，用户主动 materialize 时才进入 Orbit-owned Layer 1。',
          '下一步需要 message-range selector 和 first-class snapshot store。'
        ],
        decisions: [{ title: '保留 ExternalAISession 独立 source kind', evidence: [selector] }],
        open_loops: [
          { title: 'message-range selector 尚未落地', evidence: [selector] },
          { title: 'snapshot store 还不是 first-class artifact', evidence: [selector] }
        ],
        next_actions: ['实现 message-range selector', '设计 snapshot store', '给 Project Room 加 session browsing'],
        entities: ['PMIL', 'ExternalAISession', 'ContextPacket', 'Memory Explorer'],
        evidence: [selector],
        source_hash: external.fingerprint.value
      }
    });
    count += 1;
  }

  const pmilEvidence = selectorForSource(input.evidenceSources, 'note-pmil-evidence-first');
  const preferenceEvidence = selectorForSource(input.evidenceSources, 'note-user-preferences');
  await store.writeFresh({
    kind: 'qa.personal',
    scope_key: 'qa.personal:pmil-demo:truth-source',
    sources: [
      { kind: 'note', ref: 'note-pmil-evidence-first', title: 'PMIL evidence-first 架构判断', metadata: { selector: pmilEvidence } },
      { kind: 'note', ref: 'note-user-preferences', title: '用户偏好：先看真相源，再看摘要', metadata: { selector: preferenceEvidence } }
    ],
    provenance,
    payload: {
      question: '为什么 PMIL 要把外部 AI 会话当作真相源？',
      answer: '因为外部 Agent 会话记录了用户真实工作过程，包括问题、约束、决策和未闭合分支。摘要可以提高召回效率，但不能替代原始会话；PMIL 应该保留按需读取原文的能力，并让所有摘要回到 evidence selector。',
      confidence: 0.86,
      entities: ['PMIL', 'ExternalAISession', 'EvidenceSource'],
      evidence: [pmilEvidence, preferenceEvidence],
      source_chunk_ids: [],
      source_hash: hashText('truth-source-personal-qa'),
      useful_for: ['ask', 'review', 'project']
    }
  });
  count += 1;

  await store.writeFresh({
    kind: 'entity.profile',
    scope_key: 'entity.profile:pmil',
    sources: [{ kind: 'raw', ref: 'entity:PMIL', title: 'Entity profile: PMIL' }],
    provenance,
    payload: {
      entity: 'PMIL',
      summary: 'PMIL 是 Orbit 的个人记忆智能层：它把 Notes、Library、Projects、Conversations 和外部 Agent 会话组织成 evidence-first 的上下文地图。',
      aliases: ['Personal Memory Intelligence Layer', '个人记忆智能层'],
      related_entities: [
        { entity: 'ContextPacket', relation: 'uses', weight: 0.91, evidence: [pmilEvidence] },
        { entity: 'ExternalAISession', relation: 'ingests_reference_truth', weight: 0.88, evidence: external ? [wholeSourceSelector(external.id, 'safe_projection', 'entity profile seed')] : [] },
        { entity: 'Memory Explorer', relation: 'surface', weight: 0.84, evidence: [selectorForSource(input.evidenceSources, 'note-memory-explorer-demo-path')] }
      ],
      top_sources: [
        { source_id: pmilEvidence.source_id, title: 'PMIL evidence-first 架构判断', source_kind: 'note', reason: 'defines the PMIL architecture', evidence: [pmilEvidence] },
        { source_id: preferenceEvidence.source_id, title: '用户偏好：先看真相源，再看摘要', source_kind: 'note', reason: 'captures source-first product requirement', evidence: [preferenceEvidence] }
      ],
      open_questions: ['message-range selector 如何进入 UI？', 'snapshot store 应该如何呈现给普通用户？'],
      evidence: [pmilEvidence, preferenceEvidence],
      source_hash: hashText('entity-profile-pmil')
    }
  });
  count += 1;

  await store.writeFresh({
    kind: 'work.context',
    scope_key: `work.context:project:${input.project.uid}`,
    sources: [{ kind: 'project', ref: input.project.uid, title: 'Orbit PMIL Rollout' }],
    provenance,
    payload: {
      id: 'work-context-pmil-demo',
      scope: { kind: 'project', ref: input.project.uid },
      period: { from: '2026-05-14T00:00:00.000Z', to: BASE_TIME },
      current_focus: '把 PMIL 的基础能力产品化成可展示的上下文系统。',
      active_threads: [
        {
          title: '外部 Agent 会话作为 reference-truth',
          summary: '会话源可同步、索引、摘要、保存为 Note、转为 Orbit Conversation。',
          evidence: external ? [wholeSourceSelector(external.id, 'safe_projection', 'work context seed')] : [],
          confidence: 0.9,
          likely_next_steps: ['message-range selector', 'snapshot store']
        },
        {
          title: '关系图与实体画像',
          summary: '实体画像把反复出现的主题变成可浏览的上下文主页。',
          evidence: [pmilEvidence],
          confidence: 0.82,
          likely_next_steps: ['Project Room dedicated browsing']
        }
      ],
      decisions: [
        { title: '不默认导入所有外部会话', status: 'made', evidence: [preferenceEvidence] },
        { title: '摘要必须引用 evidence selector', status: 'made', evidence: [pmilEvidence] }
      ],
      open_loops: ['message-range selector', 'first-class snapshot store', 'LLM refinement feedback loop']
    }
  });
  count += 1;

  await store.writeFresh({
    kind: 'report.open_loops',
    scope_key: `report.open_loops:project:${input.project.uid}`,
    sources: [{ kind: 'project', ref: input.project.uid, title: 'Orbit PMIL Rollout' }],
    provenance,
    payload: {
      scope: { kind: 'project', ref: input.project.uid },
      period: { from: '2026-05-14T00:00:00.000Z', to: BASE_TIME },
      loops: [
        {
          id: 'loop-message-range',
          title: '外部会话只能 whole-source 引用，缺 message-range selector',
          kind: 'task_candidate',
          status: 'candidate',
          severity: 'warning',
          rationale: '保存片段和精确证据下钻都需要 message range。',
          evidence: external ? [wholeSourceSelector(external.id, 'safe_projection', 'open loop seed')] : [],
          suggested_actions: [{ kind: 'create_task', title: '实现 message-range selector', project_ref: input.project.uid }]
        },
        {
          id: 'loop-snapshot-store',
          title: 'snapshot store 还不是 first-class artifact',
          kind: 'decision_pending',
          status: 'candidate',
          severity: 'suggestion',
          rationale: '长期引用外部会话需要稳定快照，而不是只依赖原始路径。',
          evidence: [pmilEvidence],
          suggested_actions: [{ kind: 'create_note', title: '设计 PMIL snapshot store', note_type: 'longform' }]
        }
      ]
    }
  });
  count += 1;

  return count;
}

async function seedMemories(
  target: string,
  input: { notes: Awaited<ReturnType<typeof seedNotes>>; externalSources: EvidenceSource[]; project: { uid: string } }
): Promise<number> {
  const store = createMemoryStore(target);
  const noteSelector = {
    source_id: evidenceSourceId('note', input.notes[1].frontmatter.id),
    kind: 'whole_source' as const,
    content_view: 'safe_projection' as const,
    reason: 'seeded PMIL memory'
  };
  const preferredExternal = preferredExternalSource(input.externalSources);
  const externalSelector = preferredExternal
    ? wholeSourceSelector(preferredExternal.id, 'safe_projection', 'seeded PMIL memory')
    : noteSelector;
  const memories = [
    await store.create({
      layer: 'semantic',
      kind: 'preference',
      title: '先看真相源，再看摘要',
      summary: '用户认为 AI 会话源是真相层，摘要只是 AI 提炼；PMIL 的所有提炼结果都应该能回到 evidence selector。',
      confidence: 0.92,
      evidence_count: 5,
      user_confirmed: true,
      related_entities: ['PMIL', 'EvidenceSource', 'ExternalAISession'],
      sources: [{ kind: 'note', ref: input.notes[1].frontmatter.id, title: input.notes[1].frontmatter.title, metadata: { selector: noteSelector } }]
    }),
    await store.create({
      layer: 'episodic',
      kind: 'lesson',
      title: 'PMIL 演进顺序：基础层先于会话源',
      summary: '先做好 evidence/index/graph/synthesis/memory 的基础，再接入本地 Agent 会话，能避免后续返工。',
      confidence: 0.82,
      evidence_count: 4,
      related_entities: ['ContextPacket', 'Memory Explorer', 'Agent Session'],
      sources: [{ kind: 'external_ai_session', ref: preferredExternal?.id, title: preferredExternal?.title, metadata: { selector: externalSelector } }]
    }),
    await store.create({
      layer: 'procedural',
      kind: 'pattern',
      title: 'PMIL demo 展示路径',
      summary: '先展示 Memory Explorer，再用 Search/Ask 展示 ContextPacket，最后打开 evidence drill-down 和外部会话沉淀动作。',
      confidence: 0.78,
      evidence_count: 3,
      related_entities: ['Memory Explorer', 'ContextPacket', 'Project Room'],
      sources: [{ kind: 'note', ref: input.notes[2].frontmatter.id, title: input.notes[2].frontmatter.title }]
    }),
    await store.create({
      layer: 'semantic',
      kind: 'goal',
      title: '让海量本地数据可召回、可解释',
      summary: '核心目标是通过关系图、索引、摘要和实体画像把大量数据转成高质量上下文，而不是盲目塞进 prompt。',
      confidence: 0.86,
      evidence_count: 4,
      related_entities: ['KnowledgeGraph', 'Personal QA', 'Entity Profile'],
      sources: [{ kind: 'project', ref: input.project.uid, title: 'Orbit PMIL Rollout' }]
    })
  ];
  await Promise.all(memories.map((memory) => store.update(memory.id, { stability: memory.confidence > 0.85 ? 'core' : 'stable' })));
  return memories.length;
}

async function seedAskStage(target: string, projectUid: string): Promise<void> {
  const packet = await buildContextPacket(target, {
    purpose: 'ask',
    scope: { kind: 'project', ref: projectUid },
    query: 'PMIL 现在最该补什么，Agent session 如何进入上下文？',
    synthesis_mode: 'lookup',
    evidence_limit: 8,
    graph_limit: 8,
    max_tokens: 2600
  });
  await createStageStore(target).add('conv-pmil-demo-ask', {
    id: 'artifact-pmil-context-packet-demo',
    kind: 'pmil.context_packet',
    title: 'PMIL ContextPacket 示例',
    summary: 'Ask Anywhere 本轮会注入的 evidence、session summary、entity profile、memory recall。',
    status: 'confirmed',
    payload: packet,
    refs: packet.evidence.slice(0, 4).map((selector, index) => ({
      kind: 'note' as const,
      ref: selector.source_id,
      label: `Evidence ${index + 1}`
    }))
  });
}

async function publishDemoEvents(
  _target: string,
  input: {
    notes: Awaited<ReturnType<typeof seedNotes>>;
    libraryItems: Awaited<ReturnType<typeof seedLibrary>>;
    resources: Awaited<ReturnType<typeof seedResources>>;
    project: { uid: string };
    tasks: Array<{ uid: string }>;
    externalSources: EvidenceSource[];
  }
): Promise<void> {
  publishTraceableEvent({
    source: 'activity',
    kind: 'activity.user',
    at: '2026-05-16T10:20:00.000Z',
    summary: 'User reviewed PMIL demo route',
    payload: { project_uid: input.project.uid, note_id: input.notes[2].frontmatter.id }
  });
  publishTraceableEvent({
    source: 'activity',
    kind: 'activity.system',
    at: '2026-05-16T10:24:00.000Z',
    summary: 'PMIL demo vault seeded evidence graph and synthesis artifacts',
    payload: {
      project_uid: input.project.uid,
      task_uid: input.tasks[0]?.uid,
      resource_slug: input.resources[0]?.slug,
      external_session_source_id: preferredExternalSource(input.externalSources)?.id,
      library_item_id: input.libraryItems[0]?.id
    }
  });
}

async function writeFinalGuide(target: string, result: SeedResult): Promise<void> {
  await writeText(path.join(target, 'PMIL_DEMO_GUIDE.md'), `# PMIL Demo Guide

## Vault path

\`${target}\`

## Seeded data

- Notes: ${result.notes}
- Library items: ${result.libraryItems}
- Resources: ${result.resources}
- Projects: ${result.projects}
- Tasks: ${result.tasks}
- External Agent sessions: ${result.externalSessions}
- Evidence sources: ${result.evidenceSources}
- Evidence chunks: ${result.chunks}
- Graph nodes: ${result.graphNodes}
- Graph edges: ${result.graphEdges}
- Synthesis artifacts: ${result.synthesisArtifacts}
- Memory nodes: ${result.memories}
- Conversations: ${result.conversations}

## Recommended demo path

1. 打开 Memory Explorer：看 Memory graph、本地 Agent 会话中心、实体画像。
2. 在本地 Agent 会话中心筛选 \`PMIL\`，打开“查看证据”，再看摘要/open loops/next actions。
3. 演示“保存为笔记”和“转为 Orbit 会话”的结果：Notes 里有 \`保存的外部会话摘录：PMIL 下一步\`，Conversations 里有 \`外部会话转入：PMIL memory layer\`。
4. 搜索：\`PMIL 为什么要保留原始 AI 会话？\`，看 Personal QA、evidence citations、graph neighbors。
5. 打开 Project Room：\`Orbit PMIL Rollout\`，看 PMIL context tab 的 current focus、active threads、open loops。
6. 打开 Ask Conversation：\`Ask：PMIL 下一步判断\`，看 Stage 里的 \`PMIL ContextPacket 示例\`。

## What this vault is not

这不是最终用户引导 vault。它故意放了较密集的 PMIL 数据，适合功能展示和回归检查。等 PMIL 产品体验稳定后，应另做一个更轻、更生活化的 onboarding vault。
`);
}

async function commitVault(target: string): Promise<void> {
  const git = simpleGit(target);
  await git.add('.');
  await git.commit('demo: seed PMIL showcase vault').catch(() => undefined);
}

function selectorForSource(sources: EvidenceSource[], refNeedle: string): EvidenceSelector {
  const source = sources.find((item) => item.canonical_ref.includes(refNeedle) || item.metadata?.['entity_ref'] === refNeedle || item.id.includes(refNeedle));
  return wholeSourceSelector(source?.id ?? evidenceSourceId('note', refNeedle), 'safe_projection', 'seeded demo selector');
}

function preferredExternalSource(sources: EvidenceSource[]): EvidenceSource | undefined {
  return sources.find((source) => source.metadata?.['agent'] === 'codex') ?? sources[0];
}

function synthesisSource(
  kind: SynthesisSource['kind'],
  ref: string,
  title: string,
  excerpt: string | undefined,
  selector: EvidenceSelector,
  sourceHash: string
): SynthesisSource {
  return {
    kind,
    ref,
    title,
    excerpt,
    metadata: {
      selector,
      source_hash: sourceHash
    }
  };
}

function demoProvenance(model: string): SynthesisProvenance {
  return {
    runtime: 'seed:demo',
    model,
    prompt_version: 'demo.v1',
    generated_at: BASE_TIME
  };
}

function rec(timestamp: string, role: 'user' | 'assistant', content: string): Record<string, unknown> {
  return {
    timestamp,
    role,
    content,
    cwd: '/Users/ryanbzhou/Developer/new-orbit'
  };
}

function toolRec(timestamp: string, command: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'tool_use',
    role: 'tool',
    content: command
  };
}

async function writeJsonl(file: string, records: Record<string, unknown>[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function fileExists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false
  );
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
