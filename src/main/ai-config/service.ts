import type {
  AIConfigDefaults,
  AIConfigSnapshot,
  AIEmbeddingCredentialInput,
  AIEmbeddingProvider,
  AIEmbeddingProviderInput,
  AIEmbeddingResolvedProvider,
  AIEmbeddingTestResult
} from '@shared/ai-config';
import type { SDKEndpoint, SDKEndpointDefaults, SDKResolvedInvocation } from '@shared/runtime';
import { hashEmbed } from '../vector/embed';
import type { SDKEndpointRegistry } from '../runtime/sdk/endpoint-registry';
import type { SDKKeyVault } from '../runtime/sdk/key-vault';
import { AIConfigStore, parseEmbeddingApiKey } from './store';

export class AIConfigService {
  private readonly store: AIConfigStore;

  constructor(
    private readonly registry: SDKEndpointRegistry,
    private readonly keyVault: SDKKeyVault,
    vaultPath: string
  ) {
    this.store = new AIConfigStore(vaultPath, keyVault);
  }

  async snapshot(): Promise<AIConfigSnapshot> {
    const [llm, embeddings, defaults] = await Promise.all([
      this.registry.snapshot(),
      this.store.embeddingViews(),
      this.store.defaults()
    ]);
    return {
      llm,
      embeddings,
      defaults: {
        llm: llm.defaults,
        ...defaults
      }
    };
  }

  async upsertEmbeddingProvider(input: AIEmbeddingProviderInput) {
    return this.store.upsertEmbedding(input);
  }

  async setEmbeddingSecret(providerId: string, input: AIEmbeddingCredentialInput) {
    return this.store.setEmbeddingSecret(providerId, input);
  }

  async deleteEmbeddingSecret(providerId: string) {
    return this.store.deleteEmbeddingSecret(providerId);
  }

  async setDefaults(defaults: Partial<AIConfigDefaults>): Promise<AIConfigDefaults> {
    const llmDefaults = defaults.llm ? await this.registry.setDefaults(defaults.llm) : (await this.registry.snapshot()).defaults;
    const aiDefaults = await this.store.setDefaults(defaults);
    return {
      llm: llmDefaults,
      ...aiDefaults
    };
  }

  async resolveLLM(role: 'ask' | 'synthesis' | 'background' | 'memory' = 'ask'): Promise<SDKResolvedInvocation | null> {
    const defaults = await this.store.defaults();
    const endpoint =
      role === 'memory' && defaults.memoryLlm
        ? await this.registry.get(defaults.memoryLlm)
        : await this.registry.defaultEndpoint(toSdkMode(role));
    if (!endpoint || !endpoint.enabled) return null;
    const apiKey = await this.keyVault.get(endpoint.keyRef);
    if (!apiKey) return null;
    return {
      endpoint,
      model: this.registry.resolveModel(endpoint, undefined),
      apiKey
    };
  }

  async resolveEmbedding(role: 'default' | 'memory' = 'default'): Promise<AIEmbeddingResolvedProvider | null> {
    const provider = await this.store.defaultEmbedding(role);
    if (!provider) return null;
    const credentials = await this.store.readEmbeddingCredentials(provider);
    return {
      provider,
      ...credentials
    };
  }

  async embedTexts(texts: string[], options: { providerId?: string; role?: 'default' | 'memory' } = {}): Promise<number[][]> {
    const provider = options.providerId
      ? await this.store.getEmbedding(options.providerId)
      : await this.store.defaultEmbedding(options.role ?? 'default');
    if (!provider) throw new Error('ai_embedding_provider_not_configured');
    const credentials = await this.store.readEmbeddingCredentials(provider);
    if (provider.provider === 'local') {
      return texts.map((text) => Array.from(hashEmbed(text, provider.dimensions)));
    }
    if (provider.provider === 'volcengine') {
      return Promise.all(texts.map((text) => this.embedVolcengine(provider, credentials, text)));
    }
    return this.embedOpenAICompatible(provider, credentials, texts);
  }

