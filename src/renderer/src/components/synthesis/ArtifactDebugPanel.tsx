import { useEffect, useState } from 'react';
import type { SynthesisArtifact, SynthesisFilter } from '@shared/synthesis';
import { SynthesisStatus } from './SynthesisStatus';

export function ArtifactDebugPanel({ filter = {} }: { filter?: SynthesisFilter }): JSX.Element {
  const [artifacts, setArtifacts] = useState<SynthesisArtifact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setArtifacts(await window.orbit.synthesis.list({ ...filter, limit: filter.limit ?? 50 }));
  }

  useEffect(() => {
    void reload();
  }, [filter.kind, filter.scope_key, filter.status, filter.limit]);

  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0] ?? null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Synthesis artifacts</h3>
          <p className="text-xs text-neutral-500">Layer 2 artifact debug panel.</p>
        </div>
        <button type="button" onClick={() => void reload()} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
          Reload
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setSelectedId(artifact.id)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${
                selected?.id === artifact.id
                  ? 'border-sky-400 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30'
                  : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <div className="font-medium">{artifact.kind}</div>
              <div className="truncate text-neutral-500">{artifact.scope_key}</div>
              <SynthesisStatus artifact={artifact} />
            </button>
          ))}
          {artifacts.length === 0 ? <p className="text-xs text-neutral-500">No artifacts yet.</p> : null}
        </div>
        <pre className="max-h-72 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] text-neutral-100">
          {selected ? JSON.stringify(selected, null, 2) : 'Select an artifact'}
        </pre>
      </div>
    </section>
  );
}

