import { useEffect, useMemo, useState } from 'react';
import type {
  ComposerModelOption,
  ComposerOptions,
  ComposerProfileOption,
  ComposerRuntimeOption,
  RuntimeSelection
} from '@shared/ai-composer';
import type { RuntimeDescriptor } from '@shared/orchestration';
import type { SDKEndpointRegistrySnapshot, SDKEndpointView, SDKModelTier } from '@shared/runtime';

const DEFAULT_PROFILES: ComposerProfileOption[] = [
  {
    id: 'creative-agent',
    label: 'Creative Agent',
    description: '适合发散、写作、方案探索。'
  },
  {
    id: 'research-agent',
    label: 'Research Agent',
    description: '适合搜索、证据整理、事实核验。'
  },
  {
    id: 'executor-agent',
    label: 'Executor Agent',
    description: '适合按步骤执行 Orbit 内操作。'
  }
];

const EMPTY_OPTIONS: ComposerOptions = {
  runtimes: [],
  models: [],
  profiles: DEFAULT_PROFILES,
  defaultSelection: {
    agentProfileId: DEFAULT_PROFILES[0]?.id
  }
};

export interface RuntimeCatalogState {
  loading: boolean;
  options: ComposerOptions;
  error: string | null;
  reload(): Promise<void>;
}

export function useRuntimeCatalog(): RuntimeCatalogState {
  const [loading, setLoading] = useState(true);
  const [runtimes, setRuntimes] = useState<RuntimeDescriptor[]>([]);
  const [snapshot, setSnapshot] = useState<SDKEndpointRegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      window.orbit.runtime.list().catch(() => []),
      window.orbit.runtime.sdk.snapshot().catch(() => null)
    ])
      .then(([nextRuntimes, nextSnapshot]) => {
        if (cancelled) return;
        setRuntimes(nextRuntimes);
        setSnapshot(nextSnapshot);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  useEffect(() => window.orbit.runtime.onEvent(() => setReloadTick((value) => value + 1)), []);

  const options = useMemo(() => buildComposerOptions(runtimes, snapshot), [runtimes, snapshot]);

  return {
    loading,
    options,
    error,
    reload: async () => {
      setReloadTick((value) => value + 1);
    }
  };
}

export function buildComposerOptions(
  runtimes: RuntimeDescriptor[],
  snapshot: SDKEndpointRegistrySnapshot | null
): ComposerOptions {
  const endpointRuntimes = (snapshot?.endpoints ?? []).map(endpointToRuntimeOption);
  const cliRuntimes = runtimes.map(runtimeToOption);
  const runtimeOptions = [...endpointRuntimes, ...cliRuntimes];
  const modelOptions = [
    ...(snapshot?.endpoints ?? []).flatMap(endpointToModelOptions),
    ...runtimes.flatMap(runtimeToModelOptions)
  ];
  const defaultSelection = resolveDefaultSelection(runtimes, snapshot);

  return {
    runtimes: runtimeOptions,
    models: modelOptions,
    profiles: DEFAULT_PROFILES,
    defaultSelection
  };
}

function endpointToRuntimeOption(endpoint: SDKEndpointView): ComposerRuntimeOption {
  const disabled = !endpoint.enabled || !endpoint.keyConfigured;
  return {
    id: sdkRuntimeId(endpoint.id),
    label: endpoint.label,
    provider: endpoint.provider,
    track: 'sdk_agent',
    endpointId: endpoint.id,
    defaultModel: endpoint.defaultModel,
    status: disabled ? 'disabled' : 'online',
    disabled,
    description: disabled ? '需要在设置里启用并配置 API Key' : 'SDK Agent runtime'
  };
}

function runtimeToOption(runtime: RuntimeDescriptor): ComposerRuntimeOption {
  return {
    id: runtime.runtimeId,
    label: runtime.name,
    provider: runtime.provider,
    track: 'cli',
    defaultModel: runtime.defaultModel ?? undefined,
    status: runtime.status,
    disabled: runtime.status === 'offline',
    description: runtime.version ?? runtime.provider
  };
}

function endpointToModelOptions(endpoint: SDKEndpointView): ComposerModelOption[] {
  const runtimeId = sdkRuntimeId(endpoint.id);
  const disabled = !endpoint.enabled || !endpoint.keyConfigured;
  const candidates: Array<{ tier: SDKModelTier; model?: string; label: string }> = [
    { tier: 'default', model: endpoint.defaultModel, label: endpoint.defaultModel },
    { tier: 'fast', model: endpoint.fastModel, label: endpoint.fastModel ?? 'Fast model' },
    { tier: 'heavy', model: endpoint.heavyModel, label: endpoint.heavyModel ?? 'Heavy model' }
  ];
  const seen = new Set<string>();
  return candidates
    .filter((item) => Boolean(item.model))
    .filter((item) => {
      const key = `${item.tier}:${item.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      id: `${runtimeId}:${item.tier}:${item.model}`,
      label: item.label,
      model: item.model ?? '',
      runtimeId,
      endpointId: endpoint.id,
      modelTier: item.tier,
      disabled,
      description: `${endpoint.label} · ${tierLabel(item.tier)}`
    }));
}

function runtimeToModelOptions(runtime: RuntimeDescriptor): ComposerModelOption[] {
  const options =
    runtime.modelOptions && runtime.modelOptions.length > 0
      ? runtime.modelOptions
      : runtime.defaultModel
        ? [{ id: runtime.defaultModel, label: runtime.defaultModel }]
        : [];
  return options.map((model) => ({
    id: `${runtime.runtimeId}:${model.id}`,
    label: model.label,
    model: model.id,
    runtimeId: runtime.runtimeId,
    disabled: runtime.status === 'offline',
    description: model.description ?? runtime.name
  }));
}

function resolveDefaultSelection(
  runtimes: RuntimeDescriptor[],
  snapshot: SDKEndpointRegistrySnapshot | null
): RuntimeSelection {
  const endpoints = snapshot?.endpoints ?? [];
  const askDefault = snapshot?.defaults.ask
    ? endpoints.find((endpoint) => endpoint.id === snapshot.defaults.ask)
    : undefined;
  const firstUsableEndpoint =
    askDefault ??
    endpoints.find((endpoint) => endpoint.enabled && endpoint.keyConfigured) ??
    endpoints[0];
  if (firstUsableEndpoint) {
    return {
      runtimeId: sdkRuntimeId(firstUsableEndpoint.id),
      endpointId: firstUsableEndpoint.id,
      model: firstUsableEndpoint.defaultModel,
      modelTier: 'default',
      track: 'sdk_agent',
      agentProfileId: DEFAULT_PROFILES[0]?.id
    };
  }

  const runtime = runtimes.find((item) => item.status === 'online') ?? runtimes[0];
  if (runtime) {
    return {
      runtimeId: runtime.runtimeId,
      model: runtime.defaultModel ?? runtime.modelOptions?.[0]?.id,
      track: 'cli',
      agentProfileId: DEFAULT_PROFILES[0]?.id
    };
  }

  return { ...EMPTY_OPTIONS.defaultSelection };
}

function sdkRuntimeId(endpointId: string): string {
  return `sdk:${endpointId}`;
}

function tierLabel(tier: SDKModelTier): string {
  if (tier === 'fast') return '快速';
  if (tier === 'heavy') return '深度';
  return '默认';
}
