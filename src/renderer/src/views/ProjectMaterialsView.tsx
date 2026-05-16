import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AssetManifest, AssetScope } from '@shared/assets';
import type { ProjectSummaryDTO } from '@shared/ipc';

export function ProjectMaterialsView({ project }: { project: ProjectSummaryDTO }): JSX.Element {
  return <SpaceMaterialsView spaceId={project.uid} spaceName={project.name} spaceLabel="项目" />;
}

export function SpaceMaterialsView({
  spaceId,
  spaceName,
  spaceLabel = '空间'
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
    const source = window.prompt(`请输入要授权为${spaceLabel}素材的路径、glob 或 URL`);
    if (!source) return;
    const title = window.prompt('范围标题', source.split('/').filter(Boolean).at(-1) ?? source) ?? undefined;
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
    if (!window.confirm(`移除素材范围 "${scope.title}"?`)) return;
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
          <h2 className="font-medium">素材</h2>
          <p className="text-xs text-neutral-500">
            授权范围定义 AI 可访问的{spaceLabel}素材：{spaceName}。
          </p>
        </div>
        <button
          onClick={() => void addScope()}
          className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-500"
        >
          + 添加范围
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
          范围地图（{manifest?.scopes.length ?? 0}）
        </button>
        <button
          className={activeView === 'pinned' ? 'text-sky-600 dark:text-sky-400' : 'text-neutral-500'}
          onClick={() => setActiveView('pinned')}
        >
          已固定（{manifest?.pins.length ?? 0}）
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!manifest ? (
          <div className="text-sm text-neutral-500">正在加载素材…</div>
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
                        <span>{pinsByScope.get(scope.id) ?? 0} 个固定项</span>
                        {scope.stats && (
                          <span>
                            {scope.stats.file_count} 个文件 · {formatBytes(scope.stats.total_bytes)}
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
                          扫描
                        </button>
                      )}
                      <button
                        onClick={() => void removeScope(scope)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : manifest.pins.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
            还没有固定素材。
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
                  {pin.parent_scope ? `来自 ${pin.parent_scope}` : '独立固定项'} · {pin.pinned_by}
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
        <h3 className="text-sm font-medium">还没有素材范围</h3>
        <p className="mt-2 text-xs text-neutral-500">
          添加文件夹、文件、glob 或 URL 范围，明确授权 AI 使用{spaceLabel}素材。
        </p>
        <button
          onClick={onAdd}
          className="mt-4 rounded bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500"
        >
          + 添加第一个范围
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
