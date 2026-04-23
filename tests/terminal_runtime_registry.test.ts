import { describe, expect, it, vi } from 'vitest';
import type {
  TerminalRuntime,
  TerminalRuntimeRegistryDeps
} from '../src/renderer/src/components/Terminal/terminalRuntimeRegistry';
import { createTerminalRuntimeRegistry } from '../src/renderer/src/components/Terminal/terminalRuntimeRegistry';

function createFakeRuntime() {
  const inputListeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const attachedHosts: string[] = [];
  let detached = 0;
  let disposed = 0;
  let focused = 0;
  let cleared = 0;

  const runtime: TerminalRuntime = {
    attach(host) {
      attachedHosts.push(host.id);
    },
    detach() {
      detached += 1;
    },
    dispose() {
      disposed += 1;
    },
    write(data) {
      writes.push(data);
    },
    focus() {
      focused += 1;
    },
    refit() {
      return;
    },
    clear() {
      cleared += 1;
    },
    selectAll() {
      return;
    },
    getSelection() {
      return writes.join('');
    },
    clearSelection() {
      return;
    },
    setTheme() {
      return;
    },
    onInput(cb) {
      inputListeners.add(cb);
      return () => inputListeners.delete(cb);
    }
  };

  return {
    runtime,
    writes,
    attachedHosts,
    emitInput(data: string) {
      for (const listener of inputListeners) listener(data);
    },
    counts() {
      return { detached, disposed, focused, cleared };
    }
  };
}

describe('terminal runtime registry', () => {
  it('keeps the runtime and session alive while detached, and reattaches without reopening', async () => {
    const fakeRuntime = createFakeRuntime();
    const dataListeners = new Set<(event: { id: string; data: string }) => void>();
    const exitListeners = new Set<
      (event: { id: string; exitCode: number; signal?: number }) => void
    >();
    const ensureSession = vi.fn(async () => ({
      id: 'sess-1',
      pid: 111,
      cwd: '/vault/project',
      shell: '/bin/zsh',
      createdAt: '2026-04-23T00:00:00.000Z'
    }));
    const write = vi.fn();
    const killSession = vi.fn();

    const deps: TerminalRuntimeRegistryDeps = {
      createRuntime: () => fakeRuntime.runtime,
      ensureSession,
      clearSession: vi.fn(),
      write,
      killSession,
      onData(cb) {
        dataListeners.add(cb);
        return () => dataListeners.delete(cb);
      },
      onExit(cb) {
        exitListeners.add(cb);
        return () => exitListeners.delete(cb);
      }
    };

    const registry = createTerminalRuntimeRegistry(deps);
    const hostA = { id: 'host-a' };
    const hostB = { id: 'host-b' };

    await registry.attach({
      sessionKey: 'project-a::leaf-1',
      host: hostA,
      cwd: '/vault/project'
    });
    registry.detach('project-a::leaf-1');

    for (const listener of dataListeners) {
      listener({ id: 'sess-1', data: 'still-running' });
    }

    await registry.attach({
      sessionKey: 'project-a::leaf-1',
      host: hostB,
      cwd: '/vault/project'
    });

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(fakeRuntime.attachedHosts).toEqual(['host-a', 'host-b']);
    expect(fakeRuntime.writes).toContain('still-running');
    expect(fakeRuntime.counts().detached).toBe(1);
    expect(fakeRuntime.counts().disposed).toBe(0);
    expect(killSession).not.toHaveBeenCalled();
    expect(exitListeners.size).toBe(1);
  });

  it('disposes the runtime and kills the session only when explicitly disposed', async () => {
    const fakeRuntime = createFakeRuntime();
    const ensureSession = vi.fn(async () => ({
      id: 'sess-2',
      pid: 222,
      cwd: '/vault/project',
      shell: '/bin/zsh',
      createdAt: '2026-04-23T00:00:00.000Z'
    }));
    const killSession = vi.fn(async () => undefined);

    const registry = createTerminalRuntimeRegistry({
      createRuntime: () => fakeRuntime.runtime,
      ensureSession,
      clearSession: vi.fn(),
      write: vi.fn(),
      killSession,
      onData: () => () => undefined,
      onExit: () => () => undefined
    });

    await registry.attach({
      sessionKey: 'project-a::leaf-2',
      host: { id: 'host-a' },
      cwd: '/vault/project'
    });

    await registry.dispose('project-a::leaf-2');

    expect(killSession).toHaveBeenCalledWith('sess-2');
    expect(fakeRuntime.counts().disposed).toBe(1);
    expect(registry.getSnapshot('project-a::leaf-2')).toEqual({
      session: null,
      exitState: null
    });
  });
});
