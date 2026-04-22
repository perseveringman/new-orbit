import { describe, expect, it } from "vitest";
import {
  OSC133_A,
  createShellReadyScanner,
  osc133RcFragment
} from "../src/main/agent/shell/osc133";

describe("createShellReadyScanner", () => {
  it("resolves true when the OSC 133;A sequence is fed in", async () => {
    const scanner = createShellReadyScanner(1000);
    scanner.push("welcome\n");
    scanner.push(`prompt ${OSC133_A}\u0007$ `);
    await expect(scanner.ready).resolves.toBe(true);
  });

  it("resolves false when timeout elapses without the sequence", async () => {
    const scanner = createShellReadyScanner(10);
    scanner.push("no marker here");
    await expect(scanner.ready).resolves.toBe(false);
  });

  it("cancel() resolves with false", async () => {
    const scanner = createShellReadyScanner(10_000);
    scanner.cancel();
    await expect(scanner.ready).resolves.toBe(false);
  });
});

describe("osc133RcFragment", () => {
  it("contains the 133;A marker", () => {
    const rc = osc133RcFragment();
    expect(rc).toContain("133;A");
    expect(rc).toContain("precmd_functions");
    expect(rc).toContain("PROMPT_COMMAND");
  });
});
