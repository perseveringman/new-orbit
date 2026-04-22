import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseWikilinks } from './wikilink';
import { parseFrontmatter } from './uid';
import { vaultRel, toPosix } from './pathGuard';
import { walkMarkdown } from './walk';

export interface IndexEntry {
  relPath: string;
  title: string;
  body: string;
  links: string[]; // normalized (lowercased, no .md) wikilink targets
}

/**
 * In-memory full-text + backlink index over markdown files. Rebuilt incrementally
 * by the watcher. Keeps memory proportional to vault body size which is fine for
 * personal-scale vaults (M7 replaces this with sqlite-vss).
 */
export class VaultIndex {
  private readonly vault: string;
  // relPath -> entry
  private entries: Map<string, IndexEntry> = new Map();
  // normalized link target -> set of linking relPaths
  private backlinks: Map<string, Set<string>> = new Map();

  constructor(vault: string) {
    this.vault = vault;
  }

  async rebuild(): Promise<void> {
    this.entries.clear();
    this.backlinks.clear();
    for await (const abs of walkMarkdown(this.vault)) {
      await this.upsertAbs(abs);
    }
  }

  async upsertAbs(abs: string): Promise<void> {
    try {
      const content = await fs.readFile(abs, 'utf8');
      this.upsert(vaultRel(this.vault, abs), content);
    } catch {
      // ignore read errors
    }
  }

  upsert(relPath: string, content: string): void {
    const rel = toPosix(relPath);
    this.removeBacklinksFor(rel);

    const parsed = parseFrontmatter(content);
    const body = parsed.body;
    const title = path.basename(rel, '.md');
    const links = parseWikilinks(body).map((w) =>
      w.target.replace(/\.md$/i, '').toLowerCase()
    );
    this.entries.set(rel, { relPath: rel, title, body, links });
    for (const t of links) {
      let set = this.backlinks.get(t);
      if (!set) {
        set = new Set();
        this.backlinks.set(t, set);
      }
      set.add(rel);
    }
  }

  remove(relPath: string): void {
    const rel = toPosix(relPath);
    this.removeBacklinksFor(rel);
    this.entries.delete(rel);
  }

  rename(oldRel: string, newRel: string): void {
    const src = toPosix(oldRel);
    const dst = toPosix(newRel);
    const entry = this.entries.get(src);
    if (!entry) return;
    this.entries.delete(src);
    entry.relPath = dst;
    entry.title = path.basename(dst, '.md');
    this.entries.set(dst, entry);
    for (const set of this.backlinks.values()) {
      if (set.delete(src)) set.add(dst);
    }
  }

  private removeBacklinksFor(rel: string): void {
    const prev = this.entries.get(rel);
    if (!prev) return;
    for (const t of prev.links) {
      const set = this.backlinks.get(t);
      if (set) {
        set.delete(rel);
        if (set.size === 0) this.backlinks.delete(t);
      }
    }
  }

  /** relPaths that link TO the given relPath via wikilink (by basename match). */
  backlinksOf(relPath: string): { relPath: string; count: number; title: string }[] {
    const base = path.basename(toPosix(relPath), '.md').toLowerCase();
    const set = this.backlinks.get(base) ?? new Set<string>();
    const out: { relPath: string; count: number; title: string }[] = [];
    for (const rel of set) {
      const entry = this.entries.get(rel);
      if (!entry) continue;
      const count = entry.links.filter((l) => l === base).length;
      out.push({ relPath: rel, count, title: entry.title });
    }
    out.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return out;
  }

  /** Scan all entries for wikilinks matching `oldName`; returns list of linking relPaths. */
  linkersByName(name: string): string[] {
    const key = name.replace(/\.md$/i, '').toLowerCase();
    const set = this.backlinks.get(key);
    return set ? [...set] : [];
  }

  all(): IndexEntry[] {
    return [...this.entries.values()];
  }

  resolveName(
    name: string,
    preferFromRel?: string
  ): string | null {
    const target = name.replace(/\.md$/i, '').toLowerCase();
    const matches: string[] = [];
    for (const rel of this.entries.keys()) {
      if (path.basename(rel, '.md').toLowerCase() === target) matches.push(rel);
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0] ?? null;
    if (preferFromRel) {
      const dir = toPosix(path.dirname(preferFromRel));
      const sameFolder = matches.find((m) => toPosix(path.dirname(m)) === dir);
      if (sameFolder) return sameFolder;
      // nearest: minimum path distance between directories
      matches.sort(
        (a, b) => pathDistance(dir, toPosix(path.dirname(a))) - pathDistance(dir, toPosix(path.dirname(b)))
      );
    }
    return matches[0] ?? null;
  }
}

function pathDistance(a: string, b: string): number {
  const as = a.split('/');
  const bs = b.split('/');
  let i = 0;
  while (i < as.length && i < bs.length && as[i] === bs[i]) i++;
  return as.length + bs.length - 2 * i;
}
