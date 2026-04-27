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
import type { Conversation, ConversationAnchor, ConversationMeta } from '@shared/conversation';
import type { RuntimeEvent } from '@shared/chat-protocol';
import type { ConversationOrchestrator } from '../conversation/orchestrator';
import type { RunnerPool } from '../agent/pool';
import type { AgentEvent } from '@shared/agent';
import type { AgentRunner } from '../agent/runner';
import { createStageStore, extractArtifactFences } from './stage-store';

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
}

const ASK_ANYWHERE_SYSTEM_PROMPT = `You are Orbit's planning copilot ("Ask Anywhere").

Your job:
  - Help the user think through projects, tasks, and ideas.
  - Use the Bash tool to invoke the local 'orbit' CLI when you need to inspect or modify Orbit data.
    Common commands:
      * orbit project list                         # list current projects
      * orbit task list                            # list tasks (optionally --project <slug>)
      * orbit task propose --project <slug> --title "..." --description "..."
      * orbit thought create --content "..."       # capture a quick thought
  - Always confirm destructive actions with the user before invoking the CLI.
  - Keep responses concise and actionable.
`;

export class AskAnywhereOrchestrator {
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

    const claudePath = await this.deps.resolveClaudePath();
    if (!claudePath) {
      this.emitSyntheticError(
        conversationId,
        'cli_missing',
        'Claude Code CLI not found. Install it from https://docs.claude.com/claude-code'
      );
      throw new Error('cli_missing');
    }

    // 先取历史构造 prompt（不含本条 user message），随后再 append user turn —— 避免重复
    const history = renderHistory(conv.turns);
    const systemPrompt = await loadAskAnywhereSystemPrompt(vault);
    const prompt = buildPrompt({ systemPrompt, history, userText: trimmed });

    // append user turn（必须在 spawn 前，让 UI 即便 reload 也能看到）
    await this.deps.conversations.appendTurn({
      conversationId,
      role: 'user',
      content: trimmed
    });

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
    await this.deps.pool.kill(conv.currentRunId, 'user_stop');
  }

  private async finalizeRun(
    conversationId: string,
    runId: string,
    aggregator: AssistantAggregator
  ): Promise<void> {
    const text = aggregator.toFinalText();
    try {
      if (text) {
        await this.deps.conversations.appendTurn({
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
  history,
  userText
}: {
  systemPrompt: string;
  history: string;
  userText: string;
}): string {
  const parts = [systemPrompt.trim()];
  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
  parts.push(`User: ${userText}`);
  parts.push('Assistant:');
  return parts.join('\n\n');
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
