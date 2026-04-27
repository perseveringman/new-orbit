import { useEffect, useState } from 'react';
import type { ChannelConfig, GatewayStatus } from '@shared/gateway';

export function GatewayView(): JSX.Element {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [token, setToken] = useState('');
  const [name, setName] = useState('Telegram');
  const [bindCode, setBindCode] = useState<string>('');

  async function reload(): Promise<void> {
    setStatus(await window.orbit.gateway.status());
  }

  useEffect(() => {
    void reload();
    return window.orbit.gateway.onEvent(setStatus);
  }, []);

  async function addTelegram(): Promise<void> {
    const channel: Omit<ChannelConfig, 'id'> = {
      kind: 'telegram',
      name,
      enabled: true,
      bot_token: token,
      allowed_user_ids: []
    };
    await window.orbit.gateway.addChannel(channel);
    setToken('');
    await reload();
  }

  async function bind(): Promise<void> {
    const result = await window.orbit.gateway.generateBindCode();
    setBindCode(`${result.code} (expires ${new Date(result.expires_at).toLocaleTimeString()})`);
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Gateway</h1>
            <p className="text-xs text-neutral-500">Remote channels into Ask-Anywhere and Capture.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void window.orbit.gateway.start().then(setStatus)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">Start</button>
            <button onClick={() => void window.orbit.gateway.stop().then(setStatus)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Stop</button>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="text-sm font-medium">Daemon status: {status?.running ? 'running' : 'stopped'}</div>
          <p className="mt-1 text-xs text-neutral-500">This local daemon profile is stored in the vault and can route inbound channel messages.</p>
        </div>
        <div className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Telegram channel</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Bot token" className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => void addTelegram()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">Add</button>
          </div>
          <button onClick={() => void bind()} className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">Generate bind code</button>
          {bindCode ? <span className="ml-3 text-xs text-amber-600">{bindCode}</span> : null}
        </div>
        <div className="mt-6 space-y-2">
          {status?.channels.map((channel) => (
            <div key={channel.id} className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <div className="font-medium">{channel.name}</div>
              <div className="text-xs text-neutral-500">{channel.kind} · {channel.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