  async testEmbedding(providerId: string, text = '天很蓝'): Promise<AIEmbeddingTestResult> {
    const started = Date.now();
    try {
      const vectors = await this.embedTexts([text], { providerId });
      const dimensions = vectors[0]?.length ?? 0;
      const provider = await this.store.getEmbedding(providerId);
      return {
        ok: true,
        providerId,
        model: provider?.model,
        dimensions,
        latencyMs: Date.now() - started
      };
    } catch (error) {
      return {
        ok: false,
        providerId,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getEmbeddingProvider(providerId: string): Promise<AIEmbeddingProvider | null> {
    return this.store.getEmbedding(providerId);
  }

  private async embedVolcengine(
    provider: AIEmbeddingProvider,
    credentials: AIEmbeddingCredentialInput,
    text: string
  ): Promise<number[]> {
    const apiKey = parseEmbeddingApiKey(credentials);
    if (!apiKey) throw new Error(`ai_embedding_key_missing:${provider.id}`);
    const baseURL = provider.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3';
    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/embeddings/multimodal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(provider.extraHeaders ?? {})
      },
      body: JSON.stringify({
        model: provider.model,
        encoding_format: 'float',
        input: [{ type: 'text', text }],
        dimensions: provider.dimensions,
        ...(provider.extraBody ?? {})
      }),
      signal: AbortSignal.timeout(60_000)
    });
    return extractEmbedding(await parseEmbeddingResponse(response), provider.id);
  }

  private async embedOpenAICompatible(
    provider: AIEmbeddingProvider,
    credentials: AIEmbeddingCredentialInput,
    texts: string[]
  ): Promise<number[][]> {
    const apiKey = parseEmbeddingApiKey(credentials);
    if (!apiKey) throw new Error(`ai_embedding_key_missing:${provider.id}`);
    if (!provider.baseURL) throw new Error(`ai_embedding_base_url_missing:${provider.id}`);
    const response = await fetch(`${provider.baseURL.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(provider.extraHeaders ?? {})
      },
      body: JSON.stringify({
        model: provider.model,
        input: texts,
        encoding_format: 'float',
        ...(provider.dimensions ? { dimensions: provider.dimensions } : {}),
        ...(provider.extraBody ?? {})
      }),
      signal: AbortSignal.timeout(60_000)
    });
    const body = await parseEmbeddingResponse(response);
    const data = isRecord(body) ? body.data : undefined;
    if (Array.isArray(data)) {
      return data.map((item: unknown) => extractEmbedding(item, provider.id));
    }
    return [extractEmbedding(data ?? body, provider.id)];
  }
}

export function llmToHyMemoryEnv(resolved: SDKResolvedInvocation): Record<string, string> {
  return {
    MEMORY_LLM_PROVIDER: hyProvider(resolved.endpoint),
    MEMORY_LLM_MODEL: resolved.model,
    MEMORY_LLM_API_KEY: resolved.apiKey,
    MEMORY_LLM_BASE_URL: resolved.endpoint.baseURL
  };
}

function hyProvider(endpoint: SDKEndpoint): string {
  if (endpoint.provider === 'anthropic' || endpoint.protocol === 'anthropic-compatible') return 'anthropic';
  return 'openai';
}

function toSdkMode(role: 'ask' | 'synthesis' | 'background' | 'memory'): keyof SDKEndpointDefaults {
  return role === 'synthesis' || role === 'background' ? role : 'ask';
}

async function parseEmbeddingResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { text };
    }
  }
  if (!response.ok) {
    const record = isRecord(body) ? body : {};
    const error = record.error;
    const errorMessage = isRecord(error) ? error.message : undefined;
    const detail = errorMessage ?? error ?? record.message ?? record.detail ?? response.statusText;
    throw new Error(`HTTP ${response.status}: ${String(detail)}`);
  }
  return body;
}

function extractEmbedding(body: unknown, providerId: string): number[] {
  const record = body as { embedding?: unknown; data?: unknown };
  const embedding = record?.embedding ?? (record?.data as { embedding?: unknown } | undefined)?.embedding;
  if (!Array.isArray(embedding)) throw new Error(`ai_embedding_response_invalid:${providerId}`);
  return embedding.map((value) => Number(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
