import { describe, expect, it } from 'vitest';
import { routeAskIntent, shouldEscalateDirectToVault } from '../src/main/ask-runtime/intent-router';
import { routeAskIntentWithFastModel } from '../src/main/ask-runtime/llm-router';
import type { RuntimeRouter } from '../src/main/runtime/router';

describe('Ask Runtime intent router', () => {
  it('keeps small direct asks on the direct route', () => {
    const decision = routeAskIntent({
      text: '你好，解释一下 PM 是什么',
      scope: { kind: 'global' }
    });

    expect(decision.route).toBe('direct_answer');
    expect(decision.needsRetrieval).toBe(false);
  });

  it('routes local knowledge questions to vault QA', () => {
    const decision = routeAskIntent({
      text: '我的 PMIL 上下文和证据层现在有哪些问题？',
      scope: { kind: 'global' }
    });

    expect(decision.route).toBe('vault_qa');
    expect(decision.needsRetrieval).toBe(true);
    expect(decision.reason).toContain('本地证据');
  });

  it('routes connector inventory questions away from generic vault QA', () => {
    const decision = routeAskIntent({
      text: '外部 AI 会话这个连接器 5 月份有多少条 Claude 会话？',
      scope: { kind: 'global' }
    });

    expect(decision.route).toBe('connector_inventory');
    expect(decision.confidence).toBeGreaterThan(0.8);
  });

  it('routes live SOTA research to the research workflow', () => {
    const decision = routeAskIntent({
      text: '联网调研 2026 最 SOTA 的 agent 编排架构，对比官方文档和论文',
      scope: { kind: 'global' }
    });

    expect(decision.route).toBe('research_workflow');
  });

  it('routes mutations to the agent action lane while preserving listing asks', () => {
    const action = routeAskIntent({
      text: '帮我创建一个任务跟进随处问 v2 验证',
      scope: { kind: 'project', project_id: 'orbit' }
    });
    const listing = routeAskIntent({
      text: '最近创建了哪些任务？',
      scope: { kind: 'global' }
    });

    expect(action.route).toBe('agent_action');
    expect(listing.route).not.toBe('agent_action');
  });

  it('can escalate an under-confident direct route when retrieval finds local evidence', () => {
    const decision = routeAskIntent({
      text: '之前那个设计合理吗？',
      scope: { kind: 'global' }
    });

    expect(
      shouldEscalateDirectToVault({ decision, evidenceCount: 2, text: '之前那个设计合理吗？' })
    ).toBe(decision.route === 'direct_answer');
  });

  it('uses recent conversation history to route context-dependent follow-ups', () => {
    const decision = routeAskIntent({
      text: '这个判断对吗？',
      scope: { kind: 'global' },
      conversationContext: {
        recentTurns: [
          {
            role: 'user',
            content: '帮我分析 Orbit 随处问的 PMIL 上下文和本地证据实现。'
          },
          {
            role: 'assistant',
            content: '随处问现在会注入 PMIL ContextPacket 和本地 evidence。'
          }
        ]
      }
    });

    expect(decision.route).toBe('vault_qa');
  });

  it('lets the fast model classifier override low-confidence heuristic routing', async () => {
    const fallback = routeAskIntent({
      text: '这个下一步应该怎么改？',
      scope: { kind: 'global' },
      conversationContext: {
        recentTurns: [{ role: 'user', content: '我们刚才在讨论 SOTA agent 编排调研。' }]
      }
    });
    const router = {
      async stream() {
        return {
          text: JSON.stringify({
            route: 'research_workflow',
            confidence: 0.91,
            reason: '承接前文的 SOTA 调研，需要外部资料。'
          }),
          eventIds: [],
          inputTokens: 10,
          outputTokens: 10
        };
      }
    } as unknown as RuntimeRouter;

    const decision = await routeAskIntentWithFastModel({
      router,
      text: '这个下一步应该怎么改？',
      scope: { kind: 'global' },
      skillRefs: [],
      conversationContext: {
        recentTurns: [{ role: 'user', content: '我们刚才在讨论 SOTA agent 编排调研。' }]
      },
      fallback,
      conversationId: 'c1',
      runId: 'r1'
    });

    expect(decision.route).toBe('research_workflow');
    expect(decision.source).toBe('llm');
  });

  it('does not let the fast model downgrade obvious Orbit mutations', async () => {
    const fallback = routeAskIntent({
      text: '帮我创建一个任务跟进随处问路由改造',
      scope: { kind: 'project', project_id: 'orbit' }
    });
    const router = {
      async stream() {
        return {
          text: JSON.stringify({
            route: 'direct_answer',
            confidence: 0.95,
            reason: '误判为普通建议。'
          }),
          eventIds: [],
          inputTokens: 10,
          outputTokens: 10
        };
      }
    } as unknown as RuntimeRouter;

    const decision = await routeAskIntentWithFastModel({
      router,
      text: '帮我创建一个任务跟进随处问路由改造',
      scope: { kind: 'project', project_id: 'orbit' },
      skillRefs: [],
      conversationContext: { recentTurns: [] },
      fallback,
      conversationId: 'c1',
      runId: 'r1'
    });

    expect(decision.route).toBe('agent_action');
    expect(decision.source).toBe(fallback.source);
  });
});
