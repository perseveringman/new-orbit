/**
 * Ask-Anywhere main 端 orchestrator（M6 / P0）。
 *
 * 职责：
 *  - 创建 / 列出 ad-hoc Ask conversation
 *  - 接收用户消息，调度 Claude runtime，把结果写回 Conversation
 *  - 通过 PoolEvent.conversationId 让 RuntimeEvent 正确路由到 ChatView
 *
 * 设计要点（参考 03-chat-runtime-protocol.md §7.1）：
 *  - 每条用户消息开一次新 run（per-message stateless），把历史 turns 拼进 prompt
 *  - currentRunId 作为并发哨兵：同一 conversation 不允许并发 run
 *  - 失败时 emit synthetic runtime.error，让 ChatView 看得见
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  Conversation,
  ConversationAnchor,
  ConversationMeta,
  ConversationScope
} from '@shared/conversation';
import { conversationScopeKey } from '@shared/conversation';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { SpaceContextBundle } from '@shared/space';
import type { SDKInvocationMessage, SDKToolDef } from '@shared/runtime';
import type { ConversationOrchestrator } from '../conversation/orchestrator';
import type { RunnerPool } from '../agent/pool';
import type { AgentEvent } from '@shared/agent';
import type { AgentRunner } from '../agent/runner';
import type { RuntimeRouter } from '../runtime/router';
import type { OrbitToolRegistry } from '../agent-tools/registry';
import type { OrbitToolExecutor } from '../agent-tools/executor';
import { rebuildMessages } from '../agent-tools/rebuild-messages';
import { readVisionForSystemPrompt } from '../agent-tools/vision-reader';
import { SkillLoader } from '../agent-tools/skill-loader';
import type { LoadedSkill } from '@shared/agent-tools';
import { generateConversationAutoTitle, shouldAutoTitleConversation } from '../conversation/title';
import { createStageStore, extractArtifactFences } from './stage-store';
import { assertInsideVault, toPosix, vaultRel } from '../pathGuard';
import { buildSpaceContext } from '../space/context';

export interface AskAnywhereDeps {
  conversations: ConversationOrchestrator;
  pool: RunnerPool;
  /** 解析 Claude CLI 路径；失败时返回 null。 */
  resolveClaudePath: () => Promise<string | null>;
  /** 当前 vault 根目录；缺失时返回 null。 */
  getVaultPath: () => string | null;
  /** 可选：注入 hook 配置（与 startTask 复用）。 */
  getHookConfig?: () => Promise<
    | undefined
    | {
        port: number;
        token: string;
        version: number;
        vendor?: 'claude' | 'codex' | 'generic';
        worktreeId?: string;
      }
  >;
  /** 可选：API key 注入。 */
  getApiKey?: () => Promise<string | undefined>;
  /** Runtime B SDK router；无可用 SDK endpoint 时返回 null。 */
  getRuntimeRouter?: () => RuntimeRouter | null;
  /**
   * Phase A：注入 agent tool 子系统。
   * 当 toolRegistry + toolExecutor 都提供且 router 可用时，send() 优先走 agent 主循环；
   * 否则降级到旧 SDK completer / CLI 路径。
   */
  getAgentTools?: () => {
    registry: OrbitToolRegistry;
    executor: OrbitToolExecutor;
  } | null;
  /** 单次 agent turn 的循环上限，默认 25。 */
  getAgentMaxIterations?: () => number;
  /**
   * Phase D：累计 input_tokens 超此阈值 → budget_halt。默认 150_000；设 0 禁用。
   */
  getAgentInputTokenBudget?: () => number;
}

