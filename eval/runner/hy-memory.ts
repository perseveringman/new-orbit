import { randomUUID } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ContextPacket } from '../../src/shared/context';
import type { MemoryLayer, MemoryNode, MemoryStability } from '../../src/shared/memory';
import type { ConversationSession, EvalRunOptions, EvidenceHit, LoadedEvalCase, OrbitEvalOutput } from './types';
import { answerLongMemEval, answerPersona } from './answering';
import { safeSegment } from './paths';
import { overlapScore, tokens, truncate } from './text';

const execFileAsync = promisify(execFile);
const DEFAULT_VENV_DIR = path.join(homedir(), '.openclaw', 'hy-memory-venv');
const DEFAULT_PIP_INDEX = 'https://mirrors.tencent.com/pypi/simple/';
const DEFAULT_SDK_PACKAGE = 'hy-mem-internal';
const REQUEST_TIMEOUT_MS = 120_000;

interface HyMemoryRuntimeConfig {
  baseUrl: string;
  port: number;
  pythonPath?: string;
  autoStart: boolean;
  topK: number;
  minScore: number;
  userPrefix: string;
  agentId: string;
  enableAgent: boolean;
  localEmbed: boolean;
  localEmbedUrl?: string;
  localEmbedDims: number;
  keepMemories: boolean;
  runKey: string;
}

export interface HyMemoryRuntime {
  config: HyMemoryRuntimeConfig;
  close: () => Promise<void>;
}

interface HyMemoryRecord {
  content?: unknown;
  score?: unknown;
  layer?: unknown;
  memory_id?: unknown;
  id?: unknown;
  source_id?: unknown;
  session_id?: unknown;
  metadata?: unknown;
}

interface HySearchResponse {
  memories?: HyMemoryRecord[] | Record<string, HyMemoryRecord[]>;
}

interface HyAddResponse {
  success?: boolean;
  memory_id?: string;
  error_message?: string;
}

export async function createHyMemoryRuntime(options: EvalRunOptions, startedAt: string): Promise<HyMemoryRuntime> {
  const config: HyMemoryRuntimeConfig = {
    baseUrl: options.hyMemoryServerUrl.replace(/\/+$/, ''),
    port: options.hyMemoryPort,
    pythonPath: options.hyMemoryPythonPath,
    autoStart: options.hyMemoryAutoStart,
    topK: options.hyMemoryTopK,
    minScore: options.hyMemoryMinScore,
    userPrefix: options.hyMemoryUserPrefix,
    agentId: 'orbit-eval',
    enableAgent: options.hyMemoryEnableAgent,
    localEmbed: options.hyMemoryLocalEmbed,
    localEmbedDims: 256,
    keepMemories: options.keepHyMemories,
    runKey: safeSegment(startedAt).slice(0, 32)
  };

  const localEmbedServer = config.localEmbed ? await startLocalEmbeddingServer(config.localEmbedDims) : undefined;
  if (localEmbedServer) config.localEmbedUrl = localEmbedServer.baseUrl;

  let child: ChildProcess | undefined;
  if (!(await healthCheck(config.baseUrl))) {
    if (!config.autoStart) {
      throw new Error(`HY Memory 服务不可用：${config.baseUrl}。请启动服务，或去掉 --hy-no-auto-start。`);
    }
    const pythonPath = await ensureHyMemoryPython(config.pythonPath);
    child = await startHyMemoryServer({ ...config, pythonPath });
  }

  await preflight(config);
  return {
    config,
    close: async () => {
      await localEmbedServer?.close();
      if (!child) return;
      child.kill('SIGTERM');
      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2_000);
        child?.once('exit', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!exited && child.exitCode === null) child.kill('SIGKILL');
    }
  };
}

