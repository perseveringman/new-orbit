import type { RuntimeEvent } from '@shared/chat-protocol';

interface ToolCardProps {
  toolUse: RuntimeEvent<'runtime.tool_use'>;
  toolResult?: RuntimeEvent<'runtime.tool_result'>;
}

export function ToolCard({ toolUse, toolResult }: ToolCardProps): JSX.Element {
  const { toolName } = toolUse.payload;
  const inputJson = safeStringify(toolUse.payload.toolInput);
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
