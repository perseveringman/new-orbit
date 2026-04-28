import { useEffect, useState } from 'react';
import { useAgent } from '../store/agent';
import { useWorkspace } from '../store/workspace';
import type { BudgetSettings } from '@shared/schemas';
import type { Theme } from '@shared/types';
import type { DetectResult } from '@shared/agent';
import type {
  SDKEndpointDefaults,
  SDKEndpointInput,
  SDKEndpointProvider,
  SDKEndpointRegistrySnapshot
} from '@shared/runtime';

type Numeric = 'perRunTokens' | 'perRunUSD' | 'dailyTokens' | 'dailyUSD';
type TabId = 'general' | 'api' | 'endpoints' | 'budget' | 'vectors' | 'advanced';

const BUDGET_FIELDS: Array<{ key: Numeric; label: string; step: number; unit: string }> = [
  { key: 'perRunTokens', label: 'Per-run tokens', step: 10_000, unit: 'tok' },
  { key: 'perRunUSD', label: 'Per-run USD', step: 0.5, unit: 'USD' },
  { key: 'dailyTokens', label: 'Daily tokens', step: 100_000, unit: 'tok' },
  { key: 'dailyUSD', label: 'Daily USD', step: 1, unit: 'USD' }
];

function toFieldString(v: number | null): string {
  return v === null ? '' : String(v);
}

function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const INPUT =
  `w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950 ${FOCUS}`;
const BTN =
  `rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${FOCUS}`;
const BTN_PRIMARY =
  `rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${FOCUS}`;

const ENDPOINT_PROVIDERS: SDKEndpointProvider[] = ['anthropic', 'minimax', 'deepseek', 'custom'];

function endpointDraft(provider: SDKEndpointProvider = 'anthropic'): SDKEndpointInput {
  const presets: Record<SDKEndpointProvider, Pick<SDKEndpointInput, 'label' | 'baseURL' | 'defaultModel'>> = {
    anthropic: {
      label: 'Anthropic',
      baseURL: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-latest'
    },
    minimax: {
      label: 'MiniMax',
      baseURL: 'https://api.minimax.chat/anthropic',
      defaultModel: 'minimax-m1'
    },
    deepseek: {
      label: 'DeepSeek',
      baseURL: 'https://api.deepseek.com/anthropic',
      defaultModel: 'deepseek-chat'
    },
    custom: {
      label: 'Custom Anthropic-compatible',
      baseURL: 'https://api.example.com',
      defaultModel: 'claude-compatible-model'
    }
  };
  return { provider, ...presets[provider], enabled: true };
}