export const ASK_ANYWHERE_SYSTEM_PROMPT = `You are Orbit's planning copilot ("Ask Anywhere").

## Your role
You help the user think through projects, tasks, and ideas inside their Orbit vault. You have direct, structured access to vault data through a curated set of Orbit tools — there is no shell, no Bash, and no file system outside those tools.

## How to act on vault data
- Call tools by their **exact names** as listed in the \`tools\` parameter (e.g. \`orbit_search\`, \`orbit_task_list\`, \`orbit_task_propose\`). Tool names start with the prefix \`orbit_\`.
- **Never** output \`\`\`bash / \`\`\`shell / \`\`\`sh code fences. Those are just text to the user — nothing will execute. If you catch yourself about to write one, call the corresponding \`orbit_*\` tool instead.
- **Never** invent tool names like \`bash\`, \`shell\`, \`terminal\`, \`run_command\`. They do not exist. You either have a specific \`orbit_*\` tool for the job, or you don't — if you don't, say so plainly to the user.
- When a tool returns \`is_error: true\`, read the error message carefully, correct the parameter names / values, and call the tool again. Do not give up after one failure.
- If the user explicitly provides an absolute local path outside the vault, you may call \`orbit_read\` on that exact path. Orbit will block and ask the user for approval in chat and Inbox before reading. Never use this to explore broad external locations the user did not name.

## Tool call examples (call exactly like this)
- Inspect a project: call \`orbit_project_overview\` with \`{"id":"<project-slug-or-uid>"}\` (note the key is \`id\`, not \`slug\` or \`project\`).
- List current work: call \`orbit_task_list\` with \`{}\` for all tasks, or \`{"project":"<slug>"}\` to scope to one project.
- Search vault content: call \`orbit_search\` with \`{"query":"<keywords>"}\`.
- Read a specific file: call \`orbit_read\` with \`{"target":"<vault-relative-path>"}\`.
- Propose a new task (requires user approval via Inbox afterwards): call \`orbit_task_propose\` with \`{"title":"<short title>","project_uid":"<uid>","description":"<why & what>"}\`. You need either \`project_uid\` or \`area_uid\`, not both.

## Output format
- When the user asks for data that lives in the vault, first call the relevant tool, then summarise its result in natural language — do not paraphrase without calling the tool.
- Use Chinese or English following the user's language. Keep tool names (\`orbit_*\`) in English verbatim.
- Keep responses concise and actionable. Do not explain your tool choices unless asked.
`;

export class AskAnywhereOrchestrator {
  /** Phase D：每个进行中的 agent run 对应一个 AbortController，stop() 用它真中断 LLM stream。 */
  private readonly agentRunAborts = new Map<string, AbortController>();

  constructor(private readonly deps: AskAnywhereDeps) {}

  async createSession(opts: { title?: string } = {}): Promise<Conversation> {
    const anchor: ConversationAnchor = {
      kind: 'ask_anywhere_session',
      refId: randomUUID(),
      addedAt: new Date().toISOString()
    };
    return this.deps.conversations.createConversation({
      title: opts.title ?? 'Ask Anywhere',
      anchor,
      runtimeHint: 'claude'
    });
  }

  async listSessions(): Promise<ConversationMeta[]> {
    const all = await this.deps.conversations.listConversations();
    return all.filter((conv) => conv.anchors.some((a) => a.kind === 'ask_anywhere_session'));
  }

  /**
   * Channel ingest stub（D-7 P5）：未来 SMS / IM / 邮件等外部入口的统一接入点。
   *
   * 当前行为：
   *   - 找到/创建 anchor=channel_thread,refId=`${source}:${threadId}` 的 Conversation
   *   - 把外部消息写为 user turn
   *   - 暂不自动调度 LLM（等接入策略明确再开）
   */
  async ingestExternalMessage(input: {
    source: string;
    threadId: string;
    text: string;
    title?: string;
  }): Promise<{ conversationId: string }> {
    const refId = `${input.source}:${input.threadId}`;
    const matched = await this.deps.conversations.findByAnchor('channel_thread', refId);
    let conversationId: string;
    if (matched.length > 0 && matched[0]) {
      conversationId = matched[0].id;
    } else {
      const created = await this.deps.conversations.createConversation({
        title: input.title ?? `Channel · ${input.source}`,
        anchor: {
          kind: 'channel_thread',
          refId,
          addedAt: new Date().toISOString()
        },
        runtimeHint: 'claude'
      });
      conversationId = created.id;
    }
    await this.deps.conversations.appendTurn({
      conversationId,
      role: 'user',
      content: input.text
    });
    return { conversationId };
  }

  /**
   * 用户在 Ask-Anywhere 里发消息：
   *  1) 校验会话 + 并发
   *  2) 取历史 turns 构造 prompt
   *  3) spawn Claude run（带 conversationId）
   *  4) 订阅 runner，聚合 assistant 文本 → on exit append assistant turn
   */
  async send(conversationId: string, text: string): Promise<{ runId: string }> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty_message');

