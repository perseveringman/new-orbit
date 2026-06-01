import path from 'node:path';
import type { HyMemoryBackendConfig } from '@shared/memory';
import { getAIConfigRuntime } from './runtime';
import { ensureEmbeddingProxy } from './embedding-proxy';
import { llmToHyMemoryEnv } from './service';

export async function buildHyMemoryServerEnv(
  vaultPath: string,
  config: HyMemoryBackendConfig
): Promise<Record<string, string>> {
  const ai = getAIConfigRuntime(vaultPath).service;
  const llm = await ai.resolveLLM('memory');
  const embedding = await ai.resolveEmbedding('memory');
  if (!llm) {
    throw new Error('hy_memory_llm_not_configured: 请先在 AI 配置中启用一个带密钥的记忆 LLM 端点');
  }
  if (!embedding) {
    throw new Error('hy_memory_embedding_not_configured: 请先在 AI 配置中启用一个记忆向量化 provider');
  }
  const embeddingProxy = await ensureEmbeddingProxy({
    vaultPath,
    port: config.embeddingProxyPort,
    service: ai
  });

  return {
    MEMORY_ENABLE_AGENT: 'true',
    MEMORY_ENABLE_GRAPH: 'false',
    MEMORY_ENABLE_HYDE_QUERY: 'false',
    MEMORY_CACHE_BACKEND: 'sqlite',
    MEMORY_ENABLE_SUMMARY: 'false',
    MEMORY_VECTOR_STORE: 'chroma',
    MEMORY_COLLECTION_NAME: 'orbit_hy_memory',
    MEMORY_PERSIST_DIR: path.join(vaultPath, '.orbit', 'memory', 'hy-vector-store'),
    MEMORY_LOG_LEVEL: config.logLevel,
    ...llmToHyMemoryEnv(llm),
    MEMORY_EMBEDDER_PROVIDER: 'openai',
    MEMORY_EMBEDDER_MODEL: embedding.provider.model,
    MEMORY_EMBEDDER_API_KEY: 'orbit-local',
    MEMORY_EMBEDDER_BASE_URL: embeddingProxy.baseURL,
    MEMORY_EMBEDDING_DIMS: String(embedding.provider.dimensions)
  };
}
