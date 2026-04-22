import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  decodeMessage,
  encodeMessage,
  startServer,
  type JsonRpcResponse,
  type ToolDefinition
} from '../../src/mcp/protocol';

class CollectingWritable extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _enc: string,
    cb: (err?: Error | null) => void
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    cb();
  }
  text(): string {
    return this.chunks.join('');
  }
  responses(): JsonRpcResponse[] {
    return this.text()
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as JsonRpcResponse);
  }
}

function pipe(): { input: Readable; output: CollectingWritable; push: (s: string) => void } {
  const input = new Readable({ read() {} });
  const output = new CollectingWritable();
  return {
    input,
    output,
    push: (s: string) => input.push(s)
  };
}

const FIXTURE_TOOLS: ToolDefinition[] = [
  {
    name: 'echo',
    description: 'Echo input.',
    inputSchema: {
      type: 'object',
      properties: { msg: { type: 'string' } },
      required: ['msg']
    }
  }
];

async function flush(): Promise<void> {
  // Two macrotask + one microtask drains: line reader emits, handler
  // chain awaits the callTool promise once.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('mcp/protocol framing', () => {
  it('encodeMessage appends a single newline', () => {
    expect(encodeMessage({ jsonrpc: '2.0', id: 1, result: { ok: true } })).toBe(
      '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n'
    );
  });

  it('decodeMessage rejects malformed lines', () => {
    expect(decodeMessage('')).toBeNull();
    expect(decodeMessage('not json')).toBeNull();
    expect(decodeMessage('{"foo":1}')).toBeNull();
    expect(decodeMessage('{"jsonrpc":"1.0","method":"x"}')).toBeNull();
    expect(decodeMessage('{"jsonrpc":"2.0","method":"x"}')).toEqual({
      jsonrpc: '2.0',
      method: 'x'
    });
  });

  it('decodeMessage tolerates whitespace', () => {
    const d = decodeMessage('   {"jsonrpc":"2.0","method":"x","id":7}   ');
    expect(d).toEqual({ jsonrpc: '2.0', method: 'x', id: 7 });
  });
});

describe('mcp/protocol server roundtrip', () => {
  it('answers initialize + tools/list', async () => {
    const { input, output, push } = pipe();
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async () => ({ content: [{ type: 'text', text: 'ignored' }] }),
      input,
      output,
      onError: () => undefined
    });
    push(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
    push(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    await flush();
    const replies = output.responses();
    expect(replies).toHaveLength(2);
    expect(replies[0]!.id).toBe(1);
    expect(replies[0]!.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'orbit', version: '0.1.0' }
    });
    expect((replies[0]!.result as { capabilities: unknown }).capabilities).toEqual({
      tools: { listChanged: false }
    });
    expect(replies[1]!.id).toBe(2);
    const tools = (replies[1]!.result as { tools: ToolDefinition[] }).tools;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('echo');
  });

  it('routes tools/call into the supplied callTool fn', async () => {
    const { input, output, push } = pipe();
    let received: { name: string; args: Record<string, unknown> } | null = null;
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async (name, args) => {
        received = { name, args };
        return { content: [{ type: 'text', text: `pong:${args['msg']}` }] };
      },
      input,
      output,
      onError: () => undefined
    });
    push(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'echo', arguments: { msg: 'hello' } }
      }) + '\n'
    );
    await flush();
    expect(received).toEqual({ name: 'echo', args: { msg: 'hello' } });
    const r = output.responses();
    expect(r[0]!.id).toBe(9);
    const result = r[0]!.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toBe('pong:hello');
  });

  it('returns -32601 for unknown tool names on tools/call', async () => {
    const { input, output, push } = pipe();
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async () => ({ content: [{ type: 'text', text: '' }] }),
      input,
      output,
      onError: () => undefined
    });
    push(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'nope', arguments: {} }
      }) + '\n'
    );
    await flush();
    const r = output.responses();
    expect(r[0]!.error).toMatchObject({ code: -32601 });
  });

  it('returns -32601 for unknown methods', async () => {
    const { input, output, push } = pipe();
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async () => ({ content: [{ type: 'text', text: '' }] }),
      input,
      output,
      onError: () => undefined
    });
    push(JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'resources/list' }) + '\n');
    await flush();
    const r = output.responses();
    expect(r[0]!.error?.code).toBe(-32601);
  });

  it('does not reply to notifications/initialized', async () => {
    const { input, output, push } = pipe();
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async () => ({ content: [{ type: 'text', text: '' }] }),
      input,
      output,
      onError: () => undefined
    });
    push(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await flush();
    expect(output.text()).toBe('');
  });

  it('thrown tool errors are surfaced as isError results, not JSON-RPC errors', async () => {
    const { input, output, push } = pipe();
    startServer({
      serverName: 'orbit',
      serverVersion: '0.1.0',
      tools: FIXTURE_TOOLS,
      callTool: async () => {
        throw new Error('boom');
      },
      input,
      output,
      onError: () => undefined
    });
    push(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'echo', arguments: {} }
      }) + '\n'
    );
    await flush();
    const r = output.responses();
    expect(r[0]!.error).toBeUndefined();
    expect(r[0]!.result).toMatchObject({ isError: true });
  });
});
