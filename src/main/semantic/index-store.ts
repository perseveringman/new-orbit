import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type { EmbeddingRecord, SemanticDocument, SemanticIndexFile, SemanticIndexStatus } from '@shared/semantic';
import { normalizeSearchQuery, type SearchQuery, type SearchResult } from '@shared/semantic';
import { publishTraceableEvent } from '../events/bus';
import { bufferToVector, contentHash, embedText, LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL, vectorToBuffer } from './embedder';
import { collectSemanticDocuments } from './document-projectors';
import { hybridSearch } from './hybrid-search';

export interface IndexedSemanticDocument {
  doc: SemanticDocument;
  embedding: EmbeddingRecord;
  vector: Float32Array;
}

export class SemanticIndexStore {
  constructor(private readonly vaultPath: string) {}

  async rebuildIndex(): Promise<SemanticIndexStatus> {
    const docs = await collectSemanticDocuments(this.vaultPath);
    await fs.mkdir(this.docsDir(), { recursive: true });
    await fs.mkdir(this.vectorsDir(), { recursive: true });
    const current = await this.readIndex();
    const next: SemanticIndexFile = {
      version: 1,
      docs: {},
      embedding_model: LOCAL_EMBEDDING_MODEL,
      embedding_dimensions: LOCAL_EMBEDDING_DIMENSIONS,
      last_indexed_at: new Date().toISOString()
    };

    const liveIds = new Set(docs.map((doc) => doc.id));
    await Promise.all(
      docs.map(async (doc) => {
        const hash = contentHash(documentText(doc));
        const existing = current.docs[doc.id];
        const vectorPath = this.vectorPath(doc.id);
        const needsEmbedding = !existing || existing.content_hash !== hash || existing.stale || !(await exists(vectorPath));
        let embeddedAt = existing?.embedded_at;
        if (needsEmbedding) {
          const embedding = await embedText(documentText(doc));
          await fs.writeFile(vectorPath, vectorToBuffer(embedding.vector));
          embeddedAt = new Date().toISOString();
        }
        await fs.writeFile(this.docPath(doc.id), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        next.docs[doc.id] = { content_hash: hash, embedded_at: embeddedAt };
      })
    );

    for (const docId of Object.keys(current.docs)) {
      if (liveIds.has(docId)) continue;
      next.docs[docId] = { ...current.docs[docId], removed: true };
      await fs.rm(this.docPath(docId), { force: true }).catch(() => undefined);
      await fs.rm(this.vectorPath(docId), { force: true }).catch(() => undefined);
    }
    await this.writeIndex(next);
    publishTraceableEvent({
      source: 'synthesis',
      type: 'semantic.index.rebuilt',
      summary: `Semantic index rebuilt: ${docs.length} documents`,
      payload: { total_docs: docs.length, indexed_docs: docs.length }
    });
    return this.status();
  }

  async markAllStale(reason: string): Promise<void> {
    const index = await this.readIndex();
    for (const docId of Object.keys(index.docs)) {
      if (!index.docs[docId].removed) index.docs[docId].stale = true;
    }
    await this.writeIndex(index);
    publishTraceableEvent({
      source: 'synthesis',
      type: 'semantic.index.stale',
      summary: `Semantic index marked stale: ${reason}`,
      payload: { reason }
    });
  }

  async status(): Promise<SemanticIndexStatus> {
    const index = await this.readIndex();
    const docs = Object.values(index.docs).filter((doc) => !doc.removed);
    return {
      total_docs: docs.length,
      indexed_docs: docs.filter((doc) => Boolean(doc.embedded_at) && !doc.stale).length,
      stale_docs: docs.filter((doc) => doc.stale).length,
      last_indexed_at: index.last_indexed_at,
      embedding_model: index.embedding_model,
      embedding_dimensions: index.embedding_dimensions
    };
  }

  async getDocument(docId: string): Promise<SemanticDocument> {
    const raw = await fs.readFile(this.docPath(docId), 'utf8');
    return JSON.parse(raw) as SemanticDocument;
  }

  async search(query: SearchQuery): Promise<{ results: SearchResult[]; total: number }> {
    const normalized = normalizeSearchQuery(query);
    const status = await this.status();
    if (status.total_docs === 0 || status.stale_docs > 0) await this.rebuildIndex();
    const docs = await this.loadIndexedDocuments();
    const results = await hybridSearch(docs, normalized);
    publishTraceableEvent({
      source: 'synthesis',
      type: 'semantic.search.executed',
      summary: `Semantic search: ${normalized.text || '(empty query)'}`,
      payload: { query: normalized, total: results.length }
    });
    return { results, total: results.length };
  }

  async loadIndexedDocuments(): Promise<IndexedSemanticDocument[]> {
    const index = await this.readIndex();
    const entries = await Promise.all(
      Object.entries(index.docs)
        .filter(([, meta]) => !meta.removed)
        .map(async ([docId, meta]) => {
          const [docRaw, vectorRaw] = await Promise.all([
            fs.readFile(this.docPath(docId), 'utf8').catch(() => null),
            fs.readFile(this.vectorPath(docId)).catch(() => null)
          ]);
          if (!docRaw || !vectorRaw || !meta.embedded_at) return null;
          const doc = JSON.parse(docRaw) as SemanticDocument;
          return {
            doc,
            embedding: {
              doc_id: docId,
              model: index.embedding_model,
              dimensions: index.embedding_dimensions,
              vector_file: path.relative(this.semanticDir(), this.vectorPath(docId)),
              content_hash: meta.content_hash,
              embedded_at: meta.embedded_at
            },
            vector: bufferToVector(vectorRaw)
          };
        })
    );
    return entries.filter((entry): entry is IndexedSemanticDocument => Boolean(entry));
  }

  private semanticDir(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'semantic');
  }

