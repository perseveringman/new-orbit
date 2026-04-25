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
import type { PlanProposal, PlanProposalNode, PlanPublishResult } from '@shared/orchestration';
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

export function ProjectPlannerView({ projectUid }: ProjectPlannerViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [proposals, setProposals] = useState<PlanProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [publishResult, setPublishResult] = useState<PlanPublishResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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

  async function createDraft(): Promise<void> {
    try {
      const tasks = await window.orbit.project.getTasks(projectUid);
      const nodes: PlanProposalNode[] = tasks
        .filter((task) => task.status !== 'done')
        .map((task, index) => ({
          taskUid: task.uid || `temp-${task.id}`,
          title: task.title || '(untitled)',
          status: task.status as PlanProposalNode['status'],
          executionStrategy: 'manual',
          priority: 'med',
          tags: task.tags,
          position: suggestedNodePosition(index)
        }));

      const draft: PlanProposal = {
        proposalId: `draft-${Date.now()}`,
        projectUid,
        version: 1,
        title: 'Draft Proposal',
        summary: 'Draft generated from current project tasks',
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'human',
        nodes,
        edges: []
      };

      const saved = await window.orbit.planner.saveProposal(draft);
      toast('Draft proposal created');
      await refresh();
      setSelectedProposalId(saved.proposalId);
    } catch (e) {
      toast(`Create draft failed: ${(e as Error).message}`);
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">Project Planner</h2>
        <button
          onClick={() => void createDraft()}
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          + Create Draft from Tasks
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-neutral-200 p-2 dark:border-neutral-800">
          <h3 className="mb-2 px-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            Proposals
          </h3>
          {proposals.length === 0 ? (
            <p className="px-2 text-xs text-neutral-500">No proposals yet.</p>
          ) : (
            <ul className="space-y-1">
              {proposals.map((proposal) => (
                <li key={proposal.proposalId}>
                  <button
                    onClick={() => setSelectedProposalId(proposal.proposalId)}
                    className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                      proposal.proposalId === selectedProposalId
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{proposal.title}</span>
                      <ProposalStatusBadge status={proposal.status} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      v{proposal.version} · {proposal.source} · {proposal.nodes.length} nodes
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              {proposals.length === 0
                ? 'Create a draft proposal to get started.'
                : 'Select a proposal to view details.'}
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{selected.title}</h3>
                      <ProposalStatusBadge status={selected.status} />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{selected.summary}</p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-neutral-500">
                      <span>Version {selected.version}</span>
                      <span>Source: {selected.source}</span>
                      <span>Created: {new Date(selected.createdAt).toLocaleString()}</span>
                      {selected.publishedAt && (
                        <span>Published: {new Date(selected.publishedAt).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
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

              <div className="flex-1 overflow-auto p-4">
                {editMode ? (
                  <textarea
                    value={editedJson}
                    onChange={(e) => setEditedJson(e.target.value)}
                    className="h-full w-full resize-none rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    spellCheck={false}
                  />
                ) : (
                  <div className="space-y-4">
                    {publishResult && publishResult.proposalId === selected.proposalId && (
                      <PublishResultPanel
                        result={publishResult}
                        onClose={() => setPublishResult(null)}
                      />
                    )}

                    <section className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                        {flowNodes.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                            No nodes in this proposal yet.
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
                            onSelectionChange={({ nodes }) =>
                              setSelectedNodeId(nodes[0]?.id ?? null)
                            }
                            nodesConnectable={false}
                          >
                            <MiniMap pannable zoomable className="!bg-white dark:!bg-neutral-950" />
                            <Controls />
                            <Background gap={18} size={1} color="#a3a3a3" />
                          </ReactFlow>
                        )}
                      </div>

                      <div className="space-y-4">
                        <section className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
                          <h4 className="text-sm font-semibold">Canvas Summary</h4>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <StatChip label="Nodes" value={selected.nodes.length} />
                            <StatChip label="Edges" value={selected.edges.length} />
                            <StatChip
                              label="Todo"
                              value={selected.nodes.filter((node) => node.status === 'todo').length}
                            />
                            <StatChip
                              label="Waiting"
                              value={
                                selected.nodes.filter((node) => node.status === 'waiting').length
                              }
                            />
                          </div>
                        </section>

                        <section className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
                          <h4 className="text-sm font-semibold">Selected Node</h4>
                          {selectedPlanNode ? (
                            <div className="mt-3 space-y-3">
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
                        </section>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
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
