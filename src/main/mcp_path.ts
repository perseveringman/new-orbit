/**
 * Resolve the absolute path to the bundled Orbit MCP server entry
 * (`out/mcp/server.cjs`). The MCP server is a separate node sub-process
 * (it never runs inside the electron main process) so we hand the path
 * to per-project `.mcp.json` files and to spawn() in tests.
 *
 * - **dev**: served from the project root (`<appPath>/out/mcp/server.cjs`)
 * - **prod**: copied via electron-builder's `extraResources` to
 *   `<resourcesPath>/mcp/server.cjs`
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';

let cached: string | null = null;
let override: string | null = null;

/** Test/CI hook: pin a specific path so unit tests don't depend on `app.*`. */
export function setMcpServerPathOverride(p: string | null): void {
  override = p;
  cached = null;
}

export function getMcpServerPath(): string {
  if (override) return override;
  if (cached) return cached;
  const isPackaged = app.isPackaged;
  const candidate = isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'server.cjs')
    : path.join(app.getAppPath(), 'out', 'mcp', 'server.cjs');
  cached = candidate;
  return candidate;
}

/** Diagnostic helper exposed via `workspace.diagnostics`. */
export function getMcpServerStatus(): {
  path: string;
  exists: boolean;
} {
  const p = getMcpServerPath();
  return { path: p, exists: existsSync(p) };
}
