import type { EntitySummary, TaskRecord } from '@shared/schemas';
import type { SearchHit } from '@shared/types';

export interface TaskContextArgs {
  task: TaskRecord;
  entities: EntitySummary[];
}

/**
 * Render a plaintext task context block for the prompt. Includes the
 * owning project/area titles + UIDs so the agent can cite them back.
 */
export function buildTaskContext({ task, entities }: TaskContextArgs): string {
  const lines: string[] = [];
  lines.push(`Task: ${task.title}`);
  lines.push(`- id: ${task.id}`);
  lines.push(`- status: ${task.status}`);
  lines.push(`- source: ${task.source}`);
  lines.push(`- file: ${task.relPath}`);
  if (task.uid) lines.push(`- uid: ${task.uid}`);
  if (task.due) lines.push(`- due: ${task.due}`);
  if (task.effort) lines.push(`- effort: ${task.effort}`);
  if (task.tags?.length) lines.push(`- tags: ${task.tags.join(', ')}`);
  const proj = task.project_uid
    ? entities.find((e) => e.uid === task.project_uid && e.type === 'project')
    : undefined;
  if (task.project_uid) {
    lines.push(`- project_uid: ${task.project_uid}${proj ? ` (${proj.title})` : ''}`);
  }
  const area = task.area_uid
    ? entities.find((e) => e.uid === task.area_uid && e.type === 'area')
    : undefined;
  if (task.area_uid) {
    lines.push(`- area_uid: ${task.area_uid}${area ? ` (${area.title})` : ''}`);
  }
  return lines.join('\n');
}

export const HYDRATION_PREFIX = '@orbit:search';
export const TOOL_PREFIX = '@orbit:tool:';

export interface HydrationRequest {
  query: string;
}

export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Parse a single stdout line. Returns `null` if it is not a hydration
 * request. Matching is deliberately forgiving — whitespace + leading
 * markup like `> ` from agent reformulations is stripped.
 */
export function parseHydrationLine(line: string): HydrationRequest | null {
  const trimmed = line.replace(/^[>\s]+/, '').trim();
  if (!trimmed.toLowerCase().startsWith(HYDRATION_PREFIX)) return null;
  const rest = trimmed.slice(HYDRATION_PREFIX.length).trim();
  if (!rest) return null;
  return { query: rest };
}

/**
 * Text-fallback tool invocation parser.
 *
 * R5 wires the canonical Orbit tools through MCP (`.mcp.json` + the
 * stdio JSON-RPC server). For headless / nightly runs that don't have
 * MCP available we still want the same surface; agents can emit lines
 * shaped like:
 *
 *   @orbit:tool:create_task {"title":"...","description":"..."}
 *
 * Returns `null` when the line does not match the prefix or the JSON
 * argument blob fails to parse. The actual dispatch (calling
 * `src/mcp/tools.ts`) is wired in R6 — R5 ships the parser + tests so
 * the contract is locked.
 */
export function parseToolInvocationLine(line: string): ToolInvocation | null {
  const trimmed = line.replace(/^[>\s]+/, '').trim();
  if (!trimmed.toLowerCase().startsWith(TOOL_PREFIX)) return null;
  const rest = trimmed.slice(TOOL_PREFIX.length);
  // Tool name is the contiguous run of [a-zA-Z0-9_] characters; the
  // remainder (after stripping leading whitespace) is the JSON blob. An
  // empty blob is treated as `{}` so `@orbit:tool:get_vision` works.
  const m = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(.*)$/);
  if (!m) return null;
  const name = m[1] ?? '';
  const jsonRaw = (m[2] ?? '').trim();
  if (!name) return null;
  let args: Record<string, unknown> = {};
  if (jsonRaw.length > 0) {
    try {
      const parsed = JSON.parse(jsonRaw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  return { name, args };
}

/**
 * Format a list of search hits as a single follow-up message we inject
 * back into the runner's stdin. The schema is stable: `HYDRATION:` header,
 * then up to N lines of `relPath — title — score`, then a close marker.
 */
export function formatHydrationReply(query: string, hits: SearchHit[]): string {
  const head = `HYDRATION for "${query}" (${hits.length} hit${hits.length === 1 ? '' : 's'})`;
  if (hits.length === 0) return `${head}\n(no matches)\n/HYDRATION\n`;
  const rows = hits.map(
    (h) => `- ${h.relPath} — ${h.title} — score=${h.score.toFixed(2)}`
  );
  return `${head}\n${rows.join('\n')}\n/HYDRATION\n`;
}
