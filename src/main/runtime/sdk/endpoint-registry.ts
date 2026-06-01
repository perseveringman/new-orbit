import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  endpointView,
  resolveModelAlias,
  type SDKEndpoint,
  type SDKEndpointDefaults,
  type SDKEndpointInput,
  type SDKEndpointProvider,
  type SDKEndpointRegistrySnapshot,
  type SDKEndpointView
} from '@shared/runtime';
import type { SDKKeyVault } from './key-vault';

interface RegistryFile {
  version: 1;
  endpoints: SDKEndpoint[];
  defaults: SDKEndpointDefaults;
}

export const BUILT_IN_SDK_ENDPOINTS: SDKEndpoint[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    provider: 'anthropic',
    protocol: 'anthropic-compatible',
    baseURL: 'https://api.anthropic.com',
    keyRef: 'sdk:endpoint:anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    fastModel: 'claude-3-5-haiku-latest',
    heavyModel: 'claude-3-5-sonnet-latest',
    costProfile: { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
    enabled: false,
    builtIn: true
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    provider: 'minimax',
    protocol: 'anthropic-compatible',
    baseURL: 'https://api.minimaxi.com/anthropic',
    keyRef: 'sdk:endpoint:minimax',
    defaultModel: 'MiniMax-M2.7',
    fastModel: 'MiniMax-M2.7',
    heavyModel: 'MiniMax-M2.7',
    modelAlias: {
      'claude-3-5-sonnet-latest': 'MiniMax-M2.7'
    },
    enabled: false,
    builtIn: true
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'deepseek',
    protocol: 'anthropic-compatible',
    baseURL: 'https://api.deepseek.com/anthropic',
    keyRef: 'sdk:endpoint:deepseek',
    defaultModel: 'deepseek-v4-flash',
    fastModel: 'deepseek-v4-flash',
    heavyModel: 'deepseek-v4-pro',
    modelAlias: {
      'claude-3-5-haiku-latest': 'deepseek-v4-flash',
      'claude-3-5-sonnet-latest': 'deepseek-v4-pro'
    },
    enabled: false,
    builtIn: true
  }
];

export class SDKEndpointRegistry {
  constructor(
    private readonly vaultPath: string,
    private readonly keyVault: SDKKeyVault
  ) {}

  async snapshot(): Promise<SDKEndpointRegistrySnapshot> {
    const file = await this.read();
    return {
      endpoints: await Promise.all(file.endpoints.map((endpoint) => this.toView(endpoint))),
      defaults: file.defaults
    };
  }

  async list(): Promise<SDKEndpoint[]> {
    return (await this.read()).endpoints;
  }

  async get(endpointId: string): Promise<SDKEndpoint | null> {
    return (await this.list()).find((endpoint) => endpoint.id === endpointId) ?? null;
  }

  async enabledWithKeys(): Promise<SDKEndpoint[]> {
    const endpoints = await this.list();
    const result: SDKEndpoint[] = [];
    for (const endpoint of endpoints) {
      if (!endpoint.enabled) continue;
      if (await this.keyVault.get(endpoint.keyRef)) result.push(endpoint);
    }
    return result;
  }

  async upsert(input: SDKEndpointInput): Promise<SDKEndpointView> {
    const file = await this.read();
    const id = normalizeId(input.id ?? `${input.provider}-${randomUUID().slice(0, 8)}`);
    const existing = file.endpoints.find((endpoint) => endpoint.id === id);
    const endpoint: SDKEndpoint = {
      ...(existing ?? {
        id,
        keyRef: `sdk:endpoint:${id}`,
        builtIn: false
      }),
      id,
      label: input.label.trim(),
      provider: input.provider,
      protocol: input.protocol ?? 'anthropic-compatible',
      baseURL: normalizeBaseUrl(input.baseURL),
      defaultModel: input.defaultModel.trim(),
      fastModel: input.fastModel?.trim() || input.defaultModel.trim(),
      heavyModel: input.heavyModel?.trim() || input.defaultModel.trim(),
      ...(input.modelAlias ? { modelAlias: cleanStringRecord(input.modelAlias) } : {}),
      ...(input.costProfile ? { costProfile: input.costProfile } : {}),
      enabled: input.enabled ?? existing?.enabled ?? false
    };
    if (!endpoint.label) throw new Error('sdk_endpoint_label_required');
    if (!endpoint.defaultModel) throw new Error('sdk_endpoint_model_required');
    const endpoints = [endpoint, ...file.endpoints.filter((item) => item.id !== endpoint.id)];
    await this.write({ ...file, endpoints });
    if (input.apiKey?.trim()) await this.keyVault.set(endpoint.keyRef, input.apiKey);
    return this.toView(endpoint);
  }