    const conv = await this.deps.conversations.getConversation(conversationId);
    if (!conv) throw new Error(`conversation_not_found:${conversationId}`);
    if (conv.anchors.every((a) => a.kind !== 'ask_anywhere_session')) {
      throw new Error('not_ask_anywhere_session');
    }
    if (conv.currentRunId) {
      // 并发哨兵：已有 run 在跑，拒绝
      throw new Error('already_running');
    }

    const vault = this.deps.getVaultPath();
    if (!vault) {
      this.emitSyntheticError(conversationId, 'no_vault', 'No vault open.');
      throw new Error('no_vault');
    }

    // 先取历史构造 prompt（不含本条 user message），随后再 append user turn —— 避免重复
    const history = renderHistory(conv.turns);
    const systemPrompt = await loadAskAnywhereSystemPrompt(vault);
    const scopedContext = await buildConversationContext(vault, conv.scope ?? { kind: 'global' });
    const prompt = buildPrompt({ systemPrompt, scopedContext, history, userText: trimmed });
    const router = this.deps.getRuntimeRouter?.() ?? null;
    const agentTools = this.deps.getAgentTools?.() ?? null;
    const agentReady = Boolean(router && agentTools);
    const decision = router
      ? await router.decide({ mode: 'ask', agentMode: agentReady })
      : { track: 'cli' as const, runtime: 'claude-cli', reason: 'SDK router unavailable' };

    // append user turn（必须在 spawn 前，让 UI 即便 reload 也能看到）
    await this.deps.conversations.appendTurn({
      conversationId,
      role: 'user',
      content: trimmed
    });

    if (router && agentTools && decision.track === 'sdk_agent') {
      const runId = `sdk-agent-${randomUUID()}`;
      await this.deps.conversations.bindRuntime(conversationId, {
        currentRunId: runId,
        runtimeHint: decision.runtime
      });
      void this.runSdkAgentLoop({
        router,
        toolRegistry: agentTools.registry,
        toolExecutor: agentTools.executor,
        conversationId,
        runId,
        systemPrompt,
        scopedContext,
        scope: conv.scope ?? { kind: 'global' },
        turns: conv.turns,
        userText: trimmed,
        endpointId: decision.endpointId,
        model: decision.model
      });
      return { runId };
    }

    // agent 模式被请求但 SDK 不可用：emit 友好错误并停止（不 fallback CLI，避免上下文割裂）。
    if (agentReady && decision.runtime === 'sdk-agent-unavailable') {
      this.emitSyntheticError(
        conversationId,
        'sdk_endpoint_missing',
        'Agent mode requires a configured SDK endpoint with API key. Add one in Settings → AI Endpoints.'
      );
      throw new Error('sdk_endpoint_missing');
    }

    if (router && decision.track === 'sdk') {
      const runId = `sdk-${randomUUID()}`;
      await this.deps.conversations.bindRuntime(conversationId, {
        currentRunId: runId,
        runtimeHint: decision.runtime
      });
      void this.runSdk({
        router,
        conversationId,
        runId,
        systemPrompt,
        scopedContext,
        turns: conv.turns,
        userText: trimmed,
        endpointId: decision.endpointId,
        model: decision.model
      });
      return { runId };
    }

    const claudePath = await this.deps.resolveClaudePath();
    if (!claudePath) {
      this.emitSyntheticError(
        conversationId,
        'cli_missing',
        'Claude Code CLI not found. Configure an SDK endpoint or install Claude Code CLI.'
      );
      throw new Error('cli_missing');
    }

    let hookConfig: Awaited<ReturnType<NonNullable<AskAnywhereDeps['getHookConfig']>>> | undefined;
    try {
      hookConfig = await this.deps.getHookConfig?.();
    } catch {
      hookConfig = undefined;
    }
    const apiKey = await this.deps.getApiKey?.().catch(() => undefined);

    let runner: AgentRunner;
    try {
      runner = await this.deps.pool.spawn({
        claudePath,
        prompt,
        cwd: vault,
        taskId: null,
        title: 'Ask Anywhere',
        vaultPath: vault,
        runtimeProvider: 'claude',
        conversationId,
        ...(hookConfig ? { hookConfig } : {}),
        ...(apiKey ? { apiKey } : {})
      });
    } catch (err) {
      const e = err as Error & { code?: string };
      this.emitSyntheticError(
        conversationId,
        e.code ?? 'spawn_failed',
        e.message ?? 'failed to spawn runtime'
      );
      throw err;
    }

