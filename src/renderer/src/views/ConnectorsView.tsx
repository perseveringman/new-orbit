import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Plug, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import type {
  ConnectorConnection,
  ConnectorDefinition,
  ConnectorSearchHit
} from '@shared/connectors';

type LoadState = 'idle' | 'loading' | 'error';

export function ConnectorsView(): JSX.Element {
  const [definitions, setDefinitions] = useState<ConnectorDefinition[]>([]);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ConnectorSearchHit[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const connectionsByConnector = useMemo(
    () =>
      connections.reduce((map, connection) => {
        const items = map.get(connection.connector_id) ?? [];
        items.push(connection);
        map.set(connection.connector_id, items);
        return map;
      }, new Map<string, ConnectorConnection[]>()),
    [connections]
  );

  async function reload(): Promise<void> {
    setState('loading');
    setMessage(null);
    try {
      const [nextDefinitions, nextConnections] = await Promise.all([
        window.orbit.connectors.definitions(),
        window.orbit.connectors.list()
      ]);
      setDefinitions(nextDefinitions);
      setConnections(nextConnections);
      setState('idle');
    } catch (error) {
      setMessage((error as Error).message);
      setState('error');
    }
  }

  useEffect(() => {
    void reload();
    const off = window.orbit.connectors.onEvent(() => void reload());
    return off;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setHits([]);
        return;
      }
      const next = await window.orbit.connectors.search(query, 8).catch(() => []);
      if (!cancelled) setHits(next);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  async function connectDefinition(definition: ConnectorDefinition): Promise<void> {
    setMessage(null);
    const config: Record<string, unknown> = {};
    for (const field of definition.config_schema) {
      if (field.type === 'directory') {
        const picked = await window.orbit.connectors.chooseDirectory();
        if (picked.canceled || !picked.path) return;
        config[field.key] = picked.path;
        continue;
      }
      if (field.required) {
        setMessage(`${definition.display_name} 还不支持从这里配置字段：${field.label}`);
        return;
      }
    }
    try {
      const existing = definition.config_schema.length === 0
        ? connections.find((connection) => connection.connector_id === definition.id)
        : null;
      if (existing) {
        await window.orbit.connectors.scan(existing.id);
      } else {
        await window.orbit.connectors.connect({
          connector_id: definition.id,
          display_name: definition.display_name,
          config
        });
      }
      await reload();
      setMessage(`${definition.display_name} 已连接，AI 上下文索引会在下一次搜索或提问时刷新。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function scan(connectionId: string): Promise<void> {
    setMessage(null);
    try {
      const result = await window.orbit.connectors.scan(connectionId);
      await reload();
      setMessage(`已扫描 ${result.item_count} 个条目。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function remove(connectionId: string): Promise<void> {
    setMessage(null);
    try {
      await window.orbit.connectors.remove(connectionId);
      setHits([]);
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function openHit(hit: ConnectorSearchHit): Promise<void> {
    try {
      await window.orbit.connectors.open({
        connection_id: hit.connection_id,
        doc_ref: hit.doc_ref
      });
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Connectors</p>
              <h1 className="mt-1 text-2xl font-semibold">外部连接器</h1>
            </div>
            <button
              onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <RefreshCw size={15} />
              刷新
            </button>
          </div>

          {message ? (
            <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${state === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300'}`}>
              {message}
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              {definitions.map((definition) => {
                const related = connectionsByConnector.get(definition.id) ?? [];
                const connected = related.some((connection) => connection.status === 'connected');
                const icon = definition.config_schema.some((field) => field.type === 'directory')
                  ? <FolderOpen size={15} />
                  : <Power size={15} />;
                return (
                  <div key={definition.id} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Plug size={17} className={definition.evidence_kind === 'external_ai_session' ? 'text-sky-500' : 'text-violet-500'} />
                          <h2 className="text-sm font-semibold">{definition.display_name}</h2>
                          {connected ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                              已连接
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                          {definition.description}
                        </p>
                      </div>
                      <button
                        onClick={() => void connectDefinition(definition)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-300"
                      >
                        {icon}
                        {definition.config_schema.length === 0 && connected ? '重新扫描' : connectorActionLabel(definition)}
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {definition.capabilities.map((capability) => (
                        <span key={capability} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                          {capability}
                        </span>
                      ))}
                    </div>
                    {related.length ? (
                      <p className="mt-3 text-xs text-neutral-500">
                        {related.length} 个连接 · {related.reduce((sum, item) => sum + item.item_count, 0)} 个条目
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {definitions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                  暂无可用连接器。
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <h2 className="text-sm font-semibold">已连接</h2>
              </div>
              {connections.length === 0 ? (
                <p className="px-4 py-8 text-sm text-neutral-500">暂无连接。</p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {connections.map((connection) => (
                    <li key={connection.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${connection.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <p className="truncate text-sm font-medium">{connection.display_name}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-neutral-500">
                          {connectionConfigLabel(connection)} · {connection.item_count} 个条目
                        </p>
                      </div>
                      <button
                        onClick={() => void scan(connection.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        <RefreshCw size={13} />
                        扫描
                      </button>
                      <button
                        onClick={() => void remove(connection.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <Trash2 size={13} />
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="connector-search">
              <Search size={15} />
              搜索连接器内容
            </label>
            <input
              id="connector-search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="关键词"
              className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <ul className="mt-4 space-y-2">
              {hits.map((hit) => (
                <li key={`${hit.connection_id}:${hit.doc_ref}`}>
                  <button
                    onClick={() => void openHit(hit)}
                    className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-950"
                  >
                    <span className="block truncate text-sm font-medium">{hit.title}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-neutral-500">{hit.excerpt}</span>
                  </button>
                </li>
              ))}
              {query.trim() && hits.length === 0 ? (
                <li className="text-sm text-neutral-500">没有结果。</li>
              ) : null}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}

function connectorActionLabel(definition: ConnectorDefinition): string {
  if (definition.config_schema.some((field) => field.type === 'directory')) return '连接目录';
  return '启用';
}

function connectionConfigLabel(connection: ConnectorConnection): string {
  const rootPath = connection.config['root_path'];
  if (typeof rootPath === 'string' && rootPath) return rootPath;
  if (connection.config['scanner'] === 'orbit.external-ai-sessions') {
    const count = connection.config['root_count'];
    return typeof count === 'number' ? `Orbit 内置本地会话索引 · ${count} 个来源` : 'Orbit 内置本地会话索引';
  }
  const bridgeRoot = connection.config['bridge_root'];
  if (typeof bridgeRoot === 'string' && bridgeRoot) return bridgeRoot;
  return connection.connector_id;
}