  async delete(endpointId: string): Promise<void> {
    const file = await this.read();
    const endpoint = file.endpoints.find((item) => item.id === endpointId);
    if (!endpoint) return;
    if (endpoint.builtIn) {
      await this.write({
        ...file,
        endpoints: file.endpoints.map((item) =>
          item.id === endpointId ? { ...item, enabled: false } : item
        ),
        defaults: removeDefault(file.defaults, endpointId)
      });
      await this.keyVault.delete(endpoint.keyRef);
      return;
    }
    await this.write({
      ...file,
      endpoints: file.endpoints.filter((item) => item.id !== endpointId),
      defaults: removeDefault(file.defaults, endpointId)
    });
    await this.keyVault.delete(endpoint.keyRef);
  }

  async setApiKey(endpointId: string, apiKey: string): Promise<SDKEndpointView> {
    const endpoint = await this.require(endpointId);
    await this.keyVault.set(endpoint.keyRef, apiKey);
    return this.toView(endpoint);
  }

  async deleteApiKey(endpointId: string): Promise<SDKEndpointView> {
    const endpoint = await this.require(endpointId);
    await this.keyVault.delete(endpoint.keyRef);
    return this.toView(endpoint);
  }

  async setDefaults(defaults: SDKEndpointDefaults): Promise<SDKEndpointDefaults> {
    const file = await this.read();
    const ids = new Set(file.endpoints.map((endpoint) => endpoint.id));
    const next: SDKEndpointDefaults = {};
    for (const [mode, endpointId] of Object.entries(defaults) as Array<[keyof SDKEndpointDefaults, string | undefined]>) {
      if (endpointId && ids.has(endpointId)) next[mode] = endpointId;
    }
    await this.write({ ...file, defaults: next });
    return next;
  }

  resolveModel(endpoint: SDKEndpoint, modelHint?: string, modelTier?: 'default' | 'fast' | 'heavy'): string {
    return resolveModelAlias(endpoint, modelHint, modelTier);
  }

  async require(endpointId: string): Promise<SDKEndpoint> {
    const endpoint = await this.get(endpointId);
    if (!endpoint) throw new Error(`sdk_endpoint_not_found:${endpointId}`);
    return endpoint;
  }

  async defaultEndpoint(mode: keyof SDKEndpointDefaults): Promise<SDKEndpoint | null> {
    const file = await this.read();
    const preferred = file.defaults[mode];
    if (preferred) {
      const endpoint = file.endpoints.find((item) => item.id === preferred && item.enabled);
      if (endpoint && (await this.keyVault.get(endpoint.keyRef))) return endpoint;
    }
    const enabled = await this.enabledWithKeys();
    return enabled[0] ?? null;
  }

  private async toView(endpoint: SDKEndpoint): Promise<SDKEndpointView> {
    return endpointView(endpoint, await this.keyVault.state(endpoint.keyRef));
  }

