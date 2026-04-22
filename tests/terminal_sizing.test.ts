import { describe, expect, it, vi } from 'vitest';
import { syncTerminalSize } from '../src/renderer/src/components/Terminal/terminalSizing';

describe('syncTerminalSize', () => {
  it('fits and immediately resizes the backing PTY with the fitted grid', async () => {
    const fit = {
      fit: vi.fn(() => {
        term.cols = 91;
        term.rows = 28;
      })
    };
    const term = { cols: 80, rows: 24 };
    const resize = vi.fn();

    const result = syncTerminalSize({
      fit,
      term,
      sessionId: 'sess-1',
      resize,
      host: { clientWidth: 900, clientHeight: 400 }
    });

    expect(fit.fit).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith('sess-1', 91, 28);
    expect(result).toEqual({ cols: 91, rows: 28 });
  });

  it('skips fitting and resizing when the host is not laid out yet', () => {
    const fit = { fit: vi.fn() };
    const term = { cols: 80, rows: 24 };
    const resize = vi.fn();

    const result = syncTerminalSize({
      fit,
      term,
      sessionId: 'sess-1',
      resize,
      host: { clientWidth: 0, clientHeight: 400 }
    });

    expect(fit.fit).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('does not send a redundant PTY resize when the fitted grid is unchanged', () => {
    const fit = {
      fit: vi.fn(() => {
        term.cols = 80;
        term.rows = 24;
      })
    };
    const term = { cols: 80, rows: 24 };
    const resize = vi.fn();

    const result = syncTerminalSize({
      fit,
      term,
      sessionId: 'sess-1',
      resize,
      host: { clientWidth: 800, clientHeight: 300 },
      previousGrid: { cols: 80, rows: 24 }
    });

    expect(fit.fit).toHaveBeenCalledTimes(1);
    expect(resize).not.toHaveBeenCalled();
    expect(result).toEqual({ cols: 80, rows: 24 });
  });
});
