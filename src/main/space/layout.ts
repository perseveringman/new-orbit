import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SPACE_ORBIT_DIR, SPACE_OUTPUTS_DIR, SPACE_TASKS_DIR } from '@shared/constants';
import { ensureAssetsLayout } from '../assets/manifest';

export async function ensureSpaceLayout(spaceRoot: string): Promise<void> {
  await fs.mkdir(path.join(spaceRoot, SPACE_TASKS_DIR), { recursive: true });
  await fs.mkdir(path.join(spaceRoot, SPACE_OUTPUTS_DIR), { recursive: true });
  await fs.mkdir(path.join(spaceRoot, SPACE_ORBIT_DIR), { recursive: true });
  const outputsManifest = path.join(spaceRoot, SPACE_OUTPUTS_DIR, '_manifest.md');
  try {
    await fs.access(outputsManifest);
  } catch {
    await fs.writeFile(
      outputsManifest,
      '---\noutputs: []\n---\n# Outputs\n\nTrack durable outputs produced by this space here.\n',
      'utf8'
    );
  }
  await ensureAssetsLayout(spaceRoot);
}

