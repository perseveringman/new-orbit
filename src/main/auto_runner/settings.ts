import type { AutoRunnerSettings } from '@shared/schemas';

export async function readAutoRunnerSettings(): Promise<AutoRunnerSettings> {
  const { getAutoRunnerSettings } = await import('../settings');
  return getAutoRunnerSettings();
}

export async function setAutoRunnerEnabled(enabled: boolean): Promise<AutoRunnerSettings> {
  const { updateAutoRunnerSettings } = await import('../settings');
  return updateAutoRunnerSettings({ enabled });
}

export async function updateAutoRunnerConfig(
  partial: Partial<AutoRunnerSettings>
): Promise<AutoRunnerSettings> {
  const { updateAutoRunnerSettings } = await import('../settings');
  return updateAutoRunnerSettings(partial);
}
