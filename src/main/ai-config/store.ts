import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import type {
  AIConfigDefaults,
  AIEmbeddingCredentialInput,
  AIEmbeddingProvider,
  AIEmbeddingProviderInput,
  AIEmbeddingProviderType,
  AIEmbeddingProviderView,
  AIEmbeddingProtocol,
  AIEmbeddingSecretState
} from '@shared/ai-config';
import { maskSecret } from '@shared/runtime';
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from '../semantic/embedder';
import type { SDKKeyVault } from '../runtime/sdk/key-vault';

const CONFIG_VERSION = 1;

interface AIConfigFile {
  version: typeof CONFIG_VERSION;
  embeddings: AIEmbeddingProvider[];
  defaults: Omit<AIConfigDefaults, 'llm'>;
}

export const BUILT_IN_EMBEDDING_PROVIDERS: AIEmbeddingProvider[] = [
  {
    id: 'orbit-local',
    label: 'Orbit 本地 Hash Embedding',
    provider: 'local',
    protocol: 'local',
    model: LOCAL_EMBEDDING_MODEL,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    enabled: true,
    builtIn: true
  },
  {
    id: 'volcengine-doubao-vision',
    label: '火山引擎 Doubao Embedding Vision',
    provider: 'volcengine',
    protocol: 'volcengine-ark-multimodal',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-embedding-vision-251215',
    dimensions: 1024,
    keyRef: 'ai:embedding:volcengine-doubao-vision',
    enabled: false,
    builtIn: true
  }
];

export class AIConfigStore {
  constructor(
    private readonly vaultPath: string,
    private readonly keyVault: SDKKeyVault
  ) {}

  async embeddingViews(): Promise<AIEmbeddingProviderView[]> {
    const file = await this.read();
    return Promise.all(file.embeddings.map((provider) => this.toView(provider)));
  }

  async listEmbeddings(): Promise<AIEmbeddingProvider[]> {
    return (await this.read()).embeddings;
  }

  async getEmbedding(providerId: string): Promise<AIEmbeddingProvider | null> {
    return (await this.listEmbeddings()).find((provider) => provider.id === providerId) ?? null;
  }

  async defaultEmbedding(role: 'default' | 'memory' = 'default'): Promise<AIEmbeddingProvider | null> {
    const file = await this.read();
    const preferred = role === 'memory' ? file.defaults.memoryEmbedding : file.defaults.embedding;
    const fallback = role === 'memory' ? file.defaults.embedding : undefined;
    const ids = [preferred, fallback].filter((id): id is string => Boolean(id));
    for (const id of ids) {
      const provider = file.embeddings.find((item) => item.id === id && item.enabled);
      if (provider && (await this.hasRequiredSecret(provider))) return provider;
    }
    const ready = await this.enabledEmbeddingsWithCredentials(file.embeddings);
    return ready[0] ?? null;
  }

  async upsertEmbedding(input: AIEmbeddingProviderInput): Promise<AIEmbeddingProviderView> {
    const file = await this.read();
    const id = normalizeId(input.id ?? `${input.provider}-${randomUUID().slice(0, 8)}`);
    const existing = file.embeddings.find((provider) => provider.id === id);
    const next: AIEmbeddingProvider = normalizeEmbeddingProvider({
      ...(existing ?? { id, keyRef: input.provider === 'local' ? undefined : `ai:embedding:${id}` }),
      id,
      label: input.label,
      provider: input.provider,
      protocol: input.protocol ?? defaultProtocol(input.provider),
      model: input.model,
      dimensions: input.dimensions,
      ...(input.baseURL ? { baseURL: input.baseURL } : {}),
      ...(input.extraHeaders ? { extraHeaders: cleanStringRecord(input.extraHeaders) } : {}),
      ...(input.extraBody ? { extraBody: input.extraBody } : {}),
      enabled: input.enabled ?? existing?.enabled ?? true,
      builtIn: existing?.builtIn ?? false
    });
    await this.write({
      ...file,
      embeddings: [next, ...file.embeddings.filter((provider) => provider.id !== next.id)]
    });
    return this.toView(next);
  }

