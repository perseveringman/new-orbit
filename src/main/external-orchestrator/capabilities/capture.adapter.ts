import { createNoteStore } from '../../note/store';
import { createThoughtService } from '../../capture/thoughts/service';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, throwIfAborted, titleFromText, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleCaptureNote(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const text = requestText(request, decision.params);
  throwIfAborted(signal);
  const note = await createNoteStore(context.vaultPath).create({
    type: 'capture',
    title: titleFromText(text, 'External capture'),
    body: text,
    tags: ['external-gateway', request.user.platform],
    source: { kind: 'manual', ref: `${request.user.platform}:${request.user.id}` }
  });
  yield {
    type: 'artifact',
    requestId: request.requestId,
    kind: 'note',
    ref: note.frontmatter.id,
    preview: { title: note.frontmatter.title, path: note.path }
  };
  yield { type: 'request.completed', requestId: request.requestId, summary: `Captured as "${note.frontmatter.title}".` };
}

export async function* handleCaptureThought(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const text = requestText(request, decision.params);
  throwIfAborted(signal);
  const thought = await createThoughtService(context.vaultPath).create({
    content: text,
    tags: ['external-gateway', request.user.platform],
    createdFrom: 'manual',
    actor: 'user',
    actorId: `${request.user.platform}:${request.user.id}`
  });
  yield {
    type: 'artifact',
    requestId: request.requestId,
    kind: 'thought',
    ref: thought.id,
    preview: { title: thought.title, summary: thought.summary }
  };
  yield { type: 'request.completed', requestId: request.requestId, summary: `Captured thought "${thought.title}".` };
}

