import { useEffect, useRef, useState } from 'react';
import { useAgent } from '../store/agent';
import { useWorkspace } from '../store/workspace';
import type { BudgetSettings } from '@shared/schemas';
import type { Theme } from '@shared/types';
import type { DetectResult } from '@shared/agent';
import type { ExternalAISessionSettings } from '@shared/evidence';
import type {
  SDKEndpointDefaults,
  SDKEndpointInput,
  SDKEndpointProvider,
  SDKEndpointRegistrySnapshot
} from '@shared/runtime';
import type {
  ExternalGatewayConfig,
  ExternalGatewayRequestLogEntry,
  ExternalGatewaySessionMapping,
  ExternalGatewayStatus
} from '@shared/external-gateway';
import type { ExternalGatewayCapability } from '@shared/external-gateway-protocol';

type Numeric = 'perRunTokens' | 'perRunUSD' | 'dailyTokens' | 'dailyUSD';
type TabId =
  | 'general'
  | 'api'
  | 'endpoints'
  | 'externalGateway'
  | 'memorySources'
  | 'budget'
  | 'vectors'
  | 'advanced';

const BUDGET_FIELDS: Array<{ key: Numeric; label: string; step: number; unit: string }> = [
  { key: 'perRunTokens', label: '单次运行 tokens', step: 10_000, unit: 'tok' },
  { key: 'perRunUSD', label: '单次运行美元', step: 0.5, unit: 'USD' },
  { key: 'dailyTokens', label: '每日 tokens', step: 100_000, unit: 'tok' },
  { key: 'dailyUSD', label: '每日美元', step: 1, unit: 'USD' }
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
const INPUT = `w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950 ${FOCUS}`;
const BTN = `rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${FOCUS}`;
const BTN_PRIMARY = `rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${FOCUS}`;

const ENDPOINT_PROVIDERS: SDKEndpointProvider[] = ['anthropic', 'minimax', 'deepseek', 'custom'];

function endpointDraft(provider: SDKEndpointProvider = 'anthropic'): SDKEndpointInput {
  const presets: Record<
    SDKEndpointProvider,
    Pick<SDKEndpointInput, 'label' | 'baseURL' | 'defaultModel' | 'fastModel' | 'heavyModel'>
  > = {
    anthropic: {
      label: 'Anthropic',
      baseURL: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-latest',
      fastModel: 'claude-3-5-haiku-latest',
      heavyModel: 'claude-3-5-sonnet-latest'
    },
    minimax: {
      label: 'MiniMax',
      baseURL: 'https://api.minimaxi.com/anthropic',
      defaultModel: 'MiniMax-M2.7',
      fastModel: 'MiniMax-M2.7',
      heavyModel: 'MiniMax-M2.7'
    },
    deepseek: {
      label: 'DeepSeek',
      baseURL: 'https://api.deepseek.com/anthropic',
      defaultModel: 'deepseek-v4-pro',
      fastModel: 'deepseek-chat',
      heavyModel: 'deepseek-v4-pro'
    },
    custom: {
      label: 'Custom Anthropic-compatible',
      baseURL: 'https://api.example.com',
      defaultModel: 'claude-compatible-model',
      fastModel: 'fast-model',
      heavyModel: 'heavy-model'
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
  const [autoReview, setAutoReview] = useState<boolean>(Boolean(workspaceSettings.autoDailyReview));
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
  const [endpointSnapshot, setEndpointSnapshot] = useState<SDKEndpointRegistrySnapshot | null>(
    null
  );
  const [endpointForm, setEndpointForm] = useState<SDKEndpointInput>(() => endpointDraft());
  const [endpointKeyInputs, setEndpointKeyInputs] = useState<Record<string, string>>({});
  const [endpointStatus, setEndpointStatus] = useState<Record<string, string>>({});
  const [endpointDefaults, setEndpointDefaults] = useState<SDKEndpointDefaults>({});
  const [chatEndpointId, setChatEndpointId] = useState<string>('');
  const [chatModel, setChatModel] = useState<string>('');
  const [chatPrompt, setChatPrompt] = useState<string>('你好，请用一句话简短回复。');
  const [chatResponse, setChatResponse] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('');
  const [chatBusy, setChatBusy] = useState<boolean>(false);
  const [externalConfig, setExternalConfig] = useState<ExternalGatewayConfig | null>(null);
  const [externalStatus, setExternalStatus] = useState<ExternalGatewayStatus | null>(null);
  const [externalSessions, setExternalSessions] = useState<ExternalGatewaySessionMapping[]>([]);
  const [externalRequestLog, setExternalRequestLog] = useState<ExternalGatewayRequestLogEntry[]>(
    []
  );
  const [externalAllowedUsers, setExternalAllowedUsers] = useState<string>('');
  const [externalMessage, setExternalMessage] = useState<string>('');
  const [externalSessionSettings, setExternalSessionSettings] =
    useState<ExternalAISessionSettings | null>(null);
  const [externalSessionMessage, setExternalSessionMessage] = useState<string>('');
  const endpointFormRef = useRef<HTMLElement | null>(null);

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
    void loadExternalGateway();
    void loadExternalSessionSettings();
  }, [open, budget, workspaceSettings]);

  useEffect(() => {
    if (!open || tab !== 'externalGateway') return undefined;
    const off = window.orbit.externalGateway.onEvent((status) => {
      setExternalStatus(status);
      void loadExternalGateway(false);
    });
    return off;
  }, [open, tab]);

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
      setChatEndpointId((current) => {
        if (current && snapshot.endpoints.some((e) => e.id === current)) return current;
        const firstReady = snapshot.endpoints.find((e) => e.enabled && e.keyConfigured);
        return firstReady?.id ?? snapshot.endpoints[0]?.id ?? '';
      });
    } catch (error) {
      setEndpointStatus((s) => ({
        ...s,
        global: `加载端点失败：${(error as Error).message}`
      }));
    }
  }

  async function loadExternalGateway(updateStatus = true): Promise<void> {
    if (!vault) {
      setExternalConfig(null);
      setExternalStatus(null);
      setExternalSessions([]);
      setExternalRequestLog([]);
      return;
    }
    try {
      const [config, status, sessions, requestLog] = await Promise.all([
        window.orbit.externalGateway.getConfig(),
        updateStatus ? window.orbit.externalGateway.status() : Promise.resolve(externalStatus),
        window.orbit.externalGateway.listSessions(),
        window.orbit.externalGateway.listRequestLog(20)
      ]);
      setExternalConfig(config);
      if (status) setExternalStatus(status);
      setExternalSessions(sessions);
      setExternalRequestLog(requestLog);
      setExternalAllowedUsers(
        config.allowed_users.map((user) => `${user.platform}:${user.userId}`).join('\n')
      );
    } catch (error) {
      setExternalMessage(`加载 External Gateway 失败：${(error as Error).message}`);
    }
  }

  async function loadExternalSessionSettings(): Promise<void> {
    if (!vault) {
      setExternalSessionSettings(null);
      return;
    }
    try {
      setExternalSessionSettings(await window.orbit.evidence.externalSessionSettings());
      setExternalSessionMessage('');
    } catch (error) {
      setExternalSessionMessage(`加载本地会话设置失败：${(error as Error).message}`);
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
    if (!confirm('确定强制移除所有未合并的 worktree？未提交的修改会丢失。')) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const r = await window.orbit.git.resetAll();
      setResetMsg(`已移除 ${r.removed} 个 worktree，错误 ${r.errors.length} 条。`);
    } catch (e) {
      setResetMsg(`重置失败：${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  }

  async function onSaveEndpoint(): Promise<void> {
    setEndpointStatus((s) => ({ ...s, form: '保存中…' }));
    try {
      const saved = await window.orbit.runtime.sdk.upsertEndpoint(endpointForm);
      setEndpointForm(endpointDraft(endpointForm.provider));
      setEndpointKeyInputs((s) => ({ ...s, [saved.id]: '' }));
      setEndpointStatus((s) => ({ ...s, form: '端点已保存。' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, form: `保存失败：${(error as Error).message}` }));
    }
  }

  async function onSetEndpointKey(endpointId: string): Promise<void> {
    const key = endpointKeyInputs[endpointId]?.trim();
    if (!key) {
      setEndpointStatus((s) => ({ ...s, [endpointId]: '请先填入 API 密钥。' }));
      return;
    }
    setEndpointStatus((s) => ({ ...s, [endpointId]: '保存密钥中…' }));
    try {
      await window.orbit.runtime.sdk.setApiKey(endpointId, key);
      setEndpointKeyInputs((s) => ({ ...s, [endpointId]: '' }));
      setEndpointStatus((s) => ({ ...s, [endpointId]: '密钥已保存。' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({
        ...s,
        [endpointId]: `保存密钥失败:${(error as Error).message}`
      }));
    }
  }

  async function onTestEndpoint(endpointId: string): Promise<void> {
    setEndpointStatus((s) => ({ ...s, [endpointId]: '测试中…' }));
    try {
      const result = await window.orbit.runtime.sdk.testEndpoint(endpointId);
      setEndpointStatus((s) => ({
        ...s,
        [endpointId]: result.ok
          ? `成功 (${result.latencyMs ?? 0}ms) ${result.message ?? ''}`.trim()
          : `失败：${result.error ?? '未知错误'}`
      }));
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, [endpointId]: `失败：${(error as Error).message}` }));
    }
  }

  async function onToggleEndpointEnabled(
    endpoint: SDKEndpointRegistrySnapshot['endpoints'][number]
  ): Promise<void> {
    setEndpointStatus((s) => ({ ...s, [endpoint.id]: endpoint.enabled ? '禁用中…' : '启用中…' }));
    try {
      await window.orbit.runtime.sdk.upsertEndpoint({
        id: endpoint.id,
        label: endpoint.label,
        provider: endpoint.provider,
        baseURL: endpoint.baseURL,
        defaultModel: endpoint.defaultModel,
        fastModel: endpoint.fastModel,
        heavyModel: endpoint.heavyModel,
        modelAlias: endpoint.modelAlias,
        costProfile: endpoint.costProfile,
        enabled: !endpoint.enabled
      });
      setEndpointStatus((s) => ({
        ...s,
        [endpoint.id]: endpoint.enabled ? '已禁用。' : '已启用。'
      }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, [endpoint.id]: `操作失败：${(error as Error).message}` }));
    }
  }

  function onEditEndpoint(endpoint: SDKEndpointRegistrySnapshot['endpoints'][number]): void {
    setEndpointForm({
      id: endpoint.id,
      label: endpoint.label,
      provider: endpoint.provider,
      baseURL: endpoint.baseURL,
      defaultModel: endpoint.defaultModel,
      fastModel: endpoint.fastModel,
      heavyModel: endpoint.heavyModel,
      modelAlias: endpoint.modelAlias,
      costProfile: endpoint.costProfile,
      enabled: endpoint.enabled
    });
    setEndpointStatus((s) => ({ ...s, form: `正在编辑 ${endpoint.label}` }));
    window.requestAnimationFrame(() => {
      endpointFormRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  async function onSendChat(): Promise<void> {
    if (!chatEndpointId) {
      setChatStatus('请先选择一个端点。');
      return;
    }
    const prompt = chatPrompt.trim();
    if (!prompt) {
      setChatStatus('请先输入提示词。');
      return;
    }
    setChatBusy(true);
    setChatStatus('发送中…');
    setChatResponse('');
    try {
      const result = await window.orbit.runtime.sdk.testEndpoint(
        chatEndpointId,
        chatModel.trim() || undefined,
        prompt
      );
      if (result.ok) {
        setChatResponse(result.message ?? '');
        setChatStatus(`成功 · ${result.model ?? '?'} · ${result.latencyMs ?? 0}ms`);
      } else {
        setChatResponse('');
        setChatStatus(`失败：${result.error ?? '未知错误'}`);
      }
    } catch (error) {
      setChatStatus(`失败：${(error as Error).message}`);
    } finally {
      setChatBusy(false);
    }
  }

  async function onSaveEndpointDefaults(): Promise<void> {
    setEndpointStatus((s) => ({ ...s, defaults: '保存默认中…' }));
    try {
      const defaults = await window.orbit.runtime.sdk.setDefaults(endpointDefaults);
      setEndpointDefaults(defaults);
      setEndpointStatus((s) => ({ ...s, defaults: '默认已保存。' }));
      await loadEndpoints();
    } catch (error) {
      setEndpointStatus((s) => ({ ...s, defaults: `保存默认失败：${(error as Error).message}` }));
    }
  }

  async function onToggleExternalGateway(nextEnabled: boolean): Promise<void> {
    setExternalMessage(nextEnabled ? '启动 External Gateway…' : '停止 External Gateway…');
    try {
      const status = nextEnabled
        ? await window.orbit.externalGateway.start()
        : await window.orbit.externalGateway.stop();
      setExternalStatus(status);
      await loadExternalGateway();
      setExternalMessage(nextEnabled ? 'External Gateway 已启动。' : 'External Gateway 已停止。');
    } catch (error) {
      setExternalMessage(`操作失败：${(error as Error).message}`);
    }
  }

  async function onSaveExternalGateway(): Promise<void> {
    if (!externalConfig) return;
    setExternalMessage('保存 External Gateway 配置…');
    const allowed_users = externalAllowedUsers
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [platform, ...rest] = item.split(':');
        return { platform: platform || 'unknown', userId: rest.join(':') || item };
      });
    try {
      const saved = await window.orbit.externalGateway.updateConfig({
        ...externalConfig,
        allowed_users
      });
      setExternalConfig(saved);
      setExternalMessage('External Gateway 配置已保存。');
      await loadExternalGateway();
    } catch (error) {
      setExternalMessage(`保存失败：${(error as Error).message}`);
    }
  }

  async function onToggleExternalCapability(capability: ExternalGatewayCapability): Promise<void> {
    if (!externalConfig) return;
    const saved = await window.orbit.externalGateway.updateConfig({
      capability_permissions: {
        ...externalConfig.capability_permissions,
        [capability]: !externalConfig.capability_permissions[capability]
      }
    });
    setExternalConfig(saved);
    await loadExternalGateway();
  }

  async function onSaveExternalSessionSettings(): Promise<void> {
    if (!externalSessionSettings) return;
    setExternalSessionMessage('保存本地会话设置…');
    try {
      const saved =
        await window.orbit.evidence.updateExternalSessionSettings(externalSessionSettings);
      setExternalSessionSettings(saved);
      await window.orbit.evidence.sync({
        includeExternalAISessions: saved.enabled,
        externalAISessionLimit: saved.limit
      });
      setExternalSessionMessage('本地会话设置已保存，证据源已同步。');
    } catch (error) {
      setExternalSessionMessage(`保存失败：${(error as Error).message}`);
    }
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'general', label: '通用' },
    { id: 'api', label: 'API / CLI' },
    { id: 'endpoints', label: 'AI 端点' },
    { id: 'externalGateway', label: '外部网关' },
    { id: 'memorySources', label: '记忆源' },
    { id: 'budget', label: '预算' },
    { id: 'vectors', label: '向量' },
    { id: 'advanced', label: '高级' }
  ];

  const themeLabels: Record<Theme, string> = {
    light: '浅色',
    dark: '深色',
    system: '跟随系统'
  };

  const modeLabels: Record<'ask' | 'synthesis' | 'background', string> = {
    ask: '问答（Ask）',
    synthesis: '综合（Synthesis）',
    background: '后台（Background）'
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-base font-semibold">设置</h2>
          <button
            onClick={close}
            aria-label="关闭设置"
            className={`rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${FOCUS}`}
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-36 flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-neutral-200 p-2 text-sm dark:border-neutral-800">
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
                  <label className="mb-1 block text-xs text-neutral-500">工作库</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={vault?.path ?? '（未打开工作库）'} className={INPUT} />
                    <button
                      type="button"
                      onClick={() => {
                        if (vault) void closeVault().then(() => void openVault());
                        else void openVault();
                      }}
                      className={BTN}
                    >
                      {vault ? '切换工作库' : '打开工作库'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">主题</label>
                  <div className="flex gap-2">
                    {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThemeDraft(t)}
                        className={`${BTN} ${theme === t ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                      >
                        {themeLabels[t]}
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
                  <span>启动时自动打开上次的工作库</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={autoReview}
                    onChange={(e) => setAutoReview(e.target.checked)}
                    className={FOCUS}
                  />
                  <span>每天定时自动生成日报</span>
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
                    Claude Code CLI 路径（留空则自动检测）
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
                      {detecting ? '检测中…' : '自动检测'}
                    </button>
                  </div>
                  {detectResult && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {detectResult.available
                        ? `已找到 ${detectResult.path}（v${detectResult.version ?? '?'}）`
                        : `未找到：${detectResult.error ?? '未知错误'}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    ANTHROPIC_API_KEY（仅保存在本地 userData）
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
                    历史的 Claude CLI 替代项。新版本请优先在「AI 端点」中配置 Runtime B SDK 密钥。
                  </p>
                </div>
              </div>
            )}
            {tab === 'endpoints' && (
              <div className="space-y-5">
                {!vault && (
                  <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    请先打开工作库才能管理 SDK 端点。
                  </p>
                )}
                {endpointStatus.global && (
                  <p className="text-xs text-red-500">{endpointStatus.global}</p>
                )}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Runtime B SDK 端点</h3>
                    <p className="text-xs text-neutral-500">
                      API 密钥保存在本机的 SDK 钥匙环中，这里只展示是否已配置以及脱敏后的状态。
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
                              {endpoint.provider} · 默认 {endpoint.defaultModel} · 快速{' '}
                              {endpoint.fastModel ?? endpoint.defaultModel} · 重度{' '}
                              {endpoint.heavyModel ?? endpoint.defaultModel} ·{' '}
                              {endpoint.enabled ? '已启用' : '已禁用'}
                            </div>
                            <div className="mt-1 break-all text-[11px] text-neutral-500">
                              {endpoint.baseURL}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={BTN}
                              onClick={() => onEditEndpoint(endpoint)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className={BTN}
                              onClick={() => void onTestEndpoint(endpoint.id)}
                              disabled={!endpoint.keyConfigured}
                            >
                              测试
                            </button>
                            <button
                              type="button"
                              className={BTN}
                              onClick={() => void onToggleEndpointEnabled(endpoint)}
                            >
                              {endpoint.enabled ? '禁用' : '启用'}
                            </button>
                            {!endpoint.builtIn && (
                              <button
                                type="button"
                                className={`${BTN} text-red-600 dark:text-red-400`}
                                onClick={() => {
                                  if (!confirm(`删除 ${endpoint.label}？`)) return;
                                  void window.orbit.runtime.sdk
                                    .deleteEndpoint(endpoint.id)
                                    .then(loadEndpoints);
                                }}
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                          <input
                            type="password"
                            value={endpointKeyInputs[endpoint.id] ?? ''}
                            onChange={(e) =>
                              setEndpointKeyInputs((s) => ({ ...s, [endpoint.id]: e.target.value }))
                            }
                            placeholder={
                              endpoint.keyConfigured
                                ? `已配置（${endpoint.keyMasked ?? '已脱敏'}）`
                                : 'API 密钥'
                            }
                            autoComplete="off"
                            className={INPUT}
                          />
                          <button
                            type="button"
                            className={BTN}
                            onClick={() => void onSetEndpointKey(endpoint.id)}
                          >
                            保存密钥
                          </button>
                          <button
                            type="button"
                            className={BTN}
                            onClick={() => {
                              if (!confirm(`清除 ${endpoint.label} 的密钥？`)) return;
                              void window.orbit.runtime.sdk
                                .deleteApiKey(endpoint.id)
                                .then(loadEndpoints);
                            }}
                            disabled={!endpoint.keyConfigured}
                          >
                            清除密钥
                          </button>
                        </div>
                        {endpointStatus[endpoint.id] && (
                          <p className="mt-2 text-xs text-neutral-500">
                            {endpointStatus[endpoint.id]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                <section
                  ref={endpointFormRef}
                  className={`space-y-3 rounded border p-3 ${
                    endpointForm.id
                      ? 'border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <h3 className="text-sm font-semibold">
                    {endpointForm.id ? `编辑端点 · ${endpointForm.label}` : '新增端点'}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-neutral-500">
                      提供商
                      <select
                        value={endpointForm.provider}
                        onChange={(e) =>
                          setEndpointForm(endpointDraft(e.target.value as SDKEndpointProvider))
                        }
                        className={`${INPUT} mt-1`}
                      >
                        {ENDPOINT_PROVIDERS.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-500">
                      显示名称
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
                        onChange={(e) =>
                          setEndpointForm((f) => ({ ...f, baseURL: e.target.value }))
                        }
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500">
                      默认模型
                      <input
                        value={endpointForm.defaultModel}
                        onChange={(e) =>
                          setEndpointForm((f) => ({ ...f, defaultModel: e.target.value }))
                        }
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500">
                      快速模型
                      <input
                        value={endpointForm.fastModel ?? ''}
                        onChange={(e) =>
                          setEndpointForm((f) => ({ ...f, fastModel: e.target.value }))
                        }
                        placeholder={endpointForm.defaultModel || '未填则使用默认模型'}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500">
                      重度模型
                      <input
                        value={endpointForm.heavyModel ?? ''}
                        onChange={(e) =>
                          setEndpointForm((f) => ({ ...f, heavyModel: e.target.value }))
                        }
                        placeholder={endpointForm.defaultModel || '未填则使用默认模型'}
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(endpointForm.enabled)}
                        onChange={(e) =>
                          setEndpointForm((f) => ({ ...f, enabled: e.target.checked }))
                        }
                        className={FOCUS}
                      />
                      启用
                    </label>
                    <label className="text-xs text-neutral-500 md:col-span-2">
                      API 密钥（保存时可选）
                      <input
                        type="password"
                        value={endpointForm.apiKey ?? ''}
                        onChange={(e) => setEndpointForm((f) => ({ ...f, apiKey: e.target.value }))}
                        placeholder="保存到本地钥匙环，不写入端点配置文件"
                        autoComplete="off"
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      onClick={() => void onSaveEndpoint()}
                    >
                      保存端点
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => setEndpointForm(endpointDraft())}
                    >
                      新建
                    </button>
                    {endpointStatus.form && (
                      <span className="text-xs text-neutral-500">{endpointStatus.form}</span>
                    )}
                  </div>
                </section>
                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">默认端点</h3>
                  {(['ask', 'synthesis', 'background'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-3 text-xs">
                      <span className="w-32 text-neutral-500">{modeLabels[mode]}</span>
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
                        <option value="">自动 / 回退到 CLI</option>
                        {(endpointSnapshot?.endpoints ?? []).map((endpoint) => (
                          <option key={endpoint.id} value={endpoint.id}>
                            {endpoint.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => void onSaveEndpointDefaults()}
                    >
                      保存默认
                    </button>
                    {endpointStatus.defaults && (
                      <span className="text-xs text-neutral-500">{endpointStatus.defaults}</span>
                    )}
                  </div>
                </section>
                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <div>
                    <h3 className="text-sm font-semibold">测试端点</h3>
                    <p className="text-xs text-neutral-500">
                      发送一条提示词，验证端点和模型是否可用。使用已保存的 API
                      密钥，端点处于「禁用」状态时也能测试。
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-neutral-500">
                      端点
                      <select
                        value={chatEndpointId}
                        onChange={(e) => {
                          setChatEndpointId(e.target.value);
                          setChatModel('');
                        }}
                        className={`${INPUT} mt-1`}
                        disabled={!endpointSnapshot?.endpoints.length}
                      >
                        {!endpointSnapshot?.endpoints.length && (
                          <option value="">尚未配置端点</option>
                        )}
                        {(endpointSnapshot?.endpoints ?? []).map((endpoint) => (
                          <option key={endpoint.id} value={endpoint.id}>
                            {endpoint.label}
                            {endpoint.keyConfigured ? '' : '（未配置密钥）'}
                            {endpoint.enabled ? '' : ' · 已禁用'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-500">
                      模型（可选，覆盖默认）
                      <input
                        value={chatModel}
                        onChange={(e) => setChatModel(e.target.value)}
                        placeholder={
                          endpointSnapshot?.endpoints.find((e) => e.id === chatEndpointId)
                            ?.defaultModel ?? '使用端点默认模型'
                        }
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-neutral-500">
                    提示词
                    <textarea
                      value={chatPrompt}
                      onChange={(e) => setChatPrompt(e.target.value)}
                      rows={3}
                      className={`${INPUT} mt-1 font-mono text-xs`}
                      placeholder="输入要发送的内容"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      onClick={() => void onSendChat()}
                      disabled={chatBusy || !chatEndpointId}
                    >
                      {chatBusy ? '发送中…' : '发送测试'}
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => {
                        setChatResponse('');
                        setChatStatus('');
                      }}
                      disabled={chatBusy}
                    >
                      清空
                    </button>
                    {chatStatus && <span className="text-xs text-neutral-500">{chatStatus}</span>}
                  </div>
                  {chatResponse && (
                    <div className="rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                        回复
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                        {chatResponse}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            )}
            {tab === 'memorySources' && (
              <div className="space-y-4">
                {!vault && (
                  <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    请先打开工作库。
                  </p>
                )}
                {externalSessionSettings && (
                  <>
                    <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">本地 Agent 会话</h3>
                          <p className="text-xs text-neutral-500">
                            Claude / Codex / Amp / CodeBuddy
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={externalSessionSettings.enabled}
                            onChange={(event) =>
                              setExternalSessionSettings({
                                ...externalSessionSettings,
                                enabled: event.target.checked
                              })
                            }
                            className={FOCUS}
                          />
                          <span>{externalSessionSettings.enabled ? '已启用' : '已停用'}</span>
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-neutral-500">
                          扫描上限
                          <input
                            type="number"
                            min={1}
                            max={5000}
                            value={externalSessionSettings.limit}
                            onChange={(event) =>
                              setExternalSessionSettings({
                                ...externalSessionSettings,
                                limit: Math.max(1, Number(event.target.value) || 1)
                              })
                            }
                            className={`${INPUT} mt-1`}
                          />
                        </label>
                        <label className="text-xs text-neutral-500">
                          索引级别
                          <select
                            value={externalSessionSettings.indexLevel}
                            onChange={(event) =>
                              setExternalSessionSettings({
                                ...externalSessionSettings,
                                indexLevel: event.target
                                  .value as ExternalAISessionSettings['indexLevel']
                              })
                            }
                            className={`${INPUT} mt-1`}
                          >
                            <option value="metadata_only">仅元数据</option>
                            <option value="safe_projection">安全投影</option>
                            <option value="full_text">全文</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={externalSessionSettings.includeToolOutputs}
                          onChange={(event) =>
                            setExternalSessionSettings({
                              ...externalSessionSettings,
                              includeToolOutputs: event.target.checked
                            })
                          }
                          className={FOCUS}
                        />
                        <span>安全投影包含工具输出</span>
                      </label>
                    </section>
                    <section className="grid gap-3 sm:grid-cols-2">
                      <TextListEditor
                        label="只包含 Agent"
                        value={externalSessionSettings.includeAgents}
                        onChange={(includeAgents) =>
                          setExternalSessionSettings({ ...externalSessionSettings, includeAgents })
                        }
                      />
                      <TextListEditor
                        label="排除 Agent"
                        value={externalSessionSettings.excludeAgents}
                        onChange={(excludeAgents) =>
                          setExternalSessionSettings({ ...externalSessionSettings, excludeAgents })
                        }
                      />
                      <TextListEditor
                        label="只包含项目"
                        value={externalSessionSettings.includeProjects}
                        onChange={(includeProjects) =>
                          setExternalSessionSettings({
                            ...externalSessionSettings,
                            includeProjects
                          })
                        }
                      />
                      <TextListEditor
                        label="排除项目"
                        value={externalSessionSettings.excludeProjects}
                        onChange={(excludeProjects) =>
                          setExternalSessionSettings({
                            ...externalSessionSettings,
                            excludeProjects
                          })
                        }
                      />
                      <TextListEditor
                        label="路径包含"
                        value={externalSessionSettings.includePathSubstrings}
                        onChange={(includePathSubstrings) =>
                          setExternalSessionSettings({
                            ...externalSessionSettings,
                            includePathSubstrings
                          })
                        }
                      />
                      <TextListEditor
                        label="路径排除"
                        value={externalSessionSettings.excludePathSubstrings}
                        onChange={(excludePathSubstrings) =>
                          setExternalSessionSettings({
                            ...externalSessionSettings,
                            excludePathSubstrings
                          })
                        }
                      />
                    </section>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void onSaveExternalSessionSettings()}
                        className={BTN_PRIMARY}
                      >
                        保存并同步
                      </button>
                      {externalSessionMessage && (
                        <span className="text-xs text-neutral-500">{externalSessionMessage}</span>
                      )}
                    </div>
                  </>
                )}
                {!externalSessionSettings && externalSessionMessage && (
                  <p className="text-xs text-red-500">{externalSessionMessage}</p>
                )}
              </div>
            )}
            {tab === 'externalGateway' && (
              <div className="space-y-5">
                {!vault && (
                  <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    请先打开工作库才能启用 cc-connect External Gateway。
                  </p>
                )}
                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">cc-connect External Gateway</h3>
                      <p className="text-xs text-neutral-500">
                        Orbit 监听 Unix Socket，cc-connect 的 orbit-agent 只负责传输和会话桥接。
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        disabled={!vault || externalStatus?.running}
                        onClick={() => void onToggleExternalGateway(true)}
                      >
                        启动
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={!vault || !externalStatus?.running}
                        onClick={() => void onToggleExternalGateway(false)}
                      >
                        停止
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-950">
                      <div className="text-neutral-500">状态</div>
                      <div className="font-medium">
                        {externalStatus?.running ? 'running' : 'stopped'}
                      </div>
                    </div>
                    <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-950">
                      <div className="text-neutral-500">连接 / 请求 / Session</div>
                      <div className="font-medium">
                        {externalStatus?.connected_clients ?? 0} /{' '}
                        {externalStatus?.active_requests ?? 0} /{' '}
                        {externalStatus?.active_sessions ?? 0}
                      </div>
                    </div>
                    <label className="md:col-span-2 text-xs text-neutral-500">
                      Socket 路径
                      <input
                        value={externalConfig?.socket_path ?? ''}
                        onChange={(e) =>
                          setExternalConfig((config) =>
                            config ? { ...config, socket_path: e.target.value } : config
                          )
                        }
                        className={`${INPUT} mt-1 font-mono text-[11px]`}
                        disabled={!externalConfig}
                      />
                    </label>
                  </div>
                  {externalMessage && <p className="text-xs text-neutral-500">{externalMessage}</p>}
                  {externalStatus?.last_error && (
                    <p className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">
                      {externalStatus.last_error}
                    </p>
                  )}
                </section>

                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">安全与权限</h3>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(externalConfig?.require_allowed_user)}
                      onChange={(e) =>
                        setExternalConfig((config) =>
                          config ? { ...config, require_allowed_user: e.target.checked } : config
                        )
                      }
                      className={FOCUS}
                    />
                    仅允许绑定用户访问
                  </label>
                  <label className="block text-xs text-neutral-500">
                    Allowed users（每行 platform:userId，例如 telegram:123）
                    <textarea
                      value={externalAllowedUsers}
                      onChange={(e) => setExternalAllowedUsers(e.target.value)}
                      rows={3}
                      className={`${INPUT} mt-1 font-mono text-xs`}
                    />
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {externalStatus?.capabilities.map((item) => (
                      <label
                        key={item.capability}
                        className="flex items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(externalConfig?.capability_permissions[item.capability])}
                          onChange={() => void onToggleExternalCapability(item.capability)}
                          className={FOCUS}
                        />
                        {item.capability}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(externalConfig?.delegate.enabled)}
                      onChange={(e) =>
                        setExternalConfig((config) =>
                          config
                            ? {
                                ...config,
                                delegate: { ...config.delegate, enabled: e.target.checked }
                              }
                            : config
                        )
                      }
                      className={FOCUS}
                    />
                    允许 delegate 到 cc-connect agent
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="text-xs text-neutral-500">
                      Delegate target agent
                      <input
                        value={externalConfig?.delegate.target_agent ?? 'claudecode'}
                        onChange={(e) =>
                          setExternalConfig((config) =>
                            config
                              ? {
                                  ...config,
                                  delegate: { ...config.delegate, target_agent: e.target.value }
                                }
                              : config
                          )
                        }
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-neutral-500">
                      每用户每分钟请求数
                      <input
                        type="number"
                        min={1}
                        value={externalConfig?.rate_limit.requests_per_minute ?? 10}
                        onChange={(e) =>
                          setExternalConfig((config) =>
                            config
                              ? {
                                  ...config,
                                  rate_limit: {
                                    requests_per_minute: Math.max(1, Number(e.target.value) || 1)
                                  }
                                }
                              : config
                          )
                        }
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={!externalConfig}
                    onClick={() => void onSaveExternalGateway()}
                  >
                    保存 External Gateway 配置
                  </button>
                </section>

                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">会话绑定</h3>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {externalSessions.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无外部 session。</p>
                    ) : (
                      externalSessions.map((session) => (
                        <div
                          key={session.sessionId}
                          className="rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-950"
                        >
                          <div className="font-medium">
                            {session.platform}:{session.userName ?? session.userId}
                          </div>
                          <div className="font-mono text-[11px] text-neutral-500">
                            {session.sessionId} → {session.conversationId}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {session.archived ? '已归档' : '活跃'} ·{' '}
                            {new Date(session.lastActivityAt).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">请求日志</h3>
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {externalRequestLog.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无请求日志。</p>
                    ) : (
                      externalRequestLog.map((entry) => (
                        <div
                          key={entry.requestId}
                          className="rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-950"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.routedTo}</span>
                            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-800">
                              {entry.outcome}
                            </span>
                            <span className="ml-auto text-[11px] text-neutral-500">
                              {entry.durationMs}ms
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-neutral-500">
                            {entry.platform}:{entry.userId} · {entry.requestId}
                          </div>
                          {entry.errorCode && (
                            <div className="text-[11px] text-red-500">{entry.errorCode}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
            {tab === 'budget' && (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">
                  留空表示
                  <span className="font-semibold">不限制</span>。
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
                      placeholder="不限制"
                      className={INPUT}
                    />
                    <span className="w-10 text-xs text-neutral-500">{f.unit}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <label className="w-32 text-xs text-neutral-600 dark:text-neutral-300">
                    提醒阈值 %
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
                    <span className="font-semibold">硬性停止</span> —
                    超过上限时阻止运行；关闭则只发出提醒。
                  </span>
                </label>
              </div>
            )}
            {tab === 'vectors' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">提供商</label>
                  <input readOnly value="hash-trick（本地）" className={INPUT} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    唤醒注入阈值（{vectorThreshold.toFixed(2)}）
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
                    重建本机的语义索引；嵌入向量保留在本机，不上传。
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void onReindex()} disabled={reindexing} className={BTN}>
                      {reindexing ? '重建中…' : '重建向量索引'}
                    </button>
                    {lastReindex && lastReindex.count >= 0 && (
                      <span className="text-xs text-neutral-500">
                        已索引 {lastReindex.count} 个文件。
                      </span>
                    )}
                    {lastReindex && lastReindex.count < 0 && (
                      <span className="text-xs text-red-500">重建失败。</span>
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
                    在 Finder 中打开 userData
                  </button>
                  <button
                    type="button"
                    onClick={() => void window.orbit.workspace.revealVaultOrbit()}
                    disabled={!vault}
                    className={BTN}
                  >
                    在 Finder 中打开工作库 .orbit
                  </button>
                </div>
                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => void onResetAll()}
                    disabled={resetting}
                    className={`${BTN} text-red-600 dark:text-red-400`}
                  >
                    {resetting ? '重置中…' : '重置所有未合并的 worktree'}
                  </button>
                  {resetMsg && <p className="mt-1 text-xs text-neutral-500">{resetMsg}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
          <button onClick={close} className={BTN}>
            取消
          </button>
          <button onClick={() => void onSave()} disabled={saving} className={BTN_PRIMARY}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextListEditor(props: {
  label: string;
  value: string[];
  onChange(value: string[]): void;
}): JSX.Element {
  return (
    <label className="text-xs text-neutral-500">
      {props.label}
      <textarea
        value={props.value.join('\n')}
        onChange={(event) => props.onChange(splitTextList(event.target.value))}
        rows={3}
        className={`${INPUT} mt-1 resize-y`}
      />
    </label>
  );
}

function splitTextList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/u)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}