  async setEmbeddingSecret(providerId: string, input: AIEmbeddingCredentialInput): Promise<AIEmbeddingProviderView> {
    const provider = await this.requireEmbedding(providerId);
    if (!provider.keyRef) throw new Error(`ai_embedding_secret_not_supported:${providerId}`);
    const payload = cleanCredential(input);
    if (!payload.apiKey) throw new Error('ai_embedding_secret_empty');
    await this.keyVault.set(provider.keyRef, JSON.stringify(payload));
    return this.toView(provider);
  }

  async deleteEmbeddingSecret(providerId: string): Promise<AIEmbeddingProviderView> {
    const provider = await this.requireEmbedding(providerId);
    if (provider.keyRef) await this.keyVault.delete(provider.keyRef);
    return this.toView(provider);
  }

  async setDefaults(defaults: Partial<Omit<AIConfigDefaults, 'llm'>>): Promise<Omit<AIConfigDefaults, 'llm'>> {
    const file = await this.read();
    const ids = new Set(file.embeddings.map((provider) => provider.id));
    const next: Omit<AIConfigDefaults, 'llm'> = {};
    for (const key of ['embedding', 'memoryEmbedding', 'memoryLlm'] as const) {
      const value = defaults[key] ?? file.defaults[key];
      if (key === 'memoryLlm') {
        if (value) next[key] = value;
        continue;
      }
      if (value && ids.has(value)) next[key] = value;
    }
    await this.write({ ...file, defaults: next });
    return next;
  }

  async defaults(): Promise<Omit<AIConfigDefaults, 'llm'>> {
    return (await this.read()).defaults;
  }

  async readEmbeddingCredentials(provider: AIEmbeddingProvider): Promise<AIEmbeddingCredentialInput> {
    if (!provider.keyRef) return {};
    const raw = await this.keyVault.get(provider.keyRef);
    if (!raw) return {};
    return parseCredential(raw);
  }

  private async requireEmbedding(providerId: string): Promise<AIEmbeddingProvider> {
    const provider = await this.getEmbedding(providerId);
    if (!provider) throw new Error(`ai_embedding_provider_not_found:${providerId}`);
    return provider;
  }

  private async enabledEmbeddingsWithCredentials(providers: AIEmbeddingProvider[]): Promise<AIEmbeddingProvider[]> {
    const result: AIEmbeddingProvider[] = [];
    for (const provider of providers) {
      if (!provider.enabled) continue;
      if (await this.hasRequiredSecret(provider)) result.push(provider);
    }
    return result;
  }

  private async hasRequiredSecret(provider: AIEmbeddingProvider): Promise<boolean> {
    if (provider.provider === 'local') return true;
    const secret = await this.readEmbeddingCredentials(provider);
    return Boolean(secret.apiKey);
  }

  private async toView(provider: AIEmbeddingProvider): Promise<AIEmbeddingProviderView> {
    const { keyRef: _keyRef, ...rest } = provider;
    void _keyRef;
    const secret = await this.secretState(provider);
    return {
      ...rest,
      keyConfigured: secret.configured,
      ...(secret.masked ? { keyMasked: secret.masked } : {}),
      secret
    };
  }

  private async secretState(provider: AIEmbeddingProvider): Promise<AIEmbeddingSecretState> {
    if (!provider.keyRef) return { configured: true };
    const secret = await this.readEmbeddingCredentials(provider);
    const primary = secret.apiKey;
    return {
      configured: Boolean(primary),
      ...(primary ? { masked: maskSecret(primary) } : {}),
      ...(secret.apiKey ? { apiKeyMasked: maskSecret(secret.apiKey) } : {})
    };
  }

