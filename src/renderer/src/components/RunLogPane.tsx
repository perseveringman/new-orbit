import { useEffect, useMemo, useState } from 'react';
import { useAgent } from '../store/agent';

function buildLogPath(vaultPath: string, runId: string): string {
  return `${vaultPath}/.orbit/logs/${runId}.ndjson`;
}

export function RunLogPane(): JSX.Element {
  const runs = useAgent((s) => s.runs);
  const activeRunId = useAgent((s) => s.activeRunId);
  const select = useAgent((s) => s.select);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  const runList = useMemo(
    () =>
      Object.values(runs).sort((a, b) =>
        b.summary.startedAt.localeCompare(a.summary.startedAt)
      ),
    [runs]
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeRunId) {
      setText('');
      return;
    }
    void (async () => {
      const vault = await window.orbit.workspace.current();
      if (!vault) return;
      const raw = await window.orbit.fs.readFile(buildLogPath(vault.path, activeRunId));
      if (!cancelled) setText(raw);
    })().catch(() => {
      if (!cancelled) setText('');
    });
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ tab: string; runId?: string }>).detail;
      if (detail?.tab !== 'runlog' || !detail.runId) return;
      select(detail.runId);
    }
    window.addEventListener('orbit:open-right-tab', onOpen as EventListener);
    return () => window.removeEventListener('orbit:open-right-tab', onOpen as EventListener);
  }, [select]);

  const filtered = useMemo(() => {
    if (!query.trim()) return text;
    return text
      .split('\n')
      .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
      .join('\n');
  }, [query, text]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={activeRunId ?? ''}
          onChange={(e) => select(e.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        >
          {runList.map((run) => (
            <option key={run.summary.runId} value={run.summary.runId}>
              {run.summary.title ?? run.summary.runId}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter log"
          className="w-40 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <pre className="flex-1 overflow-auto rounded border border-neutral-200 bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-100 dark:border-neutral-800">
        {filtered || '(no log)'}
      </pre>
    </div>
  );
}
