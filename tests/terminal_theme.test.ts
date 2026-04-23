import { describe, expect, it } from 'vitest';
import {
  getTerminalTheme,
  TERMINAL_TYPOGRAPHY
} from '../src/renderer/src/components/Terminal/terminalTheme';

describe('terminal theme', () => {
  it('keeps light theme ANSI whites readable against the background', () => {
    const theme = getTerminalTheme(false);

    expect(theme.background).toBe('#fbfdff');
    expect(theme.foreground).toBe('#1f2937');
    expect(theme.white).not.toBe(theme.background);
    expect(theme.brightWhite).not.toBe(theme.background);
    expect(theme.white).toBe('#64748b');
    expect(theme.brightWhite).toBe('#334155');
  });

  it('uses denser typography defaults for terminal readability', () => {
    expect(TERMINAL_TYPOGRAPHY.fontSize).toBe(13);
    expect(TERMINAL_TYPOGRAPHY.lineHeight).toBe(1.25);
    expect(TERMINAL_TYPOGRAPHY.fontWeightBold).toBeGreaterThan(
      TERMINAL_TYPOGRAPHY.fontWeight
    );
  });
});