    await this.deps.conversations.bindRuntime(conversationId, {
      currentRunId: runner.runId,
      runtimeHint: 'claude'
    });

    // 聚合 assistant 文本：直接订阅 runner（同步、早于 broadcastPool）
    const aggregator = new AssistantAggregator();
    runner.on('event', (ev: AgentEvent) => aggregator.ingest(ev));
    runner.once('exit', () => {
      void this.finalizeRun(conversationId, runner.runId, aggregator);
    });

    return { runId: runner.runId };
  }

  async stop(conversationId: string): Promise<void> {
    const conv = await this.deps.conversations.getConversation(conversationId);
    if (!conv?.currentRunId) return;
    if (conv.currentRunId.startsWith('sdk-agent-')) {
      // Phase D：真中断 LLM stream；已 started 的 tool execute 仍跑完（cli handler 不接 signal）
      const ctrl = this.agentRunAborts.get(conv.currentRunId);
      if (ctrl) ctrl.abort();
      this.emitRuntimeInterrupt(conversationId, conv.currentRunId, 'user_stop');
      return;
    }
    if (conv.currentRunId.startsWith('sdk-')) {
      this.emitSyntheticError(
        conversationId,
        'sdk_stop_not_supported',
        'SDK streaming cancellation is not available yet.'
      );
      return;
    }
    await this.deps.pool.kill(conv.currentRunId, 'user_stop');
  }

  private emitRuntimeInterrupt(conversationId: string, runId: string, reason: string): void {
    const ev: RuntimeEvent = {
      id: `ask-interrupt-${Date.now()}`,
      at: new Date().toISOString(),
      kind: 'runtime.interrupt',
      conversationId,
      runId,
      spanId: `ask-interrupt-${Date.now()}`,
      payload: { reason }
    };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.chat.runtimeEvent, ev);
    }
  }

  private emitRuntimeBudgetHalt(conversationId: string, runId: string, limit: number): void {
    const ev: RuntimeEvent = {
      id: `ask-budget-halt-${Date.now()}`,
      at: new Date().toISOString(),
      kind: 'runtime.budget_halt',
      conversationId,
      runId,
      spanId: `ask-budget-halt-${Date.now()}`,
      payload: { code: 'input_tokens', limit }
    };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.chat.runtimeEvent, ev);
    }
  }

  private async runSdkAgentLoop(input: {
    router: RuntimeRouter;
    toolRegistry: OrbitToolRegistry;
    toolExecutor: OrbitToolExecutor;
    conversationId: string;
    runId: string;
    systemPrompt: string;
    scopedContext: string;
    scope: ConversationScope;
    turns: Conversation['turns'];
    userText: string;
    endpointId?: string;
    model?: string;
  }): Promise<void> {
    const maxIterations = Math.max(1, Math.min(50, this.deps.getAgentMaxIterations?.() ?? 25));

    // Phase C：加载 skill（应用级 / vault / space 三级合并 + requires detection）
    const vaultPath = this.deps.getVaultPath();
    const skillLoader = new SkillLoader({
      vaultPath,
      scope: input.scope
    });
    const allSkills = await skillLoader.load();
    const activeSkills = allSkills.filter(
      (skill) =>
        !skill.disabledReason &&
        (skill.scopes.length === 0 || skill.scopes.includes(input.scope.kind))
    );

    // 工具按 scope 过滤后，再按激活 skill 的 tools 子集做"显式声明的并集"
    // 规则：若没有任何 active skill 显式声明 tools → 用全集（scope-filtered）
    //       若至少一个 skill 显式声明 tools → 全集 ∩ (∪ skill.tools) ∪ (没声明 tools 的 skill 默认全集)
    const scopedTools = input.toolRegistry.listForScope(input.scope);
    const skillsWithTools = activeSkills.filter((s) => s.tools.length > 0);
    const exposedTools =
      skillsWithTools.length === 0
        ? scopedTools
        : (() => {
            const allowed = new Set<string>();
            for (const skill of skillsWithTools) {
              for (const t of skill.tools) allowed.add(t);
            }
            // 没声明 tools 的 skill 视为不限制（保留全集）
            const hasUnrestricted = activeSkills.some((s) => s.tools.length === 0);
            return scopedTools.filter((t) => hasUnrestricted || allowed.has(t.name));
          })();

    const tools = exposedTools.map<SDKToolDef>((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));

    const visionSection = await readVisionForSystemPrompt(vaultPath);
    const skillsSection = renderSkillsSection(activeSkills);
    const system = [
      visionSection,
      input.systemPrompt.trim(),
      input.scopedContext,
      skillsSection,
      'Tools execute sequentially; prefer to call one tool, observe the result, then decide the next step.'
    ]
      .filter(Boolean)
      .join('\n\n');

    // Phase B：跨 send() 完整回放 assistant.toolTrace 为 Anthropic tool_use/tool_result blocks
    const messages: SDKInvocationMessage[] = rebuildMessages(input.turns, {
      appendUserText: input.userText
    });

    // Phase D：AbortController + token budget
    const abortController = new AbortController();
    this.agentRunAborts.set(input.runId, abortController);
    const inputTokenBudget = this.deps.getAgentInputTokenBudget?.() ?? 150_000;

    try {
      const result = await input.router.runAgentLoop(
        {
          system,
          messages,
          tools,
          conversationId: input.conversationId,
          runId: input.runId,
          maxIterations,
          endpointId: input.endpointId,
          model: input.model,
          mode: 'ask',
          signal: abortController.signal,
          inputTokenBudget
        },
        input.toolExecutor,
        () => BrowserWindow.getAllWindows()
      );

      if (result.stopReason === 'max_iterations') {
        this.emitSyntheticError(
          input.conversationId,
          'agent_max_iterations',
          `Agent reached the iteration limit (${maxIterations}). Please continue with a new message.`
        );
      } else if (result.stopReason === 'budget_halt') {
        this.emitRuntimeBudgetHalt(input.conversationId, input.runId, inputTokenBudget);
        this.emitSyntheticError(
          input.conversationId,
          'agent_budget_halt',
          `Agent stopped: accumulated input tokens (${result.totalInputTokens}) exceeded the budget (${inputTokenBudget}). Please start a new conversation.`
        );
      } else if (result.stopReason === 'aborted') {
        // stop() 已发过 runtime.interrupt，这里不重复
      }

      const finalText = result.text.trim();
      if (finalText) {
        const assistantTurn = await this.deps.conversations.appendTurn({
          conversationId: input.conversationId,
          role: 'assistant',
          content: finalText,
          runtimeEventIds: result.eventIds,
          replayMessages: result.replayMessages,
          ...(result.toolTrace.length > 0 ? { toolTrace: result.toolTrace } : {})
        });
        const vault = this.deps.getVaultPath();
        if (vault) {
          const stage = createStageStore(vault);
          for (const artifact of extractArtifactFences(finalText)) {
            await stage.add(input.conversationId, artifact);
          }
        }
        void this.maybeAutoTitleConversation(input.conversationId, assistantTurn.id).catch((error) =>
          console.warn('[ask-anywhere] auto title failed', error)
        );
      }
    } catch (error) {
      this.emitSyntheticError(
        input.conversationId,
        error instanceof Error
          ? error.message.split(':')[0] || 'sdk_agent_failed'
          : 'sdk_agent_failed',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.agentRunAborts.delete(input.runId);
      await this.deps.conversations
        .bindRuntime(input.conversationId, { currentRunId: null })
        .catch(() => undefined);
    }
  }

  private async runSdk(input: {
    router: RuntimeRouter;
    conversationId: string;
    runId: string;
    systemPrompt: string;
    scopedContext: string;
    turns: Conversation['turns'];
    userText: string;
    endpointId?: string;
    model?: string;
  }): Promise<void> {
    try {
      const result = await input.router.stream(
        {
          endpointId: input.endpointId,
          model: input.model,
          system: [
            input.systemPrompt.trim(),
            input.scopedContext,
            'Runtime note: this SDK route cannot use local tools. Ask for confirmation before any action that would require modifying Orbit data.'
          ]
            .filter(Boolean)
            .join('\n\n'),
          messages: rebuildMessages(input.turns, {
            appendUserText: input.userText
          }),
          traceId: input.runId,
          conversationId: input.conversationId,
          mode: 'ask'
        },
        () => BrowserWindow.getAllWindows()
      );
      const finalText = result.text.trim();
      if (finalText) {
        const assistantTurn = await this.deps.conversations.appendTurn({
          conversationId: input.conversationId,
          role: 'assistant',
          content: finalText,
          runtimeEventIds: result.eventIds,
          replayMessages: result.replayMessages
        });
        const vault = this.deps.getVaultPath();
        if (vault) {
          const stage = createStageStore(vault);
          for (const artifact of extractArtifactFences(finalText)) {
            await stage.add(input.conversationId, artifact);
          }
        }
        void this.maybeAutoTitleConversation(input.conversationId, assistantTurn.id).catch((error) =>
          console.warn('[ask-anywhere] auto title failed', error)
        );
      }
    } catch (error) {
      this.emitSyntheticError(
        input.conversationId,
        error instanceof Error ? error.message.split(':')[0] || 'sdk_failed' : 'sdk_failed',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      await this.deps.conversations
        .bindRuntime(input.conversationId, { currentRunId: null })
        .catch(() => undefined);
    }
  }

  private async finalizeRun(
    conversationId: string,
    runId: string,
    aggregator: AssistantAggregator
  ): Promise<void> {
    const text = aggregator.toFinalText();
    try {
      if (text) {
        const assistantTurn = await this.deps.conversations.appendTurn({
          conversationId,
          role: 'assistant',
          content: text,
          runtimeEventIds: aggregator.eventIds()
        });
        const vault = this.deps.getVaultPath();
        if (vault) {
          const stage = createStageStore(vault);
          for (const artifact of extractArtifactFences(text)) {
            await stage.add(conversationId, artifact);
          }
        }
        void this.maybeAutoTitleConversation(conversationId, assistantTurn.id).catch((error) =>
          console.warn('[ask-anywhere] auto title failed', error)
        );
      }
    } finally {
      await this.deps.conversations
        .bindRuntime(conversationId, { currentRunId: null })
        .catch(() => undefined);
    }
    void runId; // reserved for replay correlation
  }

  private emitSyntheticError(conversationId: string, code: string, message: string): void {
    const ev: RuntimeEvent = {
      id: `ask-error-${Date.now()}`,
      at: new Date().toISOString(),
      kind: 'runtime.error',
      conversationId,
      runId: '',
      spanId: `ask-error-${Date.now()}`,
      payload: { code, message }
    };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.chat.runtimeEvent, ev);
    }
  }

  private async maybeAutoTitleConversation(
    conversationId: string,
    assistantTurnId: string
  ): Promise<void> {
    const conversation = await this.deps.conversations.getConversation(conversationId);
    if (!conversation) return;
    const generated = await generateConversationAutoTitle({
      conversation,
      assistantTurnId,
      router: this.deps.getRuntimeRouter?.() ?? null
    });
    if (!generated) return;
    const latest = await this.deps.conversations.getConversation(conversationId);
    if (!latest || !shouldAutoTitleConversation(latest)) return;
    await this.deps.conversations.updateConversation(conversationId, {
      title: generated.title,
      titleSource: 'auto',
      titleGeneratedFromTurnId: generated.generatedFromTurnId,
      titleConfidence: generated.confidence,
      titleUpdatedAt: new Date().toISOString()
    });
  }
}

