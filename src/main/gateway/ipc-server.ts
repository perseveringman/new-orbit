import { EventEmitter } from 'node:events';
import type { GatewayStatus } from '@shared/gateway';

export class GatewayIpcServer {
  private readonly emitter = new EventEmitter();

  publishStatus(status: GatewayStatus): void {
    this.emitter.emit('status', status);
  }

  onStatus(listener: (status: GatewayStatus) => void): () => void {
    this.emitter.on('status', listener);
    return () => this.emitter.off('status', listener);
  }
}
