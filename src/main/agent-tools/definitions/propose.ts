/**
 * Phase C 高风险 propose 工具（destructive=true，但语义是"提议而非直写"）。
 *
 * 这些工具调 cli_server 的 task.propose / proposeScope / proposeSplit handler，
 * 后者已经走 approvalService.submit → Inbox 等用户审批：
 *   agent 调用 → 提议入 Inbox → 用户在 Inbox 决策
 *
 * 因此这里 destructive=true 但 successAction 直接用 'agent.proposal_submitted'
 * （现有 ACTIVITY_ACTIONS 枚举值），让 Activity 视图准确反映"agent 提议了什么"。
 *
 * 不暴露 inbox.resolve / inbox.dismiss：让 user 自己审批，agent 不替用户决断。
 */

import type { AgentToolDef } from '@shared/agent-tools';

export const PROPOSE_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_task_propose',
    description:
      'Propose a NEW task for the user to review in their Inbox. ' +
      'Use when the user agrees a piece of work should become a tracked task. ' +
      'Requires exactly one owner: project_uid, area_uid, or resource_uid. ' +
      'Default to execution_mode=human unless the user explicitly delegates it to agents. ' +
      'The task is NOT created directly — the user must approve it in the Inbox first.',
    cliMethod: 'task.propose',
    destructive: true,
    timeoutMs: 30_000,
    activity: { successAction: 'agent.proposal_submitted', failureAction: 'agent.tool_failed' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Concise task title (imperative form preferred).' },
        description: {
          type: 'string',
          description: 'Optional task description / context.'
        },
        project_uid: {
          type: 'string',
          description: 'Project uid that owns the task. Mutually exclusive with area_uid.'
        },
        area_uid: {
          type: 'string',
          description: 'Area uid that owns the task. Mutually exclusive with project_uid.'
        },
        resource_uid: {
          type: 'string',
          description: 'Resource uid that owns the task. Mutually exclusive with project_uid and area_uid.'
        },
        execution_mode: {
          type: 'string',
          enum: ['human', 'assisted', 'agent', 'scheduled'],
          description: 'Who leads the task. Only agent tasks enter the auto-claim queue.'
        },
        conversation_id: {
          type: 'string',
          description: 'Conversation that produced this task, when available.'
        },
        run_id: {
          type: 'string',
          description: 'Optional agent run id for traceability; orchestrator usually fills this.'
        },
        during_task_uid: {
          type: 'string',
          description: 'Optional task uid this proposal arose from.'
        }
      }
    }
  },
  {
    name: 'orbit_task_propose_scope',
    description:
      'Propose to EXPAND the scope of an existing task (because new requirements emerged mid-work). ' +
      'Use when the user signals that a task needs more than originally planned. ' +
      'The scope expansion is queued as a proposal awaiting user approval in Inbox.',
    cliMethod: 'task.proposeScope',
    destructive: true,
    timeoutMs: 30_000,
    activity: { successAction: 'agent.proposal_submitted', failureAction: 'agent.tool_failed' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['current_uid', 'summary'],
      properties: {
        current_uid: {
          type: 'string',
          description: 'Uid of the task whose scope should expand.'
        },
        summary: {
          type: 'string',
          description: 'Short rationale for the expansion (shown to the user in Inbox).'
        },
        run_id: { type: 'string' }
      }
    }
  },
  {
    name: 'orbit_task_propose_split',
    description:
      'Propose to SPLIT a single task into multiple smaller tasks. ' +
      'Use when the user wants to break a large task into trackable sub-tasks. ' +
      'Submitted as a proposal awaiting user approval in Inbox.',
    cliMethod: 'task.proposeSplit',
    destructive: true,
    timeoutMs: 30_000,
    activity: { successAction: 'agent.proposal_submitted', failureAction: 'agent.tool_failed' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['current_uid', 'summary'],
      properties: {
        current_uid: {
          type: 'string',
          description: 'Uid of the task to split.'
        },
        summary: {
          type: 'string',
          description: 'Short rationale for the split (shown to the user in Inbox).'
        },
        run_id: { type: 'string' }
      }
    }
  }
];
