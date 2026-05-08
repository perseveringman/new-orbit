import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ExternalCapabilityContext } from '../capability-registry';
import { requestText, throwIfAborted, type MessageSubmitRequest } from './helpers';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';

export async function* handleDelegateCodingAgent(
  request: MessageSubmitRequest,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
): AsyncGenerator<ExternalGatewayOutboundEvent> {
  const config = await context.store.getConfig();
  if (!config.delegate.enabled) throw new Error('delegate_disabled');
  const prompt = requestText(request, decision.params, 'prompt');
  const session = await context.sessionBridge.resolveSession({ sessionId: request.sessionId, user: request.user });
  throwIfAborted(signal);
  const enrichedPrompt = [
    '# Orbit external delegate context',
    '',
    `- Vault: ${context.vaultPath}`,
    `- External platform: ${request.user.platform}`,
    `- External user: ${request.user.name ?? request.user.id}`,
    `- Orbit conversation: ${session.conversationId}`,
    '',
    await optionalDoc(context.vaultPath, 'docs/VISION.md', 'Product Vision'),
    await optionalDoc(context.vaultPath, 'docs/decisions/ADR-017-external-gateway-via-cc-connect.md', 'ADR-017'),
    '',
    '# User request',
    '',
    prompt
  ].filter(Boolean).join('\n');
  yield {
    type: 'delegate',
    requestId: request.requestId,
    targetAgent: config.delegate.target_agent,
    enrichedPrompt,
    workingDirectory: context.vaultPath
  };
}

async function optionalDoc(vaultPath: string, relPath: string, title: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(vaultPath, relPath), 'utf8');
    return `# ${title}\n\n${raw.slice(0, 4000)}`;
  } catch {
    return '';
  }
}

