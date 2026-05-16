import { useEffect, useState } from 'react';
import type { ChannelConfig, GatewayConfig, GatewayMessage, GatewayStatus } from '@shared/gateway';

export function GatewayView(): JSX.Element {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [token, setToken] = useState('');
  const [name, setName] = useState('Telegram');
  const [bindCode, setBindCode] = useState<string>('');
  const [messages, setMessages] = useState<GatewayMessage[]>([]);
  const [allowList, setAllowList] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const [nextConfig, nextStatus] = await Promise.all([
      window.orbit.gateway.getConfig(),
      window.orbit.gateway.getStatus()
    ]);
    setConfig(nextConfig);
    setStatus(nextStatus);
    setMessages(await window.orbit.gateway.getMessages(20));
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
      setError('请填写 Telegram bot token。');
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
        allowed_user_ids: allowList.split(',').map((item) => item.trim()).filter(Boolean),
        require_bind: true,
        permissions: { capture: true, ask: true, save_url: true, save_file: true, summary: true },
        drop_pending_updates_on_start: true,
        poll_timeout_seconds: 25
      };
      await window.orbit.gateway.addChannel(channel);
      setToken('');
      setAllowList('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function bind(): Promise<void> {
    const result = await window.orbit.gateway.generateBindCode();
    setBindCode(`/start ${result.code} · 过期时间 ${new Date(result.expires_at).toLocaleTimeString()}`);
  }

  async function updateDaemon(patch: Partial<GatewayConfig['daemon']>): Promise<void> {
    if (!config) return;
    const next = await window.orbit.gateway.updateConfig({ daemon: { ...config.daemon, ...patch } });
    setConfig(next);
    await reload();
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
            <p className="text-xs text-neutral-500">将 Telegram 接入随处问、资料库与想法。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void window.orbit.gateway.startDaemon().then(setStatus)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">
              启动
            </button>
            <button onClick={() => void window.orbit.gateway.stopDaemon().then(setStatus)} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              停止
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="text-sm font-medium">守护进程状态：{status?.running ? '运行中' : '已停止'}</div>
            <p className="mt-1 text-xs text-neutral-500">
              Gateway 会在本地 Orbit 主进程中保持真实的 Telegram long-polling 通道在线。
            </p>
            {status?.started_at ? <p className="mt-2 text-xs text-neutral-500">运行始于 {new Date(status.started_at).toLocaleString()}</p> : null}
            <label className="mt-4 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config?.daemon.auto_start ?? false}
                onChange={(event) => void updateDaemon({ auto_start: event.target.checked })}
              />
              打开此 vault 时自动启动
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config?.daemon.keep_running_after_app_close ?? false}
                onChange={(event) => void updateDaemon({ keep_running_after_app_close: event.target.checked })}
              />
              关闭所有窗口后继续运行 Gateway
            </label>
          </section>

          <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">绑定 Telegram 用户</h2>
            <p className="mt-1 text-xs text-neutral-500">生成一次性代码，然后从 Telegram 发送给你的 bot。</p>
            <button onClick={() => void bind()} className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
              生成绑定命令
            </button>
            {bindCode ? <code className="mt-3 block rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">{bindCode}</code> : null}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Telegram 通道</h2>
          <p className="mt-1 text-xs text-neutral-500">用 BotFather 创建 bot，粘贴 token，启动 Gateway，然后绑定你的 Telegram 用户。</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456:ABC-DEF..." type="password" className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
            <button onClick={() => void addTelegram()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">
              {saving ? '保存中…' : '添加'}
            </button>
          </div>
          <input value={allowList} onChange={(event) => setAllowList(event.target.value)} placeholder="Telegram 用户 ID 白名单，用英文逗号分隔" className="mt-2 w-full rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900" />
          {error ? <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        </section>

        <div className="mt-6 space-y-3">
          {status?.channels.map((channel) => (
            <div key={channel.id} className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-xs text-neutral-500">
                    {channel.kind} · {gatewayChannelStatusLabel(channel.status)}
                    {channel.bot_username ? ` · @${channel.bot_username}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {channel.allowed_user_ids?.length ? `${channel.allowed_user_ids.length} 个已绑定用户` : '尚未绑定 Telegram 用户'}
                    {channel.last_seen_at ? ` · 上次出现 ${new Date(channel.last_seen_at).toLocaleString()}` : ''}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    {Object.entries(channel.permissions ?? {}).filter(([, enabled]) => enabled).map(([key]) => (
                      <span key={key} className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{gatewayPermissionLabel(key)}</span>
                    ))}
                  </div>
                  {channel.last_error ? <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{channel.last_error}</div> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                   <button onClick={() => void (channel.enabled ? window.orbit.gateway.disableChannel(channel.id) : window.orbit.gateway.enableChannel(channel.id)).then(reload)} className="rounded border border-neutral-300 px-2 py-1 text-[11px] dark:border-neutral-700">
                      {channel.enabled ? '停用' : '启用'}
                   </button>
                   <button onClick={() => {
                      if (window.confirm('移除这个 Gateway 通道？')) void removeChannel(channel.id);
                   }} className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-600 dark:border-red-900">
                      移除
                   </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <section className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">最近消息</h2>
          <p className="mt-1 text-xs text-neutral-500">Gateway 记录的入站 Telegram 命令、URL 保存、捕获、提问与出站消息。</p>
          <div className="mt-3 space-y-2">
            {messages.length === 0 ? <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">暂无 Gateway 消息。绑定 Telegram 后，可以发送 /capture、/ask、/summary，或转发 URL。</div> : messages.map((message) => (
              <div key={message.id} className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{gatewayDirectionLabel(message.direction)}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">{message.kind}</span>
                  <span className="ml-auto text-xs text-neutral-500">{new Date(message.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}</div>
                {message.reply ? <div className="mt-1 text-xs text-emerald-600">{message.reply}</div> : null}
                {message.reason ? <div className="mt-1 text-xs text-rose-500">{message.reason}</div> : null}
              </div>
            ))}
          </div>
        </section>

        {status?.logs?.length ? (
          <section className="mt-6 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Gateway 日志</h2>
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

function gatewayChannelStatusLabel(status: GatewayStatus['channels'][number]['status']): string {
  const labels: Record<GatewayStatus['channels'][number]['status'], string> = {
    disconnected: '未连接',
    connecting: '连接中',
    connected: '已连接',
    error: '错误'
  };
  return labels[status];
}

function gatewayDirectionLabel(direction: GatewayMessage['direction']): string {
  return direction === 'inbound' ? '入站' : '出站';
}

function gatewayPermissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    capture: '捕获',
    ask: '提问',
    save_url: '保存 URL',
    save_file: '保存文件',
    summary: '摘要'
  };
  return labels[permission] ?? permission;
}
