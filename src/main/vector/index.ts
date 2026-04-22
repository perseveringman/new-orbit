import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import { EMBED_DIM, cosine } from './embed';

/**
 * Vector store backed by a pure-JS, in-memory `Map` persisted as JSON.
 *
 * The native sqlite-vss / sqlite-vec path was evaluated and intentionally
 * deferred: both fail to prebuild reliably against Electron's ABI on
 * macOS arm64 without shipping extra binaries. The JS fallback is
 * deterministic, cross-platform, and sufficient for vault-scale corpora
 * (O(10k) vectors). The `VectorStore` interface is the only public
 * contract — a future sqlite-backed implementation only needs to satisfy
 * the same methods.
 */

export type VectorKind = 'resource' | 'project' | 'archive';

export interface VectorMeta {
  uid: string;
  kind: VectorKind;
  relPath: string;
  title: string;
  excerpt: string;
}

export interface VectorRecord extends VectorMeta {
  id: string;
  embedding: Float32Array;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  meta: VectorMeta;
}

export interface VectorStoreFilter {
  kind?: VectorKind | VectorKind[];
}

interface PersistedRecord {
  id: string;
  uid: string;
  kind: VectorKind;
  relPath: string;
  title: string;
  excerpt: string;
  embedding: number[];
}

interface PersistedFile {
  dim: number;
  records: PersistedRecord[];
}

export const VECTOR_STORE_FILE = 'vectors.json';

export class VectorStore {
  private readonly vault: string;
  private readonly records: Map<string, VectorRecord> = new Map();
  private loaded = false;
  private dirty = false;
  private persistPath: string;

  constructor(vault: string) {
    this.vault = vault;
    this.persistPath = path.join(vault, ORBIT_DIR, VECTOR_STORE_FILE);
  }

  /** Load persisted vectors from disk. Silent on missing file. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.persistPath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedFile;
      if (!parsed || !Array.isArray(parsed.records)) return;
      for (const r of parsed.records) {
        if (!r || typeof r.id !== 'string' || !Array.isArray(r.embedding)) continue;
        this.records.set(r.id, {
          id: r.id,
          uid: r.uid,
          kind: r.kind,
          relPath: r.relPath,
          title: r.title,
          excerpt: r.excerpt ?? '',
          embedding: Float32Array.from(r.embedding)
        });
      }
    } catch {
      // no persisted file yet — fine
    }
  }

  upsert(rec: {
    id: string;
    uid: string;
    kind: VectorKind;
    relPath: string;
    title: string;
    excerpt: string;
    embedding: Float32Array;
  }): void {
    if (!rec.id) throw new Error('VectorStore.upsert: id required');
    if (rec.embedding.length !== EMBED_DIM) {
      // still allow but track the provided length — keeps the interface open.
    }
    this.records.set(rec.id, {
      id: rec.id,
      uid: rec.uid,
      kind: rec.kind,
      relPath: rec.relPath,
      title: rec.title,
      excerpt: rec.excerpt,
      embedding: rec.embedding
    });
    this.dirty = true;
  }

  remove(id: string): boolean {
    const had = this.records.delete(id);
    if (had) this.dirty = true;
    return had;
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  size(): number {
    return this.records.size;
  }

  list(): VectorRecord[] {
    return [...this.records.values()];
  }

  /**
   * Rank all records by cosine similarity to `query` and return the
   * top `k` hits passing `filter`. Returns in strictly descending score
   * order; ties are broken by `id` for determinism.
   */
  search(
    query: Float32Array,
    k = 3,
    filter?: VectorStoreFilter
  ): VectorSearchHit[] {
    const kinds = toKindSet(filter?.kind);
    const hits: VectorSearchHit[] = [];
    for (const rec of this.records.values()) {
      if (kinds && !kinds.has(rec.kind)) continue;
      const score = cosine(query, rec.embedding);
      hits.push({
        id: rec.id,
        score,
        meta: {
          uid: rec.uid,
          kind: rec.kind,
          relPath: rec.relPath,
          title: rec.title,
          excerpt: rec.excerpt
        }
      });
    }
    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });
    return hits.slice(0, k);
  }

  /** Persist records as a JSON file under `.orbit/`. Idempotent. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    await fs.mkdir(path.dirname(this.persistPath), { recursive: true });
    const data: PersistedFile = {
      dim: EMBED_DIM,
      records: [...this.records.values()].map((r) => ({
        id: r.id,
        uid: r.uid,
        kind: r.kind,
        relPath: r.relPath,
        title: r.title,
        excerpt: r.excerpt,
        embedding: Array.from(r.embedding)
      }))
    };
    const tmp = `${this.persistPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, this.persistPath);
    this.dirty = false;
  }

  /** Drop all records. Mostly useful for full reindex operations. */
  clear(): void {
    if (this.records.size === 0) return;
    this.records.clear();
    this.dirty = true;
  }
}

function toKindSet(
  kind: VectorKind | VectorKind[] | undefined
): Set<VectorKind> | null {
  if (!kind) return null;
  return Array.isArray(kind) ? new Set(kind) : new Set([kind]);
}
