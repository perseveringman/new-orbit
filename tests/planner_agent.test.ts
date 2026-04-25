import { describe, expect, it } from 'vitest';
import { isPlannerAgentId, normalizePlannerPayload } from '../src/main/orchestration/planner_agent';
import type { PlanProposal } from '../src/shared/orchestration';

describe('planner agent helpers', () => {
  it('accepts the supported planner agent ids', () => {
    expect(isPlannerAgentId('plan-agent')).toBe(true);
    expect(isPlannerAgentId('architect-agent')).toBe(true);
    expect(isPlannerAgentId('executor-agent')).toBe(true);
    expect(isPlannerAgentId('random-agent')).toBe(false);
  });

  it('normalizes JSON proposal output and derives pre-conditions from edges', () => {
    const previousProposal: PlanProposal = {
      proposalId: 'proposal-1',
      projectUid: 'project-1',
      version: 1,
      title: 'Previous split',
      summary: 'Old summary',
      status: 'draft',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
      source: 'planner',
      nodes: [
        {
          taskUid: 'wire-runtime',
          title: 'Wire runtime',
          position: { x: 640, y: 120 }
        }
      ],
      edges: []
    };

    const payload = normalizePlannerPayload(
      `\`\`\`json
{
  "assistantMessage": "Drafted a three-step plan.",
  "proposal": {
    "title": "Runtime rollout",
    "summary": "Wire the planner runtime and validate it.",
    "nodes": [
      { "taskUid": "discover-scope", "title": "Discover scope", "status": "todo" },
      { "taskUid": "wire-runtime", "title": "Wire runtime", "recommendedRole": "executor" },
      { "taskUid": "wire-runtime", "title": "Validate runtime", "status": "waiting" }
    ],
    "edges": [
      { "fromTaskUid": "discover-scope", "toTaskUid": "wire-runtime", "kind": "depends_on" },
      { "fromTaskUid": "wire-runtime", "toTaskUid": "validate-runtime", "kind": "depends_on" }
    ]
  }
}
\`\`\``,
      previousProposal
    );

    expect(payload.assistantMessage).toBe('Drafted a three-step plan.');
    expect(payload.proposal.title).toBe('Runtime rollout');
    expect(payload.proposal.nodes).toHaveLength(3);
    expect(payload.proposal.nodes[1]?.position).toEqual({ x: 640, y: 120 });
    expect(payload.proposal.nodes[1]?.preConditions).toEqual(['discover-scope']);
    expect(payload.proposal.nodes[2]?.taskUid).toBe('validate-runtime-3');
    expect(payload.proposal.edges).toHaveLength(1);
  });
});
