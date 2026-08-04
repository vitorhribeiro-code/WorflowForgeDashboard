import { describe, expect, it } from "vitest";
import { capabilityForRuntime } from "@/modules/ai/domain/capability";

describe("capabilityForRuntime", () => {
  it("mapeia os runtimes que usam IA", () => {
    expect(capabilityForRuntime("email.digest")).toBe("email.summary");
    expect(capabilityForRuntime("assistant.generic")).toBe("assistant.generic");
  });

  it("devolve null para runtimes sem IA ou desconhecidos", () => {
    expect(capabilityForRuntime("report.monthly")).toBeNull();
    expect(capabilityForRuntime("qualquer.coisa")).toBeNull();
  });
});
