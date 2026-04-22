import { describe, it, expect, vi } from 'vitest';

// We test the error-boundary class methods directly without rendering. The
// JSX path is exercised by the e2e smoke and by typecheck; unit-testing the
// behavioral contract keeps the vitest suite node-only.

describe('ErrorBoundary class', () => {
  it('getDerivedStateFromError flips hasError and retains the error', async () => {
    // Stub React classes / HTMLElement references used during module import.
    (globalThis as unknown as { window?: Record<string, unknown> }).window = (
      globalThis as unknown as { window?: Record<string, unknown> }
    ).window ?? ({} as Record<string, unknown>);
    const mod = await import('../src/renderer/src/components/ErrorBoundary');
    const err = new Error('boom');
    const next = mod.ErrorBoundary.getDerivedStateFromError(err);
    expect(next.hasError).toBe(true);
    expect(next.error).toBe(err);
    expect(next.info).toBeNull();
  });

  it('componentDidCatch forwards to window.orbit.workspace.reportCrash', async () => {
    const reportCrash = vi.fn().mockResolvedValue('/tmp/fake.log');
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      orbit: { workspace: { reportCrash } }
    } as Record<string, unknown>;
    const mod = await import('../src/renderer/src/components/ErrorBoundary');
    const instance = Object.create(
      mod.ErrorBoundary.prototype as object
    ) as InstanceType<typeof mod.ErrorBoundary>;
    // Shim setState — we only assert the side effect.
    (instance as unknown as { setState: (s: unknown) => void }).setState = () => {};
    const err = new Error('render-failed');
    instance.componentDidCatch(err, { componentStack: 'A > B > C' });
    expect(reportCrash).toHaveBeenCalledWith({
      origin: 'renderer',
      message: 'render-failed',
      stack: err.stack,
      extra: { componentStack: 'A > B > C' }
    });
  });
});