class AssistantAggregator {
  private texts: string[] = [];
  private ids: string[] = [];

  ingest(ev: AgentEvent): void {
    if ((ev.kind === 'message' || ev.kind === 'text') && typeof ev.text === 'string' && ev.text) {
      this.texts.push(ev.text);
      this.ids.push(`agent-event-${ev.idx}`);
    }
  }

  toFinalText(): string {
    return this.texts.join('').trim();
  }

  eventIds(): string[] {
    return this.ids.slice();
  }
}

function renderHistory(turns: Conversation['turns']): string {
  if (turns.length === 0) return '';
  return turns
    .map((t) => {
      const tag = t.role === 'user' ? 'User' : t.role === 'assistant' ? 'Assistant' : 'System';
      return `${tag}: ${t.content}`;
    })
    .join('\n\n');
}

function buildPrompt({
  systemPrompt,
  scopedContext,
  history,
  userText
}: {
  systemPrompt: string;
  scopedContext: string;
  history: string;
  userText: string;
}): string {
  const parts = [systemPrompt.trim()];
  if (scopedContext) parts.push(scopedContext);
  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
  parts.push(`User: ${userText}`);
  parts.push('Assistant:');
  return parts.join('\n\n');
}

async function buildConversationContext(
  vaultPath: string,
  scope: ConversationScope
): Promise<string> {
  try {
    switch (scope.kind) {
      case 'project':
        return renderSpaceContext(
          await buildSpaceContext(vaultPath, scope.project_id, { summary: true })
        );
      case 'area':
        return renderSpaceContext(
          await buildSpaceContext(vaultPath, scope.area_slug, { summary: true })
        );
      case 'resource':
        return renderSpaceContext(
          await buildSpaceContext(vaultPath, scope.resource_slug, { summary: true })
        );
      case 'note':
        return await renderNoteContext(vaultPath, scope.note_id);
      case 'task':
        return `<current_orbit_context>\nScope: task:${scope.task_id}\nProject: ${scope.project_id ?? 'unknown'}\nUse orbit task/project CLI commands if more details are needed.\n</current_orbit_context>`;
      case 'library':
        return `<current_orbit_context>\nScope: library:${scope.item_id}\nUse orbit CLI or vault search to inspect this Library item before acting.\n</current_orbit_context>`;
      case 'external':
        return `<current_orbit_context>\nScope: external:${scope.platform}:${scope.user_id}\nSession: ${scope.session_id ?? 'current'}\n</current_orbit_context>`;
      case 'global':
        return `<current_orbit_context>\nScope: global\nUse the user's Vision, active Projects, Areas, Resources, Inbox, and Timeline as the default Orbit context.\n</current_orbit_context>`;
    }
  } catch (error) {
    return `<current_orbit_context>\nScope: ${conversationScopeKey(scope)}\nContext lookup failed: ${(error as Error).message}\nUse the Orbit CLI to inspect this scope if needed.\n</current_orbit_context>`;
  }
}

