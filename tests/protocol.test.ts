import { describe, expect, it } from "vitest";
import {
  ORBIT_HOOK_PORT_ENV,
  ORBIT_HOOK_PROTOCOL_VERSION,
  ORBIT_HOOK_TOKEN_ENV,
  ORBIT_HOOK_VERSION_ENV,
  ORBIT_RUN_ID_ENV
} from "../src/shared/protocol";

describe("hook protocol constants", () => {
  it("pins protocol version to 1", () => {
    expect(ORBIT_HOOK_PROTOCOL_VERSION).toBe(1);
  });

  it("exposes stable env var names", () => {
    expect(ORBIT_HOOK_PORT_ENV).toBe("ORBIT_AGENT_HOOK_PORT");
    expect(ORBIT_HOOK_TOKEN_ENV).toBe("ORBIT_AGENT_HOOK_TOKEN");
    expect(ORBIT_HOOK_VERSION_ENV).toBe("ORBIT_HOOK_PROTOCOL_VERSION");
    expect(ORBIT_RUN_ID_ENV).toBe("ORBIT_RUN_ID");
  });
});
