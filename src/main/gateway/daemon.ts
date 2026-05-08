import { GatewayRuntime, getGatewayRuntime, stopGatewayRuntime } from './runtime';

export class GatewayDaemon {
  constructor(private vaultPath: string) {}

  runtime(): GatewayRuntime {
    return getGatewayRuntime(this.vaultPath);
  }

  setVaultPath(vaultPath: string): void {
    this.vaultPath = vaultPath;
  }

  start(): ReturnType<GatewayRuntime['start']> {
    return this.runtime().start();
  }

  stop(): ReturnType<GatewayRuntime['stop']> {
    return this.runtime().stop();
  }
}

export { getGatewayRuntime, stopGatewayRuntime };
