import { useEffect, useState } from 'react';
import type { SpaceContextBundle, SpaceOutputSummary } from '@shared/space';

export function SpaceOutputsView({
  spaceId,
  spaceLabel = '空间'
}: {
  spaceId: string;
  spaceLabel?: string;
}): JSX.Element {
  const [outputs, setOutputs] = useState<SpaceOutputSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.orbit.space
      .context(spaceId, { sections: ['outputs'], summary: false })
      .then((context: SpaceContextBundle) => {
        if (!cancelled) {
          setOutputs(context.outputs);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">产出</h2>
        <p className="text-xs text-neutral-500">这个{spaceLabel}产生的持久结果。</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {!outputs ? (
          <div className="text-sm text-neutral-500">正在加载产出…</div>
        ) : outputs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
              <h3 className="text-sm font-medium">还没有产出</h3>
              <p className="mt-2 max-w-sm text-xs text-neutral-500">
                一旦 outputs/_manifest.md 记录产出，它们就会显示在这里。
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {outputs.map((output) => (
              <article
                key={output.id}
                className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
              >
                <h3 className="font-medium">{output.title}</h3>
                <p className="mt-1 font-mono text-xs text-neutral-500">{output.path || 'outputs/'}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                  {output.kind ? (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-900">
                      {output.kind}
                    </span>
                  ) : null}
                  {output.status ? (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-900">
                      {output.status}
                    </span>
                  ) : null}
                  {(output.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-900">
                      #{tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
