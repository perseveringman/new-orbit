import { publishTraceableEvent } from '../events/bus';
import {
  EXTERNAL_GATEWAY_CAPABILITIES,
  isExternalGatewayTerminalEvent,
  type ExternalGatewayArtifactKind,
  type ExternalGatewayInboundRequest,
  type ExternalGatewayOutboundEvent
} from '@shared/external-gateway-protocol';
import type {
  ExternalGatewayConfig,
  ExternalGatewayRequestLogEntry,
  ExternalGatewayRequestOutcome,
  ExternalGatewayStatus
} from '@shared/external-gateway';
import { createDefaultExternalCapabilityRegistry, type ExternalCapabilityHandler } from './capability-registry';
import { routeExternalGatewayIntent } from './intent-router';
import { ExternalGatewaySessionBridge } from './session-bridge';
import { createExternalGatewayStore, type ExternalGatewayStore } from './store';

export class ExternalOrchestrator {
  readonly store: ExternalGatewayStore;
  private readonly registry = createDefaultExternalCapabilityRegistry();
  private readonly sessionBridge: ExternalGatewaySessionBridge;
  private readonly activeRequests = new Map<string, AbortController>();
  private readonly recentRequestIds: string[] = [];
  private readonly rateBuckets = new Map<string, number[]>();

  constructor(private readonly vaultPath: string) {
    this.store = createExternalGatewayStore(vaultPath);
    this.sessionBridge = new ExternalGatewaySessionBridge(vaultPath, this.store);
  }

