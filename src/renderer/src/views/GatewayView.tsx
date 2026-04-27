import { useEffect, useState } from 'react';
import type { ChannelConfig, GatewayConfig, GatewayStatus } from '@shared/gateway';

export function GatewayView(): JSX.Element {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [token, setToken] = useState('');
  const [name, setName] = useState('Telegram');
  const [bindCode, setBindCode] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const [nextConfig, nextStatus] = await Promise.all([
      window.orbit.gateway.getConfig(),
      window.orbit.gateway.status()
    ]);
    setConfig(nextConfig);
    setStatus(nextStatus);
  }

  useEffect(() => {
    void reload();
    const off = window.orbit.gateway.onEvent(setStatus);
    return off;
  }, []);

  async function addTelegram(): Promise<void> {
    const trimmedToken = token.trim();
    const trimmedName = name.trim() || 'Telegram';
    if (!trimmedToken) {
      setError('Telegram bot token is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const channel: Omit<ChannelConfig, 'id'> = {
        kind: 'telegram',
        name: trimmedName,
        enabled: true,
        bot_token: trimmedToken,
        allowed_user_ids: [],
        require_bind: true,
        drop_pending_updates_on_start: true,
        poll_timeout_seconds: 25
      };
      await window.orbit.gateway.addChannel(channel);
      setToken('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function bind(): Promise<void> {
    const result = await window.orbit.gateway.generateBindCode();
    setBindCode(`/start ${result.code} · expires ${new Date(result.expires_at).toLocaleTimeString()}`);
  }

  async function updateDaemon(patch: Partial<GatewayConfig['daemon']>): Promise<void> {
    if (!config) return;
    const next = await window.orbit.gateway.updateConfig({ daemon: { ...config.daemon, ...patch } });
    setConfig(next);
    await reload();
  }

  async function updateChannel(channelId: string, patch: Partial<ChannelConfig>): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await window.orbit.gateway.updateChannel(channelId, patch);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeChannel(channelId: string): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await window.orbit.gateway.removeChannel(channelId);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Gateway</h1>
            <p className="text-xs text-neutral-500">Telegram into Ask-Anywhere, Library, and Thoughts.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void window.orbit.gateway.start().then(setStatus)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">
              Start
            </button>
            <button onClick={() => void window.orbit.gateway.stop().then(setStatus)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              Stop
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="text-sm font-medium">Daemon status: {status?.running ? 'running' : 'stopped'}</div>
            <p className="mt-1 text-xs text-neutral-500">
              The Gateway keeps a real Telegram long-polling channel alive from the local Orbit main process.
            </p>
            <label className="mt-4 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config?.daemon.auto_start ?? false}
                onChange={(event) => void updateDaemon({ auto_start: event.target.checked })}
              />
              Auto-start when this vault opens
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config?.daemon.keep_running_after_app_close ?? false}
                onChange={(event) => void updateDaemon({ keep_running_after_app_close: event.target.checked })}
              />
              Keep Gateway running after closing all windows
            </label>
          </section>

          <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Bind Telegram user</h2>
            <p className="mt-1 text-xs text-neutral-500">Generate a one-time code, then send it to your bot from Telegram.</p>
            <button onClick={() => void bind()} className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              Generate bind command
            </button>
            {bindCode ? <code className="mt-3 block rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">{bindCode}</code> : null}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Telegram channel</h2>
          <p className="mt-1 text-xs text-neutral-500">Create a bot with BotFather, paste the token, start Gateway, then bind your Telegram user.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456:ABC-DEF..." type="password" className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => void addTelegram()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
          {error ? <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        </section>

        <div className="mt-6 space-y-3">
          {status?.channels.map((channel) => (
            <div key={channel.id} className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-xs text-neutral-500">
                    {channel.kind} · {channel.status}
                    {channel.bot_username ? ` · @${channel.bot_username}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {channel.allowed_user_ids?.length ? `${channel.allowed_user_ids.length} bound user(s)` : 'No Telegram users bound yet'}
                    {channel.last_seen_at ? ` · last seen ${new Date(channel.last_seen_at).toLocaleString()}` : ''}
                  </div>
                  {channel.last_error ? <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{channel.last_error}</div> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => void updateChannel(channel.id, { enabled: !channel.enabled })} className="rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">
                    {channel.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => void removeChannel(channel.id)} className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-600 dark:border-red-900">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {status?.logs?.length ? (
          <section className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Gateway logs</h2>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto font-mono text-xs">
              {status.logs.map((entry) => (
                <div key={entry.id} className="rounded bg-neutral-50 p-2 dark:bg-neutral-900">
                  <span className="text-neutral-500">{new Date(entry.at).toLocaleTimeString()}</span>{' '}
                  <span className={entry.level === 'error' ? 'text-red-500' : entry.level === 'warn' ? 'text-amber-500' : 'text-neutral-500'}>{entry.level}</span>{' '}
                  {entry.message}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