  private filePath(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'runtime', 'sdk-endpoints.json');
  }

  private async read(): Promise<RegistryFile> {
    try {
      const raw = await fs.readFile(this.filePath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<RegistryFile>;
      const userEndpoints = Array.isArray(parsed.endpoints) ? parsed.endpoints : [];
      return normalizeRegistry({
        version: 1,
        endpoints: mergeBuiltIns(userEndpoints),
        defaults: parsed.defaults ?? {}
      });
    } catch (error) {
      if (isNotFound(error)) {
        const initial = normalizeRegistry({ version: 1, endpoints: BUILT_IN_SDK_ENDPOINTS, defaults: {} });
        await this.write(initial);
        return initial;
      }
      throw error;
    }
  }

  private async write(file: RegistryFile): Promise<void> {
    const next = normalizeRegistry({ ...file, endpoints: mergeBuiltIns(file.endpoints) });
    const target = this.filePath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

export function createSDKEndpointRegistry(vaultPath: string, keyVault: SDKKeyVault): SDKEndpointRegistry {
  return new SDKEndpointRegistry(vaultPath, keyVault);
}

function normalizeRegistry(file: RegistryFile): RegistryFile {
  return {
    version: 1,
    endpoints: file.endpoints.map(normalizeEndpoint),
    defaults: file.defaults
  };
}

// Built-in baselines that previous Orbit versions wrote to user vaults.
// When a stored built-in still matches one of these legacy snapshots, we treat
// the values as untouched defaults and refresh them to the current built-in
// definition so users automatically pick up upstream changes (e.g. new model
// names, base URLs). User-customized values are preserved as-is.
type LegacyBuiltInSnapshot = Pick<SDKEndpoint, 'baseURL' | 'defaultModel'> &
  Partial<Pick<SDKEndpoint, 'fastModel' | 'heavyModel'>>;

const LEGACY_BUILT_IN_SNAPSHOTS: Record<string, LegacyBuiltInSnapshot[]> = {
  minimax: [
    { baseURL: 'https://api.minimax.chat/anthropic', defaultModel: 'minimax-m1' },
    { baseURL: 'https://api.minimaxi.com/anthropic', defaultModel: 'minimax-m1' }
  ],
  deepseek: [
    { baseURL: 'https://api.deepseek.com/anthropic', defaultModel: 'deepseek-chat' },
    {
      baseURL: 'https://api.deepseek.com/anthropic',
      defaultModel: 'deepseek-v4-pro',
      fastModel: 'deepseek-chat',
      heavyModel: 'deepseek-v4-pro'
    },
    {
      baseURL: 'https://api.deepseek.com/anthropic',
      defaultModel: 'deepseek-v4-pro',
      fastModel: 'deepseek-v4-flash',
      heavyModel: 'deepseek-v4-pro'
    }
  ]
};

function isLegacyBuiltIn(id: string, endpoint: SDKEndpoint): boolean {
  const snapshots = LEGACY_BUILT_IN_SNAPSHOTS[id];
  if (!snapshots) return false;
  return snapshots.some((snap) => {
    if (snap.baseURL !== endpoint.baseURL || snap.defaultModel !== endpoint.defaultModel) {
      return false;
    }
    if (snap.fastModel !== undefined && snap.fastModel !== endpoint.fastModel) return false;
    if (snap.heavyModel !== undefined && snap.heavyModel !== endpoint.heavyModel) return false;
    return true;
  });
}

function mergeBuiltIns(endpoints: SDKEndpoint[]): SDKEndpoint[] {
  const byId = new Map<string, SDKEndpoint>();
  for (const endpoint of BUILT_IN_SDK_ENDPOINTS) byId.set(endpoint.id, endpoint);
  for (const endpoint of endpoints) {
    const builtIn = byId.get(endpoint.id);
    if (builtIn && isLegacyBuiltIn(endpoint.id, endpoint)) {
      // Refresh stale built-in defaults but preserve user-controlled flags.
      byId.set(endpoint.id, {
        ...builtIn,
        enabled: endpoint.enabled,
        keyRef: builtIn.keyRef,
        builtIn: true
      });
      continue;
    }
    byId.set(endpoint.id, builtIn ? { ...builtIn, ...endpoint, keyRef: builtIn.keyRef, builtIn: true } : endpoint);
  }
  return [...byId.values()];
}

function normalizeEndpoint(endpoint: SDKEndpoint): SDKEndpoint {
  return {
    ...endpoint,
    id: normalizeId(endpoint.id),
    label: endpoint.label.trim(),
    baseURL: normalizeBaseUrl(endpoint.baseURL),
    keyRef: endpoint.keyRef || `sdk:endpoint:${normalizeId(endpoint.id)}`,
    defaultModel: endpoint.defaultModel.trim(),
    fastModel: endpoint.fastModel?.trim() || endpoint.defaultModel.trim(),
    heavyModel: endpoint.heavyModel?.trim() || endpoint.defaultModel.trim(),
    provider: endpoint.provider as SDKEndpointProvider,
    protocol: 'anthropic-compatible',
    enabled: Boolean(endpoint.enabled)
  };
}

function normalizeId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) throw new Error('sdk_endpoint_id_required');
  return id;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  const url = new URL(trimmed);
  return url.toString().replace(/\/+$/, '');
}

function cleanStringRecord(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}

function removeDefault(defaults: SDKEndpointDefaults, endpointId: string): SDKEndpointDefaults {
  return Object.fromEntries(
    Object.entries(defaults).filter((entry) => entry[1] !== endpointId)
  ) as SDKEndpointDefaults;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT');
}
