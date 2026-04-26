import type { TaskRecord } from '@shared/schemas';
import type { AutoRunnerSettings } from '@shared/schemas';

export function resolveTaskBudgetLimit(
  task: Pick<TaskRecord, 'budget_limit'> | { budget_limit?: unknown },
  settings: Pick<AutoRunnerSettings, 'defaultBudgetPerTask'>
): number {
  return typeof task.budget_limit === 'number' && task.budget_limit > 0
    ? task.budget_limit
    : settings.defaultBudgetPerTask;
}

export function isTaskBudgetExceeded(costUsd: number, budgetLimit: number): boolean {
  return costUsd >= budgetLimit;
}

export function isTaskBudgetWarning(costUsd: number, budgetLimit: number): boolean {
  return costUsd >= budgetLimit * 0.8 && costUsd < budgetLimit;
}
