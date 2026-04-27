import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGatewayStore } from '../src/main/gateway/store';
import { runTelegramLongPolling } from '../src/main/gateway/telegram';
import { configureActivityEmitter } from '../src/main/activity';
import type { ChannelConfig, ChannelInboundMessage } from '../src/shared/gateway';

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-gateway-'));
  configureActivityEmitter(vaultPath);
});

afterEach(async () => {
  configureActivityEmitter(null);
  await fs.rm(vaultPath, { recursive: true, force: true });
});

describe('Gateway runtime', () => {
  it('requires Telegram binding before routing and accepts a valid bind code', async () => {
    const store = createGatewayStore(vaultPath);
    const config = await store.addChannel({
      kind: 'telegram',
      name: 'Telegram',
      enabled: true,
      bot_token: 'token',
      allowed_user_ids: [],
      require_bind: true
    });
    const channel = config.channels[0]!;

    const rejected = await store.routeInbound({
      channel_id: channel.id,
      from: { id: '42', name: 'Ryan' },
      kind: 'text',
      content: '# first thought',
      timestamp: new Date().toISOString()
    });
    expect(rejected).toMatchObject({ accepted: false, reason: 'sender_not_bound' });

    const bind = await store.generateBindCode();
    const accepted = await store.bindTelegramUser(channel.id, bind.code, { id: '42', name: 'Ryan' });
    expect(accepted.accepted).toBe(true);

    const routed = await store.routeInbound({
      channel_id: channel.id,
      from: { id: '42', name: 'Ryan' },
      kind: 'text',
      content: '# second thought',
      timestamp: new Date().toISOString()
    });
    expect(routed.accepted).toBe(true);
    expect(routed.artifact?.kind).toBe('thought');
    expect(routed.reply).toBe('Captured as a Thought.');
  });

  it('polls Telegram updates, routes inbound text, and sends a reply', async () => {
    const controller = new AbortController();
    const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
    const inbound: ChannelInboundMessage[] = [];
    let getUpdatesCount = 0;
    const channel: ChannelConfig = {
      id: 'telegram-1',
      kind: 'telegram',
      name: 'Telegram',
      enabled: true,
      bot_token: '123:abc',
      allowed_user_ids: ['42'],
      require_bind: true,
      drop_pending_updates_on_start: false,
      poll_timeout_seconds: 5
    };

    const fakeFetch: typeof fetch = async (input, init) => {
      const method = String(input).split('/').pop() ?? '';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
      requests.push({ method, body });
      if (method === 'getMe') return json({ id: 100, username: 'orbit_bot' });
      if (method === 'deleteWebhook') return json(true);
      if (method === 'getUpdates') {
        getUpdatesCount += 1;
        return json(
          getUpdatesCount === 1
            ? [
                {
                  update_id: 7,
                  message: {
                    message_id: 9,
                    date: 1_776_000_000,
                    chat: { id: 42, type: 'private' },
                    from: { id: 42, first_name: 'Ryan', username: 'ryan' },
                    text: 'hello orbit'
                  }
                }
              ]
            : []
        );
      }
      if (method === 'sendMessage') {
        controller.abort();
        return json(true);
      }
      throw new Error(`unexpected Telegram method ${method}`);
    };

    await runTelegramLongPolling(
      channel,
      controller.signal,
      {
        onStatus: () => undefined,
        onLog: () => undefined,
        onBind: async () => ({ accepted: false, reason: 'not_expected' }),
        onInbound: async (message) => {
          inbound.push(message);
          return { accepted: true, reply: 'Routed to Orbit.' };
        }
      },
      { fetch: fakeFetch }
    );

    expect(inbound).toHaveLength(1);
    expect(inbound[0]?.content).toBe('hello orbit');
    expect(inbound[0]?.from).toMatchObject({ id: '42', name: '@ryan', identity_verified: true });
    const sendMessage = requests.find((request) => request.method === 'sendMessage');
    expect(sendMessage?.body).toMatchObject({ chat_id: 42, text: 'Routed to Orbit.' });
  });
});

function json<T>(result: T): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
