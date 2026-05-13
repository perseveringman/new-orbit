import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import type {
  AgentToolRegistrySnapshot,
  AgentToolRegistrationView
} from '@shared/agent-tools';
import type { AuthorityRiskLevel, AuthorityToolFamily } from '@shared/authority';

const FAMILY_LABELS: Record<AuthorityToolFamily, string> = {
  orbit: 'Orbit',
  web: 'Web',
  shell: 'Shell',
  browser: 'Browser',
  subagent: 'Subagent',
  automation: 'Automation',
  media: 'Media',
  plugin: 'Plugin'
};

const RISK_STYLES: Record<AuthorityRiskLevel, string> = {
  L0_observe: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  L1_bounded_local: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  L2_reversible_draft: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  L3_layer1_direct_write: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200',
  L4_external_side_effect: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200',
  L5_dangerous_elevated: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200'
};

export function ToolRegistryView(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AgentToolRegistrySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await window.orbit.tools.snapshot());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const activeByFamily = useMemo(() => groupByFamily(snapshot?.active ?? []), [snapshot]);
  const plannedByFamily = useMemo(() => groupByFamily(snapshot?.planned ?? []), [snapshot]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              <Wrench size={14} />
              Ask Anywhere Tools
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">Tool Registry</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              当前 Ask Anywhere 暴露给模型的工具、Authority 风险分级，以及对照 OpenClaw 仍在补齐的能力。
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Active tools" value={snapshot?.totalActive ?? 0} />
          <Metric label="Planned parity tools" value={snapshot?.totalPlanned ?? 0} />
          <Metric label="OpenClaw gaps" value={snapshot?.openClawParity.missing.length ?? 0} />
        </section>

        {snapshot ? (
          <>
            <ParityStrip snapshot={snapshot} />
            <ToolSection title="Active Registered Tools" groups={activeByFamily} />
            <ToolSection title="Planned OpenClaw Parity" groups={plannedByFamily} planned />
          </>
        ) : (
          <div className="rounded-md border border-neutral-200 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            Loading registry…
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ParityStrip({ snapshot }: { snapshot: AgentToolRegistrySnapshot }): JSX.Element {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck size={16} />
        OpenClaw parity map
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <TokenGroup title="Implemented" tokens={snapshot.openClawParity.implemented} tone="green" />
        <TokenGroup title="Planned" tokens={snapshot.openClawParity.planned} tone="amber" />
        <TokenGroup title="Missing" tokens={snapshot.openClawParity.missing} tone="neutral" />
      </div>
    </section>
  );
}

function TokenGroup({
  title,
  tokens,
  tone
}: {
  title: string;
  tokens: string[];
  tone: 'green' | 'amber' | 'neutral';
}): JSX.Element {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400';
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(tokens.length ? tokens : ['none']).map((token) => (
          <span key={token} className={`rounded border px-2 py-1 text-xs ${toneClass}`}>
            {token}
          </span>
        ))}
      </div>
    </div>
  );
}

function ToolSection({
  title,
  groups,
  planned = false
}: {
  title: string;
  groups: Map<AuthorityToolFamily, AgentToolRegistrationView[]>;
  planned?: boolean;
}): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {[...groups.entries()].map(([family, tools]) => (
        <div
          key={family}
          className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="text-sm font-semibold">{FAMILY_LABELS[family]}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{tools.length} tools</div>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} planned={planned} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ToolRow({
  tool,
  planned
}: {
  tool: AgentToolRegistrationView;
  planned: boolean;
}): JSX.Element {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)_minmax(220px,0.8fr)]">
      <div>
        <div className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {tool.name}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className={`rounded border px-2 py-0.5 text-[11px] ${RISK_STYLES[tool.risk]}`}>
            {tool.risk.replace(/^L/, 'L').replaceAll('_', ' ')}
          </span>
          <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            {planned ? 'planned' : 'active'}
          </span>
        </div>
      </div>
      <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">{tool.description}</p>
      <div className="space-y-2 text-xs text-neutral-500 dark:text-neutral-400">
        {tool.cliMethod ? <Line label="CLI" value={tool.cliMethod} /> : null}
        {tool.openClawEquivalent ? <Line label="OpenClaw" value={tool.openClawEquivalent} /> : null}
        <Line label="Permissions" value={tool.permissions.join(', ') || 'none'} />
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}: </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function groupByFamily(
  tools: AgentToolRegistrationView[]
): Map<AuthorityToolFamily, AgentToolRegistrationView[]> {
  const grouped = new Map<AuthorityToolFamily, AgentToolRegistrationView[]>();
  for (const tool of tools) {
    const next = grouped.get(tool.family) ?? [];
    next.push(tool);
    grouped.set(tool.family, next);
  }
  return grouped;
}