function renderSpaceContext(bundle: SpaceContextBundle): string {
  const tasks = [
    ...bundle.tasks.doing.map((task) => `doing: ${task.title}`),
    ...bundle.tasks.awaiting_user.map((task) => `blocked: ${task.title}`),
    ...bundle.tasks.todo.slice(0, 8).map((task) => `todo: ${task.title}`)
  ];
  return `<current_orbit_context>
Scope: ${bundle.space.type}:${bundle.space.slug}
Name: ${bundle.space.name}
Status: ${bundle.space.status}
Tags: ${bundle.space.tags.join(', ') || 'none'}
Description:
${clip(bundle.info.description, 1800) || '(none)'}
Tasks:
${tasks.length ? tasks.map((task) => `- ${task}`).join('\n') : '- none'}
Materials: ${bundle.materials.scopes.length} scope(s), ${bundle.materials.pins.length} pin(s)
Outputs:
${
  bundle.outputs.length
    ? bundle.outputs
        .slice(0, 8)
        .map((output) => `- ${output.title} (${output.path})`)
        .join('\n')
    : '- none'
}
</current_orbit_context>`;
}

async function renderNoteContext(vaultPath: string, noteId: string): Promise<string> {
  const absPath = assertInsideVault(vaultPath, noteId);
  const raw = await fs.readFile(absPath, 'utf8');
  return `<current_orbit_context>
Scope: note:${toPosix(vaultRel(vaultPath, absPath))}
Note excerpt:
${clip(raw, 4000)}
</current_orbit_context>`;
}