  private docsDir(): string {
    return path.join(this.semanticDir(), 'docs');
  }

  private vectorsDir(): string {
    return path.join(this.semanticDir(), 'vectors');
  }

  private indexPath(): string {
    return path.join(this.semanticDir(), 'index.json');
  }

  private docPath(docId: string): string {
    return path.join(this.docsDir(), `${safeFileName(docId)}.json`);
  }

  private vectorPath(docId: string): string {
    return path.join(this.vectorsDir(), `${safeFileName(docId)}.bin`);
  }

  private async readIndex(): Promise<SemanticIndexFile> {
    try {
      const raw = await fs.readFile(this.indexPath(), 'utf8');
      const parsed = JSON.parse(raw) as SemanticIndexFile;
      return {
        version: 1,
        docs: parsed.docs ?? {},
        embedding_model: parsed.embedding_model ?? LOCAL_EMBEDDING_MODEL,
        embedding_dimensions: parsed.embedding_dimensions ?? LOCAL_EMBEDDING_DIMENSIONS,
        last_indexed_at: parsed.last_indexed_at
      };
    } catch (error) {
      if (isNotFound(error)) {
        return {
          version: 1,
          docs: {},
          embedding_model: LOCAL_EMBEDDING_MODEL,
          embedding_dimensions: LOCAL_EMBEDDING_DIMENSIONS
        };
      }
      throw error;
    }
  }

  private async writeIndex(index: SemanticIndexFile): Promise<void> {
    await fs.mkdir(this.semanticDir(), { recursive: true });
    await fs.writeFile(this.indexPath(), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
}

export function createSemanticIndexStore(vaultPath: string): SemanticIndexStore {
  return new SemanticIndexStore(vaultPath);
}

function safeFileName(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function documentText(doc: SemanticDocument): string {
  return [doc.title, doc.tags?.join(' '), doc.areas?.join(' '), doc.resource_refs?.join(' '), doc.content].filter(Boolean).join('\n');
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
