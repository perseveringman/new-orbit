import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes
} from '@xyflow/react';
import type {
  PlanProposal,
  PlanProposalNode,
  PlanPublishResult,
  PlannerAgentId,
  PlannerChatMessage
} from '@shared/orchestration';
import { useFiles } from '../store/files';

interface ProjectPlannerViewProps {
  projectUid: string;
}

type PlannerFlowNodeData = {
  node: PlanProposalNode;
};

type PlannerFlowNode = Node<PlannerFlowNodeData, 'planNode'>;

const plannerNodeTypes: NodeTypes = {
  planNode: PlannerCanvasNode
};

const PLANNER_AGENTS: Array<{
  id: PlannerAgentId;
  label: string;
  description: string;
}> = [
  {
    id: 'plan-agent',
    label: 'Plan Agent',
    description: 'Brainstorm requirements and turn decisions into task splits.'
  },
  {
    id: 'architect-agent',
    label: 'Architect Agent',
    description: 'Stress-test scope, dependencies, and implementation boundaries.'
  },
  {
    id: 'executor-agent',
    label: 'Executor Agent',
    description: 'Review whether the split is executable by runtime agents.'
  }
];

export function ProjectPlannerView({ projectUid }: ProjectPlannerViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [proposals, setProposals] = useState<PlanProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [publishResult, setPublishResult] = useState<PlanPublishResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<PlannerAgentId>('plan-agent');
  const [composer, setComposer] = useState('');
  const [pendingMode, setPendingMode] = useState<'chat' | 'proposal' | null>(null);
  const [chatMessages, setChatMessages] = useState<PlannerChatMessage[]>([
    {
      id: 'planner-welcome',
      role: 'assistant',
      agentId: 'plan-agent',
      content:
        'Tell me the outcome you want. I will help brainstorm the requirement first; once the split is clear, generate a task artifact on the right.'
    }
  ]);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<PlannerFlowNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await window.orbit.planner.listProposals(projectUid);
      setProposals(list);
      setSelectedProposalId((current) =>
        current && list.some((proposal) => proposal.proposalId === current)
          ? current
          : (list[0]?.proposalId ?? null)
      );
    } catch (e) {
      toast(`Load proposals failed: ${(e as Error).message}`);
    }
  }, [projectUid, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => proposals.find((proposal) => proposal.proposalId === selectedProposalId) ?? null,
    [proposals, selectedProposalId]
  );

  useEffect(() => {
    if (selected && editMode) {
      setEditedJson(JSON.stringify(selected, null, 2));
    }
  }, [selected, editMode]);

  useEffect(() => {
    if (!selected || editMode) {
      setFlowNodes([]);
      setFlowEdges([]);
      setSelectedNodeId(null);
      return;
    }
    setFlowNodes(buildCanvasNodes(selected.nodes));
    setFlowEdges(buildCanvasEdges(selected.edges));
    setSelectedNodeId((current) =>
      current && selected.nodes.some((node) => node.taskUid === current)
        ? current
        : (selected.nodes[0]?.taskUid ?? null)
    );
  }, [editMode, selected, setFlowEdges, setFlowNodes]);

  async function sendMessage(): Promise<void> {
    if (pendingMode) return;
    const text = composer.trim();
    if (!text) return;
    const nextMessages: PlannerChatMessage[] = [
      ...chatMessages,
      { id: makeMessageId('user'), role: 'user', content: text }
    ];
    setComposer('');
    setChatMessages(nextMessages);
    setPendingMode('chat');
    try {
      const reply = await window.orbit.planner.chat(projectUid, activeAgentId, nextMessages);
      setChatMessages([
        ...nextMessages,
        {
          id: `assistant-${reply.runId}`,
          role: 'assistant',
          agentId: reply.agentId,
          content: reply.message
        }
      ]);
    } catch (e) {
      toast(`Planner chat failed: ${(e as Error).message}`);
    } finally {
      setPendingMode(null);
    }
  }

  async function generateArtifact(): Promise<void> {
    if (pendingMode) return;
    const text = composer.trim();
    const nextMessages: PlannerChatMessage[] = text
      ? [...chatMessages, { id: makeMessageId('user'), role: 'user', content: text }]
      : chatMessages;
    if (text) {
      setComposer('');
      setChatMessages(nextMessages);
    }
    setPendingMode('proposal');
    try {
      const reply = await window.orbit.planner.generateProposal(projectUid, activeAgentId, nextMessages);
      setChatMessages([
        ...nextMessages,
        {
          id: `assistant-${reply.runId}`,
          role: 'assistant',
          agentId: reply.agentId,
          content: reply.message
        }
      ]);
      toast('Task split proposal created');
      await refresh();
      setSelectedProposalId(reply.proposal.proposalId);
    } catch (e) {
      toast(`Generate task split failed: ${(e as Error).message}`);
    } finally {
      setPendingMode(null);
    }
  }

  async function saveEdited(): Promise<void> {
    try {
      const parsed = JSON.parse(editedJson) as PlanProposal;
      await window.orbit.planner.saveProposal(parsed);
      toast('Proposal saved');
      setEditMode(false);
      await refresh();
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`);
    }
  }

  async function saveLayout(): Promise<void> {
    if (!selected) return;
    try {
      const positions = new Map(flowNodes.map((node) => [node.id, node.position]));
      const next: PlanProposal = {
        ...selected,
        nodes: selected.nodes.map((node) => ({
          ...node,
          position: positions.get(node.taskUid) ?? node.position
        }))
      };
      await window.orbit.planner.saveProposal(next);
      toast('Planner layout saved');
      await refresh();
    } catch (e) {
      toast(`Save layout failed: ${(e as Error).message}`);
    }
  }

  async function publish(): Promise<void> {
    if (!selected) return;
    if (!window.confirm(`Publish proposal "${selected.title}"? This will create/update tasks.`))
      return;
    try {
      const result = await window.orbit.planner.publishProposal(projectUid, selected.proposalId);
      setPublishResult(result);
      toast('Proposal published');
      await refresh();
    } catch (e) {
      toast(`Publish failed: ${(e as Error).message}`);
    }
  }

  const selectedPlanNode =
    selected?.nodes.find((node) => node.taskUid === selectedNodeId) ?? selected?.nodes[0] ?? null;
  const nodeLookup = useMemo(
    () => new Map((selected?.nodes ?? []).map((node) => [node.taskUid, node])),
    [selected]
  );
  const incomingEdges = useMemo(
    () => selected?.edges.filter((edge) => edge.toTaskUid === selectedPlanNode?.taskUid) ?? [],
    [selected, selectedPlanNode]
  );
  const outgoingEdges = useMemo(
    () => selected?.edges.filter((edge) => edge.fromTaskUid === selectedPlanNode?.taskUid) ?? [],
    [selected, selectedPlanNode]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 dark:bg-neutral-950">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <h2 className="text-sm font-semibold">Project Planner</h2>
          <p className="text-xs text-neutral-500">
            Brainstorm in chat first. The task artifact appears when a split is ready.
          </p>
        </div>
        <button
          onClick={() => void generateArtifact()}
          disabled={pendingMode !== null}
          className="rounded-full border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
        >
          {pendingMode === 'proposal' ? 'Generating…' : 'Generate Task Split'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main
          className={`flex min-h-0 flex-col ${
            selected ? 'w-[44%] min-w-[420px]' : 'mx-auto w-full max-w-4xl'
          }`}
        >
          <section className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Planning Chat
                  </div>
                  <h3 className="mt-1 text-lg font-semibold">Brainstorm the requirement</h3>
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  Agent
                  <select
                    value={activeAgentId}
                    onChange={(event) => setActiveAgentId(event.target.value as PlannerAgentId)}
                    className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  >
                    {PLANNER_AGENTS.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {PLANNER_AGENTS.find((agent) => agent.id === activeAgentId)?.description}
              </p>
            </header>

            <div className="flex-1 space-y-4 overflow-auto px-5 py-5">
              {chatMessages.map((message) => (
                <PlannerChatBubble
                  key={message.id}
                  message={message}
                  agentLabel={
                    message.agentId
                      ? PLANNER_AGENTS.find((agent) => agent.id === message.agentId)?.label
                      : undefined
                  }
                />
              ))}
              {pendingMode && (
                <div className="text-xs text-neutral-500">
                  {PLANNER_AGENTS.find((agent) => agent.id === activeAgentId)?.label} is{' '}
                  {pendingMode === 'proposal' ? 'generating a task split…' : 'thinking…'}
                </div>
              )}
              {!selected && (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60">
                  No task split artifact yet. Continue the conversation, then generate a versioned
                  React Flow artifact when the scope is clear.
                </div>
              )}
            </div>

            <form
              className="shrink-0 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                disabled={pendingMode !== null}
                placeholder={`Message ${PLANNER_AGENTS.find((agent) => agent.id === activeAgentId)?.label ?? 'agent'}...`}
                className="min-h-[92px] w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-sky-400 dark:border-neutral-800 dark:bg-neutral-900"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">
                  Generate creates a new artifact version from the current conversation.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void generateArtifact()}
                    disabled={pendingMode !== null}
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
                  >
                    {pendingMode === 'proposal' ? 'Generating…' : 'Generate Split'}
                  </button>
                  <button
                    type="submit"
                    disabled={pendingMode !== null}
                    className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    {pendingMode === 'chat' ? 'Thinking…' : 'Send'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </main>

        {selected && (
          <aside className="flex min-h-0 flex-1 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-semibold">Task Split Artifact</h3>
                    <ProposalStatusBadge status={selected.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{selected.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                    <span>Source: {selected.source}</span>
                    <span>Created: {new Date(selected.createdAt).toLocaleString()}</span>
                    {selected.publishedAt && (
                      <span>Published: {new Date(selected.publishedAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <select
                    value={selectedProposalId ?? ''}
                    onChange={(event) => setSelectedProposalId(event.target.value)}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    aria-label="Switch artifact version"
                  >
                    {proposals.map((proposal) => (
                      <option key={proposal.proposalId} value={proposal.proposalId}>
                        v{proposal.version} · {proposal.title}
                      </option>
                    ))}
                  </select>
                  {editMode ? (
                    <>
                      <button
                        onClick={() => void saveEdited()}
                        className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditMode(false)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => void saveLayout()}
                        className="rounded border border-violet-300 px-2 py-1 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30"
                      >
                        Save Layout
                      </button>
                      <button
                        onClick={() => setEditMode(true)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        Edit JSON
                      </button>
                      {selected.status === 'draft' && (
                        <button
                          onClick={() => void publish()}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        >
                          Publish
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              {publishResult && publishResult.proposalId === selected.proposalId && (
                <PublishResultPanel result={publishResult} onClose={() => setPublishResult(null)} />
              )}

              {editMode ? (
                <textarea
                  value={editedJson}
                  onChange={(event) => setEditedJson(event.target.value)}
                  className="min-h-[520px] flex-1 resize-none rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
                  spellCheck={false}
                />
              ) : (
                <>
                  <div className="min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                    {flowNodes.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                        No nodes in this artifact yet.
                      </div>
                    ) : (
                      <ReactFlow<PlannerFlowNode, Edge>
                        className="orbit-flow"
                        nodes={flowNodes}
                        edges={flowEdges}
                        nodeTypes={plannerNodeTypes}
                        fitView
                        minZoom={0.35}
                        maxZoom={1.5}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
                        onSelectionChange={({ nodes }) => setSelectedNodeId(nodes[0]?.id ?? null)}
                        nodesConnectable={false}
                      >
                        <MiniMap pannable zoomable className="!bg-white dark:!bg-neutral-950" />
                        <Controls />
                        <Background gap={18} size={1} color="#a3a3a3" />
                      </ReactFlow>
                    )}
                  </div>

                  <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
                      <h4 className="text-sm font-semibold">Artifact Summary</h4>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <StatChip label="Nodes" value={selected.nodes.length} />
                        <StatChip label="Edges" value={selected.edges.length} />
                        <StatChip
                          label="Todo"
                          value={selected.nodes.filter((node) => node.status === 'todo').length}
                        />
                        <StatChip
                          label="Waiting"
                          value={selected.nodes.filter((node) => node.status === 'waiting').length}
                        />
                      </div>
                    </div>

                    <div className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
                      <h4 className="text-sm font-semibold">Selected Node</h4>
                      {selectedPlanNode ? (
                        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
                          <NodeCard node={selectedPlanNode} compact />
                          <RelationList
                            title="Depends on"
                            edges={incomingEdges}
                            lookup={nodeLookup}
                            keyField="fromTaskUid"
                          />
                          <RelationList
                            title="Unblocks"
                            edges={outgoingEdges}
                            lookup={nodeLookup}
                            keyField="toTaskUid"
                          />
                        </div>
                      ) : (
                        <p className="mt-3 text-neutral-500">
                          Select a node on the canvas to inspect it.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: PlanProposal['status'] }): JSX.Element {
  const color =
    status === 'published'
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      : status === 'accepted'
        ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
        : status === 'rejected'
          ? 'bg-red-500/20 text-red-700 dark:text-red-300'
          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300';

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}
    >
      {status}
    </span>
  );
}

function PlannerChatBubble({
  message,
  agentLabel
}: {
  message: PlannerChatMessage;
  agentLabel?: string;
}): JSX.Element {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950'
            : 'border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
        }`}
      >
        {!isUser && (
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-sky-500">
            {agentLabel ?? 'Planner'}
          </div>
        )}
        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
      </div>
    </div>
  );
}

