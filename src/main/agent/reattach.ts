import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentEvent, AgentEventKind } from '@shared/agent';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';

export interface ReattachQuery {
  vaultPath: string;
  runId: string;
  sinceIdx?: number;
}

export interface ReattachResult {
  runId: string;
  events: AgentEvent[];
  /** True iff the file existed AND its last event.kind is a terminal one (done | error | budget_halt), OR file missing. */
  terminated: boolean;
  /** Path that was read (for debugging). */
  logPath: string;
}

const TERMINAL_KINDS: ReadonlySet<AgentEventKind> = new Set<AgentEventKind>([
  'done',
  'error',
  'budget_halt'
]);

function isAgentEvent(v: unknown): v is AgentEvent {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.idx === 'number' && typeof o.at === 'string' && typeof o.kind === 'string';
}

export async function readLogForReattach(q: ReattachQuery): Promise<ReattachResult> {
  const sinceIdx = q.sinceIdx ?? -1;
  const logPath = path.join(q.vaultPath, ORBIT_DIR, ORBIT_LOGS_DIR, `${q.runId}.ndjson`);

  let raw: string;
  try {
    raw = await fs.readFile(logPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return { runId: q.runId, events: [], terminated: true, logPath };
    }
    throw err;
  }

  const all: AgentEvent[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isAgentEvent(parsed)) all.push(parsed);
    } catch {
      // skip corrupt line
    }
  }

  const last = all.length > 0 ? all[all.length - 1] : undefined;
  const terminated = last ? TERMINAL_KINDS.has(last.kind) : true;

  const events = all.filter((ev) => ev.idx > sinceIdx);

  return { runId: q.runId, events, terminated, logPath };
}
