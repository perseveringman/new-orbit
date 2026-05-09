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

/**
 * Anthropic 风格的结构化 message content。
 * Phase A：保留 string 形态向后兼容（旧 runSdk 路径）；
 * 新增 block 数组用于多轮 tool_use/tool_result 回灌。
 */
export type SDKInvocationMessageContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type SDKInvocationMessageContent = string | SDKInvocationMessageContentBlock[];

export interface SDKInvocationMessage {
  role: 'user' | 'assistant';
  content: SDKInvocationMessageContent;
}

/** Tool 定义透传到 Anthropic（仅取必要字段）。 */
export interface SDKToolDef {
  name: string;
  description: string;
  input_schema: unknown;
}

export type SDKToolChoice =
  | 'auto'
  | 'any'
  | { type: 'tool'; name: string };

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
  /** Phase A：传递给 Anthropic 的 tools 列表；为空则等价于无 tool_use 能力。 */
  tools?: SDKToolDef[];
  /** Phase A：可选的 tool_choice。 */
  toolChoice?: SDKToolChoice;
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

