import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_AGENT_MD,
  PROJECT_BRIDGE_MANIFEST,
  PROJECT_ORBIT_BRIDGE_DIR,
  PROJECT_ORBIT_DIR
} from '@shared/constants';
import type { AgentExposureSettings } from './project_config';

export interface BridgeManifestEntry {
  sourcePath: string;
  targetPath: string;
  status: 'published' | 'conflict' | 'disabled';
  conflictReason?: 'target_exists';
}

export interface BridgeManifest {
  updatedAt: string;
  mode: AgentExposureSettings['mode'];
  bridges: Record<string, BridgeManifestEntry>;
}

async function writeFileIfChanged(file: string, content: string): Promise<void> {
  try {
    const current = await fs.readFile(file, 'utf8');
    if (current === content) return;
  } catch {
    // write below
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

async function publishBridge(
  projectDir: string,
  name: 'AGENT.md' | 'AGENTS.md',
  content: string,
  enabled: boolean
): Promise<BridgeManifestEntry> {
  const sourceName = name;
  const sourcePath = path.join(projectDir, PROJECT_ORBIT_DIR, PROJECT_ORBIT_BRIDGE_DIR, sourceName);
  await writeFileIfChanged(sourcePath, content);
  const targetPath = path.join(projectDir, name);
  if (!enabled) {
    return {
      sourcePath: path.posix.join('.orbit', 'bridge', sourceName),
      targetPath: name,
      status: 'disabled'
    };
  }
  try {
    const existing = await fs.readFile(targetPath, 'utf8');
    if (existing !== content) {
      return {
        sourcePath: path.posix.join('.orbit', 'bridge', sourceName),
        targetPath: name,
        status: 'conflict',
        conflictReason: 'target_exists'
      };
    }
  } catch {
    await writeFileIfChanged(targetPath, content);
  }
  return {
    sourcePath: path.posix.join('.orbit', 'bridge', sourceName),
    targetPath: name,
    status: 'published'
  };
}

export async function syncProjectBridges(
  projectDir: string,
  exposure: AgentExposureSettings,
  files: Partial<Record<typeof PROJECT_AGENT_MD | 'AGENTS.md', string>>
): Promise<BridgeManifest> {
  const bridges: Record<string, BridgeManifestEntry> = {};
  if (files[PROJECT_AGENT_MD]) {
    bridges[PROJECT_AGENT_MD] = await publishBridge(
      projectDir,
      PROJECT_AGENT_MD,
      files[PROJECT_AGENT_MD]!,
      exposure.exposeAgentMdBridge
    );
  }
  if (files['AGENTS.md']) {
    bridges['AGENTS.md'] = await publishBridge(
      projectDir,
      'AGENTS.md',
      files['AGENTS.md']!,
      exposure.exposeAgentsMdBridge
    );
  }
  const manifest: BridgeManifest = {
    updatedAt: new Date().toISOString(),
    mode: exposure.mode,
    bridges
  };
  const manifestPath = path.join(
    projectDir,
    PROJECT_ORBIT_DIR,
    PROJECT_ORBIT_BRIDGE_DIR,
    PROJECT_BRIDGE_MANIFEST
  );
  await writeFileIfChanged(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
