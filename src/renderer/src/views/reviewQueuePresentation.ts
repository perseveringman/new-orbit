import type { ProjectSummaryDTO } from '@shared/ipc';
import type { ReviewQueueItem } from '../store/reviewQueue';

export function getReviewQueueContextSummary(
  item: ReviewQueueItem,
  projects: ProjectSummaryDTO[]
): string | null {
  const parts: string[] = [];
  if (item.projectUid) {
    const projectName =
      projects.find((project) => project.uid === item.projectUid)?.name ?? item.projectUid;
    parts.push(projectName);
  }
  if (item.terminalTitle) {
    parts.push(item.terminalTitle);
  } else if (item.paneId) {
    parts.push(`面板 ${item.paneId}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
