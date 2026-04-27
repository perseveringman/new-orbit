import { useEffect, useState } from 'react';
import type { KnowledgeBase, KnowledgeBaseSearchHit } from '@shared/knowledge-base';

export function KnowledgeBaseView(): JSX.Element {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeBaseSearchHit[]>([]);
  const [analysis, setAnalysis] = useState<string>('');

  async function reload(): Promise<void> {
    setKbs(await window.orbit.knowledgeBase.list());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function search(): Promise<void> {
    setHits(await window.orbit.knowledgeBase.search('all', query));
  }

  async function welcome(): Promise<void> {
    const result = await window.orbit.onboarding.runWelcomeAnalysis(kbs.map((kb) => kb.id));
    setAnalysis(`${result.headline}\n\n${result.summary}`);
  }

  async function activate(hit: KnowledgeBaseSearchHit): Promise<void> {
    await window.orbit.knowledgeBase.activate({
      kbId: hit.kbId,
      sourceFile: hit.path,
      excerpt: hit.excerpt,
      targetType: 'capture',
      userText: `Activated from ${hit.title}`
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Knowledge Base</h1>
            <p className="text-xs text-neutral-500">Imported Obsidian / Markdown archives with activation into Notes.</p>
          </div>
          <button onClick={() => void welcome()} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white">Run welcome analysis</button>
        </div>
        <div className="mt-3 flex max-w-xl gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search imported KB…" className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
          <button onClick={() => void search()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">Search</button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
        <aside className="overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Imported KBs</h2>
          {kbs.map((kb) => (
            <div key={kb.id} className="mt-2 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="font-medium">{kb.name}</div>
              <div className="text-xs text-neutral-500">{kb.item_count} files · {kb.source_type}</div>
              <button onClick={() => void window.orbit.knowledgeBase.rescan(kb.id).then(reload)} className="mt-2 rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">Rescan</button>
            </div>
          ))}
          {analysis ? <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{analysis}</pre> : null}
        </aside>
        <main className="overflow-y-auto p-4">
          <div className="space-y-3">
            {hits.map((hit) => (
              <div key={`${hit.kbId}:${hit.path}`} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="font-medium">{hit.title}</div>
                <div className="text-[11px] text-neutral-500">{hit.path}</div>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{hit.excerpt}</p>
                <button onClick={() => void activate(hit)} className="mt-3 rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">Activate to Note</button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

