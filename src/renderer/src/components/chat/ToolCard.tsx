import type { RuntimeEvent } from '@shared/chat-protocol';

interface ToolCardProps {
  toolUse: RuntimeEvent<'runtime.tool_use'>;
  toolResult?: RuntimeEvent<'runtime.tool_result'>;
  onApprove?(spanId: string): void;
  onReject?(spanId: string): void;
}

export function ToolCard({ toolUse, toolResult, onApprove, onReject }: ToolCardProps): JSX.Element {
  const { toolName } = toolUse.payload;
  const inputJson = safeStringify(toolUse.payload.toolInput);
  const showApprovalControls = !toolResult && (onApprove || onReject);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{toolName}</span>
        {toolResult ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
            done
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
            running
          </span>
        )}
      </div>
      {inputJson ? (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px] opacity-80">
          {inputJson}
        </pre>
      ) : null}
      {toolResult ? (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-[11px] opacity-80">result</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px]">
            {toolResult.payload.result}
          </pre>
        </details>
      ) : null}
      {showApprovalControls ? (
        <div className="mt-2 flex gap-2">
          {onApprove ? (
            <button
              type="button"
              onClick={() => onApprove(toolUse.spanId)}
              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              Approve
            </button>
          ) : null}
          {onReject ? (
            <button
              type="button"
              onClick={() => onReject(toolUse.spanId)}
              className="rounded-md border border-rose-400 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Reject
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
