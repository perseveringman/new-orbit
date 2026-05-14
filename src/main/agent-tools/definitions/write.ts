/**
 * Phase B 低风险写工具（destructive=true，agent 直写 + journal + Activity Log）。
 *
 * 选取标准：
 *   - handler 已限制写入字段范围（如 task.update 只允许 status/depends_on）
 *   - 写入新文件而非覆盖现有用户内容（resource.create 只新建）
 *   - 失败可恢复（无法回滚的高风险操作走 propose 系列）
 */

import type { AgentToolDef } from '@shared/agent-tools';

export const WRITE_TOOL_DEFS: readonly AgentToolDef[] = [
  {
    name: 'orbit_resource_create',
    description:
      'Create a new Resource (long-lived knowledge container) in the vault. ' +
      'Use when the user asks to "save this as a resource" or wants to start a persistent knowledge collection. ' +
      'Never overwrites existing files; the slug auto-suffixes on conflict.',
    cliMethod: 'resource.create',
    destructive: true,
    timeoutMs: 30_000,
    activity: {
      // 现有 ACTIVITY_ACTIONS 已有 'resource.created'，handler 内部会自己发；
      // 这里不重复发，让 destructive 走 'agent.tool_invoked' 泛 action
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Human-readable title.' },
        slug: {
          type: 'string',
          description: 'Optional URL-safe slug; auto-generated from title when omitted.'
        },
        tags: {
          type: 'array',
          description: 'Tags to seed in frontmatter.',
          items: { type: 'string' }
        },
        body: {
          type: 'string',
          description: 'Optional initial Markdown body.'
        }
      }
    }
  },
  {
    name: 'orbit_task_update',
    description:
      'Update a task: status (backlog/waiting/todo/doing/blocked/done), execution_mode, and/or depends_on. ' +
      'Other frontmatter fields are NOT touched (handler-side whitelist). ' +
      'Use when the user explicitly asks to mark/transition a task or wire up dependencies; ' +
      'only set execution_mode=agent when the user explicitly delegates that work to agents.',
    cliMethod: 'task.update',
    destructive: true,
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['uid'],
      properties: {
        uid: { type: 'string', description: 'Task uid (or slug).' },
        status: {
          type: 'string',
          description: 'New status (backlog / waiting / todo / doing / blocked / done).'
        },
        execution_mode: {
          type: 'string',
          enum: ['human', 'assisted', 'agent', 'scheduled'],
          description: 'Who leads this task. Only agent tasks enter the auto-claim queue.'
        },
        depends_on: {
          type: 'array',
          description: 'New depends_on list (replaces existing).',
          items: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'orbit_assets_scope_add',
    description:
      "Pin an external folder/file/url as a project's asset scope. " +
      'Use when the user wants to associate a resource (e.g. a docs folder) with a project for later agent access.',
    cliMethod: 'assets.scope.add',
    destructive: true,
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['project', 'source', 'kind'],
      properties: {
        project: { type: 'string', description: 'Project uid or slug.' },
        source: {
          type: 'string',
          description: 'Path or URL of the asset (folder, glob, single file, or URL).'
        },
        kind: {
          type: 'string',
          enum: ['folder', 'glob', 'file', 'url'],
          description: 'How to interpret `source`.'
        },
        title: { type: 'string', description: 'Optional human title for the scope.' },
        tags: {
          type: 'array',
          items: { type: 'string' }
        },
        note: { type: 'string', description: 'Optional note about why this scope was added.' }
      }
    }
  }
];
