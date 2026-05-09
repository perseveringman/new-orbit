import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SDKInvocationInput,
  SDKResolvedInvocation,
  SDKEndpoint,
  SDKToolDef
} from '@shared/runtime';
import type { AgentToolDef } from '@shared/agent-tools';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type {
  AgentLLMClient,
  AgentRuntimeEventSink,
  AgentTurnResult
} from '../src/main/agent-tools/llm-client';
import type { CliHandlerRegistry } from '../src/main/cli_server/registry';
import type { CliRequest, CliResponse } from '@shared/cli_protocol';
import { OrbitToolRegistry } from '../src/main/agent-tools/registry';
import { OrbitToolExecutor } from '../src/main/agent-tools/executor';
import { runAgentLoop } from '../src/main/agent-tools/runner';

// publishTraceableEvent 在没配置 vault 时会 console.error/throw（看 store 实现）。
// 这里 mock 掉，避免污染输出。
vi.mock('../src/main/events/bus', () => ({
  publishTraceableEvent: vi.fn(),
  configureEventReplay: vi.fn(),
  currentEventReplayStore: () => null,
  currentRunRecorder: () => null,
  eventReplayBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

// ---------- Test fixtures ----------

const FAKE_ENDPOINT: SDKEndpoint = {
  id: 'fake-endpoint',
  label: 'Fake',
  provider: 'anthropic',
  protocol: 'anthropic-compatible',
  baseURL: 'https://example.test',
  keyRef: 'fake',
  defaultModel: 'fake-model',
  enabled: true
};

const FAKE_RESOLVED: SDKResolvedInvocation = {
  endpoint: FAKE_ENDPOINT,
  model: 'fake-model',
  apiKey: 'fake-key'
};

const FAKE_TOOL_DEF: AgentToolDef = {
  name: 'orbit_search',
  description: 'fake search',
  cliMethod: 'search',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: { query: { type: 'string' } }
  }
};

const FAKE_TOOL_DEFS: SDKToolDef[] = [
  { name: 'orbit_search', description: 'fake search', input_schema: FAKE_TOOL_DEF.inputSchema }
];

function makeRegistry(defs: AgentToolDef[] = [FAKE_TOOL_DEF]): OrbitToolRegistry {
  const registry = new OrbitToolRegistry();
  registry.registerMany(defs);
  return registry;
}

class FakeCliRegistry implements Pick<CliHandlerRegistry, 'handle'> {
  constructor(
    private readonly handler: (request: CliRequest) => Promise<CliResponse> | CliResponse
  ) {}
  async handle(request: CliRequest): Promise<CliResponse> {
    return this.handler(request);
  }
}

interface ScriptedTurn {
  text?: string;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
}

class FakeLLMClient implements AgentLLMClient {
  public turnCount = 0;
  public observedMessages: SDKInvocationInput['messages'][] = [];
  constructor(private readonly script: ScriptedTurn[]) {}
  async streamAgentTurn(
    _invocation: SDKResolvedInvocation,
    input: SDKInvocationInput,
    emit: AgentRuntimeEventSink
  ): Promise<AgentTurnResult> {
    this.observedMessages.push(input.messages);
    const idx = this.turnCount;
    this.turnCount += 1;
    const scripted = this.script[idx];
    if (!scripted) throw new Error(`fake_llm_exhausted_at_turn_${idx}`);
    const stopReason: AgentTurnResult['stopReason'] = scripted.toolUses?.length
      ? 'tool_use'
      : 'end_turn';
    const text = scripted.text ?? '';
    const assistantBlocks: AgentTurnResult['assistantBlocks'] = [];
    if (text) assistantBlocks.push({ type: 'text', text });
    for (const t of scripted.toolUses ?? []) {
      assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
    }
    if (text) {
      const ev: RuntimeEvent = {
        id: `fake-text-${idx}`,
        at: new Date().toISOString(),
        kind: 'runtime.message',
        conversationId: input.conversationId ?? 'conv',
        runId: input.traceId ?? 'run',
        spanId: `fake-span-${idx}`,
        payload: { text, role: 'assistant', isStreaming: false }
      };
      await emit(ev);
    }
    return {
      assistantBlocks,
      text,
      toolUses: (scripted.toolUses ?? []).map((t) => ({ id: t.id, name: t.name, input: t.input })),
      stopReason,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      eventIds: text ? [`fake-text-${idx}`] : []
    };
  }
}

// ---------- Tests ----------

describe('runAgentLoop', () => {
  let events: RuntimeEvent[];
  beforeEach(() => {
    events = [];
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const sink: AgentRuntimeEventSink = (event) => {
    events.push(event);
  };

  function buildExecutor(handler: (req: CliRequest) => CliResponse | Promise<CliResponse>): OrbitToolExecutor {
    const fakeCli = new FakeCliRegistry(handler) as unknown as CliHandlerRegistry;
    return new OrbitToolExecutor(makeRegistry(), fakeCli);
  }

  it('returns immediately when LLM ends on first turn', async () => {
    const llm = new FakeLLMClient([{ text: 'all good' }]);
    const executor = buildExecutor(() => ({ id: 'x', ok: true, data: {} }));
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 5
      },
      sink
    );
    expect(result.iterations).toBe(1);
    expect(result.stopReason).toBe('end_turn');
    expect(result.text).toBe('all good');
    expect(llm.turnCount).toBe(1);
  });

  it('executes a tool_use then continues until end_turn', async () => {
    const llm = new FakeLLMClient([
      { toolUses: [{ id: 'toolu_a', name: 'orbit_search', input: { query: 'hello' } }] },
      { text: 'done' }
    ]);
    const cliCalls: CliRequest[] = [];
    const executor = buildExecutor((req) => {
      cliCalls.push(req);
      return { id: req.id, ok: true, data: { hits: ['note-1'] } };
    });
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'find me notes' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 5
      },
      sink
    );
    expect(result.iterations).toBe(2);
    expect(result.stopReason).toBe('end_turn');
    expect(result.text).toBe('done');
    expect(cliCalls).toHaveLength(1);
    expect(cliCalls[0]?.method).toBe('search');
    expect(cliCalls[0]?.params).toEqual({ query: 'hello' });
    // 第二轮 LLM 应当看到 user message 里有 tool_result block
    expect(llm.observedMessages[1]).toBeDefined();
    const second = llm.observedMessages[1] ?? [];
    const last = second[second.length - 1];
    expect(last?.role).toBe('user');
    const blocks = Array.isArray(last?.content) ? last?.content : [];
    expect(blocks?.[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_a' });
  });

  it('serialises multiple parallel tool_uses sequentially', async () => {
    const llm = new FakeLLMClient([
      {
        toolUses: [
          { id: 'toolu_1', name: 'orbit_search', input: { query: 'a' } },
          { id: 'toolu_2', name: 'orbit_search', input: { query: 'b' } }
        ]
      },
      { text: 'merged' }
    ]);
    const order: string[] = [];
    const executor = buildExecutor(async (req) => {
      order.push(JSON.stringify(req.params));
      // 微小延迟确保不会并行
      await new Promise((r) => setTimeout(r, 5));
      return { id: req.id, ok: true, data: req.params };
    });
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'multi' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 5
      },
      sink
    );
    expect(result.iterations).toBe(2);
    expect(order).toEqual([JSON.stringify({ query: 'a' }), JSON.stringify({ query: 'b' })]);
  });

  it('treats handler error as isError tool_result and keeps looping', async () => {
    const llm = new FakeLLMClient([
      { toolUses: [{ id: 'toolu_x', name: 'orbit_search', input: { query: 'q' } }] },
      { text: 'recovered' }
    ]);
    const executor = buildExecutor(() => ({
      id: 'x',
      ok: false,
      error: { code: 'invalid_params', message: 'missing query' }
    }));
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 5
      },
      sink
    );
    expect(result.iterations).toBe(2);
    expect(result.text).toBe('recovered');
    const second = llm.observedMessages[1] ?? [];
    const last = second[second.length - 1];
    const blocks = Array.isArray(last?.content) ? last?.content : [];
    expect(blocks?.[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_x',
      is_error: true
    });
  });

  it('stops at maxIterations when LLM keeps requesting tool_use', async () => {
    const script: ScriptedTurn[] = Array.from({ length: 10 }, (_, i) => ({
      toolUses: [{ id: `t-${i}`, name: 'orbit_search', input: { query: 'loop' } }]
    }));
    const llm = new FakeLLMClient(script);
    const executor = buildExecutor((req) => ({ id: req.id, ok: true, data: {} }));
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'spin' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 3
      },
      sink
    );
    expect(result.iterations).toBe(3);
    expect(result.stopReason).toBe('max_iterations');
  });

  it('returns isError for unknown_tool without breaking the loop', async () => {
    const llm = new FakeLLMClient([
      { toolUses: [{ id: 'toolu_unknown', name: 'orbit_nonexistent', input: {} }] },
      { text: 'after-unknown' }
    ]);
    const executor = buildExecutor((req) => ({ id: req.id, ok: true, data: {} }));
    const result = await runAgentLoop(
      llm,
      executor,
      {
        invocation: FAKE_RESOLVED,
        system: 'sys',
        messages: [{ role: 'user', content: 'oops' }],
        tools: FAKE_TOOL_DEFS,
        conversationId: 'conv',
        runId: 'run',
        maxIterations: 5
      },
      sink
    );
    expect(result.iterations).toBe(2);
    expect(result.text).toBe('after-unknown');
    const second = llm.observedMessages[1] ?? [];
    const last = second[second.length - 1];
    const blocks = Array.isArray(last?.content) ? last?.content : [];
    expect(blocks?.[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_unknown',
      is_error: true
    });
    expect(typeof (blocks?.[0] as { content?: string })?.content).toBe('string');
  });
});
