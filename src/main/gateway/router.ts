import type { ChannelInboundMessage } from '@shared/gateway';

export type GatewayParsedCommand =
  | { kind: 'start'; bind_code?: string }
  | { kind: 'capture'; text: string }
  | { kind: 'ask'; question: string }
  | { kind: 'summary' }
  | { kind: 'url'; url: string }
  | { kind: 'file'; name?: string }
  | { kind: 'text'; text: string };

export function parseGatewayCommand(message: ChannelInboundMessage): GatewayParsedCommand {
  const text = textFromMessage(message);
  const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9-]{4,32}))?$/i);
  if (start) return { kind: 'start', ...(start[1] ? { bind_code: start[1].toUpperCase() } : {}) };
  const capture = text.match(/^\/capture(?:@\w+)?\s+([\s\S]+)/i);
  if (capture?.[1]?.trim()) return { kind: 'capture', text: capture[1].trim() };
  const ask = text.match(/^\/ask(?:@\w+)?\s+([\s\S]+)/i);
  if (ask?.[1]?.trim()) return { kind: 'ask', question: ask[1].trim() };
  if (/^\/summary(?:@\w+)?$/i.test(text)) return { kind: 'summary' };
  if (message.kind === 'file') {
    const name = typeof message.content === 'object' && message.content && 'name' in message.content ? String(message.content.name) : undefined;
    return name ? { kind: 'file', name } : { kind: 'file' };
  }
  if (message.kind === 'url' || /^https?:\/\//i.test(text)) return { kind: 'url', url: text };
  return { kind: 'text', text };
}

export function textFromMessage(message: ChannelInboundMessage): string {
  if (typeof message.content === 'string') return message.content.trim();
  if (typeof message.content === 'object' && message.content && 'text' in message.content) {
    return String((message.content as { text?: unknown }).text ?? '').trim();
  }
  if (typeof message.content === 'object' && message.content && 'url' in message.content) {
    return String((message.content as { url?: unknown }).url ?? '').trim();
  }
  return '';
}
