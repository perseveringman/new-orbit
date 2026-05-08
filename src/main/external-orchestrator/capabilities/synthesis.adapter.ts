import { SYNTHESIS_KINDS, type SynthesisKind } from '@shared/synthesis';
import { getSynthesisRuntime } from '../../synthesis/ipc';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, stringParam, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleSynthesisRun(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const rawKind = stringParam(decision.params, 'kind') ?? 'summary.daily';
  const kind = SYNTHESIS_KINDS.includes(rawKind as SynthesisKind) ? (rawKind as SynthesisKind) : 'summary.daily';
  const scopeKey = stringParam(decision.params, 'scope_key') ?? `external:${request.user.platform}:${request.user.id}:${kind}`;
  const text = requestText(request, decision.params);
  throwIfAborted(signal);
  const artifact = await getSynthesisRuntime(context.vaultPath).scheduler.ensure({
    kind,
    scope_key: scopeKey,
    sources: [
      {
        kind: 'raw',
        ref: request.requestId,
        title: `External Gateway ${kind}`,
        excerpt: text,
        metadata: { platform: request.user.platform, user_id: request.user.id }
      }
    ],
    priority: 'user-blocking',
    reason: 'manual',
    force: true
  });
  yield {
    type: 'artifact',
    requestId: request.requestId,
    kind: 'synthesis_artifact',
    ref: artifact.id,
    preview: { kind: artifact.kind, status: artifact.status, payload: artifact.payload }
  };
  yield { type: 'request.completed', requestId: request.requestId, summary: `Generated ${artifact.kind} artifact.` };
}

