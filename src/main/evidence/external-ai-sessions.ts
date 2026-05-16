import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type {
  EvidenceContentView,
  EvidencePrivacy,
  EvidenceScopeRef,
  ExternalAISessionRootConfig,
  EvidenceSource
} from '@shared/evidence';
import { evidenceSourceId } from '@shared/evidence';

export const EXTERNAL_AI_SESSION_PROVIDER_ID = 'external.ai_sessions.local';

export type ExternalAISessionRoot = ExternalAISessionRootConfig;

export interface ExternalAISessionScanOptions {
  roots?: ExternalAISessionRoot[];
  limit?: number;
  includeAgents?: string[];
  excludeAgents?: string[];
  includeProjects?: string[];
  excludeProjects?: string[];
  includePathSubstrings?: string[];
  excludePathSubstrings?: string[];
  indexLevel?: EvidencePrivacy['index_level'];
  includeToolOutputs?: boolean;
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
  const roots = (options.roots ?? defaultExternalAISessionRoots()).filter((root) => root.enabled !== false);
  const candidates = await listSessionFiles(roots);
  const limited = candidates
    .filter((candidate) => candidateMatchesOptions(candidate, options))
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, Math.max(1, options.limit ?? 300));
  const previews = await Promise.all(limited.map((candidate) => previewSession(candidate)));
  const observedAt = new Date().toISOString();
  const indexLevel = options.indexLevel ?? 'safe_projection';
  const includeToolOutputs = options.includeToolOutputs ?? false;

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
        index_level: indexLevel,
        allow_synthesis: indexLevel !== 'metadata_only',
        allow_tool_outputs: includeToolOutputs,
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
  return sessionFileToText(raw, file, { includeTools: source.privacy.allow_tool_outputs });
}

export function defaultExternalAISessionRoots(): ExternalAISessionRoot[] {
  const home = os.homedir();
  const codexHome = process.env['CODEX_HOME'] || path.join(home, '.codex');
  return [
    { agent: 'claude', source: 'claude-transcripts', dir: path.join(home, '.claude', 'transcripts') },
    { agent: 'claude', source: 'claude-projects', dir: path.join(home, '.claude', 'projects') },
    { agent: 'claude-internal', source: 'claude-internal-projects', dir: path.join(home, '.claude-internal', 'projects') },
    { agent: 'codex', source: 'codex', dir: path.join(codexHome, 'sessions') },
    { agent: 'amp', source: 'amp', dir: path.join(home, '.local', 'share', 'amp', 'threads') },
    { agent: 'copilot', source: 'copilot', dir: path.join(home, '.copilot', 'session-state') },
    { agent: 'codebuddy', source: 'codebuddy-projects', dir: path.join(home, '.codebuddy', 'projects') },
    { agent: 'codebuddy', source: 'codebuddy-history', dir: path.join(home, '.codebuddy', 'history.jsonl') },
    { agent: 'box', source: 'box-history', dir: path.join(home, '.box', 'ctx') }
  ];
}

function candidateMatchesOptions(candidate: SessionFileCandidate, options: ExternalAISessionScanOptions): boolean {
  if (!matchesInclude(candidate.agent, options.includeAgents)) return false;
  if (matchesAny(candidate.agent, options.excludeAgents)) return false;
  const project = candidate.projectName ?? '';
  if (!matchesInclude(project, options.includeProjects)) return false;
  if (project && matchesAny(project, options.excludeProjects)) return false;
  const pathText = [candidate.relPath, candidate.file, candidate.source, project].filter(Boolean).join('\n');
  if (!matchesInclude(pathText, options.includePathSubstrings)) return false;
  if (matchesAny(pathText, options.excludePathSubstrings)) return false;
  return true;
}

function matchesInclude(value: string, patterns?: string[]): boolean {
  const normalized = normalizeMatchText(value);
  const active = patterns?.map(normalizeMatchText).filter(Boolean) ?? [];
  return !active.length || active.some((pattern) => normalized.includes(pattern));
}

function matchesAny(value: string, patterns?: string[]): boolean {
  const normalized = normalizeMatchText(value);
  return (patterns ?? []).map(normalizeMatchText).filter(Boolean).some((pattern) => normalized.includes(pattern));
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().trim();
}

