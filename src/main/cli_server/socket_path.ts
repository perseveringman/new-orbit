import path from 'node:path';

export function getCliSocketPath(vaultPath: string): string {
  return path.join(vaultPath, '.orbit', 'cli-socket');
}
