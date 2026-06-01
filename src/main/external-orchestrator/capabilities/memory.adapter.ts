import { recallActiveMemoryContext } from '../../memory/backend-registry';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleMemoryRecall(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const query = requestText(request, decision.params, 'query');
  throwIfAborted(signal);
  const result = await recallActiveMemoryContext(context.vaultPath, query, {
    max_memories: 5,
    triggered_by: { kind: 'ask', ref: request.requestId },
    used_in: 'question_answer'
  });
  const text = result.memories.length
    ? result.memories
        .map((memory, index) => {
          const match = result.matches.find((item) => item.memory_id === memory.id);
          const reason = match?.reasons[0] ? ` (${match.reasons[0]})` : '';
          return `${index + 1}. [${memory.layer}/${memory.kind}] ${memory.title}: ${memory.summary}${reason}`;
        })
        .join('\n')
    : result.explanation;
  yield { type: 'text.delta', requestId: request.requestId, text };
  for (const memory of result.memories.slice(0, 3)) {
    yield {
      type: 'artifact',
      requestId: request.requestId,
      kind: 'memory',
      ref: memory.id,
      preview: { title: memory.title, summary: memory.summary, layer: memory.layer, confidence: memory.confidence }
    };
  }
  yield { type: 'request.completed', requestId: request.requestId, summary: `Recalled ${result.memories.length} memory item(s).` };
}