  private filePath(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'runtime', 'ai-config.json');
  }

  private async read(): Promise<AIConfigFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath(), 'utf8')) as Partial<AIConfigFile>;
      return normalizeFile({
        version: CONFIG_VERSION,
        embeddings: mergeBuiltIns(Array.isArray(parsed.embeddings) ? parsed.embeddings : []),
        defaults: parsed.defaults ?? {}
      });
    } catch (error) {
      if (isNotFound(error)) {
        const initial = normalizeFile({
          version: CONFIG_VERSION,
          embeddings: BUILT_IN_EMBEDDING_PROVIDERS,
          defaults: { embedding: 'orbit-local', memoryEmbedding: 'orbit-local' }
        });
        await this.write(initial);
        return initial;
      }
      throw error;
    }
  }

  private async write(file: AIConfigFile): Promise<void> {
    const next = normalizeFile({ ...file, embeddings: mergeBuiltIns(file.embeddings) });
    const target = this.filePath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

export function parseEmbeddingApiKey(input: AIEmbeddingCredentialInput): string | undefined {
  return input.apiKey?.trim() || undefined;
}

function normalizeFile(file: AIConfigFile): AIConfigFile {
  const embeddingIds = new Set(file.embeddings.map((provider) => provider.id));
  const defaults: Omit<AIConfigDefaults, 'llm'> = {};
  if (file.defaults.embedding && embeddingIds.has(file.defaults.embedding)) defaults.embedding = file.defaults.embedding;
  if (file.defaults.memoryEmbedding && embeddingIds.has(file.defaults.memoryEmbedding)) {
    defaults.memoryEmbedding = file.defaults.memoryEmbedding;
  }
  if (file.defaults.memoryLlm) defaults.memoryLlm = file.defaults.memoryLlm;
  if (!defaults.embedding) defaults.embedding = 'orbit-local';
  if (!defaults.memoryEmbedding) defaults.memoryEmbedding = defaults.embedding;
  return {
    version: CONFIG_VERSION,
    embeddings: file.embeddings.map(normalizeEmbeddingProvider),
    defaults
  };
}

function mergeBuiltIns(providers: AIEmbeddingProvider[]): AIEmbeddingProvider[] {
  const byId = new Map<string, AIEmbeddingProvider>();
  for (const provider of BUILT_IN_EMBEDDING_PROVIDERS) byId.set(provider.id, provider);
  for (const provider of providers) {
    const builtIn = byId.get(provider.id);
    byId.set(
      provider.id,
      builtIn
        ? {
            ...builtIn,
            enabled: provider.enabled,
            ...(provider.extraHeaders ? { extraHeaders: provider.extraHeaders } : {}),
            ...(provider.extraBody ? { extraBody: provider.extraBody } : {}),
            keyRef: builtIn.keyRef,
            builtIn: true
          }
        : provider
    );
  }
  return [...byId.values()];
}

function normalizeEmbeddingProvider(provider: AIEmbeddingProvider): AIEmbeddingProvider {
  const id = normalizeId(provider.id);
  const providerType = normalizeProvider(provider.provider);
  return {
    ...provider,
    id,
    label: provider.label.trim() || id,
    provider: providerType,
    protocol: normalizeProtocol(provider.protocol, providerType),
    model: provider.model.trim(),
    dimensions: clampInt(provider.dimensions, 1, 16_384),
    ...(provider.baseURL ? { baseURL: normalizeBaseUrl(provider.baseURL) } : {}),
    ...(provider.keyRef ? { keyRef: provider.keyRef } : providerType === 'local' ? {} : { keyRef: `ai:embedding:${id}` }),
    enabled: Boolean(provider.enabled)
  };
}

function normalizeProvider(provider: unknown): AIEmbeddingProviderType {
  return provider === 'local' || provider === 'openai-compatible' || provider === 'volcengine'
    ? provider
    : 'local';
}

function normalizeProtocol(protocol: unknown, provider: AIEmbeddingProviderType): AIEmbeddingProtocol {
  if (provider === 'local') return 'local';
  if (provider === 'volcengine') return 'volcengine-ark-multimodal';
  return protocol === 'openai-compatible' ? 'openai-compatible' : 'openai-compatible';
}

function defaultProtocol(provider: AIEmbeddingProviderType): AIEmbeddingProtocol {
  if (provider === 'local') return 'local';
  if (provider === 'volcengine') return 'volcengine-ark-multimodal';
  return 'openai-compatible';
}

function normalizeId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) throw new Error('ai_config_id_required');
  return id;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value.trim().replace(/\/+$/, '')).toString().replace(/\/+$/, '');
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, n));
}

function cleanStringRecord(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}

function cleanCredential(input: AIEmbeddingCredentialInput): AIEmbeddingCredentialInput {
  return {
    ...(input.apiKey?.trim() ? { apiKey: input.apiKey.trim() } : {})
  };
}

function parseCredential(raw: string): AIEmbeddingCredentialInput {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const apiKey = typeof record.apiKey === 'string'
        ? record.apiKey
        : typeof record.secret === 'string'
          ? record.secret
          : '';
      return cleanCredential({ apiKey });
    }
  } catch {
    /* legacy raw API key */
  }
  return { apiKey: raw.trim() };
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
