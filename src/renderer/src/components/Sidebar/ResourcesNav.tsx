import { useEffect, useRef, useState } from 'react';
import type { ResourceSummary } from '@shared/resource';
import { usePara } from '../../store/para';

function depthDotClass(depth: string): string {
  if (depth === 'teaching') return 'bg-purple-500';
  if (depth === 'mastered') return 'bg-emerald-500';
  if (depth === 'practicing') return 'bg-sky-500';
  return 'bg-neutral-400';
}

export function ResourcesNav(): JSX.Element {
  const view = usePara((s) => s.view);
  const setView = usePara((s) => s.setView);
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [createTitle, setCreateTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshResources(): Promise<void> {
    try {
      setResources(await window.orbit.resources.list());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refreshResources();
    const off = window.orbit.resources.onEvent(() => void refreshResources());
    return off;
  }, []);

  async function createResource(): Promise<void> {
    const trimmed = createTitle.trim();
    if (!trimmed) {
      setError('Resource title is required.');
      return;
    }
    setError(null);
    try {
      const created = await window.orbit.resources.create({
        title: trimmed,
        body: `# ${trimmed}\n\n## Why this matters\n\n\n## Current understanding\n\n`
      });
      setCreateTitle('');
      await refreshResources();
      setView({ kind: 'resource', resourceSlug: created.frontmatter.slug });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Resources
        </h2>
        <button
          onClick={() => createInputRef.current?.focus()}
          title="New resource"
          className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
        >
          Create
        </button>
      </div>

      <div className="mt-1 flex gap-1 px-2">
        <input
          ref={createInputRef}
          value={createTitle}
          onChange={(event) => setCreateTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void createResource();
          }}
          placeholder="New resource"
          className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
        />
        <button
          onClick={() => void createResource()}
          className="rounded bg-neutral-200/80 px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-300/60 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
        >
          Add
        </button>
      </div>
      {error ? <div className="px-2 text-[11px] text-red-500">{error}</div> : null}

      {resources.length === 0 ? (
        <div className="mt-2 flex flex-col items-center gap-3 px-2 text-center">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">No resources yet</span>
        </div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {resources.map((resource) => {
            const active = view.kind === 'resource' && view.resourceSlug === resource.frontmatter.slug;
            return (
              <li key={resource.frontmatter.id}>
                <button
                  onClick={() => setView({ kind: 'resource', resourceSlug: resource.frontmatter.slug })}
                  className={
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ' +
                    (active ? 'bg-neutral-200/80 dark:bg-neutral-800/80' : '')
                  }
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${depthDotClass(resource.frontmatter.depth)}`} />
                  <span className="min-w-0 flex-1 truncate">{resource.frontmatter.title}</span>
                  {resource.counts.distilled > 0 ? (
                    <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {resource.counts.distilled}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
