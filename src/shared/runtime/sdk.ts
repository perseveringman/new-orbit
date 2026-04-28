export const SDK_ENDPOINT_PROVIDERS = ['anthropic', 'minimax', 'deepseek', 'custom'] as const;
export type SDKEndpointProvider = (typeof SDK_ENDPOINT_PROVIDERS)[number];

export type SDKEndpointProtocol = 'anthropic-compatible';

export interface SDKCostProfile {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
}

export interface SDKEndpoint {
  id: string;
  label: string;
  provider: SDKEndpointProvider;
  protocol: SDKEndpointProtocol;
  baseURL: string;
  keyRef: string;
  defaultModel: string;
  modelAlias?: Record<string, string>;
  costProfile?: SDKCostProfile;
  enabled: boolean;
  builtIn?: boolean;
}

export interface SDKEndpointSecretState {
  configured: boolean;
  masked?: string;
}

export interface SDKEndpointView extends Omit<SDKEndpoint, 'keyRef'> {
  keyConfigured: boolean;
  keyMasked?: string;
}

export interface SDKEndpointInput {
  id?: string;
  label: string;
  provider: SDKEndpointProvider;
  protocol?: SDKEndpointProtocol;
  baseURL: string;
  defaultModel: string;
  modelAlias?: Record<string, string>;
  costProfile?: SDKCostProfile;
  enabled?: boolean;
  apiKey?: string;
}

export interface SDKEndpointDefaults {
  ask?: string;
  synthesis?: string;
  background?: string;
}

export interface SDKEndpointRegistrySnapshot {
  endpoints: SDKEndpointView[];
  defaults: SDKEndpointDefaults;
}

export interface SDKInvocationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SDKInvocationInput {
  endpointId?: string;
  model?: string;
  system?: string;
  messages: SDKInvocationMessage[];
  maxTokens?: number;
  temperature?: number;
  traceId?: string;
  conversationId?: string;
  mode?: 'ask' | 'synthesis' | 'background';
}

export interface SDKResolvedInvocation {
  endpoint: SDKEndpoint;
  model: string;
  apiKey: string;
}

export interface SDKEndpointTestResult {
  ok: boolean;
  endpointId: string;
  model?: string;
  latencyMs?: number;
  message?: string;
  error?: string;
}

export interface SDKCostEstimateInput {
  profile?: SDKCostProfile;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface SDKCostEstimate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalUsd?: number;
}

export function maskSecret(secret: string | null | undefined): string | undefined {
  if (!secret) return undefined;
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export function endpointView(endpoint: SDKEndpoint, secret: SDKEndpointSecretState): SDKEndpointView {
  const { keyRef: _keyRef, ...rest } = endpoint;
  void _keyRef;
  return {
    ...rest,
    keyConfigured: secret.configured,
    ...(secret.masked ? { keyMasked: secret.masked } : {})
  };
}

export function resolveModelAlias(endpoint: SDKEndpoint, modelHint?: string): string {
  const requested = modelHint?.trim() || endpoint.defaultModel;
  return endpoint.modelAlias?.[requested] ?? requested;
}

