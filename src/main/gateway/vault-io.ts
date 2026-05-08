import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function saveGatewayFile(vaultPath: string, name: string, content: string | Buffer): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'gateway-file.txt';
  const relPath = path.join('inbox', 'gateway', safeName);
  const absPath = path.join(vaultPath, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content);
  return relPath;
}
