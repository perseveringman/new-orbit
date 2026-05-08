import { createLibraryService } from '../../capture/library/service';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, stringParam, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleLibrarySave(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const url = stringParam(decision.params, 'url') ?? requestText(request, decision.params);
  throwIfAborted(signal);
  const item = await createLibraryService(context.vaultPath).saveArticle({
    url,
    source: 'share',
    actor: 'user',
    sourceNote: `Saved from ${request.user.platform}`
  });
  yield {
    type: 'artifact',
    requestId: request.requestId,
    kind: 'library_item',
    ref: item.id,
    preview: { title: item.title, summary: item.summary }
  };
  yield { type: 'request.completed', requestId: request.requestId, summary: `Saved to Library: ${item.title}` };
}