export async function runHyMemoryCase(loaded: LoadedEvalCase, runtime: HyMemoryRuntime): Promise<OrbitEvalOutput> {
  const start = Date.now();
  const userId = caseUserId(loaded, runtime.config);
  try {
    await seedHyMemoryCase(loaded.sessions, userId, runtime.config);
    const records = await searchHyMemory(loaded.question.question, {
      baseUrl: runtime.config.baseUrl,
      userId,
      limit: runtime.config.topK,
      minScore: runtime.config.minScore
    });
    const now = new Date().toISOString();
    const memories = recordsToMemoryNodes(records, loaded, now);
    const evidenceHits = recordsToEvidenceHits(records);
    const packet = buildHyPacket(loaded, memories, evidenceHits, now);
    const recall = {
      memories,
      explanation: `HY Memory returned ${memories.length} memories for this benchmark query.`,
      matches: memories.map((memory) => {
        const queryTokens = new Set(tokens(loaded.question.question));
        return {
          memory_id: memory.id,
          score: memory.confidence,
          matched_terms: tokens(memory.summary).filter((token) => queryTokens.has(token)).slice(0, 10),
          signals: {
            keyword_overlap: overlapScore(queryTokens, memory.summary),
            entity_overlap: 0,
            confidence: memory.confidence,
            stability_boost: memory.stability === 'core' ? 0.2 : memory.stability === 'stable' ? 0.1 : 0,
            recall_boost: 0,
            layer_boost: memory.layer === 'semantic' ? 0.05 : 0
          },
          reasons: ['hy-memory semantic search']
        };
      })
    };
    const answer = loaded.question.suite === 'personamem'
      ? answerPersona(loaded.question.question, loaded.question.options ?? [], packet, evidenceHits, memories.map((memory) => memory.summary))
      : answerLongMemEval(loaded.question.question, packet, evidenceHits, memories.map((memory) => memory.summary));

    return {
      answer: answer.text,
      ...(answer.option ? { selectedOption: answer.option } : {}),
      packet,
      recall,
      memories,
      evidenceHits,
      latencyMs: Date.now() - start,
      vaultPath: `hy-memory:${userId}`
    };
  } finally {
    if (!runtime.config.keepMemories) {
      await deleteHyMemories(runtime.config.baseUrl, userId).catch(() => null);
    }
  }
}

async function seedHyMemoryCase(sessions: ConversationSession[], userId: string, config: HyMemoryRuntimeConfig): Promise<void> {
  if (config.localEmbed) {
    await seedHyMemoryCombinedCase(sessions, userId, config);
    return;
  }
  for (const session of sessions) {
    const chunks = chunkSession(session, config.localEmbed);
    for (const [index, messages] of chunks.entries()) {
      const content = config.enableAgent ? { messages } : { text: transcriptMessages(messages) };
      const result = await requestJson<HyAddResponse>(`${config.baseUrl}/api/v1/add`, {
        method: 'POST',
        body: {
          user_id: userId,
          agent_id: config.agentId,
          session_id: `${session.id}:${index + 1}`,
          enable_agent: config.enableAgent,
          ...content
        }
      });
      if (result.success === false) {
        throw new Error(`HY Memory 写入失败：${result.error_message ?? 'unknown error'}`);
      }
    }
  }
}

async function seedHyMemoryCombinedCase(sessions: ConversationSession[], userId: string, config: HyMemoryRuntimeConfig): Promise<void> {
  const transcript = sessions.map((session) => {
    const turns = session.turns
      .map((turn) => `${turn.role}: ${turn.content.trim()}`)
      .filter(Boolean)
      .join('\n');
    return `Session ${session.id}${session.date ? ` (${session.date})` : ''}\n${turns}`;
  }).join('\n\n---\n\n');
  const chunks = splitLargeText(transcript, 20_000);
  for (const [index, text] of chunks.entries()) {
    const result = await requestJson<HyAddResponse>(`${config.baseUrl}/api/v1/add`, {
      method: 'POST',
      body: {
        user_id: userId,
        agent_id: config.agentId,
        session_id: `combined:${index + 1}`,
        text
      }
    });
    if (result.success === false) {
      throw new Error(`HY Memory 写入失败：${result.error_message ?? 'unknown error'}`);
    }
  }
}

async function searchHyMemory(query: string, input: { baseUrl: string; userId: string; limit: number; minScore: number }): Promise<HyMemoryRecord[]> {
  const result = await requestJson<HySearchResponse>(`${input.baseUrl}/api/v1/search`, {
    method: 'POST',
    body: {
      query,
      user_ids: [input.userId],
      limit: input.limit,
      min_score: input.minScore
    }
  });
  return extractSearchMemories(result.memories);
}

