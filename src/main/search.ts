import MiniSearch from 'minisearch';
import { VaultIndex } from './index_store';
import path from 'node:path';
import type { SearchHit } from '@shared/types';

interface Doc {
  id: string;
  title: string;
  body: string;
}

export class SearchIndex {
  private readonly vault: string;
  private readonly store: VaultIndex;
  private mini: MiniSearch<Doc>;

  constructor(vault: string, store: VaultIndex) {
    this.vault = vault;
    this.store = store;
    this.mini = this.build();
  }

  private build(): MiniSearch<Doc> {
    const m = new MiniSearch<Doc>({
      fields: ['title', 'body'],
      storeFields: ['title'],
      searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 }
    });
    for (const e of this.store.all()) {
      m.add({ id: e.relPath, title: e.title, body: e.body });
    }
    return m;
  }

  upsert(relPath: string): void {
    const e = this.store.all().find((x) => x.relPath === relPath);
    if (!e) return;
    if (this.mini.has(relPath)) this.mini.replace({ id: relPath, title: e.title, body: e.body });
    else this.mini.add({ id: relPath, title: e.title, body: e.body });
  }

  remove(relPath: string): void {
    if (this.mini.has(relPath)) this.mini.discard(relPath);
  }

  rename(oldRel: string, newRel: string): void {
    this.remove(oldRel);
    this.upsert(newRel);
  }

  rebuild(): void {
    this.mini = this.build();
  }

  search(query: string, limit = 30): SearchHit[] {
    if (!query.trim()) return [];
    const results = this.mini.search(query, { prefix: true, fuzzy: 0.2 });
    return results.slice(0, limit).map((r) => {
      const rel = String(r.id);
      return {
        path: path.join(this.vault, rel),
        relPath: rel,
        title: String(r['title'] ?? path.basename(rel, '.md')),
        score: r.score
      };
    });
  }
}
