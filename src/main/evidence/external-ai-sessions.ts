import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type {
  EvidenceContentView,
  EvidenceScopeRef,
  EvidenceSource
} from '@shared/evidence';
import { evidenceSourceId } from '@shared/evidence';

export const EXTERNAL_AI_SESSION_PROVIDER_ID = 'external.ai_sessions.local';

export interface ExternalAISessionRoot {
  agent: string;
  dir: string;
  source?: string;
}

export interface ExternalAISessionScanOptions {
  roots?: ExternalAISessionRoot[];
  limit?: number;
}

interface SessionFileCandidate {
  agent: string;
  source: string;
  file: string;
  relPath: string;
  projectName?: string;
  size: number;
  mtime: string;
}

interface SessionPreview {
  title: string;
  summary: string;
  firstAt?: string;
  lastAt?: string;
  projectName?: string;
}

export async function listExternalAISessionSources(
  options: ExternalAISessionScanOptions = {}
): Promise<EvidenceSource[]> {
  const candidates = await listSessionFiles(options.roots ?? defaultSessionRoots());
  const limited = candidates
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, Math.max(1, options.limit ?? 300));
  const previews = await Promise.all(limited.map((candidate) => previewSession(candidate)));
  const observedAt = new Date().toISOString();

  return limited.map((candidate, index) => {
    const preview = previews[index];
    const projectName = preview.projectName ?? candidate.projectName;
    const ref = `${candidate.agent}:${candidate.relPath}`;
    return {
      id: evidenceSourceId('external_ai_session', ref),
      kind: 'external_ai_session',
      ownership: 'reference',
      title: preview.title || `${candidate.agent} session ${path.basename(candidate.file, path.extname(candidate.file))}`,
      provider_id: EXTERNAL_AI_SESSION_PROVIDER_ID,
      canonical_ref: candidate.file,
      updated_at: candidate.mtime,
      observed_at: observedAt,
      fingerprint: {
        algorithm: 'mtime-size',
        value: `${candidate.mtime}:${candidate.size}`,
        size_bytes: candidate.size,
        mtime: candidate.mtime
      },
      availability: 'available',
      privacy: {
        index_level: 'safe_projection',
        allow_synthesis: true,
        allow_tool_outputs: false,
        redaction_profile: 'code'
      },
      ...(preview.firstAt || preview.lastAt ? { time_range: { from: preview.firstAt, to: preview.lastAt } } : {}),
      ...(preview.summary ? { summary: preview.summary } : {}),
      ...(projectName ? { scope_refs: [{ kind: 'project', ref: projectName, confidence: 0.45 } satisfies EvidenceScopeRef] } : {}),
      metadata: {
        agent: candidate.agent,
        source: candidate.source,
        path: candidate.file,
        rel_path: candidate.relPath,
        ...(projectName ? { project_name: projectName } : {})
      }
    };
  });
}

export async function readExternalAISessionSourceText(
  source: EvidenceSource,
  contentView: EvidenceContentView
): Promise<string> {
  if (contentView === 'metadata') {
    return [source.title, source.summary, source.canonical_ref].filter(Boolean).join('\n');
  }
  const file = source.metadata?.['path'];
  if (typeof file !== 'string') return '';
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  if (!raw.trim()) return '';
  if (contentView === 'full') return raw;
  return sessionJsonlToText(raw, { includeTools: false });
}

function defaultSessionRoots(): ExternalAISessionRoot[] {
  const home = os.homedir();
  const codexHome = process.env['CODEX_HOME'] || path.join(home, '.codex');
  return [
    { agent: 'claude', source: 'claude-code', dir: path.join(home, '.claude', 'projects') },
    { agent: 'claude-internal', source: 'claude-code', dir: path.join(home, '.claude-internal', 'projects') },
    { agent: 'codex', source: 'codex', dir: path.join(codexHome, 'sessions') },
    { agent: 'amp', source: 'amp', dir: path.join(home, '.local', 'share', 'amp', 'threads') },
    { agent: 'codebuddy', source: 'codebuddy', dir: path.join(home, '.codebuddy') }
  ];
}

async function listSessionFiles(roots: ExternalAISessionRoot[]): Promise<SessionFileCandidate[]> {
  const nested = await Promise.all(roots.map((root) => listSessionFilesForRoot(root)));
  return nested.flat();
}

