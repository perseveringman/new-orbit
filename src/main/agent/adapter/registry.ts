import type { RuntimeDescriptor } from '@shared/orchestration';
import { ClaudeRuntimeAdapter } from './claude';
import { CodexRuntimeAdapter } from './codex';
import { CopilotRuntimeAdapter } from './copilot';
import type { RuntimeAdapter, RuntimeAdapterFactory } from './types';

const factories = new Map<RuntimeDescriptor['provider'], RuntimeAdapterFactory>([
  ['claude', (descriptor) => new ClaudeRuntimeAdapter(descriptor)],
  ['codex', (descriptor) => new CodexRuntimeAdapter(descriptor)],
  ['copilot', (descriptor) => new CopilotRuntimeAdapter(descriptor)]
]);

export function registerRuntimeAdapterFactory(
  provider: RuntimeDescriptor['provider'],
  factory: RuntimeAdapterFactory
): void {
  factories.set(provider, factory);
}

export function createRuntimeAdapter(descriptor: RuntimeDescriptor): RuntimeAdapter | null {
  const factory = factories.get(descriptor.provider);
  return factory ? factory(descriptor) : null;
}

export function listRuntimeAdapterProviders(): RuntimeDescriptor['provider'][] {
  return [...factories.keys()];
}
