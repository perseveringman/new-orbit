import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DiagnosticsInfo } from '@shared/types';

interface Props {
  open: boolean;
  onClose(): void;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const BTN =
  `rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${FOCUS}`;

export function AboutModal({ open, onClose }: Props): JSX.Element | null {
  const [info, setInfo] = useState<DiagnosticsInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    void window.orbit.workspace.diagnostics().then(setInfo);
  }, [open]);

  if (!open) return null;

  async function onCopy(): Promise<void> {
    if (!info) return;
    const body = [
      `Orbit ${info.version}`,
      `os: ${info.os} (${info.arch})`,
      `electron: ${info.electron}`,
      `node: ${info.node}`,
      `vault: ${info.vaultPath ?? '（无）'}`,
      `claude: ${info.claudePath ?? '（未找到）'} (${info.claudeVersion ?? '?'})`,
      `userData: ${info.userDataPath}`,
      `crashLog: ${info.crashLogPath}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">关于 Orbit</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className={`rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${FOCUS}`}
          >
            ✕
          </button>
        </div>
        {info ? (
          <dl className="space-y-1 text-xs">
            <Row k="版本" v={info.version} />
            <Row k="OS" v={`${info.os} (${info.arch})`} />
            <Row k="Electron" v={info.electron} />
            <Row k="Node" v={info.node} />
            <Row k="Vault" v={info.vaultPath ?? '（无）'} mono />
            <Row k="Claude" v={info.claudePath ?? '（未找到）'} mono />
            <Row k="userData" v={info.userDataPath} mono />
            <Row k="崩溃日志" v={info.crashLogPath} mono />
          </dl>
        ) : (
          <p className="text-xs text-neutral-500">正在加载诊断信息…</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          {copied && <span className="text-xs text-emerald-600">已复制！</span>}
          <button onClick={() => void onCopy()} className={BTN}>
            复制诊断信息
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }): JSX.Element {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
      <dd className={`min-w-0 flex-1 truncate ${mono ? 'font-mono' : ''}`} title={v}>
        {v}
      </dd>
    </div>
  );
}
