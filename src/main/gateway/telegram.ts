import type { ChannelConfig, ChannelInboundMessage, GatewayRouteResult } from '@shared/gateway';

export interface TelegramRuntimeDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface TelegramRuntimeCallbacks {
  onStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', patch?: Partial<ChannelConfig>): void;
  onLog(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
  onBind(code: string, user: { id: string; name?: string }): Promise<{ accepted: boolean; reason?: string }>;
  onInbound(message: ChannelInboundMessage): Promise<GatewayRouteResult>;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const DEFAULT_BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

export async function runTelegramLongPolling(
  channel: ChannelConfig,
  signal: AbortSignal,
  callbacks: TelegramRuntimeCallbacks,
  deps: TelegramRuntimeDeps = {}
): Promise<void> {
  const token = channel.bot_token?.trim();
  if (!token) throw new Error(`Telegram channel "${channel.name}" is missing bot_token`);
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? sleepWithAbort;
  let offset: number | undefined;
  let backoffIndex = 0;

  callbacks.onStatus('connecting');
  const bot = await telegramCall<TelegramUser>(doFetch, token, 'getMe', {});
  callbacks.onStatus('connected', { bot_username: bot.username, last_error: undefined });
  callbacks.onLog('info', `Telegram bot connected as @${bot.username ?? bot.id}`);

  await telegramCall<true>(doFetch, token, 'deleteWebhook', { drop_pending_updates: false });

  if (channel.drop_pending_updates_on_start !== false) {
    const pending = await telegramCall<TelegramUpdate[]>(doFetch, token, 'getUpdates', {
      timeout: 0,
      allowed_updates: ['message']
    });
    const last = pending.at(-1);
    if (last) {
      offset = last.update_id + 1;
      callbacks.onLog('info', `Dropped ${pending.length} pending Telegram update(s) on startup`);
    }
  }

  try {
    while (!signal.aborted) {
      try {
        const updates = await telegramCall<TelegramUpdate[]>(doFetch, token, 'getUpdates', {
          timeout: clampTimeout(channel.poll_timeout_seconds),
          offset,
          allowed_updates: ['message']
        }, signal);
        callbacks.onStatus('connected', { last_error: undefined });
        backoffIndex = 0;
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message) await handleMessage(token, doFetch, channel, update.message, callbacks);
        }
      } catch (error) {
        if (isAbortError(error) || signal.aborted) break;
        const message = error instanceof Error ? error.message : String(error);
        callbacks.onStatus('error', { last_error: message });
        callbacks.onLog('warn', `Telegram polling failed: ${message}`);
        const delay = DEFAULT_BACKOFF_MS[Math.min(backoffIndex, DEFAULT_BACKOFF_MS.length - 1)] ?? 30_000;
        backoffIndex += 1;
        await sleep(delay, signal);
        callbacks.onStatus('connecting');
      }
    }
  } finally {
    callbacks.onStatus('disconnected');
  }
}

async function handleMessage(
  token: string,
  doFetch: typeof fetch,
  channel: ChannelConfig,
  message: TelegramMessage,
  callbacks: TelegramRuntimeCallbacks
): Promise<void> {
  const from = message.from;
  const fromId = String(from?.id ?? message.chat.id);
  const fromName = formatTelegramName(from) ?? formatChatName(message.chat) ?? fromId;
  const text = (message.text ?? message.caption ?? '').trim();
  if (!text) {
    await sendTelegramMessage(doFetch, token, message.chat.id, 'Orbit currently supports Telegram text, links, and captions.');
    return;
  }

  const bindCode = parseBindCommand(text);
  if (bindCode) {
    const bind = await callbacks.onBind(bindCode, { id: fromId, name: fromName });
    await sendTelegramMessage(
      doFetch,
      token,
      message.chat.id,
      bind.accepted ? 'Telegram is now bound to Orbit.' : `Bind failed: ${bind.reason ?? 'invalid code'}.`
    );
    return;
  }

  const routed = await callbacks.onInbound({
    channel_id: channel.id,
    from: { id: fromId, name: fromName, identity_verified: channel.allowed_user_ids?.includes(fromId) },
    kind: /^https?:\/\//i.test(text) ? 'url' : 'text',
    content: text,
    timestamp: new Date(message.date * 1000).toISOString(),
    raw: message
  });
  const reply = routed.reply ?? (routed.accepted ? 'Orbit accepted the message.' : `Orbit rejected the message: ${routed.reason ?? 'unknown'}.`);
  await sendTelegramMessage(doFetch, token, message.chat.id, reply);
}

async function telegramCall<T>(
  doFetch: typeof fetch,
  token: string,
  method: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const response = await doFetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) throw new Error(`Telegram ${method} HTTP ${response.status}`);
  const parsed = (await response.json()) as TelegramApiResponse<T>;
  if (!parsed.ok) throw new Error(parsed.description ?? `Telegram ${method} failed`);
  return parsed.result as T;
}

async function sendTelegramMessage(doFetch: typeof fetch, token: string, chatId: number, text: string): Promise<void> {
  await telegramCall(doFetch, token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

function parseBindCommand(text: string): string | null {
  const match = text.match(/^\/(?:start|bind)(?:@\w+)?\s+([A-Za-z0-9-]{4,32})$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function formatTelegramName(user: TelegramUser | undefined): string | undefined {
  if (!user) return undefined;
  if (user.username) return `@${user.username}`;
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || undefined;
}

function formatChatName(chat: TelegramChat): string | undefined {
  return chat.title ?? chat.username ?? ([chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || undefined);
}

function clampTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(50, Math.max(5, Math.trunc(value ?? 25)));
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
