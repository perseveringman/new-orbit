import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_AGENT_DIR,
  PROJECT_LOGS_DIR,
  PROJECT_SESSION_HISTORY
} from '@shared/constants';
import { listProjects } from './project';

interface ProjectSessionHistoryItem {
  sessionId: string;
  paneId: string;
  projectUid: string;
  agentType: string;
  vendorSessionId?: string;
  status: 'active' | 'completed' | 'interrupted';
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  title?: string;
  summary?: string;
  stats: {
    promptCount: number;
    permissionCount: number;
  };
}

export function renderProjectSessionHistory(
  sessions: ProjectSessionHistoryItem[],
  projectName?: string
): string {
  const lines = ['# 项目会话历史', ''];
  if (projectName) {
    lines.push(`项目：**${projectName}**`, '');
  }
  if (sessions.length === 0) {
    lines.push('_尚无记录。_', '');
    return lines.join('\n');
  }

  lines.push('| Session | Vendor | Status | Last Active | Summary |', '|---|---|---|---|---|');
  for (const session of sessions) {
    lines.push(
      `| ${session.title ?? session.sessionId} | ${session.agentType} | ${session.status} | ${session.lastActivityAt} | ${session.summary ?? '-'} |`
    );
  }

  for (const session of sessions) {
    lines.push(
      '',
      `## ${session.title ?? `${session.agentType} session`}`,
      '',
      `- Orbit Session: \`${session.sessionId}\``,
      `- Vendor: \`${session.agentType}\``,
      ...(session.vendorSessionId ? [`- Vendor Session: \`${session.vendorSessionId}\``] : []),
      `- Status: \`${session.status}\``,
      `- Pane: \`${session.paneId}\``,
      `- Started: ${session.startedAt}`,
      `- Last Active: ${session.lastActivityAt}`,
      ...(session.endedAt ? [`- Ended: ${session.endedAt}`] : []),
      `- Prompts: ${session.stats.promptCount}`,
      `- Permissions: ${session.stats.permissionCount}`,
      ...(session.summary ? ['', session.summary] : [])
    );
  }

  lines.push('');
  return lines.join('\n');
}

export async function writeProjectSessionHistory(
  vaultPath: string,
  projectUid: string,
  sessions: ProjectSessionHistoryItem[]
): Promise<void> {
  const projects = await listProjects(vaultPath);
  const project = projects.find((item) => item.uid === projectUid);
  if (!project || project.legacy) return;
  const filePath = path.join(
    project.path,
    PROJECT_AGENT_DIR,
    PROJECT_LOGS_DIR,
    PROJECT_SESSION_HISTORY
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    renderProjectSessionHistory(sessions, project.name).trimEnd() + '\n',
    'utf8'
  );
}
