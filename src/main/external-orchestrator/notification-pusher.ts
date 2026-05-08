import type { ExternalGatewayNotificationContent, ExternalGatewayTargetUser } from '@shared/external-gateway-protocol';
import { getExternalGatewayRuntime } from './runtime';

export function pushExternalGatewayNotification(
  vaultPath: string,
  target: ExternalGatewayTargetUser,
  content: ExternalGatewayNotificationContent
): void {
  getExternalGatewayRuntime(vaultPath).push({ type: 'notification', target, content });
}

