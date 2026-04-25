import type { BridgeClient } from '../../src/cli/bridge';

export interface CapturedCli {
  stdout: string[];
  stderr: string[];
  options: { stdout: (text: string) => void; stderr: (text: string) => void };
}

export class RecordingBridge implements BridgeClient {
  readonly calls: Array<{ method: string; params?: unknown }> = [];

  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    return this.responses[method] ?? { ok: true };
  }
}

export function capture(): CapturedCli {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    options: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}