function clip(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}\n…` : trimmed;
}

/**
 * 优先读取 vault 内 `.orbit/skills/ask-anywhere-planning.md`，
 * 失败则回退到内置 ASK_ANYWHERE_SYSTEM_PROMPT（D-7 P4.1 skill 化）。
 */
async function loadAskAnywhereSystemPrompt(vaultPath: string): Promise<string> {
  const skillFile = path.join(vaultPath, '.orbit', 'skills', 'ask-anywhere-planning.md');
  try {
    const raw = await fs.readFile(skillFile, 'utf8');
    if (raw.trim().length > 0) return raw;
  } catch {
    /* fallback to default */
  }
  return ASK_ANYWHERE_SYSTEM_PROMPT;
}

/**
 * Phase C：把激活的 skill 渲染成 system prompt 段落。
 * 仅 body 非空的 skill 才出现在段落里；description 作为可选小标题前缀。
 */
function renderSkillsSection(skills: LoadedSkill[]): string {
  const usable = skills.filter((s) => s.body.length > 0);
  if (usable.length === 0) return '';
  const blocks = usable.map((s) => {
    const header = `### Skill: ${s.name}${s.description ? ` — ${s.description}` : ''}`;
    return `${header}\n\n${s.body}`;
  });
  return ['## Active Skills', ...blocks].join('\n\n');
}
