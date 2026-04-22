/**
 * Per-project `.mcp.json` writer. Claude Code reads this file from the
 * project's working directory on startup and registers any declared
 * MCP servers. We embed the env-locked Orbit server so the model can
 * call `create_task`, `update_task_status`, etc. scoped to *this*
 * project.
 *
 * The schema is the Claude Code documented one
 * (https://docs.claude.com/claude-code/configuration/mcp):
 *
 *   {
 *     "mcpServers": {
 *       "<name>": {
 *         "type": "stdio",
 *         "command": "...",
 *         "args": [...],
 *         "env": { ... }
 *       }
 *     }
 *   }
 *
 * `ensureMcpConfig` is idempotent — it merges the `orbit` entry when
 * missing or when its env vars / args drift from the canonical shape.
 * Other entries (user-added MCP servers) are preserved.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MCP_CONFIG_FILENAME = '.mcp.json';
export const ORBIT_MCP_SERVER_NAME = 'orbit';

export interface OrbitMcpEntryArgs {
  vault: string;
  projectUid: string;
  projectSlug: string;
  /** Absolute path to `out/mcp/server.cjs` (or override for tests). */
  mcpServerPath: string;
}

export interface McpServerEntry {
  type: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerEntry>;
}

export function buildOrbitEntry(args: OrbitMcpEntryArgs): McpServerEntry {
  return {
    type: 'stdio',
    command: 'node',
    args: [args.mcpServerPath],
    env: {
      ORBIT_VAULT_PATH: args.vault,
      ORBIT_PROJECT_UID: args.projectUid,
      ORBIT_PROJECT_SLUG: args.projectSlug
    }
  };
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  if (a.type !== b.type) return false;
  if (a.command !== b.command) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) if (a.args[i] !== b.args[i]) return false;
  const ka = Object.keys(a.env).sort();
  const kb = Object.keys(b.env).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (a.env[ka[i]!] !== b.env[ka[i]!]) return false;
  }
  return true;
}

/**
 * Make sure `<projectDir>/.mcp.json` registers the Orbit MCP server with
 * the env-locked args. Returns whether the file was written. Other
 * server entries (user-added) are preserved verbatim. Malformed JSON is
 * replaced wholesale (Claude Code would reject it anyway).
 */
export async function ensureMcpConfig(
  projectDir: string,
  args: OrbitMcpEntryArgs
): Promise<{ path: string; written: boolean }> {
  const file = path.join(projectDir, MCP_CONFIG_FILENAME);
  let existing: McpConfigFile | null = null;
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'mcpServers' in parsed) {
      const m = (parsed as { mcpServers: unknown }).mcpServers;
      if (m && typeof m === 'object') {
        existing = { mcpServers: m as Record<string, McpServerEntry> };
      }
    }
  } catch {
    existing = null;
  }
  const next: McpConfigFile = existing ?? { mcpServers: {} };
  const orbit = buildOrbitEntry(args);
  const cur = next.mcpServers[ORBIT_MCP_SERVER_NAME];
  const upToDate = cur ? entriesEqual(cur, orbit) : false;
  if (existing && upToDate) return { path: file, written: false };
  next.mcpServers[ORBIT_MCP_SERVER_NAME] = orbit;
  const json = JSON.stringify(next, null, 2) + '\n';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json, 'utf8');
  return { path: file, written: true };
}
