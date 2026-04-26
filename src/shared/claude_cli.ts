export const CLAUDE_BYPASS_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const DEFAULT_CLAUDE_LAUNCHER_COMMAND = `claude ${CLAUDE_BYPASS_PERMISSIONS_FLAG}`;

function firstToken(command: string): string {
  return command.trim().split(/\s+/, 1)[0] ?? '';
}

function isClaudeBinaryToken(token: string): boolean {
  return /(^|[\\/])claude(?:\.exe)?$/.test(token);
}

function hasBypassPermissions(command: string): boolean {
  return (
    command.includes(CLAUDE_BYPASS_PERMISSIONS_FLAG) ||
    command.includes('--permission-mode bypassPermissions') ||
    command.includes('--permission-mode=bypassPermissions')
  );
}

export function ensureClaudeBypassPermissionsCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return DEFAULT_CLAUDE_LAUNCHER_COMMAND;
  if (hasBypassPermissions(trimmed)) return trimmed;
  if (!isClaudeBinaryToken(firstToken(trimmed))) return trimmed;
  return `${trimmed} ${CLAUDE_BYPASS_PERMISSIONS_FLAG}`;
}

export function buildClaudeResumeCommand(sessionId: string, command: string = 'claude'): string {
  return `${ensureClaudeBypassPermissionsCommand(command)} --resume ${sessionId}`;
}

export function appendClaudeBypassPermissionsArgs(args: string[]): string[] {
  if (
    args.includes(CLAUDE_BYPASS_PERMISSIONS_FLAG) ||
    args.some(
      (arg, index) =>
        arg === '--permission-mode=bypassPermissions' ||
        (arg === '--permission-mode' && args[index + 1] === 'bypassPermissions')
    )
  ) {
    return args;
  }
  return [...args, CLAUDE_BYPASS_PERMISSIONS_FLAG];
}
