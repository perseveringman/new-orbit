import { useEffect, useState } from 'react';
import type { KnowledgeBase, KnowledgeBaseSearchHit, KnowledgeBaseSourceType } from '@shared/knowledge-base';

export function KnowledgeBaseView(): JSX.Element {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeBaseSearchHit[]>([]);
  const [analysis, setAnalysis] = useState<string>('');
  const [importName, setImportName] = useState('');
  const [importPath, setImportPath] = useState('');
  const [sourceType, setSourceType] = useState<KnowledgeBaseSourceType>('markdown-folder');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setKbs(await window.orbit.knowledgeBase.list());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function search(): Promise<void> {
    setMessage(null);
    setHits(await window.orbit.knowledgeBase.search('all', query));
  }

  async function welcome(): Promise<void> {
    const result = await window.orbit.onboarding.runWelcomeAnalysis(kbs.map((kb) => kb.id));
    setAnalysis(`${result.headline}\n\n${result.summary}`);
  }

  async function activate(hit: KnowledgeBaseSearchHit): Promise<void> {
    const note = await window.orbit.knowledgeBase.activate({
      kbId: hit.kbId,
      sourceFile: hit.path,
      excerpt: hit.excerpt,
      targetType: 'capture',
        userText: `从 ${hit.title} 激活`
      });
    setMessage(`已激活到 ${note.path}`);
  }

  async function importKnowledgeBase(): Promise<void> {
    if (!importPath.trim()) {
      setMessage('请输入要导入的来源文件夹路径。');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const kb = await window.orbit.knowledgeBase.import({
        name: importName.trim() || importPath.trim().split('/').filter(Boolean).at(-1) || '知识库',
        sourcePath: importPath.trim(),
        sourceType,
        writable: true
      });
      setImportName('');
      setImportPath('');
      setMessage(`已导入 ${kb.name}（${kb.item_count} 个 Markdown 文件）。`);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
             <h1 className="text-lg font-semibold">知识库</h1>
             <p className="text-xs text-neutral-500">导入 Obsidian / Markdown 归档，并将有用片段激活为笔记。</p>
          </div>
           <button onClick={() => void welcome()} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white">运行欢迎分析</button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-neutral-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
             <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">导入向导</div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1.5fr_auto_auto]">
              <input
                value={importName}
                onChange={(event) => setImportName(event.target.value)}
                 placeholder="名称"
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
              <input
                value={importPath}
                onChange={(event) => setImportPath(event.target.value)}
                 placeholder="/path/to/markdown-folder"
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as KnowledgeBaseSourceType)}
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                 <option value="markdown-folder">Markdown 文件夹</option>
                <option value="obsidian">Obsidian</option>
                 <option value="notion-export">Notion 导出</option>
                 <option value="generic">通用</option>
              </select>
              <button
                onClick={() => void importKnowledgeBase()}
                disabled={busy}
                className="rounded bg-neutral-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                 {busy ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
          <div>
            <div className="flex gap-2">
               <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索已导入的知识库…" className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
               <button onClick={() => void search()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">搜索</button>
            </div>
            {message ? <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-100">{message}</div> : null}
          </div>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
        <aside className="overflow-y-auto border-r border-neutral-200 p-4 dark:border-neutral-800">
           <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">已导入知识库</h2>
          {kbs.length === 0 ? (
            <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-900">
               导入 Markdown 或 Obsidian 文件夹。导入的文档会留在知识库中，直到你把它们激活为笔记。
            </p>
          ) : null}
          {kbs.map((kb) => (
            <div key={kb.id} className="mt-2 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="font-medium">{kb.name}</div>
               <div className="text-xs text-neutral-500">{kb.item_count} 个文件 · {kb.source_type}</div>
               <button onClick={() => void window.orbit.knowledgeBase.rescan(kb.id).then(reload)} className="mt-2 rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">重新扫描</button>
            </div>
          ))}
          {analysis ? <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{analysis}</pre> : null}
        </aside>
        <main className="overflow-y-auto p-4">
          <div className="space-y-3">
            {hits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
                 搜索知识库，然后把有用摘录激活为笔记。
              </div>
            ) : null}
            {hits.map((hit) => (
              <div key={`${hit.kbId}:${hit.path}`} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="font-medium">{hit.title}</div>
                <div className="text-[11px] text-neutral-500">{hit.path}</div>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{hit.excerpt}</p>
                 <button onClick={() => void activate(hit)} className="mt-3 rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">激活为笔记</button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