async function listSessionFiles(roots: ExternalAISessionRoot[]): Promise<SessionFileCandidate[]> {
  const nested = await Promise.all(roots.map((root) => listSessionFilesForRoot(root)));
  return nested.flat();
}

async function listSessionFilesForRoot(root: ExternalAISessionRoot): Promise<SessionFileCandidate[]> {
  const rootStat = await fs.stat(root.dir).catch(() => null);
  if (!rootStat) return [];
  const files = rootStat.isFile()
    ? (isSessionFileForRoot(root, path.basename(root.dir), root.dir) ? [root.dir] : [])
    : rootStat.isDirectory()
      ? await walkFiles(root.dir, (file, absolutePath) => isSessionFileForRoot(root, file, absolutePath))
      : [];
  const relativeBase = rootStat.isFile() ? path.dirname(root.dir) : root.dir;
  const candidates = await Promise.all(files.map(async (file): Promise<SessionFileCandidate | null> => {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size < minimumSessionFileSize(root)) return null;
    const relPath = toPosix(path.relative(relativeBase, file));
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
  if (isMarkdownFile(candidate.file)) return previewMarkdownSession(candidate);
  const records = await readSessionRecordsHead(candidate.file, 120);
  const rendered = records
    .map((record) => recordToText(record, { includeTools: false }))
    .filter(Boolean);
  const title = rendered.find((line) => line.startsWith('user:'))?.replace(/^user:\s*/u, '').slice(0, 120)
    || rendered[0]?.slice(0, 120)
    || '';
  const timestamps = records
    .map(timestampFromRecord)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    title,
    summary: rendered.slice(0, 3).join(' ').slice(0, 360),
    firstAt: timestamps[0],
    lastAt: timestamps.at(-1),
    projectName: candidate.projectName ?? projectNameFromRecords(records) ?? projectNameFromRenderedText(rendered.join('\n'))
  };
}

async function previewMarkdownSession(candidate: SessionFileCandidate): Promise<SessionPreview> {
  const raw = await fs.readFile(candidate.file, 'utf8').catch(() => '');
  const rendered = markdownSessionToText(raw, { includeTools: false });
  const title = raw.match(/^#\s+(.+)$/mu)?.[1]?.trim()
    || rendered.split(/\r?\n/u).find((line) => line.trim())?.slice(0, 120)
    || '';
  return {
    title,
    summary: rendered.replace(/\s+/gu, ' ').slice(0, 360),
    lastAt: candidate.mtime,
    projectName: candidate.projectName
  };
}

function sessionFileToText(raw: string, filePath: string, options: { includeTools: boolean }): string {
  if (isMarkdownFile(filePath)) return markdownSessionToText(raw, options);
  const wholeJson = safeJsonParse(raw);
  const records = wholeJson
    ? collectSessionRecords(wholeJson, 2000)
    : raw
      .split(/\r?\n/u)
      .map((line) => safeJsonParse(line))
      .filter(Boolean);
  return recordsToText(records, options);
}

function recordsToText(records: unknown[], options: { includeTools: boolean }): string {
  return records
    .map((record) => recordToText(record, options))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\s{3,}/gu, ' ')
    .trim();
}

function markdownSessionToText(raw: string, options: { includeTools: boolean }): string {
  const withoutToolSections = options.includeTools
    ? raw
    : raw.replace(/^## \[Tool\][\s\S]*?(?=^---$|^## \[|^#|(?![\s\S]))/gmu, ' ');
  return cleanupMarkdownText(withoutToolSections);
}

async function readSessionRecordsHead(filePath: string, maxRecords: number): Promise<unknown[]> {
  if (isJsonlLikeFile(filePath)) {
    const lines = await readJsonlHead(filePath, Math.max(maxRecords, 120));
    return lines.map((line) => safeJsonParse(line)).filter(Boolean).slice(0, maxRecords);
  }
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  const parsed = safeJsonParse(raw);
  return parsed ? collectSessionRecords(parsed, maxRecords) : [];
}

function recordToText(record: unknown, options: { includeTools: boolean }): string {
  if (!record || typeof record !== 'object') return '';
  const value = record as Record<string, unknown>;
  const role = roleFromRecord(value);
  const type = typeof value['type'] === 'string' ? value['type'] : '';
  if (!options.includeTools && (role === 'tool' || role === 'system' || isToolLikeType(type))) return '';
  const data = recordFromUnknown(value['data']);
  const payload = recordFromUnknown(value['payload']);
  const message = recordFromUnknown(value['message']);
  const text = textFromUnknown(value['content'], options)
    || textFromUnknown(message?.['content'], options)
    || textFromUnknown(value['text'], options)
    || textFromUnknown(value['input'], options);
  const nestedText = text
    || textFromUnknown(data?.['content'], options)
    || textFromUnknown(data?.['message'], options)
    || textFromUnknown(data?.['text'], options)
    || textFromUnknown(data?.['input'], options)
    || textFromUnknown(data?.['prompt'], options)
    || textFromUnknown(data?.['result'], options)
    || textFromUnknown(payload?.['content'], options)
    || textFromUnknown(payload?.['message'], options)
    || textFromUnknown(payload?.['text'], options)
    || textFromUnknown(payload?.['input'], options)
    || textFromUnknown(payload?.['text_elements'], options)
    || textFromUnknown(payload?.['reasoningText'], options)
    || textFromUnknown(payload?.['reasoning'], options);
  return nestedText ? `${role || type || 'message'}: ${nestedText}` : '';
}

function roleFromRecord(value: Record<string, unknown>): string {
  const direct = value['role'];
  if (typeof direct === 'string') return direct;
  const message = recordFromUnknown(value['message']);
  const payload = recordFromUnknown(value['payload']);
  const data = recordFromUnknown(value['data']);
  const messageRole = message?.['role'];
  if (typeof messageRole === 'string') return messageRole;
  const payloadRole = payload?.['role'];
  if (typeof payloadRole === 'string') return payloadRole;
  const dataRole = data?.['role'];
  if (typeof dataRole === 'string') return dataRole;
  const typeCandidates = [value['type'], payload?.['type'], data?.['type']];
  for (const type of typeCandidates) {
    if (typeof type !== 'string') continue;
    if (['user', 'assistant', 'system', 'tool'].includes(type)) return type;
    if (/user[._-]?message/u.test(type)) return 'user';
    if (/assistant[._-]?message|agent_reasoning|reasoning/u.test(type)) return 'assistant';
    if (/tool|function_call_output/u.test(type)) return 'tool';
    if (/session[._-]?start|session_meta|turn_context/u.test(type)) return 'system';
  }
  return '';
}

function textFromUnknown(value: unknown, options: { includeTools: boolean }): string {
  if (typeof value === 'string') return cleanupText(value);
  if (Array.isArray(value)) return cleanupText(value.map((item) => textFromUnknown(item, options)).filter(Boolean).join('\n'));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const type = typeof record['type'] === 'string' ? record['type'] : '';
    if (!options.includeTools && isToolLikeType(type)) return '';
    return cleanupText(
      textFromUnknown(record['text'], options)
        || textFromUnknown(record['content'], options)
        || textFromUnknown(record['input'], options)
        || textFromUnknown(record['message'], options)
        || textFromUnknown(record['output'], options)
        || textFromUnknown(record['display'], options)
    );
  }
  return '';
}

function timestampFromRecord(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const value = record as Record<string, unknown>;
  const data = recordFromUnknown(value['data']);
  const payload = recordFromUnknown(value['payload']);
  const raw = value['timestamp']
    ?? value['created_at']
    ?? value['createdAt']
    ?? value['time']
    ?? data?.['startTime']
    ?? data?.['timestamp']
    ?? data?.['createdAt']
    ?? payload?.['timestamp']
    ?? payload?.['created_at']
    ?? payload?.['createdAt'];
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

async function walkFiles(root: string, predicate: (file: string, absolutePath: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, predicate)));
    else if (entry.isFile() && predicate(entry.name, abs)) out.push(abs);
  }
  return out;
}

