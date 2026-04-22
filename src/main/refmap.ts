import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR, ORBIT_REFMAP } from '@shared/constants';
import { ensureUid, parseFrontmatter } from './uid';
import { toPosix, vaultRel } from './pathGuard';
import { walkMarkdown } from './walk';
import { contentHash } from './content_hash';

/**
 * On-disk refmap is a map of uid → either a bare relative path (legacy) or an
 * entry object carrying the path plus ancillary metadata. Legacy string form
 * is still accepted on load; the store writes objects from v3+.
 */
export interface RefmapEntry {
  rel: string;
  content_hash?: string;
}

export type Refmap = Record<string, string | RefmapEntry>;

function refmapFile(vault: string): string {
  return path.join(vault, ORBIT_DIR, ORBIT_REFMAP);
}

async function atomicWriteJson(p: string, data: unknown): Promise<void> {
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, p);
}

export class RefmapStore {
  private readonly vault: string;
  private uidToRel: Map<string, string> = new Map();
  private relToUid: Map<string, string> = new Map();
  private uidToHash: Map<string, string> = new Map();
  private hashToUids: Map<string, Set<string>> = new Map();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(vault: string) {
    this.vault = vault;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(refmapFile(this.vault), 'utf8');
      const parsed = JSON.parse(raw) as Refmap;
      this.uidToRel.clear();
      this.relToUid.clear();
      this.uidToHash.clear();
      this.hashToUids.clear();
      for (const [uid, entry] of Object.entries(parsed)) {
        if (typeof entry === 'string') {
          this.uidToRel.set(uid, entry);
          this.relToUid.set(entry, uid);
        } else if (entry && typeof entry === 'object' && typeof entry.rel === 'string') {
          this.uidToRel.set(uid, entry.rel);
          this.relToUid.set(entry.rel, uid);
          if (typeof entry.content_hash === 'string' && entry.content_hash) {
            this.uidToHash.set(uid, entry.content_hash);
            this.indexHash(entry.content_hash, uid);
          }
        }
      }
    } catch {
      this.uidToRel.clear();
      this.relToUid.clear();
      this.uidToHash.clear();
      this.hashToUids.clear();
    }
  }

  private indexHash(hash: string, uid: string): void {
    let set = this.hashToUids.get(hash);
    if (!set) {
      set = new Set();
      this.hashToUids.set(hash, set);
    }
    set.add(uid);
  }

  private unindexHash(uid: string): void {
    const prev = this.uidToHash.get(uid);
    if (!prev) return;
    const set = this.hashToUids.get(prev);
    if (set) {
      set.delete(uid);
      if (set.size === 0) this.hashToUids.delete(prev);
    }
    this.uidToHash.delete(uid);
  }

  setContentHash(uid: string, hash: string): void {
    this.unindexHash(uid);
    this.uidToHash.set(uid, hash);
    this.indexHash(hash, uid);
  }

  contentHashOf(uid: string): string | null {
    return this.uidToHash.get(uid) ?? null;
  }

  /** Returns relative paths whose cached content_hash matches. */
  findByContentHash(hash: string): string[] {
    const set = this.hashToUids.get(hash);
    if (!set) return [];
    const out: string[] = [];
    for (const uid of set) {
      const rel = this.uidToRel.get(uid);
      if (rel) out.push(rel);
    }
    return out;
  }

  resolveUid(uid: string): string | null {
    const rel = this.uidToRel.get(uid);
    return rel ? path.join(this.vault, rel) : null;
  }

  uidOfRel(rel: string): string | null {
    return this.relToUid.get(toPosix(rel)) ?? null;
  }

  uidOfAbs(abs: string): string | null {
    return this.uidOfRel(vaultRel(this.vault, abs));
  }

  set(uid: string, absPath: string): void {
    const rel = vaultRel(this.vault, absPath);
    const prevRel = this.uidToRel.get(uid);
    if (prevRel && prevRel !== rel) this.relToUid.delete(prevRel);
    this.uidToRel.set(uid, rel);
    this.relToUid.set(rel, uid);
  }

  renamePath(oldAbs: string, newAbs: string): string | null {
    const oldRel = vaultRel(this.vault, oldAbs);
    const newRel = vaultRel(this.vault, newAbs);
    const uid = this.relToUid.get(oldRel);
    if (!uid) return null;
    this.relToUid.delete(oldRel);
    this.uidToRel.set(uid, newRel);
    this.relToUid.set(newRel, uid);
    return uid;
  }

  deletePath(absPath: string): void {
    const rel = vaultRel(this.vault, absPath);
    const uid = this.relToUid.get(rel);
    if (uid) {
      this.uidToRel.delete(uid);
      this.unindexHash(uid);
    }
    this.relToUid.delete(rel);
  }

  /**
   * Legacy snapshot shape (uid → relPath string). Kept for existing tests and
   * consumers that don't care about the content hash.
   */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.uidToRel);
  }

  /** Full snapshot including content hashes (the on-disk v3 shape). */
  snapshotFull(): Record<string, RefmapEntry> {
    const out: Record<string, RefmapEntry> = {};
    for (const [uid, rel] of this.uidToRel) {
      const entry: RefmapEntry = { rel };
      const h = this.uidToHash.get(uid);
      if (h) entry.content_hash = h;
      out[uid] = entry;
    }
    return out;
  }

  /** Serialize writes to avoid interleaved atomic renames. */
  async flush(): Promise<void> {
    const data = this.snapshotFull();
    this.writeQueue = this.writeQueue.then(() =>
      atomicWriteJson(refmapFile(this.vault), data)
    );
    await this.writeQueue;
  }

  /**
   * Scan the vault, inject UIDs into markdown files missing one, refresh the
   * in-memory maps and prune stale entries whose target file no longer exists.
   * Also refreshes content hashes for project README and task markdown so the
   * orphan-recovery index stays current.
   */
  async reconcile(): Promise<void> {
    const alive = new Set<string>();
    for await (const abs of walkMarkdown(this.vault)) {
      const rel = vaultRel(this.vault, abs);
      alive.add(rel);
      let content = await fs.readFile(abs, 'utf8');
      const parsed = parseFrontmatter(content);
      const existing = parsed.frontmatter['uid'];
      let uid: string;
      if (typeof existing === 'string' && existing.trim()) {
        uid = existing.trim();
      } else {
        const injected = ensureUid(content);
        uid = injected.uid;
        content = injected.content;
        await fs.writeFile(abs, content, 'utf8');
      }
      this.uidToRel.set(uid, rel);
      this.relToUid.set(rel, uid);
      // Only hash task/project README bodies — they are the re-identification
      // targets the orphan-recovery path cares about.
      const t = parsed.frontmatter['type'];
      const base = rel.split('/').pop() ?? '';
      if (t === 'task' || (t === 'project' && base === 'README.md')) {
        this.setContentHash(uid, contentHash(content));
      }
    }
    // Prune stale entries.
    for (const [uid, rel] of [...this.uidToRel]) {
      if (!alive.has(rel)) {
        this.uidToRel.delete(uid);
        this.relToUid.delete(rel);
        this.unindexHash(uid);
      }
    }
    await this.flush();
  }
}
