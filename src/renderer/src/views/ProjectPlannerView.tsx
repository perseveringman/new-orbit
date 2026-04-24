import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanProposal, PlanProposalNode, PlanPublishResult } from '@shared/orchestration';
import { useFiles } from '../store/files';

interface ProjectPlannerViewProps {
  projectUid: string;
}

export function ProjectPlannerView({ projectUid }: ProjectPlannerViewProps): JSX.Element {
  const toast = useFiles((s) => s.toast);
  const [proposals, setProposals] = useState<PlanProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [publishResult, setPublishResult] = useState<PlanPublishResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await window.orbit.planner.listProposals(projectUid);
      setProposals(list);
      if (list.length > 0 && !selectedProposalId) {
        setSelectedProposalId(list[0].proposalId);
      }
    } catch (e) {
      toast(`Load proposals failed: ${(e as Error).message}`);
    }
  }, [projectUid, selectedProposalId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => proposals.find((p) => p.proposalId === selectedProposalId) ?? null,
    [proposals, selectedProposalId]
  );

  useEffect(() => {
    if (selected && editMode) {
      setEditedJson(JSON.stringify(selected, null, 2));
    }
  }, [selected, editMode]);

  async function createDraft(): Promise<void> {
    try {
      const tasks = await window.orbit.project.getTasks(projectUid);
      const nodes: PlanProposalNode[] = tasks
        .filter((t) => t.status !== 'done')
        .map((t) => ({
          taskUid: t.uid || `temp-${t.id}`,
          title: t.title || '(untitled)',
          status: t.status as PlanProposalNode['status'],
          executionStrategy: 'manual',
          priority: 'med',
          tags: t.tags
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
              {proposals.map((p) => (
                <li key={p.proposalId}>
                  <button
                    onClick={() => setSelectedProposalId(p.proposalId)}
                    className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                      p.proposalId === selectedProposalId
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.title}</span>
                      <ProposalStatusBadge status={p.status} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      v{p.version} · {p.source} · {p.nodes.length} nodes
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
                <div className="flex items-start justify-between">
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
                      <PublishResultPanel result={publishResult} onClose={() => setPublishResult(null)} />
                    )}

                    <section>
                      <h4 className="mb-2 text-sm font-semibold">
                        Proposal Nodes ({selected.nodes.length})
                      </h4>
                      <div className="space-y-2">
                        {selected.nodes.map((node) => (
                          <NodeCard key={node.taskUid} node={node} />
                        ))}
                      </div>
                    </section>

                    {selected.edges.length > 0 && (
                      <section>
                        <h4 className="mb-2 text-sm font-semibold">
                          Dependencies ({selected.edges.length})
                        </h4>
                        <ul className="space-y-1 text-xs">
                          {selected.edges.map((edge) => (
                            <li key={edge.id} className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
                              <span className="font-mono text-[10px]">{edge.fromTaskUid}</span>
                              <span className="mx-2 text-neutral-500">→ ({edge.kind}) →</span>
                              <span className="font-mono text-[10px]">{edge.toTaskUid}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
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
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${color}`}>
      {status}
    </span>
  );
}

function NodeCard({ node }: { node: PlanProposalNode }): JSX.Element {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold">{node.title}</h5>
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

function PublishResultPanel({ result, onClose }: { result: PlanPublishResult; onClose(): void }): JSX.Element {
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
