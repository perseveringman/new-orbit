import {
  ASK_INTENT_ROUTES,
  askIntentRouteLabel,
  type AskIntentDecision,
  type AskIntentRoute
} from '@shared/ask-runtime';
import type { ConversationScope } from '@shared/conversation';
import type { RuntimeRouter } from '../runtime/router';
import type { AskIntentConversationContext } from './intent-router';

export interface AskLlmRouteInput {
  router: RuntimeRouter | null;
  text: string;
  scope: ConversationScope;
  skillRefs: string[];
  conversationContext: AskIntentConversationContext;
  fallback: AskIntentDecision;
  conversationId: string;
  runId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_LLM_ROUTE_TIMEOUT_MS = 1_200;

export async function routeAskIntentWithFastModel(
  input: AskLlmRouteInput
): Promise<AskIntentDecision> {
  if (!input.router) return input.fallback;
  if (input.fallback.source === 'explicit' || input.fallback.source === 'slash_command') {
    return input.fallback;
  }

  const abort = createLinkedAbortController(input.signal);
  const timeout = setTimeout(
    () => abort.abort(new Error(`ask_llm_route_timeout:${input.timeoutMs ?? DEFAULT_LLM_ROUTE_TIMEOUT_MS}`)),
    input.timeoutMs ?? DEFAULT_LLM_ROUTE_TIMEOUT_MS
  );

  try {
    const result = await input.router.stream(
      {
        messages: [{ role: 'user', content: buildRoutePrompt(input) }],
        system: ROUTER_SYSTEM_PROMPT,
        conversationId: `${input.conversationId}:intent-router`,
        traceId: `${input.runId}:intent-router`,
        mode: 'background',
        modelTier: 'fast',
        maxTokens: 512,
        temperature: 0,
        signal: abort.signal
      },
      () => []
    );
    const parsed = parseRouteDecision(result.text);
    if (!parsed) return input.fallback;
    const next = normalizeLlmDecision(parsed, input.fallback);

    // Safety boundary: never let the classifier downgrade an obvious mutation into
    // a read-only/direct route. The downstream action route still uses approval tools.
    if (
      input.fallback.route === 'agent_action' &&
      input.fallback.confidence >= 0.72 &&
      next.route !== 'agent_action'
    ) {
      return input.fallback;
    }
    return next;
  } catch {
    return input.fallback;
  } finally {
    clearTimeout(timeout);
  }
}

const ROUTER_SYSTEM_PROMPT = [
  'You are Orbit Ask Anywhere intent router.',
  'Classify the current user message using the recent conversation history.',
  'Return only valid JSON. Do not answer the user.',
  'Prefer the smallest safe route that can handle the request.',
  'If the current message depends on previous turns, use recent_history to resolve pronouns like 这个, 那个, it, continue, or "make it a task".',
  'Never downgrade a request that changes Orbit data into direct_answer.'
].join('\n');

function buildRoutePrompt(input: AskLlmRouteInput): string {
  return JSON.stringify(
    {
      routes: {
        direct_answer: 'Lightweight answer. No local/private/current facts or actions required.',
        vault_qa: 'Question needs Orbit vault notes, projects, tasks, resources, evidence, or prior local context.',
        connector_inventory:
          'Question asks about connector inventories, local AI sessions, runtime sessions, counts, recent sessions, or month/date buckets.',
        research_workflow:
          'Question asks for live web/current/latest/SOTA/news/pricing/regulation/official-doc or source comparison.',
        agent_action:
          'User asks Orbit to create, update, save, archive, schedule, run, or otherwise change data or trigger tools.'
      },
      output_schema: {
        route: ASK_INTENT_ROUTES,
        confidence: 'number from 0 to 1',
        reason: 'short Chinese reason',
        needs_retrieval: 'boolean',
        allows_slow_enrichment: 'boolean'
      },
      current_user_message: input.text,
      scope: input.scope,
      selected_skills: input.skillRefs,
      recent_history: input.conversationContext.recentTurns,
      deterministic_fallback: {
        route: input.fallback.route,
        confidence: input.fallback.confidence,
        reason: input.fallback.reason,
        alternatives: input.fallback.alternatives
      }
    },
    null,
    2
  );
}

function parseRouteDecision(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const match = /\{[\s\S]*\}/u.exec(withoutFence);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeLlmDecision(value: unknown, fallback: AskIntentDecision): AskIntentDecision {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Record<string, unknown>;
  const route = isAskIntentRoute(raw['route']) ? raw['route'] : fallback.route;
  const confidence = clampNumber(raw['confidence'], 0.35, 0.98, fallback.confidence);
  const reason =
    typeof raw['reason'] === 'string' && raw['reason'].trim()
      ? raw['reason'].trim().slice(0, 240)
      : `快速模型判定为 ${askIntentRouteLabel(route)}。`;
  return {
    route,
    confidence,
    source: 'llm',
    reason,
    alternatives: fallback.alternatives,
    needsRetrieval: route !== 'direct_answer',
    allowsSlowEnrichment:
      route === 'vault_qa' || route === 'connector_inventory' || route === 'research_workflow'
  };
}

function isAskIntentRoute(value: unknown): value is AskIntentRoute {
  return typeof value === 'string' && (ASK_INTENT_ROUTES as readonly string[]).includes(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function createLinkedAbortController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!signal) return controller;
  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller;
  }
  signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  return controller;
}
