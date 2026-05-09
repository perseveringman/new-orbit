import { describe, expect, it } from 'vitest';
import type { AgentToolDef } from '@shared/agent-tools';
import { OrbitToolRegistry } from '../src/main/agent-tools/registry';

const GLOBAL_TOOL: AgentToolDef = {
  name: 'orbit_search',
  description: 'search',
  cliMethod: 'search',
  inputSchema: { type: 'object' }
};

const PROJECT_TOOL: AgentToolDef = {
  name: 'orbit_project_only',
  description: 'project only',
  cliMethod: 'project.get',
  scopes: ['project'],
  inputSchema: { type: 'object' }
};

const TASK_TOOL: AgentToolDef = {
  name: 'orbit_task_only',
  description: 'task only',
  cliMethod: 'task.get',
  scopes: ['task', 'project'],
  inputSchema: { type: 'object' }
};

describe('OrbitToolRegistry', () => {
  it('registers and retrieves tool by name', () => {
    const r = new OrbitToolRegistry();
    r.register(GLOBAL_TOOL);
    expect(r.has('orbit_search')).toBe(true);
    expect(r.getByName('orbit_search')?.cliMethod).toBe('search');
  });

  it('throws on duplicate registration', () => {
    const r = new OrbitToolRegistry();
    r.register(GLOBAL_TOOL);
    expect(() => r.register(GLOBAL_TOOL)).toThrow(/agent_tool_already_registered/);
  });

  it('listAll returns tools sorted by name', () => {
    const r = new OrbitToolRegistry();
    r.registerMany([PROJECT_TOOL, GLOBAL_TOOL, TASK_TOOL]);
    expect(r.listAll().map((t) => t.name)).toEqual([
      'orbit_project_only',
      'orbit_search',
      'orbit_task_only'
    ]);
  });

  it('listForScope keeps tools without scopes (treated as universal)', () => {
    const r = new OrbitToolRegistry();
    r.registerMany([GLOBAL_TOOL, PROJECT_TOOL, TASK_TOOL]);
    const out = r.listForScope({ kind: 'note', note_id: 'x' });
    expect(out.map((t) => t.name)).toEqual(['orbit_search']);
  });

  it('listForScope filters by ConversationScope.kind match', () => {
    const r = new OrbitToolRegistry();
    r.registerMany([GLOBAL_TOOL, PROJECT_TOOL, TASK_TOOL]);
    const projectOut = r.listForScope({ kind: 'project', project_id: 'p1' });
    expect(projectOut.map((t) => t.name).sort()).toEqual([
      'orbit_project_only',
      'orbit_search',
      'orbit_task_only'
    ]);
    const taskOut = r.listForScope({ kind: 'task', task_id: 't1' });
    expect(taskOut.map((t) => t.name).sort()).toEqual(['orbit_search', 'orbit_task_only']);
  });
});
