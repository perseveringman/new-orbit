import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_ORBIT_MOBILE_BUNDLE_ID = 'com.zhouyanbo.orbit.capture';

export function iCloudContainerName(bundleId = DEFAULT_ORBIT_MOBILE_BUNDLE_ID): string {
  return `iCloud~${bundleId.replace(/\./g, '~')}`;
}

export function getICloudDocumentsPath(bundleId = DEFAULT_ORBIT_MOBILE_BUNDLE_ID): string {
  return path.join(os.homedir(), 'Library', 'Mobile Documents', iCloudContainerName(bundleId), 'Documents');
}

export async function getICloudInboxPath(bundleId = DEFAULT_ORBIT_MOBILE_BUNDLE_ID): Promise<string | null> {
  const documentsPath = getICloudDocumentsPath(bundleId);
  try {
    await fs.access(path.dirname(documentsPath));
  } catch {
    return null;
  }
  return path.join(documentsPath, 'inbox');
}
