import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORBIT_DIR } from '@shared/constants';
import { maskSecret } from '@shared/runtime';
import type { SDKEndpointSecretState } from '@shared/runtime';
import { estimateSdkCost } from '../src/main/runtime/sdk/cost';
import { SDKEndpointRegistry } from '../src/main/runtime/sdk/endpoint-registry';
import type { SDKKeyVault } from '../src/main/runtime/sdk/key-vault';
import { mapAnthropicStreamEvent } from '../src/main/runtime/sdk/anthropic-sdk-adapter';
import { RuntimeRouter } from '../src/main/runtime/router';

class MemoryKeyVault implements SDKKeyVault {
  private secrets = new Map<string, string>();

  async get(keyRef: string): Promise<string | null> {
    return this.secrets.get(keyRef) ?? null;
  }

  async set(keyRef: string, value: string): Promise<void> {
    this.secrets.set(keyRef, value);
  }

  async delete(keyRef: string): Promise<void> {
    this.secrets.delete(keyRef);
  }

  async state(keyRef: string): Promise<SDKEndpointSecretState> {
    const secret = this.secrets.get(keyRef);
    return { configured: Boolean(secret), ...(secret ? { masked: maskSecret(secret) } : {}) };
  }
}

describe('Runtime B SDK foundation', () => {
  let vault: string;
  let keyVault: MemoryKeyVault;
  let registry: SDKEndpointRegistry;

  beforeEach(async () => {
    vault = await mkdtemp(path.join(os.tmpdir(), 'orbit-sdk-runtime-'));
    keyVault = new MemoryKeyVault();
    registry = new SDKEndpointRegistry(vault, keyVault);
  });

  afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('exposes built-in endpoints without leaking key refs', async () => {
    const snapshot = await registry.snapshot();
    expect(snapshot.endpoints.map((endpoint) => endpoint.id)).toContain('anthropic');
    const anthropic = snapshot.endpoints.find((endpoint) => endpoint.id === 'anthropic');
    expect(anthropic?.keyConfigured).toBe(false);
    expect(JSON.stringify(anthropic)).not.toContain('keyRef');
  });

  it('stores API keys separately and returns only masked key state', async () => {
    const endpoint = await registry.upsert({
      id: 'custom-a',
      label: 'Custom A',
      provider: 'custom',
      baseURL: 'https://sdk.example.test',
      defaultModel: 'model-a',
      enabled: true,
      apiKey: 'sk-test-1234567890'
    });
    expect(endpoint.keyConfigured).toBe(true);
    expect(endpoint.keyMasked).toBe('sk-t••••7890');
    const stored = await registry.require('custom-a');
    expect(stored.keyRef).toBe('sdk:endpoint:custom-a');
    expect(await keyVault.get(stored.keyRef)).toBe('sk-test-1234567890');
  });

  it('resolves model aliases for Anthropic-compatible providers', async () => {
    const endpoint = await registry.require('minimax');
    expect(registry.resolveModel(endpoint, 'claude-3-5-sonnet-latest')).toBe('MiniMax-M2.7');
    expect(registry.resolveModel(endpoint, 'minimax-text-01')).toBe('minimax-text-01');
    const deepseek = await registry.require('deepseek');
    expect(registry.resolveModel(deepseek)).toBe('deepseek-v4-flash');
    expect(registry.resolveModel(deepseek, undefined, 'fast')).toBe('deepseek-v4-flash');
    expect(registry.resolveModel(deepseek, undefined, 'heavy')).toBe('deepseek-v4-pro');
  });

  it('refreshes unchanged legacy DeepSeek built-ins to flash by default', async () => {
    const runtimeDir = path.join(vault, ORBIT_DIR, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
      path.join(runtimeDir, 'sdk-endpoints.json'),
      `${JSON.stringify(
        {
          version: 1,
          endpoints: [
            {
              id: 'deepseek',
              label: 'DeepSeek',
              provider: 'deepseek',
              protocol: 'anthropic-compatible',
              baseURL: 'https://api.deepseek.com/anthropic',
              keyRef: 'sdk:endpoint:deepseek',
              defaultModel: 'deepseek-v4-pro',
              fastModel: 'deepseek-chat',
              heavyModel: 'deepseek-v4-pro',
              enabled: true,
              builtIn: true
            }
          ],
          defaults: { ask: 'deepseek' }
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const deepseek = await registry.require('deepseek');
    expect(deepseek.defaultModel).toBe('deepseek-v4-flash');
    expect(deepseek.fastModel).toBe('deepseek-v4-flash');
    expect(deepseek.heavyModel).toBe('deepseek-v4-pro');
    expect(deepseek.enabled).toBe(true);
  });

  it('routes Ask to SDK when an enabled endpoint has a key', async () => {
    const saved = await registry.upsert({
      id: 'custom-route',
      label: 'Custom Route',
      provider: 'custom',
      baseURL: 'https://sdk.example.test',
      defaultModel: 'model-route',
      fastModel: 'model-route-fast',
      enabled: true,
      apiKey: 'sk-route'
    });
    await registry.setDefaults({ ask: saved.id });
    const router = new RuntimeRouter(registry, keyVault);
    const decision = await router.decide({ mode: 'ask' });
    expect(decision.track).toBe('sdk');
    expect(decision.endpointId).toBe('custom-route');
    expect(decision.model).toBe('model-route');
    expect(decision.fallback?.track).toBe('cli');
    await registry.setDefaults({ background: saved.id });
    const fastDecision = await router.decide({ mode: 'background', modelTier: 'fast' });
    expect(fastDecision.model).toBe('model-route-fast');
  });

  it('falls back route decisions to CLI when no SDK endpoint is configured', async () => {
    const router = new RuntimeRouter(registry, keyVault);
    const decision = await router.decide({ mode: 'ask' });
    expect(decision.track).toBe('cli');
    expect(decision.reason).toMatch(/no configured SDK endpoint/);
  });

  it('maps Anthropic stream text and usage events', () => {
    expect(
      mapAnthropicStreamEvent({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' }
      })
    ).toEqual({ text: 'hello' });
    expect(
      mapAnthropicStreamEvent({
        type: 'message_delta',
        usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 3 }
      })
    ).toEqual({
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 0 }
    });
  });

  it('estimates SDK cost from token usage and cost profile', () => {
    const estimate = estimateSdkCost({
      profile: { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      cacheReadTokens: 1_000_000
    });
    expect(estimate.totalUsd).toBeCloseTo(33.3, 5);
  });

  it('masks short and long secrets deterministically', () => {
    expect(maskSecret('short')).toBe('••••');
    expect(maskSecret('sk-ant-1234567890')).toBe('sk-a••••7890');
    expect(maskSecret('')).toBeUndefined();
  });
});
