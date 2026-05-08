import { createInboxService, createInboxStore } from '../../inbox';
import type { ExternalCapabilityContext } from '../capability-registry';
import { stringParam, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleInboxReview(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const action = stringParam(decision.params, 'action');
  const id = stringParam(decision.params, 'id');
  const service = createInboxService(createInboxStore(context.vaultPath));
  throwIfAborted(signal);
  if (action && id) {
    const item = action === 'dismiss'
      ? await service.dismiss(id, { source: 'chat', resolved_by: 'user' })
      : await service.resolve(id, { source: 'chat', resolved_by: 'user' });
    yield {
      type: 'artifact',
      requestId: request.requestId,
      kind: 'approval',
      ref: item.id,
      preview: { title: item.title, status: item.status }
    };
    yield { type: 'request.completed', requestId: request.requestId, summary: `Inbox item ${item.status}: ${item.title}` };
    return;
  }
  const result = await service.list({ status: 'pending', includeArchived: false });
  const pending = result.items.slice(0, 10);
  const text = pending.length
    ? pending.map((item, index) => `${index + 1}. ${item.title} (${item.subtype})`).join('\n')
    : 'Inbox is clear.';
  yield { type: 'text.delta', requestId: request.requestId, text };
  for (const item of pending.slice(0, 3)) {
    yield {
      type: 'card',
      requestId: request.requestId,
      card: {
        title: item.title,
        body: item.summary,
        actions: [
          { id: `resolve:${item.id}`, label: 'Resolve', style: 'primary' },
          { id: `dismiss:${item.id}`, label: 'Dismiss' }
        ]
      }
    };
  }
  yield { type: 'request.completed', requestId: request.requestId, summary: `${pending.length} pending Inbox item(s).` };
}