async function preflight(config: HyMemoryRuntimeConfig): Promise<void> {
  const userId = `${config.userPrefix}-preflight-${randomUUID().slice(0, 8)}`;
  try {
    const result = await requestJson<HyAddResponse>(`${config.baseUrl}/api/v1/add`, {
      method: 'POST',
      body: {
        user_id: userId,
        agent_id: config.agentId,
        session_id: 'preflight',
        enable_agent: config.enableAgent,
        text: `Orbit eval preflight ${randomUUID()}: user likes green tea.`
      }
    });
    if (result.success === false) {
      throw new Error(result.error_message ?? 'preflight add failed');
    }
    await searchHyMemory('green tea preference', {
      baseUrl: config.baseUrl,
      userId,
      limit: 3,
      minScore: 0
    });
  } catch (error) {
    throw new Error(`HY Memory 预检失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await deleteHyMemories(config.baseUrl, userId).catch(() => null);
  }
}

async function deleteHyMemories(baseUrl: string, userId: string): Promise<void> {
  await requestJson(`${baseUrl}/api/v1/delete_all`, {
    method: 'POST',
    body: { user_id: userId }
  });
}

async function requestJson<T = unknown>(url: string, options: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: options.method,
    headers: { 'content-type': 'application/json' },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${truncate(text || response.statusText, 600)}`);
  }
  return await response.json() as T;
}

