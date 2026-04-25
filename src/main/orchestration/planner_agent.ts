import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { IPC } from '@shared/ipc';
import {
  PLANNER_AGENT_IDS,
  TASK_OWNER_TYPES,
  type PlanProposal,
  type PlanProposalEdge,
  type PlanProposalNode,
  type PlannerAgentId,
  type PlannerChatMessage,
  type PlannerChatReply,
  type PlannerProposalReply,
  type ProjectRoleBinding
} from '@shared/orchestration';
import type { TaskRecord } from '@shared/schemas';
import { currentSession } from '../fs';
import { detectClaude } from '../agent/cli';
import { AgentRunner } from '../agent/runner';
import { getSettings } from '../settings';
import { listProjects, type ProjectSummary } from '../project';
import { currentProjectTasks } from './session';
import { listPlanProposals, savePlanProposal } from './planner';
import { listProjectRoleBindings } from './roles';

type PlannerMode = 'chat' | 'proposal';

type NormalizedPlannerPayload = {
  assistantMessage: string;
  proposal: Pick<PlanProposal, 'title' | 'summary' | 'nodes' | 'edges' | 'inputSummary'>;
};

const NODE_STATUSES = ['backlog', 'waiting', 'todo', 'doing', 'blocked', 'done'] as const;
const EXECUTION_STRATEGIES = ['manual', 'autonomous'] as const;
const PRIORITIES = ['low', 'med', 'high'] as const;
const EFFORTS = ['xs', 's', 'm', 'l', 'xl'] as const;
const EDGE_KINDS = ['depends_on', 'blocks', 'parent_child'] as const;

const AGENT_ROLE_PROMPTS: Record<PlannerAgentId, string> = {
  'plan-agent':
    'You are Orbit Plan Agent. Brainstorm requirements, uncover constraints, and converge on a clean task split.',
  'architect-agent':
    'You are Orbit Architect Agent. Challenge the structure, sequencing, dependencies, and system boundaries before implementation starts.',
  'executor-agent':
    'You are Orbit Executor Agent. Judge whether the plan is actionable, testable, and realistic for implementation agents.'
};

export async function plannerChat(
  projectUid: string,
  agentId: PlannerAgentId,
  messages: PlannerChatMessage[]
): Promise<PlannerChatReply> {
  const context = await loadPlannerContext(projectUid);
  const result = await runPlannerPrompt({
    title: `Planner Chat · ${agentId}`,
    prompt: buildPlannerPrompt({ mode: 'chat', agentId, context, messages }),
    cwd: context.project.path,
    vaultPath: context.vaultPath
  });
  return {
    runId: result.runId,
    agentId,
    message: parseChatReply(result.finalText)
  };
}