function PlannerCanvasNode({ data, selected }: NodeProps<PlannerFlowNode>): JSX.Element {
  const node = data.node;
  return (
    <div
      className={`w-[240px] rounded-xl border bg-white p-3 text-xs shadow-sm dark:bg-neutral-950 ${
        selected
          ? 'border-sky-400 ring-2 ring-sky-300/50 dark:border-sky-600'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-semibold">{node.title}</span>
        {node.status && (
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] dark:bg-neutral-800">
            {node.status}
          </span>
        )}
      </div>
      {node.description && (
        <p className="mt-2 max-h-10 overflow-hidden text-[11px] text-neutral-600 dark:text-neutral-400">
          {node.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1 text-[10px] text-neutral-500">
        <span className="font-mono">{node.taskUid}</span>
        {node.recommendedRole && <span>role:{node.recommendedRole}</span>}
        {node.executionStrategy && <span>{node.executionStrategy}</span>}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  compact = false
}: {
  node: PlanProposalNode;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h5 className={`font-semibold ${compact ? 'text-sm' : ''}`}>{node.title}</h5>
            {node.status && (
              <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] dark:bg-neutral-800">
                {node.status}
              </span>
            )}
            {node.priority && (
              <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] dark:bg-neutral-800">
                {node.priority}
              </span>
            )}
          </div>
          {node.description && (
            <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
              {node.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-500">
            <span className="font-mono">{node.taskUid}</span>
            {node.executionStrategy && <span>Strategy: {node.executionStrategy}</span>}
            {node.recommendedOwnerType && <span>Owner: {node.recommendedOwnerType}</span>}
            {node.recommendedRole && <span>Role: {node.recommendedRole}</span>}
            {node.effort && <span>Effort: {node.effort}</span>}
            {node.due && <span>Due: {node.due}</span>}
          </div>
          {node.tags && node.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] dark:bg-neutral-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RelationList({
  title,
  edges,
  lookup,
  keyField
}: {
  title: string;
  edges: Array<{ id: string; fromTaskUid: string; toTaskUid: string; kind: string }>;
  lookup: Map<string, PlanProposalNode>;
  keyField: 'fromTaskUid' | 'toTaskUid';
}): JSX.Element {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{title}</div>
      {edges.length === 0 ? (
        <p className="mt-2 text-neutral-500">None</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {edges.map((edge) => {
            const uid = edge[keyField];
            const node = lookup.get(uid);
            return (
              <li
                key={edge.id}
                className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-800"
              >
                <div className="font-medium">{node?.title ?? uid}</div>
                <div className="mt-0.5 text-[10px] text-neutral-500">{edge.kind}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function PublishResultPanel({
  result,
  onClose
}: {
  result: PlanPublishResult;
  onClose(): void;
}): JSX.Element {
  return (
    <div className="rounded border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-emerald-800 dark:text-emerald-200">
            Proposal Published
          </h4>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            Published at {new Date(result.publishedAt).toLocaleString()}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-[11px]">
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Created:</span>{' '}
              <span className="font-semibold">{result.createdTaskUids.length}</span>
            </div>
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Updated:</span>{' '}
              <span className="font-semibold">{result.updatedTaskUids.length}</span>
            </div>
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Unchanged:</span>{' '}
              <span className="font-semibold">{result.unchangedTaskUids.length}</span>
            </div>
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Waiting:</span>{' '}
              <span className="font-semibold">{result.waitingTaskUids.length}</span>
            </div>
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Todo:</span>{' '}
              <span className="font-semibold">{result.todoTaskUids.length}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function suggestedNodePosition(index: number): { x: number; y: number } {
  const columns = 3;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return { x: column * 320, y: row * 190 };
}

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildCanvasNodes(nodes: PlanProposalNode[]): Array<PlannerFlowNode> {
  return nodes.map((node, index) => ({
    id: node.taskUid,
    type: 'planNode',
    position: node.position ?? suggestedNodePosition(index),
    data: { node },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: true
  }));
}

function buildCanvasEdges(edges: PlanProposal['edges']): Array<Edge> {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.fromTaskUid,
    target: edge.toTaskUid,
    label: edge.kind,
    markerEnd: {
      type: MarkerType.ArrowClosed
    },
    style:
      edge.kind === 'parent_child'
        ? { stroke: '#8b5cf6' }
        : edge.kind === 'blocks'
          ? { stroke: '#ef4444' }
          : { stroke: '#0ea5e9' },
    labelStyle: { fontSize: 10, fill: '#737373' }
  }));
}