async function healthCheck(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureHyMemoryPython(explicitPython?: string): Promise<string> {
  if (explicitPython) {
    await assertHyMemoryInstalled(explicitPython);
    return explicitPython;
  }
  const venvPython = path.join(DEFAULT_VENV_DIR, 'bin', 'python');
  if (existsSync(venvPython) && await hasHyMemoryModule(venvPython)) return venvPython;

  const sysPython = await findPython();
  if (!existsSync(path.join(DEFAULT_VENV_DIR, 'bin'))) {
    await fs.mkdir(DEFAULT_VENV_DIR, { recursive: true });
    await execFileAsync(sysPython, ['-m', 'venv', DEFAULT_VENV_DIR], { timeout: 30_000 });
  }
  await execFileAsync(venvPython, ['-m', 'pip', 'install', '--quiet', '--index-url', DEFAULT_PIP_INDEX, DEFAULT_SDK_PACKAGE], { timeout: 300_000 });
  await assertHyMemoryInstalled(venvPython);
  return venvPython;
}

async function findPython(): Promise<string> {
  for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3', 'python3']) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 5_000 });
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error('找不到可用的 python3。');
}

async function assertHyMemoryInstalled(pythonPath: string): Promise<void> {
  if (await hasHyMemoryModule(pythonPath)) return;
  throw new Error(`${pythonPath} 中没有 hy_memory.server，请先安装 ${DEFAULT_SDK_PACKAGE}。`);
}

async function hasHyMemoryModule(pythonPath: string): Promise<boolean> {
  try {
    await execFileAsync(pythonPath, ['-c', 'import hy_memory.server'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function startHyMemoryServer(config: HyMemoryRuntimeConfig & { pythonPath: string }): Promise<ChildProcess> {
  console.log(`Starting HY Memory server at ${config.baseUrl}`);
  const child = spawn(config.pythonPath, ['-m', 'hy_memory.server', '--port', String(config.port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildServerEnv(config)
  });
  const stderrLines: string[] = [];
  child.stderr?.on('data', (data) => {
    const text = String(data).trim();
    if (!text) return;
    stderrLines.push(...text.split('\n').slice(-8));
    while (stderrLines.length > 20) stderrLines.shift();
    if (process.env.HY_MEMORY_EVAL_DEBUG) {
      for (const line of text.split('\n').slice(-4)) console.warn(`[hy-memory] ${truncate(line, 500)}`);
    }
  });

  const ok = await waitForServer(config.baseUrl, child, 45_000);
  if (!ok) {
    child.kill('SIGTERM');
    throw new Error(`HY Memory 服务启动失败：${stderrLines.slice(-6).join('\n') || 'health check timeout'}`);
  }
  return child;
}

async function waitForServer(baseUrl: string, child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    if (await healthCheck(baseUrl)) return true;
    await sleep(1_000);
  }
  return false;
}

function buildServerEnv(config: HyMemoryRuntimeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  applyOpenClawConfig(env);
  if (config.localEmbedUrl) {
    env.MEMORY_MODE = 'pro';
    env.MEMORY_LLM_PROVIDER = 'openai';
    env.MEMORY_LLM_MODEL = 'orbit-local-heuristic-chat';
    env.MEMORY_LLM_API_KEY = 'local';
    env.MEMORY_LLM_BASE_URL = config.localEmbedUrl;
    env.MEMORY_LLM_TEMPERATURE = '0';
    env.MEMORY_AGENT_MAX_TOKENS = '1200';
    env.MEMORY_ENABLE_SEARCH_QUERY = 'false';
    env.MEMORY_EMBEDDER_PROVIDER = 'openai';
    env.MEMORY_EMBEDDER_MODEL = 'orbit-local-hash-embedding';
    env.MEMORY_EMBEDDER_API_KEY = 'local';
    env.MEMORY_EMBEDDER_BASE_URL = config.localEmbedUrl;
    env.MEMORY_EMBEDDING_DIMS = String(config.localEmbedDims);
    env.MEMORY_VECTOR_STORE = 'chroma';
    env.MEMORY_COLLECTION_NAME = `orbit_eval_local_${config.localEmbedDims}d`;
    env.MEMORY_PERSIST_DIR = path.resolve(process.cwd(), 'eval', '.tmp', 'hy-memory-local');
  }
  env.MEMORY_ENABLE_AGENT = env.MEMORY_ENABLE_AGENT ?? 'true';
  env.MEMORY_ENABLE_GRAPH = env.MEMORY_ENABLE_GRAPH ?? 'false';
  env.MEMORY_ENABLE_HYDE_QUERY = env.MEMORY_ENABLE_HYDE_QUERY ?? 'false';
  env.MEMORY_CACHE_BACKEND = env.MEMORY_CACHE_BACKEND ?? 'sqlite';
  env.MEMORY_ENABLE_SUMMARY = env.MEMORY_ENABLE_SUMMARY ?? 'false';
  env.MEMORY_VECTOR_STORE = env.MEMORY_VECTOR_STORE ?? 'chroma';
  env.MEMORY_COLLECTION_NAME = env.MEMORY_COLLECTION_NAME ?? 'orbit_eval';
  env.MEMORY_PERSIST_DIR = env.MEMORY_PERSIST_DIR ?? path.resolve(process.cwd(), 'eval', '.tmp', 'hy-memory');
  env.PORT = String(config.port);
  return env;
}

async function startLocalEmbeddingServer(dims: number): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    void handleLocalOpenAIRequest(request, response, dims);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('local_embedding_server_no_port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => closeServer(server)
  };
}

async function handleLocalOpenAIRequest(request: IncomingMessage, response: ServerResponse, dims: number): Promise<void> {
  try {
    if (request.method !== 'POST') {
      writeJson(response, 404, { error: { message: 'not found' } });
      return;
    }
    const body = await readRequestBody(request);
    if (request.url === '/v1/chat/completions') {
      const parsed = JSON.parse(body || '{}') as { messages?: Array<{ role?: string; content?: string }>; model?: string };
      const prompt = parsed.messages?.map((message) => message.content ?? '').filter(Boolean).join('\n') ?? '';
      const content = localChatCompletion(prompt);
      writeJson(response, 200, {
        id: `chatcmpl-${randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: parsed.model ?? 'orbit-local-heuristic-chat',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: tokens(prompt).length,
          completion_tokens: tokens(content).length,
          total_tokens: tokens(prompt).length + tokens(content).length
        }
      });
      return;
    }
    if (request.url !== '/v1/embeddings') {
      writeJson(response, 404, { error: { message: 'not found' } });
      return;
    }
    const parsed = JSON.parse(body || '{}') as { input?: string | string[]; model?: string; dimensions?: number };
    const inputs = Array.isArray(parsed.input) ? parsed.input : [String(parsed.input ?? '')];
    const embeddingDims = Number.isFinite(parsed.dimensions) && parsed.dimensions ? Number(parsed.dimensions) : dims;
    writeJson(response, 200, {
      object: 'list',
      model: parsed.model ?? 'orbit-local-hash-embedding',
      data: inputs.map((input, index) => ({
        object: 'embedding',
        index,
        embedding: localEmbedding(input, embeddingDims)
      })),
      usage: {
        prompt_tokens: inputs.reduce((sum, input) => sum + tokens(input).length, 0),
        total_tokens: inputs.reduce((sum, input) => sum + tokens(input).length, 0)
      }
    });
  } catch (error) {
    writeJson(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
  }
}

function localChatCompletion(prompt: string): string {
  if (/search query generator|Output JSON array only/i.test(prompt)) {
    const terms = Array.from(new Set(tokens(prompt))).slice(0, 12);
    return JSON.stringify(terms.length ? terms : ['memory']);
  }
  if (/memory management system|Operation primitives|New memories to integrate/i.test(prompt)) {
    const memories = extractNumberedBlock(prompt, 'New memories to integrate', 'Operation primitives');
    const ops = memories.map((memory) => ({
      op: 'ADD',
      content: memory,
      layer: 'L2_FACT',
      supersedes: [],
      tags: inferTags(memory),
      reason: 'Local eval model keeps imported benchmark evidence as a retrievable memory.'
    }));
    return fencedJson(ops);
  }
  const source = extractConversationContent(prompt);
  const compact = truncate(source || prompt, 30_000);
  const tags = inferTags(compact);
  return fencedJson({
    identity: [
      {
        content: `The user has conversation context that may be relevant later: ${compact}`,
        speculate: null,
        tags
      }
    ],
    facts: [
      {
        content: `The user discussed or experienced the following: ${compact}`,
        speculate: null,
        tags
      }
    ]
  });
}

function extractConversationContent(prompt: string): string {
  const matches = [...prompt.matchAll(/---\n([\s\S]*?)\n---/g)];
  return matches[0]?.[1]?.trim() ?? '';
}

function extractNumberedBlock(prompt: string, startLabel: string, endLabel: string): string[] {
  const start = prompt.indexOf(startLabel);
  if (start < 0) return [];
  const afterStart = prompt.slice(start + startLabel.length);
  const end = afterStart.indexOf(endLabel);
  const block = (end >= 0 ? afterStart.slice(0, end) : afterStart).trim();
  const parts = block
    .split(/\n(?=\d+\.\s)/)
    .map((item) => item.replace(/^\d+\.\s*/, '').replace(/\n\s*tags:\s*.*$/is, '').trim())
    .filter(Boolean);
  return parts.slice(0, 8).map((item) => truncate(item, 30_000));
}

function inferTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];
  if (/\bmusic|sound|song|festival|beat|artist|concert\b/.test(lower)) tags.push('music');
  if (/\bfood|cook|restaurant|meal|recipe\b/.test(lower)) tags.push('food');
  if (/\bwork|job|engineer|project|office\b/.test(lower)) tags.push('work');
  if (/\btravel|trip|city|island|beach|flight\b/.test(lower)) tags.push('travel');
  if (/\bfamily|friend|community|social\b/.test(lower)) tags.push('social');
  if (!tags.length) tags.push('general');
  return tags.slice(0, 3);
}

function fencedJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function localEmbedding(text: string, dims: number): number[] {
  const vector = Array.from({ length: dims }, () => 0);
  const terms = tokens(text);
  for (const term of terms) {
    const hash = fnv1a(term);
    const index = hash % dims;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(3, term.length / 8));
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload)
  });
  response.end(payload);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function applyOpenClawConfig(env: NodeJS.ProcessEnv): void {
  const configPath = path.join(homedir(), '.openclaw', 'openclaw.json');
  try {
    const parsed = JSON.parse(readFileSyncUtf8(configPath)) as unknown;
    const cfg = getRecord(getRecord(getRecord(parsed, 'plugins'), 'entries'), 'openclaw-hy-memory');
    const pluginConfig = getRecord(cfg, 'config');
    applyProviderEnv(env, 'MEMORY_LLM', getRecord(pluginConfig, 'llm'));
    applyProviderEnv(env, 'MEMORY_EMBEDDER', getRecord(pluginConfig, 'embedder'));
    const vector = getRecord(pluginConfig, 'vectorStore');
    maybeSet(env, 'MEMORY_VECTOR_STORE', stringValue(vector.provider));
    maybeSet(env, 'MEMORY_VECTOR_HOST', stringValue(vector.host));
    maybeSet(env, 'MEMORY_VECTOR_PORT', numberValue(vector.port));
    maybeSet(env, 'MEMORY_VECTOR_API_KEY', stringValue(vector.apiKey));
    maybeSet(env, 'MEMORY_COLLECTION_NAME', stringValue(vector.collectionName));
    maybeSet(env, 'MEMORY_PERSIST_DIR', stringValue(vector.persistDirectory));
  } catch {
    return;
  }
}

function applyProviderEnv(env: NodeJS.ProcessEnv, prefix: 'MEMORY_LLM' | 'MEMORY_EMBEDDER', provider: Record<string, unknown>): void {
  maybeSet(env, `${prefix}_PROVIDER`, stringValue(provider.provider));
  maybeSet(env, `${prefix}_MODEL`, stringValue(provider.model));
  maybeSet(env, `${prefix}_API_KEY`, stringValue(provider.apiKey));
  maybeSet(env, `${prefix}_BASE_URL`, stringValue(provider.baseUrl));
  maybeSet(env, `${prefix}_EVAL_USER`, stringValue(provider.evalUser));
  maybeSet(env, `${prefix}_EVAL_APIKEY`, stringValue(provider.evalApikey));
  maybeSet(env, `${prefix}_TEMPERATURE`, numberValue(provider.temperature));
  maybeSet(env, `${prefix}_MAX_TOKENS`, numberValue(provider.maxTokens));
  if (prefix === 'MEMORY_LLM') maybeSet(env, 'HY_MEMORY_THINKING_MODE', stringValue(provider.thinkingMode));
  const extraHeaders = jsonValue(provider.extraHeaders);
  const extraBody = jsonValue(provider.extraBody);
  if (extraHeaders) maybeSet(env, `${prefix}_EXTRA_HEADERS`, extraHeaders);
  if (extraBody) maybeSet(env, `${prefix}_EXTRA_BODY`, extraBody);
}

function maybeSet(env: NodeJS.ProcessEnv, key: string, value?: string): void {
  if (!value || env[key]) return;
  env[key] = value;
}

function getRecord(value: unknown, key?: string): Record<string, unknown> {
  const candidate = key && value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : value;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberValue(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

function jsonValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return JSON.stringify(value);
}

function readFileSyncUtf8(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function chunkSession(session: ConversationSession, preferLargeChunks: boolean): Array<Array<{ role: string; content: string }>> {
  const maxChars = preferLargeChunks ? 80_000 : 14_000;
  const maxTurns = preferLargeChunks ? 200 : 24;
  const turns = session.turns.flatMap((turn) => splitTurn(turn.role, turn.content, Math.max(12_000, maxChars)));
  const chunks: Array<Array<{ role: string; content: string }>> = [];
  let current: Array<{ role: string; content: string }> = [];
  let currentChars = 0;
  for (const turn of turns) {
    if (current.length && (current.length >= maxTurns || currentChars + turn.content.length > maxChars)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(turn);
    currentChars += turn.content.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function splitTurn(role: string, content: string, maxChars: number): Array<{ role: string; content: string }> {
  const compact = content.trim();
  if (!compact) return [];
  const chunks: Array<{ role: string; content: string }> = [];
  for (let index = 0; index < compact.length; index += maxChars) {
    chunks.push({ role, content: compact.slice(index, index + maxChars) });
  }
  return chunks;
}

function splitLargeText(content: string, maxChars: number): string[] {
  const compact = content.trim();
  if (!compact) return [];
  const chunks: string[] = [];
  for (let index = 0; index < compact.length; index += maxChars) {
    chunks.push(compact.slice(index, index + maxChars));
  }
  return chunks;
}

function transcriptMessages(messages: Array<{ role: string; content: string }>): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
}

function recordsToMemoryNodes(records: HyMemoryRecord[], loaded: LoadedEvalCase, now: string): MemoryNode[] {
  return records.map((record, index) => {
    const content = recordContent(record);
    const score = scoreValue(record.score);
    const id = String(record.memory_id ?? record.id ?? `hy-${loaded.question.questionId}-${index + 1}`);
    return {
      id,
      layer: layerValue(record.layer),
      kind: loaded.question.suite === 'personamem' ? 'preference' : 'entity_memory',
      title: truncate(content, 90) || `HY Memory ${index + 1}`,
      summary: content,
      detail: content,
      sources: [
        {
          kind: 'raw',
          ref: sourceId(record),
          title: 'HY Memory search result',
          excerpt: truncate(content, 240),
          metadata: { score }
        }
      ],
      evidence_count: 1,
      confidence: score,
      stability: stabilityValue(score),
      recall_count: 1,
      created_at: now,
      updated_at: now,
      last_recalled_at: now
    };
  });
}

function recordsToEvidenceHits(records: HyMemoryRecord[]): EvidenceHit[] {
  return records.map((record, index) => ({
    sourceId: sourceId(record),
    title: `HY Memory ${index + 1}`,
    score: scoreValue(record.score),
    why: 'hy-memory semantic search',
    text: recordContent(record)
  }));
}

function buildHyPacket(loaded: LoadedEvalCase, memories: MemoryNode[], evidenceHits: EvidenceHit[], now: string): ContextPacket {
  const content = memories.map((memory, index) => `${index + 1}. ${memory.summary}`).join('\n');
  return {
    id: `hy-packet-${safeSegment(loaded.question.questionId)}-${randomUUID().slice(0, 8)}`,
    purpose: 'ask',
    scope: { kind: 'global' },
    query: loaded.question.question,
    generated_at: now,
    freshness: { evidence_until: now },
    budget: { max_tokens: 3200, estimated_tokens: Math.ceil(content.length / 4) },
    sections: content
      ? [
        {
          kind: 'memories',
          title: 'HY Memory Search',
          content,
          citations: [],
          priority: 20
        }
      ]
      : [],
    evidence: [],
    synthesis_refs: [],
    memory_refs: memories.map((memory) => memory.id)
  };
}

function caseUserId(loaded: LoadedEvalCase, config: HyMemoryRuntimeConfig): string {
  return [safeSegment(config.userPrefix).slice(0, 16), config.runKey.slice(0, 16), loaded.question.suite, safeSegment(loaded.question.questionId).slice(0, 32)]
    .join('-')
    .slice(0, 80);
}

function extractSearchMemories(value: HySearchResponse['memories']): HyMemoryRecord[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return ['profile', 'proactive', 'normal']
    .flatMap((key) => {
      const items = value[key];
      return Array.isArray(items) ? items : [];
    });
}

function recordContent(record: HyMemoryRecord): string {
  if (typeof record.content === 'string') return record.content;
  const metadata = getRecord(record.metadata);
  if (typeof metadata.content === 'string') return metadata.content;
  return '';
}

function sourceId(record: HyMemoryRecord): string {
  const direct = record.source_id ?? record.session_id ?? record.memory_id ?? record.id;
  return `hy:${typeof direct === 'string' || typeof direct === 'number' ? String(direct) : randomUUID().slice(0, 8)}`;
}

function scoreValue(value: unknown): number {
  const score = typeof value === 'number' && Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, score));
}

function layerValue(value: unknown): MemoryLayer {
  return value === 'episodic' || value === 'procedural' || value === 'semantic' ? value : 'semantic';
}

function stabilityValue(score: number): MemoryStability {
  if (score >= 0.88) return 'core';
  if (score >= 0.62) return 'stable';
  return 'volatile';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
