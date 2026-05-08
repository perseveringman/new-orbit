import type { ExternalGatewayStatus } from '@shared/external-gateway';
import type { ExternalGatewayOutboundEvent } from '@shared/external-gateway-protocol';
import { createExternalOrchestrator, type ExternalOrchestrator } from './orchestrator';
import { ExternalGatewaySocketServer } from './socket-server';

const runtimes = new Map<string, ExternalGatewayRuntime>();

export class ExternalGatewayRuntime {
  private readonly orchestrator: ExternalOrchestrator;
  private server: ExternalGatewaySocketServer | null = null;

  constructor(private readonly vaultPath: string) {
    this.orchestrator = createExternalOrchestrator(vaultPath);
  }

  async start(): Promise<ExternalGatewayStatus> {
    const config = await this.orchestrator.store.getConfig();
    if (!this.server || config.socket_path !== this.serverPath()) {
      if (this.server?.running()) await this.server.stop();
      this.server = new ExternalGatewaySocketServer(this.orchestrator, config.socket_path);
    }
    await this.server.start();
    return this.status();
  }

  async stop(): Promise<ExternalGatewayStatus> {
    await this.server?.stop();
    return this.status();
  }

  async reloadConfig(): Promise<ExternalGatewayStatus> {
    const config = await this.orchestrator.store.getConfig();
    if (this.server?.running()) {
      await this.server.stop();
      if (config.enabled) await this.start();
    }
    return this.status();
  }

  async autoStartIfEnabled(): Promise<void> {
    const config = await this.orchestrator.store.getConfig();
    if (config.enabled) await this.start();
  }

  push(event: ExternalGatewayOutboundEvent): void {
    this.server?.broadcast(event);
  }

  async status(): Promise<ExternalGatewayStatus> {
    return this.orchestrator.status({
      running: this.server?.running() ?? false,
      startedAt: this.server?.started_at(),
      connectedClients: this.server?.connectedClients() ?? 0,
      lastError: this.server?.last_error()
    });
  }

  orchestratorForTesting(): ExternalOrchestrator {
    return this.orchestrator;
  }

  private serverPath(): string {
    return this.server?.path() ?? '';
  }
}

export function getExternalGatewayRuntime(vaultPath: string): ExternalGatewayRuntime {
  const existing = runtimes.get(vaultPath);
  if (existing) return existing;
  const runtime = new ExternalGatewayRuntime(vaultPath);
  runtimes.set(vaultPath, runtime);
  return runtime;
}

export async function stopExternalGatewayRuntime(vaultPath: string): Promise<void> {
  const runtime = runtimes.get(vaultPath);
  if (runtime) await runtime.stop();
}
