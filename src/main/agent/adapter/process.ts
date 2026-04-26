import { spawn } from 'node:child_process';
import { createUnifiedAgentEvent, type UnifiedAgentEventContext } from '@shared/agent-event';
import type { RuntimeAdapter, RuntimeProcessHandle, RuntimeStartRequest } from './types';

export function startLineProcess(
  adapter: RuntimeAdapter,
  request: RuntimeStartRequest,
  args: string[],
  inputOnStdin: boolean
): RuntimeProcessHandle {
  const env: NodeJS.ProcessEnv = { ...process.env, ...request.env };
  const child = spawn(adapter.descriptor.binaryPath, args, {
    cwd: request.cwd,
    env,
    stdio: inputOnStdin ? 'pipe' : ['ignore', 'pipe', 'pipe']
  });
  if (inputOnStdin && child.stdin) {
    child.stdin.write(request.prompt);
    child.stdin.end();
  }

  async function* events(): AsyncIterableIterator<ReturnType<typeof adapter.normalizeVendorEvent>> {
    let idx = 0;
    const context: UnifiedAgentEventContext = {
      runId: request.runId,
      taskId: request.taskId,
      runtime: {
        provider: adapter.descriptor.provider,
        runtimeId: adapter.descriptor.runtimeId,
        name: adapter.descriptor.name
      },
      traceId: request.traceId
    };
    yield createUnifiedAgentEvent('heartbeat', context, {
      id: `${context.traceId ?? `trace-${request.runId}`}:adapter-started`,
      spanId: 'adapter-started',
      text: `${adapter.descriptor.provider} process started`
    });
    if (!child.stdout) return;
    for await (const chunk of child.stdout) {
      const lines = String(chunk)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        yield adapter.normalizeVendorEvent(line, context, idx++);
      }
    }
    yield createUnifiedAgentEvent('done', context, {
      id: `${context.traceId ?? `trace-${request.runId}`}:adapter-exit`,
      spanId: 'adapter-exit',
      text: 'process exited'
    });
  }

  return { process: child, events: events() };
}
