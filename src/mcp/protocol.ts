/**
 * Minimal MCP server over JSON-RPC 2.0 / NDJSON stdio.
 *
 * The official Model Context Protocol stdio transport frames messages as
 * newline-delimited JSON (one JSON-RPC object per line, no embedded
 * newlines). This module implements just enough of that protocol for
 * Claude Code to discover and call tools registered by `src/mcp/tools.ts`.
 *
 * Methods implemented:
 *   - initialize             (handshake)
 *   - notifications/initialized  (client → server, no reply)
 *   - tools/list             (advertise available tools)
 *   - tools/call             (invoke a tool)
 *
 * No support for resources / prompts / sampling — those are out of scope
 * for R5 and Claude Code degrades gracefully when missing.
 */

import { Readable, Writable } from 'node:stream';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  /** Plain-text content blocks; MCP also supports image/resource blocks. */
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ServerOptions {
  serverName: string;
  serverVersion: string;
  protocolVersion?: string;
  tools: ToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Optional input/output streams (defaults to stdin/stdout). */
  input?: Readable;
  output?: Writable;
  /** Optional sink for human-readable diagnostics (defaults to stderr). */
  onError?: (msg: string) => void;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

export const ERR_PARSE = -32700;
export const ERR_INVALID_REQUEST = -32600;
export const ERR_METHOD_NOT_FOUND = -32601;
export const ERR_INVALID_PARAMS = -32602;
export const ERR_INTERNAL = -32603;

/** Encode an outbound message as a single NDJSON line. */
export function encodeMessage(msg: JsonRpcResponse | JsonRpcNotification): string {
  return JSON.stringify(msg) + '\n';
}

/**
 * Parse a single NDJSON line into a JSON-RPC request/notification. Returns
 * `null` on syntax errors so the caller can emit a -32700 response.
 */
export function decodeMessage(
  line: string
): JsonRpcRequest | JsonRpcNotification | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return null;
    if (obj['jsonrpc'] !== '2.0' || typeof obj['method'] !== 'string') return null;
    return obj as unknown as JsonRpcRequest | JsonRpcNotification;
  } catch {
    return null;
  }
}

/** Convenience: line-buffered NDJSON reader. */
export function makeLineReader(
  input: Readable,
  onLine: (line: string) => void
): void {
  let buf = '';
  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      onLine(line);
      nl = buf.indexOf('\n');
    }
  });
  input.on('end', () => {
    if (buf.length > 0) {
      onLine(buf);
      buf = '';
    }
  });
}

/**
 * Run the MCP server on the supplied (or default) stdio. Returns a
 * `stop()` function for tests that want to tear the loop down without
 * killing the process.
 */
export function startServer(opts: ServerOptions): { stop: () => void } {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const onError = opts.onError ?? ((m) => process.stderr.write(`${m}\n`));
  const protocolVersion = opts.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;

  const send = (msg: JsonRpcResponse | JsonRpcNotification): void => {
    try {
      output.write(encodeMessage(msg));
    } catch (e) {
      onError(`mcp send failed: ${(e as Error).message}`);
    }
  };

  const reply = (id: number | string, result: unknown): void =>
    send({ jsonrpc: '2.0', id, result });
  const errorReply = (
    id: number | string | null,
    code: number,
    message: string,
    data?: unknown
  ): void => {
    const resp: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: id as number | string | null,
      error: data === undefined ? { code, message } : { code, message, data }
    };
    send(resp);
  };

  let stopped = false;

  makeLineReader(input, (line) => {
    if (stopped) return;
    const msg = decodeMessage(line);
    if (!msg) {
      if (line.trim().length > 0) {
        errorReply(null, ERR_PARSE, 'parse error');
      }
      return;
    }
    void handle(msg).catch((e: Error) => onError(`mcp handler crash: ${e.message}`));
  });

  async function handle(
    msg: JsonRpcRequest | JsonRpcNotification
  ): Promise<void> {
    const method = msg.method;
    const id = (msg as JsonRpcRequest).id;
    const isRequest = id !== undefined;

    if (method === 'initialize' && isRequest) {
      reply(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: opts.serverName, version: opts.serverVersion }
      });
      return;
    }

    if (method === 'notifications/initialized' || method === 'initialized') {
      // notification — no reply
      return;
    }

    if (method === 'tools/list' && isRequest) {
      reply(id, {
        tools: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      });
      return;
    }

    if (method === 'tools/call' && isRequest) {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      const name = typeof params['name'] === 'string' ? (params['name'] as string) : '';
      const args =
        params['arguments'] && typeof params['arguments'] === 'object'
          ? (params['arguments'] as Record<string, unknown>)
          : {};
      if (!name) {
        errorReply(id, ERR_INVALID_PARAMS, 'tools/call: missing "name"');
        return;
      }
      const known = opts.tools.find((t) => t.name === name);
      if (!known) {
        errorReply(id, ERR_METHOD_NOT_FOUND, `unknown tool: ${name}`);
        return;
      }
      try {
        const out = await opts.callTool(name, args);
        reply(id, {
          content: out.content,
          isError: !!out.isError
        });
      } catch (e) {
        const errMsg = (e as Error).message ?? String(e);
        // Tool failures are reported as MCP "isError" results (per spec)
        // rather than JSON-RPC errors so the model can read the message.
        reply(id, {
          content: [{ type: 'text', text: errMsg }],
          isError: true
        });
      }
      return;
    }

    if (method === 'ping' && isRequest) {
      reply(id, {});
      return;
    }

    if (isRequest) {
      errorReply(id, ERR_METHOD_NOT_FOUND, `method not found: ${method}`);
    }
  }

  return {
    stop: (): void => {
      stopped = true;
    }
  };
}