async function listSessionFilesForRoot(root: ExternalAISessionRoot): Promise<SessionFileCandidate[]> {
  const files = await walkFiles(root.dir, (file) => file.endsWith('.jsonl') || file.endsWith('.json'));
  const candidates = await Promise.all(files.map(async (file): Promise<SessionFileCandidate | null> => {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size < 80) return null;
    const relPath = toPosix(path.relative(root.dir, file));
    const projectName = projectNameFromRelativePath(root.agent, relPath);
    return {
      agent: root.agent,
      source: root.source ?? root.agent,
      file,
      relPath,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ...(projectName ? { projectName } : {})
    } satisfies SessionFileCandidate;
  }));
  return candidates.filter((candidate): candidate is SessionFileCandidate => Boolean(candidate));
}

async function previewSession(candidate: SessionFileCandidate): Promise<SessionPreview> {
  const lines = await readJsonlHead(candidate.file, 80);
  const rendered = lines
    .map((line) => recordToText(safeJsonParse(line), { includeTools: false }))
    .filter(Boolean);
  const title = rendered.find((line) => line.startsWith('user:'))?.replace(/^user:\s*/u, '').slice(0, 120)
    || rendered[0]?.slice(0, 120)
    || '';
  const timestamps = lines
    .map((line) => timestampFromRecord(safeJsonParse(line)))
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    title,
    summary: rendered.slice(0, 3).join(' ').slice(0, 360),
    firstAt: timestamps[0],
    lastAt: timestamps.at(-1),
    projectName: candidate.projectName ?? projectNameFromRenderedText(rendered.join('\n'))
  };
}

function sessionJsonlToText(raw: string, options: { includeTools: boolean }): string {
  return raw
    .split(/\r?\n/u)
    .map((line) => recordToText(safeJsonParse(line), options))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\s{3,}/gu, ' ')
    .trim();
}

function recordToText(record: unknown, options: { includeTools: boolean }): string {
  if (!record || typeof record !== 'object') return '';
  const value = record as Record<string, unknown>;
  const role = roleFromRecord(value);
  const type = typeof value['type'] === 'string' ? value['type'] : '';
  if (!options.includeTools && (role === 'tool' || role === 'system' || type.includes('tool'))) return '';
  const text = textFromUnknown(value['content'])
    || textFromUnknown((value['message'] as Record<string, unknown> | undefined)?.['content'])
    || textFromUnknown(value['text'])
    || textFromUnknown(value['input']);
  return text ? `${role || type || 'message'}: ${text}` : '';
}

function roleFromRecord(value: Record<string, unknown>): string {
  const direct = value['role'];
  if (typeof direct === 'string') return direct;
  const message = value['message'];
  if (message && typeof message === 'object') {
    const role = (message as Record<string, unknown>)['role'];
    if (typeof role === 'string') return role;
  }
  const type = value['type'];
  if (typeof type === 'string' && ['user', 'assistant', 'system', 'tool'].includes(type)) return type;
  return '';
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return cleanupText(value);
  if (Array.isArray(value)) return cleanupText(value.map(textFromUnknown).filter(Boolean).join('\n'));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return cleanupText(
      textFromUnknown(record['text'])
        || textFromUnknown(record['content'])
        || textFromUnknown(record['input'])
        || textFromUnknown(record['message'])
    );
  }
  return '';
}

function timestampFromRecord(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const value = record as Record<string, unknown>;
  const raw = value['timestamp'] ?? value['created_at'] ?? value['createdAt'] ?? value['time'];
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function readJsonlHead(filePath: string, maxLines: number): Promise<string[]> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const lines: string[] = [];
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      lines.push(line);
      if (lines.length >= maxLines) {
        rl.close();
        break;
      }
    }
  } catch {
    return lines;
  } finally {
    stream.destroy();
  }
  return lines;
}

async function walkFiles(root: string, predicate: (file: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, predicate)));
    else if (entry.isFile() && predicate(entry.name)) out.push(abs);
  }
  return out;
}

function projectNameFromRelativePath(agent: string, relPath: string): string | undefined {
  if (!agent.startsWith('claude')) return undefined;
  const first = relPath.split('/')[0];
  if (!first) return undefined;
  return first.replace(/^-+/u, '').replace(/-/gu, '/').split('/').filter(Boolean).at(-1);
}

function projectNameFromRenderedText(text: string): string | undefined {
  const cwd = text.match(/(?:cwd|workdir|workspace)["':\s]+([^"'\n]+)/iu)?.[1]?.trim();
  return cwd ? path.basename(cwd) : undefined;
}

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function cleanupText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/<tool_use>[\s\S]*?<\/tool_use>/gu, ' ')
    .replace(/<tool_result>[\s\S]*?<\/tool_result>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