  async handleInbound(
    request: ExternalGatewayInboundRequest,
    emit: (event: ExternalGatewayOutboundEvent) => void | Promise<void>
  ): Promise<void> {
    if (request.type === 'ping') {
      await emit({ type: 'pong' });
      return;
    }
    if (request.type === 'message.cancel') {
      const controller = this.activeRequests.get(request.requestId);
      if (controller) controller.abort();
      await emit({
        type: 'request.failed',
        requestId: request.requestId,
        error: { code: 'request_cancelled', message: 'Request was cancelled.' }
      });
      return;
    }
    if (request.type === 'session.close') {
      await this.sessionBridge.closeSession(request.sessionId);
      return;
    }

    const receivedAt = new Date().toISOString();
    const config = await this.store.getConfig();
    const artifacts: Array<{ kind: ExternalGatewayArtifactKind; ref: string }> = [];
    const routedTo = await routeExternalGatewayIntent(request);
    let outcome: ExternalGatewayRequestOutcome = 'failed';
    let errorCode: string | undefined;

    try {
      if (this.hasSeenRequest(request.requestId)) {
        outcome = 'rejected';
        errorCode = 'duplicate_request';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: 'duplicate_request' });
        return;
      }
      this.rememberRequest(request.requestId);
      if (!this.store.isAllowed(config, { platform: request.user.platform, userId: request.user.id, name: request.user.name })) {
        outcome = 'rejected';
        errorCode = 'sender_not_allowed';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: 'sender_not_allowed' });
        return;
      }
      const limited = this.rateLimited(config, request.user.platform, request.user.id);
      if (limited) {
        outcome = 'rejected';
        errorCode = 'rate_limited';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: 'rate_limited' });
        return;
      }
      if (!config.capability_permissions[routedTo.capability]) {
        outcome = 'rejected';
        errorCode = 'capability_disabled';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: `capability_disabled:${routedTo.capability}` });
        return;
      }
      if (routedTo.capability === 'delegate.coding_agent' && !config.delegate.enabled) {
        outcome = 'rejected';
        errorCode = 'delegate_disabled';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: 'delegate_disabled' });
        return;
      }
      const handler = this.registry.get(routedTo.capability);
      if (!handler) {
        outcome = 'rejected';
        errorCode = 'capability_not_registered';
        await emit({ type: 'request.rejected', requestId: request.requestId, reason: `capability_not_registered:${routedTo.capability}` });
        return;
      }

      await emit({ type: 'request.accepted', requestId: request.requestId, routedTo: routedTo.capability });
      const controller = new AbortController();
      this.activeRequests.set(request.requestId, controller);
      outcome = await this.runHandler(request, routedTo, handler, controller.signal, artifacts, emit);
    } catch (error) {
      errorCode = error instanceof Error ? error.message.split(':')[0] || 'external_gateway_error' : 'external_gateway_error';
      outcome = errorCode === 'request_cancelled' ? 'cancelled' : 'failed';
      await emit({
        type: 'request.failed',
        requestId: request.requestId,
        error: { code: errorCode, message: error instanceof Error ? error.message : String(error) }
      });
    } finally {
      this.activeRequests.delete(request.requestId);
      await this.logRequest({
        request,
        receivedAt,
        routedTo: routedTo.capability,
        outcome,
        artifacts,
        errorCode
      });
      publishTraceableEvent({
        source: 'conversation',
        kind: 'external.gateway.message',
        summary: routedTo.reasoning,
        payload: {
          platform: request.user.platform,
          userId: request.user.id,
          capability: routedTo.capability,
          requestId: request.requestId,
          outcome
        }
      });
    }
  }

  async status(input: { running: boolean; startedAt?: string; connectedClients: number; lastError?: string }): Promise<ExternalGatewayStatus> {
    const config = await this.store.getConfig();
    const sessions = await this.store.listSessions();
    return {
      running: input.running,
      socket_path: config.socket_path,
      ...(input.startedAt ? { started_at: input.startedAt } : {}),
      connected_clients: input.connectedClients,
      active_requests: this.activeRequests.size,
      active_sessions: sessions.filter((session) => !session.archived).length,
      messages_today: await this.store.messagesToday(),
      ...(input.lastError ? { last_error: input.lastError } : {}),
      capabilities: EXTERNAL_GATEWAY_CAPABILITIES.map((capability) => ({
        capability,
        enabled: Boolean(config.capability_permissions[capability])
      }))
    };
  }

  private async runHandler(
    request: Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>,
    decision: Awaited<ReturnType<typeof routeExternalGatewayIntent>>,
    handler: ExternalCapabilityHandler,
    signal: AbortSignal,
    artifacts: Array<{ kind: ExternalGatewayArtifactKind; ref: string }>,
    emit: (event: ExternalGatewayOutboundEvent) => void | Promise<void>
  ): Promise<ExternalGatewayRequestOutcome> {
    let terminal: ExternalGatewayRequestOutcome | null = null;
    for await (const event of handler(
      request,
      decision,
      { vaultPath: this.vaultPath, store: this.store, sessionBridge: this.sessionBridge },
      signal
    )) {
      if (event.type === 'artifact') artifacts.push({ kind: event.kind, ref: event.ref });
      await emit(event);
      if (isExternalGatewayTerminalEvent(event)) {
        terminal = event.type === 'delegate'
          ? 'delegated'
          : event.type === 'request.completed'
            ? 'completed'
            : event.type === 'request.rejected'
              ? 'rejected'
              : 'failed';
        break;
      }
    }
    if (terminal) return terminal;
    await emit({ type: 'request.completed', requestId: request.requestId });
    return 'completed';
  }

  private async logRequest(input: {
    request: Extract<ExternalGatewayInboundRequest, { type: 'message.submit' }>;
    receivedAt: string;
    routedTo: ExternalGatewayRequestLogEntry['routedTo'];
    outcome: ExternalGatewayRequestOutcome;
    artifacts: Array<{ kind: ExternalGatewayArtifactKind; ref: string }>;
    errorCode?: string;
  }): Promise<void> {
    const finishedAt = new Date().toISOString();
    await this.store.recordRequest({
      requestId: input.request.requestId,
      sessionId: input.request.sessionId,
      platform: input.request.user.platform,
      userId: input.request.user.id,
      receivedAt: input.receivedAt,
      routedTo: input.routedTo,
      outcome: input.outcome,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(input.receivedAt)),
      artifactRefs: input.artifacts,
      ...(input.errorCode ? { errorCode: input.errorCode } : {})
    });
  }

  private hasSeenRequest(requestId: string): boolean {
    return this.recentRequestIds.includes(requestId);
  }

  private rememberRequest(requestId: string): void {
    this.recentRequestIds.push(requestId);
    if (this.recentRequestIds.length > 1000) this.recentRequestIds.splice(0, this.recentRequestIds.length - 1000);
  }

  private rateLimited(config: ExternalGatewayConfig, platform: string, userId: string): boolean {
    const key = `${platform}:${userId}`;
    const now = Date.now();
    const recent = (this.rateBuckets.get(key) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= config.rate_limit.requests_per_minute) {
      this.rateBuckets.set(key, recent);
      return true;
    }
    recent.push(now);
    this.rateBuckets.set(key, recent);
    return false;
  }
}

export function createExternalOrchestrator(vaultPath: string): ExternalOrchestrator {
  return new ExternalOrchestrator(vaultPath);
}
