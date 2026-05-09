/**
 * Phase A 首批 5 个只读工具。
 *
 * 命名约定：snake_case，统一 `orbit_` 前缀，避免与 LLM provider 内置 tool 冲突。
 * 描述写"工作流语义"，告诉 LLM **何时**调用，而不是参数细节（参数细节已在 input_schema 里）。
 *
 * cliMethod 直接对应 src/main/cli_server/handlers.ts 中 registry.register 注册的方法名。
 */

import type { AgentToolDef } from '@shared/agent-tools';

export const READ_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_search',
    description:
      "Full-text search across the user's Orbit vault (notes, tasks, project files, resources). " +
      'Use this whenever you need to locate content the user mentions in passing, before reading individual files. ' +
      'Returns up to `limit` hits with a relPath and snippet.',
    cliMethod: 'search',
    timeoutMs: 120_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (keywords or short phrase).' },
        limit: { type: 'integer', description: 'Maximum number of hits (default 30).' },
        project: {
          type: 'string',
          description: 'Optional project uid or slug to scope the search to a single project folder.'
        }
      }
    }
  },
  {
    name: 'orbit_read',
    description:
      'Read the full UTF-8 content of a single vault file by relative path. ' +
      'Use after `orbit_search` when you need the actual content of a hit, or when the user references a known path.',
    cliMethod: 'cat',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['target'],
      properties: {
        target: {
          type: 'string',
          description: 'Vault-relative path (e.g. `01_Projects/2026-launch/index.md`).'
        }
      }
    }
  },
  {
    name: 'orbit_space_context',
    description:
      'Get a structured snapshot of a Project / Area / Resource: title, status, tags, description, current tasks, materials, outputs. ' +
      'Use this when the user references a space ("this project", "the design area") and you need its current state to give grounded advice.',
    cliMethod: 'space.context',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'Project uid / Area slug / Resource slug.'
        },
        summary: {
          type: 'boolean',
          description: 'If true, return a compact summary; otherwise full bundle.'
        },
        sections: {
          type: 'array',
          description: 'Optional subset of sections to include (default: all).',
          items: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'orbit_task_list',
    description:
      'List tasks with optional filters (status, project, area, resource, tag). ' +
      'Use to enumerate work items before recommending priorities or summarising progress.',
    cliMethod: 'task.list',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          description: 'Filter by task status (todo / doing / awaiting_user / done / archived).'
        },
        project: { type: 'string', description: 'Project uid or slug.' },
        area: { type: 'string', description: 'Area uid or slug.' },
        resource: { type: 'string', description: 'Resource uid or slug.' },
        tag: { type: 'string', description: 'Filter by a single tag.' }
      }
    }
  },
  {
    name: 'orbit_activity_query',
    description:
      "Query the user's Activity Log (a chronological audit of edits, task transitions, captures, agent runs). " +
      'Use to answer questions like "what did I do yesterday" or to trace why a task changed state.',
    cliMethod: 'activity.list',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'Inclusive ISO 8601 lower bound.' },
        to: { type: 'string', description: 'Inclusive ISO 8601 upper bound.' },
        actor: {
          type: 'string',
          description: 'Filter by actor (user / agent / system).'
        },
        action: { type: 'string', description: 'Single Activity action to filter on.' },
        actions: {
          type: 'array',
          description: 'Multiple Activity actions to filter on (OR semantics).',
          items: { type: 'string' }
        },
        project_uid: { type: 'string' },
        task_uid: { type: 'string' },
        limit: { type: 'integer', description: 'Maximum events to return.' }
      }
    }
  }
];
