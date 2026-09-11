import { describe, expect, it } from "vitest";
import { capabilityForRuntime } from "@/modules/ai/domain/capability";

describe("capabilityForRuntime", () => {
  it("mapeia os runtimes que usam IA", () => {
    expect(capabilityForRuntime("email.digest")).toBe("email.summary");
    expect(capabilityForRuntime("assistant.generic")).toBe("assistant.generic");
    expect(capabilityForRuntime("assistant.writing")).toBe("assistant.writing");
    // v47: o report.monthly passou a compor a narrativa mensal por IA.
    expect(capabilityForRuntime("report.monthly")).toBe("report.compose");
  });

  it("devolve null para runtimes desconhecidos", () => {
    expect(capabilityForRuntime("qualquer.coisa")).toBeNull();
  });
});
