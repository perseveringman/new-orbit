import { describe, expect, it } from "vitest";
import { runPhases, type PhaseName, type PhaseStep } from "../src/main/util/phase";

describe("runPhases", () => {
  it("runs all phases in order and commits on success", async () => {
    const order: PhaseName[] = [];
    const steps: PhaseStep<{}>[] = [
      { name: "preflight", run: () => void order.push("preflight") },
      { name: "teardown", run: () => void order.push("teardown") },
      { name: "commit", run: () => void order.push("commit") },
      { name: "cleanup", run: () => void order.push("cleanup") }
    ];
    const events: string[] = [];
    const result = await runPhases({}, steps, (name, status) => {
      events.push(`${name}:${status}`);
    });
    expect(result.committed).toBe(true);
    expect(result.failedPhase).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(order).toEqual(["preflight", "teardown", "commit", "cleanup"]);
    expect(events).toContain("preflight:start");
    expect(events).toContain("commit:ok");
  });

  it("aborts when a pre-commit phase fails", async () => {
    const steps: PhaseStep<{}>[] = [
      {
        name: "preflight",
        run: () => {
          throw new Error("nope");
        }
      },
      { name: "teardown", run: () => {} },
      { name: "commit", run: () => {} }
    ];
    const result = await runPhases({}, steps);
    expect(result.committed).toBe(false);
    expect(result.failedPhase).toBe("preflight");
    expect(result.error?.message).toBe("nope");
    expect(result.warnings).toEqual([]);
  });

  it("aborts when the commit phase fails", async () => {
    let cleanupRan = false;
    const steps: PhaseStep<{}>[] = [
      { name: "preflight", run: () => {} },
      {
        name: "commit",
        run: () => {
          throw new Error("bad-commit");
        }
      },
      {
        name: "cleanup",
        run: () => {
          cleanupRan = true;
        }
      }
    ];
    const result = await runPhases({}, steps);
    expect(result.committed).toBe(false);
    expect(result.failedPhase).toBe("commit");
    expect(result.error?.message).toBe("bad-commit");
    expect(cleanupRan).toBe(false);
  });

  it("captures post-commit errors as warnings", async () => {
    const steps: PhaseStep<{}>[] = [
      { name: "commit", run: () => {} },
      {
        name: "cleanup",
        run: () => {
          throw new Error("cleanup-boom");
        }
      }
    ];
    const result = await runPhases({}, steps);
    expect(result.committed).toBe(true);
    expect(result.failedPhase).toBeUndefined();
    expect(result.warnings).toEqual(["cleanup: cleanup-boom"]);
  });

  it("throws if there is not exactly one commit step", async () => {
    await expect(runPhases({}, [])).rejects.toThrow(/commit/);
    await expect(
      runPhases({}, [
        { name: "commit", run: () => {} },
        { name: "commit", run: () => {} }
      ])
    ).rejects.toThrow(/commit/);
  });
});
