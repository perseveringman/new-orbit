import type {
  SDKEndpointDefaults,
  SDKEndpointRegistrySnapshot,
  SDKEndpointSecretState
} from './runtime';

export const AI_EMBEDDING_PROVIDER_TYPES = ['local', 'openai-compatible', 'volcengine'] as const;
export type AIEmbeddingProviderType = (typeof AI_EMBEDDING_PROVIDER_TYPES)[number];

export const AI_EMBEDDING_PROTOCOLS = ['local', 'openai-compatible', 'volcengine-ark-multimodal'] as const;
export type AIEmbeddingProtocol = (typeof AI_EMBEDDING_PROTOCOLS)[number];

export interface AIEmbeddingProvider {
  id: string;
  label: string;
  provider: AIEmbeddingProviderType;
  protocol: AIEmbeddingProtocol;
  model: string;
  dimensions: number;
  baseURL?: string;
  keyRef?: string;
  enabled: boolean;
  builtIn?: boolean;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export interface AIEmbeddingSecretState extends SDKEndpointSecretState {
  apiKeyMasked?: string;
}

export interface AIEmbeddingProviderView extends Omit<AIEmbeddingProvider, 'keyRef'> {
  keyConfigured: boolean;
  keyMasked?: string;
  secret: AIEmbeddingSecretState;
}

export interface AIEmbeddingProviderInput {
  id?: string;
  label: string;
  provider: AIEmbeddingProviderType;
  protocol?: AIEmbeddingProtocol;
  model: string;
  dimensions: number;
  baseURL?: string;
  enabled?: boolean;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export interface AIEmbeddingCredentialInput {
  apiKey?: string;
}

export interface AIConfigDefaults {
  llm: SDKEndpointDefaults;
  embedding?: string;
  memoryLlm?: string;
  memoryEmbedding?: string;
}

export interface AIConfigSnapshot {
  llm: SDKEndpointRegistrySnapshot;
  embeddings: AIEmbeddingProviderView[];
  defaults: AIConfigDefaults;
}

export interface AIEmbeddingTestResult {
  ok: boolean;
  providerId: string;
  model?: string;
  dimensions?: number;
  latencyMs?: number;
  error?: string;
}

export interface AIEmbeddingResolvedProvider {
  provider: AIEmbeddingProvider;
  apiKey?: string;
}