export async function plannerGenerateProposal(
  projectUid: string,
  agentId: PlannerAgentId,
  messages: PlannerChatMessage[]
): Promise<PlannerProposalReply> {
  const context = await loadPlannerContext(projectUid);
  const result = await runPlannerPrompt({
    title: `Planner Proposal · ${agentId}`,
    prompt: buildPlannerPrompt({ mode: 'proposal', agentId, context, messages }),
    cwd: context.project.path,
    vaultPath: context.vaultPath
  });
  const latestProposal = context.proposals[context.proposals.length - 1];
  const parsed = normalizePlannerPayload(result.finalText, latestProposal);
  const version = (latestProposal?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const proposal: PlanProposal = {
    proposalId: `proposal-${nanoid(10)}`,
    projectUid,
    version,
    title: parsed.proposal.title,
    summary: parsed.proposal.summary,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    source: 'planner',
    nodes: parsed.proposal.nodes,
    edges: parsed.proposal.edges,
    inputSummary: parsed.proposal.inputSummary
  };
  const saved = await savePlanProposal(context.vaultPath, proposal);
  return {
    runId: result.runId,
    agentId,
    message: parsed.assistantMessage,
    proposal: saved
  };
}

async function loadPlannerContext(projectUid: string): Promise<{
  vaultPath: string;
  project: ProjectSummary;
  tasks: TaskRecord[];
  bindings: ProjectRoleBinding[];
  proposals: PlanProposal[];
}> {
  const sess = currentSession();
  if (!sess) throw new Error('no vault');
  const projects = await listProjects(sess.vault);
  const project = projects.find((entry) => entry.uid === projectUid);
  if (!project) throw new Error(`project not found: ${projectUid}`);
  const [bindings, proposals] = await Promise.all([
    listProjectRoleBindings(sess.vault, projectUid),
    listPlanProposals(sess.vault, projectUid)
  ]);
  return {
    vaultPath: sess.vault,
    project,
    tasks: currentProjectTasks(projectUid),
    bindings,
    proposals
  };
}

function buildPlannerPrompt(args: {
  mode: PlannerMode;
  agentId: PlannerAgentId;
  context: Awaited<ReturnType<typeof loadPlannerContext>>;
  messages: PlannerChatMessage[];
}): string {
  const latestUserMessage = latestUserMessageContent(args.messages);
  const contextBlock = JSON.stringify(
    {
      project: {
        uid: args.context.project.uid,
        slug: args.context.project.slug,
        name: args.context.project.name,
        description: args.context.project.description ?? '',
        status: args.context.project.status,
        tags: args.context.project.tags ?? []
      },
      tasks: args.context.tasks.map((task) => ({
        uid: task.uid ?? '',
        title: task.title,
        status: task.status,
        preConditions: task.pre_conditions ?? [],
        executionStrategy: task.execution_strategy ?? 'manual',
        recommendedRole: task.recommended_role ?? null,
        tags: task.tags ?? []
      })),
      bindings: args.context.bindings.map((binding) => ({
        id: binding.id,
        templateId: binding.templateId,
        dispatchMode: binding.dispatchMode,
        health: binding.health,
        runtimePreference: binding.runtimePreference ?? null,
        concurrencyOverride: binding.concurrencyOverride ?? null
      })),
      priorProposals: args.context.proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        version: proposal.version,
        title: proposal.title,
        status: proposal.status,
        nodeCount: proposal.nodes.length,
        updatedAt: proposal.updatedAt
      }))
    },
    null,
    2
  );
  const conversation = args.messages
    .map((message) => {
      const label =
        message.role === 'assistant'
          ? `${message.agentId ?? args.agentId}`
          : 'user';
      return `${label}: ${message.content}`;
    })
    .join('\n\n');

  const modeInstruction =
    args.mode === 'chat'
      ? `Reply as a planning collaborator in plain text. Be concise, concrete, and forward-moving. Do not output JSON. If the requirement is underspecified, ask targeted follow-up questions.`
      : `Return JSON only. Use this exact shape:
{
  "assistantMessage": "short explanation to show in the chat",
  "proposal": {
    "title": "proposal title",
    "summary": "short summary",
    "nodes": [
      {
        "taskUid": "kebab-like-uid",
        "title": "task title",
        "description": "task description",
        "status": "todo",
        "executionStrategy": "manual or autonomous",
        "recommendedOwnerType": "human, agent, binding, or either",
        "recommendedRole": "planner, executor, reviewer, researcher, or custom slug",
        "candidateRoleSlugs": ["executor"],
        "preConditions": ["task-uid"],
        "priority": "low, med, or high",
        "effort": "xs, s, m, l, xl, or a number",
        "tags": ["tag"]
      }
    ],
    "edges": [
      {
        "id": "edge-id",
        "fromTaskUid": "prerequisite-task",
        "toTaskUid": "dependent-task",
        "kind": "depends_on"
      }
    ]
  }
}
Rules: output 2-12 tasks; keep them implementation-ready; use fromTaskUid -> toTaskUid for dependency edges; keep status mostly todo/waiting; align recommendedRole with Orbit builtin roles when possible.`;

  return [
    '# Orbit planner role',
    AGENT_ROLE_PROMPTS[args.agentId],
    '',
    '# Operating mode',
    modeInstruction,
    '',
    '# Current project context',
    contextBlock,
    '',
    '# Conversation so far',
    conversation || '(no conversation yet)',
    '',
    '# Latest user request',
    latestUserMessage || '(none)'
  ].join('\n');
}

