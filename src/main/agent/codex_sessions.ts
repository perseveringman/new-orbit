import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import type { TerminalAgentSessionMessageDTO } from '@shared/ipc';

function extractResponseItemText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts = content
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const block = entry as { type?: unknown; text?: unknown };
      if (
        (block.type === 'input_text' || block.type === 'output_text') &&
        typeof block.text === 'string'
      ) {
        return block.text.trim();
      }
      return '';
    })
    .filter(Boolean);
  return parts.join('\n\n');
}

async function findCodexSessionFile(dir: string, sessionId: string): Promise<string | null> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findCodexSessionFile(next, sessionId);
      if (found) return found;
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
      return next;
    }
  }

  return null;
}

export async function readCodexSessionMessages(
  root: string,
  sessionId: string
): Promise<TerminalAgentSessionMessageDTO[]> {
  const filePath = await findCodexSessionFile(path.join(root, 'sessions'), sessionId);
  if (!filePath) return [];

  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const eventMessages: TerminalAgentSessionMessageDTO[] = [];
  const responseMessages: TerminalAgentSessionMessageDTO[] = [];

  for (const [index, line] of lines.entries()) {
    try {
      const row = JSON.parse(line) as {
        timestamp?: unknown;
        type?: unknown;
        payload?: {
          type?: unknown;
          role?: unknown;
          message?: unknown;
          content?: unknown;
        };
      };
      const at = typeof row.timestamp === 'string' ? row.timestamp : null;
      if (!at) continue;

      if (row.type === 'event_msg') {
        const payloadType = row.payload?.type;
        const message = row.payload?.message;
        if (payloadType === 'user_message' && typeof message === 'string' && message.trim()) {
          eventMessages.push({
            id: `${sessionId}:event-user:${index}`,
            role: 'user',
            text: message.trim(),
            at
          });
        } else if (
          payloadType === 'agent_message' &&
          typeof message === 'string' &&
          message.trim()
        ) {
          eventMessages.push({
            id: `${sessionId}:event-assistant:${index}`,
            role: 'assistant',
            text: message.trim(),
            at
          });
        }
        continue;
      }

      if (row.type === 'response_item' && row.payload?.type === 'message') {
        const role = row.payload.role;
        if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
        const text = extractResponseItemText(row.payload.content);
        if (!text) continue;
        responseMessages.push({
          id: `${sessionId}:response:${index}`,
          role,
          text,
          at
        });
      }
    } catch {
      // ignore malformed rows
    }
  }

  return eventMessages.length > 0 ? eventMessages : responseMessages;
}
