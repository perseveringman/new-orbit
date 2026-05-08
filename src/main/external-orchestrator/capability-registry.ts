import type {
  ExternalGatewayCapability,
  ExternalGatewayInboundRequest,
  ExternalGatewayOutboundEvent
} from '@shared/external-gateway-protocol';
import type { ExternalGatewayRouteDecision } from '@shared/external-gateway';
import type { ExternalGatewaySessionBridge } from './session-bridge';
import type { ExternalGatewayStore } from './store';
import { handleAskAnywhere } from './capabilities/ask-anywhere.adapter';
import { handleCaptureNote, handleCaptureThought } from './capabilities/capture.adapter';
import { handleLibrarySave } from './capabilities/library.adapter';
import { handleTaskQuery } from './capabilities/task.adapter';
import { handleInboxReview } from './capabilities/inbox.adapter';
import { handleSynthesisRun } from './capabilities/synthesis.adapter';
import { handleMemoryRecall } from './capabilities/memory.adapter';
import { handleDelegateCodingAgent } from './capabilities/delegate.adapter';

export interface ExternalCapabilityContext {
  vaultPath: string;
  store: ExternalGatewayStore;
  sessionBridge: ExternalGatewaySessionBridge;
}

export type ExternalCapabilityHandler = (
  request: Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>,
  decision: ExternalGatewayRouteDecision,
  context: ExternalCapabilityContext,
  signal: AbortSignal
) => AsyncGenerator<ExternalGatewayOutboundEvent, void, unknown>;

export class ExternalCapabilityRegistry {
  private readonly handlers = new Map<ExternalGatewayCapability, ExternalCapabilityHandler>();

  register(capability: ExternalGatewayCapability, handler: ExternalCapabilityHandler): void {
    this.handlers.set(capability, handler);
  }

  get(capability: ExternalGatewayCapability): ExternalCapabilityHandler | null {
    return this.handlers.get(capability) ?? null;
  }
}

export function createDefaultExternalCapabilityRegistry(): ExternalCapabilityRegistry {
  const registry = new ExternalCapabilityRegistry();
  registry.register('ask_anywhere', handleAskAnywhere);
  registry.register('capture.note', handleCaptureNote);
  registry.register('capture.thought', handleCaptureThought);
  registry.register('library.save', handleLibrarySave);
  registry.register('task.query', handleTaskQuery);
  registry.register('inbox.review', handleInboxReview);
  registry.register('synthesis.run', handleSynthesisRun);
  registry.register('memory.recall', handleMemoryRecall);
  registry.register('delegate.coding_agent', handleDelegateCodingAgent);
  return registry;
}