async function runPlannerPrompt(args: {
  title: string;
  prompt: string;
  cwd: string;
  vaultPath: string;
}): Promise<{ runId: string; finalText: string }> {
  const detect = await detectClaude();
  const settings = await getSettings();
  const claudePath = settings.claudePath || detect.path;
  if (!claudePath) {
    throw new Error(
      detect.error ?? 'Claude Code CLI not found. Install it from https://docs.claude.com/claude-code'
    );
  }

  const runner = new AgentRunner({
    claudePath,
    prompt: args.prompt,
    cwd: args.cwd,
    vaultPath: args.vaultPath,
    taskId: null,
    title: args.title,
    ...(settings.anthropicApiKey ? { apiKey: settings.anthropicApiKey } : {})
  });

  runner.on('event', (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.agent.event, { runId: runner.runId, event });
      }
    }
  });

  await runner.start();
  await new Promise<void>((resolve) => runner.once('exit', () => resolve()));
  const snapshot = runner.snapshot();
  const finalText = snapshot.events
    .filter((event) => event.kind === 'message' || event.kind === 'text')
    .map((event) => event.text ?? '')
    .join('\n')
    .trim();
  if (!finalText) throw new Error('planner agent returned an empty response');
  return { runId: runner.runId, finalText };
}

function parseChatReply(finalText: string): string {
  return finalText.trim();
}

export function normalizePlannerPayload(
  finalText: string,
  previousProposal?: PlanProposal
): NormalizedPlannerPayload {
  const parsed = extractJsonPayload(finalText);
  const rawAssistantMessage =
    getString((parsed as Record<string, unknown>)['assistantMessage']) ??
    getString((parsed as Record<string, unknown>)['message']) ??
    'Generated a new task split proposal.';
  const proposalSource = getRecord((parsed as Record<string, unknown>)['proposal']) ?? parsed;
  const rawNodes = getArray(proposalSource['nodes']);
  if (rawNodes.length === 0) throw new Error('planner proposal did not contain any nodes');

  const previousPositions = new Map(
    (previousProposal?.nodes ?? []).map((node) => [node.taskUid, node.position])
  );
  const normalizedNodes = ensureUniqueTaskUids(
    rawNodes
      .map((entry, index) => normalizeNode(entry, index, previousPositions))
      .filter((entry): entry is PlanProposalNode => entry !== null)
  );
  if (normalizedNodes.length === 0) throw new Error('planner proposal nodes were invalid');
  const nodeIds = new Set(normalizedNodes.map((node) => node.taskUid));

  const normalizedEdges = getArray(proposalSource['edges'])
    .map((entry, index) => normalizeEdge(entry, index))
    .filter((entry): entry is PlanProposalEdge => entry !== null)
    .filter((edge) => nodeIds.has(edge.fromTaskUid) && nodeIds.has(edge.toTaskUid));

  const nodes = applyEdgePreConditions(normalizedNodes, normalizedEdges);
  return {
    assistantMessage: rawAssistantMessage,
    proposal: {
      title: getString(proposalSource['title']) ?? `Planner Proposal ${new Date().toLocaleString()}`,
      summary: getString(proposalSource['summary']) ?? rawAssistantMessage,
      nodes,
      edges: normalizedEdges,
      inputSummary: getString(proposalSource['inputSummary']) ?? undefined
    }
  };
}

