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

  const stripTerminalCodes = (value: string): string => {
    let out = "";
    for (let index = 0; index < value.length; index += 1) {
      const ch = value[index];
      if (ch !== "\u001b") {
        if (ch !== "\r") out += ch;
        continue;
      }

      const next = value[index + 1];
      if (next === "]") {
        index += 2;
        while (index < value.length) {
          if (value[index] === "\u0007") break;
          if (value[index] === "\u001b" && value[index + 1] === "\\") {
            index += 1;
            break;
          }
          index += 1;
        }
        continue;
      }

      if (next === "[") {
        index += 2;
        while (index < value.length) {
          const code = value.charCodeAt(index);
          if (code >= 0x40 && code <= 0x7e) break;
          index += 1;
        }
        continue;
      }
    }
    return out;
  };

  const looksLikePlainPrompt = (value: string): boolean => {
    const tail = stripTerminalCodes(value)
      .split("\n")
      .at(-1)
      ?.trimEnd() ?? "";
    if (!tail) return false;
    return /(?:\$|#|%|>|❯|›)$/.test(tail);
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
      if (looksLikePlainPrompt(buffer)) {
        finish(true);
        buffer = "";
        return;
      }
      if (buffer.length > OSC133_A.length * 4) {
        buffer = buffer.slice(-128);
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
