export type PhaseName = "preflight" | "teardown" | "commit" | "cleanup";

export interface PhaseStep<T> {
  name: PhaseName;
  run: (ctx: T) => Promise<void> | void;
}

export interface PhaseResult {
  committed: boolean;
  failedPhase?: PhaseName;
  error?: Error;
  warnings: string[];
}

export async function runPhases<T>(
  ctx: T,
  steps: PhaseStep<T>[],
  onPhase?: (name: PhaseName, status: "start" | "ok" | "fail") => void
): Promise<PhaseResult> {
  const commitCount = steps.filter((s) => s.name === "commit").length;
  if (commitCount !== 1) {
    throw new Error(
      `runPhases: exactly one 'commit' step required, got ${commitCount}`
    );
  }

  const warnings: string[] = [];
  const commitIndex = steps.findIndex((s) => s.name === "commit");
  let committed = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onPhase?.(step.name, "start");
    try {
      await step.run(ctx);
      onPhase?.(step.name, "ok");
      if (i === commitIndex) {
        committed = true;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onPhase?.(step.name, "fail");
      if (i < commitIndex) {
        return { committed: false, failedPhase: step.name, error, warnings };
      }
      if (i === commitIndex) {
        return { committed: false, failedPhase: "commit", error, warnings };
      }
      warnings.push(`${step.name}: ${error.message}`);
    }
  }

  return { committed, warnings };
}
