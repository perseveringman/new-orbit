import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/shared/limits";

describe("LIMITS", () => {
  it("exposes expected concurrency caps", () => {
    expect(LIMITS.MAX_CONCURRENT_PTYS).toBe(12);
    expect(LIMITS.MAX_CONCURRENT_AGENT_RUNS).toBe(4);
    expect(LIMITS.MAX_CONCURRENT_INSTALLS).toBe(1);
  });

  it("exposes positive finite timing/buffer values", () => {
    for (const [, v] of Object.entries(LIMITS)) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("has expected ring/timeout values", () => {
    expect(LIMITS.PTY_OUTPUT_FLUSH_INTERVAL_MS).toBe(16);
    expect(LIMITS.PTY_RING_BUFFER_BYTES).toBe(64 * 1024);
    expect(LIMITS.AGENT_EVENT_RING_CAPACITY).toBe(2048);
    expect(LIMITS.KILL_TIMEOUT_MS).toBe(5000);
    expect(LIMITS.HOOK_DEDUP_TTL_MS).toBe(30_000);
    expect(LIMITS.SHELL_READY_TIMEOUT_MS).toBe(15_000);
  });
});
