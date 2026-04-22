import { promises as fs, createWriteStream, WriteStream } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_LOGS_DIR } from '@shared/constants';
import { toPosix, vaultRel } from '../pathGuard';
import { walkMarkdown } from '../walk';
import * as frontmatter from '../frontmatter';
import { getEmbedder } from './embed';
import type { VectorKind } from './index';
import { VectorStore } from './index';

export const VECTOR_LOG = 'vector.log';

const INDEX_PREFIXES: Array<{ prefix: string; kind: VectorKind }> = [
  { prefix: '03_Resources/', kind: 'resource' },
  { prefix: '04_Archives/', kind: 'archive' },
  { prefix: '01_Projects/', kind: 'project' }
];

function classifyRel(rel: string): VectorKind | null {
  for (const { prefix, kind } of INDEX_PREFIXES) {
    if (rel.startsWith(prefix)) return kind;
  }
  return null;
}

/** Build the embedding input: title + body, truncated to 4k chars. */
function embedInputOf(
  title: string,
  body: string,
  fmTags: string[] | undefined
): string {
  const tagLine = (fmTags ?? []).join(' ');
  const head = body.slice(0, 4000);
  return `${title}\n${tagLine}\n${head}`.trim();
}

function excerptOf(body: string): string {
  const stripped = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 200);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asStringArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string') out.push(x);
  return out;
}

export interface IndexerEvent {
  at: string;
  kind: 'upsert' | 'remove' | 'skip' | 'batch' | 'done' | 'error';
  relPath?: string;
  message?: string;
  count?: number;
}

export interface VectorIndexer {
  /** Enqueue a single file for (re)indexing. Async, non-blocking. */
  queue(absPath: string): void;
  /** Drop a file from the index by absolute path. */
  removeByAbs(absPath: string): void;
  /** Walk the vault + enqueue every indexable file. */
  rebuildAll(): Promise<void>;
  /** Wait for the current queue to drain. Tests call this before asserting. */
  drain(): Promise<void>;
  /** Stop processing, flush, close the log. */
  dispose(): Promise<void>;
}

interface IndexerOpts {
  /** Batch size: how many files processed back-to-back before yielding. */
  batchSize?: number;
  /** Test hook — log events through this callback in addition to file. */
  onEvent?: (ev: IndexerEvent) => void;
}

export function createIndexer(
  vault: string,
  store: VectorStore,
  opts: IndexerOpts = {}
): VectorIndexer {
  const batchSize = opts.batchSize ?? 10;
  const queue: string[] = [];
  const queued = new Set<string>();
  let draining: Promise<void> | null = null;
  let disposed = false;
  let log: WriteStream | null = null;

  async function openLog(): Promise<void> {
    if (log) return;
    const dir = path.join(vault, ORBIT_DIR, ORBIT_LOGS_DIR);
    await fs.mkdir(dir, { recursive: true });
    log = createWriteStream(path.join(dir, VECTOR_LOG), { flags: 'a' });
  }

  function emit(ev: IndexerEvent): void {
    opts.onEvent?.(ev);
    if (log) log.write(`${JSON.stringify(ev)}\n`);
  }

  async function processOne(abs: string): Promise<void> {
    const rel = toPosix(vaultRel(vault, abs));
    const kind = classifyRel(rel);
    if (!kind) {
      emit({ at: new Date().toISOString(), kind: 'skip', relPath: rel });
      return;
    }
    try {
      const raw = await fs.readFile(abs, 'utf8');
      const { data, body } = frontmatter.read(raw);
      const uid = asString(data['uid']);
      if (!uid) {
        emit({ at: new Date().toISOString(), kind: 'skip', relPath: rel, message: 'no uid' });
        return;
      }
      const title =
        asString(data['title']) ?? path.basename(rel, '.md');
      const tags = asStringArr(data['tags']);
      const input = embedInputOf(title, body, tags);
      const embedding = getEmbedder().embed(input);
      store.upsert({
        id: rel,
        uid,
        kind,
        relPath: rel,
        title,
        excerpt: excerptOf(body),
        embedding
      });
      emit({ at: new Date().toISOString(), kind: 'upsert', relPath: rel });
    } catch (e) {
      emit({
        at: new Date().toISOString(),
        kind: 'error',
        relPath: rel,
        message: (e as Error).message
      });
    }
  }

  async function drainLoop(): Promise<void> {
    await openLog();
    while (!disposed && queue.length > 0) {
      const batch = queue.splice(0, batchSize);
      for (const abs of batch) queued.delete(abs);
      for (const abs of batch) {
        if (disposed) break;
        await processOne(abs);
      }
      emit({
        at: new Date().toISOString(),
        kind: 'batch',
        count: batch.length
      });
      await store.flush();
      // Yield to the event loop so UI / IPC stay responsive.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  function ensureDraining(): void {
    if (draining) return;
    draining = drainLoop()
      .catch((e) => {
        emit({
          at: new Date().toISOString(),
          kind: 'error',
          message: (e as Error).message
        });
      })
      .finally(() => {
        draining = null;
      });
  }

  return {
    queue(abs: string): void {
      if (disposed) return;
      if (queued.has(abs)) return;
      queued.add(abs);
      queue.push(abs);
      ensureDraining();
    },
    removeByAbs(abs: string): void {
      const rel = toPosix(vaultRel(vault, abs));
      if (store.remove(rel)) {
        emit({ at: new Date().toISOString(), kind: 'remove', relPath: rel });
        void store.flush();
      }
    },
    async rebuildAll(): Promise<void> {
      for await (const abs of walkMarkdown(vault)) {
        const rel = toPosix(vaultRel(vault, abs));
        if (!classifyRel(rel)) continue;
        if (disposed) return;
        if (!queued.has(abs)) {
          queued.add(abs);
          queue.push(abs);
        }
      }
      ensureDraining();
      await draining;
      emit({
        at: new Date().toISOString(),
        kind: 'done',
        count: store.size()
      });
    },
    async drain(): Promise<void> {
      if (draining) await draining;
    },
    async dispose(): Promise<void> {
      disposed = true;
      if (draining) {
        try {
          await draining;
        } catch {
          // ignore
        }
      }
      await store.flush();
      const s = log;
      log = null;
      await new Promise<void>((resolve) => {
        if (!s) resolve();
        else s.end(() => resolve());
      });
    }
  };
}
