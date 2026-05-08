export const REVIEW_SYSTEM_TASKS = [
  { id: 'daily-review', name: 'Daily Review', schedule: 'Every day 21:00' },
  { id: 'weekly-review', name: 'Weekly Review', schedule: 'Every Sunday 20:00' },
  { id: 'monthly-review', name: 'Monthly Review', schedule: 'Last day of month 20:00' }
] as const;

export function reviewPeriod(kind: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'area' | 'resource' | 'project', now = new Date()): { from: string; to: string } {
  const end = new Date(now);
  const start = new Date(now);
  if (kind === 'daily') start.setUTCDate(end.getUTCDate());
  else if (kind === 'weekly' || kind === 'area' || kind === 'resource' || kind === 'project') start.setUTCDate(end.getUTCDate() - 6);
  else if (kind === 'monthly') start.setUTCMonth(end.getUTCMonth() - 1);
  else start.setUTCMonth(end.getUTCMonth() - 3);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}
