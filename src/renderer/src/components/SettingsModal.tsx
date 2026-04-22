import { useEffect, useState } from 'react';
import { useAgent } from '../store/agent';
import { useWorkspace } from '../store/workspace';
import type { BudgetSettings } from '@shared/schemas';
import type { Theme } from '@shared/types';
import type { DetectResult } from '@shared/agent';

type Numeric = 'perRunTokens' | 'perRunUSD' | 'dailyTokens' | 'dailyUSD';
type TabId = 'general' | 'api' | 'budget' | 'vectors' | 'advanced';

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
  }, [open, budget, workspaceSettings]);

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

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'api', label: 'API / CLI' },
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
                    Overrides the shell <code>ANTHROPIC_API_KEY</code> for agent runs.
                  </p>
                </div>
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
