import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AssetManifest, AssetScope } from '@shared/assets';
import type { ProjectSummaryDTO } from '@shared/ipc';

export function ProjectMaterialsView({ project }: { project: ProjectSummaryDTO }): JSX.Element {
  return <SpaceMaterialsView spaceId={project.uid} spaceName={project.name} spaceLabel="project" />;
}

export function SpaceMaterialsView({
  spaceId,
  spaceName,
  spaceLabel = 'space'
}: {
  spaceId: string;
  spaceName: string;
  spaceLabel?: string;
}): JSX.Element {
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [activeView, setActiveView] = useState<'map' | 'pinned'>('map');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setManifest(await window.orbit.assets.getManifest(spaceId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pinsByScope = useMemo(() => {
    const map = new Map<string, number>();
    for (const pin of manifest?.pins ?? []) {
      if (!pin.parent_scope) continue;
      map.set(pin.parent_scope, (map.get(pin.parent_scope) ?? 0) + 1);
    }
    return map;
  }, [manifest]);

  async function addScope(): Promise<void> {
    const source = window.prompt(`Path, glob, or URL to authorize as ${spaceLabel} material`);
    if (!source) return;
    const title = window.prompt('Scope title', source.split('/').filter(Boolean).at(-1) ?? source) ?? undefined;
    const kind = source.startsWith('http') ? 'url' : 'folder';
    try {
      await window.orbit.assets.addScope(spaceId, {
        source,
        title,
        kind,
        authorized_via: 'file-picker',
        tags: []
      });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeScope(scope: AssetScope): Promise<void> {
    if (!window.confirm(`Remove material scope "${scope.title}"?`)) return;
    try {
      await window.orbit.assets.removeScope(spaceId, scope.id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function scanScope(scope: AssetScope): Promise<void> {
    try {
      await window.orbit.assets.scanScope(spaceId, scope.id, { limit: 500 });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
        <div>
          <h2 className="font-medium">Materials</h2>
          <p className="text-xs text-neutral-500">
            Authorized scopes define what AI may access for this {spaceLabel}: {spaceName}.
          </p>
        </div>
        <button
          onClick={() => void addScope()}
          className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-500"
        >
          + Add scope
        </button>
      </header>
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="flex shrink-0 gap-2 border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800">
        <button
          className={activeView === 'map' ? 'text-sky-600 dark:text-sky-400' : 'text-neutral-500'}
          onClick={() => setActiveView('map')}
        >
          Map ({manifest?.scopes.length ?? 0})
        </button>
        <button
          className={activeView === 'pinned' ? 'text-sky-600 dark:text-sky-400' : 'text-neutral-500'}
          onClick={() => setActiveView('pinned')}
        >
          Pinned ({manifest?.pins.length ?? 0})
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!manifest ? (
          <div className="text-sm text-neutral-500">Loading materials...</div>
        ) : activeView === 'map' ? (
          manifest.scopes.length === 0 ? (
            <EmptyMaterials spaceLabel={spaceLabel} onAdd={() => void addScope()} />
          ) : (
            <div className="space-y-3">
              {manifest.scopes.map((scope) => (
                <article
                  key={scope.id}
                  className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{scope.title}</h3>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500 dark:bg-neutral-900">
                          {scope.kind}
                        </span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500 dark:bg-neutral-900">
                          {scope.mode}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-neutral-500">{scope.source}</p>
                      {scope.note && <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{scope.note}</p>}
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                        {scope.tags.map((tag) => (
                          <span key={tag} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-900">
                            #{tag}
                          </span>
                        ))}
                        <span>{pinsByScope.get(scope.id) ?? 0} pins</span>
                        {scope.stats && (
                          <span>
                            {scope.stats.file_count} files · {formatBytes(scope.stats.total_bytes)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {scope.kind !== 'url' && (
                        <button
                          onClick={() => void scanScope(scope)}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                        >
                          Scan
                        </button>
                      )}
                      <button
                        onClick={() => void removeScope(scope)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : manifest.pins.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No pinned materials yet.
          </div>
        ) : (
          <div className="space-y-2">
            {manifest.pins.map((pin) => (
              <article
                key={pin.scope_id}
                className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
              >
                <h3 className="font-medium">{pin.title}</h3>
                <p className="mt-1 truncate font-mono text-xs text-neutral-500">{pin.source}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {pin.parent_scope ? `from ${pin.parent_scope}` : 'standalone pin'} · {pin.pinned_by}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyMaterials({ spaceLabel, onAdd }: { spaceLabel: string; onAdd(): void }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
        <h3 className="text-sm font-medium">No material scopes yet</h3>
        <p className="mt-2 text-xs text-neutral-500">
          Add a folder, file, glob, or URL scope to explicitly authorize {spaceLabel} materials for AI.
        </p>
        <button
          onClick={onAdd}
          className="mt-4 rounded bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500"
        >
          + Add first scope
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
