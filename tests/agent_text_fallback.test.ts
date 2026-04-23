import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseToolInvocationLine, parseHydrationLine } from '../src/main/agent/context';
import { callTool, type ToolContext } from '../src/mcp/tools';
import { createVault } from '../src/main/vault';
import { createProject } from '../src/main/project';

describe('agent text-fallback parser (parseToolInvocationLine)', () => {
  it('parses a well-formed invocation', () => {
    const r = parseToolInvocationLine(
      '@orbit:tool:create_task {"title":"hi","priority":"high"}'
    );
    expect(r).toEqual({
      name: 'create_task',
      args: { title: 'hi', priority: 'high' }
    });
  });

  it('tolerates leading "> " markup like the hydration parser', () => {
    const r = parseToolInvocationLine('> @orbit:tool:get_vision');
    expect(r).toEqual({ name: 'get_vision', args: {} });
  });

  it('returns null for non-invocations', () => {
    expect(parseToolInvocationLine('hello world')).toBeNull();
    expect(parseToolInvocationLine('@orbit:search foo')).toBeNull();
    // existing hydration parser still recognises @orbit:search
    expect(parseHydrationLine('@orbit:search foo')).toEqual({ query: 'foo' });
  });

  it('returns null for malformed JSON', () => {
    expect(parseToolInvocationLine('@orbit:tool:create_task {bad json}')).toBeNull();
    expect(parseToolInvocationLine('@orbit:tool:create_task [1,2]')).toBeNull();
  });
});

describe('agent text-fallback dispatch routes through src/mcp/tools.ts', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-agent-fallback-'));
    await createVault(vault);
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('parsed invocation dispatched to callTool produces the same result as direct MCP', async () => {
    const proj = await createProject(vault, {
      slug: 'fb',
      template: 'blank',
      name: 'FB'
    });
    const ctx: ToolContext = {
      vault,
      projectUid: proj.uid,
      projectSlug: 'fb',
      now: () => new Date('2025-04-21T12:00:00Z')
    };
    const inv = parseToolInvocationLine(
      '@orbit:tool:create_task {"title":"From Stdout"}'
    );
    expect(inv).not.toBeNull();
    const r = await callTool(ctx, inv!.name, inv!.args);
    expect(r.isError).toBeFalsy();
    const payload = JSON.parse(r.content[0]!.text) as { uid: string; path: string };
    expect(payload.path).toContain(path.join('01_Projects', 'fb', '.orbit', 'agent', 'tasks'));
  });
});
