export interface OrbitTerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface OrbitTerminalTypography {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  fontWeightBold: number;
}

const DARK_TERMINAL_THEME: OrbitTerminalTheme = {
  background: '#0b1120',
  foreground: '#d6deeb',
  cursor: '#7dd3fc',
  selectionBackground: '#264f78',
  black: '#111827',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#cbd5e1',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#e9d5ff',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc'
};

const LIGHT_TERMINAL_THEME: OrbitTerminalTheme = {
  background: '#fbfdff',
  foreground: '#1f2937',
  cursor: '#0369a1',
  selectionBackground: '#bfdbfe',
  black: '#1f2937',
  red: '#b42318',
  green: '#166534',
  yellow: '#a16207',
  blue: '#1d4ed8',
  magenta: '#7e22ce',
  cyan: '#0f766e',
  white: '#64748b',
  brightBlack: '#94a3b8',
  brightRed: '#dc2626',
  brightGreen: '#15803d',
  brightYellow: '#ca8a04',
  brightBlue: '#2563eb',
  brightMagenta: '#9333ea',
  brightCyan: '#0d9488',
  brightWhite: '#334155'
};

export const TERMINAL_TYPOGRAPHY: OrbitTerminalTypography = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 1.25,
  fontWeight: 400,
  fontWeightBold: 600
};

export function getTerminalTheme(dark?: boolean): OrbitTerminalTheme {
  return dark ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME;
}