function extractJsonPayload(finalText: string): Record<string, unknown> {
  const direct = tryParseRecord(finalText);
  if (direct) return direct;
  const fenced = finalText.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? finalText.match(/```\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseRecord(fenced);
    if (parsed) return parsed;
  }
  const start = finalText.indexOf('{');
  const end = finalText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = tryParseRecord(finalText.slice(start, end + 1));
    if (parsed) return parsed;
  }
  throw new Error('planner agent did not return valid JSON');
}

function tryParseRecord(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    return getRecord(parsed);
  } catch {
    return null;
  }
}

function normalizeNode(
  input: unknown,
  index: number,
  previousPositions: Map<string, PlanProposalNode['position']>
): PlanProposalNode | null {
  const record = getRecord(input);
  if (!record) return null;
  const title = getString(record['title']);
  if (!title) return null;
  const taskUid = getString(record['taskUid']) ?? buildTaskUid(title, index);
  const status = pickOne(record['status'], NODE_STATUSES);
  const executionStrategy = pickOne(record['executionStrategy'], EXECUTION_STRATEGIES);
  const recommendedOwnerType =
    pickOne(record['recommendedOwnerType'], [...TASK_OWNER_TYPES, 'either'] as const) ?? undefined;
  const priority = pickOne(record['priority'], PRIORITIES);
  const effort = normalizeEffort(record['effort']);
  const explicitPosition = normalizePosition(record['position']);
  return {
    taskUid,
    title,
    ...(getString(record['description']) ? { description: getString(record['description'])! } : {}),
    ...(status ? { status } : {}),
    ...(executionStrategy ? { executionStrategy } : {}),
    ...(recommendedOwnerType ? { recommendedOwnerType } : {}),
    ...(getString(record['recommendedRole'])
      ? { recommendedRole: getString(record['recommendedRole'])! }
      : {}),
    ...(getStringArray(record['candidateRoleSlugs'])
      ? { candidateRoleSlugs: getStringArray(record['candidateRoleSlugs'])! }
      : {}),
    ...(getString(record['parentTaskUid']) ? { parentTaskUid: getString(record['parentTaskUid'])! } : {}),
    ...(getString(record['generatedFromTaskUid'])
      ? { generatedFromTaskUid: getString(record['generatedFromTaskUid'])! }
      : {}),
    ...(getStringArray(record['preConditions'])
      ? { preConditions: getStringArray(record['preConditions'])! }
      : {}),
    ...(priority ? { priority } : {}),
    ...(getString(record['due']) ? { due: getString(record['due'])! } : {}),
    ...(typeof effort !== 'undefined' ? { effort } : {}),
    ...(getStringArray(record['tags']) ? { tags: getStringArray(record['tags'])! } : {}),
    position: explicitPosition ?? previousPositions.get(taskUid) ?? suggestedNodePosition(index)
  };
}

function normalizeEdge(input: unknown, index: number): PlanProposalEdge | null {
  const record = getRecord(input);
  if (!record) return null;
  const fromTaskUid = getString(record['fromTaskUid']);
  const toTaskUid = getString(record['toTaskUid']);
  const kind = pickOne(record['kind'], EDGE_KINDS);
  if (!fromTaskUid || !toTaskUid || !kind) return null;
  return {
    id: getString(record['id']) ?? `edge-${index}-${fromTaskUid}-${toTaskUid}`,
    fromTaskUid,
    toTaskUid,
    kind
  };
}

function applyEdgePreConditions(
  nodes: PlanProposalNode[],
  edges: PlanProposalEdge[]
): PlanProposalNode[] {
  const dependencyMap = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== 'depends_on') continue;
    const existing = dependencyMap.get(edge.toTaskUid) ?? new Set<string>();
    existing.add(edge.fromTaskUid);
    dependencyMap.set(edge.toTaskUid, existing);
  }
  return nodes.map((node) => {
    const existing = new Set(node.preConditions ?? []);
    for (const uid of dependencyMap.get(node.taskUid) ?? []) existing.add(uid);
    const preConditions = [...existing];
    return preConditions.length > 0 ? { ...node, preConditions } : node;
  });
}

function ensureUniqueTaskUids(nodes: PlanProposalNode[]): PlanProposalNode[] {
  const seen = new Set<string>();
  return nodes.map((node, index) => {
    let taskUid = node.taskUid;
    if (!taskUid || seen.has(taskUid)) {
      const suffix = index === 0 ? '' : `-${index + 1}`;
      taskUid = `${buildTaskUid(node.title, index)}${suffix}`;
    }
    while (seen.has(taskUid)) {
      taskUid = `${taskUid}-${seen.size + 1}`;
    }
    seen.add(taskUid);
    return taskUid === node.taskUid ? node : { ...node, taskUid };
  });
}

function latestUserMessageContent(messages: PlannerChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') return message.content;
  }
  return '';
}

function buildTaskUid(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || `task-${index + 1}`;
}

function suggestedNodePosition(index: number): { x: number; y: number } {
  const columns = 3;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return { x: column * 320, y: row * 190 };
}

function getRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function getArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function getString(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : null;
}

function getStringArray(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const values = input
    .map((entry) => getString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values : null;
}

function pickOne<const T extends readonly string[]>(input: unknown, allowed: T): T[number] | null {
  const value = getString(input);
  return value && allowed.includes(value as T[number]) ? (value as T[number]) : null;
}

function normalizeEffort(input: unknown): PlanProposalNode['effort'] | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const stringValue = getString(input);
  return stringValue && EFFORTS.includes(stringValue as (typeof EFFORTS)[number])
    ? (stringValue as (typeof EFFORTS)[number])
    : undefined;
}

function normalizePosition(
  input: unknown
): {
  x: number;
  y: number;
} | null {
  const record = getRecord(input);
  if (!record) return null;
  const x = record['x'];
  const y = record['y'];
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null;
}

export function isPlannerAgentId(input: string): input is PlannerAgentId {
  return PLANNER_AGENT_IDS.includes(input as PlannerAgentId);
}
