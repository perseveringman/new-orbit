export const OSC133_A = "\u001b]133;A";

export interface ShellReadyScanner {
  push(chunk: string): void;
  ready: Promise<boolean>;
  cancel(): void;
}

export function createShellReadyScanner(timeoutMs: number): ShellReadyScanner {
  let buffer = "";
  let resolved = false;
  let resolve!: (v: boolean) => void;
  const ready = new Promise<boolean>((r) => {
    resolve = r;
  });

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      resolve(false);
    }
  }, timeoutMs);

  const finish = (value: boolean) => {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    resolve(value);
  };

  return {
    push(chunk: string) {
      if (resolved) return;
      buffer += chunk;
      if (buffer.includes(OSC133_A)) {
        finish(true);
        buffer = "";
        return;
      }
      if (buffer.length > OSC133_A.length * 4) {
        buffer = buffer.slice(-OSC133_A.length * 2);
      }
    },
    ready,
    cancel() {
      finish(false);
    }
  };
}

export function osc133RcFragment(): string {
  return [
    "# Orbit shell-ready marker",
    "__orbit_mark_ready() { printf '\\033]133;A\\007'; }",
    'PROMPT_COMMAND="__orbit_mark_ready; ${PROMPT_COMMAND:-}"',
    'if [ -n "$ZSH_VERSION" ]; then precmd_functions+=(__orbit_mark_ready); fi',
    ""
  ].join("\n");
}
