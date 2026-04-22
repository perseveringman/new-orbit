#!/usr/bin/env node
/**
 * Orbit MCP server entry point.
 *
 * Spawned as a stdio sub-process by Claude Code (per the project's
 * `.mcp.json`). Reads the vault root and project identity from env vars
 * — refusing to start if any are missing so a misconfigured client can
 * never accidentally write to the wrong project.
 *
 *   ORBIT_VAULT_PATH      absolute path to the vault root
 *   ORBIT_PROJECT_UID     uid of the project this server is bound to
 *   ORBIT_PROJECT_SLUG    folder slug under 01_Projects/
 */

import { startServer } from './protocol';
import { TOOLS, callTool, type ToolContext } from './tools';

function abort(msg: string): never {
  process.stderr.write(`orbit-mcp: ${msg}\n`);
  process.exit(1);
}

const vault = process.env['ORBIT_VAULT_PATH'];
const projectUid = process.env['ORBIT_PROJECT_UID'];
const projectSlug = process.env['ORBIT_PROJECT_SLUG'];

if (!vault) abort('ORBIT_VAULT_PATH not set');
if (!projectUid) abort('ORBIT_PROJECT_UID not set');
if (!projectSlug) abort('ORBIT_PROJECT_SLUG not set');

const ctx: ToolContext = {
  vault: vault!,
  projectUid: projectUid!,
  projectSlug: projectSlug!
};

startServer({
  serverName: 'orbit',
  serverVersion: '0.1.0',
  tools: TOOLS,
  callTool: (name, args) => callTool(ctx, name, args)
});

// Keep the event loop alive even when stdin pauses (Claude Code can
// idle for many seconds between tools/call invocations).
const keepAlive = setInterval(() => undefined, 1 << 30);
process.on('SIGTERM', () => {
  clearInterval(keepAlive);
  process.exit(0);
});
process.on('SIGINT', () => {
  clearInterval(keepAlive);
  process.exit(0);
});