export function SettingsModal(): JSX.Element | null {
  const open = useAgent((s) => s.settingsOpen);
  const close = useAgent((s) => s.closeSettings);
  const budget = useAgent((s) => s.budget);
  const updateBudget = useAgent((s) => s.updateBudget);
  const workspaceSettings = useWorkspace((s) => s.settings);
  const vault = useWorkspace((s) => s.vault);
  const closeVault = useWorkspace((s) => s.closeVault);
  const openVault = useWorkspace((s) => s.openVault);
  const updateSettings = useWorkspace((s) => s.updateSettings);

  const [tab, setTab] = useState<TabId>('general');
  const [draft, setDraft] = useState<BudgetSettings>(budget);
  const [theme, setThemeDraft] = useState<Theme>(workspaceSettings.theme);
  const [reopen, setReopen] = useState<boolean>(workspaceSettings.reopenLastVault);
  const [claudePath, setClaudePath] = useState<string>(workspaceSettings.claudePath);
  const [apiKey, setApiKey] = useState<string>(workspaceSettings.anthropicApiKey);
  const [vectorThreshold, setVectorThreshold] = useState<number>(
    workspaceSettings.vectorWakeThreshold
  );
  const [autoReview, setAutoReview] = useState<boolean>(
    Boolean(workspaceSettings.autoDailyReview)
  );
  const [autoReviewAt, setAutoReviewAt] = useState<string>(
    workspaceSettings.autoDailyReviewAt ?? '22:00'
  );
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [lastReindex, setLastReindex] = useState<{ count: number } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [endpointSnapshot, setEndpointSnapshot] = useState<SDKEndpointRegistrySnapshot | null>(null);
  const [endpointForm, setEndpointForm] = useState<SDKEndpointInput>(() => endpointDraft());
  const [endpointKeyInputs, setEndpointKeyInputs] = useState<Record<string, string>>({});
  const [endpointStatus, setEndpointStatus] = useState<Record<string, string>>({});
  const [endpointDefaults, setEndpointDefaults] = useState<SDKEndpointDefaults>({});

  useEffect(() => {
    if (!open) return;
    setDraft(budget);
    setThemeDraft(workspaceSettings.theme);
    setReopen(workspaceSettings.reopenLastVault);
    setClaudePath(workspaceSettings.claudePath);
    setApiKey(workspaceSettings.anthropicApiKey);
    setVectorThreshold(workspaceSettings.vectorWakeThreshold);
    setAutoReview(Boolean(workspaceSettings.autoDailyReview));
    setAutoReviewAt(workspaceSettings.autoDailyReviewAt ?? '22:00');
    setDetectResult(null);
    setLastReindex(null);
    setResetMsg(null);
    void loadEndpoints();
  }, [open, budget, workspaceSettings]);

  async function loadEndpoints(): Promise<void> {
    if (!vault) {
      setEndpointSnapshot(null);
      setEndpointDefaults({});
      return;
    }
    try {
      const snapshot = await window.orbit.runtime.sdk.snapshot();
      setEndpointSnapshot(snapshot);
      setEndpointDefaults(snapshot.defaults);
    } catch (error) {
      setEndpointStatus((s) => ({
        ...s,
        global: `Could not load endpoints: ${(error as Error).message}`
      }));
    }
  }

  if (!open) return null;

  async function onSave(): Promise<void> {
    setSaving(true);
    try {
      await updateBudget(draft);
      await updateSettings({
        theme,
        reopenLastVault: reopen,
        claudePath,
        anthropicApiKey: apiKey,
        vectorWakeThreshold: Math.min(1, Math.max(0, vectorThreshold)),
        autoDailyReview: autoReview,
        autoDailyReviewAt: autoReviewAt
      });
      close();
    } finally {
      setSaving(false);
    }
  }

  async function onReindex(): Promise<void> {
    setReindexing(true);
    setLastReindex(null);
    try {
      const res = await window.orbit.distill.reindex();
      setLastReindex(res);
    } catch {
      setLastReindex({ count: -1 });
    } finally {
      setReindexing(false);
    }
  }

  async function onDetect(): Promise<void> {
    setDetecting(true);
    try {
      const r = await window.orbit.settings.detectClaude();
      setDetectResult(r);
      if (r.available && r.path) setClaudePath(r.path);
    } finally {
      setDetecting(false);
    }
  }

  async function onResetAll(): Promise<void> {
    if (!confirm('Force-remove all unmerged worktrees? Uncommitted changes will be lost.')) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const r = await window.orbit.git.resetAll();
      setResetMsg(`Removed ${r.removed} worktree(s). Errors: ${r.errors.length}.`);
    } catch (e) {
      setResetMsg(`Reset failed: ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  }

  async function onSaveEndpoint(): Promise<void> {
    setEndpointStatus((s) => ({ ...s, form: 'Saving…' }));
    try {
      const saved = await window.orbit.runtime.sdk.upsertEndpoint(endpointForm);
      setEndpointForm(endpointDraft(endpointForm.provider));
      setEndpointKeyInputs((s) => ({ ...s, [saved.id]: '' }));
      setEndpointStatus((s) => ({ ...s, form: 'Endpoint saved.' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, form: `Save failed: ${(error as Error).message}` }));
    }
  }

  async function onSetEndpointKey(endpointId: string): Promise<void> {
    const key = endpointKeyInputs[endpointId]?.trim();
    if (!key) {
      setEndpointStatus((s) => ({ ...s, [endpointId]: 'Enter a key first.' }));
      return;
    }
    setEndpointStatus((s) => ({ ...s, [endpointId]: 'Saving key…' }));
    try {
      await window.orbit.runtime.sdk.setApiKey(endpointId, key);
      setEndpointKeyInputs((s) => ({ ...s, [endpointId]: '' }));
      setEndpointStatus((s) => ({ ...s, [endpointId]: 'Key saved.' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, [endpointId]: `Key failed: ${(error as Error).message}` }));
    }
  }

  async function onTestEndpoint(endpointId: string): Promise<void> {
    setEndpointStatus((s) => ({ ...s, [endpointId]: 'Testing…' }));
    try {
      const result = await window.orbit.runtime.sdk.testEndpoint(endpointId);
      setEndpointStatus((s) => ({
        ...s,
        [endpointId]: result.ok
          ? `OK (${result.latencyMs ?? 0}ms) ${result.message ?? ''}`.trim()
          : `Failed: ${result.error ?? 'unknown error'}`
      }));
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, [endpointId]: `Failed: ${(error as Error).message}` }));
    }
  }

  async function onSaveEndpointDefaults(): Promise<void> {
    setEndpointStatus((s) => ({ ...s, defaults: 'Saving defaults…' }));
    try {
      const defaults = await window.orbit.runtime.sdk.setDefaults(endpointDefaults);
      setEndpointDefaults(defaults);
      setEndpointStatus((s) => ({ ...s, defaults: 'Defaults saved.' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, defaults: `Defaults failed: ${(error as Error).message}` }));
    }
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'api', label: 'API / CLI' },
    { id: 'endpoints', label: 'AI Endpoints' },
    { id: 'budget', label: 'Budget' },
    { id: 'vectors', label: 'Vectors' },
    { id: 'advanced', label: 'Advanced' }
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            onClick={close}
            aria-label="Close settings"
            className={`rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${FOCUS}`}
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-[360px]">
          <nav className="flex w-36 flex-col gap-1 border-r border-neutral-200 p-2 text-sm dark:border-neutral-800">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded px-2 py-1 text-left ${FOCUS} ${
                  tab === t.id
                    ? 'bg-neutral-100 font-semibold dark:bg-neutral-800'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-auto p-5 text-sm">
            {tab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Vault</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={vault?.path ?? '(no vault open)'}
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (vault) void closeVault().then(() => void openVault());
                        else void openVault();
                      }}
                      className={BTN}
                    >
                      {vault ? 'Switch vault' : 'Open vault'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Theme</label>
                  <div className="flex gap-2">
                    {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThemeDraft(t)}
                        className={`${BTN} ${theme === t ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={reopen}
                    onChange={(e) => setReopen(e.target.checked)}
                    className={FOCUS}
                  />
                  <span>Reopen last vault on startup</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={autoReview}
                    onChange={(e) => setAutoReview(e.target.checked)}
                    className={FOCUS}
                  />
                  <span>Auto-generate Daily Review at</span>
                  <input
                    type="time"
                    value={autoReviewAt}
                    onChange={(e) => setAutoReviewAt(e.target.value)}
                    disabled={!autoReview}
                    className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              </div>
            )}
            {tab === 'api' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    Claude Code CLI path (leave blank to auto-detect)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={claudePath}
                      onChange={(e) => setClaudePath(e.target.value)}
                      placeholder="/opt/homebrew/bin/claude"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => void onDetect()}
                      disabled={detecting}
                      className={BTN}
                    >
                      {detecting ? 'Detecting…' : 'Auto-detect'}
                    </button>
                  </div>
                  {detectResult && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {detectResult.available
                        ? `Found ${detectResult.path} (v${detectResult.version ?? '?'})`
                        : `Not found: ${detectResult.error ?? 'unknown'}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    ANTHROPIC_API_KEY (stored locally in userData)
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-…"
                    autoComplete="off"
                    className={INPUT}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Legacy Claude CLI override. Prefer AI Endpoints for Runtime B SDK keys.
                  </p>
                </div>
              </div>
            )}
            {tab === 'endpoints' && (
              <div className="space-y-5">
                {!vault && (
                  <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Open a vault to manage SDK endpoints.
                  </p>
                )}
                {endpointStatus.global && (
                  <p className="text-xs text-red-500">{endpointStatus.global}</p>
                )}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Runtime B SDK endpoints</h3>
                    <p className="text-xs text-neutral-500">
                      Keys are kept in the SDK key vault and only masked key state is shown here.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(endpointSnapshot?.endpoints ?? []).map((endpoint) => (
                      <div
                        key={endpoint.id}
                        className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{endpoint.label}</div>
                            <div className="text-xs text-neutral-500">
                              {endpoint.provider} · {endpoint.defaultModel} · {endpoint.enabled ? 'enabled' : 'disabled'}
                            </div>
                            <div className="mt-1 break-all text-[11px] text-neutral-500">
                              {endpoint.baseURL}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={BTN}
                              onClick={() =>
                                setEndpointForm({
                                  id: endpoint.id,
                                  label: endpoint.label,
                                  provider: endpoint.provider,
                                  baseURL: endpoint.baseURL,
                                  defaultModel: endpoint.defaultModel,
                                  modelAlias: endpoint.modelAlias,
                                  costProfile: endpoint.costProfile,
                                  enabled: endpoint.enabled
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={BTN}
                              onClick={() => void onTestEndpoint(endpoint.id)}
                              disabled={!endpoint.keyConfigured || !endpoint.enabled}
                            >
                              Test
                            </button>
                            <button
                              type="button"
                              className={BTN}
                              onClick={() => {
                                if (!confirm(`${endpoint.builtIn ? 'Disable' : 'Delete'} ${endpoint.label}?`)) return;
                                void window.orbit.runtime.sdk.deleteEndpoint(endpoint.id).then(loadEndpoints);
                              }}
                            >
                              {endpoint.builtIn ? 'Disable' : 'Delete'}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                          <input
                            type="password"
                            value={endpointKeyInputs[endpoint.id] ?? ''}
                            onChange={(e) =>
                              setEndpointKeyInputs((s) => ({ ...s, [endpoint.id]: e.target.value }))
                            }
                            placeholder={endpoint.keyConfigured ? `Configured (${endpoint.keyMasked ?? 'masked'})` : 'API key'}
                            autoComplete="off"
                            className={INPUT}
                          />
                          <button
                            type="button"
                            className={BTN}
                            onClick={() => void onSetEndpointKey(endpoint.id)}
                          >
                            Save key
                          </button>
                          <button
                            type="button"
                            className={BTN}
                            onClick={() => {
                              if (!confirm(`Clear key for ${endpoint.label}?`)) return;
                              void window.orbit.runtime.sdk.deleteApiKey(endpoint.id).then(loadEndpoints);
                            }}
                            disabled={!endpoint.keyConfigured}
                          >
                            Clear key
                          </button>
                        </div>
                        {endpointStatus[endpoint.id] && (
                          <p className="mt-2 text-xs text-neutral-500">{endpointStatus[endpoint.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">
                    {endpointForm.id ? 'Edit endpoint' : 'Add endpoint'}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-neutral-500">
                      Provider
                      <select
                        value={endpointForm.provider}
                        onChange={(e) => setEndpointForm(endpointDraft(e.target.value as SDKEndpointProvider))}
                        className={`${INPUT} mt-1`}
                      >
                        {ENDPOINT_PROVIDERS.map((provider) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-500">
                      Label
                      <input
                        value={endpointForm.label}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, label: e.target.value }))}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500 md:col-span-2">
                      Base URL
                      <input
                        value={endpointForm.baseURL}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, baseURL: e.target.value }))}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500">
                      Default model
                      <input
                        value={endpointForm.defaultModel}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, defaultModel: e.target.value }))}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(endpointForm.enabled)}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, enabled: e.target.checked }))}
                        className={FOCUS}
                      />
                      Enabled
                    </label>
                    <label className="text-xs text-neutral-500 md:col-span-2">
                      API key (optional on save)
                      <input
                        type="password"
                        value={endpointForm.apiKey ?? ''}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, apiKey: e.target.value }))}
                        placeholder="Stored in key vault, not endpoint config"
                        autoComplete="off"
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className={BTN_PRIMARY} onClick={() => void onSaveEndpoint()}>
                      Save endpoint
                    </button>
                    <button type="button" className={BTN} onClick={() => setEndpointForm(endpointDraft())}>
                      New
                    </button>
                    {endpointStatus.form && <span className="text-xs text-neutral-500">{endpointStatus.form}</span>}
                  </div>
                </section>
                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">Defaults</h3>
                  {(['ask', 'synthesis', 'background'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-3 text-xs">
                      <span className="w-24 capitalize text-neutral-500">{mode}</span>
                      <select
                        value={endpointDefaults[mode] ?? ''}
                        onChange={(e) =>
                          setEndpointDefaults((d) => ({
                            ...d,
                            [mode]: e.target.value || undefined
                          }))
                        }
                        className={INPUT}
                      >
                        <option value="">Auto / CLI fallback</option>
                        {(endpointSnapshot?.endpoints ?? []).map((endpoint) => (
                          <option key={endpoint.id} value={endpoint.id}>
                            {endpoint.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className="flex items-center gap-2">
                    <button type="button" className={BTN} onClick={() => void onSaveEndpointDefaults()}>
                      Save defaults
                    </button>
                    {endpointStatus.defaults && (
                      <span className="text-xs text-neutral-500">{endpointStatus.defaults}</span>
                    )}
                  </div>
                </section>
              </div>
            )}
            {tab === 'budget' && (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">
                  Leave a field blank to treat it as{' '}
                  <span className="font-semibold">unlimited</span>.
                </p>
                {BUDGET_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <label className="w-32 text-xs text-neutral-600 dark:text-neutral-300">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      step={f.step}
                      min={0}
                      value={toFieldString(draft[f.key])}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [f.key]: parseField(e.target.value) }))
                      }
                      placeholder="unlimited"
                      className={INPUT}
                    />
                    <span className="w-10 text-xs text-neutral-500">{f.unit}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <label className="w-32 text-xs text-neutral-600 dark:text-neutral-300">
                    Warn at %
                  </label>
                  <input
                    type="number"
                    step={5}
                    min={0}
                    max={100}
                    value={draft.warnAtPercent}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        warnAtPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0))
                      }))
                    }
                    className={INPUT}
                  />
                  <span className="w-10 text-xs text-neutral-500">%</span>
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.hardStop}
                    onChange={(e) => setDraft((d) => ({ ...d, hardStop: e.target.checked }))}
                    className={`mt-0.5 ${FOCUS}`}
                  />
                  <span>
                    <span className="font-semibold">Hard stop</span> — block runs that would
                    exceed a cap. Disable to only warn.
                  </span>
                </label>
              </div>
            )}
            {tab === 'vectors' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Provider</label>
                  <input readOnly value="hash-trick (local)" className={INPUT} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    Wake-up injection threshold ({vectorThreshold.toFixed(2)})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={vectorThreshold}
                    onChange={(e) => setVectorThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <p className="mb-2 text-xs text-neutral-500">
                    Rebuild the local semantic index. Embeddings stay on this machine.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void onReindex()}
                      disabled={reindexing}
                      className={BTN}
                    >
                      {reindexing ? 'Re-indexing…' : 'Re-index vectors'}
                    </button>
                    {lastReindex && lastReindex.count >= 0 && (
                      <span className="text-xs text-neutral-500">
                        Indexed {lastReindex.count} files.
                      </span>
                    )}
                    {lastReindex && lastReindex.count < 0 && (
                      <span className="text-xs text-red-500">Re-index failed.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {tab === 'advanced' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void window.orbit.workspace.revealUserData()}
                    className={BTN}
                  >
                    Reveal userData folder
                  </button>
                  <button
                    type="button"
                    onClick={() => void window.orbit.workspace.revealVaultOrbit()}
                    disabled={!vault}
                    className={BTN}
                  >
                    Reveal vault .orbit folder
                  </button>
                </div>
                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => void onResetAll()}
                    disabled={resetting}
                    className={`${BTN} text-red-600 dark:text-red-400`}
                  >
                    {resetting ? 'Resetting…' : 'Reset all unmerged worktrees'}
                  </button>
                  {resetMsg && <p className="mt-1 text-xs text-neutral-500">{resetMsg}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
          <button onClick={close} className={BTN}>
            Cancel
          </button>
          <button onClick={() => void onSave()} disabled={saving} className={BTN_PRIMARY}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