function projectNameFromRelativePath(agent: string, relPath: string): string | undefined {
  if (agent === 'box') return 'Box';
  if (!agent.startsWith('claude') && agent !== 'codebuddy') return undefined;
  const first = relPath.split('/')[0];
  if (!first) return undefined;
  const cleaned = first.replace(agent === 'codebuddy' ? /^Users-/u : /^-+/u, '');
  return cleaned.replace(/-/gu, '/').split('/').filter(Boolean).at(-1);
}

function projectNameFromRenderedText(text: string): string | undefined {
  const cwd = text.match(/(?:cwd|workdir|workspace)["':\s]+([^"'\n]+)/iu)?.[1]?.trim();
  return cwd ? path.basename(cwd) : undefined;
}

function projectNameFromRecords(records: unknown[]): string | undefined {
  for (const record of records) {
    const project = projectNameFromRecord(record);
    if (project) return project;
  }
  return undefined;
}

function projectNameFromRecord(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const value = record as Record<string, unknown>;
  const data = recordFromUnknown(value['data']);
  const payload = recordFromUnknown(value['payload']);
  const dataContext = recordFromUnknown(data?.['context']);
  const candidates = [
    value['projectName'],
    value['project'],
    value['cwd'],
    value['workDir'],
    dataContext?.['repository'],
    dataContext?.['cwd'],
    payload?.['cwd'],
    payload?.['workDir']
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    if (candidate.includes('/')) return path.basename(candidate);
    return candidate.trim();
  }
  return undefined;
}

function collectSessionRecords(value: unknown, maxRecords: number): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number): void => {
    if (out.length >= maxRecords || depth > 10 || !node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (isSessionRecord(record)) out.push(record);
    for (const key of ['messages', 'events', 'entries', 'items', 'turns', 'data', 'payload', 'message', 'response', 'content']) {
      const child = record[key];
      if (child && typeof child === 'object') visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return out;
}

function isSessionRecord(value: Record<string, unknown>): boolean {
  const role = roleFromRecord(value);
  if (['user', 'assistant', 'system', 'tool'].includes(role)) return true;
  const type = typeof value['type'] === 'string' ? value['type'] : '';
  if (/message|tool|function_call|session[._-]?start|session_meta|turn_context|reasoning/u.test(type)) return true;
  return Boolean((value['timestamp'] || value['created_at'] || value['createdAt']) && (
    typeof value['content'] === 'string'
    || typeof value['text'] === 'string'
    || typeof value['input'] === 'string'
  ));
}

function isSessionFileForRoot(root: ExternalAISessionRoot, fileName: string, absolutePath: string): boolean {
  const lower = fileName.toLowerCase();
  const source = root.source ?? root.agent;
  const posixPath = toPosix(absolutePath);
  if (source === 'claude-transcripts') {
    return lower.endsWith('.jsonl') && !lower.startsWith('agent-') && !lower.includes('warmup');
  }
  if (root.agent.startsWith('claude') || root.agent === 'codebuddy') {
    if (lower.endsWith('.jsonl')) return !lower.startsWith('agent-') || posixPath.includes('/subagents/');
    return lower.endsWith('.json');
  }
  if (root.agent === 'copilot') return lower === 'events.jsonl' || lower.endsWith('.jsonl');
  if (root.agent === 'amp') return /\.json(?:\.amptmp)?$/iu.test(lower);
  if (root.agent === 'box') return lower.endsWith('.md') && posixPath.includes('/history/');
  return lower.endsWith('.jsonl') || lower.endsWith('.json');
}

function minimumSessionFileSize(root: ExternalAISessionRoot): number {
  if (root.agent === 'box' || root.source === 'codebuddy-history') return 1;
  if (root.agent === 'codex') return 20;
  return 80;
}

function isJsonlLikeFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.jsonl');
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

function isToolLikeType(type: string): boolean {
  return /tool|function_call|execution_complete/u.test(type);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function cleanupMarkdownText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/<tool_use>[\s\S]*?<\/tool_use>/gu, ' ')
    .replace(/<tool_result>[\s\S]*?<\/tool_result>/gu, ' ')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
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
